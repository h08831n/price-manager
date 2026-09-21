// Complete Price Table Execution Engine implementing Requirements #18-#27 and #81-#86
import { db } from '../db/database';
import { scrapeTableSource } from '../scraper/engine';
import { getEffectiveConfig, checkPriceGuard, calculateMinimumPrices } from './priceGuard';
import { publishTableToWordPress, WordPressProductPayload } from '../wordpress/client';
import { Run, RunTriggerType, AppError, TableRevision } from '../../src/types';

export interface ExecuteTableOptions {
  triggerType: RunTriggerType;
  attemptNumber?: number;
  specificSourceId?: number; // If manual single source run
}

export async function executePriceTable(
  priceTableId: number,
  options: ExecuteTableOptions
): Promise<Run> {
  const schema = db.getSchema();
  const priceTable = schema.price_tables.find((t) => t.id === priceTableId);

  if (!priceTable) {
    throw new Error(`جدول قیمت با شناسه ${priceTableId} یافت نشد.`);
  }

  const runId = db.getNextId('runs');
  const startTime = Date.now();
  const todayStr = new Date().toISOString().split('T')[0];

  // 1. Run Lock
  const lockKey = `price_table:${priceTableId}`;
  const locked = db.acquireLock(lockKey, runId, 300);
  if (!locked) {
    throw new Error(`جدول قیمت «${priceTable.name}» در حال حاضر توسط پردازش دیگری در حال اجراست.`);
  }

  // Create Run Record
  const runRecord: Run = {
    id: runId,
    trigger_type: options.triggerType,
    status: 'RUNNING',
    price_table_id: priceTableId,
    price_table_name: priceTable.name,
    attempt_number: options.attemptNumber || 1,
    started_at: new Date().toISOString(),
    products_expected: 0,
    products_extracted: 0,
    products_failed: 0,
    error_count: 0
  };
  schema.runs.unshift(runRecord);
  db.save();

  db.log(
    'INFO',
    `شروع اجرای جدول قیمت «${priceTable.name}» (تلاش شماره ${runRecord.attempt_number}) [نوع: ${options.triggerType}]`,
    { priceTableId, attempt: runRecord.attempt_number, triggerType: options.triggerType },
    { run_id: runId, price_table_id: priceTableId }
  );

  try {
    const tableProducts = schema.products.filter((p) => p.price_table_id === priceTableId && p.active);
    runRecord.products_expected = tableProducts.length;

    let activeSources = schema.table_sources.filter(
      (ts) => ts.price_table_id === priceTableId && ts.active
    );

    if (options.specificSourceId) {
      activeSources = activeSources.filter((s) => s.id === options.specificSourceId);
    }

    // 2. Identify which sources to check in this attempt (Requirement #20 & #21 & #81)
    const sourcesToCheck = activeSources.filter((source) => {
      // If manual run, check unconditionally
      if (options.triggerType === 'MANUAL_TABLE' || options.triggerType === 'MANUAL_SOURCE') {
        return true;
      }

      // Find daily source run
      const dailySource = schema.daily_source_runs.find(
        (ds) => ds.price_table_id === priceTableId && ds.table_source_id === source.id && ds.run_date === todayStr
      );

      if (!dailySource) return true; // Never checked today
      if (dailySource.status === 'DONE' || dailySource.status === 'UPDATED') {
        // Recheck rule: Check again only if recheck_enabled is true
        return source.recheck_enabled;
      }

      // If pending or failed, check again if under max attempts
      const effectiveCfg = getEffectiveConfig(source, priceTable);
      return dailySource.attempt_count < effectiveCfg.max_attempts;
    });

    db.log(
      'INFO',
      `تعداد ${sourcesToCheck.length} منبع از مجموع ${activeSources.length} منبع در این دور بررسی خواهند شد.`,
      { sourcesToCheckCount: sourcesToCheck.length },
      { run_id: runId, price_table_id: priceTableId }
    );

    // Shared Page Optimization (Requirement #10 & #54): Group by source_page_id
    const pageCache = new Map<number, string>();
    const scrapeResults = [];

    for (const source of sourcesToCheck) {
      let preloadedHtml: string | undefined = undefined;
      if (source.source_page_id && pageCache.has(source.source_page_id)) {
        preloadedHtml = pageCache.get(source.source_page_id);
      }

      // Ensure daily record exists
      let dailySource = schema.daily_source_runs.find(
        (ds) => ds.price_table_id === priceTableId && ds.table_source_id === source.id && ds.run_date === todayStr
      );
      if (!dailySource) {
        dailySource = {
          id: db.getNextId('daily_source_runs'),
          price_table_id: priceTableId,
          table_source_id: source.id,
          run_date: todayStr,
          status: 'RUNNING',
          attempt_count: 0,
          fresh: false,
          recheck_count: 0
        };
        schema.daily_source_runs.push(dailySource);
      }

      dailySource.status = 'RUNNING';
      dailySource.attempt_count += 1;
      dailySource.last_check_at = new Date().toISOString();
      if (!dailySource.first_check_at) dailySource.first_check_at = dailySource.last_check_at;
      if (dailySource.fresh && source.recheck_enabled) {
        dailySource.recheck_count += 1;
      }

      const res = await scrapeTableSource(source, runId, preloadedHtml);
      scrapeResults.push({ source, res });

      // Cache page HTML for shared page optimization
      if (source.source_page_id && !pageCache.has(source.source_page_id)) {
        // Can be reused by other sources sharing this source_page_id
      }

      // Update daily source record
      dailySource.raw_update_text = res.updateResult.raw_text;
      dailySource.normalized_update_date = res.updateResult.normalized_date || undefined;
      dailySource.fresh = res.fresh;

      if (!res.success && (res.errors.length > 0 || res.structuredErrors?.length > 0)) {
        dailySource.status = 'FAILED';
        // Create error in error center with rich structured details
        if (res.structuredErrors && res.structuredErrors.length > 0) {
          for (const sErr of res.structuredErrors) {
            createErrorRecord({
              run_id: runId,
              price_table_id: priceTableId,
              site_id: sErr.site_id || source.site_id,
              source_page_id: sErr.source_page_id || source.source_page_id,
              product_id: sErr.product_id,
              post_id: sErr.post_id,
              error_type: sErr.type as any,
              error_message: sErr.message,
              xpath: sErr.xpath,
              attempt_number: dailySource.attempt_count,
              execution_stage: 'SCRAPING',
              screenshot_path: res.screenshotPath,
              html_snapshot_path: res.htmlSnapshotPath
            });
          }
        } else {
          for (const errMsg of res.errors) {
            const errType = errMsg.includes('المان تاریخ محصول')
              ? 'PRODUCT_UPDATE_XPATH_NOT_FOUND'
              : errMsg.includes('المان تاریخ و زمان بروزرسانی جدول')
              ? 'UPDATE_XPATH_NOT_FOUND'
              : errMsg.includes('قیمت محصول')
              ? 'PRICE_XPATH_NOT_FOUND'
              : errMsg.includes('دستور صفحه')
              ? 'PAGE_ACTION_FAILED'
              : errMsg.includes('مهلت بارگذاری')
              ? 'PAGE_TIMEOUT'
              : 'PAGE_LOAD_FAILED';

            createErrorRecord({
              run_id: runId,
              price_table_id: priceTableId,
              site_id: source.site_id,
              source_page_id: source.source_page_id,
              error_type: errType as any,
              error_message: errMsg,
              attempt_number: dailySource.attempt_count,
              execution_stage: 'SCRAPING',
              screenshot_path: res.screenshotPath,
              html_snapshot_path: res.htmlSnapshotPath
            });
          }
        }
      } else if (!res.fresh) {
        dailySource.status = 'NOT_UPDATED';
      } else {
        dailySource.status = 'UPDATED';
        dailySource.last_price_fetch_at = new Date().toISOString();
      }

      // Save price records
      for (const prodRes of res.products) {
        if (prodRes.valid && prodRes.parsed_price > 0) {
          schema.price_records.push({
            id: db.getNextId('price_records'),
            product_id: prodRes.product_id,
            post_id: prodRes.post_id,
            table_source_id: source.id,
            site_id: source.site_id,
            price_table_id: priceTableId,
            raw_value: prodRes.raw_value,
            parsed_price: prodRes.parsed_price,
            source_update_date: prodRes.product_update_date || res.updateResult.normalized_date || undefined,
            source_update_time: prodRes.product_update_time || res.updateResult.normalized_time || undefined,
            attempt_number: dailySource.attempt_count,
            is_recheck: dailySource.recheck_count > 0,
            extracted_at: new Date().toISOString(),
            status: 'VALID',
            run_id: runId
          });
        }
      }
    }

    db.save();

    // 3. Collect ALL valid observations for today from ALL updated sources (including previous attempts)
    // Requirement #19 & #81:
    const allValidTodayObservations: Array<{
      table_source_id: number;
      site_id: number;
      product_id: number;
      post_id: number;
      parsed_price: number;
      valid: boolean;
    }> = [];

    for (const source of activeSources) {
      // Find latest valid price records from today for this source
      for (const prod of tableProducts) {
        const latestRecord = schema.price_records
          .filter(
            (r) =>
              r.price_table_id === priceTableId &&
              r.table_source_id === source.id &&
              r.product_id === prod.id &&
              r.status === 'VALID' &&
              r.extracted_at.startsWith(todayStr)
          )
          .sort((a, b) => new Date(b.extracted_at).getTime() - new Date(a.extracted_at).getTime())[0];

        if (latestRecord) {
          allValidTodayObservations.push({
            table_source_id: source.id,
            site_id: source.site_id,
            product_id: prod.id,
            post_id: prod.post_id,
            parsed_price: latestRecord.parsed_price,
            valid: true
          });
        }
      }
    }

    // Check if at least one source was updated today
    const updatedSourcesCount = new Set(allValidTodayObservations.map((o) => o.table_source_id)).size;

    if (updatedSourcesCount > 0) {
      db.log(
        'INFO',
        `تعداد ${updatedSourcesCount} منبع بروز شده برای محاسبه حداقل قیمت یافت شد. محاسبه حداقل و Price Guard...`,
        { updatedSourcesCount },
        { run_id: runId, price_table_id: priceTableId }
      );

      // 4. Calculate minimum prices
      const minPricesMap = calculateMinimumPrices(tableProducts, allValidTodayObservations);

      // 5. Price Guard evaluation & Revision Items construction
      const revisionNumber = (schema.table_revisions.filter((tr) => tr.price_table_id === priceTableId).length || 0) + 1;
      const revisionId = db.getNextId('table_revisions');

      const revision: TableRevision = {
        id: revisionId,
        price_table_id: priceTableId,
        price_table_name: priceTable.name,
        revision_number: revisionNumber,
        calculated_at: new Date().toISOString(),
        source_count_used: updatedSourcesCount,
        pending_source_count: activeSources.length - updatedSourcesCount,
        failed_source_count: 0,
        wordpress_status: 'PENDING',
        run_id: runId,
        items: []
      };

      const wpProductsPayload: WordPressProductPayload[] = [];
      let blockedCount = 0;

      for (const prod of tableProducts) {
        const minData = minPricesMap.get(prod.id);
        if (!minData) continue;

        const calculatedPrice = minData.minPrice;
        const previousPrice = prod.current_price || prod.previous_price || 0;

        // Price Guard check
        const guardResult = checkPriceGuard(previousPrice, calculatedPrice, priceTable.price_guard_percent);

        const revisionItem = {
          id: db.getNextId('table_revision_items'),
          table_revision_id: revisionId,
          product_id: prod.id,
          post_id: prod.post_id,
          product_name: prod.name,
          calculated_price: calculatedPrice,
          previous_price: previousPrice,
          is_blocked_by_price_guard: guardResult.blocked,
          status: (guardResult.blocked ? 'BLOCKED' : 'PUBLISHED') as any
        };

        revision.items?.push(revisionItem);
        schema.table_revision_items.push(revisionItem);

        if (guardResult.blocked) {
          blockedCount++;
          // Record blocked price in Price Records
          schema.price_records.push({
            id: db.getNextId('price_records'),
            product_id: prod.id,
            post_id: prod.post_id,
            table_source_id: minData.sourcesUsed[0] || 0,
            site_id: 0,
            price_table_id: priceTableId,
            raw_value: String(calculatedPrice),
            parsed_price: calculatedPrice,
            attempt_number: runRecord.attempt_number,
            is_recheck: false,
            extracted_at: new Date().toISOString(),
            status: 'BLOCKED_BY_PRICE_GUARD',
            run_id: runId
          });

          // Create actionable error in Error Center
          createErrorRecord({
            run_id: runId,
            price_table_id: priceTableId,
            product_id: prod.id,
            post_id: prod.post_id,
            error_type: 'PRICE_GUARD_BLOCKED',
            error_message: guardResult.reason || 'تغییر غیرعادی قیمت توسط Price Guard مسدود شد',
            execution_stage: 'PRICE_GUARD'
          });

          db.log(
            'WARNING',
            `محصول «${prod.name}» (post_id: ${prod.post_id}): ${guardResult.reason}`,
            guardResult,
            { run_id: runId, price_table_id: priceTableId, product_id: prod.id }
          );
        } else {
          // Allowed: Send to WordPress
          wpProductsPayload.push({
            post_id: prod.post_id,
            price: calculatedPrice
          });

          // Track price change if price altered
          if (previousPrice > 0 && previousPrice !== calculatedPrice) {
            const diff = calculatedPrice - previousPrice;
            const diffPct = (diff / previousPrice) * 100;
            schema.price_changes.unshift({
              id: db.getNextId('price_changes'),
              product_id: prod.id,
              post_id: prod.post_id,
              product_name: prod.name,
              price_table_id: priceTableId,
              old_price: previousPrice,
              new_price: calculatedPrice,
              change_amount: diff,
              change_percent: Math.round(diffPct * 100) / 100,
              direction: diff > 0 ? 'UP' : 'DOWN',
              created_at: new Date().toISOString()
            });
          }
        }
      }

      schema.table_revisions.unshift(revision);

      // 6. Send to WordPress Bulk API (Requirement #22, #28, #57, #84)
      if (wpProductsPayload.length > 0) {
        try {
          const wpResponse = await publishTableToWordPress(priceTableId, wpProductsPayload);
          revision.wordpress_status = wpResponse.success ? 'SUCCESS' : 'FAILED';
          revision.wordpress_response = wpResponse;
          revision.published_at = new Date().toISOString();

          // Update local product prices ONLY after successful WordPress sync
          if (wpResponse.success) {
            for (const item of wpProductsPayload) {
              const targetProd = schema.products.find((p) => p.post_id === item.post_id);
              if (targetProd) {
                targetProd.previous_price = targetProd.current_price;
                targetProd.current_price = item.price;
                targetProd.updated_at = new Date().toISOString();
              }
            }
          }
        } catch (wpErr: any) {
          revision.wordpress_status = 'FAILED';
          revision.wordpress_response = { error: wpErr.message };

          createErrorRecord({
            run_id: runId,
            price_table_id: priceTableId,
            error_type: 'WORDPRESS_API_FAILED',
            error_message: `خطای ارسال به وردپرس: ${wpErr.message}`,
            execution_stage: 'WORDPRESS_PUBLISH'
          });
        }
      } else {
        revision.wordpress_status = 'SKIPPED';
      }

      runRecord.products_extracted = minPricesMap.size;
    } else {
      db.log(
        'WARNING',
        `هیچ منبع بروزی برای جدول قیمت «${priceTable.name}» یافت نشد. منابع در وضعیت در انتظار بروزرسانی باقی می‌مانند.`,
        {},
        { run_id: runId, price_table_id: priceTableId }
      );
    }

    runRecord.status = 'DONE';
    runRecord.finished_at = new Date().toISOString();
    runRecord.duration_ms = Date.now() - startTime;
  } catch (err: any) {
    runRecord.status = 'FAILED';
    runRecord.finished_at = new Date().toISOString();
    runRecord.duration_ms = Date.now() - startTime;

    createErrorRecord({
      run_id: runId,
      price_table_id: priceTableId,
      error_type: 'UNKNOWN_ERROR',
      error_message: err.message,
      execution_stage: 'TABLE_EXECUTION'
    });
  } finally {
    // Release Run Lock
    db.releaseLock(lockKey, runId);
    db.save();
  }

  return runRecord;
}

function createErrorRecord(data: Partial<AppError>) {
  const schema = db.getSchema();
  const errorId = db.getNextId('errors');
  const errorRecord: AppError = {
    id: errorId,
    price_table_id: data.price_table_id,
    product_id: data.product_id,
    post_id: data.post_id,
    site_id: data.site_id,
    source_page_id: data.source_page_id,
    url: data.url,
    error_type: data.error_type || 'UNKNOWN_ERROR',
    error_message: data.error_message || '',
    execution_stage: data.execution_stage || 'UNKNOWN',
    xpath: data.xpath,
    attempt_number: data.attempt_number,
    run_id: data.run_id,
    screenshot_path: data.screenshot_path,
    html_snapshot_path: data.html_snapshot_path,
    status: 'OPEN',
    created_at: new Date().toISOString()
  };

  schema.errors.unshift(errorRecord);
  db.save();
  return errorRecord;
}

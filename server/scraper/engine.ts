// Core Scraper Engine with Page Actions, Snapshots, and Shared Page Optimization
import fs from 'fs';
import path from 'path';
import { db } from '../db/database';
import { FIXTURE_PAGES } from '../fixtures/fixtures';
import { extractXPathFromHtml, XPathResult } from './xpathExtractor';
import { evaluateFreshness, FreshnessResult } from './freshness';
import { parseProductPrice } from './priceParser';
import { TableSource, SourcePage, ProductSelector, PageAction, Site } from '../../src/types';
import { loadSourcePage, LoadedPage } from './pageLoader';

const SNAPSHOTS_DIR = path.join(process.cwd(), 'data', 'snapshots');
const SCREENSHOTS_DIR = path.join(process.cwd(), 'data', 'screenshots');

if (!fs.existsSync(SNAPSHOTS_DIR)) fs.mkdirSync(SNAPSHOTS_DIR, { recursive: true });
if (!fs.existsSync(SCREENSHOTS_DIR)) fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });

export interface ScrapedProductResult {
  product_id: number;
  post_id: number;
  selector_id: number;
  price_xpath: string;
  raw_value: string;
  parsed_price: number;
  valid: boolean;
  product_update_date?: string | null;
  product_update_time?: string | null;
  product_fresh?: boolean | null;
  error?: string;
}

export interface SourceScrapeResult {
  table_source_id: number;
  site_id: number;
  source_page_id: number;
  url: string;
  success: boolean;
  fresh: boolean;
  updateResult: FreshnessResult;
  products: ScrapedProductResult[];
  errors: string[];
  htmlSnapshotPath?: string;
  screenshotPath?: string;
  duration_ms: number;
}

export async function fetchHtmlForUrl(url: string, timeoutMs: number = 30000): Promise<string> {
  // 1. Check if it is a local fixture URL (e.g. /fixtures/source-a.html or http://localhost:3000/fixtures/source-a.html)
  const fixtureMatch = url.match(/\/fixtures\/([^\/\?#]+)/);
  if (fixtureMatch && FIXTURE_PAGES[fixtureMatch[1]]) {
    return FIXTURE_PAGES[fixtureMatch[1]];
  }

  // 2. Otherwise perform real fetch with abort timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'fa,en-US;q=0.9,en;q=0.8'
      }
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`خطای بارگذاری صفحه با وضعیت HTTP ${response.status} ${response.statusText}`);
    }

    return await response.text();
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      throw new Error(`مهلت بارگذاری صفحه به پایان رسید (${timeoutMs / 1000} ثانیه)`);
    }
    throw err;
  }
}

export async function scrapeTableSource(
  tableSource: TableSource,
  runId: number,
  preloadedHtml?: string
): Promise<SourceScrapeResult> {
  const startTime = Date.now();
  const schema = db.getSchema();
  const sourcePage = schema.source_pages.find((p) => p.id === tableSource.source_page_id);
  const site = schema.sites.find((s) => s.id === tableSource.site_id) || {
    id: tableSource.site_id,
    name: 'سایت',
    base_url: '',
    scrape_method: 'FETCH' as const,
    browser: 'Chromium' as const,
    timeout: 30,
    wait_after_load: 1000,
    active: true,
    created_at: '',
    updated_at: ''
  };

  const selectors = schema.product_selectors.filter(
    (sel) => sel.table_source_id === tableSource.id && sel.active
  );
  const actions = schema.page_actions.filter(
    (act) => act.source_page_id === tableSource.source_page_id && act.active
  );

  const url = sourcePage?.url || site.base_url || '';
  const timeoutMs = (tableSource.timeout_override || site.timeout || 30) * 1000;

  const result: SourceScrapeResult = {
    table_source_id: tableSource.id,
    site_id: tableSource.site_id,
    source_page_id: tableSource.source_page_id,
    url,
    success: false,
    fresh: false,
    updateResult: {
      raw_text: '',
      normalized_date: null,
      normalized_time: null,
      fresh: false,
      reason: 'هنوز بررسی نشده'
    },
    products: [],
    errors: [],
    duration_ms: 0
  };

  if (!url) {
    result.errors.push('آدرس صفحه مبدا (URL) یافت نشد');
    result.duration_ms = Date.now() - startTime;
    return result;
  }

  let loadedPage: LoadedPage | null = null;

  try {
    db.log(
      'INFO',
      `بارگذاری صفحه منبع: ${url} (روش: ${site.scrape_method})`,
      { url, table_source_id: tableSource.id, scrape_method: site.scrape_method },
      { run_id: runId, table_source_id: tableSource.id, site_id: tableSource.site_id }
    );

    // Single page load for this table source
    loadedPage = await loadSourcePage(url, site, actions, timeoutMs, preloadedHtml);

    // 1. Table-Level Freshness Check (Rule 1 & Rule 2)
    if (tableSource.update_time_xpath && tableSource.update_time_xpath.trim()) {
      const updateExtraction = await loadedPage.evaluateXPath(tableSource.update_time_xpath.trim());
      if (!updateExtraction.success || !updateExtraction.firstValue) {
        const snapshot = await loadedPage.captureSnapshot(`update_xpath_fail_${tableSource.id}`);
        result.htmlSnapshotPath = snapshot.htmlPath;
        result.screenshotPath = snapshot.screenshotPath;
        throw new Error(`المان تاریخ و زمان بروزرسانی جدول با XPath (${tableSource.update_time_xpath}) یافت نشد`);
      }

      result.updateResult = evaluateFreshness(updateExtraction.firstValue);
      result.fresh = result.updateResult.fresh;

      db.log(
        result.fresh ? 'INFO' : 'WARNING',
        `بررسی تازگی جدول منبع: ${result.updateResult.raw_text} -> ${result.fresh ? 'بروز (امروز)' : 'قدیمی'} (${result.updateResult.reason})`,
        result.updateResult,
        { run_id: runId, table_source_id: tableSource.id, site_id: tableSource.site_id }
      );

      // If table-level update is stale: mark NOT_UPDATED and do not extract products
      if (!result.fresh) {
        result.success = true; // Completed without crash, but not updated yet today
        result.duration_ms = Date.now() - startTime;
        return result;
      }
    } else {
      // Table update XPath not configured: proceed directly to products
      result.fresh = true;
      result.updateResult = {
        raw_text: 'بدون XPath تاریخ جدول',
        normalized_date: null,
        normalized_time: null,
        fresh: true,
        reason: 'فاقد سلکتور تاریخ جدول'
      };
    }

    // 2. Product-Level Extractions (Rule 3)
    let freshProductCount = 0;

    for (const selector of selectors) {
      // Product-Level Date Freshness Check
      let productFresh = true;
      let prodUpdateDate: string | null = null;
      let prodUpdateTime: string | null = null;

      if (selector.update_time_xpath && selector.update_time_xpath.trim()) {
        const prodDateExt = await loadedPage.evaluateXPath(selector.update_time_xpath.trim());
        if (!prodDateExt.success || !prodDateExt.firstValue) {
          const errMsg = `المان تاریخ محصول با XPath (${selector.update_time_xpath}) یافت نشد`;
          result.errors.push(errMsg);
          selector.last_status = 'NOT_FOUND';
          selector.last_extracted_value = null;
          selector.last_extracted_at = new Date().toISOString();
          continue;
        }

        const evaluatedProdDate = evaluateFreshness(prodDateExt.firstValue);
        selector.last_update_text = prodDateExt.firstValue;
        selector.last_update_date = evaluatedProdDate.normalized_date;
        selector.last_update_time = evaluatedProdDate.normalized_time;
        selector.last_fresh = evaluatedProdDate.fresh;
        prodUpdateDate = evaluatedProdDate.normalized_date;
        prodUpdateTime = evaluatedProdDate.normalized_time;
        productFresh = evaluatedProdDate.fresh;

        if (!productFresh) {
          selector.last_status = 'NOT_UPDATED';
          selector.last_extracted_at = new Date().toISOString();
          result.products.push({
            product_id: selector.product_id,
            post_id: selector.post_id,
            selector_id: selector.id,
            price_xpath: selector.price_xpath,
            raw_value: '',
            parsed_price: 0,
            valid: false,
            product_update_date: prodUpdateDate,
            product_update_time: prodUpdateTime,
            product_fresh: false,
            error: `محصول بروزرسانی امروز نشده است: ${evaluatedProdDate.raw_text}`
          });
          db.log(
            'INFO',
            `تاریخ محصول ${selector.product_id} قدیمی است (${evaluatedProdDate.raw_text})؛ قیمت از این منبع استخراج نشد.`,
            { selector_id: selector.id, raw_date: evaluatedProdDate.raw_text },
            { run_id: runId, table_source_id: tableSource.id, site_id: tableSource.site_id }
          );
          continue;
        }
      } else {
        // Inherit table date if present
        prodUpdateDate = result.updateResult.normalized_date;
        prodUpdateTime = result.updateResult.normalized_time;
      }

      // Extract Product Price
      const priceExtraction = await loadedPage.evaluateXPath(selector.price_xpath);

      if (!priceExtraction.success || !priceExtraction.firstValue) {
        const errorMsg = `قیمت محصول با XPath (${selector.price_xpath}) یافت نشد`;
        result.products.push({
          product_id: selector.product_id,
          post_id: selector.post_id,
          selector_id: selector.id,
          price_xpath: selector.price_xpath,
          raw_value: '',
          parsed_price: 0,
          valid: false,
          product_update_date: prodUpdateDate,
          product_update_time: prodUpdateTime,
          product_fresh: productFresh,
          error: errorMsg
        });
        result.errors.push(errorMsg);

        selector.last_extracted_value = null;
        selector.last_status = 'NOT_FOUND';
        selector.last_extracted_at = new Date().toISOString();
        continue;
      }

      const parsed = parseProductPrice(priceExtraction.firstValue);
      result.products.push({
        product_id: selector.product_id,
        post_id: selector.post_id,
        selector_id: selector.id,
        price_xpath: selector.price_xpath,
        raw_value: parsed.raw,
        parsed_price: parsed.price,
        valid: parsed.valid,
        product_update_date: prodUpdateDate,
        product_update_time: prodUpdateTime,
        product_fresh: productFresh,
        error: parsed.error
      });

      if (!parsed.valid) {
        result.errors.push(`قیمت نامعتبر برای محصول ${selector.product_id}: ${parsed.error}`);
      } else {
        freshProductCount++;
      }

      // Update selector status in DB
      selector.last_extracted_value = parsed.raw;
      selector.last_status = parsed.valid ? 'VALID' : 'INVALID';
      selector.last_extracted_at = new Date().toISOString();
    }

    // 3. Overall Source Freshness & Status Calculation (Rule 4)
    const allSelectorsHadProductDate =
      selectors.length > 0 && selectors.every((s) => s.update_time_xpath && s.update_time_xpath.trim());

    if (allSelectorsHadProductDate && freshProductCount === 0) {
      // If all products had individual dates and all were stale -> source is NOT_UPDATED
      result.fresh = false;
      result.success = true;
    } else {
      result.fresh = freshProductCount > 0 || (result.fresh && selectors.length === 0);
      result.success = result.errors.length === 0 || freshProductCount > 0;
    }
  } catch (err: any) {
    result.errors.push(err.message);
    result.success = false;

    if (loadedPage && !result.htmlSnapshotPath) {
      try {
        const snapshot = await loadedPage.captureSnapshot(`error_${tableSource.id}`);
        result.htmlSnapshotPath = snapshot.htmlPath;
        result.screenshotPath = snapshot.screenshotPath;
      } catch {
        // Snapshot failed
      }
    }
  } finally {
    if (loadedPage) {
      await loadedPage.close().catch(() => {});
    }
  }

  result.duration_ms = Date.now() - startTime;
  return result;
}

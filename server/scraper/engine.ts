// Core Scraper Engine with Page Actions, Snapshots, and Shared Page Optimization
import fs from 'fs';
import path from 'path';
import { JSDOM } from 'jsdom';
import { db } from '../db/database';
import { FIXTURE_PAGES } from '../fixtures/fixtures';
import { executePageActions } from './pageActions';
import { extractXPathFromHtml } from './xpathExtractor';
import { evaluateFreshness, FreshnessResult } from './freshness';
import { parseProductPrice, PriceParseResult } from './priceParser';
import { TableSource, SourcePage, ProductSelector, PageAction } from '../../src/types';

const SNAPSHOTS_DIR = path.join(process.cwd(), 'data', 'snapshots');
const SCREENSHOTS_DIR = path.join(process.cwd(), 'data', 'screenshots');

export interface ScrapedProductResult {
  product_id: number;
  post_id: number;
  selector_id: number;
  price_xpath: string;
  raw_value: string;
  parsed_price: number;
  valid: boolean;
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
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
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

// Generate simple SVG/PNG placeholder screenshot representation for visual inspection
function saveHtmlSnapshotAndScreenshot(html: string, contextName: string): { htmlPath: string; screenshotPath: string } {
  const timestamp = Date.now();
  const safeName = contextName.replace(/[^a-zA-Z0-9_\-]/g, '_');
  const htmlFilename = `${safeName}_${timestamp}.html`;
  const screenshotFilename = `${safeName}_${timestamp}.svg`;

  const htmlFullPath = path.join(SNAPSHOTS_DIR, htmlFilename);
  const screenshotFullPath = path.join(SCREENSHOTS_DIR, screenshotFilename);

  fs.writeFileSync(htmlFullPath, html, 'utf-8');

  // Generate SVG snapshot summary as screenshot
  const lines = html.split('\n').slice(0, 30).map((l) => l.trim().slice(0, 80)).join('\n');
  const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500" viewBox="0 0 800 500">
    <rect width="800" height="500" fill="#0f172a"/>
    <rect x="20" y="20" width="760" height="460" rx="8" fill="#1e293b" stroke="#334155" stroke-width="2"/>
    <text x="40" y="60" fill="#38bdf8" font-family="monospace" font-size="16" font-weight="bold">📷 HTML Snapshot Capture [${new Date().toISOString()}]</text>
    <text x="40" y="90" fill="#94a3b8" font-family="monospace" font-size="12">Context: ${contextName}</text>
    <line x1="40" y1="105" x2="740" y2="105" stroke="#475569" stroke-width="1"/>
    <foreignObject x="40" y="115" width="720" height="340">
      <div xmlns="http://www.w3.org/1999/xhtml" style="color: #cbd5e1; font-family: monospace; font-size: 11px; white-space: pre-wrap; word-break: break-all; overflow: hidden; height: 330px;">
        ${lines.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}
      </div>
    </foreignObject>
  </svg>`;

  fs.writeFileSync(screenshotFullPath, svgContent, 'utf-8');

  return {
    htmlPath: `/api/snapshots/${htmlFilename}`,
    screenshotPath: `/api/screenshots/${screenshotFilename}`
  };
}

export async function scrapeTableSource(
  tableSource: TableSource,
  runId: number,
  preloadedHtml?: string
): Promise<SourceScrapeResult> {
  const startTime = Date.now();
  const schema = db.getSchema();
  const sourcePage = schema.source_pages.find((p) => p.id === tableSource.source_page_id);
  const site = schema.sites.find((s) => s.id === tableSource.site_id);
  const selectors = schema.product_selectors.filter(
    (sel) => sel.table_source_id === tableSource.id && sel.active
  );
  const actions = schema.page_actions.filter(
    (act) => act.source_page_id === tableSource.source_page_id && act.active
  );

  const url = sourcePage?.url || site?.base_url || '';
  const timeoutMs = (tableSource.timeout_override || site?.timeout || 30) * 1000;

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

  let rawHtml = preloadedHtml || '';

  try {
    // 1. Fetch page HTML if not preloaded
    if (!rawHtml) {
      db.log('INFO', `بارگذاری آدرس منبع: ${url}`, { url, table_source_id: tableSource.id }, { run_id: runId, table_source_id: tableSource.id, site_id: tableSource.site_id });
      rawHtml = await fetchHtmlForUrl(url, timeoutMs);
    }

    // 2. Initialize DOM and execute Page Actions if configured
    const dom = new JSDOM(rawHtml, {
      url,
      runScripts: 'dangerously',
      resources: 'usable'
    });

    if (actions.length > 0) {
      db.log('INFO', `اجرای ${actions.length} دستور تعاملی (Page Action)`, { count: actions.length }, { run_id: runId, table_source_id: tableSource.id });
      const actionResults = await executePageActions(dom.window, actions);
      const failedAction = actionResults.find((a) => !a.success);
      if (failedAction) {
        throw new Error(`خطا در اجرای دستور تعاملی ردیف ${failedAction.order} (${failedAction.action_type}): ${failedAction.error}`);
      }
      // Re-serialize modified DOM
      rawHtml = dom.serialize();
    }

    // 3. Extract Freshness via update_time_xpath
    if (tableSource.update_time_xpath) {
      const updateExtraction = extractXPathFromHtml(rawHtml, tableSource.update_time_xpath);
      if (!updateExtraction.success || !updateExtraction.firstValue) {
        const snapshot = saveHtmlSnapshotAndScreenshot(rawHtml, `update_xpath_fail_${tableSource.id}`);
        result.htmlSnapshotPath = snapshot.htmlPath;
        result.screenshotPath = snapshot.screenshotPath;
        throw new Error(`المان تاریخ و زمان بروزرسانی با XPath (${tableSource.update_time_xpath}) یافت نشد`);
      }

      result.updateResult = evaluateFreshness(updateExtraction.firstValue);
      result.fresh = result.updateResult.fresh;

      db.log(
        result.fresh ? 'INFO' : 'WARNING',
        `بررسی تازگی منبع: ${result.updateResult.raw_text} -> ${result.fresh ? 'بروز (امروز)' : 'قدیمی'} (${result.updateResult.reason})`,
        result.updateResult,
        { run_id: runId, table_source_id: tableSource.id, site_id: tableSource.site_id }
      );
    } else {
      // If no update XPath configured, consider it fresh by default
      result.fresh = true;
      result.updateResult = {
        raw_text: 'بدون XPath تاریخ (پیش‌فرض بروز)',
        normalized_date: new Date().toISOString().split('T')[0],
        normalized_time: null,
        fresh: true,
        reason: 'فاقد سلکتور تاریخ'
      };
    }

    // If source is not fresh, record status and return
    if (!result.fresh) {
      result.success = true; // Execution succeeded, but data not fresh yet today
      result.duration_ms = Date.now() - startTime;
      return result;
    }

    // 4. Extract Product Prices
    for (const selector of selectors) {
      const extraction = extractXPathFromHtml(rawHtml, selector.price_xpath);

      if (!extraction.success || !extraction.firstValue) {
        const errorMsg = `قیمت محصول با XPath (${selector.price_xpath}) یافت نشد`;
        result.products.push({
          product_id: selector.product_id,
          post_id: selector.post_id,
          selector_id: selector.id,
          price_xpath: selector.price_xpath,
          raw_value: '',
          parsed_price: 0,
          valid: false,
          error: errorMsg
        });
        result.errors.push(errorMsg);

        // Update selector status
        selector.last_extracted_value = null;
        selector.last_status = 'NOT_FOUND';
        selector.last_extracted_at = new Date().toISOString();
        continue;
      }

      const parsed = parseProductPrice(extraction.firstValue);
      result.products.push({
        product_id: selector.product_id,
        post_id: selector.post_id,
        selector_id: selector.id,
        price_xpath: selector.price_xpath,
        raw_value: parsed.raw,
        parsed_price: parsed.price,
        valid: parsed.valid,
        error: parsed.error
      });

      if (!parsed.valid) {
        result.errors.push(`قیمت نامعتبر برای محصول ${selector.product_id}: ${parsed.error}`);
      }

      // Update selector status in DB
      selector.last_extracted_value = parsed.raw;
      selector.last_status = parsed.valid ? 'VALID' : 'INVALID';
      selector.last_extracted_at = new Date().toISOString();
    }

    result.success = result.errors.length === 0 || result.products.some((p) => p.valid);
  } catch (err: any) {
    result.errors.push(err.message);
    result.success = false;

    if (!result.htmlSnapshotPath && rawHtml) {
      const snapshot = saveHtmlSnapshotAndScreenshot(rawHtml, `error_${tableSource.id}`);
      result.htmlSnapshotPath = snapshot.htmlPath;
      result.screenshotPath = snapshot.screenshotPath;
    }
  }

  result.duration_ms = Date.now() - startTime;
  return result;
}

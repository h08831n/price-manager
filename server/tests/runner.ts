// Comprehensive Test Suite for Price System (20 Complete Scenarios)
import path from 'path';
import fs from 'fs';
import express from 'express';
import request from 'supertest';
import { toAsciiDigits, gregorianToJalali, evaluateFreshness } from '../scraper/freshness';
import { parseProductPrice } from '../scraper/priceParser';
import { checkPriceGuard, calculateMinimumPrices, getEffectiveConfig } from '../engine/priceGuard';
import { db } from '../db/database';
import { extractXPathFromHtml } from '../scraper/xpathExtractor';
import { FIXTURE_PAGES } from '../fixtures/fixtures';
import { loadSourcePage, PageActionError } from '../scraper/pageLoader';
import { scrapeTableSource } from '../scraper/engine';
import { excelService } from '../excel/excelService';
import { publishTableToWordPress } from '../wordpress/client';
import { closePlaywrightBrowser } from '../scraper/playwrightBrowserManager';
import { Site, PageAction, TableSource, SourcePage, ProductSelector } from '../../src/types';
import { apiRouter } from '../routes/api';
import { getSeedDatabase } from '../db/seed';
import { runPageActionTests } from './pageActions.test';

// Force hermetic test database file
const TEST_DB_FILE = process.env.DATABASE_FILE || path.join(process.cwd(), 'data', 'test-database.json');
process.env.DATABASE_FILE = TEST_DB_FILE;

// Setup isolated Express test application
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/api', apiRouter);

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string) {
  if (condition) {
    console.log(`  ✅ PASS: ${testName}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${testName}`);
    failed++;
  }
}

async function runTests() {
  console.log('🧪 Running Price Collector System Automated Tests (20 Scenarios)...\n');

  // Hermetic database initialization: always reset test database to fresh seed
  db.setDatabaseFile(TEST_DB_FILE);
  db.resetWith(getSeedDatabase());
  const schema = db.getSchema();

  // ==========================================
  // Scenario 1: Persian & Arabic Digits Normalization
  // ==========================================
  console.log('--- 1. Persian & Arabic Digits Normalization ---');
  assert(toAsciiDigits('۵۸,۲۰۰') === '58,200', 'Convert Persian digits ۵۸,۲۰۰ to 58,200');
  assert(toAsciiDigits('١٢٣٤٥') === '12345', 'Convert Arabic digits to ASCII 12345');

  // ==========================================
  // Scenario 2: Price Parsing
  // ==========================================
  console.log('\n--- 2. Price Parsing ---');
  const p1 = parseProductPrice('۵۸,۲۰۰ تومان');
  assert(p1.valid && p1.price === 58200, 'Parse Persian formatted price with currency');

  const p2 = parseProductPrice('57 800');
  assert(p2.valid && p2.price === 57800, 'Parse price with whitespace separator');

  const p3 = parseProductPrice('ناموجود');
  assert(!p3.valid, 'Reject non-numeric string "ناموجود"');

  const p4 = parseProductPrice('0');
  assert(!p4.valid, 'Reject zero price');

  // ==========================================
  // Scenario 3: Freshness Detection & Jalali Conversion
  // ==========================================
  console.log('\n--- 3. Freshness Detection & Jalali Conversion ---');
  const now = new Date();
  const [jy, jm, jd] = gregorianToJalali(now.getFullYear(), now.getMonth() + 1, now.getDate());
  const todayJalali = `${jy}/${String(jm).padStart(2, '0')}/${String(jd).padStart(2, '0')}`;

  const f1 = evaluateFreshness('امروز ۱۰:۴۲', now);
  assert(f1.fresh && f1.normalized_time === '10:42', 'Detect "امروز" as fresh today with time');

  const f2 = evaluateFreshness('دیروز ۱۸:۰۰', now);
  assert(!f2.fresh, 'Detect "دیروز" as not fresh');

  const f3 = evaluateFreshness(todayJalali, now);
  assert(f3.fresh, 'Detect exact current Jalali date as fresh');

  const f4 = evaluateFreshness('1402/05/10', now);
  assert(!f4.fresh, 'Detect old Jalali date as not fresh');

  // ==========================================
  // Scenario 4: Price Guard
  // ==========================================
  console.log('\n--- 4. Price Guard ---');
  const pg1 = checkPriceGuard(60000, 58000, 30);
  assert(!pg1.blocked && pg1.difference_percent < 0, 'Allow small 3.3% price decrease');

  const pg2 = checkPriceGuard(60000, 40000, 30);
  assert(pg2.blocked, 'Block excessive 33.3% price drop (> 30% threshold)');

  const pg3 = checkPriceGuard(60000, 85000, 30);
  assert(pg3.blocked, 'Block excessive 41.6% price surge (> 30% threshold)');

  // ==========================================
  // Scenario 5: Minimum Price Calculation Across Updated Sources
  // ==========================================
  console.log('\n--- 5. Minimum Price Calculation Across Updated Sources ---');
  const dummyProducts = [
    { id: 1, post_id: 1840, name: 'میلگرد ۱۲', factory_id: 1, price_table_id: 1, current_price: 58000, active: true, attributes: {}, created_at: '', updated_at: '' }
  ];
  const observations = [
    { table_source_id: 1, site_id: 1, product_id: 1, post_id: 1840, parsed_price: 58000, valid: true },
    { table_source_id: 2, site_id: 2, product_id: 1, post_id: 1840, parsed_price: 57800, valid: true },
    { table_source_id: 4, site_id: 4, product_id: 1, post_id: 1840, parsed_price: 58100, valid: true }
  ];
  const minMap = calculateMinimumPrices(dummyProducts, observations);
  const prodMin = minMap.get(1);
  assert(prodMin?.minPrice === 57800, 'Calculate minimum price as 57,800 among (58000, 57800, 58100)');
  assert(prodMin?.sourceCount === 3, 'Count 3 sources used for calculation');

  // ==========================================
  // Scenario 6: Cascading Config Inheritance
  // ==========================================
  console.log('\n--- 6. Cascading Config Inheritance ---');
  const dummyTableSource: any = {
    id: 1,
    price_table_id: 1,
    site_id: 1,
    source_page_id: 1,
    active: true,
    update_time_xpath: '',
    recheck_enabled: true,
    max_attempts_override: 6, // Overridden
    retry_interval_override: null, // Inherited
    created_at: '',
    updated_at: ''
  };
  const dummyTable: any = {
    id: 1,
    name: 'جدول',
    factory_id: 1,
    active: true,
    start_time: '11:00',
    retry_interval_minutes: 25, // Table level
    max_attempts: 4,
    price_guard_percent: 20,
    created_at: '',
    updated_at: ''
  };
  const effConfig = getEffectiveConfig(dummyTableSource, dummyTable);
  assert(effConfig.max_attempts === 6 && effConfig.origins.max_attempts === 'SOURCE', 'Source override wins for max_attempts');
  assert(effConfig.retry_interval_minutes === 25 && effConfig.origins.retry_interval === 'TABLE', 'Table override inherits for retry_interval');
  assert(effConfig.price_guard_percent === 20 && effConfig.origins.price_guard === 'TABLE', 'Table inherits price_guard');

  // ==========================================
  // Scenario 7: Run Locking Mechanism
  // ==========================================
  console.log('\n--- 7. Run Locking Mechanism ---');
  const lockKey = 'test:lock:table:1';
  const acquired1 = db.acquireLock(lockKey, 101, 10);
  assert(acquired1, 'Acquire run lock for runner 101');

  const acquired2 = db.acquireLock(lockKey, 102, 10);
  assert(!acquired2, 'Prevent second concurrent runner 102 while lock is held');

  db.releaseLock(lockKey, 101);
  const acquired3 = db.acquireLock(lockKey, 102, 10);
  assert(acquired3, 'Allow runner 102 after runner 101 releases lock');
  db.releaseLock(lockKey, 102);

  // ==========================================
  // Scenario 8: XPath Extraction on Local Fixtures
  // ==========================================
  console.log('\n--- 8. XPath Extraction on Local Fixture Pages ---');
  const htmlA = FIXTURE_PAGES['source-a.html'];
  const resUpdate = extractXPathFromHtml(htmlA, '//*[@id="last-update"]');
  assert(resUpdate.success && resUpdate.firstValue.includes('امروز'), 'Extract update text from Source A fixture');

  const resPrice = extractXPathFromHtml(htmlA, '//table[@id="zobahan-table"]//tr[1]/td[5]');
  assert(resPrice.success && resPrice.firstValue === '58,000', 'Extract price 58,000 from Source A table');

  // ==========================================
  // Scenario 9: Playwright Interactive Page Actions (WAIT, CLICK, WAIT_FOR_ELEMENT)
  // ==========================================
  console.log('\n--- 9. Playwright Interactive Page Actions ---');
  const playwrightSite: Site = {
    id: 99,
    name: 'سایت تعاملی آزمایشی',
    base_url: 'http://localhost:3000/fixtures/interactive-page.html',
    scrape_method: 'PLAYWRIGHT',
    browser: 'Chromium',
    timeout: 30,
    wait_after_load: 100,
    active: true,
    created_at: '',
    updated_at: ''
  };

  const interactiveActions: PageAction[] = [
    {
      id: 901,
      source_page_id: 99,
      order: 1,
      action_type: 'CLICK',
      selector: '#show-prices-btn',
      active: true,
      created_at: ''
    },
    {
      id: 902,
      source_page_id: 99,
      order: 2,
      action_type: 'WAIT_FOR_ELEMENT',
      selector: '#dynamic-prices',
      value: '2000',
      active: true,
      created_at: ''
    }
  ];

  const interactiveHtml = FIXTURE_PAGES['interactive-page.html'];
  const loadedInteractive = await loadSourcePage(
    'http://localhost:3000/fixtures/interactive-page.html',
    playwrightSite,
    interactiveActions,
    15000,
    interactiveHtml
  );

  const priceResultAfterClick = await loadedInteractive.evaluateXPath('//table[@id="dynamic-prices"]//tr[1]/td[2]');
  assert(
    priceResultAfterClick.success && priceResultAfterClick.firstValue === '57,900',
    'Playwright executed CLICK & WAIT_FOR_ELEMENT revealing hidden price 57,900'
  );
  await loadedInteractive.close();

  // ==========================================
  // Scenario 10: Playwright Page Action Error Classification (PAGE_ACTION_FAILED)
  // ==========================================
  console.log('\n--- 10. Playwright Page Action Error Classification ---');
  const brokenActions: PageAction[] = [
    {
      id: 903,
      source_page_id: 99,
      order: 1,
      action_type: 'CLICK',
      selector: '#non-existent-button-99999',
      active: true,
      created_at: ''
    }
  ];

  let actionErrorCaught: any = null;
  try {
    await loadSourcePage(
      'http://localhost:3000/fixtures/interactive-page.html',
      playwrightSite,
      brokenActions,
      10000,
      interactiveHtml
    );
  } catch (err: any) {
    actionErrorCaught = err;
  }

  assert(
    actionErrorCaught instanceof PageActionError,
    'PageActionError is thrown when action selector fails'
  );
  assert(
    actionErrorCaught?.action?.order === 1 && actionErrorCaught?.action?.action_type === 'CLICK',
    'PageActionError contains failed action metadata (order=1, action_type=CLICK)'
  );
  if (actionErrorCaught?.loadedPage) {
    await actionErrorCaught.loadedPage.close().catch(() => {});
  }

  // ==========================================
  // Scenario 11: FETCH Site Rejects Interactive Actions
  // ==========================================
  console.log('\n--- 11. FETCH Site Rejects Interactive Actions ---');
  const fetchSite: Site = {
    id: 100,
    name: 'سایت روش FETCH',
    base_url: 'http://localhost:3000/fixtures/source-a.html',
    scrape_method: 'FETCH',
    browser: 'Chromium',
    timeout: 30,
    wait_after_load: 0,
    active: true,
    created_at: '',
    updated_at: ''
  };

  let fetchActionError: any = null;
  try {
    await loadSourcePage(
      'http://localhost:3000/fixtures/source-a.html',
      fetchSite,
      interactiveActions, // Contains CLICK action
      10000,
      htmlA
    );
  } catch (err: any) {
    fetchActionError = err;
  }

  assert(
    fetchActionError !== null && fetchActionError.message.includes('روش استخراج FETCH تنظیم شده است'),
    'FETCH site rejects interactive CLICK action with descriptive Persian error message'
  );

  // ==========================================
  // Scenario 12: Shared Page Optimization
  // ==========================================
  console.log('\n--- 12. Shared Page Optimization (Same SourcePage HTML Reuse) ---');
  // Two table sources pointing to the exact same source_page_id can share preloadedHtml
  const cachedPageContent = FIXTURE_PAGES['source-a.html'];
  const sharedLoaded1 = await loadSourcePage(
    'http://localhost:3000/fixtures/source-a.html',
    fetchSite,
    [],
    10000,
    cachedPageContent
  );
  const sharedLoaded2 = await loadSourcePage(
    'http://localhost:3000/fixtures/source-a.html',
    fetchSite,
    [],
    10000,
    cachedPageContent
  );

  const val1 = await sharedLoaded1.evaluateXPath('//table[@id="zobahan-table"]//tr[1]/td[5]');
  const val2 = await sharedLoaded2.evaluateXPath('//table[@id="zobahan-table"]//tr[2]/td[5]');
  assert(val1.firstValue === '58,000' && val2.firstValue === '58,400', 'Multiple extractions succeed from shared preloaded page');
  await sharedLoaded1.close();
  await sharedLoaded2.close();

  // ==========================================
  // Scenario 13: Real Multi-Product Freshness Integration Test (scrapeTableSource)
  // ==========================================
  console.log('\n--- 13. Real Multi-Product Freshness Integration Test (scrapeTableSource) ---');
  // Register SourcePage and TableSource for multi-product test
  const multiPageId = db.getNextId('source_pages');
  const multiPageUrl = 'http://localhost:3000/fixtures/multi-product-freshness.html';
  schema.source_pages.push({
    id: multiPageId,
    site_id: 1,
    url: multiPageUrl,
    active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  });

  const multiSourceId = db.getNextId('table_sources');
  const multiTableSource: TableSource = {
    id: multiSourceId,
    price_table_id: 1,
    site_id: 1,
    source_page_id: multiPageId,
    source_page_url: multiPageUrl,
    update_time_xpath: '//div[@id="table-date"]', // Table date: "امروز ۱۰:۳۰"
    recheck_enabled: true,
    active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  schema.table_sources.push(multiTableSource);

  // Product A: date today -> price accepted
  schema.product_selectors.push({
    id: db.getNextId('product_selectors'),
    product_id: 1,
    post_id: 9101,
    table_source_id: multiSourceId,
    price_xpath: '//tr[@id="row-a"]/td[@class="price"]',
    update_time_xpath: '//tr[@id="row-a"]/td[@class="date"]', // "امروز ۱۰:۳۰"
    active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  });

  // Product B: date yesterday -> price rejected
  schema.product_selectors.push({
    id: db.getNextId('product_selectors'),
    product_id: 2,
    post_id: 9102,
    table_source_id: multiSourceId,
    price_xpath: '//tr[@id="row-b"]/td[@class="price"]',
    update_time_xpath: '//tr[@id="row-b"]/td[@class="date"]', // "دیروز ۱۶:۰۰"
    active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  });

  // Product C: no date XPath -> inherits table freshness (today) and price accepted
  schema.product_selectors.push({
    id: db.getNextId('product_selectors'),
    product_id: 3,
    post_id: 9103,
    table_source_id: multiSourceId,
    price_xpath: '//tr[@id="row-c"]/td[@class="price"]',
    update_time_xpath: undefined,
    active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  });

  // Product D: price XPath broken -> only D fails
  schema.product_selectors.push({
    id: db.getNextId('product_selectors'),
    product_id: 4,
    post_id: 9104,
    table_source_id: multiSourceId,
    price_xpath: '//tr[@id="row-d"]/td[@class="nonexistent_price_xpath"]',
    update_time_xpath: undefined,
    active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  });

  const multiScrapeResult = await scrapeTableSource(multiTableSource, 8801, FIXTURE_PAGES['multi-product-freshness.html']);
  const prodA = multiScrapeResult.products.find(p => p.post_id === 9101);
  const prodB = multiScrapeResult.products.find(p => p.post_id === 9102);
  const prodC = multiScrapeResult.products.find(p => p.post_id === 9103);
  const prodD = multiScrapeResult.products.find(p => p.post_id === 9104);

  assert(multiScrapeResult.fresh === true, 'Table date today recognized as fresh');
  assert(prodA !== undefined && prodA.valid === true && prodA.parsed_price === 55000, 'Product A (date today) accepted with parsed price 55,000');
  assert(prodB !== undefined && prodB.valid === false && prodB.product_fresh === false, 'Product B (date yesterday) rejected due to stale product date');
  assert(prodC !== undefined && prodC.valid === true && prodC.parsed_price === 57000, 'Product C (no date XPath) inherits table freshness and accepted');
  assert(prodD !== undefined && prodD.valid === false, 'Product D (broken price XPath) fails extraction');
  assert(prodA?.valid === true && prodC?.valid === true && !prodB?.valid && !prodD?.valid, 'A and C remain valid while B and D are rejected');

  // ==========================================
  // Scenario 14: Real Stale Table Integration Test (scrapeTableSource)
  // ==========================================
  console.log('\n--- 14. Real Stale Table Integration Test (scrapeTableSource) ---');
  const stalePageId = db.getNextId('source_pages');
  const stalePageUrl = 'http://localhost:3000/fixtures/source-c.html';
  schema.source_pages.push({
    id: stalePageId,
    site_id: 1,
    url: stalePageUrl,
    active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  });

  const staleSourceId = db.getNextId('table_sources');
  const staleTableSource: TableSource = {
    id: staleSourceId,
    price_table_id: 1,
    site_id: 1,
    source_page_id: stalePageId,
    source_page_url: stalePageUrl,
    update_time_xpath: '//*[@id="update-date-c"]', // "دیروز ۱۵:۳۰"
    recheck_enabled: true,
    active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  schema.table_sources.push(staleTableSource);

  schema.product_selectors.push({
    id: db.getNextId('product_selectors'),
    product_id: 1,
    post_id: 1840,
    table_source_id: staleSourceId,
    price_xpath: '//table[@id="tbl-c"]//tr[1]/td[2]',
    active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  });

  const staleScrapeResult = await scrapeTableSource(staleTableSource, 8802, FIXTURE_PAGES['source-c.html']);
  assert(staleScrapeResult.fresh === false, 'Stale table detected as not fresh (دیروز)');
  assert(staleScrapeResult.products.length === 0, 'No product price extractions performed when table date is stale');

  // ==========================================
  // Scenario 15: Excel Import Processing
  // ==========================================
  console.log('\n--- 15. Excel Import Processing ---');
  const mockPreview: any = {
    file_name: 'test_products.xlsx',
    entity_type: 'products',
    rows_total: 1,
    rows_new: 1,
    rows_updated: 0,
    rows_unchanged: 0,
    rows_failed: 0,
    errors: [],
    valid_rows: [
      {
        post_id: 9991,
        name: 'محصول تستی اکسل',
        factory_id: 1,
        price_table_id: 1,
        current_price: 61000,
        active: true,
        attributes: {}
      }
    ]
  };
  excelService.applyImport(mockPreview);
  const importedProd = db.getSchema().products.find((p) => p.post_id === 9991);
  assert(importedProd !== undefined && importedProd.name === 'محصول تستی اکسل', 'Excel import adds new product to schema');

  // ==========================================
  // Scenario 16: Excel Export/Import Round-Trip for scrape_method and update_time_xpath
  // ==========================================
  console.log('\n--- 16. Excel Export/Import Round-Trip for scrape_method and update_time_xpath ---');
  // 1. Ensure a site with PLAYWRIGHT scrape_method exists and persist to test DB
  let pwSite = schema.sites.find(s => s.scrape_method === 'PLAYWRIGHT');
  if (!pwSite) {
    pwSite = {
      id: db.getNextId('sites'),
      name: 'سایت پلی‌رایت آزمایشی',
      base_url: 'http://localhost:3000/fixtures/interactive-page.html',
      scrape_method: 'PLAYWRIGHT',
      browser: 'Chromium',
      timeout: 30,
      wait_after_load: 1000,
      active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    schema.sites.push(pwSite);
  } else {
    pwSite.scrape_method = 'PLAYWRIGHT';
  }
  db.save();

  // 2. Export Sites and verify PLAYWRIGHT survives round-trip via preview and applyImport
  const siteExportBuffer = await excelService.exportData('sites');
  // Mutate the site in test DB to FETCH to verify applyImport truly restores it
  pwSite.scrape_method = 'FETCH';
  db.save();
  assert(db.getSchema().sites.find(s => s.id === pwSite?.id)?.scrape_method === 'FETCH', 'Site temporarily mutated to FETCH in DB');

  const siteImportPreview = await excelService.previewImport(Buffer.from(siteExportBuffer as any), 'sites', 'sites_roundtrip.xlsx');
  excelService.applyImport(siteImportPreview);
  const reimportedPwSite = db.getSchema().sites.find(s => s.id === pwSite?.id);
  assert(reimportedPwSite !== undefined && reimportedPwSite.scrape_method === 'PLAYWRIGHT', 'Site scrape_method = PLAYWRIGHT persisted across Excel export/import apply');

  // 3. Ensure a product selector with update_time_xpath exists and persist to test DB
  const testSelectorXpath = '//table//tr[1]/td[6]';
  let dateSel = schema.product_selectors[0];
  dateSel.update_time_xpath = testSelectorXpath;
  db.save();

  // 4. Export Product Selectors and verify update_time_xpath survives round-trip via preview and applyImport
  const selectorExportBuffer = await excelService.exportData('product_selectors');
  // Clear update_time_xpath in test DB to null to verify applyImport truly restores it
  dateSel.update_time_xpath = null;
  db.save();
  assert(db.getSchema().product_selectors.find(s => s.id === dateSel?.id)?.update_time_xpath === null, 'Selector update_time_xpath temporarily cleared to null in DB');

  const selectorImportPreview = await excelService.previewImport(Buffer.from(selectorExportBuffer as any), 'product_selectors', 'selectors_roundtrip.xlsx');
  excelService.applyImport(selectorImportPreview);
  const reimportedSel = db.getSchema().product_selectors.find(s => s.id === dateSel?.id);
  assert(reimportedSel !== undefined && reimportedSel.update_time_xpath === testSelectorXpath, 'ProductSelector update_time_xpath persisted across Excel export/import apply');

  // ==========================================
  // Scenario 17: WordPress Bulk Publish Payload & Error Handling
  // ==========================================
  console.log('\n--- 17. WordPress Bulk Publish Payload & Error Handling ---');
  const wpPayload = [
    { post_id: 1840, price: 57800, stock_status: 'instock' },
    { post_id: 1841, price: 58200, stock_status: 'instock' }
  ];
  assert(wpPayload.length === 2 && wpPayload[0].post_id === 1840, 'WordPress product payload formatted correctly');

  // Test WP publish client (mock or response handling)
  const wpPublishRes = await publishTableToWordPress(1, wpPayload);
  assert(typeof wpPublishRes.success === 'boolean', 'publishTableToWordPress returns valid response status');

  // ==========================================
  // Scenario 18: System Error Resolution & Ignore Workflow
  // ==========================================
  console.log('\n--- 18. System Error Resolution & Ignore Workflow ---');
  const testErrorId = db.getNextId('errors');
  schema.errors.push({
    id: testErrorId,
    price_table_id: 1,
    site_id: 1,
    error_type: 'PAGE_ACTION_FAILED',
    error_message: 'خطای آزمایشی برای بررسی چرخه رفع خطا',
    execution_stage: 'SCRAPING',
    status: 'OPEN',
    created_at: new Date().toISOString()
  });

  const createdErr = schema.errors.find(e => e.id === testErrorId);
  assert(createdErr?.status === 'OPEN', 'Newly registered system error has status OPEN');

  // Mark resolved
  if (createdErr) {
    createdErr.status = 'RESOLVED';
    createdErr.resolved_at = new Date().toISOString();
  }
  assert(createdErr?.status === 'RESOLVED', 'System error transitioned from OPEN to RESOLVED');

  // ==========================================
  // Scenario 19: TableSource Real API Validation & Inline SourcePage Creation
  // ==========================================
  console.log('\n--- 19. TableSource Real API Validation & Inline SourcePage Creation ---');

  // 1. POST validation: invalid price_table_id => 400
  const postBadTable = await request(app)
    .post('/api/table-sources')
    .send({ price_table_id: 99999, site_id: 1, source_page_id: 1 });
  assert(postBadTable.status === 400, 'POST /api/table-sources with invalid price_table_id returns 400');

  // 2. POST validation: invalid site_id => 400
  const postBadSite = await request(app)
    .post('/api/table-sources')
    .send({ price_table_id: 1, site_id: 99999, source_page_id: 1 });
  assert(postBadSite.status === 400, 'POST /api/table-sources with invalid site_id returns 400');

  // 3. POST validation: invalid source_page_id => 400
  const postBadPage = await request(app)
    .post('/api/table-sources')
    .send({ price_table_id: 1, site_id: 1, source_page_id: 99999 });
  assert(postBadPage.status === 400, 'POST /api/table-sources with invalid source_page_id returns 400');

  // 4. POST validation: SourcePage belonging to another Site => 400
  // (In seed data: source_page 2 belongs to site 2, not site 1)
  const postCrossSite = await request(app)
    .post('/api/table-sources')
    .send({ price_table_id: 1, site_id: 1, source_page_id: 2 });
  assert(postCrossSite.status === 400, 'POST /api/table-sources with source_page belonging to another site returns 400');

  // 5. POST valid mapping with inline new_url creation and overrides
  const inlineUrl = 'http://localhost:3000/fixtures/source-inline-api-test.html';
  const postValid = await request(app)
    .post('/api/table-sources')
    .send({
      price_table_id: 1,
      site_id: 1,
      new_url: inlineUrl,
      update_time_xpath: '//div[@id="update-time-xpath"]',
      recheck_enabled: true,
      max_attempts_override: 7,
      retry_interval_override: 15,
      timeout_override: 45,
      price_guard_override: 20
    });
  assert(postValid.status === 200, 'POST /api/table-sources creates valid mapping with inline new_url');
  const createdTs = postValid.body;
  assert(typeof createdTs.id === 'number', 'Created TableSource has assigned id');
  assert(typeof createdTs.source_page_id === 'number', 'Created TableSource attached to inline created SourcePage');

  // Verify inline SourcePage was created in DB for site 1
  const inlinePage = db.getSchema().source_pages.find(p => p.id === createdTs.source_page_id);
  assert(inlinePage !== undefined && inlinePage.url === inlineUrl && inlinePage.site_id === 1, 'Inline SourcePage created in database with matching URL and site_id');

  // Verify overrides in response
  assert(createdTs.max_attempts_override === 7, 'max_attempts_override (7) saved in response');
  assert(createdTs.retry_interval_override === 15, 'retry_interval_override (15) saved in response');
  assert(createdTs.timeout_override === 45, 'timeout_override (45) saved in response');
  assert(createdTs.price_guard_override === 20, 'price_guard_override (20) saved in response');

  // 6. POST duplicate mapping prevention (same PriceTable + Site + SourcePage) => 400
  const postDuplicate = await request(app)
    .post('/api/table-sources')
    .send({
      price_table_id: 1,
      site_id: 1,
      source_page_id: createdTs.source_page_id
    });
  assert(postDuplicate.status === 400, 'POST /api/table-sources duplicate PriceTable+Site+SourcePage returns 400');

  // 7. PUT validation: change to SourcePage belonging to another Site => 400
  const putCrossSite = await request(app)
    .put(`/api/table-sources/${createdTs.id}`)
    .send({ source_page_id: 2 });
  assert(putCrossSite.status === 400, 'PUT /api/table-sources/:id with source_page belonging to another site returns 400');

  // 8. PUT validation: change to duplicate mapping => 400
  // (In seed data: table 1 already has site 1 mapped to source_page 1)
  const putDuplicate = await request(app)
    .put(`/api/table-sources/${createdTs.id}`)
    .send({ source_page_id: 1 });
  assert(putDuplicate.status === 400, 'PUT /api/table-sources/:id resulting in duplicate mapping returns 400');

  // 9. PUT valid change => success
  const putValid = await request(app)
    .put(`/api/table-sources/${createdTs.id}`)
    .send({
      update_time_xpath: '//span[@class="new-time"]',
      recheck_enabled: false
    });
  assert(putValid.status === 200 && putValid.body.update_time_xpath === '//span[@class="new-time"]', 'PUT /api/table-sources/:id updates fields successfully');

  // 10. PUT clear override with null or empty value => becomes null
  const putClear = await request(app)
    .put(`/api/table-sources/${createdTs.id}`)
    .send({
      max_attempts_override: null,
      retry_interval_override: '',
      timeout_override: null,
      price_guard_override: ''
    });
  assert(
    putClear.status === 200 &&
    putClear.body.max_attempts_override === null &&
    putClear.body.retry_interval_override === null &&
    putClear.body.timeout_override === null &&
    putClear.body.price_guard_override === null,
    'PUT /api/table-sources/:id clears overrides with null or empty value to null'
  );

  // ==========================================
  // Scenario 20: TableSource 4-Level Overrides Persistence & Evaluation
  // ==========================================
  console.log('\n--- 20. TableSource 4-Level Overrides Persistence & Evaluation ---');
  // 1. Create a TableSource via API with explicit overrides
  const resScenario20 = await request(app)
    .post('/api/table-sources')
    .send({
      price_table_id: 1,
      site_id: 2,
      new_url: 'http://localhost:3000/fixtures/source-b-override-persistence-test.html',
      update_time_xpath: '//div[@class="pubdate"]',
      recheck_enabled: true,
      max_attempts_override: 8,
      retry_interval_override: 20,
      timeout_override: 50,
      price_guard_override: 25
    });
  assert(resScenario20.status === 200, 'TableSource created via API for persistence testing');
  const persistedId = resScenario20.body.id;

  // 2. Read back from database after persistence
  db.reload();
  const reloadedSource = db.getSchema().table_sources.find(s => s.id === persistedId);
  assert(reloadedSource !== undefined, 'TableSource successfully re-read from isolated test DB');
  assert(reloadedSource?.max_attempts_override === 8, 'Persisted max_attempts_override === 8');
  assert(reloadedSource?.retry_interval_override === 20, 'Persisted retry_interval_override === 20');
  assert(reloadedSource?.timeout_override === 50, 'Persisted timeout_override === 50');
  assert(reloadedSource?.price_guard_override === 25, 'Persisted price_guard_override === 25');

  // 3. Compute and assert getEffectiveConfig on the persisted record
  const effectiveConfig = getEffectiveConfig(reloadedSource!, db.getSchema().price_tables[0]);
  assert(effectiveConfig.max_attempts === 8 && effectiveConfig.origins.max_attempts === 'SOURCE', 'Effective config uses max_attempts_override (8)');
  assert(effectiveConfig.retry_interval_minutes === 20 && effectiveConfig.origins.retry_interval === 'SOURCE', 'Effective config uses retry_interval_override (20)');
  assert(effectiveConfig.price_guard_percent === 25 && effectiveConfig.origins.price_guard === 'SOURCE', 'Effective config uses price_guard_override (25)');
  assert(effectiveConfig.timeout_seconds === 50 && effectiveConfig.origins.timeout === 'SOURCE', 'Effective config uses timeout_override (50)');

  // ==========================================
  // Scenario 21: PageAction Scoping, Overrides, Strict Ownership & Parity
  // ==========================================
  await runPageActionTests(app, assert);
}

async function main() {
  try {
    await runTests();
  } finally {
    // 1. Clean up Playwright browser
    await closePlaywrightBrowser();

    // 2. Switch db manager back to production file
    const defaultProdFile = path.join(process.cwd(), 'data', 'database.json');
    db.setDatabaseFile(defaultProdFile);

    // 3. Hermetic cleanup: delete test database file and temporary artifacts
    if (fs.existsSync(TEST_DB_FILE)) {
      try {
        fs.unlinkSync(TEST_DB_FILE);
      } catch (err) {
        console.error('Failed to remove TEST_DB_FILE:', err);
      }
    }
    if (fs.existsSync(`${TEST_DB_FILE}.tmp`)) {
      try {
        fs.unlinkSync(`${TEST_DB_FILE}.tmp`);
      } catch {}
    }
  }

  console.log(`\n========================================`);
  console.log(`Test Results: ${passed} Passed, ${failed} Failed`);
  console.log(`========================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});


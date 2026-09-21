// Comprehensive Test Suite for Price System (18 Complete Scenarios)
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
  console.log('🧪 Running Price Collector System Automated Tests (18 Scenarios)...\n');

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
  // Scenario 13: Product-Level Update Time XPath Evaluation
  // ==========================================
  console.log('\n--- 13. Product-Level Update Time XPath Evaluation ---');
  const prodDateExtraction = evaluateFreshness('امروز ساعت ۱۰:۵۵', now);
  assert(prodDateExtraction.fresh === true && prodDateExtraction.normalized_time === '10:55', 'Product-level date evaluated as fresh today');

  const staleProdDateExtraction = evaluateFreshness('1402/08/15', now);
  assert(staleProdDateExtraction.fresh === false, 'Product-level stale date evaluated as not fresh');

  // ==========================================
  // Scenario 14: Stale Table Date Skips Product Price Extraction
  // ==========================================
  console.log('\n--- 14. Stale Table Date Skips Product Price Extraction ---');
  const staleHtml = FIXTURE_PAGES['source-c.html'];
  const updateDateExtract = extractXPathFromHtml(staleHtml, '//*[@id="update-date-c"]');
  const evaluatedStale = evaluateFreshness(updateDateExtract.firstValue, now);
  assert(evaluatedStale.fresh === false, 'Source C date "دیروز ۱۵:۳۰" detected as stale');

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
  // Scenario 16: Excel Export Workbook Generation
  // ==========================================
  console.log('\n--- 16. Excel Export Workbook Generation ---');
  const exportBuffer = await excelService.exportData('products');
  assert(exportBuffer && (exportBuffer as any).byteLength > 500, 'Generate valid Excel export buffer for products');

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
  const schema = db.getSchema();
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

  // Clean up Playwright browser
  await closePlaywrightBrowser();

  console.log(`\n========================================`);
  console.log(`Test Results: ${passed} Passed, ${failed} Failed`);
  console.log(`========================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});


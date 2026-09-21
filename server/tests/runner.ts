// Comprehensive Test Suite for Price System
import { toAsciiDigits, gregorianToJalali, evaluateFreshness } from '../scraper/freshness';
import { parseProductPrice } from '../scraper/priceParser';
import { checkPriceGuard, calculateMinimumPrices, getEffectiveConfig } from '../engine/priceGuard';
import { db } from '../db/database';
import { extractXPathFromHtml } from '../scraper/xpathExtractor';
import { FIXTURE_PAGES } from '../fixtures/fixtures';

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
  console.log('🧪 Running Price Collector System Automated Tests...\n');

  // Test 1: Persian Digits Normalization
  console.log('--- 1. Persian & Arabic Digits Normalization ---');
  assert(toAsciiDigits('۵۸,۲۰۰') === '58,200', 'Convert Persian digits ۵۸,۲۰۰ to 58,200');
  assert(toAsciiDigits('١٢٣٤٥') === '12345', 'Convert Arabic digits to ASCII 12345');

  // Test 2: Price Parsing
  console.log('\n--- 2. Price Parsing ---');
  const p1 = parseProductPrice('۵۸,۲۰۰ تومان');
  assert(p1.valid && p1.price === 58200, 'Parse Persian formatted price with currency');

  const p2 = parseProductPrice('57 800');
  assert(p2.valid && p2.price === 57800, 'Parse price with whitespace separator');

  const p3 = parseProductPrice('ناموجود');
  assert(!p3.valid, 'Reject non-numeric string "ناموجود"');

  const p4 = parseProductPrice('0');
  assert(!p4.valid, 'Reject zero price');

  // Test 3: Freshness Parsing
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

  // Test 4: Price Guard
  console.log('\n--- 4. Price Guard ---');
  const pg1 = checkPriceGuard(60000, 58000, 30);
  assert(!pg1.blocked && pg1.difference_percent < 0, 'Allow small 3.3% price decrease');

  const pg2 = checkPriceGuard(60000, 40000, 30);
  assert(pg2.blocked, 'Block excessive 33.3% price drop (> 30% threshold)');

  const pg3 = checkPriceGuard(60000, 85000, 30);
  assert(pg3.blocked, 'Block excessive 41.6% price surge (> 30% threshold)');

  // Test 5: Minimum Price Calculation
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

  // Test 6: Cascading Config Inheritance
  console.log('\n--- 6. Cascading Config Inheritance ---');
  const dummyTableSource = {
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
  const dummyTable = {
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
  const effConfig = getEffectiveConfig(dummyTableSource as any, dummyTable as any);
  assert(effConfig.max_attempts === 6 && effConfig.origins.max_attempts === 'SOURCE', 'Source override wins for max_attempts');
  assert(effConfig.retry_interval_minutes === 25 && effConfig.origins.retry_interval === 'TABLE', 'Table override inherits for retry_interval');
  assert(effConfig.price_guard_percent === 20 && effConfig.origins.price_guard === 'TABLE', 'Table inherits price_guard');

  // Test 7: Run Locking Mechanism
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

  // Test 8: XPath Extraction on Local Fixtures
  console.log('\n--- 8. XPath Extraction on Local Fixture Pages ---');
  const htmlA = FIXTURE_PAGES['source-a.html'];
  const resUpdate = extractXPathFromHtml(htmlA, '//*[@id="last-update"]');
  assert(resUpdate.success && resUpdate.firstValue.includes('امروز'), 'Extract update text from Source A fixture');

  const resPrice = extractXPathFromHtml(htmlA, '//table[@id="zobahan-table"]//tr[1]/td[5]');
  assert(resPrice.success && resPrice.firstValue === '58,000', 'Extract price 58,000 from Source A table');

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

import { db } from '../db/database';
import { executePriceTable, recalculateProductPrices } from '../engine/tableExecution';
import { syncProductsToDestination } from '../wordpress/client';
import { tableConfigService } from '../engine/tableConfigService';

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

export async function runVatPriceTests() {
  console.log('--- Testing Destination VAT-inclusive Price Delivery ---');

  const schema = db.getSchema();

  // 1. Setup price table with 10% VAT and a product
  let testTable = schema.price_tables.find((t) => t.id === 9901);
  if (!testTable) {
    testTable = {
      id: 9901,
      name: 'جدول تست ارزش افزوده',
      factory_id: 1,
      category_id: 1,
      active: true,
      start_time: '11:00',
      retry_interval_minutes: 30,
      max_attempts: 5,
      price_guard_percent: 50,
      default_price_adjustment: 0,
      vat_percent: 10,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    schema.price_tables.push(testTable);
  } else {
    testTable.vat_percent = 10;
  }

  let testProduct = schema.products.find((p) => p.id === 9901);
  if (!testProduct) {
    testProduct = {
      id: 9901,
      post_id: 9901,
      destination_id: 9901,
      name: 'محصول تست ارزش افزوده',
      factory_id: 1,
      price_table_id: 9901,
      current_price: 30000,
      active: true,
      attributes: {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    schema.products.push(testProduct);
  } else {
    testProduct.current_price = 30000;
  }
  db.save();

  // 2. Test syncProductsToDestination sends price with VAT
  const syncResult = await syncProductsToDestination();
  assert(syncResult.success === true, 'syncProductsToDestination executed successfully');

  // 3. Test recalculateProductPrices sets price_with_vat
  // Add a product selector with price 40,000
  schema.product_selectors.push({
    id: db.getNextId('product_selectors'),
    product_id: 9901,
    post_id: 9901,
    table_source_id: 9901,
    price_xpath: '//div',
    last_status: 'VALID',
    last_parsed_price: 40000,
    active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  });

  // Ensure table source 9901 exists and is active
  schema.table_sources.push({
    id: 9901,
    price_table_id: 9901,
    site_id: 1,
    source_page_id: 1,
    active: true,
    recheck_enabled: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  });

  recalculateProductPrices(9901);
  const updatedProd = schema.products.find((p) => p.id === 9901);
  assert(updatedProd?.current_price === 40000, 'recalculateProductPrices base current_price === 40,000');
  // 40,000 + 10% VAT = 44,000
  assert(updatedProd?.price_with_vat === 44000, 'recalculateProductPrices price_with_vat === 44,000 (with 10% VAT)');

  // 4. Test tableConfigService exports and imports vat_percent
  const exported = tableConfigService.exportConfig([9901]);
  assert(exported.tables[0].vat_percent === 10, 'TableConfigService exports vat_percent === 10');

  // Change vat_percent in export to 9%
  exported.tables[0].vat_percent = 9;
  const preview = tableConfigService.previewImport(exported);
  assert(preview.valid === true, 'previewImport validates package with vat_percent');
  tableConfigService.applyImport(exported, { mode: 'upsert' });

  const reloadedTable = db.getSchema().price_tables.find((t) => t.id === 9901);
  assert(reloadedTable?.vat_percent === 9, 'applyImport successfully updated vat_percent to 9%');

  // 5. Test publishTableToWordPress updates and persists last_update_time
  const beforeTime = Math.floor(Date.now() / 1000);
  const { publishTableToWordPress } = await import('../wordpress/client');
  const pubRes = await publishTableToWordPress(9901, [{ post_id: 9901, price: 44000 }]);
  assert(pubRes.success === true, 'publishTableToWordPress succeeded with destination');
  const tableAfterPub = db.getSchema().price_tables.find((t) => t.id === 9901);
  assert(
    typeof tableAfterPub?.last_update_time === 'number' && tableAfterPub.last_update_time >= beforeTime,
    'publishTableToWordPress sets Unix timestamp last_update_time on price_table'
  );

  // 6. Test updateWordPressTableTime directly updates table time
  const { updateWordPressTableTime } = await import('../wordpress/client');
  const customTimestamp = 1750000000;
  const directRes = await updateWordPressTableTime(9901, customTimestamp);
  assert(directRes.success === true, 'updateWordPressTableTime executed successfully');
  const tableAfterDirect = db.getSchema().price_tables.find((t) => t.id === 9901);
  assert(
    tableAfterDirect?.last_update_time === customTimestamp,
    'updateWordPressTableTime directly persists exact Unix timestamp in db'
  );

  // 7. Test publishTableToWordPress with 0 products also updates last_update_time
  const newBeforeTime = Math.floor(Date.now() / 1000);
  const emptyPubRes = await publishTableToWordPress(9901, []);
  assert(emptyPubRes.success === true, 'publishTableToWordPress with 0 products succeeds');
  const tableAfterEmpty = db.getSchema().price_tables.find((t) => t.id === 9901);
  assert(
    typeof tableAfterEmpty?.last_update_time === 'number' && tableAfterEmpty.last_update_time >= newBeforeTime,
    'publishTableToWordPress with 0 products still updates last_update_time'
  );

  console.log(`\n🎉 VAT Price & Last Update Time Test Results: ${passed} Passed, ${failed} Failed\n`);
  if (failed > 0) throw new Error(`${failed} tests failed!`);
}

if (process.argv[1]?.endsWith('vatPrice.test.ts')) {
  runVatPriceTests().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

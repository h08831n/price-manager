import path from 'path';
import express from 'express';
import request from 'supertest';
import { db } from '../db/database';
import { getSeedDatabase } from '../db/seed';
import { apiRouter } from '../routes/api';
import { tableConfigService } from '../engine/tableConfigService';

export async function runTableConfigTests() {
  console.log('\n--- Running Price Table & Sources Config Export/Import Tests ---');

  const TEST_DB_FILE = path.join(process.cwd(), 'data', 'test-table-config.json');
  db.setDatabaseFile(TEST_DB_FILE);
  db.resetWith(getSeedDatabase());

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

  // 1. Export all tables
  const exportAll = tableConfigService.exportConfig();
  assert(exportAll.format === 'price_tables_config_export', 'Export format is price_tables_config_export');
  assert(exportAll.tables.length > 0, `Exported ${exportAll.tables.length} tables successfully`);
  assert(exportAll.total_sources > 0, `Exported ${exportAll.total_sources} sources configured`);
  assert(exportAll.total_selectors > 0, `Exported ${exportAll.total_selectors} selectors`);

  // Verify first table structure
  const firstTable = exportAll.tables[0];
  assert(Boolean(firstTable.name), `Table has name: ${firstTable.name}`);
  assert(Array.isArray(firstTable.sources), 'Table has sources array');
  assert(firstTable.sources.length > 0, 'Table has configured sources');
  assert(Boolean(firstTable.sources[0].url), `Source has URL: ${firstTable.sources[0].url}`);
  assert(Array.isArray(firstTable.sources[0].selectors), 'Source has selectors');

  // 2. Export single table
  const exportSingle = tableConfigService.exportConfig([firstTable.id!]);
  assert(exportSingle.tables.length === 1, 'Single table export returns 1 table');
  assert(exportSingle.tables[0].name === firstTable.name, 'Single table export matches requested table');

  // 3. Test HTTP GET /api/price-tables/config/export
  const getRes = await request(app).get('/api/price-tables/config/export?download=1');
  assert(getRes.status === 200, 'GET /api/price-tables/config/export returns 200');
  assert(getRes.headers['content-disposition']?.includes('attachment'), 'Export includes attachment header when download=1');
  assert(getRes.body.format === 'price_tables_config_export', 'HTTP response body has valid format');

  // 4. Test Preview Import
  const preview = tableConfigService.previewImport(exportAll);
  assert(preview.valid === true, 'Preview of exported package is valid');
  assert(preview.total_tables === exportAll.tables.length, `Preview correctly counted ${preview.total_tables} tables`);
  assert(preview.tables[0].action === 'UPDATE', 'Existing table identified as UPDATE in preview');

  // 5. Test HTTP POST /api/price-tables/config/preview-import
  const previewRes = await request(app)
    .post('/api/price-tables/config/preview-import')
    .send(exportAll);
  assert(previewRes.status === 200, 'POST preview-import returns 200');
  assert(previewRes.body.valid === true, 'HTTP preview-import returns valid: true');

  // 6. Test Import with a brand new table and custom sources & selectors
  const customPackage = {
    format: 'price_tables_config_export' as const,
    version: 1,
    exported_at: new Date().toISOString(),
    source_app: 'Test System',
    total_tables: 1,
    total_sources: 1,
    total_selectors: 2,
    total_page_actions: 1,
    tables: [
      {
        name: 'جدول تست آزمایشی وارداتی',
        factory_name: 'ذوب آهن اصفهان',
        start_time: '12:30',
        retry_interval_minutes: 45,
        max_attempts: 7,
        price_guard_percent: 25,
        default_price_adjustment: 150,
        assignment_mode: 'TAXONOMY' as const,
        active: true,
        sources: [
          {
            url: 'http://localhost:3000/fixtures/source-imported.html',
            site_name: 'سایت تست وارداتی',
            site_base_url: 'http://localhost:3000',
            scrape_method: 'PLAYWRIGHT' as const,
            active: true,
            update_time_xpath: '//div[@class="test-date"]',
            recheck_enabled: true,
            selectors: [
              {
                post_id: 1840,
                product_name: 'میلگرد ۱۲ ذوب آهن',
                price_xpath: '//div[@id="test-price-12"]',
                active: true
              },
              {
                post_id: 1841,
                product_name: 'میلگرد ۱۴ ذوب آهن',
                price_xpath: '//div[@id="test-price-14"]',
                active: true
              }
            ],
            page_actions: [
              {
                order: 1,
                action_type: 'WAIT' as const,
                value: '2000',
                active: true
              }
            ]
          }
        ]
      }
    ],
    referenced_sites: [
      {
        name: 'سایت تست وارداتی',
        base_url: 'http://localhost:3000',
        scrape_method: 'PLAYWRIGHT',
        browser: 'Chromium',
        timeout: 30,
        wait_after_load: 1500,
        active: true
      }
    ]
  };

  // Preview the new custom table
  const previewCustom = tableConfigService.previewImport(customPackage);
  assert(previewCustom.valid === true, 'Custom package preview is valid');
  assert(previewCustom.tables[0].action === 'CREATE', 'New table identified as CREATE in preview');
  assert(previewCustom.sites_to_create.includes('سایت تست وارداتی'), 'Identified new site to create');

  // Apply import
  const applyRes = await request(app)
    .post('/api/price-tables/config/import')
    .send({ config: customPackage, mode: 'upsert' });

  assert(applyRes.status === 200, 'POST /api/price-tables/config/import returns 200');
  assert(applyRes.body.success === true, 'Import applied successfully');
  assert(applyRes.body.created_tables === 1, '1 new table created');
  assert(applyRes.body.created_sources === 1, '1 new source created');
  assert(applyRes.body.configured_selectors === 2, '2 selectors configured');
  assert(applyRes.body.configured_actions === 1, '1 page action configured');

  // Verify DB state
  const updatedSchema = db.getSchema();
  const createdTbl = updatedSchema.price_tables.find((t) => t.name === 'جدول تست آزمایشی وارداتی');
  assert(Boolean(createdTbl), 'Imported table exists in schema');
  assert(createdTbl?.start_time === '12:30', 'Imported start_time matches 12:30');
  assert(createdTbl?.max_attempts === 7, 'Imported max_attempts matches 7');

  const createdSrc = updatedSchema.table_sources.find((s) => s.price_table_id === createdTbl?.id);
  assert(Boolean(createdSrc), 'Imported table source exists in schema');
  assert(createdSrc?.update_time_xpath === '//div[@class="test-date"]', 'Imported update_time_xpath matches');

  const createdSel = updatedSchema.product_selectors.filter((s) => s.table_source_id === createdSrc?.id);
  assert(createdSel.length === 2, 'Found 2 product selectors for imported source');

  const createdAct = updatedSchema.page_actions.filter((a) => a.table_source_id === createdSrc?.id);
  assert(createdAct.length === 1, 'Found 1 page action for imported source');
  assert(createdAct[0].action_type === 'WAIT' && createdAct[0].value === '2000', 'Page action values match');

  console.log(`\n🎉 Table Config Export/Import Test Results: ${passed} Passed, ${failed} Failed\n`);
  if (failed > 0) throw new Error(`${failed} tests failed!`);
}

if (process.argv[1]?.endsWith('tableConfig.test.ts')) {
  runTableConfigTests().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

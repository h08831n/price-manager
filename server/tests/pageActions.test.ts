import assert from 'assert';
import { db } from '../db/database';
import { resolveEffectivePageActions, getSiteDefaultPageActions, getTableSourcePageActionsInfo } from '../scraper/pageActions';
import { PageAction, TableSource } from '../../src/types';

function runPageActionTests() {
  console.log('Testing PageAction Scoping & Resolution Architecture...');

  // Setup test schema
  const schema = db.getSchema();

  // Test Site 1 (Site with default actions)
  const testSiteId = 888;
  const testTableSourceIdWithoutOverride = 991;
  const testTableSourceIdWithOverride = 992;

  // Add dummy site
  schema.sites.push({
    id: testSiteId,
    name: 'Test Site Scoping',
    base_url: 'https://test-scoping.com',
    scrape_method: 'PLAYWRIGHT',
    browser: 'Chromium',
    timeout: 30,
    wait_after_load: 500,
    active: true,
    created_at: '',
    updated_at: ''
  });

  // Add TableSource 1 (Will use SITE_DEFAULT)
  schema.table_sources.push({
    id: testTableSourceIdWithoutOverride,
    price_table_id: 1,
    site_id: testSiteId,
    source_page_id: 0,
    active: true,
    recheck_enabled: true
  } as TableSource);

  // Add TableSource 2 (Will have TABLE_SOURCE override)
  schema.table_sources.push({
    id: testTableSourceIdWithOverride,
    price_table_id: 1,
    site_id: testSiteId,
    source_page_id: 0,
    active: true,
    recheck_enabled: true
  } as TableSource);

  // Add Site Default Actions
  const siteDefaultActions: PageAction[] = [
    {
      id: 7001,
      scope: 'SITE_DEFAULT',
      site_id: testSiteId,
      table_source_id: null,
      order: 1,
      action_type: 'WAIT',
      value: '1000',
      active: true,
      created_at: ''
    },
    {
      id: 7002,
      scope: 'SITE_DEFAULT',
      site_id: testSiteId,
      table_source_id: null,
      order: 2,
      action_type: 'CLICK',
      selector: '//button[@id="site-default-btn"]',
      active: true,
      created_at: ''
    }
  ];
  schema.page_actions.push(...siteDefaultActions);

  // Add TableSource Override Actions for TableSource 2
  const sourceOverrideActions: PageAction[] = [
    {
      id: 8001,
      scope: 'TABLE_SOURCE',
      site_id: testSiteId,
      table_source_id: testTableSourceIdWithOverride,
      order: 1,
      action_type: 'CLICK',
      selector: '//button[@id="override-btn-1"]',
      active: true,
      created_at: ''
    },
    {
      id: 8002,
      scope: 'TABLE_SOURCE',
      site_id: testSiteId,
      table_source_id: testTableSourceIdWithOverride,
      order: 2,
      action_type: 'WAIT',
      value: '2500',
      active: true,
      created_at: ''
    },
    {
      id: 8003,
      scope: 'TABLE_SOURCE',
      site_id: testSiteId,
      table_source_id: testTableSourceIdWithOverride,
      order: 3,
      action_type: 'SCROLL',
      value: '500',
      active: false, // Inactive action should be filtered out
      created_at: ''
    }
  ];
  schema.page_actions.push(...sourceOverrideActions);

  // 1. Test fallback to SITE_DEFAULT when no override exists
  const actionsForSource1 = resolveEffectivePageActions(testTableSourceIdWithoutOverride);
  assert.strictEqual(actionsForSource1.length, 2, 'Source without override falls back to site defaults');
  assert.strictEqual(actionsForSource1[0].id, 7001);
  assert.strictEqual(actionsForSource1[1].id, 7002);
  console.log('✅ PASS: resolveEffectivePageActions correctly falls back to SITE_DEFAULT actions');

  // 2. Test override behavior: TableSource override actions completely replace site defaults (no merge!)
  const actionsForSource2 = resolveEffectivePageActions(testTableSourceIdWithOverride);
  assert.strictEqual(actionsForSource2.length, 2, 'Source with override uses only active override actions');
  assert.strictEqual(actionsForSource2[0].id, 8001);
  assert.strictEqual(actionsForSource2[1].id, 8002);
  assert(
    !actionsForSource2.some((a) => a.id === 7001 || a.id === 7002),
    'Site defaults are NOT merged with table source override'
  );
  console.log('✅ PASS: TableSource override completely replaces site default actions without merging');

  // 3. Test getTableSourcePageActionsInfo helper
  const info1 = getTableSourcePageActionsInfo(testTableSourceIdWithoutOverride);
  assert.strictEqual(info1.hasOverride, false);
  assert.strictEqual(info1.effectiveActions.length, 2);

  const info2 = getTableSourcePageActionsInfo(testTableSourceIdWithOverride);
  assert.strictEqual(info2.hasOverride, true);
  assert.strictEqual(info2.overrideActions.length, 3); // includes inactive
  assert.strictEqual(info2.effectiveActions.length, 2); // only active
  console.log('✅ PASS: getTableSourcePageActionsInfo accurately returns override state and actions');

  // Cleanup test data
  schema.sites = schema.sites.filter((s) => s.id !== testSiteId);
  schema.table_sources = schema.table_sources.filter(
    (ts) => ts.id !== testTableSourceIdWithoutOverride && ts.id !== testTableSourceIdWithOverride
  );
  schema.page_actions = schema.page_actions.filter(
    (a) => a.site_id !== testSiteId && a.table_source_id !== testTableSourceIdWithOverride
  );

  console.log('\n🎉 ALL PAGE ACTION SCOPING TESTS PASSED!');
}

runPageActionTests();

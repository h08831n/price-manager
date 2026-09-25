import assert from 'assert';
import request from 'supertest';
import { db } from '../db/database';
import {
  resolveEffectivePageActions,
  getSiteDefaultPageActions,
  getTableSourcePageActionsInfo
} from '../scraper/pageActions';
import { scrapeTableSource } from '../scraper/engine';
import { PageAction, TableSource, Site, ProductSelector } from '../../src/types';

export async function runPageActionTests(app: any, assertFn: (condition: boolean, testName: string) => void) {
  console.log('\n--- PageAction Scoping, Overrides, Strict Ownership & Parity Tests ---');

  const schema = db.getSchema();
  const testSiteId = 888;
  const testTableSourceIdWithoutOverride = 991;
  const testTableSourceIdWithOverride = 992;
  const testTableSourceIdAllInactive = 993;

  // 1. Setup Site
  schema.sites.push({
    id: testSiteId,
    name: 'Test Site Scoping',
    base_url: 'http://localhost:3000/fixtures/source-a.html',
    scrape_method: 'PLAYWRIGHT',
    browser: 'Chromium',
    timeout: 30,
    wait_after_load: 500,
    active: true,
    created_at: '',
    updated_at: ''
  });

  // 2. Setup Table Sources
  schema.table_sources.push({
    id: testTableSourceIdWithoutOverride,
    price_table_id: 1,
    site_id: testSiteId,
    source_page_id: 1,
    active: true,
    recheck_enabled: true
  } as TableSource);

  schema.table_sources.push({
    id: testTableSourceIdWithOverride,
    price_table_id: 1,
    site_id: testSiteId,
    source_page_id: 1,
    active: true,
    recheck_enabled: true
  } as TableSource);

  schema.table_sources.push({
    id: testTableSourceIdAllInactive,
    price_table_id: 1,
    site_id: testSiteId,
    source_page_id: 1,
    active: true,
    recheck_enabled: true
  } as TableSource);

  // 3. Setup Site Default Actions (Active)
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

  // 4. Setup TableSource 2 Overrides (Mixed active/inactive)
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
      active: false,
      created_at: ''
    }
  ];
  schema.page_actions.push(...sourceOverrideActions);

  // 5. Setup TableSource 3 Overrides (ALL INACTIVE edge case)
  const inactiveOverrideActions: PageAction[] = [
    {
      id: 8004,
      scope: 'TABLE_SOURCE',
      site_id: testSiteId,
      table_source_id: testTableSourceIdAllInactive,
      order: 1,
      action_type: 'WAIT',
      value: '2000',
      active: false,
      created_at: ''
    },
    {
      id: 8005,
      scope: 'TABLE_SOURCE',
      site_id: testSiteId,
      table_source_id: testTableSourceIdAllInactive,
      order: 2,
      action_type: 'CLICK',
      selector: '//button[@id="inactive-btn"]',
      active: false,
      created_at: ''
    }
  ];
  schema.page_actions.push(...inactiveOverrideActions);

  // --- Test Suite Requirements ---

  // 1. Site Default fallback
  const actions1 = resolveEffectivePageActions(testTableSourceIdWithoutOverride);
  assertFn(
    actions1.length === 2 && actions1[0].id === 7001 && actions1[1].id === 7002,
    'Site Default fallback: TableSource without override uses site default actions'
  );

  // 2. TableSource override & No merge & Ordering
  const actions2 = resolveEffectivePageActions(testTableSourceIdWithOverride);
  assertFn(
    actions2.length === 2 && actions2[0].id === 8001 && actions2[1].id === 8002,
    'TableSource override: Uses only active override actions in order'
  );
  assertFn(
    !actions2.some((a) => a.id === 7001 || a.id === 7002),
    'No merge: Site default actions are never merged into TableSource overrides'
  );

  // 3. No actions scenario (Site with 0 actions, TableSource with 0 actions)
  const emptySiteId = 889;
  const emptyTsId = 994;
  schema.sites.push({
    id: emptySiteId,
    name: 'Empty Site',
    base_url: 'http://localhost:3000/fixtures/source-a.html',
    scrape_method: 'FETCH',
    browser: 'Chromium',
    timeout: 30,
    wait_after_load: 0,
    active: true,
    created_at: '',
    updated_at: ''
  });
  schema.table_sources.push({
    id: emptyTsId,
    price_table_id: 1,
    site_id: emptySiteId,
    source_page_id: 1,
    active: true,
    recheck_enabled: true
  } as TableSource);
  const actionsEmpty = resolveEffectivePageActions(emptyTsId);
  assertFn(actionsEmpty.length === 0, 'No actions: returns empty array [] when neither site nor source has actions');

  // 4. Critical Inactive Override Edge Case & Parity (Production, Tester, Picker)
  const actionsInactiveOverride = resolveEffectivePageActions(testTableSourceIdAllInactive);
  assertFn(
    actionsInactiveOverride.length === 0,
    'inactive override does NOT fallback: returns [] when overrides exist but are inactive'
  );

  // Verify Production Parity:
  assertFn(actionsInactiveOverride.length === 0, 'Production effective actions: returns [] for inactive override');

  // Verify Tester Parity (POST /api/selectors/test):
  const testerRes = await request(app)
    .post('/api/selectors/test')
    .send({
      source_id: testTableSourceIdAllInactive,
      xpath: '//*[@id="last-update"]',
      type: 'DATE'
    });
  assertFn(testerRes.status === 200, 'Tester effective actions: runs successfully with source_id and [] actions');

  // Verify Picker Parity (GET /api/picker/inspect):
  const pickerRes = await request(app)
    .get(`/api/picker/inspect?url=http://localhost:3000/fixtures/source-a.html&table_source_id=${testTableSourceIdAllInactive}`);
  assertFn(pickerRes.status === 200, 'Picker effective actions: runs successfully with table_source_id and [] actions');

  assertFn(
    actionsInactiveOverride.length === 0 && testerRes.status === 200 && pickerRes.status === 200,
    'all three behave identically: Production, Tester, and Picker handle inactive overrides with []'
  );

  // 5. REAL PRODUCTION INTEGRATION TEST FOR INACTIVE OVERRIDE (Requirement #2)
  // Scenario:
  // Site Default Actions: an active CLICK on a selector that fails if executed.
  // TableSource Overrides: at least one action, but all inactive.
  // scrapeTableSource(tableSource, ...) is called.
  // Proves Site Default CLICK did NOT run and scraping completed with effective actions = [].
  const realTestSiteId = 890;
  schema.sites.push({
    id: realTestSiteId,
    name: 'Real Test Site For Inactive Override',
    base_url: 'http://localhost:3000/fixtures/source-a.html',
    scrape_method: 'PLAYWRIGHT',
    browser: 'Chromium',
    timeout: 10,
    wait_after_load: 0,
    active: true,
    created_at: '',
    updated_at: ''
  });

  const realTsId = 995;
  const realTs: TableSource = {
    id: realTsId,
    price_table_id: 1,
    site_id: realTestSiteId,
    source_page_id: 1,
    update_time_xpath: '//div[@id="real-update-date"]',
    active: true,
    recheck_enabled: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  schema.table_sources.push(realTs);

  // Product selector for real scraping assertion
  schema.product_selectors.push({
    id: 9951,
    product_id: 1,
    post_id: 1840,
    table_source_id: realTsId,
    price_xpath: '//span[@id="real-price"]',
    active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  });

  // Site Default action: an active CLICK on an element that would fail if executed
  schema.page_actions.push({
    id: 7099,
    scope: 'SITE_DEFAULT',
    site_id: realTestSiteId,
    table_source_id: null,
    order: 1,
    action_type: 'CLICK',
    selector: '//button[@id="element-that-destroys-scrape-and-does-not-exist"]',
    active: true,
    created_at: new Date().toISOString()
  });

  // TableSource Overrides: exists, but ALL are inactive
  schema.page_actions.push({
    id: 8099,
    scope: 'TABLE_SOURCE',
    site_id: realTestSiteId,
    table_source_id: realTsId,
    order: 1,
    action_type: 'WAIT',
    value: '100',
    active: false,
    created_at: new Date().toISOString()
  });

  // Mock preloaded HTML that contains valid today date and product price
  const testPreloadedHtml = `<!DOCTYPE html>
  <html>
    <head><meta charset="utf-8"><title>Test Page</title></head>
    <body>
      <div id="real-update-date">امروز 10:00</div>
      <span id="real-price">850,000</span>
    </body>
  </html>`;

  const realScrapeResult = await scrapeTableSource(realTs, 9999, testPreloadedHtml);

  // Assertions for real production integration test
  const realScrapeSucceeded =
    realScrapeResult.success &&
    realScrapeResult.fresh &&
    realScrapeResult.products.length === 1 &&
    realScrapeResult.products[0].parsed_price === 850000 &&
    !realScrapeResult.structuredErrors.some((e) => e.type === 'PAGE_ACTION_FAILED');

  assertFn(
    realScrapeSucceeded,
    'real scrapeTableSource inactive override test: Site Default CLICK was NOT run and scraping completed successfully'
  );

  // 6. Cascade Delete Integration Test
  const cascadeTsId = db.getNextId('table_sources');
  schema.table_sources.push({
    id: cascadeTsId,
    price_table_id: 1,
    site_id: testSiteId,
    source_page_id: 1,
    active: true,
    recheck_enabled: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  } as TableSource);

  const act1Id = db.getNextId('page_actions');
  schema.page_actions.push({
    id: act1Id,
    scope: 'TABLE_SOURCE',
    table_source_id: cascadeTsId,
    site_id: testSiteId,
    order: 1,
    action_type: 'WAIT',
    value: '1000',
    active: true,
    created_at: new Date().toISOString()
  });

  const act2Id = db.getNextId('page_actions');
  schema.page_actions.push({
    id: act2Id,
    scope: 'TABLE_SOURCE',
    table_source_id: cascadeTsId,
    site_id: testSiteId,
    order: 2,
    action_type: 'CLICK',
    selector: '//button',
    active: true,
    created_at: new Date().toISOString()
  });

  const selCascadeId = db.getNextId('product_selectors');
  schema.product_selectors.push({
    id: selCascadeId,
    product_id: 1,
    post_id: 1840,
    table_source_id: cascadeTsId,
    price_xpath: '//td[1]',
    active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  });
  db.save();

  const delTsRes = await request(app).delete(`/api/table-sources/${cascadeTsId}`);
  assertFn(delTsRes.status === 200, 'DELETE /api/table-sources/:id returns 200');

  const tsStillExists = db.getSchema().table_sources.some((s) => s.id === cascadeTsId);
  const selStillExists = db.getSchema().product_selectors.some((s) => s.table_source_id === cascadeTsId);
  const actionsStillExist = db.getSchema().page_actions.some((a) => a.table_source_id === cascadeTsId && a.scope === 'TABLE_SOURCE');
  assertFn(!tsStillExists, 'TableSource delete cascades actions: TableSource deleted');
  assertFn(!selStillExists, 'TableSource delete cascades actions: ProductSelectors deleted');
  assertFn(!actionsStillExist, 'TableSource delete cascades actions: TABLE_SOURCE PageActions cascaded and deleted');

  // 7. Strict Page Action Ownership Validation
  // Attempt to edit a SITE_DEFAULT action using the wrong siteId => 404
  const badSitePut = await request(app)
    .put(`/api/sites/99999/page-actions/7001`)
    .send({ value: '2000' });
  assertFn(badSitePut.status === 404, 'strict site action ownership: PUT /api/sites/:wrongSiteId/page-actions/:id returns 404');

  // Attempt to edit a TABLE_SOURCE action using site endpoint => 404
  const crossScopePut = await request(app)
    .put(`/api/sites/${testSiteId}/page-actions/8001`)
    .send({ value: '2000' });
  assertFn(crossScopePut.status === 404, 'strict site action ownership: Cannot update TABLE_SOURCE action through site endpoint');

  // Attempt to edit a SITE_DEFAULT action using table-source endpoint => 404
  const crossScopeSourcePut = await request(app)
    .put(`/api/table-sources/${testTableSourceIdWithOverride}/page-actions/7001`)
    .send({ value: '2000' });
  assertFn(crossScopeSourcePut.status === 404, 'strict table-source action ownership: Cannot update SITE_DEFAULT action through table-sources endpoint');

  // Attempt to delete with wrong siteId or wrong table_source_id => 404
  const badSiteDel = await request(app).delete(`/api/sites/99999/page-actions/7001`);
  assertFn(badSiteDel.status === 404, 'strict site action ownership: DELETE /api/sites/:wrongSiteId/page-actions/:id returns 404');

  const badSourceDel = await request(app).delete(`/api/table-sources/99999/page-actions/8001`);
  assertFn(badSourceDel.status === 404, 'strict table-source action ownership: DELETE /api/table-sources/:wrongSourceId/page-actions/:id returns 404');

  // Valid PUT to SITE_DEFAULT
  const validSitePut = await request(app)
    .put(`/api/sites/${testSiteId}/page-actions/7001`)
    .send({ value: '1500' });
  assertFn(validSitePut.status === 200 && validSitePut.body.value === '1500', 'strict site action ownership: Valid update to SITE_DEFAULT page action succeeds');

  // Valid PUT to TABLE_SOURCE
  const validSourcePut = await request(app)
    .put(`/api/table-sources/${testTableSourceIdWithOverride}/page-actions/8001`)
    .send({ selector: '//button[@id="new-btn"]' });
  assertFn(validSourcePut.status === 200 && validSourcePut.body.selector === '//button[@id="new-btn"]', 'strict table-source action ownership: Valid update to TABLE_SOURCE page action succeeds');

  // 8. Legacy Endpoint Bypass Protection (Requirement #1)
  // Attempt to delete SITE_DEFAULT action via generic DELETE /api/page-actions/:id => 403
  const legacyDelSiteAction = await request(app).delete(`/api/page-actions/7001`);
  const siteActionStillPresent = db.getSchema().page_actions.some((a) => a.id === 7001);
  assertFn(
    legacyDelSiteAction.status === 403 && siteActionStillPresent,
    'legacy endpoint cannot bypass SITE_DEFAULT ownership: generic DELETE rejected with 403 and action preserved'
  );

  // Attempt to delete TABLE_SOURCE action via generic DELETE /api/page-actions/:id => 403
  const legacyDelSourceAction = await request(app).delete(`/api/page-actions/8001`);
  const sourceActionStillPresent = db.getSchema().page_actions.some((a) => a.id === 8001);
  assertFn(
    legacyDelSourceAction.status === 403 && sourceActionStillPresent,
    'legacy endpoint cannot bypass TABLE_SOURCE ownership: generic DELETE rejected with 403 and action preserved'
  );

  // Attempt to update scoped action via generic PUT /api/page-actions/:id => 403
  const legacyPutAction = await request(app).put(`/api/page-actions/7001`).send({ value: '9999' });
  assertFn(legacyPutAction.status === 403, 'legacy endpoint cannot bypass SITE_DEFAULT ownership: generic PUT rejected with 403');

  // Attempt to create scoped action via generic POST /api/page-actions => 403
  const legacyPostSiteAction = await request(app).post(`/api/page-actions`).send({
    scope: 'SITE_DEFAULT',
    site_id: testSiteId,
    action_type: 'WAIT',
    value: '500'
  });
  assertFn(legacyPostSiteAction.status === 403, 'legacy endpoint cannot bypass SITE_DEFAULT ownership: generic POST rejected with 403');

  const legacyPostSourceAction = await request(app).post(`/api/page-actions`).send({
    scope: 'TABLE_SOURCE',
    table_source_id: testTableSourceIdWithOverride,
    action_type: 'WAIT',
    value: '500'
  });
  assertFn(legacyPostSourceAction.status === 403, 'legacy endpoint cannot bypass TABLE_SOURCE ownership: generic POST rejected with 403');

  // 9. Synchronize TABLE_SOURCE action site_id metadata when Source Site changes (Requirement #3)
  const syncTestSite1 = 1;
  const syncTestSite2 = 2;
  const syncSourceId = db.getNextId('table_sources');
  schema.table_sources.push({
    id: syncSourceId,
    price_table_id: 1,
    site_id: syncTestSite1,
    source_page_id: 1,
    active: true,
    recheck_enabled: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  } as TableSource);

  const syncActionId1 = db.getNextId('page_actions');
  const syncActionId2 = db.getNextId('page_actions');
  schema.page_actions.push({
    id: syncActionId1,
    scope: 'TABLE_SOURCE',
    table_source_id: syncSourceId,
    site_id: syncTestSite1,
    order: 1,
    action_type: 'WAIT',
    value: '1000',
    active: true,
    created_at: new Date().toISOString()
  });
  schema.page_actions.push({
    id: syncActionId2,
    scope: 'TABLE_SOURCE',
    table_source_id: syncSourceId,
    site_id: syncTestSite1,
    order: 2,
    action_type: 'CLICK',
    selector: '//div',
    active: false,
    created_at: new Date().toISOString()
  });
  db.save();

  // Change site_id to site 2 via PUT /api/table-sources/:id
  const putSyncRes = await request(app).put(`/api/table-sources/${syncSourceId}`).send({
    site_id: syncTestSite2
  });
  assertFn(putSyncRes.status === 200, 'PUT /api/table-sources/:id to change site_id returns 200');

  const updatedSyncActions = db.getSchema().page_actions.filter((a) => a.table_source_id === syncSourceId);
  const allSynced = updatedSyncActions.length === 2 && updatedSyncActions.every((a) => a.site_id === syncTestSite2);
  assertFn(allSynced, 'TABLE_SOURCE action site_id metadata updates after source site change: all actions have new site_id');

  // Clean up sync test items
  schema.table_sources = schema.table_sources.filter((s) => s.id !== syncSourceId);
  schema.page_actions = schema.page_actions.filter((a) => a.table_source_id !== syncSourceId);

  // 10. Site Default Preview Uses Newly Selected Site (Requirement #3)
  // Given site 1 and site 2, each has distinct default actions
  const site1Defaults = getSiteDefaultPageActions(1);
  const site2Defaults = getSiteDefaultPageActions(2);
  const newlySelectedSiteDefaults = getSiteDefaultPageActions(syncTestSite2);
  assertFn(
    Array.isArray(newlySelectedSiteDefaults) &&
      newlySelectedSiteDefaults.length === site2Defaults.length &&
      JSON.stringify(newlySelectedSiteDefaults.map((a) => a.id)) === JSON.stringify(site2Defaults.map((a) => a.id)),
    'Site Default preview uses newly selected site: getSiteDefaultPageActions for new site resolves its default actions'
  );

  // 11. Editable Site inside TableSource
  const tsToEdit = schema.table_sources.find((s) => s.id === testTableSourceIdWithoutOverride)!;
  const newSiteId = 2; // Site 2 in seed database

  const updateSiteRes = await request(app)
    .put(`/api/table-sources/${tsToEdit.id}`)
    .send({
      site_id: newSiteId,
      url: 'http://localhost:3000/fixtures/source-b-new-section.html',
      update_time_xpath: '//div[@id="new-date"]'
    });
  assertFn(updateSiteRes.status === 200, 'existing editable site inside TableSource: PUT returns 200');
  assertFn(updateSiteRes.body.site_id === newSiteId, 'existing editable site inside TableSource: TableSource site_id updated to new site');
  const updatedPage = db.getSchema().source_pages.find((p) => p.id === updateSiteRes.body.source_page_id);
  assertFn(updatedPage?.site_id === newSiteId, 'existing editable site inside TableSource: SourcePage associated with new site_id');

  // Cleanup test additions
  schema.sites = schema.sites.filter((s) => s.id !== testSiteId && s.id !== emptySiteId && s.id !== realTestSiteId);
  schema.table_sources = schema.table_sources.filter(
    (ts) =>
      ts.id !== testTableSourceIdWithoutOverride &&
      ts.id !== testTableSourceIdWithOverride &&
      ts.id !== testTableSourceIdAllInactive &&
      ts.id !== emptyTsId &&
      ts.id !== realTsId
  );
  schema.product_selectors = schema.product_selectors.filter((sel) => sel.id !== 9951);
  schema.page_actions = schema.page_actions.filter((a) => a.site_id !== testSiteId && a.site_id !== realTestSiteId);
  db.save();
}

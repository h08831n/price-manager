// Express REST API Routes for Price Collector & WordPress Sync System
import express, { Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { db } from '../db/database';
import { executePriceTable } from '../engine/tableExecution';
import { extractXPathFromHtml } from '../scraper/xpathExtractor';
import { fetchHtmlForUrl } from '../scraper/engine';
import { evaluateFreshness } from '../scraper/freshness';
import { parseProductPrice } from '../scraper/priceParser';
import { injectPickerScript } from '../scraper/picker';
import { excelService } from '../excel/excelService';
import { publishTableToWordPress } from '../wordpress/client';
import { FIXTURE_PAGES } from '../fixtures/fixtures';
import { loadSourcePage } from '../scraper/pageLoader';
import { DashboardData, Site } from '../../src/types';

export const apiRouter = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// ==========================================
// 1. DASHBOARD API (Requirement #41-#45, #71)
// ==========================================
apiRouter.get('/dashboard', (req: Request, res: Response) => {
  const schema = db.getSchema();
  const todayStr = new Date().toISOString().split('T')[0];

  const openErrors = schema.errors.filter((e) => e.status === 'OPEN');
  const runningJobs = schema.runs.filter((r) => r.status === 'RUNNING');

  const totalTables = schema.price_tables.filter((t) => t.active).length;
  const completedTables = schema.daily_table_runs.filter(
    (d) => d.run_date === todayStr && d.status === 'COMPLETED'
  ).length;

  const blockedPricesToday = schema.price_records.filter(
    (pr) => pr.status === 'BLOCKED_BY_PRICE_GUARD' && pr.extracted_at.startsWith(todayStr)
  ).length;

  const failedSourcesToday = schema.daily_source_runs.filter(
    (ds) => ds.run_date === todayStr && ds.status === 'FAILED'
  ).length;

  const activeSources = schema.table_sources.filter((s) => s.active);
  const pendingSources = activeSources.filter((source) => {
    const ds = schema.daily_source_runs.find(
      (d) => d.table_source_id === source.id && d.run_date === todayStr
    );
    if (!ds) return true;
    return ds.status === 'PENDING' || ds.status === 'NOT_UPDATED';
  });

  const lastRevision = schema.table_revisions
    .filter((r) => r.wordpress_status === 'SUCCESS' || r.wordpress_status === 'FAILED')
    .sort((a, b) => new Date(b.calculated_at).getTime() - new Date(a.calculated_at).getTime())[0];

  const pendingUpdates = schema.price_tables
    .filter((t) => t.active)
    .map((table) => {
      const pSources = schema.table_sources.filter((ts) => ts.price_table_id === table.id && ts.active);
      const remaining = pSources.filter((source) => {
        const ds = schema.daily_source_runs.find(
          (d) => d.price_table_id === table.id && d.table_source_id === source.id && d.run_date === todayStr
        );
        return !ds || ds.status === 'PENDING' || ds.status === 'NOT_UPDATED';
      });

      const dailyRun = schema.daily_table_runs.find(
        (d) => d.price_table_id === table.id && d.run_date === todayStr
      );

      return {
        price_table_id: table.id,
        price_table_name: table.name,
        pending_sources_count: remaining.length,
        next_run_at: table.start_time,
        attempt_number: dailyRun?.attempt_count || 1,
        max_attempts: table.max_attempts
      };
    })
    .filter((p) => p.pending_sources_count > 0);

  const dashboardData: DashboardData = {
    open_errors_count: openErrors.length,
    running_jobs_count: runningJobs.length,
    pending_sources_count: pendingSources.length,
    completed_tables_today: completedTables,
    total_tables_today: totalTables,
    blocked_prices_today: blockedPricesToday,
    failed_sources_today: failedSourcesToday,
    last_wordpress_publish: lastRevision
      ? {
          table_name: lastRevision.price_table_name || 'جدول قیمت',
          published_at: lastRevision.published_at || lastRevision.calculated_at,
          products_count: lastRevision.items?.length || 0,
          status: lastRevision.wordpress_status === 'SUCCESS' ? 'SUCCESS' : 'FAILED',
          message: lastRevision.wordpress_status === 'SUCCESS' ? 'ارسال با موفقیت انجام شد' : 'خطا در ارتباط با وردپرس'
        }
      : null,
    recent_errors: openErrors.slice(0, 8),
    active_runs: runningJobs.slice(0, 5),
    pending_updates: pendingUpdates.slice(0, 5)
  };

  res.json(dashboardData);
});

// ==========================================
// 2. PRODUCTS API (Requirement #3, #4, #48)
// ==========================================
apiRouter.get('/products', (req: Request, res: Response) => {
  const schema = db.getSchema();
  const search = String(req.query.search || '').trim().toLowerCase();
  const tableId = req.query.price_table_id ? parseInt(String(req.query.price_table_id), 10) : null;
  const factoryId = req.query.factory_id ? parseInt(String(req.query.factory_id), 10) : null;

  let list = schema.products;
  if (tableId) list = list.filter((p) => p.price_table_id === tableId);
  if (factoryId) list = list.filter((p) => p.factory_id === factoryId);

  if (search) {
    list = list.filter(
      (p) =>
        p.name.toLowerCase().includes(search) ||
        String(p.post_id).includes(search) ||
        (p.sku && p.sku.toLowerCase().includes(search))
    );
  }

  // Join table and factory names
  const enriched = list.map((p) => {
    const f = schema.factories.find((fac) => fac.id === p.factory_id);
    const t = schema.price_tables.find((tbl) => tbl.id === p.price_table_id);
    return {
      ...p,
      factory_name: f?.name,
      price_table_name: t?.name
    };
  });

  res.json(enriched);
});

apiRouter.post('/products', (req: Request, res: Response) => {
  const schema = db.getSchema();
  const { post_id, name, sku, factory_id, price_table_id, current_price, active, attributes } = req.body;

  if (!post_id || isNaN(parseInt(post_id, 10))) {
    return res.status(400).json({ error: 'شناسه post_id ووکامرس الزامی است.' });
  }

  const existing = schema.products.find((p) => p.post_id === parseInt(post_id, 10));
  if (existing) {
    return res.status(400).json({ error: `محصولی با post_id = ${post_id} از قبل در سیستم وجود دارد.` });
  }

  const newProd = {
    id: db.getNextId('products'),
    post_id: parseInt(post_id, 10),
    name: name || `محصول ${post_id}`,
    sku: sku || '',
    factory_id: parseInt(factory_id, 10) || 1,
    price_table_id: parseInt(price_table_id, 10) || 1,
    current_price: parseFloat(current_price) || 0,
    active: active !== undefined ? Boolean(active) : true,
    attributes: attributes || {},
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  schema.products.push(newProd);
  db.logConfigChange('product', newProd.id, 'create', null, newProd.name);
  db.save();
  res.json(newProd);
});

apiRouter.put('/products/:id', (req: Request, res: Response) => {
  const schema = db.getSchema();
  const id = parseInt(req.params.id, 10);
  const prod = schema.products.find((p) => p.id === id);
  if (!prod) return res.status(404).json({ error: 'محصول یافت نشد.' });

  const { name, sku, factory_id, price_table_id, current_price, active, attributes } = req.body;
  if (name !== undefined) prod.name = name;
  if (sku !== undefined) prod.sku = sku;
  if (factory_id !== undefined) prod.factory_id = parseInt(factory_id, 10);
  if (price_table_id !== undefined) prod.price_table_id = parseInt(price_table_id, 10);
  if (current_price !== undefined) prod.current_price = parseFloat(current_price);
  if (active !== undefined) prod.active = Boolean(active);
  if (attributes !== undefined) prod.attributes = attributes;
  prod.updated_at = new Date().toISOString();

  db.logConfigChange('product', prod.id, 'update', null, prod.name);
  db.save();
  res.json(prod);
});

// ==========================================
// 3. FACTORIES API (Requirement #49)
// ==========================================
apiRouter.get('/factories', (req: Request, res: Response) => {
  const schema = db.getSchema();
  const enriched = schema.factories.map((f) => ({
    ...f,
    table_count: schema.price_tables.filter((t) => t.factory_id === f.id).length,
    product_count: schema.products.filter((p) => p.factory_id === f.id).length
  }));
  res.json(enriched);
});

apiRouter.post('/factories', (req: Request, res: Response) => {
  const schema = db.getSchema();
  const { name, active } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'نام کارخانه الزامی است.' });

  const newFac = {
    id: db.getNextId('factories'),
    name: name.trim(),
    active: active !== undefined ? Boolean(active) : true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  schema.factories.push(newFac);
  db.logConfigChange('factory', newFac.id, 'create', null, newFac.name);
  db.save();
  res.json(newFac);
});

apiRouter.put('/factories/:id', (req: Request, res: Response) => {
  const schema = db.getSchema();
  const id = parseInt(req.params.id, 10);
  const fac = schema.factories.find((f) => f.id === id);
  if (!fac) return res.status(404).json({ error: 'کارخانه یافت نشد.' });

  if (req.body.name !== undefined) fac.name = req.body.name.trim();
  if (req.body.active !== undefined) fac.active = Boolean(req.body.active);
  fac.updated_at = new Date().toISOString();

  db.logConfigChange('factory', fac.id, 'update', null, fac.name);
  db.save();
  res.json(fac);
});

// ==========================================
// 4. PRICE TABLES API (Requirement #8, #50)
// ==========================================
apiRouter.get('/price-tables', (req: Request, res: Response) => {
  const schema = db.getSchema();
  const todayStr = new Date().toISOString().split('T')[0];

  const enriched = schema.price_tables.map((t) => {
    const f = schema.factories.find((fac) => fac.id === t.factory_id);
    const sourceCount = schema.table_sources.filter((s) => s.price_table_id === t.id).length;
    const productCount = schema.products.filter((p) => p.price_table_id === t.id).length;
    const daily = schema.daily_table_runs.find(
      (d) => d.price_table_id === t.id && d.run_date === todayStr
    );

    return {
      ...t,
      factory_name: f?.name,
      source_count: sourceCount,
      product_count: productCount,
      today_status: daily?.status || 'PENDING'
    };
  });
  res.json(enriched);
});

apiRouter.post('/price-tables', (req: Request, res: Response) => {
  const schema = db.getSchema();
  const { name, factory_id, start_time, retry_interval_minutes, max_attempts, price_guard_percent, active } = req.body;

  if (!name || !name.trim()) return res.status(400).json({ error: 'نام جدول قیمت الزامی است.' });

  const newTable = {
    id: db.getNextId('price_tables'),
    name: name.trim(),
    factory_id: parseInt(factory_id, 10) || 1,
    start_time: start_time || '11:00',
    retry_interval_minutes: parseInt(retry_interval_minutes, 10) || 30,
    max_attempts: parseInt(max_attempts, 10) || 5,
    price_guard_percent: parseFloat(price_guard_percent) || 30,
    active: active !== undefined ? Boolean(active) : true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  schema.price_tables.push(newTable);
  db.logConfigChange('price_table', newTable.id, 'create', null, newTable.name);
  db.save();
  res.json(newTable);
});

apiRouter.put('/price-tables/:id', (req: Request, res: Response) => {
  const schema = db.getSchema();
  const id = parseInt(req.params.id, 10);
  const table = schema.price_tables.find((t) => t.id === id);
  if (!table) return res.status(404).json({ error: 'جدول قیمت یافت نشد.' });

  if (req.body.name !== undefined) table.name = req.body.name.trim();
  if (req.body.factory_id !== undefined) table.factory_id = parseInt(req.body.factory_id, 10);
  if (req.body.start_time !== undefined) table.start_time = req.body.start_time;
  if (req.body.retry_interval_minutes !== undefined) table.retry_interval_minutes = parseInt(req.body.retry_interval_minutes, 10);
  if (req.body.max_attempts !== undefined) table.max_attempts = parseInt(req.body.max_attempts, 10);
  if (req.body.price_guard_percent !== undefined) table.price_guard_percent = parseFloat(req.body.price_guard_percent);
  if (req.body.active !== undefined) table.active = Boolean(req.body.active);
  table.updated_at = new Date().toISOString();

  db.logConfigChange('price_table', table.id, 'update', null, table.name);
  db.save();
  res.json(table);
});

// Manual Run of Entire Table (Requirement #30, #50)
apiRouter.post('/price-tables/:id/run', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  try {
    const run = await executePriceTable(id, { triggerType: 'MANUAL_TABLE' });
    res.json({ success: true, run });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// 5. SITES & SOURCE PAGES (Requirement #9, #10)
// ==========================================
apiRouter.get('/sites', (req: Request, res: Response) => {
  const schema = db.getSchema();
  const enriched = schema.sites.map((s) => ({
    ...s,
    page_count: schema.source_pages.filter((p) => p.site_id === s.id).length
  }));
  res.json(enriched);
});

apiRouter.post('/sites', (req: Request, res: Response) => {
  const schema = db.getSchema();
  const { name, base_url, scrape_method, browser, timeout, wait_after_load, active } = req.body;
  if (!name || !base_url) return res.status(400).json({ error: 'نام و آدرس پایه سایت الزامی است.' });

  const newSite = {
    id: db.getNextId('sites'),
    name: name.trim(),
    base_url: base_url.trim(),
    scrape_method: (scrape_method === 'PLAYWRIGHT' ? 'PLAYWRIGHT' : 'FETCH') as any,
    browser: (browser || 'Chromium') as any,
    timeout: parseInt(timeout, 10) || 30,
    wait_after_load: parseInt(wait_after_load, 10) || 1000,
    active: active !== undefined ? Boolean(active) : true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  schema.sites.push(newSite);
  db.logConfigChange('site', newSite.id, 'create', null, newSite.name);
  db.save();
  res.json(newSite);
});

apiRouter.put('/sites/:id', (req: Request, res: Response) => {
  const schema = db.getSchema();
  const id = parseInt(req.params.id, 10);
  const site = schema.sites.find((s) => s.id === id);
  if (!site) return res.status(404).json({ error: 'سایت یافت نشد.' });

  if (req.body.name !== undefined) site.name = req.body.name.trim();
  if (req.body.base_url !== undefined) site.base_url = req.body.base_url.trim();
  if (req.body.scrape_method !== undefined) site.scrape_method = req.body.scrape_method === 'PLAYWRIGHT' ? 'PLAYWRIGHT' : 'FETCH';
  if (req.body.browser !== undefined) site.browser = req.body.browser || 'Chromium';
  if (req.body.timeout !== undefined) site.timeout = parseInt(req.body.timeout, 10);
  if (req.body.wait_after_load !== undefined) site.wait_after_load = parseInt(req.body.wait_after_load, 10);
  if (req.body.active !== undefined) site.active = Boolean(req.body.active);
  site.updated_at = new Date().toISOString();

  db.logConfigChange('site', site.id, 'update', null, site.name);
  db.save();
  res.json(site);
});

apiRouter.get('/source-pages', (req: Request, res: Response) => {
  const schema = db.getSchema();
  const enriched = schema.source_pages.map((sp) => {
    const s = schema.sites.find((site) => site.id === sp.site_id);
    const actionsCount = schema.page_actions.filter((a) => a.source_page_id === sp.id).length;
    return {
      ...sp,
      site_name: s?.name,
      actions_count: actionsCount
    };
  });
  res.json(enriched);
});

apiRouter.post('/source-pages', (req: Request, res: Response) => {
  const schema = db.getSchema();
  const { site_id, url, active } = req.body;
  if (!site_id || !url) return res.status(400).json({ error: 'شناسه سایت و URL الزامی است.' });

  const newPage = {
    id: db.getNextId('source_pages'),
    site_id: parseInt(site_id, 10),
    url: url.trim(),
    active: active !== undefined ? Boolean(active) : true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  schema.source_pages.push(newPage);
  db.save();
  res.json(newPage);
});

// ==========================================
// 6. TABLE SOURCES API (Requirement #11, #51)
// ==========================================
apiRouter.get('/table-sources', (req: Request, res: Response) => {
  const schema = db.getSchema();
  const tableId = req.query.price_table_id ? parseInt(String(req.query.price_table_id), 10) : null;
  const todayStr = new Date().toISOString().split('T')[0];

  let list = schema.table_sources;
  if (tableId) list = list.filter((s) => s.price_table_id === tableId);

  const enriched = list.map((ts) => {
    const pt = schema.price_tables.find((t) => t.id === ts.price_table_id);
    const site = schema.sites.find((s) => s.id === ts.site_id);
    const sp = schema.source_pages.find((p) => p.id === ts.source_page_id);
    const daily = schema.daily_source_runs.find(
      (d) => d.table_source_id === ts.id && d.run_date === todayStr
    );

    return {
      ...ts,
      price_table_name: pt?.name,
      site_name: site?.name,
      source_page_url: sp?.url,
      today_status: daily?.status || 'PENDING',
      fresh: daily?.fresh || false,
      attempt_count: daily?.attempt_count || 0,
      last_check_at: daily?.last_check_at,
      last_update_text: daily?.raw_update_text
    };
  });

  res.json(enriched);
});

apiRouter.post('/table-sources', (req: Request, res: Response) => {
  const schema = db.getSchema();
  const { price_table_id, site_id, source_page_id, update_time_xpath, recheck_enabled, active } = req.body;

  const newSource = {
    id: db.getNextId('table_sources'),
    price_table_id: parseInt(price_table_id, 10),
    site_id: parseInt(site_id, 10),
    source_page_id: parseInt(source_page_id, 10),
    update_time_xpath: update_time_xpath || '',
    recheck_enabled: Boolean(recheck_enabled),
    active: active !== undefined ? Boolean(active) : true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  schema.table_sources.push(newSource);
  db.logConfigChange('table_source', newSource.id, 'create', null, `Table ${price_table_id} -> Site ${site_id}`);
  db.save();
  res.json(newSource);
});

apiRouter.put('/table-sources/:id', (req: Request, res: Response) => {
  const schema = db.getSchema();
  const id = parseInt(req.params.id, 10);
  const ts = schema.table_sources.find((s) => s.id === id);
  if (!ts) return res.status(404).json({ error: 'منبع جدول یافت نشد.' });

  if (req.body.update_time_xpath !== undefined) ts.update_time_xpath = req.body.update_time_xpath;
  if (req.body.recheck_enabled !== undefined) ts.recheck_enabled = Boolean(req.body.recheck_enabled);
  if (req.body.active !== undefined) ts.active = Boolean(req.body.active);
  if (req.body.max_attempts_override !== undefined) ts.max_attempts_override = req.body.max_attempts_override ? parseInt(req.body.max_attempts_override, 10) : null;
  if (req.body.retry_interval_override !== undefined) ts.retry_interval_override = req.body.retry_interval_override ? parseInt(req.body.retry_interval_override, 10) : null;
  if (req.body.timeout_override !== undefined) ts.timeout_override = req.body.timeout_override ? parseInt(req.body.timeout_override, 10) : null;
  if (req.body.price_guard_override !== undefined) ts.price_guard_override = req.body.price_guard_override ? parseFloat(req.body.price_guard_override) : null;
  ts.updated_at = new Date().toISOString();

  db.logConfigChange('table_source', ts.id, 'update', null, ts.update_time_xpath);
  db.save();
  res.json(ts);
});

// Manual Run of Single Source (Requirement #30, #50)
apiRouter.post('/table-sources/:id/run', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  const schema = db.getSchema();
  const source = schema.table_sources.find((s) => s.id === id);
  if (!source) return res.status(404).json({ error: 'منبع یافت نشد.' });

  try {
    const run = await executePriceTable(source.price_table_id, {
      triggerType: 'MANUAL_SOURCE',
      specificSourceId: id
    });
    res.json({ success: true, run });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// 7. PRODUCT SELECTORS & XPATH TEST (Requirement #12, #14)
// ==========================================
apiRouter.get('/selectors', (req: Request, res: Response) => {
  const schema = db.getSchema();
  const sourceId = req.query.table_source_id ? parseInt(String(req.query.table_source_id), 10) : null;

  let list = schema.product_selectors;
  if (sourceId) list = list.filter((s) => s.table_source_id === sourceId);

  const enriched = list.map((sel) => {
    const prod = schema.products.find((p) => p.id === sel.product_id);
    const ts = schema.table_sources.find((t) => t.id === sel.table_source_id);
    const site = schema.sites.find((s) => s.id === ts?.site_id);
    return {
      ...sel,
      product_name: prod?.name,
      post_id: sel.post_id || prod?.post_id,
      site_name: site?.name
    };
  });

  res.json(enriched);
});

apiRouter.post('/selectors', (req: Request, res: Response) => {
  const schema = db.getSchema();
  const { product_id, post_id, table_source_id, price_xpath, update_time_xpath, active } = req.body;

  if (!table_source_id || !price_xpath) {
    return res.status(400).json({ error: 'شناسه منبع و XPath قیمت الزامی است.' });
  }

  const newSel = {
    id: db.getNextId('product_selectors'),
    product_id: parseInt(product_id, 10),
    post_id: parseInt(post_id, 10),
    table_source_id: parseInt(table_source_id, 10),
    price_xpath: price_xpath.trim(),
    update_time_xpath: update_time_xpath ? update_time_xpath.trim() : null,
    active: active !== undefined ? Boolean(active) : true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  schema.product_selectors.push(newSel);
  db.logConfigChange('selector', newSel.id, 'create', null, newSel.price_xpath);
  db.save();
  res.json(newSel);
});

apiRouter.put('/selectors/:id', (req: Request, res: Response) => {
  const schema = db.getSchema();
  const id = parseInt(req.params.id, 10);
  const sel = schema.product_selectors.find((s) => s.id === id);
  if (!sel) return res.status(404).json({ error: 'سلکتور یافت نشد.' });

  if (req.body.price_xpath !== undefined) sel.price_xpath = req.body.price_xpath.trim();
  if (req.body.update_time_xpath !== undefined) sel.update_time_xpath = req.body.update_time_xpath ? req.body.update_time_xpath.trim() : null;
  if (req.body.active !== undefined) sel.active = Boolean(req.body.active);
  sel.updated_at = new Date().toISOString();

  db.logConfigChange('selector', sel.id, 'update', null, sel.price_xpath);
  db.save();
  res.json(sel);
});

// Upsert Product Selector for a specific Table Source + Product
apiRouter.put('/table-sources/:tableSourceId/products/:productId/selector', (req: Request, res: Response) => {
  const schema = db.getSchema();
  const tableSourceId = parseInt(req.params.tableSourceId, 10);
  const productId = parseInt(req.params.productId, 10);
  const { price_xpath, update_time_xpath, active } = req.body;

  const product = schema.products.find((p) => p.id === productId);
  if (!product) return res.status(404).json({ error: 'محصول یافت نشد.' });

  let sel = schema.product_selectors.find(
    (s) => s.table_source_id === tableSourceId && s.product_id === productId
  );

  if (sel) {
    if (price_xpath !== undefined) sel.price_xpath = (price_xpath || '').trim();
    if (update_time_xpath !== undefined) sel.update_time_xpath = update_time_xpath ? update_time_xpath.trim() : null;
    if (active !== undefined) sel.active = Boolean(active);
    sel.updated_at = new Date().toISOString();
    db.logConfigChange('selector', sel.id, 'update', null, `Selector for product ${productId}`);
  } else {
    sel = {
      id: db.getNextId('product_selectors'),
      product_id: productId,
      post_id: product.post_id,
      table_source_id: tableSourceId,
      price_xpath: (price_xpath || '').trim(),
      update_time_xpath: update_time_xpath ? update_time_xpath.trim() : null,
      active: active !== undefined ? Boolean(active) : true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    schema.product_selectors.push(sel);
    db.logConfigChange('selector', sel.id, 'create', null, `Selector for product ${productId}`);
  }

  db.save();
  res.json(sel);
});

// Immediate XPath Test (supports both PRICE and DATE test types, respecting site scrape_method)
apiRouter.post('/selectors/test', async (req: Request, res: Response) => {
  const { url, xpath, source_id, type = 'PRICE' } = req.body;
  const schema = db.getSchema();

  let targetUrl = url;
  let site: Site | undefined = undefined;

  if (source_id) {
    const ts = schema.table_sources.find((s) => s.id === parseInt(source_id, 10));
    if (ts) {
      site = schema.sites.find((s) => s.id === ts.site_id);
      const sp = schema.source_pages.find((p) => p.id === ts.source_page_id);
      if (!targetUrl) targetUrl = sp?.url || site?.base_url;
    }
  }

  if (!targetUrl || !xpath) {
    return res.status(400).json({ error: 'آدرس URL و عبارت XPath الزامی هستند.' });
  }

  const effectiveSite: Site = site || {
    id: 0,
    name: 'تست',
    base_url: targetUrl,
    scrape_method: 'FETCH',
    browser: 'Chromium',
    timeout: 20,
    wait_after_load: 1000,
    active: true,
    created_at: '',
    updated_at: ''
  };

  let loadedPage = null;
  try {
    loadedPage = await loadSourcePage(targetUrl, effectiveSite, [], 25000);
    const extraction = await loadedPage.evaluateXPath(xpath.trim());

    if (type === 'DATE') {
      const freshness = extraction.firstValue ? evaluateFreshness(extraction.firstValue) : null;
      return res.json({
        success: extraction.success && Boolean(extraction.firstValue),
        count: extraction.count,
        raw_values: extraction.values,
        first_value: extraction.firstValue,
        normalized_date: freshness?.normalized_date || null,
        normalized_time: freshness?.normalized_time || null,
        fresh: freshness?.fresh || false,
        reason: freshness?.reason || 'نامشخص',
        error: extraction.error
      });
    } else {
      // PRICE type
      const parsedPrice = extraction.firstValue ? parseProductPrice(extraction.firstValue) : null;
      return res.json({
        success: extraction.success && Boolean(parsedPrice?.valid),
        count: extraction.count,
        raw_values: extraction.values,
        first_value: extraction.firstValue,
        raw_value: parsedPrice?.raw || extraction.firstValue || '',
        parsed_price: parsedPrice?.price || 0,
        valid: parsedPrice?.valid || false,
        error: parsedPrice?.error || extraction.error
      });
    }
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  } finally {
    if (loadedPage) {
      await loadedPage.close().catch(() => {});
    }
  }
});

// ==========================================
// 8. PAGE ACTIONS API (Requirement #16)
// ==========================================
apiRouter.get('/page-actions', (req: Request, res: Response) => {
  const schema = db.getSchema();
  const pageId = req.query.source_page_id ? parseInt(String(req.query.source_page_id), 10) : null;
  let list = schema.page_actions;
  if (pageId) list = list.filter((a) => a.source_page_id === pageId);
  res.json(list.sort((a, b) => a.order - b.order));
});

apiRouter.post('/page-actions', (req: Request, res: Response) => {
  const schema = db.getSchema();
  const { source_page_id, order, action_type, selector, value, active } = req.body;

  const newAction = {
    id: db.getNextId('page_actions'),
    source_page_id: parseInt(source_page_id, 10),
    order: parseInt(order, 10) || 1,
    action_type: action_type || 'WAIT',
    selector: selector || '',
    value: value || '',
    active: active !== undefined ? Boolean(active) : true,
    created_at: new Date().toISOString()
  };

  schema.page_actions.push(newAction);
  db.save();
  res.json(newAction);
});

apiRouter.delete('/page-actions/:id', (req: Request, res: Response) => {
  const schema = db.getSchema();
  const id = parseInt(req.params.id, 10);
  schema.page_actions = schema.page_actions.filter((a) => a.id !== id);
  db.save();
  res.json({ success: true });
});

// ==========================================
// 9. INTERACTIVE XPATH PICKER (Requirement #15)
// ==========================================
apiRouter.get('/picker/inspect', async (req: Request, res: Response) => {
  const targetUrl = String(req.query.url || '');
  const siteId = req.query.site_id ? parseInt(String(req.query.site_id), 10) : null;
  if (!targetUrl) return res.status(400).send('URL is required');

  const schema = db.getSchema();
  const site = siteId ? schema.sites.find((s) => s.id === siteId) : schema.sites.find((s) => targetUrl.startsWith(s.base_url));

  const effectiveSite: Site = site || {
    id: 0,
    name: 'Picker',
    base_url: targetUrl,
    scrape_method: 'FETCH',
    browser: 'Chromium',
    timeout: 30,
    wait_after_load: 1000,
    active: true,
    created_at: '',
    updated_at: ''
  };

  let loadedPage = null;
  try {
    loadedPage = await loadSourcePage(targetUrl, effectiveSite, [], 30000);
    const rawHtml = loadedPage.content;
    const injected = injectPickerScript(rawHtml);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(injected);
  } catch (err: any) {
    res.status(500).send(`Error loading page: ${err.message}`);
  } finally {
    if (loadedPage) {
      await loadedPage.close().catch(() => {});
    }
  }
});

// ==========================================
// 10. ERROR CENTER & TROUBLESHOOTING (Requirement #33-#36, #46, #59)
// ==========================================
apiRouter.get('/errors', (req: Request, res: Response) => {
  const schema = db.getSchema();
  const status = req.query.status as string;
  const tableId = req.query.price_table_id ? parseInt(String(req.query.price_table_id), 10) : null;
  const errorType = req.query.error_type as string;

  let list = schema.errors;
  if (status && status !== 'ALL') list = list.filter((e) => e.status === status);
  if (tableId) list = list.filter((e) => e.price_table_id === tableId);
  if (errorType) list = list.filter((e) => e.error_type === errorType);

  const enriched = list.map((e) => {
    const pt = schema.price_tables.find((t) => t.id === e.price_table_id);
    const prod = schema.products.find((p) => p.id === e.product_id);
    const site = schema.sites.find((s) => s.id === e.site_id);
    return {
      ...e,
      price_table_name: pt?.name,
      product_name: prod?.name,
      site_name: site?.name
    };
  });

  res.json(enriched);
});

apiRouter.post('/errors/:id/resolve', (req: Request, res: Response) => {
  const schema = db.getSchema();
  const id = parseInt(req.params.id, 10);
  const err = schema.errors.find((e) => e.id === id);
  if (!err) return res.status(404).json({ error: 'خطا یافت نشد.' });

  err.status = 'RESOLVED';
  err.resolved_at = new Date().toISOString();
  db.save();
  res.json(err);
});

apiRouter.post('/errors/:id/ignore', (req: Request, res: Response) => {
  const schema = db.getSchema();
  const id = parseInt(req.params.id, 10);
  const err = schema.errors.find((e) => e.id === id);
  if (!err) return res.status(404).json({ error: 'خطا یافت نشد.' });

  err.status = 'IGNORED';
  db.save();
  res.json(err);
});

// Retry affected source directly from Error Center (Requirement #33, #59)
apiRouter.post('/errors/:id/retry', async (req: Request, res: Response) => {
  const schema = db.getSchema();
  const id = parseInt(req.params.id, 10);
  const err = schema.errors.find((e) => e.id === id);
  if (!err) return res.status(404).json({ error: 'خطا یافت نشد.' });

  if (!err.price_table_id) {
    return res.status(400).json({ error: 'جدول قیمت مرتبط با این خطا مشخص نیست.' });
  }

  err.status = 'RETRYING';
  db.save();

  try {
    const run = await executePriceTable(err.price_table_id, {
      triggerType: 'MANUAL_TABLE'
    });

    err.status = 'RESOLVED';
    err.resolved_at = new Date().toISOString();
    db.save();

    res.json({ success: true, run });
  } catch (retryErr: any) {
    err.status = 'OPEN';
    db.save();
    res.status(500).json({ success: false, error: retryErr.message });
  }
});

// ==========================================
// 11. RUNS & LOGS (Requirement #32, #37)
// ==========================================
apiRouter.get('/runs', (req: Request, res: Response) => {
  const schema = db.getSchema();
  res.json(schema.runs.slice(0, 100));
});

apiRouter.get('/logs', (req: Request, res: Response) => {
  const schema = db.getSchema();
  const level = req.query.level as string;
  let list = schema.logs;
  if (level && level !== 'ALL') list = list.filter((l) => l.level === level);
  res.json(list.slice(0, 300));
});

apiRouter.get('/history/config', (req: Request, res: Response) => {
  const schema = db.getSchema();
  res.json(schema.config_history.slice(0, 200));
});

apiRouter.get('/history/import', (req: Request, res: Response) => {
  const schema = db.getSchema();
  res.json(schema.import_history.slice(0, 100));
});

apiRouter.get('/price-changes', (req: Request, res: Response) => {
  const schema = db.getSchema();
  res.json(schema.price_changes.slice(0, 200));
});

apiRouter.get('/table-revisions', (req: Request, res: Response) => {
  const schema = db.getSchema();
  res.json(schema.table_revisions.slice(0, 50));
});

// Retry WordPress publishing without re-scraping (Requirement #58)
apiRouter.post('/wordpress/retry-publish/:revisionId', async (req: Request, res: Response) => {
  const schema = db.getSchema();
  const revisionId = parseInt(req.params.revisionId, 10);
  const revision = schema.table_revisions.find((r) => r.id === revisionId);

  if (!revision) {
    return res.status(404).json({ error: 'نسخه جدول یافت نشد.' });
  }

  const items = schema.table_revision_items.filter((item) => item.table_revision_id === revision.id);
  const payload = items
    .filter((item) => !item.is_blocked_by_price_guard && item.calculated_price > 0)
    .map((item) => ({
      post_id: item.post_id,
      price: item.calculated_price
    }));

  try {
    const wpRes = await publishTableToWordPress(revision.price_table_id, payload);
    revision.wordpress_status = wpRes.success ? 'SUCCESS' : 'FAILED';
    revision.wordpress_response = wpRes;
    revision.published_at = new Date().toISOString();

    if (wpRes.success) {
      for (const p of payload) {
        const prod = schema.products.find((prod) => prod.post_id === p.post_id);
        if (prod) {
          prod.previous_price = prod.current_price;
          prod.current_price = p.price;
        }
      }
    }
    db.save();
    res.json({ success: true, wpRes });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// 12. EXCEL IMPORT / EXPORT (Requirement #6, #68, #69)
// ==========================================
apiRouter.get('/excel/template/:entity', async (req: Request, res: Response) => {
  const entity = req.params.entity;
  try {
    const buffer = await excelService.generateTemplate(entity);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="template_${entity}.xlsx"`);
    res.send(buffer);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.get('/excel/export/:entity', async (req: Request, res: Response) => {
  const entity = req.params.entity;
  try {
    const buffer = await excelService.exportData(entity);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="export_${entity}.xlsx"`);
    res.send(buffer);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/excel/preview/:entity', upload.single('file'), async (req: Request, res: Response) => {
  const entity = req.params.entity;
  if (!req.file) {
    return res.status(400).json({ error: 'هیچ فایلی آپلود نشده است.' });
  }

  try {
    const preview = await excelService.previewImport(req.file.buffer, entity, req.file.originalname);
    res.json(preview);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/excel/apply', (req: Request, res: Response) => {
  const preview = req.body;
  if (!preview || !preview.entity_type) {
    return res.status(400).json({ error: 'اطلاعات پیش‌نمایش معتبر نیست.' });
  }

  try {
    excelService.applyImport(preview);
    res.json({ success: true, message: 'تغییرات با موفقیت در پایگاه داده اعمال گردید.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 13. GLOBAL SETTINGS (Requirement #7)
// ==========================================
apiRouter.get('/settings', (req: Request, res: Response) => {
  const schema = db.getSchema();
  res.json(schema.global_settings);
});

apiRouter.post('/settings', (req: Request, res: Response) => {
  const schema = db.getSchema();
  schema.global_settings = {
    ...schema.global_settings,
    ...req.body
  };
  db.logConfigChange('settings', 1, 'update', null, 'Global Settings Updated');
  db.save();
  res.json(schema.global_settings);
});

// ==========================================
// 14. SNAPSHOTS & SCREENSHOTS (Requirement #35, #36)
// ==========================================
const SNAPSHOTS_DIR = path.join(process.cwd(), 'data', 'snapshots');
const SCREENSHOTS_DIR = path.join(process.cwd(), 'data', 'screenshots');

apiRouter.get('/snapshots/:filename', (req: Request, res: Response) => {
  const filePath = path.join(SNAPSHOTS_DIR, path.basename(req.params.filename));
  if (fs.existsSync(filePath)) {
    res.sendFile(filePath);
  } else {
    res.status(404).send('HTML Snapshot not found');
  }
});

apiRouter.get('/screenshots/:filename', (req: Request, res: Response) => {
  const filePath = path.join(SCREENSHOTS_DIR, path.basename(req.params.filename));
  if (fs.existsSync(filePath)) {
    res.setHeader('Content-Type', 'image/svg+xml');
    res.sendFile(filePath);
  } else {
    res.status(404).send('Screenshot not found');
  }
});

// Mock WordPress Endpoint for local testing & live verification
apiRouter.post('/mock-wordpress/wp-json/price-system/v1/bulk-update', (req: Request, res: Response) => {
  const { price_table_id, products } = req.body;
  const items = (products || []).map((p: any) => ({
    post_id: p.post_id,
    new_price: p.price,
    success: true
  }));

  res.json({
    success: true,
    price_table_id,
    updated: items.length,
    failed: 0,
    items
  });
});

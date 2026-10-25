// Express REST API Routes for Price Collector & WordPress Sync System
import express, { Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { db } from '../db/database';
import { executePriceTable, recalculateProductPrices, resolveProductsForTable } from '../engine/tableExecution';
import { extractXPathFromHtml } from '../scraper/xpathExtractor';
import { fetchHtmlForUrl } from '../scraper/engine';
import { evaluateFreshness } from '../scraper/freshness';
import { parseProductPrice } from '../scraper/priceParser';
import { injectPickerScript } from '../scraper/picker';
import {
  getCachedPickerPage,
  saveCachedPickerPage,
  invalidatePickerCache
} from '../scraper/pickerCache';
import {
  publishTableToWordPress,
  syncFactoriesToDestination,
  syncPriceTablesToDestination,
  syncProductsToDestination,
  testWordPressConnection,
  pullDataFromDestination
} from '../wordpress/client';
import { excelService } from '../excel/excelService';
import { FIXTURE_PAGES } from '../fixtures/fixtures';
import { loadSourcePage } from '../scraper/pageLoader';
import {
  resolveEffectivePageActions,
  getSiteDefaultPageActions,
  getTableSourcePageActionsInfo
} from '../scraper/pageActions';
import { DashboardData, Site, PageAction } from '../../src/types';

export const apiRouter = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// In-memory active session tokens
const activeSessions = new Set<string>();

function getAdminPassword(): string {
  const schema = db.getSchema();
  return (
    schema.global_settings?.admin_password ||
    process.env.ADMIN_PASSWORD ||
    'admin123'
  );
}

// ==========================================
// 0. AUTHENTICATION API
// ==========================================
apiRouter.post('/auth/login', (req: Request, res: Response) => {
  const { password } = req.body;
  const configuredPassword = getAdminPassword();

  if (!password || String(password).trim() !== configuredPassword) {
    return res.status(401).json({
      success: false,
      error: 'رمز عبور وارد شده اشتباه است.'
    });
  }

  const token = `tok_${Date.now()}_${Math.random().toString(36).substring(2, 12)}`;
  activeSessions.add(token);

  res.json({
    success: true,
    token,
    user: 'مدیر سامانه',
    message: 'ورود موفقیت‌آمیز بود.'
  });
});

apiRouter.get('/auth/verify', (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : (req.query.token as string);

  if (token && activeSessions.has(token)) {
    return res.json({ authenticated: true, user: 'مدیر سامانه' });
  }

  res.status(401).json({ authenticated: false, error: 'نشست کاربری نامعتبر است یا منقضی شده است.' });
});

apiRouter.post('/auth/change-password', (req: Request, res: Response) => {
  const { current_password, new_password } = req.body;
  const configuredPassword = getAdminPassword();

  if (!current_password || String(current_password).trim() !== configuredPassword) {
    return res.status(400).json({ success: false, error: 'رمز عبور فعلی اشتباه است.' });
  }

  if (!new_password || String(new_password).trim().length < 4) {
    return res.status(400).json({ success: false, error: 'رمز عبور جدید باید حداقل ۴ کاراکتر باشد.' });
  }

  const schema = db.getSchema();
  if (!schema.global_settings) {
    schema.global_settings = {} as any;
  }
  const newPassStr = String(new_password).trim();
  schema.global_settings.admin_password = newPassStr;
  db.saveSecrets({ admin_password: newPassStr });
  db.logConfigChange('security', 1, 'update', 'رمز عبور قبلی', 'رمز عبور جدید');
  db.save();

  res.json({ success: true, message: 'رمز عبور با موفقیت بروزرسانی شد.' });
});

apiRouter.post('/auth/logout', (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : (req.body?.token as string);
  if (token) {
    activeSessions.delete(token);
  }
  res.json({ success: true, message: 'با موفقیت خارج شدید.' });
});

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
// 1B. CONSOLIDATED BOOTSTRAP API (Single-request initialization to eliminate network flooding)
// ==========================================
apiRouter.get('/bootstrap', (req: Request, res: Response) => {
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

  const enrichedSources = schema.table_sources.map((ts) => {
    const site = schema.sites.find((s) => s.id === ts.site_id);
    const page = schema.source_pages.find((p) => p.id === ts.source_page_id);
    const actionsInfo = getTableSourcePageActionsInfo(ts.id);
    const daily = schema.daily_source_runs.find((d) => d.table_source_id === ts.id && d.run_date === todayStr);
    return {
      ...ts,
      site_name: site?.name,
      url: page?.url || (ts as any).url || (ts as any).source_page_url || '',
      source_page_url: page?.url || (ts as any).url || (ts as any).source_page_url || '',
      today_status: daily?.status || 'PENDING',
      today_fresh: daily?.fresh || false,
      last_check_at: daily?.last_check_at,
      last_error: daily?.last_error,
      has_action_override: actionsInfo.hasOverride,
      action_override_count: actionsInfo.overrideActions.length,
      site_default_action_count: actionsInfo.siteDefaultActions.length,
      effective_action_count: actionsInfo.effectiveActions.length
    };
  });

  const enrichedSelectors = schema.product_selectors.map((sel) => {
    const prod = schema.products.find((p) => p.id === sel.product_id);
    const tableSource = schema.table_sources.find((ts) => ts.id === sel.table_source_id);
    const site = schema.sites.find((s) => s.id === tableSource?.site_id);
    return {
      ...sel,
      product_name: prod ? `${prod.name} (${prod.factory_name})` : '',
      site_name: site?.name || '',
      price_table_id: tableSource?.price_table_id
    };
  });

  // Sort active price tables first per user requirement: "اونایی که فعال هستند رو هم بالاتر نشون بده"
  const sortedTables = [...schema.price_tables].sort((a, b) => {
    if (a.active === b.active) return b.id - a.id;
    return a.active ? -1 : 1;
  });

  res.json({
    dashboard: dashboardData,
    products: schema.products,
    factories: schema.factories,
    categories: schema.categories || [],
    price_tables: sortedTables,
    sites: schema.sites,
    source_pages: schema.source_pages,
    table_sources: enrichedSources,
    selectors: enrichedSelectors,
    page_actions: schema.page_actions,
    settings: schema.global_settings,
    schema_version: schema.schema_version || 5,
    schema_migrations: schema.schema_migrations || [],
    open_errors_count: openErrors.length
  });
});

apiRouter.get('/system/schema-status', (req: Request, res: Response) => {
  const schema = db.getSchema();
  res.json({
    schema_version: schema.schema_version || 5,
    schema_migrations: schema.schema_migrations || [],
    total_products: schema.products.length,
    total_price_tables: schema.price_tables.length,
    total_sources: schema.table_sources.length
  });
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

  // Join table and factory names & enrich with adjustment details
  const enriched = list.map((p) => {
    const f = schema.factories.find((fac) => fac.id === p.factory_id);
    const t = schema.price_tables.find((tbl) => tbl.id === p.price_table_id);
    const tableDefaultAdj = t?.default_price_adjustment || 0;
    const effectiveAdj =
      p.price_adjustment !== undefined && p.price_adjustment !== null
        ? p.price_adjustment
        : tableDefaultAdj;

    return {
      ...p,
      factory_name: f?.name,
      price_table_name: t?.name,
      table_default_adjustment: tableDefaultAdj,
      effective_adjustment: effectiveAdj,
      has_custom_adjustment: p.price_adjustment !== undefined && p.price_adjustment !== null
    };
  });

  res.json(enriched);
});

apiRouter.post('/products', (req: Request, res: Response) => {
  const schema = db.getSchema();
  const { post_id, destination_id, name, sku, factory_id, price_table_id, current_price, price_adjustment, active, attributes } = req.body;

  const targetDestId = destination_id ? parseInt(destination_id, 10) : (post_id ? parseInt(post_id, 10) : null);

  if (!targetDestId || isNaN(targetDestId)) {
    return res.status(400).json({ error: 'شناسه آیدی سایت مقصد (post_id / destination_id) الزامی است.' });
  }

  // Prevent duplicate destination_id / post_id
  const existing = schema.products.find(
    (p) => p.post_id === targetDestId || (p.destination_id && p.destination_id === targetDestId)
  );
  if (existing) {
    return res.status(400).json({
      error: `محصولی با آیدی مقصد ${targetDestId} از قبل در سیستم وجود دارد (شناسه سیستم: ${existing.id} - ${existing.name}). افزودن تکراری مجاز نیست.`
    });
  }

  const parsedAdj =
    price_adjustment !== undefined && price_adjustment !== null && price_adjustment !== ''
      ? parseFloat(price_adjustment)
      : null;

  const newProd = {
    id: db.getNextId('products'),
    post_id: targetDestId,
    destination_id: targetDestId,
    name: name || `محصول ${targetDestId}`,
    sku: sku || '',
    factory_id: parseInt(factory_id, 10) || 1,
    price_table_id: parseInt(price_table_id, 10) || 1,
    current_price: parseFloat(current_price) || 0,
    price_adjustment: parsedAdj,
    active: active !== undefined ? Boolean(active) : true,
    attributes: attributes || {},
    sync_status: 'NOT_SYNCED' as const,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  schema.products.push(newProd);
  db.logConfigChange('product', newProd.id, 'create', null, newProd.name);
  db.save();

  // Recalculate price if sources exist
  recalculateProductPrices(newProd.id);

  res.json(newProd);
});

apiRouter.put('/products/:id', (req: Request, res: Response) => {
  const schema = db.getSchema();
  const id = parseInt(req.params.id, 10);
  const prod = schema.products.find((p) => p.id === id);
  if (!prod) return res.status(404).json({ error: 'محصول یافت نشد.' });

  const { destination_id, post_id, name, sku, factory_id, price_table_id, current_price, price_adjustment, active, attributes } = req.body;

  if (destination_id !== undefined || post_id !== undefined) {
    const newDestId = destination_id ? parseInt(destination_id, 10) : parseInt(post_id, 10);
    if (!isNaN(newDestId) && newDestId > 0) {
      // Duplicate check across other products
      const dup = schema.products.find(
        (p) => p.id !== id && (p.post_id === newDestId || p.destination_id === newDestId)
      );
      if (dup) {
        return res.status(400).json({
          error: `محصول دیگری با آیدی مقصد ${newDestId} در سیستم ثبت شده است (${dup.name}).`
        });
      }
      prod.destination_id = newDestId;
      prod.post_id = newDestId;
    }
  }

  if (name !== undefined) prod.name = name;
  if (sku !== undefined) prod.sku = sku;
  if (factory_id !== undefined) prod.factory_id = parseInt(factory_id, 10);
  if (price_table_id !== undefined) prod.price_table_id = parseInt(price_table_id, 10);
  if (current_price !== undefined) prod.current_price = parseFloat(current_price);
  if (price_adjustment !== undefined) {
    prod.price_adjustment =
      price_adjustment === null || price_adjustment === ''
        ? null
        : parseFloat(price_adjustment);
  }
  if (active !== undefined) prod.active = Boolean(active);
  if (attributes !== undefined) prod.attributes = attributes;
  prod.updated_at = new Date().toISOString();

  // Recalculate based on raw lowest price + adjustment
  recalculateProductPrices(prod.id);

  db.logConfigChange('product', prod.id, 'update', null, prod.name);
  db.save();
  res.json(prod);
});

// Manual bulk recalculate endpoint
apiRouter.post('/products/recalculate', (req: Request, res: Response) => {
  const tableId = req.body.price_table_id ? parseInt(String(req.body.price_table_id), 10) : undefined;
  const productId = req.body.product_id ? parseInt(String(req.body.product_id), 10) : undefined;

  const count = recalculateProductPrices(productId, tableId);
  res.json({ success: true, updated_count: count });
});

apiRouter.delete('/products/:id', (req: Request, res: Response) => {
  const schema = db.getSchema();
  const id = parseInt(req.params.id, 10);
  const prod = schema.products.find((p) => p.id === id);
  if (!prod) return res.status(404).json({ error: 'محصول یافت نشد.' });

  schema.products = schema.products.filter((p) => p.id !== id);
  schema.product_selectors = schema.product_selectors.filter((s) => s.product_id !== id);
  schema.price_records = schema.price_records.filter((cp) => cp.product_id !== id);
  schema.price_changes = schema.price_changes.filter((pc) => pc.product_id !== id);

  db.logConfigChange('product', id, 'delete', prod.name, null);
  db.save();
  res.json({ success: true, message: 'محصول با موفقیت حذف گردید.' });
});

apiRouter.post('/products/batch-status', (req: Request, res: Response) => {
  const { ids, active } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ success: false, error: 'هیچ شناسه‌ای ارسال نشده است.' });
  }
  const idSet = new Set(ids.map((x) => parseInt(String(x), 10)));
  const schema = db.getSchema();
  let count = 0;
  for (const prod of schema.products) {
    if (idSet.has(prod.id)) {
      prod.active = Boolean(active);
      prod.updated_at = new Date().toISOString();
      count++;
    }
  }
  db.save();
  res.json({
    success: true,
    count,
    message: `وضعیت ${count} محصول با موفقیت ${active ? 'فعال' : 'غیرفعال'} شد.`
  });
});

apiRouter.post('/products/batch-delete', (req: Request, res: Response) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ success: false, error: 'هیچ شناسه‌ای برای حذف ارسال نشده است.' });
  }
  const idSet = new Set(ids.map((x) => parseInt(String(x), 10)));
  const schema = db.getSchema();
  const initialLen = schema.products.length;
  schema.products = schema.products.filter((p) => !idSet.has(p.id));
  schema.product_selectors = schema.product_selectors.filter((s) => !idSet.has(s.product_id));
  schema.price_records = schema.price_records.filter((cp) => !idSet.has(cp.product_id));
  schema.price_changes = schema.price_changes.filter((pc) => !idSet.has(pc.product_id));
  const deletedCount = initialLen - schema.products.length;
  db.save();
  res.json({
    success: true,
    count: deletedCount,
    message: `${deletedCount} محصول با موفقیت از سیستم حذف شدند.`
  });
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
  const { name, destination_id, active } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'نام کارخانه الزامی است.' });

  const targetDestId = destination_id ? parseInt(destination_id, 10) : null;
  if (targetDestId) {
    const dup = schema.factories.find((f) => f.destination_id === targetDestId);
    if (dup) {
      return res.status(400).json({
        error: `کارخانه‌ای با آیدی مقصد ${targetDestId} از قبل در سیستم وجود دارد (${dup.name}). ثبت تکراری مجاز نیست.`
      });
    }
  }

  const newId = db.getNextId('factories');
  const newFac = {
    id: newId,
    destination_id: targetDestId || newId,
    name: name.trim(),
    active: active !== undefined ? Boolean(active) : true,
    sync_status: 'NOT_SYNCED' as const,
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

  if (req.body.destination_id !== undefined && req.body.destination_id !== null && req.body.destination_id !== '') {
    const newDestId = parseInt(req.body.destination_id, 10);
    if (!isNaN(newDestId) && newDestId > 0) {
      const dup = schema.factories.find((f) => f.id !== id && f.destination_id === newDestId);
      if (dup) {
        return res.status(400).json({
          error: `کارخانه دیگری با آیدی مقصد ${newDestId} در سیستم ثبت شده است (${dup.name}).`
        });
      }
      fac.destination_id = newDestId;
    }
  }

  if (req.body.name !== undefined) fac.name = req.body.name.trim();
  if (req.body.active !== undefined) fac.active = Boolean(req.body.active);
  fac.updated_at = new Date().toISOString();

  db.logConfigChange('factory', fac.id, 'update', null, fac.name);
  db.save();
  res.json(fac);
});

apiRouter.delete('/factories/:id', (req: Request, res: Response) => {
  const schema = db.getSchema();
  const id = parseInt(req.params.id, 10);
  const fac = schema.factories.find((f) => f.id === id);
  if (!fac) return res.status(404).json({ error: 'کارخانه یافت نشد.' });

  const linkedTables = schema.price_tables.filter((t) => t.factory_id === id);
  const linkedTableIds = new Set(linkedTables.map((t) => t.id));
  const linkedSources = schema.table_sources.filter((s) => linkedTableIds.has(s.price_table_id));
  const linkedSourceIds = new Set(linkedSources.map((s) => s.id));

  schema.factories = schema.factories.filter((f) => f.id !== id);

  const linkedProducts = schema.products.filter(
    (p) => p.factory_id === id || linkedTableIds.has(p.price_table_id)
  );
  const linkedProductIds = new Set(linkedProducts.map((p) => p.id));
  schema.products = schema.products.filter((p) => !linkedProductIds.has(p.id));

  schema.product_selectors = schema.product_selectors.filter(
    (s) => !linkedSourceIds.has(s.table_source_id) && !linkedProductIds.has(s.product_id)
  );

  schema.page_actions = schema.page_actions.filter(
    (a) => !a.table_source_id || !linkedSourceIds.has(a.table_source_id)
  );

  schema.table_sources = schema.table_sources.filter((s) => !linkedTableIds.has(s.price_table_id));
  schema.price_tables = schema.price_tables.filter((t) => t.factory_id !== id);

  schema.daily_table_runs = schema.daily_table_runs.filter((r) => !linkedTableIds.has(r.price_table_id));
  schema.daily_source_runs = schema.daily_source_runs.filter((r) => !linkedSourceIds.has(r.table_source_id));

  db.logConfigChange('factory', id, 'delete', fac.name, null);
  db.save();
  res.json({ success: true, message: 'کارخانه با موفقیت حذف گردید.' });
});

apiRouter.post('/factories/batch-status', (req: Request, res: Response) => {
  const { ids, active } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ success: false, error: 'هیچ شناسه‌ای ارسال نشده است.' });
  }
  const idSet = new Set(ids.map((x) => parseInt(String(x), 10)));
  const schema = db.getSchema();
  let count = 0;
  for (const f of schema.factories) {
    if (idSet.has(f.id)) {
      f.active = Boolean(active);
      f.updated_at = new Date().toISOString();
      count++;
    }
  }
  db.save();
  res.json({
    success: true,
    count,
    message: `وضعیت ${count} کارخانه با موفقیت ${active ? 'فعال' : 'غیرفعال'} شد.`
  });
});

apiRouter.post('/factories/batch-delete', (req: Request, res: Response) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ success: false, error: 'هیچ شناسه‌ای برای حذف ارسال نشده است.' });
  }
  const idSet = new Set(ids.map((x) => parseInt(String(x), 10)));
  const schema = db.getSchema();
  const initialLen = schema.factories.length;
  schema.factories = schema.factories.filter((f) => !idSet.has(f.id));

  // Clean up linked tables
  const linkedTables = schema.price_tables.filter((t) => idSet.has(t.factory_id));
  const linkedTableIds = new Set(linkedTables.map((t) => t.id));
  schema.price_tables = schema.price_tables.filter((t) => !idSet.has(t.factory_id));
  schema.products = schema.products.filter((p) => !idSet.has(p.factory_id) && !linkedTableIds.has(p.price_table_id));
  schema.table_sources = schema.table_sources.filter((s) => !linkedTableIds.has(s.price_table_id));

  const deletedCount = initialLen - schema.factories.length;
  db.save();
  res.json({
    success: true,
    count: deletedCount,
    message: `${deletedCount} کارخانه با موفقیت حذف شدند.`
  });
});

// ==========================================
// 3B. CATEGORIES API
// ==========================================
apiRouter.get('/categories', (req: Request, res: Response) => {
  const schema = db.getSchema();
  if (!Array.isArray(schema.categories)) schema.categories = [];
  const enriched = schema.categories.map((c) => ({
    ...c,
    table_count: schema.price_tables.filter((t) => t.category_id === c.id).length,
    product_count: schema.products.filter((p) => p.category_id === c.id).length
  }));
  res.json(enriched);
});

apiRouter.post('/categories', (req: Request, res: Response) => {
  const schema = db.getSchema();
  if (!Array.isArray(schema.categories)) schema.categories = [];
  const { name, destination_id, slug, active } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'نام دسته‌بندی الزامی است.' });

  const targetDestId = destination_id ? parseInt(destination_id, 10) : null;
  if (targetDestId) {
    const dup = schema.categories.find((c) => c.destination_id === targetDestId);
    if (dup) {
      return res.status(400).json({
        error: `دسته‌بندی دیگری با آیدی مقصد ${targetDestId} از قبل در سیستم وجود دارد (${dup.name}).`
      });
    }
  }

  const newId = db.getNextId('categories');
  const newCat = {
    id: newId,
    destination_id: targetDestId || newId,
    name: name.trim(),
    slug: (slug || '').trim(),
    active: active !== undefined ? Boolean(active) : true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  schema.categories.push(newCat);
  db.logConfigChange('category', newCat.id, 'create', null, newCat.name);
  db.save();
  res.json(newCat);
});

apiRouter.put('/categories/:id', (req: Request, res: Response) => {
  const schema = db.getSchema();
  if (!Array.isArray(schema.categories)) schema.categories = [];
  const id = parseInt(req.params.id, 10);
  const cat = schema.categories.find((c) => c.id === id);
  if (!cat) return res.status(404).json({ error: 'دسته‌بندی یافت نشد.' });

  if (req.body.destination_id !== undefined && req.body.destination_id !== null && req.body.destination_id !== '') {
    const newDestId = parseInt(req.body.destination_id, 10);
    if (!isNaN(newDestId) && newDestId > 0) {
      const dup = schema.categories.find((c) => c.id !== id && c.destination_id === newDestId);
      if (dup) {
        return res.status(400).json({
          error: `دسته‌بندی دیگری با آیدی مقصد ${newDestId} در سیستم ثبت شده است (${dup.name}).`
        });
      }
      cat.destination_id = newDestId;
    }
  }

  if (req.body.name !== undefined) cat.name = req.body.name.trim();
  if (req.body.slug !== undefined) cat.slug = req.body.slug.trim();
  if (req.body.active !== undefined) cat.active = Boolean(req.body.active);
  cat.updated_at = new Date().toISOString();

  db.logConfigChange('category', cat.id, 'update', null, cat.name);
  db.save();
  res.json(cat);
});

apiRouter.delete('/categories/:id', (req: Request, res: Response) => {
  const schema = db.getSchema();
  if (!Array.isArray(schema.categories)) schema.categories = [];
  const id = parseInt(req.params.id, 10);
  const cat = schema.categories.find((c) => c.id === id);
  if (!cat) return res.status(404).json({ error: 'دسته‌بندی یافت نشد.' });

  schema.categories = schema.categories.filter((c) => c.id !== id);
  schema.products.forEach((p) => {
    if (p.category_id === id) {
      p.category_id = null;
      p.category_name = undefined;
    }
  });
  schema.price_tables.forEach((t) => {
    if (t.category_id === id) {
      t.category_id = null;
      t.category_name = undefined;
    }
  });

  db.logConfigChange('category', id, 'delete', cat.name, null);
  db.save();
  res.json({ success: true, message: 'دسته‌بندی با موفقیت حذف گردید.' });
});

apiRouter.post('/categories/batch-status', (req: Request, res: Response) => {
  const { ids, active } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ success: false, error: 'هیچ شناسه‌ای ارسال نشده است.' });
  }
  const idSet = new Set(ids.map((x) => parseInt(String(x), 10)));
  const schema = db.getSchema();
  if (!Array.isArray(schema.categories)) schema.categories = [];
  let count = 0;
  for (const c of schema.categories) {
    if (idSet.has(c.id)) {
      c.active = Boolean(active);
      c.updated_at = new Date().toISOString();
      count++;
    }
  }
  db.save();
  res.json({
    success: true,
    count,
    message: `وضعیت ${count} دسته‌بندی با موفقیت ${active ? 'فعال' : 'غیرفعال'} شد.`
  });
});

apiRouter.post('/categories/batch-delete', (req: Request, res: Response) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ success: false, error: 'هیچ شناسه‌ای برای حذف ارسال نشده است.' });
  }
  const idSet = new Set(ids.map((x) => parseInt(String(x), 10)));
  const schema = db.getSchema();
  if (!Array.isArray(schema.categories)) schema.categories = [];
  const initialLen = schema.categories.length;
  schema.categories = schema.categories.filter((c) => !idSet.has(c.id));
  schema.products.forEach((p) => {
    if (p.category_id && idSet.has(p.category_id)) {
      p.category_id = null;
      p.category_name = undefined;
    }
  });
  schema.price_tables.forEach((t) => {
    if (t.category_id && idSet.has(t.category_id)) {
      t.category_id = null;
      t.category_name = undefined;
    }
  });
  const deletedCount = initialLen - schema.categories.length;
  db.save();
  res.json({
    success: true,
    count: deletedCount,
    message: `${deletedCount} دسته‌بندی با موفقیت حذف شدند.`
  });
});

// ==========================================
// 4. PRICE TABLES API (Requirement #8, #50)
// ==========================================
apiRouter.get('/price-tables', (req: Request, res: Response) => {
  const schema = db.getSchema();
  if (!Array.isArray(schema.categories)) schema.categories = [];
  const todayStr = new Date().toISOString().split('T')[0];

  const enriched = schema.price_tables.map((t) => {
    const f = schema.factories.find((fac) => fac.id === t.factory_id);
    const cat = schema.categories.find((c) => c.id === t.category_id);
    const sourceCount = schema.table_sources.filter((s) => s.price_table_id === t.id).length;
    // Count products using exact 3-mode cascade (Manual -> Attribute -> Taxonomy)
    const productCount = resolveProductsForTable(t, schema.products).length;
    const daily = schema.daily_table_runs.find(
      (d) => d.price_table_id === t.id && d.run_date === todayStr
    );

    return {
      ...t,
      factory_name: f?.name || t.factory_name,
      category_name: cat?.name || t.category_name,
      source_count: sourceCount,
      product_count: productCount,
      today_status: daily?.status || 'PENDING'
    };
  });

  // Sort active tables first per user requirement: "اونایی که فعال هستند رو هم بالاتر نشون بده"
  enriched.sort((a, b) => {
    if (a.active === b.active) return b.id - a.id;
    return a.active ? -1 : 1;
  });

  res.json(enriched);
});

apiRouter.post('/price-tables', (req: Request, res: Response) => {
  const schema = db.getSchema();
  const {
    name,
    destination_id,
    factory_id,
    category_id,
    start_time,
    retry_interval_minutes,
    max_attempts,
    price_guard_percent,
    default_price_adjustment,
    assignment_mode,
    manual_product_ids,
    product_by_attr,
    active
  } = req.body;

  if (!name || !name.trim()) return res.status(400).json({ error: 'نام جدول قیمت الزامی است.' });

  const targetDestId = destination_id ? parseInt(destination_id, 10) : null;
  if (targetDestId) {
    const dup = schema.price_tables.find((t) => t.destination_id === targetDestId);
    if (dup) {
      return res.status(400).json({
        error: `جدول قیمتی با آیدی مقصد ${targetDestId} از قبل در سیستم وجود دارد (${dup.name}). ثبت تکراری مجاز نیست.`
      });
    }
  }

  const newId = db.getNextId('price_tables');
  const newTable = {
    id: newId,
    destination_id: targetDestId || newId,
    name: name.trim(),
    factory_id: parseInt(factory_id, 10) || 1,
    category_id: category_id !== undefined ? (parseInt(category_id, 10) || null) : null,
    start_time: start_time || '11:00',
    retry_interval_minutes: parseInt(retry_interval_minutes, 10) || 30,
    max_attempts: parseInt(max_attempts, 10) || 5,
    price_guard_percent: parseFloat(price_guard_percent) || 30,
    default_price_adjustment: parseFloat(default_price_adjustment) || 0,
    assignment_mode: assignment_mode || (Array.isArray(manual_product_ids) && manual_product_ids.length > 0 ? 'MANUAL' : 'TAXONOMY'),
    manual_product_ids: Array.isArray(manual_product_ids) ? manual_product_ids.map(Number) : [],
    product_by_attr: Array.isArray(product_by_attr) ? product_by_attr : [],
    active: active !== undefined ? Boolean(active) : true,
    sync_status: 'NOT_SYNCED' as const,
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

  if (req.body.destination_id !== undefined && req.body.destination_id !== null && req.body.destination_id !== '') {
    const newDestId = parseInt(req.body.destination_id, 10);
    if (!isNaN(newDestId) && newDestId > 0) {
      const dup = schema.price_tables.find((t) => t.id !== id && t.destination_id === newDestId);
      if (dup) {
        return res.status(400).json({
          error: `جدول قیمت دیگری با آیدی مقصد ${newDestId} در سیستم ثبت شده است (${dup.name}).`
        });
      }
      table.destination_id = newDestId;
    }
  }

  if (req.body.name !== undefined) table.name = req.body.name.trim();
  if (req.body.factory_id !== undefined) table.factory_id = parseInt(req.body.factory_id, 10);
  if (req.body.category_id !== undefined) table.category_id = req.body.category_id ? parseInt(req.body.category_id, 10) : null;
  if (req.body.start_time !== undefined) table.start_time = req.body.start_time;
  if (req.body.retry_interval_minutes !== undefined) table.retry_interval_minutes = parseInt(req.body.retry_interval_minutes, 10);
  if (req.body.max_attempts !== undefined) table.max_attempts = parseInt(req.body.max_attempts, 10);
  if (req.body.price_guard_percent !== undefined) table.price_guard_percent = parseFloat(req.body.price_guard_percent);
  if (req.body.default_price_adjustment !== undefined) {
    table.default_price_adjustment = parseFloat(req.body.default_price_adjustment) || 0;
  }
  if (req.body.active !== undefined) table.active = Boolean(req.body.active);
  if (req.body.assignment_mode !== undefined) table.assignment_mode = req.body.assignment_mode;
  if (Array.isArray(req.body.manual_product_ids)) {
    const manualIds = req.body.manual_product_ids.map(Number);
    table.manual_product_ids = manualIds;
    // When manual products are provided, also update their price_table_id
    if (manualIds.length > 0) {
      table.assignment_mode = 'MANUAL';
      const manualSet = new Set(manualIds);
      schema.products.forEach((p) => {
        if (manualSet.has(p.id) || manualSet.has(p.post_id) || (p.destination_id && manualSet.has(p.destination_id))) {
          p.price_table_id = table.id;
          p.price_table_name = table.name;
          p.assignment_mode = 'MANUAL';
        }
      });
    }
  }
  if (Array.isArray(req.body.product_by_attr)) table.product_by_attr = req.body.product_by_attr;
  table.updated_at = new Date().toISOString();

  // Recalculate prices for products of this table
  recalculateProductPrices(undefined, table.id);

  db.logConfigChange('price_table', table.id, 'update', null, table.name);
  db.save();
  res.json(table);
});

apiRouter.delete('/price-tables/:id', (req: Request, res: Response) => {
  const schema = db.getSchema();
  const id = parseInt(req.params.id, 10);
  const table = schema.price_tables.find((t) => t.id === id);
  if (!table) return res.status(404).json({ error: 'جدول قیمت یافت نشد.' });

  const linkedSources = schema.table_sources.filter((s) => s.price_table_id === id);
  const linkedSourceIds = new Set(linkedSources.map((s) => s.id));
  const linkedProducts = schema.products.filter((p) => p.price_table_id === id);
  const linkedProductIds = new Set(linkedProducts.map((p) => p.id));

  schema.price_tables = schema.price_tables.filter((t) => t.id !== id);
  schema.products = schema.products.filter((p) => p.price_table_id !== id);
  schema.price_records = schema.price_records.filter((cp) => !linkedProductIds.has(cp.product_id));
  schema.price_changes = schema.price_changes.filter((pc) => !linkedProductIds.has(pc.product_id));
  schema.table_sources = schema.table_sources.filter((s) => s.price_table_id !== id);

  schema.product_selectors = schema.product_selectors.filter(
    (s) => !linkedSourceIds.has(s.table_source_id) && !linkedProductIds.has(s.product_id)
  );

  schema.page_actions = schema.page_actions.filter(
    (a) => !a.table_source_id || !linkedSourceIds.has(a.table_source_id)
  );

  schema.daily_table_runs = schema.daily_table_runs.filter((r) => r.price_table_id !== id);
  schema.daily_source_runs = schema.daily_source_runs.filter((r) => !linkedSourceIds.has(r.table_source_id));
  schema.table_revisions = schema.table_revisions.filter((r) => r.price_table_id !== id);

  db.logConfigChange('price_table', id, 'delete', table.name, null);
  db.save();
  res.json({ success: true, message: 'جدول قیمت با موفقیت حذف گردید.' });
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

apiRouter.post('/price-tables/batch-status', (req: Request, res: Response) => {
  const { ids, active } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ success: false, error: 'هیچ شناسه‌ای ارسال نشده است.' });
  }
  const idSet = new Set(ids.map((x) => parseInt(String(x), 10)));
  const schema = db.getSchema();
  let count = 0;
  for (const t of schema.price_tables) {
    if (idSet.has(t.id)) {
      t.active = Boolean(active);
      t.updated_at = new Date().toISOString();
      count++;
    }
  }
  db.save();
  res.json({
    success: true,
    count,
    message: `وضعیت ${count} جدول قیمت با موفقیت ${active ? 'فعال' : 'غیرفعال'} شد.`
  });
});

apiRouter.post('/price-tables/batch-delete', (req: Request, res: Response) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ success: false, error: 'هیچ شناسه‌ای برای حذف ارسال نشده است.' });
  }
  const idSet = new Set(ids.map((x) => parseInt(String(x), 10)));
  const schema = db.getSchema();
  const initialLen = schema.price_tables.length;
  const linkedSources = schema.table_sources.filter((s) => idSet.has(s.price_table_id));
  const linkedSourceIds = new Set(linkedSources.map((s) => s.id));

  schema.price_tables = schema.price_tables.filter((t) => !idSet.has(t.id));
  schema.table_sources = schema.table_sources.filter((s) => !idSet.has(s.price_table_id));
  schema.product_selectors = schema.product_selectors.filter((s) => !linkedSourceIds.has(s.table_source_id));
  schema.daily_table_runs = schema.daily_table_runs.filter((r) => !idSet.has(r.price_table_id));
  schema.daily_source_runs = schema.daily_source_runs.filter((r) => !linkedSourceIds.has(r.table_source_id));
  const deletedCount = initialLen - schema.price_tables.length;
  db.save();
  res.json({
    success: true,
    count: deletedCount,
    message: `${deletedCount} جدول قیمت با موفقیت حذف شدند.`
  });
});

apiRouter.post('/price-tables/batch-run', async (req: Request, res: Response) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ success: false, error: 'هیچ جدولی برای اجرا انتخاب نشده است.' });
  }
  const schema = db.getSchema();
  const idSet = new Set(ids.map((x) => parseInt(String(x), 10)));
  const tablesToRun = schema.price_tables.filter((t) => idSet.has(t.id));

  // Critical: only active tables are processed
  const activeTables = tablesToRun.filter((t) => t.active);
  const inactiveCount = tablesToRun.length - activeTables.length;

  if (activeTables.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'تمام جداول انتخاب‌شده غیرفعال هستند. برای دریافت قیمت ابتدا جداول مورد نظر را فعال کنید.'
    });
  }

  const results = [];
  for (const tbl of activeTables) {
    try {
      const run = await executePriceTable(tbl.id, { triggerType: 'MANUAL_TABLE' });
      results.push({ id: tbl.id, name: tbl.name, success: true, run });
    } catch (err: any) {
      results.push({ id: tbl.id, name: tbl.name, success: false, error: err.message });
    }
  }

  res.json({
    success: true,
    total: tablesToRun.length,
    executed: activeTables.length,
    skipped_inactive: inactiveCount,
    results,
    message: `اجرای ${activeTables.length} جدول قیمت با موفقیت انجام شد.${inactiveCount > 0 ? ` (${inactiveCount} جدول غیرفعال نادیده گرفته شد)` : ''}`
  });
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

apiRouter.delete('/sites/:id', (req: Request, res: Response) => {
  const schema = db.getSchema();
  const id = parseInt(req.params.id, 10);
  const site = schema.sites.find((s) => s.id === id);
  if (!site) return res.status(404).json({ error: 'سایت یافت نشد.' });

  const linkedSources = schema.table_sources.filter((s) => s.site_id === id);
  const linkedSourceIds = new Set(linkedSources.map((s) => s.id));

  schema.sites = schema.sites.filter((s) => s.id !== id);
  schema.table_sources = schema.table_sources.filter((s) => s.site_id !== id);
  schema.source_pages = schema.source_pages.filter((sp) => sp.site_id !== id);

  schema.page_actions = schema.page_actions.filter(
    (a) => a.site_id !== id && (!a.table_source_id || !linkedSourceIds.has(a.table_source_id))
  );

  schema.product_selectors = schema.product_selectors.filter((s) => !linkedSourceIds.has(s.table_source_id));
  schema.daily_source_runs = schema.daily_source_runs.filter((r) => !linkedSourceIds.has(r.table_source_id));

  db.logConfigChange('site', id, 'delete', site.name, null);
  db.save();
  res.json({ success: true, message: 'سایت رقیب با موفقیت حذف گردید.' });
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
    const daily = schema.daily_source_runs
      .slice()
      .reverse()
      .find((d) => d.table_source_id === ts.id && d.run_date === todayStr);
    const actionsInfo = getTableSourcePageActionsInfo(ts.id);

    return {
      ...ts,
      price_table_name: pt?.name,
      site_name: site?.name,
      url: sp?.url || '',
      source_page_url: sp?.url || '',
      has_action_override: actionsInfo.hasOverride,
      action_override_count: actionsInfo.overrideActions.length,
      site_default_action_count: actionsInfo.siteDefaultActions.length,
      effective_action_count: actionsInfo.effectiveActions.length,
      today_status: daily?.status || 'PENDING',
      fresh: daily?.fresh || false,
      attempt_count: daily?.attempt_count || 0,
      last_check_at: daily?.last_check_at,
      last_update_text: daily?.raw_update_text,
      last_error: daily?.status === 'FAILED' ? (daily?.last_error || 'خطا در استخراج') : undefined
    };
  });

  res.json(enriched);
});

apiRouter.post('/table-sources', (req: Request, res: Response) => {
  const schema = db.getSchema();
  const {
    price_table_id,
    site_id,
    source_page_id,
    new_url,
    update_time_xpath,
    recheck_enabled,
    active,
    max_attempts_override,
    retry_interval_override,
    timeout_override,
    price_guard_override
  } = req.body;

  const ptId = parseInt(price_table_id, 10);
  const sId = parseInt(site_id, 10);
  let spId = source_page_id ? parseInt(source_page_id, 10) : 0;

  // 1. Validate price_table_id
  if (!ptId || isNaN(ptId)) {
    return res.status(400).json({ error: 'شناسه جدول قیمت الزامی است.' });
  }
  const tableExists = schema.price_tables.some((t) => t.id === ptId);
  if (!tableExists) {
    return res.status(400).json({ error: 'جدول قیمت مشخص شده وجود ندارد.' });
  }

  // 2. Validate site_id
  if (!sId || isNaN(sId)) {
    return res.status(400).json({ error: 'شناسه سایت منبع الزامی است.' });
  }
  const siteExists = schema.sites.some((s) => s.id === sId);
  if (!siteExists) {
    return res.status(400).json({ error: 'سایت منبع مشخص شده وجود ندارد.' });
  }

  // Handle inline creation of new source page if url or new_url is provided
  const rawUrl = req.body.url || req.body.new_url;
  if (rawUrl && (!spId || spId === 0)) {
    const cleanUrl = String(rawUrl).trim();
    if (!cleanUrl) {
      return res.status(400).json({ error: 'آدرس صفحه الزامی است.' });
    }
    let existingPage = schema.source_pages.find((p) => p.site_id === sId && p.url === cleanUrl);
    if (!existingPage) {
      existingPage = {
        id: db.getNextId('source_pages'),
        site_id: sId,
        url: cleanUrl,
        active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      schema.source_pages.push(existingPage);
    }
    spId = existingPage.id;
  }

  // 3. Validate source_page_id
  if (!spId || isNaN(spId)) {
    return res.status(400).json({ error: 'شناسه صفحه منبع الزامی است.' });
  }
  const sourcePage = schema.source_pages.find((p) => p.id === spId);
  if (!sourcePage) {
    return res.status(400).json({ error: 'صفحه منبع مشخص شده وجود ندارد.' });
  }

  // 4. Validate source_page belongs to the specified site
  if (sourcePage.site_id !== sId) {
    return res.status(400).json({ error: 'صفحه منبع انتخاب شده متعلق به این سایت نیست.' });
  }

  // 5. Prevent duplicate mapping of PriceTable + Site + SourcePage
  const isDuplicate = schema.table_sources.some(
    (ts) => ts.price_table_id === ptId && ts.site_id === sId && ts.source_page_id === spId
  );
  if (isDuplicate) {
    return res.status(400).json({ error: 'این منبع قبلاً برای این جدول قیمت ثبت شده است.' });
  }

  const newSource = {
    id: db.getNextId('table_sources'),
    price_table_id: ptId,
    site_id: sId,
    source_page_id: spId,
    update_time_xpath: update_time_xpath ? String(update_time_xpath).trim() : '',
    recheck_enabled: recheck_enabled !== undefined ? Boolean(recheck_enabled) : true,
    active: active !== undefined ? Boolean(active) : true,
    max_attempts_override: max_attempts_override !== undefined && max_attempts_override !== '' && max_attempts_override !== null
      ? parseInt(String(max_attempts_override), 10)
      : null,
    retry_interval_override: retry_interval_override !== undefined && retry_interval_override !== '' && retry_interval_override !== null
      ? parseInt(String(retry_interval_override), 10)
      : null,
    timeout_override: timeout_override !== undefined && timeout_override !== '' && timeout_override !== null
      ? parseInt(String(timeout_override), 10)
      : null,
    price_guard_override: price_guard_override !== undefined && price_guard_override !== '' && price_guard_override !== null
      ? parseFloat(String(price_guard_override))
      : null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  schema.table_sources.push(newSource);
  db.logConfigChange('table_source', newSource.id, 'create', null, `Table ${ptId} -> Site ${sId}`);
  db.save();

  const createdPage = schema.source_pages.find((p) => p.id === newSource.source_page_id);
  const site = schema.sites.find((s) => s.id === newSource.site_id);
  const actionsInfo = getTableSourcePageActionsInfo(newSource.id);

  res.json({
    ...newSource,
    site_name: site?.name,
    url: createdPage?.url || '',
    source_page_url: createdPage?.url || '',
    has_action_override: actionsInfo.hasOverride,
    action_override_count: actionsInfo.overrideActions.length,
    site_default_action_count: actionsInfo.siteDefaultActions.length,
    effective_action_count: actionsInfo.effectiveActions.length
  });
});

apiRouter.put('/table-sources/:id', (req: Request, res: Response) => {
  const schema = db.getSchema();
  const id = parseInt(req.params.id, 10);
  const ts = schema.table_sources.find((s) => s.id === id);
  if (!ts) return res.status(404).json({ error: 'منبع جدول یافت نشد.' });

  const ptId = req.body.price_table_id !== undefined ? parseInt(req.body.price_table_id, 10) : ts.price_table_id;
  const sId = req.body.site_id !== undefined ? parseInt(req.body.site_id, 10) : ts.site_id;
  let spId = req.body.source_page_id !== undefined ? parseInt(req.body.source_page_id, 10) : ts.source_page_id;

  // Handle inline creation of new source page on edit if requested
  const rawUrl = req.body.url !== undefined ? req.body.url : req.body.new_url;
  if (rawUrl !== undefined && (!req.body.source_page_id || req.body.source_page_id === 0)) {
    const cleanUrl = String(rawUrl).trim();
    if (cleanUrl) {
      let existingPage = schema.source_pages.find((p) => p.site_id === sId && p.url === cleanUrl);
      if (!existingPage) {
        existingPage = {
          id: db.getNextId('source_pages'),
          site_id: sId,
          url: cleanUrl,
          active: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
        schema.source_pages.push(existingPage);
      }
      spId = existingPage.id;
    }
  } else if (req.body.site_id !== undefined && req.body.site_id !== ts.site_id && (!req.body.source_page_id || req.body.source_page_id === ts.source_page_id)) {
    // If site changed but URL was not explicitly re-sent and source_page_id wasn't changed,
    // find or create a source_page for the new site using the existing source_page's URL
    const existingSp = schema.source_pages.find((p) => p.id === ts.source_page_id);
    const existingUrl = existingSp?.url || (ts as any).url || (ts as any).source_page_url || '';
    if (existingUrl) {
      let pageForNewSite = schema.source_pages.find((p) => p.site_id === sId && p.url === existingUrl);
      if (!pageForNewSite) {
        pageForNewSite = {
          id: db.getNextId('source_pages'),
          site_id: sId,
          url: existingUrl,
          active: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
        schema.source_pages.push(pageForNewSite);
      }
      spId = pageForNewSite.id;
    }
  }

  // 1. Validate price_table
  if (!schema.price_tables.some((t) => t.id === ptId)) {
    return res.status(400).json({ error: 'جدول قیمت مشخص شده وجود ندارد.' });
  }

  // 2. Validate site
  if (!schema.sites.some((s) => s.id === sId)) {
    return res.status(400).json({ error: 'سایت منبع مشخص شده وجود ندارد.' });
  }

  // 3. Validate source_page
  const sourcePage = schema.source_pages.find((p) => p.id === spId);
  if (!sourcePage) {
    return res.status(400).json({ error: 'صفحه منبع مشخص شده وجود ندارد.' });
  }

  // 4. Validate source_page belongs to site
  if (sourcePage.site_id !== sId) {
    return res.status(400).json({ error: 'صفحه منبع انتخاب شده متعلق به این سایت نیست.' });
  }

  // 5. Duplicate check against other sources
  const isDuplicate = schema.table_sources.some(
    (other) => other.id !== id && other.price_table_id === ptId && other.site_id === sId && other.source_page_id === spId
  );
  if (isDuplicate) {
    return res.status(400).json({ error: 'منبع دیگری با همین مشخصات برای این جدول ثبت شده است.' });
  }

  const previousSiteId = ts.site_id;
  ts.price_table_id = ptId;
  ts.site_id = sId;
  ts.source_page_id = spId;

  // If site_id changed, sync site_id metadata for all TABLE_SOURCE actions owned by this source
  if (previousSiteId !== sId) {
    schema.page_actions.forEach((a) => {
      if (a.scope === 'TABLE_SOURCE' && a.table_source_id === id) {
        a.site_id = sId;
        a.updated_at = new Date().toISOString();
      }
    });
  }
  if (req.body.update_time_xpath !== undefined) ts.update_time_xpath = String(req.body.update_time_xpath).trim();
  if (req.body.recheck_enabled !== undefined) ts.recheck_enabled = Boolean(req.body.recheck_enabled);
  if (req.body.active !== undefined) ts.active = Boolean(req.body.active);
  if (req.body.max_attempts_override !== undefined) {
    ts.max_attempts_override = req.body.max_attempts_override !== '' && req.body.max_attempts_override !== null
      ? parseInt(String(req.body.max_attempts_override), 10)
      : null;
  }
  if (req.body.retry_interval_override !== undefined) {
    ts.retry_interval_override = req.body.retry_interval_override !== '' && req.body.retry_interval_override !== null
      ? parseInt(String(req.body.retry_interval_override), 10)
      : null;
  }
  if (req.body.timeout_override !== undefined) {
    ts.timeout_override = req.body.timeout_override !== '' && req.body.timeout_override !== null
      ? parseInt(String(req.body.timeout_override), 10)
      : null;
  }
  if (req.body.price_guard_override !== undefined) {
    ts.price_guard_override = req.body.price_guard_override !== '' && req.body.price_guard_override !== null
      ? parseFloat(String(req.body.price_guard_override))
      : null;
  }
  ts.updated_at = new Date().toISOString();

  db.logConfigChange('table_source', ts.id, 'update', null, ts.update_time_xpath);
  db.save();

  const updatedPage = schema.source_pages.find((p) => p.id === ts.source_page_id);
  const site = schema.sites.find((s) => s.id === ts.site_id);
  const actionsInfo = getTableSourcePageActionsInfo(ts.id);

  res.json({
    ...ts,
    site_name: site?.name,
    url: updatedPage?.url || '',
    source_page_url: updatedPage?.url || '',
    has_action_override: actionsInfo.hasOverride,
    action_override_count: actionsInfo.overrideActions.length,
    site_default_action_count: actionsInfo.siteDefaultActions.length,
    effective_action_count: actionsInfo.effectiveActions.length
  });
});

apiRouter.delete('/table-sources/:id', (req: Request, res: Response) => {
  const schema = db.getSchema();
  const id = parseInt(req.params.id, 10);
  const index = schema.table_sources.findIndex((s) => s.id === id);
  if (index === -1) return res.status(404).json({ error: 'منبع جدول یافت نشد.' });
  const [removed] = schema.table_sources.splice(index, 1);
  // Also clean up selectors and TABLE_SOURCE page_actions for this table source
  schema.product_selectors = schema.product_selectors.filter((s) => s.table_source_id !== id);
  schema.page_actions = schema.page_actions.filter(
    (a) => !(a.scope === 'TABLE_SOURCE' && a.table_source_id === id)
  );
  db.logConfigChange('table_source', id, 'delete', `Table ${removed.price_table_id} -> Site ${removed.site_id}`, null);
  db.save();
  res.json({ success: true, removed });
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

    const todayStr = new Date().toISOString().split('T')[0];
    const dailySource = schema.daily_source_runs
      .slice()
      .reverse()
      .find((ds) => ds.table_source_id === id && ds.run_date === todayStr);

    const extractedRecords = schema.price_records.filter(
      (r) => r.table_source_id === id && r.run_id === run.id && r.status === 'VALID'
    );

    const relevantSelectors = schema.product_selectors.filter(
      (s) => s.table_source_id === id && s.active
    );

    // Detailed per-product status breakdown
    const productResults = relevantSelectors.map((sel) => {
      const prod = schema.products.find((p) => p.id === sel.product_id);
      const rec = extractedRecords.find((r) => r.product_id === sel.product_id);
      return {
        product_id: sel.product_id,
        product_name: prod ? `${prod.name} (${prod.factory_name})` : `محصول ${sel.product_id}`,
        price_xpath: sel.price_xpath,
        extracted_price: rec ? rec.parsed_price : sel.last_parsed_price,
        raw_value: rec ? rec.raw_value : sel.last_extracted_value,
        status: rec ? 'VALID' : (sel.last_status || 'NOT_FOUND'),
        success: Boolean(rec && rec.parsed_price > 0)
      };
    });

    const successCount = extractedRecords.length;
    const failCount = Math.max(0, relevantSelectors.length - successCount);
    const isSuccess = successCount > 0;
    const isPartial = successCount > 0 && failCount > 0;

    let summaryMessage = '';
    if (successCount === relevantSelectors.length && relevantSelectors.length > 0) {
      summaryMessage = `استخراج با موفقیت انجام شد (${successCount} کالا استخراج شد).`;
    } else if (isPartial) {
      summaryMessage = `استخراج تا حدی موفق بود (${successCount} کالا استخراج شد، ${failCount} کالا با سلکتور فعلی یافت نشد).`;
    } else if (relevantSelectors.length === 0) {
      summaryMessage = 'منبع بررسی شد، اما هنوز هیچ کالایی برای استخراج در این منبع تعریف نشده است.';
    } else {
      summaryMessage = dailySource?.last_error || 'المان‌های قیمت با XPath‌های تعیین‌شده در صفحه یافت نشدند.';
    }

    res.json({
      success: isSuccess,
      source_status: dailySource?.status || (isSuccess ? 'UPDATED' : 'FAILED'),
      fresh: dailySource?.fresh || false,
      products_extracted: successCount,
      products_failed: failCount,
      product_results: productResults,
      last_error: isSuccess ? undefined : summaryMessage,
      message: summaryMessage,
      last_update_text: dailySource?.raw_update_text,
      run
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: err.message,
      message: `خطا در اجرای استخراج: ${err.message}`
    });
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
  let actions: PageAction[] = [];

  if (source_id) {
    const ts = schema.table_sources.find((s) => s.id === parseInt(source_id, 10));
    if (ts) {
      site = schema.sites.find((s) => s.id === ts.site_id);
      const sp = schema.source_pages.find((p) => p.id === ts.source_page_id);
      if (!targetUrl) targetUrl = sp?.url || (ts as any).url || (ts as any).source_page_url || site?.base_url;
      // When tableSource context exists, use ONLY resolveEffectivePageActions without any secondary fallback
      actions = resolveEffectivePageActions(ts.id);
    }
  } else {
    // Only when no tableSource context is present, check site_id or URL site
    if (req.body.site_id) {
      site = schema.sites.find((s) => s.id === parseInt(req.body.site_id, 10));
    }
    if (!site && targetUrl) {
      site = schema.sites.find((s) => targetUrl.startsWith(s.base_url));
    }
    if (site) {
      actions = getSiteDefaultPageActions(site.id, true);
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
    loadedPage = await loadSourcePage(targetUrl, effectiveSite, actions, 25000);
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
// 8. PAGE ACTIONS API (Scoped: SITE_DEFAULT & TABLE_SOURCE)
// ==========================================

// --- 8A. Site Default Page Actions ---
apiRouter.get('/sites/:siteId/page-actions', (req: Request, res: Response) => {
  const schema = db.getSchema();
  const siteId = parseInt(req.params.siteId, 10);
  const site = schema.sites.find((s) => s.id === siteId);
  if (!site) return res.status(404).json({ error: 'سایت مورد نظر یافت نشد.' });

  const actions = getSiteDefaultPageActions(siteId, false);
  res.json(actions);
});

apiRouter.post('/sites/:siteId/page-actions', (req: Request, res: Response) => {
  const schema = db.getSchema();
  const siteId = parseInt(req.params.siteId, 10);
  const site = schema.sites.find((s) => s.id === siteId);
  if (!site) return res.status(404).json({ error: 'سایت مورد نظر یافت نشد.' });

  const { order, action_type, selector, value, active, selector_type } = req.body;
  const validTypes = ['WAIT', 'CLICK', 'SCROLL', 'SCROLL_TO', 'WAIT_FOR_ELEMENT'];
  const type = validTypes.includes(action_type) ? action_type : 'WAIT';

  const siteActions = schema.page_actions.filter(
    (a) => a.scope === 'SITE_DEFAULT' && a.site_id === siteId
  );

  const newAction: PageAction = {
    id: db.getNextId('page_actions'),
    scope: 'SITE_DEFAULT',
    site_id: siteId,
    table_source_id: null,
    order: parseInt(order, 10) || (siteActions.length + 1),
    action_type: type as any,
    selector_type: selector_type || (selector?.startsWith('//') ? 'XPATH' : 'CSS'),
    selector: selector ? String(selector).trim() : '',
    value: value ? String(value).trim() : '',
    active: active !== undefined ? Boolean(active) : true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  schema.page_actions.push(newAction);
  db.logConfigChange('site_page_action', newAction.id, 'create', null, `Site ${siteId} -> ${newAction.action_type}`);
  db.save();
  res.json(newAction);
});

apiRouter.put('/sites/:siteId/page-actions/:actionId', (req: Request, res: Response) => {
  const schema = db.getSchema();
  const siteId = parseInt(req.params.siteId, 10);
  const actionId = parseInt(req.params.actionId, 10);

  const action = schema.page_actions.find(
    (a) => a.id === actionId && a.site_id === siteId && a.scope === 'SITE_DEFAULT'
  );
  if (!action) {
    return res.status(404).json({ error: 'دستور مورد نظر برای این سایت یافت نشد.' });
  }

  const { order, action_type, selector, value, active, selector_type } = req.body;
  if (order !== undefined) action.order = parseInt(order, 10);
  if (action_type !== undefined) action.action_type = action_type;
  if (selector !== undefined) action.selector = String(selector).trim();
  if (value !== undefined) action.value = String(value).trim();
  if (active !== undefined) action.active = Boolean(active);
  if (selector_type !== undefined) action.selector_type = selector_type;
  action.scope = 'SITE_DEFAULT';
  action.site_id = siteId;
  action.table_source_id = null;
  action.updated_at = new Date().toISOString();

  db.logConfigChange('site_page_action', action.id, 'update', null, `Site ${siteId}`);
  db.save();
  res.json(action);
});

apiRouter.delete('/sites/:siteId/page-actions/:actionId', (req: Request, res: Response) => {
  const schema = db.getSchema();
  const siteId = parseInt(req.params.siteId, 10);
  const actionId = parseInt(req.params.actionId, 10);

  const idx = schema.page_actions.findIndex(
    (a) => a.id === actionId && a.site_id === siteId && a.scope === 'SITE_DEFAULT'
  );
  if (idx === -1) {
    return res.status(404).json({ error: 'دستور مورد نظر برای این سایت یافت نشد.' });
  }

  schema.page_actions.splice(idx, 1);
  db.logConfigChange('site_page_action', actionId, 'delete', null, `Site ${siteId}`);
  db.save();
  res.json({ success: true });
});

// --- 8B. TableSource Override Page Actions ---
apiRouter.get('/table-sources/:tableSourceId/page-actions', (req: Request, res: Response) => {
  const schema = db.getSchema();
  const tableSourceId = parseInt(req.params.tableSourceId, 10);
  const ts = schema.table_sources.find((t) => t.id === tableSourceId);
  if (!ts) return res.status(404).json({ error: 'منبع جدول یافت نشد.' });

  const info = getTableSourcePageActionsInfo(tableSourceId);
  if (req.query.effective === 'true') {
    return res.json(info.effectiveActions);
  }
  if (req.query.format === 'array') {
    return res.json(info.overrideActions);
  }
  res.json({
    has_override: info.hasOverride,
    actions: info.overrideActions,
    site_default_actions: info.siteDefaultActions,
    effective_actions: info.effectiveActions
  });
});

apiRouter.post('/table-sources/:tableSourceId/page-actions', (req: Request, res: Response) => {
  const schema = db.getSchema();
  const tableSourceId = parseInt(req.params.tableSourceId, 10);
  const ts = schema.table_sources.find((t) => t.id === tableSourceId);
  if (!ts) return res.status(404).json({ error: 'منبع جدول یافت نشد.' });

  const { order, action_type, selector, value, active, selector_type } = req.body;
  const validTypes = ['WAIT', 'CLICK', 'SCROLL', 'SCROLL_TO', 'WAIT_FOR_ELEMENT'];
  const type = validTypes.includes(action_type) ? action_type : 'WAIT';

  const existingOverrides = schema.page_actions.filter(
    (a) => a.scope === 'TABLE_SOURCE' && a.table_source_id === tableSourceId
  );

  const newAction: PageAction = {
    id: db.getNextId('page_actions'),
    scope: 'TABLE_SOURCE',
    table_source_id: tableSourceId,
    site_id: ts.site_id,
    order: parseInt(order, 10) || (existingOverrides.length + 1),
    action_type: type as any,
    selector_type: selector_type || (selector?.startsWith('//') ? 'XPATH' : 'CSS'),
    selector: selector ? String(selector).trim() : '',
    value: value ? String(value).trim() : '',
    active: active !== undefined ? Boolean(active) : true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  schema.page_actions.push(newAction);
  db.logConfigChange('table_source_action', newAction.id, 'create', null, `Source ${tableSourceId} -> ${newAction.action_type}`);
  db.save();
  res.json(newAction);
});

apiRouter.put('/table-sources/:tableSourceId/page-actions/:actionId', (req: Request, res: Response) => {
  const schema = db.getSchema();
  const tableSourceId = parseInt(req.params.tableSourceId, 10);
  const actionId = parseInt(req.params.actionId, 10);

  const action = schema.page_actions.find(
    (a) => a.id === actionId && a.table_source_id === tableSourceId && a.scope === 'TABLE_SOURCE'
  );
  if (!action) {
    return res.status(404).json({ error: 'دستور اختصاصی مورد نظر برای این منبع یافت نشد.' });
  }

  const { order, action_type, selector, value, active, selector_type } = req.body;
  if (order !== undefined) action.order = parseInt(order, 10);
  if (action_type !== undefined) action.action_type = action_type;
  if (selector !== undefined) action.selector = String(selector).trim();
  if (value !== undefined) action.value = String(value).trim();
  if (active !== undefined) action.active = Boolean(active);
  if (selector_type !== undefined) action.selector_type = selector_type;
  action.updated_at = new Date().toISOString();

  db.logConfigChange('table_source_action', action.id, 'update', null, `Source ${tableSourceId}`);
  db.save();
  res.json(action);
});

apiRouter.delete('/table-sources/:tableSourceId/page-actions/:actionId', (req: Request, res: Response) => {
  const schema = db.getSchema();
  const tableSourceId = parseInt(req.params.tableSourceId, 10);
  const actionId = parseInt(req.params.actionId, 10);

  const idx = schema.page_actions.findIndex(
    (a) => a.id === actionId && a.table_source_id === tableSourceId && a.scope === 'TABLE_SOURCE'
  );
  if (idx === -1) {
    return res.status(404).json({ error: 'دستور اختصاصی مورد نظر برای این منبع یافت نشد.' });
  }

  schema.page_actions.splice(idx, 1);
  db.logConfigChange('table_source_action', actionId, 'delete', null, `Source ${tableSourceId}`);
  db.save();
  res.json({ success: true });
});

apiRouter.delete('/table-sources/:tableSourceId/page-actions', (req: Request, res: Response) => {
  const schema = db.getSchema();
  const tableSourceId = parseInt(req.params.tableSourceId, 10);
  const beforeCount = schema.page_actions.length;
  schema.page_actions = schema.page_actions.filter(
    (a) => !(a.table_source_id === tableSourceId && a.scope === 'TABLE_SOURCE')
  );
  const deletedCount = beforeCount - schema.page_actions.length;
  db.logConfigChange('table_source_action', tableSourceId, 'clear_all_overrides', null, `Cleared ${deletedCount} overrides`);
  db.save();
  res.json({ success: true, count: deletedCount });
});

// --- 8C. Legacy Page Actions Endpoints for Compatibility ---
apiRouter.get('/page-actions', (req: Request, res: Response) => {
  const schema = db.getSchema();
  const pageId = req.query.source_page_id ? parseInt(String(req.query.source_page_id), 10) : null;
  const siteId = req.query.site_id ? parseInt(String(req.query.site_id), 10) : null;
  const sourceId = req.query.table_source_id ? parseInt(String(req.query.table_source_id), 10) : null;

  let list = schema.page_actions;
  if (sourceId) {
    list = list.filter((a) => a.table_source_id === sourceId);
  } else if (siteId) {
    list = list.filter((a) => a.site_id === siteId && a.scope === 'SITE_DEFAULT');
  } else if (pageId) {
    list = list.filter((a) => a.source_page_id === pageId);
  }
  res.json(list.sort((a, b) => a.order - b.order));
});

apiRouter.post('/page-actions', (req: Request, res: Response) => {
  const schema = db.getSchema();
  const {
    scope,
    site_id,
    table_source_id,
    source_page_id,
    order,
    action_type,
    selector,
    value,
    active,
    selector_type
  } = req.body;

  // Prevent bypassing strict ownership: Scoped actions must be managed via dedicated scoped endpoints
  if (scope === 'SITE_DEFAULT' || scope === 'TABLE_SOURCE' || site_id || table_source_id) {
    return res.status(403).json({
      error: 'ثبت دستورات اسکوپ‌دار از اندپوینت عمومی مسدود است. لطفاً از روت‌های اختصاصی سایت یا منبع استفاده کنید.'
    });
  }

  // Legacy fallback: only if source_page_id is provided without new scope
  if (!source_page_id) {
    return res.status(400).json({ error: 'دستورات جدید باید در اندپوینت اختصاصی سایت یا منبع ثبت شوند.' });
  }

  const sp = schema.source_pages.find((p) => p.id === parseInt(source_page_id, 10));
  const newAction: PageAction = {
    id: db.getNextId('page_actions'),
    scope: 'SITE_DEFAULT',
    site_id: sp?.site_id || null,
    table_source_id: null,
    order: parseInt(order, 10) || 1,
    action_type: action_type || 'WAIT',
    selector_type: selector_type || (selector?.startsWith('//') ? 'XPATH' : 'CSS'),
    selector: selector || '',
    value: value || '',
    active: active !== undefined ? Boolean(active) : true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    source_page_id: parseInt(source_page_id, 10)
  };

  schema.page_actions.push(newAction);
  db.save();
  res.json(newAction);
});

apiRouter.put('/page-actions/:id', (req: Request, res: Response) => {
  const schema = db.getSchema();
  const id = parseInt(req.params.id, 10);
  const action = schema.page_actions.find((a) => a.id === id);

  if (!action) {
    return res.status(404).json({ error: 'دستور مورد نظر یافت نشد.' });
  }

  // Prevent bypassing strict ownership: Scoped actions CANNOT be updated via legacy generic endpoint
  if (action.scope === 'SITE_DEFAULT' || action.scope === 'TABLE_SOURCE') {
    return res.status(403).json({
      error: 'ویرایش دستورات اسکوپ‌دار از اندپوینت عمومی غیرمجاز است. لطفاً از روت اختصاصی سایت یا منبع استفاده کنید.'
    });
  }

  return res.status(403).json({ error: 'ویرایش دستورات از اندپوینت عمومی غیرمجاز است.' });
});

apiRouter.delete('/page-actions/:id', (req: Request, res: Response) => {
  const schema = db.getSchema();
  const id = parseInt(req.params.id, 10);
  const action = schema.page_actions.find((a) => a.id === id);

  if (!action) {
    return res.status(404).json({ error: 'دستور مورد نظر یافت نشد.' });
  }

  // Prevent bypassing strict ownership: Scoped actions CANNOT be deleted via legacy generic endpoint
  if (action.scope === 'SITE_DEFAULT' || action.scope === 'TABLE_SOURCE') {
    return res.status(403).json({
      error: 'حذف دستورات اسکوپ‌دار از اندپوینت عمومی غیرمجاز است. لطفاً از روت اختصاصی سایت یا منبع استفاده کنید.'
    });
  }

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
  const tableSourceId = req.query.table_source_id ? parseInt(String(req.query.table_source_id), 10) : null;
  const forceRefresh = req.query.refresh === 'true' || req.query.refresh === '1';
  if (!targetUrl) return res.status(400).send('URL is required');

  // 1. Check 1-hour persistent cache on system first unless explicitly requested to bypass
  if (!forceRefresh) {
    const cached = getCachedPickerPage(targetUrl, tableSourceId);
    if (cached) {
      const injected = injectPickerScript(cached.html, {
        isCached: true,
        remainingMinutes: cached.remainingMinutes,
        ageSeconds: cached.ageSeconds
      });
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('X-Picker-Cache', 'HIT');
      res.setHeader('X-Picker-Cache-Remaining-Min', String(cached.remainingMinutes));
      return res.send(injected);
    }
  }

  // 2. Not cached, expired, or refresh requested: load live page and save to 1-hour cache
  const schema = db.getSchema();
  let site: Site | undefined = undefined;
  let actions: PageAction[] = [];

  if (tableSourceId) {
    const ts = schema.table_sources.find((s) => s.id === tableSourceId);
    if (ts) {
      site = schema.sites.find((s) => s.id === ts.site_id);
      // When tableSource context exists, use ONLY resolveEffectivePageActions without any secondary fallback
      actions = resolveEffectivePageActions(ts.id);
    }
  } else {
    // Only when no tableSource context is present, check siteId or URL site
    if (siteId) {
      site = schema.sites.find((s) => s.id === siteId);
    }
    if (!site) {
      site = schema.sites.find((s) => targetUrl.startsWith(s.base_url));
    }
    if (site) {
      actions = getSiteDefaultPageActions(site.id, true);
    }
  }

  const effectiveSite: Site = site || {
    id: 0,
    name: 'Picker',
    base_url: targetUrl,
    scrape_method: 'PLAYWRIGHT',
    browser: 'Chromium',
    timeout: 30,
    wait_after_load: 1000,
    active: true,
    created_at: '',
    updated_at: ''
  };

  let loadedPage = null;
  try {
    loadedPage = await loadSourcePage(targetUrl, effectiveSite, actions, 30000);
    const rawHtml = loadedPage.content;

    // Cache page on system for 1 hour (3600000 ms) so repeated picker interactions never re-request the external site
    saveCachedPickerPage(targetUrl, rawHtml, tableSourceId, 3600 * 1000);

    const injected = injectPickerScript(rawHtml, {
      isCached: false,
      remainingMinutes: 60,
      ageSeconds: 0
    });
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('X-Picker-Cache', 'MISS');
    res.send(injected);
  } catch (err: any) {
    res.status(500).send(`Error loading page: ${err.message}`);
  } finally {
    if (loadedPage) {
      await loadedPage.close().catch(() => {});
    }
  }
});

apiRouter.post('/picker/cache/clear', (req: Request, res: Response) => {
  const targetUrl = req.body?.url ? String(req.body.url) : undefined;
  const tableSourceId = req.body?.table_source_id ? parseInt(String(req.body.table_source_id), 10) : undefined;
  invalidatePickerCache(targetUrl, tableSourceId);
  res.json({ success: true, message: 'حافظه موقت صفحه با موفقیت پاک شد.' });
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
  if (req.body.wordpress_url || req.body.wordpress_api_token || req.body.admin_password) {
    db.saveSecrets({
      ...(req.body.wordpress_url ? { wordpress_url: req.body.wordpress_url } : {}),
      ...(req.body.wordpress_api_token ? { wordpress_api_token: req.body.wordpress_api_token } : {}),
      ...(req.body.admin_password ? { admin_password: req.body.admin_password } : {})
    });
  }
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

// ==========================================
// 15. DESTINATION SITE (WORDPRESS) SYNCHRONIZATION ENDPOINTS
// ==========================================

// 1. Sync All Products to Destination Site (Batch/Chunked)
apiRouter.post('/sync/products', async (req: Request, res: Response) => {
  const batchSize = req.body?.batch_size ? parseInt(req.body.batch_size, 10) : undefined;
  try {
    const result = await syncProductsToDestination(batchSize);
    db.log('INFO', `همگام‌سازی دسته‌ای محصولات با سایت مقصد انجام شد: ${result.synced} از ${result.total} محصول (${result.batches_count || 1} بسته)`, { result });
    res.json(result);
  } catch (err: any) {
    db.log('ERROR', `خطا در همگام‌سازی محصولات با سایت مقصد: ${err.message}`, { error: err.message });
    res.status(500).json({
      success: false,
      entity: 'products',
      message: `خطا در همگام‌سازی محصولات: ${err.message}`
    });
  }
});

// 2. Sync All Factories to Destination Site (Batch/Chunked)
apiRouter.post('/sync/factories', async (req: Request, res: Response) => {
  const batchSize = req.body?.batch_size ? parseInt(req.body.batch_size, 10) : undefined;
  try {
    const result = await syncFactoriesToDestination(batchSize);
    db.log('INFO', `همگام‌سازی دسته‌ای کارخانجات با سایت مقصد انجام شد: ${result.synced} از ${result.total} کارخانه (${result.batches_count || 1} بسته)`, { result });
    res.json(result);
  } catch (err: any) {
    db.log('ERROR', `خطا در همگام‌سازی کارخانجات با سایت مقصد: ${err.message}`, { error: err.message });
    res.status(500).json({
      success: false,
      entity: 'factories',
      message: `خطا در همگام‌سازی کارخانجات: ${err.message}`
    });
  }
});

// 3. Sync All Price Tables to Destination Site (Batch/Chunked)
apiRouter.post('/sync/price-tables', async (req: Request, res: Response) => {
  const batchSize = req.body?.batch_size ? parseInt(req.body.batch_size, 10) : undefined;
  try {
    const result = await syncPriceTablesToDestination(batchSize);
    db.log('INFO', `همگام‌سازی دسته‌ای جداول قیمت با سایت مقصد انجام شد: ${result.synced} از ${result.total} جدول (${result.batches_count || 1} بسته)`, { result });
    res.json(result);
  } catch (err: any) {
    db.log('ERROR', `خطا در همگام‌سازی جداول قیمت با سایت مقصد: ${err.message}`, { error: err.message });
    res.status(500).json({
      success: false,
      entity: 'price_tables',
      message: `خطا در همگام‌سازی جداول قیمت: ${err.message}`
    });
  }
});

// 4. Pull/Import All Data from Destination Site (WordPress/WooCommerce)
// Products imported here are DEFAULTED TO INACTIVE (active: false) per explicit user instructions
apiRouter.post('/sync/pull-from-destination', async (req: Request, res: Response) => {
  try {
    const result = await pullDataFromDestination();
    db.log('INFO', result.message, { result });
    res.json(result);
  } catch (err: any) {
    db.log('ERROR', `خطا در دریافت اطلاعات از سایت مقصد: ${err.message}`, { error: err.message });
    res.status(500).json({
      success: false,
      message: `خطا در دریافت اطلاعات از سایت مقصد: ${err.message}`
    });
  }
});

// 5. Batch Toggle Product Active Status
apiRouter.post('/products/batch-status', (req: Request, res: Response) => {
  const { ids, active } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'لیست شناسه‌های محصول الزامی است.' });
  }
  const schema = db.getSchema();
  const idSet = new Set(ids.map((id) => Number(id)));
  let updatedCount = 0;

  for (const prod of schema.products) {
    if (idSet.has(prod.id)) {
      prod.active = Boolean(active);
      updatedCount++;
    }
  }

  db.log('INFO', `تغییر وضعیت دسته‌ای محصولات: ${updatedCount} محصول به وضعیت ${active ? 'فعال' : 'غیرفعال'} تغییر یافت.`, { ids, active });
  db.save();
  res.json({
    success: true,
    updated_count: updatedCount,
    active: Boolean(active),
    message: `${updatedCount} محصول با موفقیت ${active ? 'فعال' : 'غیرفعال'} شدند.`
  });
});

// Mock WordPress Endpoints for local testing & live verification
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

apiRouter.post('/mock-wordpress/wp-json/price-system/v1/sync-factories', (req: Request, res: Response) => {
  const { factories } = req.body;
  const items = (factories || []).map((f: any) => ({
    id: f.id,
    destination_id: f.destination_id || f.id,
    name: f.name,
    success: true
  }));

  res.json({
    success: true,
    entity: 'factories',
    total: items.length,
    synced: items.length,
    failed: 0,
    message: `همگام‌سازی ${items.length} کارخانه با سایت مقصد (وردپرس) با موفقیت انجام شد.`,
    items
  });
});

apiRouter.post('/mock-wordpress/wp-json/price-system/v1/sync-tables', (req: Request, res: Response) => {
  const { tables } = req.body;
  const items = (tables || []).map((t: any) => ({
    id: t.id,
    destination_id: t.destination_id || t.id,
    name: t.name,
    success: true
  }));

  res.json({
    success: true,
    entity: 'price_tables',
    total: items.length,
    synced: items.length,
    failed: 0,
    message: `همگام‌سازی ${items.length} جدول قیمت با سایت مقصد با موفقیت انجام شد.`,
    items
  });
});

apiRouter.post('/mock-wordpress/wp-json/price-system/v1/sync-products', (req: Request, res: Response) => {
  const { products } = req.body;
  const items = (products || []).map((p: any) => ({
    id: p.id,
    destination_id: p.destination_id || p.post_id || p.id,
    name: p.name,
    success: true
  }));

  res.json({
    success: true,
    entity: 'products',
    total: items.length,
    synced: items.length,
    failed: 0,
    message: `همگام‌سازی و اتصال ${items.length} محصول با سایت مقصد با موفقیت انجام شد.`,
    items
  });
});

// Test Connection Endpoint for WordPress
apiRouter.post('/wordpress/test-connection', async (req: Request, res: Response) => {
  const { wordpress_url, wordpress_api_token } = req.body;
  try {
    const result = await testWordPressConnection(wordpress_url, wordpress_api_token);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({
      success: false,
      status: 500,
      message: `خطای سرور در بررسی اتصال: ${err.message}`
    });
  }
});

apiRouter.all('/mock-wordpress/wp-json/price-system/v1/test-connection', (req: Request, res: Response) => {
  res.json({
    success: true,
    status: 'connected',
    message: 'اتصال به وب‌سایت وردپرس/ووکامرس با موفقیت برقرار شد.',
    site_name: 'شبیه‌ساز فروشگاه وردپرس',
    site_url: 'http://localhost:3000/api/mock-wordpress',
    woocommerce_active: true,
    timestamp: new Date().toISOString()
  });
});

apiRouter.all('/mock-wordpress/wp-json/price-system/v1/fetch-destination-data', (req: Request, res: Response) => {
  const page = parseInt(String(req.query.page || '1'), 10);
  const perPage = parseInt(String(req.query.per_page || '250'), 10);

  res.json({
    success: true,
    page,
    per_page: perPage,
    total_products: 4,
    total_pages: 1,
    has_more: false,
    total_factories: 4,
    total_categories: 4,
    total_price_tables: 4,
    factories: [
      { id: 101, name: 'کارخانه ذوب آهن اصفهان' },
      { id: 102, name: 'کارخانه فولاد مبارکه اصفهان' },
      { id: 103, name: 'فولاد خوزستان' },
      { id: 104, name: 'فولاد نیشابور' }
    ],
    categories: [
      { id: 201, name: 'میلگرد', slug: 'rebar' },
      { id: 202, name: 'تیرآهن', slug: 'beam' },
      { id: 203, name: 'ورق سیاه', slug: 'black-sheet' },
      { id: 204, name: 'نبشی و ناودانی', slug: 'angle-channel' }
    ],
    price_tables: [
      { id: 3001, name: 'جدول قیمت میلگرد ذوب آهن', factory_id: 101, factory_name: 'کارخانه ذوب آهن اصفهان', category_id: 201, category_name: 'میلگرد', assignment_mode: 'MANUAL', manual_product_ids: [2001], active: false },
      { id: 3002, name: 'جدول قیمت تیرآهن ذوب آهن', factory_id: 101, factory_name: 'کارخانه ذوب آهن اصفهان', category_id: 202, category_name: 'تیرآهن', assignment_mode: 'TAXONOMY', active: false },
      { id: 3003, name: 'جدول قیمت ورق سیاه مبارکه', factory_id: 102, factory_name: 'کارخانه فولاد مبارکه اصفهان', category_id: 203, category_name: 'ورق سیاه', assignment_mode: 'TAXONOMY', active: false },
      { id: 3004, name: 'جدول قیمت میلگرد خوزستان', factory_id: 103, factory_name: 'فولاد خوزستان', category_id: 201, category_name: 'میلگرد', assignment_mode: 'TAXONOMY', active: false }
    ],
    products: [
      { post_id: 2001, name: 'میلگرد ۱۴ ذوب آهن (سایت مقصد)', sku: 'REBAR-14-ESF', current_price: 29500, price_status: 2, price_diff: 500, assignment_mode: 'MANUAL', factory_name: 'کارخانه ذوب آهن اصفهان', factory_id: 101, category_name: 'میلگرد', category_id: 201, active: true },
      { post_id: 2002, name: 'تیرآهن ۱۴ ذوب آهن (سایت مقصد)', sku: 'TIR-14-ESF', current_price: 48500, price_status: 0, price_diff: 0, assignment_mode: 'TAXONOMY', factory_name: 'کارخانه ذوب آهن اصفهان', factory_id: 101, category_name: 'تیرآهن', category_id: 202, active: true },
      { post_id: 2003, name: 'ورق سیاه ۲ میل مبارکه (سایت مقصد)', sku: 'ST37-2MM', current_price: 36200, price_status: 1, price_diff: 200, assignment_mode: 'TAXONOMY', factory_name: 'کارخانه فولاد مبارکه اصفهان', factory_id: 102, category_name: 'ورق سیاه', category_id: 203, active: true },
      { post_id: 2004, name: 'میلگرد ۲۰ فولاد خوزستان (سایت مقصد)', sku: 'REBAR-20-KHZ', current_price: 29800, price_status: 0, price_diff: 0, assignment_mode: 'TAXONOMY', factory_name: 'فولاد خوزستان', factory_id: 103, category_name: 'میلگرد', category_id: 201, active: true }
    ],
    message: 'اطلاعات با موفقیت استخراج شد.'
  });
});


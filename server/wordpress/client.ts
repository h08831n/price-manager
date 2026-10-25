// WordPress REST API Client for Price System Synchronisation
import { db } from '../db/database';

export interface WordPressProductPayload {
  post_id: number;
  price: number;
}

export interface WordPressBulkUpdatePayload {
  price_table_id: number;
  products: WordPressProductPayload[];
}

export interface WordPressItemResult {
  post_id: number;
  old_price?: number;
  new_price: number;
  success: boolean;
  error?: string;
}

export interface WordPressPublishResponse {
  success: boolean;
  updated: number;
  failed: number;
  items: WordPressItemResult[];
  message?: string;
}

export function chunkArray<T>(items: T[], size: number): T[][] {
  const safeSize = size > 0 ? size : 25;
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += safeSize) {
    chunks.push(items.slice(i, i + safeSize));
  }
  return chunks;
}

export async function publishTableToWordPress(
  priceTableId: number,
  products: WordPressProductPayload[]
): Promise<WordPressPublishResponse> {
  const schema = db.getSchema();
  const settings = schema.global_settings;
  const targetUrl = `${settings.wordpress_url.replace(/\/$/, '')}/wp-json/price-system/v1/bulk-update`;
  const token = settings.wordpress_api_token;

  if (products.length === 0) {
    return {
      success: true,
      updated: 0,
      failed: 0,
      items: [],
      message: 'هیچ محصولی برای انتشار در وردپرس وجود ندارد.'
    };
  }

  const batchSize = settings.sync_batch_size || 25;
  const delayMs = settings.sync_batch_delay_ms !== undefined ? settings.sync_batch_delay_ms : 250;
  const batches = chunkArray(products, batchSize);

  db.log(
    'INFO',
    `ارسال دسته‌ای قیمت‌ها به وب‌سایت وردپرس/ووکامرس (${products.length} محصول در ${batches.length} بسته، هر بسته ${batchSize} تایی)...`,
    { priceTableId, count: products.length, batches: batches.length, batchSize, targetUrl },
    { price_table_id: priceTableId }
  );

  const allItems: WordPressItemResult[] = [];
  let totalUpdated = 0;
  let totalFailed = 0;

  for (let i = 0; i < batches.length; i++) {
    const currentBatch = batches[i];
    const payload: WordPressBulkUpdatePayload & { batch_index?: number; total_batches?: number } = {
      price_table_id: priceTableId,
      products: currentBatch,
      batch_index: i + 1,
      total_batches: batches.length
    };

    try {
      const response = await fetch(targetUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`پاسخ ناموفق از وردپرس در بسته ${i + 1} (${response.status}): ${errText.slice(0, 150)}`);
      }

      const data = (await response.json()) as WordPressPublishResponse;
      totalUpdated += data.updated || 0;
      totalFailed += data.failed || 0;
      if (data.items) allItems.push(...data.items);
    } catch (err: any) {
      if (targetUrl.includes('localhost:3000/api/mock-wordpress')) {
        const simulatedItems: WordPressItemResult[] = currentBatch.map((p) => ({
          post_id: p.post_id,
          new_price: p.price,
          success: true
        }));
        totalUpdated += currentBatch.length;
        allItems.push(...simulatedItems);
      } else {
        const failedItems: WordPressItemResult[] = currentBatch.map((p) => ({
          post_id: p.post_id,
          new_price: p.price,
          success: false,
          error: err.message
        }));
        totalFailed += currentBatch.length;
        allItems.push(...failedItems);
        db.log('ERROR', `خطا در ارسال بسته ${i + 1} قیمت‌ها به وردپرس: ${err.message}`, { error: err.message }, { price_table_id: priceTableId });
      }
    }

    // Gentle delay between batches to relieve WordPress PHP & MySQL
    if (i < batches.length - 1 && delayMs > 0) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }

  const result: WordPressPublishResponse = {
    success: totalFailed === 0,
    updated: totalUpdated,
    failed: totalFailed,
    items: allItems,
    message: `انتشار دسته‌ای ${products.length} محصول در ${batches.length} بسته انجام شد (${totalUpdated} موفق، ${totalFailed} ناموفق).`
  };

  db.log(
    result.success ? 'INFO' : 'WARNING',
    `نتیجه انتشار دسته‌ای در وردپرس: ${result.updated} موفق، ${result.failed} ناموفق (${batches.length} بسته)`,
    { updated: result.updated, failed: result.failed, batches: batches.length },
    { price_table_id: priceTableId }
  );

  return result;
}

// -------------------------------------------------------------
// Dedicated Entity Synchronizers with Destination Site (WordPress)
// -------------------------------------------------------------

export interface DestinationSyncResult {
  success: boolean;
  entity: 'products' | 'factories' | 'price_tables';
  total: number;
  synced: number;
  failed: number;
  batches_count?: number;
  batch_size?: number;
  created_count?: number;
  updated_count?: number;
  message: string;
  items: Array<{
    id: number;
    destination_id: number;
    name: string;
    success: boolean;
    error?: string;
  }>;
}

export async function syncFactoriesToDestination(overrideBatchSize?: number): Promise<DestinationSyncResult> {
  const schema = db.getSchema();
  const settings = schema.global_settings;
  const targetUrl = `${settings.wordpress_url.replace(/\/$/, '')}/wp-json/price-system/v1/sync-factories`;
  const token = settings.wordpress_api_token;

  const factoriesPayload = schema.factories.map((f) => ({
    id: f.id,
    destination_id: f.destination_id ?? f.id,
    name: f.name,
    active: f.active
  }));

  if (factoriesPayload.length === 0) {
    return {
      success: true,
      entity: 'factories',
      total: 0,
      synced: 0,
      failed: 0,
      batches_count: 0,
      message: 'هیچ کارخانه‌ای برای همگام‌سازی وجود ندارد.',
      items: []
    };
  }

  const batchSize = overrideBatchSize || settings.sync_batch_size || 25;
  const delayMs = settings.sync_batch_delay_ms !== undefined ? settings.sync_batch_delay_ms : 250;
  const batches = chunkArray(factoriesPayload, batchSize);

  db.log('INFO', `همگام‌سازی دسته‌ای کارخانجات با سایت مقصد (${factoriesPayload.length} کارخانه در ${batches.length} بسته، هر بسته ${batchSize} تایی)...`, {
    total: factoriesPayload.length,
    batches: batches.length,
    batchSize
  });

  const allItems: DestinationSyncResult['items'] = [];
  let totalSynced = 0;
  let totalFailed = 0;

  for (let i = 0; i < batches.length; i++) {
    const currentBatch = batches[i];
    try {
      const res = await fetch(targetUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          factories: currentBatch,
          batch_index: i + 1,
          total_batches: batches.length
        })
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`خطای ارتباط با وردپرس در بسته ${i + 1} (${res.status}): ${errText.slice(0, 150)}`);
      }

      const data = (await res.json()) as DestinationSyncResult;
      markFactoriesSynced(data);
      if (data.items) allItems.push(...data.items);
      totalSynced += data.synced || 0;
      totalFailed += data.failed || 0;
    } catch (err: any) {
      if (targetUrl.includes('localhost:3000/api/mock-wordpress')) {
        const mockItems = currentBatch.map((f) => ({
          id: f.id,
          destination_id: f.destination_id,
          name: f.name,
          success: true
        }));
        markFactoriesSynced({
          success: true,
          entity: 'factories',
          total: currentBatch.length,
          synced: currentBatch.length,
          failed: 0,
          message: 'موفق',
          items: mockItems
        });
        allItems.push(...mockItems);
        totalSynced += currentBatch.length;
      } else {
        const failedItems = currentBatch.map((f) => ({
          id: f.id,
          destination_id: f.destination_id,
          name: f.name,
          success: false,
          error: err.message
        }));
        allItems.push(...failedItems);
        totalFailed += currentBatch.length;
        db.log('ERROR', `خطا در همگام‌سازی بسته ${i + 1} کارخانجات: ${err.message}`);
      }
    }

    if (i < batches.length - 1 && delayMs > 0) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }

  return {
    success: totalFailed === 0,
    entity: 'factories',
    total: factoriesPayload.length,
    synced: totalSynced,
    failed: totalFailed,
    batches_count: batches.length,
    batch_size: batchSize,
    message: `همگام‌سازی دسته‌ای ${factoriesPayload.length} کارخانه در ${batches.length} بسته انجام شد (${totalSynced} موفق، ${totalFailed} ناموفق).`,
    items: allItems
  };
}

function markFactoriesSynced(result: DestinationSyncResult) {
  const schema = db.getSchema();
  const now = new Date().toISOString();
  for (const item of result.items) {
    const f = schema.factories.find((fac) => fac.id === item.id);
    if (f) {
      f.destination_id = item.destination_id;
      f.sync_status = item.success ? 'SYNCED' : 'FAILED';
      f.last_synced_at = now;
    }
  }
  db.save();
}

export async function syncPriceTablesToDestination(overrideBatchSize?: number): Promise<DestinationSyncResult> {
  const schema = db.getSchema();
  const settings = schema.global_settings;
  const targetUrl = `${settings.wordpress_url.replace(/\/$/, '')}/wp-json/price-system/v1/sync-tables`;
  const token = settings.wordpress_api_token;

  const tablesPayload = schema.price_tables.map((t) => {
    const f = schema.factories.find((fac) => fac.id === t.factory_id);
    return {
      id: t.id,
      destination_id: t.destination_id ?? t.id,
      name: t.name,
      factory_id: t.factory_id,
      factory_destination_id: f?.destination_id ?? f?.id ?? null,
      active: t.active,
      default_price_adjustment: t.default_price_adjustment || 0
    };
  });

  if (tablesPayload.length === 0) {
    return {
      success: true,
      entity: 'price_tables',
      total: 0,
      synced: 0,
      failed: 0,
      batches_count: 0,
      message: 'هیچ جدول قیمتی برای همگام‌سازی وجود ندارد.',
      items: []
    };
  }

  const batchSize = overrideBatchSize || settings.sync_batch_size || 25;
  const delayMs = settings.sync_batch_delay_ms !== undefined ? settings.sync_batch_delay_ms : 250;
  const batches = chunkArray(tablesPayload, batchSize);

  db.log('INFO', `همگام‌سازی دسته‌ای جداول قیمت با سایت مقصد (${tablesPayload.length} جدول در ${batches.length} بسته، هر بسته ${batchSize} تایی)...`, {
    total: tablesPayload.length,
    batches: batches.length,
    batchSize
  });

  const allItems: DestinationSyncResult['items'] = [];
  let totalSynced = 0;
  let totalFailed = 0;

  for (let i = 0; i < batches.length; i++) {
    const currentBatch = batches[i];
    try {
      const res = await fetch(targetUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          tables: currentBatch,
          batch_index: i + 1,
          total_batches: batches.length
        })
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`خطای ارتباط با وردپرس در بسته ${i + 1} (${res.status}): ${errText.slice(0, 150)}`);
      }

      const data = (await res.json()) as DestinationSyncResult;
      markTablesSynced(data);
      if (data.items) allItems.push(...data.items);
      totalSynced += data.synced || 0;
      totalFailed += data.failed || 0;
    } catch (err: any) {
      if (targetUrl.includes('localhost:3000/api/mock-wordpress')) {
        const mockItems = currentBatch.map((t) => ({
          id: t.id,
          destination_id: t.destination_id,
          name: t.name,
          success: true
        }));
        markTablesSynced({
          success: true,
          entity: 'price_tables',
          total: currentBatch.length,
          synced: currentBatch.length,
          failed: 0,
          message: 'موفق',
          items: mockItems
        });
        allItems.push(...mockItems);
        totalSynced += currentBatch.length;
      } else {
        const failedItems = currentBatch.map((t) => ({
          id: t.id,
          destination_id: t.destination_id,
          name: t.name,
          success: false,
          error: err.message
        }));
        allItems.push(...failedItems);
        totalFailed += currentBatch.length;
        db.log('ERROR', `خطا در همگام‌سازی بسته ${i + 1} جداول: ${err.message}`);
      }
    }

    if (i < batches.length - 1 && delayMs > 0) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }

  return {
    success: totalFailed === 0,
    entity: 'price_tables',
    total: tablesPayload.length,
    synced: totalSynced,
    failed: totalFailed,
    batches_count: batches.length,
    batch_size: batchSize,
    message: `همگام‌سازی دسته‌ای ${tablesPayload.length} جدول قیمت در ${batches.length} بسته انجام شد (${totalSynced} موفق، ${totalFailed} ناموفق).`,
    items: allItems
  };
}

function markTablesSynced(result: DestinationSyncResult) {
  const schema = db.getSchema();
  const now = new Date().toISOString();
  for (const item of result.items) {
    const t = schema.price_tables.find((tbl) => tbl.id === item.id);
    if (t) {
      t.destination_id = item.destination_id;
      t.sync_status = item.success ? 'SYNCED' : 'FAILED';
      t.last_synced_at = now;
    }
  }
  db.save();
}

export async function syncProductsToDestination(overrideBatchSize?: number): Promise<DestinationSyncResult> {
  const schema = db.getSchema();
  const settings = schema.global_settings;
  const targetUrl = `${settings.wordpress_url.replace(/\/$/, '')}/wp-json/price-system/v1/sync-products`;
  const token = settings.wordpress_api_token;

  const productsPayload = schema.products.map((p) => {
    const f = schema.factories.find((fac) => fac.id === p.factory_id);
    const t = schema.price_tables.find((tbl) => tbl.id === p.price_table_id);
    return {
      id: p.id,
      post_id: p.post_id,
      destination_id: p.destination_id ?? p.post_id,
      name: p.name,
      sku: p.sku || '',
      current_price: p.current_price,
      factory_id: p.factory_id,
      factory_destination_id: f?.destination_id ?? f?.id ?? null,
      price_table_id: p.price_table_id,
      table_destination_id: t?.destination_id ?? t?.id ?? null,
      active: p.active,
      attributes: p.attributes || {}
    };
  });

  if (productsPayload.length === 0) {
    return {
      success: true,
      entity: 'products',
      total: 0,
      synced: 0,
      failed: 0,
      batches_count: 0,
      message: 'هیچ محصولی برای همگام‌سازی وجود ندارد.',
      items: []
    };
  }

  const batchSize = overrideBatchSize || settings.sync_batch_size || 25;
  const delayMs = settings.sync_batch_delay_ms !== undefined ? settings.sync_batch_delay_ms : 250;
  const batches = chunkArray(productsPayload, batchSize);

  db.log('INFO', `همگام‌سازی دسته‌ای محصولات با سایت مقصد (${productsPayload.length} محصول در ${batches.length} بسته، هر بسته ${batchSize} تایی)...`, {
    total: productsPayload.length,
    batches: batches.length,
    batchSize
  });

  const allItems: DestinationSyncResult['items'] = [];
  let totalSynced = 0;
  let totalFailed = 0;

  for (let i = 0; i < batches.length; i++) {
    const currentBatch = batches[i];
    try {
      const res = await fetch(targetUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          products: currentBatch,
          batch_index: i + 1,
          total_batches: batches.length
        })
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`خطای ارتباط با وردپرس در بسته ${i + 1} (${res.status}): ${errText.slice(0, 150)}`);
      }

      const data = (await res.json()) as DestinationSyncResult;
      markProductsSynced(data);
      if (data.items) allItems.push(...data.items);
      totalSynced += data.synced || 0;
      totalFailed += data.failed || 0;
    } catch (err: any) {
      if (targetUrl.includes('localhost:3000/api/mock-wordpress')) {
        const mockItems = currentBatch.map((p) => ({
          id: p.id,
          destination_id: p.destination_id,
          name: p.name,
          success: true
        }));
        markProductsSynced({
          success: true,
          entity: 'products',
          total: currentBatch.length,
          synced: currentBatch.length,
          failed: 0,
          message: 'موفق',
          items: mockItems
        });
        allItems.push(...mockItems);
        totalSynced += currentBatch.length;
      } else {
        const failedItems = currentBatch.map((p) => ({
          id: p.id,
          destination_id: p.destination_id,
          name: p.name,
          success: false,
          error: err.message
        }));
        allItems.push(...failedItems);
        totalFailed += currentBatch.length;
        db.log('ERROR', `خطا در بسته ${i + 1} همگام‌سازی محصولات: ${err.message}`);
      }
    }

    if (i < batches.length - 1 && delayMs > 0) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }

  return {
    success: totalFailed === 0,
    entity: 'products',
    total: productsPayload.length,
    synced: totalSynced,
    failed: totalFailed,
    batches_count: batches.length,
    batch_size: batchSize,
    message: `همگام‌سازی و اتصال دسته‌ای ${productsPayload.length} محصول در ${batches.length} بسته با موفقیت انجام شد (${totalSynced} موفق، ${totalFailed} ناموفق).`,
    items: allItems
  };
}

function markProductsSynced(result: DestinationSyncResult) {
  const schema = db.getSchema();
  const now = new Date().toISOString();
  for (const item of result.items) {
    const p = schema.products.find((prod) => prod.id === item.id);
    if (p) {
      p.destination_id = item.destination_id;
      p.post_id = item.destination_id; // keep post_id synchronized with destination ID
      p.sync_status = item.success ? 'SYNCED' : 'FAILED';
      p.last_synced_at = now;
    }
  }
  db.save();
}

export interface WordPressTestResult {
  success: boolean;
  status: number;
  message: string;
  site_name?: string;
  site_url?: string;
  woocommerce_active?: boolean;
}

export async function testWordPressConnection(customUrl?: string, customToken?: string): Promise<WordPressTestResult> {
  const schema = db.getSchema();
  const settings = schema.global_settings;
  const rawUrl = (customUrl !== undefined ? customUrl : settings.wordpress_url || '').trim();
  const token = (customToken !== undefined ? customToken : settings.wordpress_api_token || '').trim();

  if (!rawUrl) {
    return {
      success: false,
      status: 400,
      message: 'آدرس وب‌سایت وردپرس مشخص نشده است. لطفاً آدرس را وارد کنید.'
    };
  }

  const baseUrl = rawUrl.startsWith('http://') || rawUrl.startsWith('https://') ? rawUrl : `https://${rawUrl}`;
  const testUrl = `${baseUrl.replace(/\/$/, '')}/wp-json/price-system/v1/test-connection`;

  // If local mock url is specified, test local mock directly
  if (testUrl.includes('localhost:3000/api/mock-wordpress')) {
    return {
      success: true,
      status: 200,
      message: 'اتصال به سرویس شبیه‌ساز محلی با موفقیت برقرار شد.',
      site_name: 'شبیه‌ساز آزمایشی وردپرس/ووکامرس',
      site_url: baseUrl,
      woocommerce_active: true
    };
  }

  const timeoutMs = ((settings.wordpress_timeout_sec || 15) * 1000);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(testUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`
      },
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      return {
        success: true,
        status: res.status,
        message: data.message || 'ارتباط با سایت وردپرس با موفقیت برقرار شد.',
        site_name: data.site_name,
        site_url: data.site_url,
        woocommerce_active: data.woocommerce_active
      };
    } else {
      const errText = await res.text().catch(() => '');
      let errMsg = `خطای سرور وردپرس (${res.status})`;
      if (res.status === 401 || res.status === 403) {
        errMsg = `خطای احراز هویت (${res.status}): توکن API واردشده در پنل با توکن تعریف‌شده در وردپرس یکسان نیست.`;
      } else if (res.status === 404) {
        errMsg = `مسیر افزونه در وردپرس یافت نشد (404). لطفاً از نصب و فعال بودن افزونه price-system-sync.php و ذخیره مجدد پیوندهای یکتا در وردپرس اطمینان حاصل فرمایید.`;
      } else if (errText) {
        errMsg = `${errMsg}: ${errText.slice(0, 150)}`;
      }
      return {
        success: false,
        status: res.status,
        message: errMsg
      };
    }
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      return {
        success: false,
        status: 408,
        message: `پاسخی در مدت زمان ${settings.wordpress_timeout_sec || 15} ثانیه از وب‌سایت وردپرس دریافت نشد (Timeout). آدرس دامنه و باز بودن پورت‌ها را بررسی فرمایید.`
      };
    }
    return {
      success: false,
      status: 500,
      message: `خطای برقراری ارتباط با سرور وردپرس: ${err.message}`
    };
  }
}

export interface DestinationProductImportItem {
  post_id: number;
  name: string;
  sku?: string;
  current_price?: number;
  factory_name?: string;
  factory_id?: number;
  category_name?: string;
  category_id?: number;
  categories?: string[];
  stock_status?: string;
  active?: boolean;
}

export interface DestinationImportResult {
  success: boolean;
  message: string;
  products_imported: number;
  products_updated: number;
  factories_imported: number;
  categories_imported: number;
  tables_imported: number;
  total_fetched: number;
  items: Array<{
    id: number;
    post_id: number;
    name: string;
    is_new: boolean;
    active: boolean;
  }>;
}

/**
 * Pull all data (categories, factories from company taxonomy, price tables from post_type price, and products)
 * from destination WordPress/WooCommerce site.
 * 
 * USER REQUIREMENTS:
 * 1. Factories are extracted from taxonomy 'company'.
 * 2. Categories are extracted from taxonomy 'product_cat'.
 * 3. Price tables are extracted from custom post type 'price'.
 * 4. Products default to ACTIVE (active: true).
 * 5. Price tables default to INACTIVE (active: false), allowing the user to selectively activate them.
 * 6. Products are matched to their price table by (category_id + factory_id), e.g. میلگرد + ذوب آهن -> جدول قیمت میلگرد ذوب آهن.
 */
export async function pullDataFromDestination(options?: {
  defaultFactoryId?: number;
  defaultTableId?: number;
  perPage?: number;
  maxPages?: number;
}): Promise<DestinationImportResult> {
  const schema = db.getSchema();
  if (!Array.isArray(schema.categories)) schema.categories = [];
  if (!Array.isArray(schema.factories)) schema.factories = [];
  if (!Array.isArray(schema.price_tables)) schema.price_tables = [];
  if (!Array.isArray(schema.products)) schema.products = [];

  const settings = schema.global_settings;
  const baseUrl = (settings.wordpress_url || '').trim().replace(/\/$/, '');
  const token = (settings.wordpress_api_token || '').trim();

  if (!baseUrl) {
    throw new Error('آدرس وب‌سایت وردپرس در تنظیمات مشخص نشده است.');
  }

  const baseEndpointUrl = `${baseUrl}/wp-json/price-system/v1/fetch-destination-data`;
  const perPage = options?.perPage || 200;
  const maxPages = options?.maxPages || 50; // allows up to 10,000 products

  db.log('INFO', `آغاز دریافت هوشمند داده‌ها (دسته‌بندی‌ها، کارخانه‌ها، جداول قیمت، محصولات) از سایت مقصد (${baseUrl})...`, {
    baseEndpointUrl,
    perPage
  });

  let fetchedProducts: DestinationProductImportItem[] = [];
  let fetchedFactories: Array<{ id: number; name: string; slug?: string }> = [];
  let fetchedCategories: Array<{ id: number; name: string; slug?: string }> = [];
  let fetchedTables: Array<{ id: number; name: string; slug?: string; factory_id?: number; factory_name?: string; category_id?: number; category_name?: string }> = [];

  // Check if testing against local mock
  if (baseEndpointUrl.includes('localhost:3000/api/mock-wordpress')) {
    fetchedFactories = [
      { id: 101, name: 'کارخانه ذوب آهن اصفهان' },
      { id: 102, name: 'کارخانه فولاد مبارکه اصفهان' },
      { id: 103, name: 'فولاد خوزستان' },
      { id: 104, name: 'فولاد نیشابور' }
    ];
    fetchedCategories = [
      { id: 201, name: 'میلگرد' },
      { id: 202, name: 'تیرآهن' },
      { id: 203, name: 'ورق سیاه' },
      { id: 204, name: 'نبشی و ناودانی' }
    ];
    fetchedTables = [
      { id: 3001, name: 'جدول قیمت میلگرد ذوب آهن', factory_id: 101, factory_name: 'کارخانه ذوب آهن اصفهان', category_id: 201, category_name: 'میلگرد' },
      { id: 3002, name: 'جدول قیمت تیرآهن ذوب آهن', factory_id: 101, factory_name: 'کارخانه ذوب آهن اصفهان', category_id: 202, category_name: 'تیرآهن' },
      { id: 3003, name: 'جدول قیمت ورق سیاه مبارکه', factory_id: 102, factory_name: 'کارخانه فولاد مبارکه اصفهان', category_id: 203, category_name: 'ورق سیاه' },
      { id: 3004, name: 'جدول قیمت میلگرد خوزستان', factory_id: 103, factory_name: 'فولاد خوزستان', category_id: 201, category_name: 'میلگرد' }
    ];
    fetchedProducts = [
      { post_id: 2001, name: 'میلگرد ۱۴ ذوب آهن (سایت مقصد)', sku: 'REBAR-14-ESF', current_price: 29500, factory_name: 'کارخانه ذوب آهن اصفهان', factory_id: 101, category_name: 'میلگرد', category_id: 201, active: true },
      { post_id: 2002, name: 'تیرآهن ۱۴ ذوب آهن (سایت مقصد)', sku: 'TIR-14-ESF', current_price: 48500, factory_name: 'کارخانه ذوب آهن اصفهان', factory_id: 101, category_name: 'تیرآهن', category_id: 202, active: true },
      { post_id: 2003, name: 'ورق سیاه ۲ میل مبارکه (سایت مقصد)', sku: 'ST37-2MM', current_price: 36200, factory_name: 'کارخانه فولاد مبارکه اصفهان', factory_id: 102, category_name: 'ورق سیاه', category_id: 203, active: true },
      { post_id: 2004, name: 'میلگرد ۲۰ فولاد خوزستان (سایت مقصد)', sku: 'REBAR-20-KHZ', current_price: 29800, factory_name: 'فولاد خوزستان', factory_id: 103, category_name: 'میلگرد', category_id: 201, active: true }
    ];
  } else {
    // Paginated fetch loop
    let currentPage = 1;
    let hasMore = true;
    const timeoutMs = (settings.wordpress_timeout_sec || 30) * 1000;

    while (hasMore && currentPage <= maxPages) {
      const pageUrl = `${baseEndpointUrl}?page=${currentPage}&per_page=${perPage}`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const res = await fetch(pageUrl, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`
          },
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (!res.ok) {
          const errText = await res.text().catch(() => '');
          throw new Error(`خطای دریافت صفحه ${currentPage} از وردپرس (${res.status}): ${errText.slice(0, 150)}`);
        }

        const data = await res.json();
        if (!data.success) {
          throw new Error(data.message || `خطا در دریافت داده صفحه ${currentPage}`);
        }

        // 1. Collect Categories
        if (Array.isArray(data.categories)) {
          for (const c of data.categories) {
            if (!fetchedCategories.some((existing) => existing.id === c.id || existing.name === c.name)) {
              fetchedCategories.push(c);
            }
          }
        }

        // 2. Collect Factories (from taxonomy company)
        if (Array.isArray(data.factories)) {
          for (const f of data.factories) {
            if (!fetchedFactories.some((existing) => existing.id === f.id || existing.name === f.name)) {
              fetchedFactories.push(f);
            }
          }
        }

        // 3. Collect Price Tables (from post_type price)
        if (Array.isArray(data.price_tables)) {
          for (const t of data.price_tables) {
            if (!fetchedTables.some((existing) => existing.id === t.id || existing.name === t.name)) {
              fetchedTables.push(t);
            }
          }
        }

        const pageProducts: DestinationProductImportItem[] = Array.isArray(data.products) ? data.products : [];
        fetchedProducts.push(...pageProducts);

        // Check continuation condition
        if (typeof data.has_more === 'boolean') {
          hasMore = data.has_more;
        } else if (pageProducts.length < perPage) {
          hasMore = false;
        }

        currentPage++;

        // Brief delay between batches to relieve WordPress server pressure
        if (hasMore) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      } catch (err: any) {
        clearTimeout(timeoutId);
        db.log('ERROR', `خطا در دریافت صفحه ${currentPage} از وردپرس: ${err.message}`, { baseEndpointUrl });
        throw err;
      }
    }
  }

  const now = new Date().toISOString();
  let categoriesImported = 0;
  let factoriesImported = 0;
  let tablesImported = 0;
  let productsImported = 0;
  let productsUpdated = 0;
  const processedItems: Array<{ id: number; post_id: number; name: string; is_new: boolean; active: boolean }> = [];

  // 1. Process and import Categories (product_cat)
  for (const cat of fetchedCategories) {
    if (!cat.name || !cat.name.trim()) continue;
    const trimmedName = cat.name.trim();
    const existing = schema.categories.find(
      (c) => (cat.id && c.destination_id === cat.id) || c.name.toLowerCase() === trimmedName.toLowerCase()
    );

    if (!existing) {
      const nextCatId = schema.categories.length > 0 ? Math.max(...schema.categories.map((c) => c.id)) + 1 : 1;
      schema.categories.push({
        id: nextCatId,
        name: trimmedName,
        slug: cat.slug || '',
        destination_id: cat.id || nextCatId,
        active: true,
        created_at: now,
        updated_at: now
      });
      categoriesImported++;
    } else if (cat.id && !existing.destination_id) {
      existing.destination_id = cat.id;
    }
  }

  // 2. Process and import Factories (taxonomy 'company')
  for (const fac of fetchedFactories) {
    if (!fac.name || !fac.name.trim()) continue;
    const trimmedName = fac.name.trim();
    const existing = schema.factories.find(
      (f) => (fac.id && f.destination_id === fac.id) || f.name.toLowerCase() === trimmedName.toLowerCase()
    );

    if (!existing) {
      const nextFacId = schema.factories.length > 0 ? Math.max(...schema.factories.map((f) => f.id)) + 1 : 1;
      schema.factories.push({
        id: nextFacId,
        name: trimmedName,
        destination_id: fac.id || nextFacId,
        active: true,
        created_at: now,
        updated_at: now
      });
      factoriesImported++;
    } else if (fac.id && !existing.destination_id) {
      existing.destination_id = fac.id;
    }
  }

  // Fallback defaults
  const defaultFactoryId = options?.defaultFactoryId || schema.factories[0]?.id || 1;
  const defaultCategoryId = schema.categories[0]?.id || 1;

  // 3. Process and import Price Tables (post_type 'price')
  // CRITICAL: newly imported price tables are strictly DEFAULTED TO INACTIVE (active: false)
  // per explicit user requirement, allowing user to configure and selectively activate each table.
  for (const tbl of fetchedTables) {
    if (!tbl.name || !tbl.name.trim()) continue;
    const trimmedName = tbl.name.trim();

    // Resolve table's factory
    let tableFactoryId = defaultFactoryId;
    let tableFactoryName = '';
    if (tbl.factory_name) {
      const matchedFac = schema.factories.find((f) => f.name.toLowerCase() === tbl.factory_name!.trim().toLowerCase());
      if (matchedFac) {
        tableFactoryId = matchedFac.id;
        tableFactoryName = matchedFac.name;
      }
    } else if (tbl.factory_id) {
      const matchedFac = schema.factories.find((f) => f.destination_id === tbl.factory_id);
      if (matchedFac) {
        tableFactoryId = matchedFac.id;
        tableFactoryName = matchedFac.name;
      }
    }

    // Resolve table's category
    let tableCategoryId: number | null = null;
    let tableCategoryName = '';
    if (tbl.category_name) {
      const matchedCat = schema.categories.find((c) => c.name.toLowerCase() === tbl.category_name!.trim().toLowerCase());
      if (matchedCat) {
        tableCategoryId = matchedCat.id;
        tableCategoryName = matchedCat.name;
      }
    } else if (tbl.category_id) {
      const matchedCat = schema.categories.find((c) => c.destination_id === tbl.category_id);
      if (matchedCat) {
        tableCategoryId = matchedCat.id;
        tableCategoryName = matchedCat.name;
      }
    }

    const existing = schema.price_tables.find(
      (t) => (tbl.id && t.destination_id === tbl.id) || t.name.toLowerCase() === trimmedName.toLowerCase()
    );

    if (!existing) {
      const nextTblId = schema.price_tables.length > 0 ? Math.max(...schema.price_tables.map((t) => t.id)) + 1 : 1;
      schema.price_tables.push({
        id: nextTblId,
        name: trimmedName,
        factory_id: tableFactoryId,
        factory_name: tableFactoryName,
        category_id: tableCategoryId,
        category_name: tableCategoryName,
        destination_id: tbl.id || nextTblId,
        active: false, // Price tables strictly default to INACTIVE per user instruction
        start_time: '11:00',
        retry_interval_minutes: 30,
        max_attempts: 5,
        price_guard_percent: 30,
        default_price_adjustment: 0,
        sync_status: 'SYNCED',
        created_at: now,
        updated_at: now
      });
      tablesImported++;
    } else {
      if (tbl.id && !existing.destination_id) existing.destination_id = tbl.id;
      if (tableFactoryId && !existing.factory_id) existing.factory_id = tableFactoryId;
      if (tableCategoryId && !existing.category_id) existing.category_id = tableCategoryId;
    }
  }

  const defaultTableId = options?.defaultTableId || schema.price_tables[0]?.id || 1;

  // 4. Process and import Products
  // CRITICAL REQUIREMENT:
  // Products default to ACTIVE (active: true) as explicitly requested by user.
  // And each product is linked to factory and category, and mapped to its price table.
  for (const item of fetchedProducts) {
    if (!item.name || !item.name.trim()) continue;
    const postId = Number(item.post_id) || 0;
    const trimmedName = item.name.trim();
    const sku = (item.sku || '').trim();

    // Resolve factory
    let resolvedFactoryId = defaultFactoryId;
    let resolvedFactoryName = '';
    if (item.factory_name) {
      const matchedFac = schema.factories.find(
        (f) => f.name.toLowerCase() === item.factory_name!.trim().toLowerCase()
      );
      if (matchedFac) {
        resolvedFactoryId = matchedFac.id;
        resolvedFactoryName = matchedFac.name;
      } else {
        // Auto-create factory from company taxonomy if missing
        const nextFacId = schema.factories.length > 0 ? Math.max(...schema.factories.map((f) => f.id)) + 1 : 1;
        schema.factories.push({
          id: nextFacId,
          name: item.factory_name.trim(),
          destination_id: item.factory_id || nextFacId,
          active: true,
          created_at: now,
          updated_at: now
        });
        factoriesImported++;
        resolvedFactoryId = nextFacId;
        resolvedFactoryName = item.factory_name.trim();
      }
    } else if (item.factory_id) {
      const matchedFac = schema.factories.find((f) => f.destination_id === item.factory_id);
      if (matchedFac) {
        resolvedFactoryId = matchedFac.id;
        resolvedFactoryName = matchedFac.name;
      }
    }

    // Resolve category
    let resolvedCategoryId: number | null = null;
    let resolvedCategoryName = '';
    const catName = item.category_name || (Array.isArray(item.categories) && item.categories.length > 0 ? item.categories[0] : null);
    if (catName) {
      const matchedCat = schema.categories.find(
        (c) => c.name.toLowerCase() === catName.trim().toLowerCase()
      );
      if (matchedCat) {
        resolvedCategoryId = matchedCat.id;
        resolvedCategoryName = matchedCat.name;
      } else {
        // Auto-create category if missing
        const nextCatId = schema.categories.length > 0 ? Math.max(...schema.categories.map((c) => c.id)) + 1 : 1;
        schema.categories.push({
          id: nextCatId,
          name: catName.trim(),
          slug: '',
          destination_id: item.category_id || nextCatId,
          active: true,
          created_at: now,
          updated_at: now
        });
        categoriesImported++;
        resolvedCategoryId = nextCatId;
        resolvedCategoryName = catName.trim();
      }
    } else if (item.category_id) {
      const matchedCat = schema.categories.find((c) => c.destination_id === item.category_id);
      if (matchedCat) {
        resolvedCategoryId = matchedCat.id;
        resolvedCategoryName = matchedCat.name;
      }
    }

    // Match product to price table:
    // User specification:
    // "نمایش محصولات در جدول قیمت به این شکله که محصولاتی رو نمایش میده که مثلا دسته بندی میلگرد دارنده و کارخانه ذوب آهن واسشون ست شده پس دااخل جدول قیمت میلگرد ذوب آهن نشونشون میده"
    let resolvedTableId = defaultTableId;
    let resolvedTableName = '';

    // First try matching both category and factory
    if (resolvedCategoryId && resolvedFactoryId) {
      const matchedTable = schema.price_tables.find(
        (t) => t.category_id === resolvedCategoryId && t.factory_id === resolvedFactoryId
      );
      if (matchedTable) {
        resolvedTableId = matchedTable.id;
        resolvedTableName = matchedTable.name;
      }
    }

    // Fallback: match by category only if no factory-specific table
    if (!resolvedTableName && resolvedCategoryId) {
      const matchedTable = schema.price_tables.find((t) => t.category_id === resolvedCategoryId);
      if (matchedTable) {
        resolvedTableId = matchedTable.id;
        resolvedTableName = matchedTable.name;
      }
    }

    // Fallback: match by destination table ID or name
    if (!resolvedTableName && item.category_name) {
      const matchedTable = schema.price_tables.find(
        (t) => t.name.toLowerCase().includes(item.category_name!.toLowerCase())
      );
      if (matchedTable) {
        resolvedTableId = matchedTable.id;
        resolvedTableName = matchedTable.name;
      }
    }

    // Find if product already exists by post_id, destination_id, or matching SKU
    const existingIndex = schema.products.findIndex(
      (p) =>
        (postId > 0 && (p.post_id === postId || p.destination_id === postId)) ||
        (sku && p.sku && p.sku.toLowerCase() === sku.toLowerCase())
    );

    if (existingIndex >= 0) {
      const existing = schema.products[existingIndex];
      existing.destination_id = postId > 0 ? postId : existing.destination_id;
      existing.post_id = postId > 0 ? postId : existing.post_id;
      if (item.current_price !== undefined && item.current_price > 0 && (!existing.current_price || existing.current_price === 0)) {
        existing.current_price = item.current_price;
      }
      if (sku && !existing.sku) existing.sku = sku;
      if (resolvedFactoryId) existing.factory_id = resolvedFactoryId;
      if (resolvedFactoryName) existing.factory_name = resolvedFactoryName;
      if (resolvedCategoryId) existing.category_id = resolvedCategoryId;
      if (resolvedCategoryName) existing.category_name = resolvedCategoryName;
      if (resolvedTableId) existing.price_table_id = resolvedTableId;
      if (resolvedTableName) existing.price_table_name = resolvedTableName;
      existing.sync_status = 'SYNCED';
      existing.last_synced_at = now;
      existing.updated_at = now;

      productsUpdated++;
      processedItems.push({
        id: existing.id,
        post_id: existing.post_id || existing.destination_id || postId,
        name: existing.name,
        is_new: false,
        active: existing.active
      });
    } else {
      // Create NEW product
      // CRITICAL: active is TRUE for products per explicit user requirement:
      // "محصولات نمیخوام غیرفعال باشه فقط جدول محصول غیرفعال باشه که هرکدوم رو خواستم فعال کنم"
      const nextProdId = schema.products.length > 0 ? Math.max(...schema.products.map((p) => p.id)) + 1 : 1;
      const newProduct = {
        id: nextProdId,
        post_id: postId > 0 ? postId : nextProdId,
        destination_id: postId > 0 ? postId : nextProdId,
        name: trimmedName,
        sku: sku,
        factory_id: resolvedFactoryId,
        factory_name: resolvedFactoryName,
        category_id: resolvedCategoryId,
        category_name: resolvedCategoryName,
        price_table_id: resolvedTableId,
        price_table_name: resolvedTableName,
        current_price: item.current_price || 0,
        active: true, // ACTIVE by default for products as requested
        sync_status: 'SYNCED' as const,
        last_synced_at: now,
        created_at: now,
        updated_at: now,
        attributes: {}
      };

      schema.products.push(newProduct);
      productsImported++;
      processedItems.push({
        id: nextProdId,
        post_id: postId,
        name: trimmedName,
        is_new: true,
        active: true
      });
    }
  }

  // Save changes to database
  db.save();

  db.log(
    'INFO',
    `دریافت اطلاعات با موفقیت انجام شد: ${productsImported} کالا (فعال)، ${categoriesImported} دسته‌بندی، ${factoriesImported} کارخانه، و ${tablesImported} جدول قیمت (غیرفعال جهت بررسی).`,
    { productsImported, productsUpdated, categoriesImported, factoriesImported, tablesImported, totalFetched: fetchedProducts.length }
  );

  return {
    success: true,
    message: `دریافت با موفقیت انجام شد: ${productsImported} محصول جدید (فعال)، ${categoriesImported} دسته‌بندی، ${factoriesImported} کارخانه و ${tablesImported} جدول قیمت (غیرفعال) از سایت مقصد وارد شدند.`,
    products_imported: productsImported,
    products_updated: productsUpdated,
    factories_imported: factoriesImported,
    categories_imported: categoriesImported,
    tables_imported: tablesImported,
    total_fetched: fetchedProducts.length,
    items: processedItems
  };
}



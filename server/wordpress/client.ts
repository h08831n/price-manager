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
 * Pull all data (products, factories, price tables) from destination WordPress/WooCommerce site.
 * Supports paginated streaming (page by page) so sites with >1000 or >5000 products can be
 * imported completely without memory exhaustion or timeout.
 * 
 * CRITICAL REQUIREMENT:
 * All newly imported products are STRICTLY DEFAULTED TO INACTIVE (active: false),
 * allowing the user to inspect, configure selectors, and selectively activate them.
 */
export async function pullDataFromDestination(options?: {
  defaultFactoryId?: number;
  defaultTableId?: number;
  perPage?: number;
  maxPages?: number;
}): Promise<DestinationImportResult> {
  const schema = db.getSchema();
  const settings = schema.global_settings;
  const baseUrl = (settings.wordpress_url || '').trim().replace(/\/$/, '');
  const token = (settings.wordpress_api_token || '').trim();

  if (!baseUrl) {
    throw new Error('آدرس وب‌سایت وردپرس در تنظیمات مشخص نشده است.');
  }

  const baseEndpointUrl = `${baseUrl}/wp-json/price-system/v1/fetch-destination-data`;
  const perPage = options?.perPage || 200;
  const maxPages = options?.maxPages || 50; // allows up to 10,000 products

  db.log('INFO', `آغاز دریافت هوشمند داده‌ها (محصولات، جداول قیمت، کارخانه‌ها) از سایت مقصد (${baseUrl})...`, {
    baseEndpointUrl,
    perPage
  });

  let fetchedProducts: DestinationProductImportItem[] = [];
  let fetchedFactories: Array<{ id: number; name: string; slug?: string }> = [];
  let fetchedTables: Array<{ id: number; name: string; slug?: string }> = [];

  // Check if testing against local mock
  if (baseEndpointUrl.includes('localhost:3000/api/mock-wordpress')) {
    fetchedFactories = [
      { id: 101, name: 'کارخانه فولاد مبارکه اصفهان' },
      { id: 102, name: 'کارخانه ذوب آهن اصفهان' },
      { id: 103, name: 'فولاد خوزستان' },
      { id: 104, name: 'فولاد نیشابور' }
    ];
    fetchedTables = [
      { id: 201, name: 'تیرآهن' },
      { id: 202, name: 'میلگرد' },
      { id: 203, name: 'ورق سیاه' },
      { id: 204, name: 'نبشی و ناودانی' }
    ];
    fetchedProducts = [
      { post_id: 2001, name: 'تیرآهن ۱۴ ذوب آهن (سایت مقصد)', sku: 'TIR-14-ESF', current_price: 48500, factory_name: 'کارخانه ذوب آهن اصفهان', category_name: 'تیرآهن', active: false },
      { post_id: 2002, name: 'ورق سیاه ۲ میل مبارکه (سایت مقصد)', sku: 'ST37-2MM', current_price: 36200, factory_name: 'کارخانه فولاد مبارکه اصفهان', category_name: 'ورق سیاه', active: false },
      { post_id: 2003, name: 'میلگرد ۲۰ فولاد خوزستان (سایت مقصد)', sku: 'REBAR-20-KHZ', current_price: 29800, factory_name: 'فولاد خوزستان', category_name: 'میلگرد', active: false },
      { post_id: 2004, name: 'میلگرد ۱۴ نیشابور (سایت مقصد)', sku: 'REBAR-14-NISH', current_price: 28900, factory_name: 'فولاد نیشابور', category_name: 'میلگرد', active: false }
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

        // On first page (or subsequent), collect taxonomies
        if (Array.isArray(data.factories)) {
          for (const f of data.factories) {
            if (!fetchedFactories.some((existing) => existing.id === f.id || existing.name === f.name)) {
              fetchedFactories.push(f);
            }
          }
        }

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
  let factoriesImported = 0;
  let tablesImported = 0;
  let productsImported = 0;
  let productsUpdated = 0;
  const processedItems: Array<{ id: number; post_id: number; name: string; is_new: boolean; active: boolean }> = [];

  // 1. Process and import factories from destination
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

  // 2. Process and import price tables (categories) from destination
  for (const tbl of fetchedTables) {
    if (!tbl.name || !tbl.name.trim()) continue;
    const trimmedName = tbl.name.trim();
    const existing = schema.price_tables.find(
      (t) => (tbl.id && t.destination_id === tbl.id) || t.name.toLowerCase() === trimmedName.toLowerCase()
    );

    if (!existing) {
      const nextTblId = schema.price_tables.length > 0 ? Math.max(...schema.price_tables.map((t) => t.id)) + 1 : 1;
      // Default to first factory or defaultFactoryId
      const factoryIdForTable = schema.factories[0]?.id || 1;
      schema.price_tables.push({
        id: nextTblId,
        name: trimmedName,
        factory_id: factoryIdForTable,
        destination_id: tbl.id || nextTblId,
        active: true,
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
    } else if (tbl.id && !existing.destination_id) {
      existing.destination_id = tbl.id;
    }
  }

  // Fallback defaults
  const defaultFactoryId = options?.defaultFactoryId || schema.factories[0]?.id || 1;
  const defaultTableId = options?.defaultTableId || schema.price_tables[0]?.id || 1;

  // 3. Process and import products
  for (const item of fetchedProducts) {
    if (!item.name || !item.name.trim()) continue;
    const postId = Number(item.post_id) || 0;
    const trimmedName = item.name.trim();
    const sku = (item.sku || '').trim();

    // Resolve factory
    let resolvedFactoryId = defaultFactoryId;
    if (item.factory_name) {
      const matchedFac = schema.factories.find(
        (f) => f.name.toLowerCase() === item.factory_name!.trim().toLowerCase()
      );
      if (matchedFac) {
        resolvedFactoryId = matchedFac.id;
      } else {
        // Auto-create factory if missing
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
      }
    } else if (item.factory_id) {
      const matchedFac = schema.factories.find((f) => f.destination_id === item.factory_id);
      if (matchedFac) resolvedFactoryId = matchedFac.id;
    }

    // Resolve price table from category
    let resolvedTableId = defaultTableId;
    const categoryName = item.category_name || (Array.isArray(item.categories) && item.categories.length > 0 ? item.categories[0] : null);
    if (categoryName) {
      const matchedTable = schema.price_tables.find(
        (t) => t.name.toLowerCase() === categoryName.trim().toLowerCase()
      );
      if (matchedTable) {
        resolvedTableId = matchedTable.id;
      } else {
        // Auto-create price table from category
        const nextTblId = schema.price_tables.length > 0 ? Math.max(...schema.price_tables.map((t) => t.id)) + 1 : 1;
        schema.price_tables.push({
          id: nextTblId,
          name: categoryName.trim(),
          factory_id: resolvedFactoryId,
          destination_id: item.category_id || nextTblId,
          active: true,
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
        resolvedTableId = nextTblId;
      }
    } else if (item.category_id) {
      const matchedTable = schema.price_tables.find((t) => t.destination_id === item.category_id);
      if (matchedTable) resolvedTableId = matchedTable.id;
    }

    // Find if product already exists by post_id, destination_id, or matching SKU
    const existingIndex = schema.products.findIndex(
      (p) =>
        (postId > 0 && (p.post_id === postId || p.destination_id === postId)) ||
        (sku && p.sku && p.sku.toLowerCase() === sku.toLowerCase())
    );

    if (existingIndex >= 0) {
      // Update existing product without changing its active state if already set by user
      const existing = schema.products[existingIndex];
      existing.destination_id = postId > 0 ? postId : existing.destination_id;
      existing.post_id = postId > 0 ? postId : existing.post_id;
      if (item.current_price !== undefined && item.current_price > 0 && (!existing.current_price || existing.current_price === 0)) {
        existing.current_price = item.current_price;
      }
      if (sku && !existing.sku) existing.sku = sku;
      if (resolvedFactoryId && (!existing.factory_id || existing.factory_id === defaultFactoryId)) {
        existing.factory_id = resolvedFactoryId;
      }
      if (resolvedTableId && (!existing.price_table_id || existing.price_table_id === defaultTableId)) {
        existing.price_table_id = resolvedTableId;
      }
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
      // CRITICAL: active is strictly false by default so the user can inspect,
      // edit selectors, and selectively activate each product.
      const nextProdId = schema.products.length > 0 ? Math.max(...schema.products.map((p) => p.id)) + 1 : 1;
      const newProduct = {
        id: nextProdId,
        post_id: postId > 0 ? postId : nextProdId,
        destination_id: postId > 0 ? postId : nextProdId,
        name: trimmedName,
        sku: sku,
        factory_id: resolvedFactoryId,
        price_table_id: resolvedTableId,
        current_price: item.current_price || 0,
        active: false, // STRICT REQUIREMENT: Default to inactive per user instruction
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
        active: false
      });
    }
  }

  // Save changes to database
  db.save();

  db.log(
    'INFO',
    `دریافت اطلاعات با موفقیت انجام شد: ${productsImported} محصول جدید (غیرفعال جهت بررسی)، ${productsUpdated} محصول بروزرسانی، ${factoriesImported} کارخانه و ${tablesImported} جدول قیمت افزوده شد.`,
    { productsImported, productsUpdated, factoriesImported, tablesImported, totalFetched: fetchedProducts.length }
  );

  return {
    success: true,
    message: `دریافت با موفقیت انجام شد: ${productsImported} محصول جدید (به صورت پیش‌فرض غیرفعال)، ${productsUpdated} محصول بروزرسانی، ${factoriesImported} کارخانه و ${tablesImported} جدول قیمت از سایت مقصد وارد شدند.`,
    products_imported: productsImported,
    products_updated: productsUpdated,
    factories_imported: factoriesImported,
    tables_imported: tablesImported,
    total_fetched: fetchedProducts.length,
    items: processedItems
  };
}



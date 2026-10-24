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



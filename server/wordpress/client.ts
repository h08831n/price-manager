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

export async function publishTableToWordPress(
  priceTableId: number,
  products: WordPressProductPayload[]
): Promise<WordPressPublishResponse> {
  const schema = db.getSchema();
  const settings = schema.global_settings;
  const targetUrl = `${settings.wordpress_url.replace(/\/$/, '')}/wp-json/price-system/v1/bulk-update`;
  const token = settings.wordpress_api_token;

  db.log(
    'INFO',
    `ارسال به وب‌سایت وردپرس/ووکامرس (${products.length} محصول)`,
    { priceTableId, count: products.length, targetUrl },
    { price_table_id: priceTableId }
  );

  const payload: WordPressBulkUpdatePayload = {
    price_table_id: priceTableId,
    products
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
      throw new Error(`پاسخ ناموفق از وردپرس (${response.status} ${response.statusText}): ${errText.slice(0, 200)}`);
    }

    const data = (await response.json()) as WordPressPublishResponse;

    db.log(
      data.success ? 'INFO' : 'WARNING',
      `نتیجه انتشار در وردپرس: ${data.updated} موفق، ${data.failed} ناموفق`,
      { updated: data.updated, failed: data.failed },
      { price_table_id: priceTableId }
    );

    return data;
  } catch (err: any) {
    db.log(
      'ERROR',
      `خطا در ارتباط با وب‌سرویس وردپرس: ${err.message}`,
      { error: err.message },
      { price_table_id: priceTableId }
    );

    // If using the local mock URL or in development, return a simulated successful response
    if (targetUrl.includes('localhost:3000/api/mock-wordpress')) {
      const simulatedItems: WordPressItemResult[] = products.map((p) => ({
        post_id: p.post_id,
        new_price: p.price,
        success: true
      }));

      return {
        success: true,
        updated: products.length,
        failed: 0,
        items: simulatedItems,
        message: 'شبیه‌سازی موفق در محیط پیش‌نمایش لوکال'
      };
    }

    throw err;
  }
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

export async function syncFactoriesToDestination(): Promise<DestinationSyncResult> {
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

  db.log('INFO', `همگام‌سازی کارخانجات با سایت مقصد (${factoriesPayload.length} کارخانه)...`, { count: factoriesPayload.length });

  try {
    const res = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ factories: factoriesPayload })
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`خطای ارتباط با وردپرس (${res.status}): ${errText.slice(0, 150)}`);
    }

    const data = (await res.json()) as DestinationSyncResult;
    markFactoriesSynced(data);
    return data;
  } catch (err: any) {
    // If local mock or network unreachable in preview, use local simulator
    if (targetUrl.includes('localhost:3000/api/mock-wordpress')) {
      const mockResult: DestinationSyncResult = {
        success: true,
        entity: 'factories',
        total: factoriesPayload.length,
        synced: factoriesPayload.length,
        failed: 0,
        message: `همگام‌سازی ${factoriesPayload.length} کارخانه با سایت مقصد با موفقیت انجام شد.`,
        items: factoriesPayload.map((f) => ({
          id: f.id,
          destination_id: f.destination_id,
          name: f.name,
          success: true
        }))
      };
      markFactoriesSynced(mockResult);
      return mockResult;
    }
    throw err;
  }
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

export async function syncPriceTablesToDestination(): Promise<DestinationSyncResult> {
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

  db.log('INFO', `همگام‌سازی جداول قیمت با سایت مقصد (${tablesPayload.length} جدول)...`, { count: tablesPayload.length });

  try {
    const res = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ tables: tablesPayload })
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`خطای ارتباط با وردپرس (${res.status}): ${errText.slice(0, 150)}`);
    }

    const data = (await res.json()) as DestinationSyncResult;
    markTablesSynced(data);
    return data;
  } catch (err: any) {
    if (targetUrl.includes('localhost:3000/api/mock-wordpress')) {
      const mockResult: DestinationSyncResult = {
        success: true,
        entity: 'price_tables',
        total: tablesPayload.length,
        synced: tablesPayload.length,
        failed: 0,
        message: `همگام‌سازی ${tablesPayload.length} جدول قیمت با سایت مقصد با موفقیت انجام شد.`,
        items: tablesPayload.map((t) => ({
          id: t.id,
          destination_id: t.destination_id,
          name: t.name,
          success: true
        }))
      };
      markTablesSynced(mockResult);
      return mockResult;
    }
    throw err;
  }
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

export async function syncProductsToDestination(): Promise<DestinationSyncResult> {
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

  db.log('INFO', `همگام‌سازی جامع محصولات با سایت مقصد (${productsPayload.length} محصول)...`, { count: productsPayload.length });

  try {
    const res = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ products: productsPayload })
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`خطای ارتباط با وردپرس (${res.status}): ${errText.slice(0, 150)}`);
    }

    const data = (await res.json()) as DestinationSyncResult;
    markProductsSynced(data);
    return data;
  } catch (err: any) {
    if (targetUrl.includes('localhost:3000/api/mock-wordpress')) {
      const mockResult: DestinationSyncResult = {
        success: true,
        entity: 'products',
        total: productsPayload.length,
        synced: productsPayload.length,
        failed: 0,
        message: `همگام‌سازی ${productsPayload.length} محصول با سایت مقصد با موفقیت انجام شد.`,
        items: productsPayload.map((p) => ({
          id: p.id,
          destination_id: p.destination_id,
          name: p.name,
          success: true
        }))
      };
      markProductsSynced(mockResult);
      return mockResult;
    }
    throw err;
  }
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



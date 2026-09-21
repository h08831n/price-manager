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

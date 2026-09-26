// Seed Data for initial database population matching specification requirement #77 & #81
import { db, DatabaseSchema } from './database';

export function getSeedDatabase(timestamp: string = '2026-09-21T08:19:39.381Z'): DatabaseSchema {
  return {
    factories: [
      {
        id: 1,
        name: 'ذوب آهن اصفهان',
        active: true,
        created_at: timestamp,
        updated_at: timestamp
      }
    ],
    price_tables: [
      {
        id: 1,
        name: 'میلگرد ذوب آهن',
        factory_id: 1,
        active: true,
        start_time: '11:00',
        retry_interval_minutes: 30,
        max_attempts: 5,
        price_guard_percent: 30,
        working_days: 'شنبه تا چهارشنبه',
        recheck_default: false,
        created_at: timestamp,
        updated_at: timestamp
      }
    ],
    products: [
      {
        id: 1,
        post_id: 1840,
        name: 'میلگرد ۱۲ ذوب آهن',
        sku: 'ZOB-RB-12',
        factory_id: 1,
        price_table_id: 1,
        current_price: 58000,
        previous_price: 58500,
        active: true,
        attributes: {
          pa_size: '12',
          pa_factory: 'ذوب آهن اصفهان',
          pa_grade: 'A3',
          pa_type: 'آجدار',
          unit: 'کیلوگرم'
        },
        created_at: timestamp,
        updated_at: timestamp
      },
      {
        id: 2,
        post_id: 1841,
        name: 'میلگرد ۱۴ ذوب آهن',
        sku: 'ZOB-RB-14',
        factory_id: 1,
        price_table_id: 1,
        current_price: 58400,
        previous_price: 58900,
        active: true,
        attributes: {
          pa_size: '14',
          pa_factory: 'ذوب آهن اصفهان',
          pa_grade: 'A3',
          pa_type: 'آجدار',
          unit: 'کیلوگرم'
        },
        created_at: timestamp,
        updated_at: timestamp
      },
      {
        id: 3,
        post_id: 1842,
        name: 'میلگرد ۱۶ ذوب آهن',
        sku: 'ZOB-RB-16',
        factory_id: 1,
        price_table_id: 1,
        current_price: 59100,
        previous_price: 59500,
        active: true,
        attributes: {
          pa_size: '16',
          pa_factory: 'ذوب آهن اصفهان',
          pa_grade: 'A3',
          pa_type: 'آجدار',
          unit: 'کیلوگرم'
        },
        created_at: timestamp,
        updated_at: timestamp
      },
      {
        id: 4,
        post_id: 1843,
        name: 'میلگرد ۱۸ ذوب آهن',
        sku: 'ZOB-RB-18',
        factory_id: 1,
        price_table_id: 1,
        current_price: 60100,
        previous_price: 60800,
        active: true,
        attributes: {
          pa_size: '18',
          pa_factory: 'ذوب آهن اصفهان',
          pa_grade: 'A3',
          pa_type: 'آجدار',
          unit: 'کیلوگرم'
        },
        created_at: timestamp,
        updated_at: timestamp
      }
    ],
    sites: [
      {
        id: 1,
        name: 'منبع الف (آهن‌نیوز)',
        base_url: 'http://localhost:3000/fixtures/source-a.html',
        scrape_method: 'FETCH' as const,
        browser: 'Chromium' as const,
        timeout: 30,
        wait_after_load: 1000,
        active: true,
        created_at: timestamp,
        updated_at: timestamp
      },
      {
        id: 2,
        name: 'منبع ب (بورس فلزات)',
        base_url: 'http://localhost:3000/fixtures/source-b.html',
        scrape_method: 'FETCH' as const,
        browser: 'Chromium' as const,
        timeout: 30,
        wait_after_load: 1000,
        active: true,
        created_at: timestamp,
        updated_at: timestamp
      },
      {
        id: 3,
        name: 'منبع ج (فولاد آنلاین)',
        base_url: 'http://localhost:3000/fixtures/source-c.html',
        scrape_method: 'FETCH' as const,
        browser: 'Chromium' as const,
        timeout: 30,
        wait_after_load: 1000,
        active: true,
        created_at: timestamp,
        updated_at: timestamp
      },
      {
        id: 4,
        name: 'منبع د (آهن‌مارکت)',
        base_url: 'http://localhost:3000/fixtures/source-d.html',
        scrape_method: 'FETCH' as const,
        browser: 'Chromium' as const,
        timeout: 30,
        wait_after_load: 1000,
        active: true,
        created_at: timestamp,
        updated_at: timestamp
      },
      {
        id: 5,
        name: 'منبع هـ (مرکز آهن)',
        base_url: 'http://localhost:3000/fixtures/source-e.html',
        scrape_method: 'FETCH' as const,
        browser: 'Chromium' as const,
        timeout: 30,
        wait_after_load: 1000,
        active: true,
        created_at: timestamp,
        updated_at: timestamp
      }
    ],
    source_pages: [
      {
        id: 1,
        site_id: 1,
        url: 'http://localhost:3000/fixtures/source-a.html',
        active: true,
        created_at: timestamp,
        updated_at: timestamp
      },
      {
        id: 2,
        site_id: 2,
        url: 'http://localhost:3000/fixtures/source-b.html',
        active: true,
        created_at: timestamp,
        updated_at: timestamp
      },
      {
        id: 3,
        site_id: 3,
        url: 'http://localhost:3000/fixtures/source-c.html',
        active: true,
        created_at: timestamp,
        updated_at: timestamp
      },
      {
        id: 4,
        site_id: 4,
        url: 'http://localhost:3000/fixtures/source-d.html',
        active: true,
        created_at: timestamp,
        updated_at: timestamp
      },
      {
        id: 5,
        site_id: 5,
        url: 'http://localhost:3000/fixtures/source-e.html',
        active: true,
        created_at: timestamp,
        updated_at: timestamp
      }
    ],
    table_sources: [
      {
        id: 1,
        price_table_id: 1,
        site_id: 1,
        source_page_id: 1,
        active: true,
        update_time_xpath: '//*[@id="last-update"]',
        recheck_enabled: true,
        created_at: timestamp,
        updated_at: timestamp
      },
      {
        id: 2,
        price_table_id: 1,
        site_id: 2,
        source_page_id: 2,
        active: true,
        update_time_xpath: '//*[@id="source-b-update"]',
        recheck_enabled: false,
        created_at: timestamp,
        updated_at: timestamp
      },
      {
        id: 3,
        price_table_id: 1,
        site_id: 3,
        source_page_id: 3,
        active: true,
        update_time_xpath: '//*[@id="update-date-c"]',
        recheck_enabled: false,
        created_at: timestamp,
        updated_at: timestamp
      },
      {
        id: 4,
        price_table_id: 1,
        site_id: 4,
        source_page_id: 4,
        active: true,
        update_time_xpath: '//*[@id="meta-update"]',
        recheck_enabled: true,
        created_at: timestamp,
        updated_at: timestamp
      },
      {
        id: 5,
        price_table_id: 1,
        site_id: 5,
        source_page_id: 5,
        active: true,
        update_time_xpath: '//*[@id="date-e"]',
        recheck_enabled: false,
        created_at: timestamp,
        updated_at: timestamp
      }
    ],
    product_selectors: [
      { id: 1, product_id: 1, post_id: 1840, table_source_id: 1, price_xpath: '//table[@id="zobahan-table"]//tr[1]/td[5]', active: true, created_at: timestamp, updated_at: timestamp },
      { id: 2, product_id: 2, post_id: 1841, table_source_id: 1, price_xpath: '//table[@id="zobahan-table"]//tr[2]/td[5]', active: true, created_at: timestamp, updated_at: timestamp },
      { id: 3, product_id: 3, post_id: 1842, table_source_id: 1, price_xpath: '//table[@id="zobahan-table"]//tr[3]/td[5]', active: true, created_at: timestamp, updated_at: timestamp },
      { id: 4, product_id: 4, post_id: 1843, table_source_id: 1, price_xpath: '//table[@id="zobahan-table"]//tr[4]/td[5]', active: true, created_at: timestamp, updated_at: timestamp },
      { id: 5, product_id: 1, post_id: 1840, table_source_id: 2, price_xpath: '//table[@id="prices-b"]//tr[@data-id="rebar-12"]/td[3]', active: true, created_at: timestamp, updated_at: timestamp },
      { id: 6, product_id: 2, post_id: 1841, table_source_id: 2, price_xpath: '//table[@id="prices-b"]//tr[@data-id="rebar-14"]/td[3]', active: true, created_at: timestamp, updated_at: timestamp },
      { id: 7, product_id: 3, post_id: 1842, table_source_id: 2, price_xpath: '//table[@id="prices-b"]//tr[@data-id="rebar-16"]/td[3]', active: true, created_at: timestamp, updated_at: timestamp },
      { id: 8, product_id: 4, post_id: 1843, table_source_id: 2, price_xpath: '//table[@id="prices-b"]//tr[@data-id="rebar-18"]/td[3]', active: true, created_at: timestamp, updated_at: timestamp },
      { id: 9, product_id: 1, post_id: 1840, table_source_id: 3, price_xpath: '//table[@id="tbl-c"]//tr[1]/td[2]', active: true, created_at: timestamp, updated_at: timestamp },
      { id: 10, product_id: 2, post_id: 1841, table_source_id: 3, price_xpath: '//table[@id="tbl-c"]//tr[2]/td[2]', active: true, created_at: timestamp, updated_at: timestamp },
      { id: 11, product_id: 3, post_id: 1842, table_source_id: 3, price_xpath: '//table[@id="tbl-c"]//tr[3]/td[2]', active: true, created_at: timestamp, updated_at: timestamp },
      { id: 12, product_id: 4, post_id: 1843, table_source_id: 3, price_xpath: '//table[@id="tbl-c"]//tr[4]/td[2]', active: true, created_at: timestamp, updated_at: timestamp },
      { id: 13, product_id: 1, post_id: 1840, table_source_id: 4, price_xpath: '//table[@id="d-prices"]//tr[2]/td[2]', active: true, created_at: timestamp, updated_at: timestamp },
      { id: 14, product_id: 2, post_id: 1841, table_source_id: 4, price_xpath: '//table[@id="d-prices"]//tr[3]/td[2]', active: true, created_at: timestamp, updated_at: timestamp },
      { id: 15, product_id: 3, post_id: 1842, table_source_id: 4, price_xpath: '//table[@id="d-prices"]//tr[4]/td[2]', active: true, created_at: timestamp, updated_at: timestamp },
      { id: 16, product_id: 4, post_id: 1843, table_source_id: 4, price_xpath: '//table[@id="d-prices"]//tr[5]/td[2]', active: true, created_at: timestamp, updated_at: timestamp }
    ],
    page_actions: [],
    global_settings: {
      working_hours_start: '08:30',
      working_hours_end: '17:00',
      friday_enabled: false,
      default_retry_interval: 30,
      default_max_attempts: 5,
      default_price_guard_percent: 30,
      default_browser_timeout_sec: 30,
      default_page_load_wait_ms: 1500,
      default_recheck: false,
      wordpress_url: process.env.WORDPRESS_URL || 'http://localhost:3000/api/mock-wordpress',
      wordpress_api_token: process.env.WORDPRESS_API_TOKEN || 'secure-test-token-xyz',
      timezone: process.env.TZ || 'Asia/Tehran',
      admin_password: process.env.ADMIN_PASSWORD || 'admin123'
    },
    runs: [],
    run_locks: [],
    daily_table_runs: [],
    daily_source_runs: [],
    price_records: [],
    price_changes: [],
    table_revisions: [],
    table_revision_items: [],
    errors: [],
    logs: [],
    config_history: [],
    import_history: []
  };
}

export function seedInitialDataIfEmpty() {
  const schema = db.getSchema();

  // If factories already populated, don't re-seed
  if (schema.factories && schema.factories.length > 0) {
    return;
  }

  console.log('🌱 Seeding initial demo data for Zobahan rebar price collection...');
  const seed = getSeedDatabase();
  db.resetWith(seed);
  console.log('✅ Seed data successfully initialized.');
}


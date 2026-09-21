// Seed Data for initial database population matching specification requirement #77 & #81
import { db } from './database';

export function seedInitialDataIfEmpty() {
  const schema = db.getSchema();

  // If factories already populated, don't re-seed
  if (schema.factories.length > 0) {
    return;
  }

  console.log('🌱 Seeding initial demo data for Zobahan rebar price collection...');

  const now = new Date().toISOString();

  // 1. Factory
  const factory = {
    id: 1,
    name: 'ذوب آهن اصفهان',
    active: true,
    created_at: now,
    updated_at: now
  };
  schema.factories.push(factory);

  // 2. Price Table
  const priceTable = {
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
    created_at: now,
    updated_at: now
  };
  schema.price_tables.push(priceTable);

  // 3. Products with exact WooCommerce post_id and attributes
  const products = [
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
      created_at: now,
      updated_at: now
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
      created_at: now,
      updated_at: now
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
      created_at: now,
      updated_at: now
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
      created_at: now,
      updated_at: now
    }
  ];
  schema.products.push(...products);

  // 4. Sites (Competitors A, B, C, D, E)
  const sites = [
    {
      id: 1,
      name: 'منبع الف (آهن‌نیوز)',
      base_url: 'http://localhost:3000/fixtures/source-a.html',
      browser: 'Chromium',
      timeout: 30,
      wait_after_load: 1000,
      active: true,
      created_at: now,
      updated_at: now
    },
    {
      id: 2,
      name: 'منبع ب (بورس فلزات)',
      base_url: 'http://localhost:3000/fixtures/source-b.html',
      browser: 'Chromium',
      timeout: 30,
      wait_after_load: 1000,
      active: true,
      created_at: now,
      updated_at: now
    },
    {
      id: 3,
      name: 'منبع ج (فولاد آنلاین)',
      base_url: 'http://localhost:3000/fixtures/source-c.html',
      browser: 'Chromium',
      timeout: 30,
      wait_after_load: 1000,
      active: true,
      created_at: now,
      updated_at: now
    },
    {
      id: 4,
      name: 'منبع د (آهن‌مارکت)',
      base_url: 'http://localhost:3000/fixtures/source-d.html',
      browser: 'Chromium',
      timeout: 30,
      wait_after_load: 1000,
      active: true,
      created_at: now,
      updated_at: now
    },
    {
      id: 5,
      name: 'منبع هـ (مرکز آهن)',
      base_url: 'http://localhost:3000/fixtures/source-e.html',
      browser: 'Chromium',
      timeout: 30,
      wait_after_load: 1000,
      active: true,
      created_at: now,
      updated_at: now
    }
  ];
  schema.sites.push(...sites);

  // 5. Source Pages
  const sourcePages = [
    {
      id: 1,
      site_id: 1,
      url: 'http://localhost:3000/fixtures/source-a.html',
      active: true,
      created_at: now,
      updated_at: now
    },
    {
      id: 2,
      site_id: 2,
      url: 'http://localhost:3000/fixtures/source-b.html',
      active: true,
      created_at: now,
      updated_at: now
    },
    {
      id: 3,
      site_id: 3,
      url: 'http://localhost:3000/fixtures/source-c.html',
      active: true,
      created_at: now,
      updated_at: now
    },
    {
      id: 4,
      site_id: 4,
      url: 'http://localhost:3000/fixtures/source-d.html',
      active: true,
      created_at: now,
      updated_at: now
    },
    {
      id: 5,
      site_id: 5,
      url: 'http://localhost:3000/fixtures/source-e.html',
      active: true,
      created_at: now,
      updated_at: now
    }
  ];
  schema.source_pages.push(...sourcePages);

  // 6. Table Sources (Connects Price Table 1 to Sites 1..5)
  // Matching Requirement #81:
  // A: recheck_enabled = true
  // B: recheck_enabled = false
  // C: recheck_enabled = false
  // D: recheck_enabled = true
  // E: recheck_enabled = false
  const tableSources = [
    {
      id: 1,
      price_table_id: 1,
      site_id: 1,
      source_page_id: 1,
      active: true,
      update_time_xpath: '//*[@id="last-update"]',
      recheck_enabled: true,
      created_at: now,
      updated_at: now
    },
    {
      id: 2,
      price_table_id: 1,
      site_id: 2,
      source_page_id: 2,
      active: true,
      update_time_xpath: '//*[@id="source-b-update"]',
      recheck_enabled: false,
      created_at: now,
      updated_at: now
    },
    {
      id: 3,
      price_table_id: 1,
      site_id: 3,
      source_page_id: 3,
      active: true,
      update_time_xpath: '//*[@id="update-date-c"]',
      recheck_enabled: false,
      created_at: now,
      updated_at: now
    },
    {
      id: 4,
      price_table_id: 1,
      site_id: 4,
      source_page_id: 4,
      active: true,
      update_time_xpath: '//*[@id="meta-update"]',
      recheck_enabled: true,
      created_at: now,
      updated_at: now
    },
    {
      id: 5,
      price_table_id: 1,
      site_id: 5,
      source_page_id: 5,
      active: true,
      update_time_xpath: '//*[@id="date-e"]',
      recheck_enabled: false,
      created_at: now,
      updated_at: now
    }
  ];
  schema.table_sources.push(...tableSources);

  // 7. Product Selectors
  // Table Source 1 (Source A)
  schema.product_selectors.push(
    { id: 1, product_id: 1, post_id: 1840, table_source_id: 1, price_xpath: '//table[@id="zobahan-table"]//tr[1]/td[5]', active: true, created_at: now, updated_at: now },
    { id: 2, product_id: 2, post_id: 1841, table_source_id: 1, price_xpath: '//table[@id="zobahan-table"]//tr[2]/td[5]', active: true, created_at: now, updated_at: now },
    { id: 3, product_id: 3, post_id: 1842, table_source_id: 1, price_xpath: '//table[@id="zobahan-table"]//tr[3]/td[5]', active: true, created_at: now, updated_at: now },
    { id: 4, product_id: 4, post_id: 1843, table_source_id: 1, price_xpath: '//table[@id="zobahan-table"]//tr[4]/td[5]', active: true, created_at: now, updated_at: now }
  );

  // Table Source 2 (Source B)
  schema.product_selectors.push(
    { id: 5, product_id: 1, post_id: 1840, table_source_id: 2, price_xpath: '//table[@id="prices-b"]//tr[@data-id="rebar-12"]/td[3]', active: true, created_at: now, updated_at: now },
    { id: 6, product_id: 2, post_id: 1841, table_source_id: 2, price_xpath: '//table[@id="prices-b"]//tr[@data-id="rebar-14"]/td[3]', active: true, created_at: now, updated_at: now },
    { id: 7, product_id: 3, post_id: 1842, table_source_id: 2, price_xpath: '//table[@id="prices-b"]//tr[@data-id="rebar-16"]/td[3]', active: true, created_at: now, updated_at: now },
    { id: 8, product_id: 4, post_id: 1843, table_source_id: 2, price_xpath: '//table[@id="prices-b"]//tr[@data-id="rebar-18"]/td[3]', active: true, created_at: now, updated_at: now }
  );

  // Table Source 3 (Source C)
  schema.product_selectors.push(
    { id: 9, product_id: 1, post_id: 1840, table_source_id: 3, price_xpath: '//table[@id="tbl-c"]//tr[1]/td[2]', active: true, created_at: now, updated_at: now },
    { id: 10, product_id: 2, post_id: 1841, table_source_id: 3, price_xpath: '//table[@id="tbl-c"]//tr[2]/td[2]', active: true, created_at: now, updated_at: now },
    { id: 11, product_id: 3, post_id: 1842, table_source_id: 3, price_xpath: '//table[@id="tbl-c"]//tr[3]/td[2]', active: true, created_at: now, updated_at: now },
    { id: 12, product_id: 4, post_id: 1843, table_source_id: 3, price_xpath: '//table[@id="tbl-c"]//tr[4]/td[2]', active: true, created_at: now, updated_at: now }
  );

  // Table Source 4 (Source D)
  schema.product_selectors.push(
    { id: 13, product_id: 1, post_id: 1840, table_source_id: 4, price_xpath: '//table[@id="d-prices"]//tr[2]/td[2]', active: true, created_at: now, updated_at: now },
    { id: 14, product_id: 2, post_id: 1841, table_source_id: 4, price_xpath: '//table[@id="d-prices"]//tr[3]/td[2]', active: true, created_at: now, updated_at: now },
    { id: 15, product_id: 3, post_id: 1842, table_source_id: 4, price_xpath: '//table[@id="d-prices"]//tr[4]/td[2]', active: true, created_at: now, updated_at: now },
    { id: 16, product_id: 4, post_id: 1843, table_source_id: 4, price_xpath: '//table[@id="d-prices"]//tr[5]/td[2]', active: true, created_at: now, updated_at: now }
  );

  // Save changes
  db.save();
  console.log('✅ Seed data successfully initialized.');
}

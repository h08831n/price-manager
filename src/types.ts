// Global Types for Price Collector & WordPress Sync System

export type PersianDirection = 'rtl';

export interface Factory {
  id: number;
  name: string;
  active: boolean;
  created_at: string;
  updated_at: string;
  product_count?: number;
  table_count?: number;
}

export interface PriceTable {
  id: number;
  name: string;
  factory_id: number;
  factory_name?: string;
  active: boolean;
  start_time: string; // e.g. "11:00"
  retry_interval_minutes: number; // e.g. 30
  max_attempts: number; // e.g. 5
  price_guard_percent: number; // e.g. 30
  working_days?: string;
  recheck_default?: boolean;
  created_at: string;
  updated_at: string;
  source_count?: number;
  product_count?: number;
  today_status?: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
}

export interface ProductAttribute {
  name: string;
  slug: string;
  value: string | string[];
  is_global: boolean;
}

export interface Product {
  id: number;
  post_id: number; // Exact WordPress / WooCommerce post ID
  name: string;
  sku?: string;
  factory_id: number;
  factory_name?: string;
  price_table_id: number;
  price_table_name?: string;
  current_price: number;
  previous_price?: number;
  active: boolean;
  attributes: Record<string, any>; // e.g. { pa_size: "16", pa_grade: "A3" }
  created_at: string;
  updated_at: string;
}

export type ScrapeMethod = 'FETCH' | 'PLAYWRIGHT';

export interface Site {
  id: number;
  name: string;
  base_url: string;
  scrape_method: ScrapeMethod;
  browser: 'Chromium';
  timeout: number; // in seconds
  wait_after_load: number; // in milliseconds
  active: boolean;
  created_at: string;
  updated_at: string;
  page_count?: number;
}

export interface SourcePage {
  id: number;
  site_id: number;
  site_name?: string;
  url: string;
  active: boolean;
  created_at: string;
  updated_at: string;
  actions_count?: number;
}

export type PageActionType = 'WAIT' | 'CLICK' | 'SCROLL' | 'SCROLL_TO' | 'WAIT_FOR_ELEMENT';

export interface PageAction {
  id: number;
  source_page_id: number;
  order: number;
  action_type: PageActionType;
  selector_type?: 'XPATH' | 'CSS';
  selector?: string;
  value?: string; // duration in ms or text
  active: boolean;
  created_at: string;
}

export interface TableSource {
  id: number;
  price_table_id: number;
  price_table_name?: string;
  site_id: number;
  site_name?: string;
  source_page_id: number;
  source_page_url?: string;
  active: boolean;
  update_time_xpath?: string | null;
  recheck_enabled: boolean;
  max_attempts_override?: number | null;
  retry_interval_override?: number | null;
  timeout_override?: number | null;
  price_guard_override?: number | null;
  created_at: string;
  updated_at: string;
  // Dynamic status fields
  today_status?: 'PENDING' | 'RUNNING' | 'UPDATED' | 'DONE' | 'NOT_UPDATED' | 'FAILED' | 'BLOCKED';
  fresh?: boolean;
  attempt_count?: number;
  last_check_at?: string;
  last_update_text?: string;
}

export interface ProductSelector {
  id: number;
  product_id: number;
  post_id: number;
  product_name?: string;
  table_source_id: number;
  site_name?: string;
  update_time_xpath?: string | null;
  price_xpath: string;
  active: boolean;
  last_update_text?: string | null;
  last_update_date?: string | null;
  last_update_time?: string | null;
  last_fresh?: boolean | null;
  last_extracted_value?: string | null;
  last_status?: 'VALID' | 'INVALID' | 'BLOCKED' | 'NOT_FOUND' | 'NOT_UPDATED' | null;
  last_extracted_at?: string | null;
  created_at: string;
  updated_at: string;
}

export type PickerTarget =
  | {
      type: 'TABLE_UPDATE';
      tableSourceId: number;
    }
  | {
      type: 'PRODUCT_UPDATE';
      tableSourceId: number;
      productId: number;
      selectorId?: number;
    }
  | {
      type: 'PRODUCT_PRICE';
      tableSourceId: number;
      productId: number;
      selectorId?: number;
    };

export type SelectorTestType = 'PRICE' | 'DATE';

export type RunTriggerType = 'SCHEDULED' | 'MANUAL_TABLE' | 'MANUAL_SOURCE' | 'TEST_PAGE' | 'TEST_XPATH' | 'RECHECK';
export type RunStatus = 'PENDING' | 'RUNNING' | 'DONE' | 'FAILED' | 'PARTIAL' | 'BLOCKED';

export interface Run {
  id: number;
  trigger_type: RunTriggerType;
  status: RunStatus;
  price_table_id?: number | null;
  price_table_name?: string;
  table_source_id?: number | null;
  source_page_id?: number | null;
  attempt_number: number;
  started_at: string;
  finished_at?: string | null;
  completed_at?: string | null;
  duration_ms?: number | null;
  products_expected: number;
  products_extracted: number;
  products_failed: number;
  error_count: number;
  sources_updated?: number;
  details?: Record<string, any>;
}

export type ErrorType =
  | 'PAGE_TIMEOUT'
  | 'PAGE_LOAD_FAILED'
  | 'UPDATE_XPATH_NOT_FOUND'
  | 'PRODUCT_UPDATE_XPATH_NOT_FOUND'
  | 'PRICE_XPATH_NOT_FOUND'
  | 'PRICE_XPATH_MULTIPLE_MATCHES'
  | 'INVALID_PRICE'
  | 'SOURCE_NOT_UPDATED'
  | 'PAGE_ACTION_FAILED'
  | 'WORDPRESS_API_FAILED'
  | 'WORDPRESS_AUTH_FAILED'
  | 'PRICE_GUARD_BLOCKED'
  | 'EXTRACTION_COUNT_MISMATCH'
  | 'UNKNOWN_ERROR';

export type ErrorStatus = 'OPEN' | 'RETRYING' | 'RESOLVED' | 'IGNORED';

export interface AppError {
  id: number;
  price_table_id?: number | null;
  price_table_name?: string;
  table_source_id?: number | null;
  product_id?: number | null;
  product_name?: string;
  post_id?: number | null;
  site_id?: number | null;
  site_name?: string;
  source_page_id?: number | null;
  url?: string;
  error_type: ErrorType;
  error_message: string;
  execution_stage: string;
  xpath?: string;
  attempt_number?: number;
  run_id?: number;
  screenshot_path?: string | null;
  html_snapshot_path?: string | null;
  status: ErrorStatus;
  created_at: string;
  resolved_at?: string | null;
}

export interface AppLog {
  id: number;
  level: 'INFO' | 'WARNING' | 'ERROR';
  message: string;
  metadata?: Record<string, any>;
  run_id?: number;
  price_table_id?: number;
  table_source_id?: number;
  site_id?: number;
  product_id?: number;
  created_at: string;
}

export interface PriceRecord {
  id: number;
  product_id: number;
  post_id: number;
  table_source_id: number;
  site_id: number;
  price_table_id: number;
  raw_value: string;
  parsed_price: number;
  source_update_date?: string;
  source_update_time?: string;
  attempt_number: number;
  is_recheck: boolean;
  extracted_at: string;
  status: 'VALID' | 'INVALID' | 'BLOCKED_BY_PRICE_GUARD';
  run_id: number;
}

export interface PriceChange {
  id: number;
  product_id: number;
  post_id: number;
  product_name?: string;
  table_source_id?: number;
  site_name?: string;
  price_table_id: number;
  old_price: number;
  new_price: number;
  change_amount: number;
  change_percent: number;
  direction: 'UP' | 'DOWN' | 'UNCHANGED';
  created_at: string;
}

export interface TableRevision {
  id: number;
  price_table_id: number;
  price_table_name?: string;
  revision_number: number;
  calculated_at: string;
  source_count_used: number;
  pending_source_count: number;
  failed_source_count: number;
  published_at?: string | null;
  wordpress_status: 'PENDING' | 'SUCCESS' | 'FAILED' | 'SKIPPED';
  wordpress_response?: any;
  run_id?: number;
  items?: TableRevisionItem[];
}

export interface TableRevisionItem {
  id: number;
  table_revision_id: number;
  product_id: number;
  post_id: number;
  product_name?: string;
  calculated_price: number;
  previous_price: number;
  is_blocked_by_price_guard: boolean;
  status: 'PUBLISHED' | 'BLOCKED' | 'FAILED';
  sources_count?: number;
}

export interface GlobalSettings {
  working_hours_start: string; // "08:30"
  working_hours_end: string; // "17:00"
  friday_enabled: boolean; // false
  default_retry_interval: number; // 30 mins
  default_max_attempts: number; // 5
  default_price_guard_percent: number; // 30%
  default_browser_timeout_sec: number; // 30 sec
  default_page_load_wait_ms: number; // 2000 ms
  default_recheck: boolean; // false
  wordpress_url: string;
  wordpress_api_token: string;
  timezone: string; // "Asia/Tehran"
  default_timeout?: number;
  default_wait_after_load?: number;
}

export interface ConfigHistory {
  id: number;
  entity_type: string;
  entity_id?: number;
  field_changed?: string;
  old_value?: string;
  new_value?: any;
  changed_at?: string;
  changed_by?: string;
  action?: string;
  created_at?: string;
  user?: string;
}

export interface ImportHistory {
  id: number;
  file_name: string;
  import_type: string;
  uploaded_at: string;
  rows_total: number;
  rows_new: number;
  rows_updated: number;
  rows_unchanged: number;
  rows_failed: number;
  status: 'SUCCESS' | 'PARTIAL' | 'FAILED';
  error_report?: string;
}

export type ExecutionRun = Run;
export type SystemError = AppError;
export type SystemLog = AppLog;
export type ConfigHistoryItem = ConfigHistory;
export type ImportHistoryItem = ImportHistory;

export interface DashboardData {
  open_errors_count: number;
  running_jobs_count: number;
  pending_sources_count: number;
  completed_tables_today: number;
  total_tables_today: number;
  blocked_prices_today: number;
  failed_sources_today: number;
  last_wordpress_publish?: {
    table_name: string;
    published_at: string;
    products_count: number;
    status: 'SUCCESS' | 'FAILED';
    message?: string;
  } | null;
  recent_errors: AppError[];
  active_runs: Run[];
  pending_updates: {
    price_table_id: number;
    price_table_name: string;
    pending_sources_count: number;
    next_run_at: string;
    attempt_number: number;
    max_attempts: number;
  }[];
}

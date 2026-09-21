// Relational In-Memory + Synchronously Persisted Database Engine
import fs from 'fs';
import path from 'path';
import {
  Factory,
  PriceTable,
  Product,
  Site,
  SourcePage,
  TableSource,
  ProductSelector,
  PageAction,
  GlobalSettings,
  Run,
  AppError,
  AppLog,
  PriceRecord,
  PriceChange,
  TableRevision,
  TableRevisionItem,
  ConfigHistory,
  ImportHistory
} from '../../src/types';

export interface RunLock {
  key: string;
  locked_at: string;
  expires_at: string;
  owner_run_id: number;
}

export interface DailyTableRun {
  id: number;
  price_table_id: number;
  run_date: string; // YYYY-MM-DD
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
  attempt_count: number;
  last_attempt_at?: string;
  completed_at?: string;
}

export interface DailySourceRun {
  id: number;
  price_table_id: number;
  table_source_id: number;
  run_date: string; // YYYY-MM-DD
  status: 'PENDING' | 'RUNNING' | 'UPDATED' | 'DONE' | 'NOT_UPDATED' | 'FAILED' | 'BLOCKED';
  attempt_count: number;
  raw_update_text?: string;
  normalized_update_date?: string;
  fresh: boolean;
  first_check_at?: string;
  last_check_at?: string;
  last_price_fetch_at?: string;
  recheck_count: number;
}

export interface DatabaseSchema {
  factories: Factory[];
  price_tables: PriceTable[];
  products: Product[];
  sites: Site[];
  source_pages: SourcePage[];
  table_sources: TableSource[];
  product_selectors: ProductSelector[];
  page_actions: PageAction[];
  global_settings: GlobalSettings;
  runs: Run[];
  run_locks: RunLock[];
  daily_table_runs: DailyTableRun[];
  daily_source_runs: DailySourceRun[];
  price_records: PriceRecord[];
  price_changes: PriceChange[];
  table_revisions: TableRevision[];
  table_revision_items: TableRevisionItem[];
  errors: AppError[];
  logs: AppLog[];
  config_history: ConfigHistory[];
  import_history: ImportHistory[];
}

const DATA_DIR = path.join(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'database.json');
const SNAPSHOTS_DIR = path.join(DATA_DIR, 'snapshots');
const SCREENSHOTS_DIR = path.join(DATA_DIR, 'screenshots');

// Ensure directories exist
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(SNAPSHOTS_DIR)) fs.mkdirSync(SNAPSHOTS_DIR, { recursive: true });
if (!fs.existsSync(SCREENSHOTS_DIR)) fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });

class DatabaseManager {
  private data: DatabaseSchema;
  private saveTimeout: NodeJS.Timeout | null = null;

  constructor() {
    this.data = this.loadDatabase();
  }

  private getDefaultSettings(): GlobalSettings {
    return {
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
      timezone: process.env.TZ || 'Asia/Tehran'
    };
  }

  private loadDatabase(): DatabaseSchema {
    if (fs.existsSync(DB_FILE)) {
      try {
        const raw = fs.readFileSync(DB_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        const sites = (parsed.sites || []).map((s: any) => ({
          ...s,
          scrape_method: s.scrape_method === 'PLAYWRIGHT' ? 'PLAYWRIGHT' : 'FETCH',
          browser: 'Chromium'
        }));
        const table_sources = (parsed.table_sources || []).map((ts: any) => ({
          ...ts,
          update_time_xpath: ts.update_time_xpath ?? null
        }));
        const product_selectors = (parsed.product_selectors || []).map((ps: any) => ({
          ...ps,
          update_time_xpath: ps.update_time_xpath ?? null
        }));
        return {
          factories: parsed.factories || [],
          price_tables: parsed.price_tables || [],
          products: parsed.products || [],
          sites,
          source_pages: parsed.source_pages || [],
          table_sources,
          product_selectors,
          page_actions: parsed.page_actions || [],
          global_settings: parsed.global_settings || this.getDefaultSettings(),
          runs: parsed.runs || [],
          run_locks: parsed.run_locks || [],
          daily_table_runs: parsed.daily_table_runs || [],
          daily_source_runs: parsed.daily_source_runs || [],
          price_records: parsed.price_records || [],
          price_changes: parsed.price_changes || [],
          table_revisions: parsed.table_revisions || [],
          table_revision_items: parsed.table_revision_items || [],
          errors: parsed.errors || [],
          logs: parsed.logs || [],
          config_history: parsed.config_history || [],
          import_history: parsed.import_history || []
        };
      } catch (e) {
        console.error('Error loading database.json, initializing fresh data store:', e);
      }
    }

    const initial: DatabaseSchema = {
      factories: [],
      price_tables: [],
      products: [],
      sites: [],
      source_pages: [],
      table_sources: [],
      product_selectors: [],
      page_actions: [],
      global_settings: this.getDefaultSettings(),
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

    this.persistSync(initial);
    return initial;
  }

  public persistSync(dataToSave: DatabaseSchema = this.data) {
    try {
      const tempPath = `${DB_FILE}.tmp`;
      fs.writeFileSync(tempPath, JSON.stringify(dataToSave, null, 2), 'utf-8');
      fs.renameSync(tempPath, DB_FILE);
    } catch (err) {
      console.error('Failed to persist database.json:', err);
    }
  }

  public save() {
    this.persistSync(this.data);
  }

  // Get raw schema references
  public getSchema(): DatabaseSchema {
    return this.data;
  }

  // Next auto-increment ID helper
  public getNextId(collection: keyof DatabaseSchema): number {
    const list = this.data[collection] as any[];
    if (!Array.isArray(list) || list.length === 0) return 1;
    const max = Math.max(...list.map((item) => (typeof item.id === 'number' ? item.id : 0)));
    return max + 1;
  }

  // Run locking
  public acquireLock(key: string, ownerRunId: number, ttlSeconds: number = 180): boolean {
    const now = new Date();
    this.cleanExpiredLocks();

    const existing = this.data.run_locks.find((l) => l.key === key);
    if (existing) {
      if (new Date(existing.expires_at) > now && existing.owner_run_id !== ownerRunId) {
        return false; // Still locked by another run
      }
      // Update lock
      existing.locked_at = now.toISOString();
      existing.expires_at = new Date(now.getTime() + ttlSeconds * 1000).toISOString();
      existing.owner_run_id = ownerRunId;
    } else {
      this.data.run_locks.push({
        key,
        locked_at: now.toISOString(),
        expires_at: new Date(now.getTime() + ttlSeconds * 1000).toISOString(),
        owner_run_id: ownerRunId
      });
    }

    this.save();
    return true;
  }

  public releaseLock(key: string, ownerRunId: number): void {
    this.data.run_locks = this.data.run_locks.filter(
      (l) => !(l.key === key && l.owner_run_id === ownerRunId)
    );
    this.save();
  }

  public cleanExpiredLocks(): void {
    const now = new Date().toISOString();
    this.data.run_locks = this.data.run_locks.filter((l) => l.expires_at > now);
  }

  // Logging helper
  public log(
    level: 'INFO' | 'WARNING' | 'ERROR',
    message: string,
    metadata?: Record<string, any>,
    context?: {
      run_id?: number;
      price_table_id?: number;
      table_source_id?: number;
      site_id?: number;
      product_id?: number;
    }
  ): AppLog {
    const entry: AppLog = {
      id: this.getNextId('logs'),
      level,
      message,
      metadata: metadata || {},
      run_id: context?.run_id,
      price_table_id: context?.price_table_id,
      table_source_id: context?.table_source_id,
      site_id: context?.site_id,
      product_id: context?.product_id,
      created_at: new Date().toISOString()
    };
    this.data.logs.unshift(entry);
    // Limit logs in memory to 2000 items
    if (this.data.logs.length > 2000) {
      this.data.logs = this.data.logs.slice(0, 2000);
    }
    this.save();
    return entry;
  }

  // Config audit logging
  public logConfigChange(
    entity_type: string,
    entity_id: number,
    field_changed: string,
    old_value: any,
    new_value: any,
    changed_by: string = 'مدیر سیستم'
  ): void {
    this.data.config_history.unshift({
      id: this.getNextId('config_history'),
      entity_type,
      entity_id,
      field_changed,
      old_value: String(old_value ?? ''),
      new_value: String(new_value ?? ''),
      changed_at: new Date().toISOString(),
      changed_by
    });
    this.save();
  }
}

export const db = new DatabaseManager();

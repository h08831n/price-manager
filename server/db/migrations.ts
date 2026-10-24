// Database Schema Versioning & Automated Migration Engine
import fs from 'fs';
import path from 'path';

export interface MigrationStep {
  version: number;
  name: string;
  description: string;
  up: (schema: any) => void;
}

export const LATEST_SCHEMA_VERSION = 6;

export const MIGRATIONS: MigrationStep[] = [
  {
    version: 1,
    name: 'init_core_collections',
    description: 'Ensure all required relational tables and arrays exist with valid structure',
    up: (schema: any) => {
      const collections = [
        'factories',
        'price_tables',
        'products',
        'sites',
        'source_pages',
        'table_sources',
        'product_selectors',
        'page_actions',
        'runs',
        'run_locks',
        'daily_table_runs',
        'daily_source_runs',
        'price_records',
        'price_changes',
        'table_revisions',
        'table_revision_items',
        'errors',
        'logs',
        'config_history',
        'import_history'
      ];
      for (const col of collections) {
        if (!Array.isArray(schema[col])) {
          schema[col] = [];
        }
      }
      if (!schema.global_settings || typeof schema.global_settings !== 'object') {
        schema.global_settings = {
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
        };
      }
    }
  },
  {
    version: 2,
    name: 'schema_versioning_audit',
    description: 'Add migration tracking history and schema version header',
    up: (schema: any) => {
      schema.schema_version = 2;
      if (!Array.isArray(schema.schema_migrations)) {
        schema.schema_migrations = [];
      }
    }
  },
  {
    version: 3,
    name: 'product_price_offsets_and_margins',
    description: 'Add price_offset and margin adjustment attributes to products',
    up: (schema: any) => {
      if (Array.isArray(schema.products)) {
        for (const p of schema.products) {
          if (p.price_offset === undefined) p.price_offset = 0;
          if (p.margin_percent === undefined) p.margin_percent = 0;
        }
      }
    }
  },
  {
    version: 4,
    name: 'table_level_offsets_and_vat',
    description: 'Add default price offset and VAT support for price tables',
    up: (schema: any) => {
      if (Array.isArray(schema.price_tables)) {
        for (const t of schema.price_tables) {
          if (t.default_price_offset === undefined) t.default_price_offset = 0;
          if (t.vat_percent === undefined) t.vat_percent = 10;
        }
      }
    }
  },
  {
    version: 5,
    name: 'normalize_table_sources_and_selectors',
    description: 'Ensure table sources and product selectors have clean update_time_xpath fields and active flags',
    up: (schema: any) => {
      if (Array.isArray(schema.table_sources)) {
        for (const ts of schema.table_sources) {
          if (ts.update_time_xpath === undefined) ts.update_time_xpath = null;
          if (ts.active === undefined) ts.active = true;
          if (ts.recheck_enabled === undefined) ts.recheck_enabled = false;
        }
      }
      if (Array.isArray(schema.product_selectors)) {
        for (const ps of schema.product_selectors) {
          if (ps.update_time_xpath === undefined) ps.update_time_xpath = null;
          if (ps.active === undefined) ps.active = true;
        }
      }
    }
  },
  {
    version: 6,
    name: 'destination_site_identifiers_and_sync',
    description: 'Add destination_id (WordPress target ID), last_synced_at, and sync_status to factories, price_tables, and products',
    up: (schema: any) => {
      // Factories
      if (Array.isArray(schema.factories)) {
        for (const f of schema.factories) {
          if (f.destination_id === undefined) f.destination_id = f.id;
          if (f.sync_status === undefined) f.sync_status = 'NOT_SYNCED';
          if (f.last_synced_at === undefined) f.last_synced_at = null;
        }
      }
      // Price Tables
      if (Array.isArray(schema.price_tables)) {
        for (const t of schema.price_tables) {
          if (t.destination_id === undefined) t.destination_id = t.id;
          if (t.sync_status === undefined) t.sync_status = 'NOT_SYNCED';
          if (t.last_synced_at === undefined) t.last_synced_at = null;
        }
      }
      // Products
      if (Array.isArray(schema.products)) {
        for (const p of schema.products) {
          if (p.destination_id === undefined) p.destination_id = p.post_id || p.id;
          if (p.sync_status === undefined) f_sync_status(p);
          if (p.last_synced_at === undefined) p.last_synced_at = null;
        }
      }
      function f_sync_status(prod: any) {
        prod.sync_status = prod.current_price > 0 ? 'SYNCED' : 'NOT_SYNCED';
      }
    }
  }
];

export function executeMigrations(schema: any, backupDir?: string): { applied: string[]; currentVersion: number } {
  const currentVersion = schema.schema_version || 0;
  const applied: string[] = [];

  if (!Array.isArray(schema.schema_migrations)) {
    schema.schema_migrations = [];
  }

  const pendingMigrations = MIGRATIONS.filter((m) => m.version > currentVersion).sort(
    (a, b) => a.version - b.version
  );

  if (pendingMigrations.length === 0) {
    schema.schema_version = Math.max(schema.schema_version || 0, LATEST_SCHEMA_VERSION);
    return { applied, currentVersion: schema.schema_version };
  }

  // Backup schema prior to applying migrations
  if (backupDir) {
    try {
      if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
      const backupPath = path.join(
        backupDir,
        `database_pre_migration_v${currentVersion}_${Date.now()}.json`
      );
      fs.writeFileSync(backupPath, JSON.stringify(schema, null, 2), 'utf-8');
      console.log(`📦 [DB Migration] Pre-migration backup saved to: ${backupPath}`);
    } catch (err) {
      console.warn('⚠️ [DB Migration] Could not create backup before migration:', err);
    }
  }

  for (const m of pendingMigrations) {
    console.log(`🔄 [DB Migration] Applying migration v${m.version}: ${m.name} - ${m.description}`);
    try {
      m.up(schema);
      schema.schema_version = m.version;
      schema.schema_migrations.push({
        version: m.version,
        name: m.name,
        description: m.description,
        applied_at: new Date().toISOString()
      });
      applied.push(`v${m.version}: ${m.name}`);
    } catch (err: any) {
      console.error(`❌ [DB Migration] Migration v${m.version} failed:`, err);
      throw new Error(`Database migration failed at v${m.version} (${m.name}): ${err.message}`);
    }
  }

  console.log(`✅ [DB Migration] Database successfully migrated to schema version ${schema.schema_version}`);
  return { applied, currentVersion: schema.schema_version };
}

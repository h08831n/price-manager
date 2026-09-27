// 1-Hour Persistent Cache for Interactive XPath Picker (Requirement for zero repeated requests)
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const CACHE_DIR = path.join(process.cwd(), 'data', 'picker_cache');
if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

export interface PickerCacheItem {
  key: string;
  url: string;
  table_source_id?: number | null;
  html: string;
  cachedAt: number;
  expiresAt: number;
}

// In-memory lookup map for ultra-fast response
const memoryCache = new Map<string, PickerCacheItem>();

function getCacheKey(url: string, tableSourceId?: number | null): string {
  const normUrl = url.trim().toLowerCase();
  const rawKey = `${normUrl}_ts:${tableSourceId || 'none'}`;
  return crypto.createHash('md5').update(rawKey).digest('hex');
}

/**
 * Retrieve cached HTML for a picker target if less than 1 hour old.
 */
export function getCachedPickerPage(
  url: string,
  tableSourceId?: number | null
): { html: string; cachedAt: number; expiresAt: number; ageSeconds: number; remainingMinutes: number } | null {
  if (!url) return null;
  const key = getCacheKey(url, tableSourceId);
  const now = Date.now();

  // 1. Check memory cache
  let item = memoryCache.get(key);

  // 2. Check disk cache if not in memory
  if (!item) {
    const filePath = path.join(CACHE_DIR, `${key}.json`);
    if (fs.existsSync(filePath)) {
      try {
        const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        if (raw && raw.expiresAt > now) {
          item = raw;
          memoryCache.set(key, raw);
        } else {
          try {
            fs.unlinkSync(filePath);
          } catch {}
        }
      } catch {}
    }
  }

  if (item && item.expiresAt > now) {
    const ageSeconds = Math.floor((now - item.cachedAt) / 1000);
    const remainingMinutes = Math.max(1, Math.round((item.expiresAt - now) / 60000));
    return {
      html: item.html,
      cachedAt: item.cachedAt,
      expiresAt: item.expiresAt,
      ageSeconds,
      remainingMinutes
    };
  }

  // If expired, clean up
  if (item) {
    memoryCache.delete(key);
    const filePath = path.join(CACHE_DIR, `${key}.json`);
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch {}
    }
  }

  return null;
}

/**
 * Save picker HTML page to cache with 1-hour expiration (3600000 ms).
 */
export function saveCachedPickerPage(
  url: string,
  html: string,
  tableSourceId?: number | null,
  ttlMs = 3600 * 1000 // 1 hour default
): void {
  if (!url || !html) return;
  const key = getCacheKey(url, tableSourceId);
  const now = Date.now();
  const item: PickerCacheItem = {
    key,
    url,
    table_source_id: tableSourceId,
    html,
    cachedAt: now,
    expiresAt: now + ttlMs
  };

  memoryCache.set(key, item);

  try {
    const filePath = path.join(CACHE_DIR, `${key}.json`);
    fs.writeFileSync(filePath, JSON.stringify(item), 'utf-8');
  } catch (err) {
    console.error('[PickerCache] Failed to write cache to disk:', err);
  }
}

/**
 * Invalidate picker cache for a specific URL or clear all.
 */
export function invalidatePickerCache(url?: string, tableSourceId?: number | null): void {
  if (url) {
    const key = getCacheKey(url, tableSourceId);
    memoryCache.delete(key);
    const filePath = path.join(CACHE_DIR, `${key}.json`);
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch {}
    }
  } else {
    memoryCache.clear();
    if (fs.existsSync(CACHE_DIR)) {
      for (const file of fs.readdirSync(CACHE_DIR)) {
        if (file.endsWith('.json')) {
          try {
            fs.unlinkSync(path.join(CACHE_DIR, file));
          } catch {}
        }
      }
    }
  }
}

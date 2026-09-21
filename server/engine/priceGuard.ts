// Price Guard and Configuration Inheritance Engine
import { db } from '../db/database';
import { PriceTable, TableSource, Site, Product } from '../../src/types';

export interface EffectiveConfig {
  max_attempts: number;
  retry_interval_minutes: number;
  price_guard_percent: number;
  timeout_seconds: number;
  recheck_enabled: boolean;
  origins: {
    max_attempts: 'GLOBAL' | 'TABLE' | 'SOURCE';
    retry_interval: 'GLOBAL' | 'TABLE' | 'SOURCE';
    price_guard: 'GLOBAL' | 'TABLE' | 'SOURCE';
    timeout: 'GLOBAL' | 'SITE' | 'SOURCE';
  };
}

// Compute cascading inheritance: Global -> Price Table -> Site -> Table Source
export function getEffectiveConfig(
  tableSource: TableSource,
  priceTable?: PriceTable,
  site?: Site
): EffectiveConfig {
  const schema = db.getSchema();
  const global = schema.global_settings;
  const table = priceTable || schema.price_tables.find((t) => t.id === tableSource.price_table_id);
  const targetSite = site || schema.sites.find((s) => s.id === tableSource.site_id);

  // 1. Max Attempts
  let max_attempts = global.default_max_attempts;
  let max_attempts_origin: 'GLOBAL' | 'TABLE' | 'SOURCE' = 'GLOBAL';
  if (table && typeof table.max_attempts === 'number' && table.max_attempts > 0) {
    max_attempts = table.max_attempts;
    max_attempts_origin = 'TABLE';
  }
  if (typeof tableSource.max_attempts_override === 'number' && tableSource.max_attempts_override > 0) {
    max_attempts = tableSource.max_attempts_override;
    max_attempts_origin = 'SOURCE';
  }

  // 2. Retry Interval
  let retry_interval_minutes = global.default_retry_interval;
  let retry_interval_origin: 'GLOBAL' | 'TABLE' | 'SOURCE' = 'GLOBAL';
  if (table && typeof table.retry_interval_minutes === 'number' && table.retry_interval_minutes > 0) {
    retry_interval_minutes = table.retry_interval_minutes;
    retry_interval_origin = 'TABLE';
  }
  if (typeof tableSource.retry_interval_override === 'number' && tableSource.retry_interval_override > 0) {
    retry_interval_minutes = tableSource.retry_interval_override;
    retry_interval_origin = 'SOURCE';
  }

  // 3. Price Guard Percent
  let price_guard_percent = global.default_price_guard_percent;
  let price_guard_origin: 'GLOBAL' | 'TABLE' | 'SOURCE' = 'GLOBAL';
  if (table && typeof table.price_guard_percent === 'number' && table.price_guard_percent > 0) {
    price_guard_percent = table.price_guard_percent;
    price_guard_origin = 'TABLE';
  }
  if (typeof tableSource.price_guard_override === 'number' && tableSource.price_guard_override > 0) {
    price_guard_percent = tableSource.price_guard_override;
    price_guard_origin = 'SOURCE';
  }

  // 4. Browser Timeout
  let timeout_seconds = global.default_browser_timeout_sec;
  let timeout_origin: 'GLOBAL' | 'SITE' | 'SOURCE' = 'GLOBAL';
  if (targetSite && typeof targetSite.timeout === 'number' && targetSite.timeout > 0) {
    timeout_seconds = targetSite.timeout;
    timeout_origin = 'SITE';
  }
  if (typeof tableSource.timeout_override === 'number' && tableSource.timeout_override > 0) {
    timeout_seconds = tableSource.timeout_override;
    timeout_origin = 'SOURCE';
  }

  return {
    max_attempts,
    retry_interval_minutes,
    price_guard_percent,
    timeout_seconds,
    recheck_enabled: tableSource.recheck_enabled,
    origins: {
      max_attempts: max_attempts_origin,
      retry_interval: retry_interval_origin,
      price_guard: price_guard_origin,
      timeout: timeout_origin
    }
  };
}

export interface PriceGuardCheckResult {
  blocked: boolean;
  previous_price: number;
  new_price: number;
  difference_amount: number;
  difference_percent: number;
  threshold_percent: number;
  reason?: string;
}

export function checkPriceGuard(
  previousPrice: number,
  newPrice: number,
  thresholdPercent: number
): PriceGuardCheckResult {
  // If there's no valid previous price, allow initialization
  if (!previousPrice || previousPrice <= 0) {
    return {
      blocked: false,
      previous_price: previousPrice,
      new_price: newPrice,
      difference_amount: 0,
      difference_percent: 0,
      threshold_percent: thresholdPercent
    };
  }

  const diffAmount = newPrice - previousPrice;
  const diffPercent = (diffAmount / previousPrice) * 100;
  const absPercent = Math.abs(diffPercent);

  const blocked = absPercent > thresholdPercent;

  return {
    blocked,
    previous_price: previousPrice,
    new_price: newPrice,
    difference_amount: diffAmount,
    difference_percent: Math.round(diffPercent * 100) / 100,
    threshold_percent: thresholdPercent,
    reason: blocked
      ? `تغییر قیمت (${diffPercent > 0 ? '+' : ''}${diffPercent.toFixed(1)}%) فراتر از آستانه مجاز (${thresholdPercent}%) است و توسط Price Guard مسدود شد.`
      : undefined
  };
}

// Calculate minimum price per product across valid scraped observations
export function calculateMinimumPrices(
  products: Product[],
  sourceObservations: Array<{
    table_source_id: number;
    site_id: number;
    product_id: number;
    post_id: number;
    parsed_price: number;
    valid: boolean;
  }>
): Map<number, { minPrice: number; sourceCount: number; sourcesUsed: number[] }> {
  const result = new Map<number, { minPrice: number; sourceCount: number; sourcesUsed: number[] }>();

  for (const prod of products) {
    const validObs = sourceObservations.filter(
      (o) => o.product_id === prod.id && o.valid && o.parsed_price > 0
    );

    if (validObs.length > 0) {
      const minPrice = Math.min(...validObs.map((o) => o.parsed_price));
      const sourcesUsed = validObs.map((o) => o.table_source_id);
      result.set(prod.id, {
        minPrice,
        sourceCount: validObs.length,
        sourcesUsed
      });
    }
  }

  return result;
}

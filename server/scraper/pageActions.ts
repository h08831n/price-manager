import { db } from '../db/database';
import { PageAction } from '../../src/types';

/**
 * Resolves the effective page actions for a TableSource.
 * 
 * Central Execution Rule:
 * if (tableSource has override actions) {
 *     use TABLE_SOURCE actions
 * } else {
 *     use SITE_DEFAULT actions
 * }
 * 
 * Site Default and TableSource Override are never merged.
 * Override completely replaces site defaults.
 * Actions are sorted by `order` ascending.
 */
export function resolveEffectivePageActions(tableSourceId: number): PageAction[] {
  const schema = db.getSchema();
  const tableSource = schema.table_sources.find((ts) => ts.id === tableSourceId);
  if (!tableSource) return [];

  // Check if TableSource has any TABLE_SOURCE actions defined
  const sourceActions = schema.page_actions.filter(
    (a) =>
      (a.scope === 'TABLE_SOURCE' && a.table_source_id === tableSourceId) ||
      (!a.scope && a.table_source_id === tableSourceId)
  );

  if (sourceActions.length > 0) {
    // Override: use only active TABLE_SOURCE actions sorted by order
    return sourceActions
      .filter((a) => a.active)
      .sort((a, b) => a.order - b.order);
  }

  // Fallback to SITE_DEFAULT actions for tableSource's site
  const siteId = tableSource.site_id;
  const siteActions = schema.page_actions.filter(
    (a) =>
      (a.scope === 'SITE_DEFAULT' && a.site_id === siteId) ||
      (!a.scope && a.site_id === siteId && !a.table_source_id && !a.source_page_id)
  );

  return siteActions
    .filter((a) => a.active)
    .sort((a, b) => a.order - b.order);
}

/**
 * Get all defined default actions for a Site.
 */
export function getSiteDefaultPageActions(siteId: number, activeOnly = false): PageAction[] {
  const schema = db.getSchema();
  return schema.page_actions
    .filter(
      (a) =>
        (a.scope === 'SITE_DEFAULT' && a.site_id === siteId) ||
        (!a.scope && a.site_id === siteId && !a.table_source_id && !a.source_page_id)
    )
    .filter((a) => (activeOnly ? a.active : true))
    .sort((a, b) => a.order - b.order);
}

/**
 * Get comprehensive action details for a TableSource (override state, site defaults, and effective).
 */
export function getTableSourcePageActionsInfo(tableSourceId: number): {
  hasOverride: boolean;
  overrideActions: PageAction[];
  siteDefaultActions: PageAction[];
  effectiveActions: PageAction[];
} {
  const schema = db.getSchema();
  const ts = schema.table_sources.find((t) => t.id === tableSourceId);
  const siteId = ts?.site_id || 0;

  const overrideActions = schema.page_actions
    .filter(
      (a) =>
        (a.scope === 'TABLE_SOURCE' && a.table_source_id === tableSourceId) ||
        (!a.scope && a.table_source_id === tableSourceId)
    )
    .sort((a, b) => a.order - b.order);

  const siteDefaultActions = getSiteDefaultPageActions(siteId, false);
  const effectiveActions = resolveEffectivePageActions(tableSourceId);

  return {
    hasOverride: overrideActions.length > 0,
    overrideActions,
    siteDefaultActions,
    effectiveActions
  };
}

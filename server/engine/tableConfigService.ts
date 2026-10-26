import { db } from '../db/database';
import {
  PriceTable,
  TableSource,
  ProductSelector,
  PageAction,
  Site,
  SourcePage,
  PriceTableConfigItem,
  PriceTableSourceConfig,
  PriceTableSelectorConfig,
  PriceTableActionConfig,
  PriceTablesExportPackage,
  PriceTablesImportPreview,
  PriceTablesImportResult
} from '../../src/types';

/**
 * Service to handle exporting and importing ONLY Price Tables and their configured sources,
 * selectors, and actions without affecting unrelated operational logs or global settings.
 */
export class TableConfigService {
  /**
   * Export configuration for all or selected price tables.
   */
  public exportConfig(tableIds?: number[]): PriceTablesExportPackage {
    const schema = db.getSchema();
    const idSet = tableIds && tableIds.length > 0 ? new Set(tableIds) : null;

    const selectedTables = idSet
      ? schema.price_tables.filter((t) => idSet.has(t.id))
      : schema.price_tables;

    const exportedTables: PriceTableConfigItem[] = [];
    const referencedSiteIds = new Set<number>();

    let totalSources = 0;
    let totalSelectors = 0;
    let totalPageActions = 0;

    for (const table of selectedTables) {
      const factory = schema.factories.find((f) => f.id === table.factory_id);
      const category = schema.categories ? schema.categories.find((c) => c.id === table.category_id) : undefined;

      // Find manual product names for portability
      const manualProductNames: string[] = [];
      if (Array.isArray(table.manual_product_ids) && table.manual_product_ids.length > 0) {
        const manualSet = new Set(table.manual_product_ids);
        schema.products.forEach((p) => {
          if (manualSet.has(p.id) || manualSet.has(p.post_id) || (p.destination_id && manualSet.has(p.destination_id))) {
            manualProductNames.push(p.name);
          }
        });
      }

      // Collect sources configured for this table
      const sourcesForTable = schema.table_sources.filter((ts) => ts.price_table_id === table.id);
      const exportedSources: PriceTableSourceConfig[] = [];

      for (const ts of sourcesForTable) {
        referencedSiteIds.add(ts.site_id);
        const site = schema.sites.find((s) => s.id === ts.site_id);
        const page = schema.source_pages.find((p) => p.id === ts.source_page_id);
        const resolvedUrl = page?.url || (ts as any).url || (ts as any).source_page_url || site?.base_url || '';

        // Collect selectors for this source
        const selectorsForSource = schema.product_selectors.filter((sel) => sel.table_source_id === ts.id);
        const exportedSelectors: PriceTableSelectorConfig[] = selectorsForSource.map((sel) => {
          const prod = schema.products.find((p) => p.id === sel.product_id);
          return {
            product_id: sel.product_id,
            post_id: sel.post_id || prod?.post_id,
            product_name: prod?.name,
            price_xpath: sel.price_xpath,
            update_time_xpath: sel.update_time_xpath ?? null,
            active: Boolean(sel.active)
          };
        });

        // Collect page actions specifically configured for this source (scope TABLE_SOURCE)
        const actionsForSource = schema.page_actions
          .filter((act) => act.scope === 'TABLE_SOURCE' && act.table_source_id === ts.id)
          .sort((a, b) => a.order - b.order);

        const exportedActions: PriceTableActionConfig[] = actionsForSource.map((act) => ({
          order: act.order,
          action_type: act.action_type,
          selector_type: act.selector_type,
          selector: act.selector,
          value: act.value,
          active: Boolean(act.active)
        }));

        totalSources++;
        totalSelectors += exportedSelectors.length;
        totalPageActions += exportedActions.length;

        exportedSources.push({
          id: ts.id,
          url: resolvedUrl,
          site_name: site?.name || '',
          site_base_url: site?.base_url || '',
          scrape_method: site?.scrape_method || 'FETCH',
          active: Boolean(ts.active),
          update_time_xpath: ts.update_time_xpath ?? null,
          recheck_enabled: Boolean(ts.recheck_enabled),
          max_attempts_override: ts.max_attempts_override ?? null,
          retry_interval_override: ts.retry_interval_override ?? null,
          timeout_override: ts.timeout_override ?? null,
          price_guard_override: ts.price_guard_override ?? null,
          selectors: exportedSelectors,
          page_actions: exportedActions
        });
      }

      exportedTables.push({
        id: table.id,
        destination_id: table.destination_id ?? null,
        name: table.name,
        factory_id: table.factory_id,
        factory_name: factory?.name || table.factory_name,
        category_id: table.category_id ?? null,
        category_name: category?.name || table.category_name,
        active: Boolean(table.active),
        start_time: table.start_time || '11:00',
        retry_interval_minutes: table.retry_interval_minutes || 30,
        max_attempts: table.max_attempts || 5,
        price_guard_percent: table.price_guard_percent ?? 30,
        default_price_adjustment: table.default_price_adjustment ?? 0,
        working_days: table.working_days || 'شنبه تا چهارشنبه',
        recheck_default: Boolean(table.recheck_default),
        assignment_mode: table.assignment_mode || 'TAXONOMY',
        manual_product_ids: table.manual_product_ids || [],
        manual_product_names: manualProductNames,
        product_by_attr: table.product_by_attr || [],
        product_by_attr_company: Boolean(table.product_by_attr_company),
        sources: exportedSources
      });
    }

    // Collect metadata for referenced sites so import can reconstruct them if needed
    const referencedSites: Partial<Site>[] = schema.sites
      .filter((s) => referencedSiteIds.has(s.id))
      .map((s) => ({
        id: s.id,
        name: s.name,
        base_url: s.base_url,
        scrape_method: s.scrape_method,
        browser: s.browser,
        timeout: s.timeout,
        wait_after_load: s.wait_after_load,
        active: s.active
      }));

    return {
      format: 'price_tables_config_export',
      version: 1,
      exported_at: new Date().toISOString(),
      source_app: 'سامانه جمع‌آوری قیمت و همگام‌سازی وردپرس',
      total_tables: exportedTables.length,
      total_sources: totalSources,
      total_selectors: totalSelectors,
      total_page_actions: totalPageActions,
      tables: exportedTables,
      referenced_sites: referencedSites
    };
  }

  /**
   * Parse and validate an incoming config payload without committing changes.
   */
  public previewImport(rawPayload: any): PriceTablesImportPreview {
    const schema = db.getSchema();
    const errors: string[] = [];

    let tables: PriceTableConfigItem[] = [];
    let version = 1;
    let exportedAt = '';

    if (!rawPayload || typeof rawPayload !== 'object') {
      return {
        valid: false,
        total_tables: 0,
        total_sources: 0,
        total_selectors: 0,
        total_page_actions: 0,
        tables: [],
        sites_to_create: [],
        errors: ['ساختار فایل ارسال‌شده نامعتبر است (JSON مورد نیاز است).']
      };
    }

    if (Array.isArray(rawPayload)) {
      tables = rawPayload;
    } else if (rawPayload.format === 'price_tables_config_export' && Array.isArray(rawPayload.tables)) {
      tables = rawPayload.tables;
      version = rawPayload.version || 1;
      exportedAt = rawPayload.exported_at || '';
    } else if (Array.isArray(rawPayload.tables)) {
      tables = rawPayload.tables;
    } else {
      return {
        valid: false,
        total_tables: 0,
        total_sources: 0,
        total_selectors: 0,
        total_page_actions: 0,
        tables: [],
        sites_to_create: [],
        errors: ['فایل فاقد آرایه جداول قیمت (tables) معتبر است.']
      };
    }

    if (tables.length === 0) {
      return {
        valid: false,
        total_tables: 0,
        total_sources: 0,
        total_selectors: 0,
        total_page_actions: 0,
        tables: [],
        sites_to_create: [],
        errors: ['هیچ جدول قیمتی در این فایل یافت نشد.']
      };
    }

    let totalSources = 0;
    let totalSelectors = 0;
    let totalPageActions = 0;
    const sitesToCreate = new Set<string>();

    const tablePreviews = tables.map((tbl, idx) => {
      if (!tbl.name || !String(tbl.name).trim()) {
        errors.push(`جدول شماره ${idx + 1} نام معتبری ندارد.`);
      }

      // Check match in current DB
      const existing = schema.price_tables.find(
        (existingTable) =>
          (tbl.destination_id && existingTable.destination_id === tbl.destination_id) ||
          existingTable.name.trim().toLowerCase() === String(tbl.name).trim().toLowerCase()
      );

      const sources = Array.isArray(tbl.sources) ? tbl.sources : [];
      let selCount = 0;
      let actCount = 0;

      for (const s of sources) {
        totalSources++;
        if (s.site_name) {
          const siteExists = schema.sites.some(
            (existingSite) =>
              existingSite.name.trim().toLowerCase() === s.site_name!.trim().toLowerCase() ||
              (s.site_base_url && existingSite.base_url.toLowerCase() === s.site_base_url.toLowerCase())
          );
          if (!siteExists) {
            sitesToCreate.add(s.site_name.trim());
          }
        }
        if (Array.isArray(s.selectors)) {
          selCount += s.selectors.length;
          totalSelectors += s.selectors.length;
        }
        if (Array.isArray(s.page_actions)) {
          actCount += s.page_actions.length;
          totalPageActions += s.page_actions.length;
        }
      }

      return {
        name: tbl.name,
        destination_id: tbl.destination_id ?? null,
        factory_name: tbl.factory_name,
        category_name: tbl.category_name,
        sources_count: sources.length,
        selectors_count: selCount,
        actions_count: actCount,
        action: existing ? ('UPDATE' as const) : ('CREATE' as const),
        existing_table_id: existing?.id
      };
    });

    return {
      valid: errors.length === 0,
      version,
      exported_at: exportedAt,
      total_tables: tables.length,
      total_sources: totalSources,
      total_selectors: totalSelectors,
      total_page_actions: totalPageActions,
      tables: tablePreviews,
      sites_to_create: Array.from(sitesToCreate),
      errors
    };
  }

  /**
   * Apply configuration import with automatic source, selector, and action resolution.
   */
  public applyImport(
    rawPayload: any,
    options: { mode?: 'upsert' | 'skip_existing' } = {}
  ): PriceTablesImportResult {
    const schema = db.getSchema();
    const mode = options.mode || 'upsert';

    let tables: PriceTableConfigItem[] = [];
    let referencedSites: Partial<Site>[] = [];

    if (Array.isArray(rawPayload)) {
      tables = rawPayload;
    } else if (rawPayload && typeof rawPayload === 'object') {
      tables = Array.isArray(rawPayload.tables) ? rawPayload.tables : [];
      referencedSites = Array.isArray(rawPayload.referenced_sites) ? rawPayload.referenced_sites : [];
    }

    if (tables.length === 0) {
      throw new Error('هیچ جدول قیمتی برای اعمال یافت نشد.');
    }

    let createdTables = 0;
    let updatedTables = 0;
    let createdSources = 0;
    let updatedSources = 0;
    let configuredSelectors = 0;
    let configuredActions = 0;
    let createdSites = 0;

    // 1. Ensure referenced sites exist or create them
    for (const refSite of referencedSites) {
      if (!refSite.name || !refSite.base_url) continue;
      const cleanName = refSite.name.trim();
      const cleanUrl = refSite.base_url.trim();

      const existingSite = schema.sites.find(
        (s) => s.name.trim().toLowerCase() === cleanName.toLowerCase() || s.base_url.toLowerCase() === cleanUrl.toLowerCase()
      );

      if (!existingSite) {
        const newSite: Site = {
          id: db.getNextId('sites'),
          name: cleanName,
          base_url: cleanUrl,
          scrape_method: refSite.scrape_method || 'FETCH',
          browser: 'Chromium',
          timeout: refSite.timeout || 30,
          wait_after_load: refSite.wait_after_load || 1000,
          active: refSite.active !== undefined ? Boolean(refSite.active) : true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
        schema.sites.push(newSite);
        createdSites++;
      }
    }

    // 2. Process each Price Table
    for (const item of tables) {
      if (!item.name || !String(item.name).trim()) continue;
      const cleanName = String(item.name).trim();

      // Find match
      let targetTable = schema.price_tables.find(
        (t) =>
          (item.destination_id && t.destination_id === item.destination_id) ||
          t.name.trim().toLowerCase() === cleanName.toLowerCase()
      );

      if (targetTable && mode === 'skip_existing') {
        continue;
      }

      // Resolve Factory ID
      let factoryId = item.factory_id;
      if (item.factory_name) {
        const matchedFac = schema.factories.find(
          (f) => f.name.trim().toLowerCase() === item.factory_name!.trim().toLowerCase()
        );
        if (matchedFac) factoryId = matchedFac.id;
      }
      if (!factoryId || !schema.factories.some((f) => f.id === factoryId)) {
        factoryId = schema.factories[0]?.id || 1;
      }

      // Resolve Category ID
      let categoryId: number | null = item.category_id ?? null;
      if (item.category_name && schema.categories) {
        const matchedCat = schema.categories.find(
          (c) => c.name.trim().toLowerCase() === item.category_name!.trim().toLowerCase()
        );
        if (matchedCat) categoryId = matchedCat.id;
      }

      // Resolve manual products if names are provided
      let manualProductIds = Array.isArray(item.manual_product_ids) ? [...item.manual_product_ids] : [];
      if (Array.isArray(item.manual_product_names) && item.manual_product_names.length > 0) {
        const resolvedIds: number[] = [];
        for (const pName of item.manual_product_names) {
          const p = schema.products.find((prod) => prod.name.trim().toLowerCase() === pName.trim().toLowerCase());
          if (p) resolvedIds.push(p.post_id || p.id);
        }
        if (resolvedIds.length > 0) {
          manualProductIds = Array.from(new Set([...manualProductIds, ...resolvedIds]));
        }
      }

      if (targetTable) {
        // Update existing table
        targetTable.name = cleanName;
        if (item.destination_id !== undefined && item.destination_id !== null) {
          targetTable.destination_id = item.destination_id;
        }
        targetTable.factory_id = factoryId;
        targetTable.category_id = categoryId;
        targetTable.start_time = item.start_time || targetTable.start_time || '11:00';
        targetTable.retry_interval_minutes = item.retry_interval_minutes || targetTable.retry_interval_minutes || 30;
        targetTable.max_attempts = item.max_attempts || targetTable.max_attempts || 5;
        targetTable.price_guard_percent = item.price_guard_percent !== undefined ? item.price_guard_percent : targetTable.price_guard_percent;
        if (item.default_price_adjustment !== undefined) {
          targetTable.default_price_adjustment = item.default_price_adjustment;
        }
        if (item.working_days !== undefined) targetTable.working_days = item.working_days;
        if (item.recheck_default !== undefined) targetTable.recheck_default = Boolean(item.recheck_default);
        if (item.assignment_mode !== undefined) targetTable.assignment_mode = item.assignment_mode;
        targetTable.manual_product_ids = manualProductIds;
        if (item.product_by_attr !== undefined) targetTable.product_by_attr = item.product_by_attr;
        if (item.product_by_attr_company !== undefined) targetTable.product_by_attr_company = item.product_by_attr_company;
        if (item.active !== undefined) targetTable.active = Boolean(item.active);
        targetTable.updated_at = new Date().toISOString();
        updatedTables++;
      } else {
        // Create new table
        const newId = db.getNextId('price_tables');
        targetTable = {
          id: newId,
          destination_id: item.destination_id || newId,
          name: cleanName,
          factory_id: factoryId,
          category_id: categoryId,
          start_time: item.start_time || '11:00',
          retry_interval_minutes: item.retry_interval_minutes || 30,
          max_attempts: item.max_attempts || 5,
          price_guard_percent: item.price_guard_percent ?? 30,
          default_price_adjustment: item.default_price_adjustment ?? 0,
          working_days: item.working_days || 'شنبه تا چهارشنبه',
          recheck_default: Boolean(item.recheck_default),
          assignment_mode: item.assignment_mode || (manualProductIds.length > 0 ? 'MANUAL' : 'TAXONOMY'),
          manual_product_ids: manualProductIds,
          product_by_attr: item.product_by_attr || [],
          product_by_attr_company: Boolean(item.product_by_attr_company),
          active: item.active !== undefined ? Boolean(item.active) : true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
        schema.price_tables.push(targetTable);
        createdTables++;
      }

      // Link manual products to this table if MANUAL mode
      if (manualProductIds.length > 0) {
        const manualSet = new Set(manualProductIds);
        schema.products.forEach((p) => {
          if (manualSet.has(p.id) || manualSet.has(p.post_id) || (p.destination_id && manualSet.has(p.destination_id))) {
            p.price_table_id = targetTable.id;
            p.price_table_name = targetTable.name;
          }
        });
      }

      // 3. Process Configured Sources for this Price Table
      const incomingSources = Array.isArray(item.sources) ? item.sources : [];

      for (const src of incomingSources) {
        if (!src.url && !src.site_name) continue;

        // Resolve site
        let matchedSite: Site | undefined;
        if (src.site_name) {
          matchedSite = schema.sites.find(
            (s) => s.name.trim().toLowerCase() === src.site_name!.trim().toLowerCase()
          );
        }
        if (!matchedSite && src.site_base_url) {
          matchedSite = schema.sites.find(
            (s) => s.base_url.toLowerCase() === src.site_base_url!.toLowerCase()
          );
        }
        if (!matchedSite && src.url) {
          try {
            const urlObj = new URL(src.url);
            matchedSite = schema.sites.find((s) => s.base_url.includes(urlObj.hostname));
          } catch {}
        }
        if (!matchedSite) {
          // Create site dynamically from source info
          const siteName = src.site_name || `سایت ${src.url ? new URL(src.url).hostname : 'جدید'}`;
          const baseUrl = src.site_base_url || (src.url ? new URL(src.url).origin : 'http://localhost:3000');
          matchedSite = {
            id: db.getNextId('sites'),
            name: siteName,
            base_url: baseUrl,
            scrape_method: src.scrape_method || 'FETCH',
            browser: 'Chromium',
            timeout: 30,
            wait_after_load: 1000,
            active: true,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          };
          schema.sites.push(matchedSite);
          createdSites++;
        }

        // Resolve Source Page
        const sourceUrl = src.url || matchedSite.base_url;
        let matchedPage = schema.source_pages.find(
          (p) => p.site_id === matchedSite!.id && p.url.trim().toLowerCase() === sourceUrl.trim().toLowerCase()
        );
        if (!matchedPage) {
          matchedPage = {
            id: db.getNextId('source_pages'),
            site_id: matchedSite.id,
            url: sourceUrl.trim(),
            active: true,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          };
          schema.source_pages.push(matchedPage);
        }

        // Match or create TableSource
        let targetSource = schema.table_sources.find(
          (ts) =>
            ts.price_table_id === targetTable.id &&
            ts.site_id === matchedSite!.id &&
            ts.source_page_id === matchedPage!.id
        );

        if (targetSource) {
          // Update source
          if (src.update_time_xpath !== undefined) {
            targetSource.update_time_xpath = src.update_time_xpath ? String(src.update_time_xpath).trim() : null;
          }
          if (src.recheck_enabled !== undefined) targetSource.recheck_enabled = Boolean(src.recheck_enabled);
          if (src.active !== undefined) targetSource.active = Boolean(src.active);
          if (src.max_attempts_override !== undefined) targetSource.max_attempts_override = src.max_attempts_override;
          if (src.retry_interval_override !== undefined) targetSource.retry_interval_override = src.retry_interval_override;
          if (src.timeout_override !== undefined) targetSource.timeout_override = src.timeout_override;
          if (src.price_guard_override !== undefined) targetSource.price_guard_override = src.price_guard_override;
          targetSource.updated_at = new Date().toISOString();
          updatedSources++;
        } else {
          // Create source
          targetSource = {
            id: db.getNextId('table_sources'),
            price_table_id: targetTable.id,
            site_id: matchedSite.id,
            source_page_id: matchedPage.id,
            update_time_xpath: src.update_time_xpath ? String(src.update_time_xpath).trim() : null,
            recheck_enabled: src.recheck_enabled !== undefined ? Boolean(src.recheck_enabled) : true,
            active: src.active !== undefined ? Boolean(src.active) : true,
            max_attempts_override: src.max_attempts_override ?? null,
            retry_interval_override: src.retry_interval_override ?? null,
            timeout_override: src.timeout_override ?? null,
            price_guard_override: src.price_guard_override ?? null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          };
          schema.table_sources.push(targetSource);
          createdSources++;
        }

        // 4. Process Selectors for this Source
        if (Array.isArray(src.selectors)) {
          for (const sel of src.selectors) {
            if (!sel.price_xpath || !sel.price_xpath.trim()) continue;

            // Find matching product
            let matchedProduct = schema.products.find(
              (p) =>
                (sel.post_id && p.post_id === sel.post_id) ||
                (sel.post_id && p.destination_id === sel.post_id) ||
                (sel.product_name && p.name.trim().toLowerCase() === sel.product_name.trim().toLowerCase()) ||
                (sel.product_id && p.id === sel.product_id)
            );

            if (!matchedProduct) continue;

            let existingSel = schema.product_selectors.find(
              (s) => s.table_source_id === targetSource!.id && s.product_id === matchedProduct!.id
            );

            if (existingSel) {
              existingSel.price_xpath = sel.price_xpath.trim();
              if (sel.update_time_xpath !== undefined) {
                existingSel.update_time_xpath = sel.update_time_xpath ? sel.update_time_xpath.trim() : null;
              }
              if (sel.active !== undefined) existingSel.active = Boolean(sel.active);
              existingSel.updated_at = new Date().toISOString();
            } else {
              existingSel = {
                id: db.getNextId('product_selectors'),
                product_id: matchedProduct.id,
                post_id: matchedProduct.post_id,
                table_source_id: targetSource.id,
                price_xpath: sel.price_xpath.trim(),
                update_time_xpath: sel.update_time_xpath ? sel.update_time_xpath.trim() : null,
                active: sel.active !== undefined ? Boolean(sel.active) : true,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
              };
              schema.product_selectors.push(existingSel);
            }
            configuredSelectors++;
          }
        }

        // 5. Process Page Actions for this Source
        if (Array.isArray(src.page_actions) && src.page_actions.length > 0) {
          // Replace table source specific actions cleanly
          schema.page_actions = schema.page_actions.filter(
            (a) => !(a.scope === 'TABLE_SOURCE' && a.table_source_id === targetSource!.id)
          );

          for (const act of src.page_actions) {
            const newAct: PageAction = {
              id: db.getNextId('page_actions'),
              scope: 'TABLE_SOURCE',
              site_id: matchedSite.id,
              table_source_id: targetSource.id,
              order: act.order || 1,
              action_type: act.action_type || 'WAIT',
              selector_type: act.selector_type,
              selector: act.selector || '',
              value: act.value || '',
              active: act.active !== undefined ? Boolean(act.active) : true,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            };
            schema.page_actions.push(newAct);
            configuredActions++;
          }
        }
      }
    }

    // Save synchronously
    db.save();

    db.log(
      'INFO',
      `اعمال موفق پیکربندی جداول قیمت: ${createdTables} جدول جدید، ${updatedTables} جدول بروزرسانی، ${createdSources + updatedSources} منبع، ${configuredSelectors} سلکتور`
    );

    return {
      success: true,
      message: `پیکربندی جداول قیمت و منابع با موفقیت اعمال شد (${createdTables + updatedTables} جدول، ${createdSources + updatedSources} منبع و ${configuredSelectors} سلکتور).`,
      created_tables: createdTables,
      updated_tables: updatedTables,
      created_sources: createdSources,
      updated_sources: updatedSources,
      configured_selectors: configuredSelectors,
      configured_actions: configuredActions,
      created_sites: createdSites
    };
  }
}

export const tableConfigService = new TableConfigService();

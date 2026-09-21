// Excel Import/Export and Template Service using ExcelJS
import ExcelJS from 'exceljs';
import { db } from '../db/database';
import { Product, Factory, PriceTable, Site, SourcePage, TableSource, ProductSelector, PageAction } from '../../src/types';

export interface ImportPreviewResult {
  file_name: string;
  entity_type: string;
  rows_total: number;
  rows_new: number;
  rows_updated: number;
  rows_unchanged: number;
  rows_failed: number;
  errors: Array<{ row: number; error: string; data?: any }>;
  valid_rows: any[];
}

export class ExcelService {
  // 1. Generate Downloadable Template for an entity
  public async generateTemplate(entityType: string): Promise<ExcelJS.Buffer> {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Template');

    switch (entityType) {
      case 'products':
        sheet.columns = [
          { header: 'post_id (الزامی)', key: 'post_id', width: 15 },
          { header: 'نام محصول (الزامی)', key: 'name', width: 30 },
          { header: 'شناسه فنی SKU', key: 'sku', width: 15 },
          { header: 'کارخانه', key: 'factory', width: 20 },
          { header: 'جدول قیمت', key: 'price_table', width: 20 },
          { header: 'قیمت فعلی', key: 'current_price', width: 15 },
          { header: 'فعال (بله/خیر)', key: 'active', width: 12 },
          { header: 'ویژگی: سایز (pa_size)', key: 'pa_size', width: 15 },
          { header: 'ویژگی: گرید (pa_grade)', key: 'pa_grade', width: 15 },
          { header: 'ویژگی: کارخانه (pa_factory)', key: 'pa_factory', width: 20 },
          { header: 'ویژگی: نوع (pa_type)', key: 'pa_type', width: 15 }
        ];
        sheet.addRow({
          post_id: 1840,
          name: 'میلگرد ۱۲ ذوب آهن',
          sku: 'ZOB-RB-12',
          factory: 'ذوب آهن اصفهان',
          price_table: 'میلگرد ذوب آهن',
          current_price: 58000,
          active: 'بله',
          pa_size: '12',
          pa_grade: 'A3',
          pa_factory: 'ذوب آهن اصفهان',
          pa_type: 'آجدار'
        });
        break;

      case 'factories':
        sheet.columns = [
          { header: 'نام کارخانه (الزامی)', key: 'name', width: 30 },
          { header: 'فعال (بله/خیر)', key: 'active', width: 15 }
        ];
        sheet.addRow({ name: 'ذوب آهن اصفهان', active: 'بله' });
        break;

      case 'price_tables':
        sheet.columns = [
          { header: 'نام جدول قیمت (الزامی)', key: 'name', width: 30 },
          { header: 'کارخانه (الزامی)', key: 'factory', width: 25 },
          { header: 'ساعت شروع (مثلا 11:00)', key: 'start_time', width: 15 },
          { header: 'فاصله تلاش مجدد (دقیقه)', key: 'retry_interval', width: 18 },
          { header: 'حداکثر تلاش‌ها', key: 'max_attempts', width: 15 },
          { header: 'درصد Price Guard', key: 'price_guard_percent', width: 18 },
          { header: 'فعال (بله/خیر)', key: 'active', width: 12 }
        ];
        sheet.addRow({
          name: 'میلگرد ذوب آهن',
          factory: 'ذوب آهن اصفهان',
          start_time: '11:00',
          retry_interval: 30,
          max_attempts: 5,
          price_guard_percent: 30,
          active: 'بله'
        });
        break;

      case 'sites':
        sheet.columns = [
          { header: 'نام سایت/رقیب (الزامی)', key: 'name', width: 25 },
          { header: 'آدرس پایه URL (الزامی)', key: 'base_url', width: 35 },
          { header: 'روش استخراج (FETCH / PLAYWRIGHT)', key: 'scrape_method', width: 30 },
          { header: 'مهلت بارگذاری (ثانیه)', key: 'timeout', width: 18 },
          { header: 'فعال (بله/خیر)', key: 'active', width: 12 }
        ];
        sheet.addRow({
          name: 'منبع الف',
          base_url: 'http://localhost:3000/fixtures/source-a.html',
          scrape_method: 'PLAYWRIGHT',
          timeout: 30,
          active: 'بله'
        });
        break;

      case 'table_sources':
        sheet.columns = [
          { header: 'جدول قیمت (الزامی)', key: 'price_table', width: 25 },
          { header: 'سایت منبع (الزامی)', key: 'site', width: 20 },
          { header: 'آدرس صفحه URL (الزامی)', key: 'url', width: 35 },
          { header: 'XPath زمان بروزرسانی', key: 'update_time_xpath', width: 30 },
          { header: 'بررسی مجدد Recheck (بله/خیر)', key: 'recheck_enabled', width: 20 },
          { header: 'فعال (بله/خیر)', key: 'active', width: 12 }
        ];
        sheet.addRow({
          price_table: 'میلگرد ذوب آهن',
          site: 'منبع الف',
          url: 'http://localhost:3000/fixtures/source-a.html',
          update_time_xpath: '//*[@id="last-update"]',
          recheck_enabled: 'بله',
          active: 'بله'
        });
        break;

      case 'product_selectors':
        sheet.columns = [
          { header: 'post_id محصول (الزامی)', key: 'post_id', width: 15 },
          { header: 'نام محصول', key: 'product_name', width: 25 },
          { header: 'جدول قیمت', key: 'price_table', width: 20 },
          { header: 'سایت منبع', key: 'site', width: 20 },
          { header: 'آدرس صفحه URL', key: 'url', width: 30 },
          { header: 'XPath قیمت (الزامی)', key: 'price_xpath', width: 35 },
          { header: 'XPath تاریخ محصول (اختیاری)', key: 'product_update_time_xpath', width: 35 },
          { header: 'فعال (بله/خیر)', key: 'active', width: 12 }
        ];
        sheet.addRow({
          post_id: 1840,
          product_name: 'میلگرد ۱۲ ذوب آهن',
          price_table: 'میلگرد ذوب آهن',
          site: 'منبع الف',
          url: 'http://localhost:3000/fixtures/source-a.html',
          price_xpath: '//table[@id="zobahan-table"]//tr[1]/td[5]',
          product_update_time_xpath: '//table[@id="zobahan-table"]//tr[1]/td[6]',
          active: 'بله'
        });
        break;

      case 'page_actions':
        sheet.columns = [
          { header: 'آدرس صفحه URL (الزامی)', key: 'url', width: 35 },
          { header: 'ترتیب (عدد)', key: 'order', width: 12 },
          { header: 'نوع دستور (WAIT/CLICK/SCROLL/SCROLL_TO/WAIT_FOR_ELEMENT)', key: 'action_type', width: 30 },
          { header: 'سلکتور (XPath یا CSS)', key: 'selector', width: 30 },
          { header: 'مقدار / مدت زمان به میلی‌ثانیه', key: 'value', width: 20 },
          { header: 'فعال (بله/خیر)', key: 'active', width: 12 }
        ];
        sheet.addRow({
          url: 'http://localhost:3000/fixtures/interactive-page.html',
          order: 1,
          action_type: 'CLICK',
          selector: '//*[@id="show-prices-btn"]',
          value: '',
          active: 'بله'
        });
        break;

      default:
        sheet.columns = [{ header: 'نام', key: 'name', width: 20 }];
    }

    return await workbook.xlsx.writeBuffer();
  }

  // 2. Export Any Entity or Report to Excel
  public async exportData(entityType: string): Promise<ExcelJS.Buffer> {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Export');
    const schema = db.getSchema();

    switch (entityType) {
      case 'products':
        sheet.columns = [
          { header: 'شناسه پست ووکامرس (post_id)', key: 'post_id', width: 18 },
          { header: 'نام محصول', key: 'name', width: 30 },
          { header: 'SKU', key: 'sku', width: 15 },
          { header: 'کارخانه', key: 'factory', width: 20 },
          { header: 'جدول قیمت', key: 'price_table', width: 20 },
          { header: 'قیمت فعلی', key: 'current_price', width: 15 },
          { header: 'وضعیت', key: 'active', width: 12 },
          { header: 'ویژگی‌ها', key: 'attributes', width: 35 }
        ];
        schema.products.forEach((p) => {
          const f = schema.factories.find((fac) => fac.id === p.factory_id);
          const pt = schema.price_tables.find((tbl) => tbl.id === p.price_table_id);
          sheet.addRow({
            post_id: p.post_id,
            name: p.name,
            sku: p.sku || '',
            factory: f?.name || '',
            price_table: pt?.name || '',
            current_price: p.current_price,
            active: p.active ? 'فعال' : 'غیرفعال',
            attributes: JSON.stringify(p.attributes || {})
          });
        });
        break;

      case 'factories':
        sheet.columns = [
          { header: 'شناسه', key: 'id', width: 10 },
          { header: 'نام کارخانه', key: 'name', width: 30 },
          { header: 'وضعیت', key: 'active', width: 15 }
        ];
        schema.factories.forEach((f) => {
          sheet.addRow({ id: f.id, name: f.name, active: f.active ? 'فعال' : 'غیرفعال' });
        });
        break;

      case 'price_tables':
        sheet.columns = [
          { header: 'شناسه', key: 'id', width: 10 },
          { header: 'نام جدول', key: 'name', width: 25 },
          { header: 'کارخانه', key: 'factory', width: 20 },
          { header: 'ساعت شروع', key: 'start_time', width: 15 },
          { header: 'فاصله تکرار (دقیقه)', key: 'retry_interval', width: 18 },
          { header: 'حداکثر تلاش', key: 'max_attempts', width: 15 },
          { header: 'Price Guard (%)', key: 'price_guard', width: 15 },
          { header: 'وضعیت', key: 'active', width: 12 }
        ];
        schema.price_tables.forEach((t) => {
          const f = schema.factories.find((fac) => fac.id === t.factory_id);
          sheet.addRow({
            id: t.id,
            name: t.name,
            factory: f?.name || '',
            start_time: t.start_time,
            retry_interval: t.retry_interval_minutes,
            max_attempts: t.max_attempts,
            price_guard: t.price_guard_percent,
            active: t.active ? 'فعال' : 'غیرفعال'
          });
        });
        break;

      case 'sites':
        sheet.columns = [
          { header: 'شناسه', key: 'id', width: 10 },
          { header: 'نام سایت', key: 'name', width: 25 },
          { header: 'آدرس پایه URL', key: 'base_url', width: 35 },
          { header: 'روش استخراج', key: 'scrape_method', width: 20 },
          { header: 'مهلت انتظار (ثانیه)', key: 'timeout', width: 18 },
          { header: 'وضعیت', key: 'active', width: 12 }
        ];
        schema.sites.forEach((s) => {
          sheet.addRow({
            id: s.id,
            name: s.name,
            base_url: s.base_url,
            scrape_method: s.scrape_method || 'FETCH',
            timeout: s.timeout,
            active: s.active ? 'فعال' : 'غیرفعال'
          });
        });
        break;

      case 'product_selectors':
        sheet.columns = [
          { header: 'شناسه', key: 'id', width: 10 },
          { header: 'post_id محصول', key: 'post_id', width: 15 },
          { header: 'نام محصول', key: 'product_name', width: 25 },
          { header: 'جدول قیمت', key: 'price_table', width: 20 },
          { header: 'سایت منبع', key: 'site', width: 20 },
          { header: 'XPath قیمت', key: 'price_xpath', width: 35 },
          { header: 'XPath تاریخ محصول', key: 'product_update_time_xpath', width: 35 },
          { header: 'وضعیت', key: 'active', width: 12 }
        ];
        schema.product_selectors.forEach((sel) => {
          const prod = schema.products.find((p) => p.id === sel.product_id);
          const ts = schema.table_sources.find((t) => t.id === sel.table_source_id);
          const table = ts ? schema.price_tables.find((pt) => pt.id === ts.price_table_id) : undefined;
          const site = ts ? schema.sites.find((s) => s.id === ts.site_id) : undefined;
          sheet.addRow({
            id: sel.id,
            post_id: sel.post_id || prod?.post_id || '',
            product_name: prod?.name || '',
            price_table: table?.name || '',
            site: site?.name || '',
            price_xpath: sel.price_xpath,
            product_update_time_xpath: sel.update_time_xpath || '',
            active: sel.active ? 'فعال' : 'غیرفعال'
          });
        });
        break;

      case 'price_history':
        sheet.columns = [
          { header: 'تاریخ استخراج', key: 'extracted_at', width: 22 },
          { header: 'شناسه پست', key: 'post_id', width: 15 },
          { header: 'نام محصول', key: 'product_name', width: 25 },
          { header: 'سایت منبع', key: 'site_name', width: 20 },
          { header: 'مقدار خام', key: 'raw_value', width: 15 },
          { header: 'قیمت استخراجی', key: 'parsed_price', width: 15 },
          { header: 'وضعیت', key: 'status', width: 18 }
        ];
        schema.price_records.slice(0, 1000).forEach((pr) => {
          const prod = schema.products.find((p) => p.id === pr.product_id);
          const site = schema.sites.find((s) => s.id === pr.site_id);
          sheet.addRow({
            extracted_at: pr.extracted_at,
            post_id: pr.post_id,
            product_name: prod?.name || '',
            site_name: site?.name || '',
            raw_value: pr.raw_value,
            parsed_price: pr.parsed_price,
            status: pr.status
          });
        });
        break;

      case 'price_changes':
        sheet.columns = [
          { header: 'تاریخ', key: 'created_at', width: 22 },
          { header: 'post_id', key: 'post_id', width: 15 },
          { header: 'نام کالا', key: 'product_name', width: 25 },
          { header: 'قیمت قدیم', key: 'old_price', width: 15 },
          { header: 'قیمت جدید', key: 'new_price', width: 15 },
          { header: 'میزان تغییر', key: 'diff', width: 15 },
          { header: 'درصد تغییر', key: 'percent', width: 15 },
          { header: 'جهت', key: 'direction', width: 12 }
        ];
        schema.price_changes.slice(0, 1000).forEach((pc) => {
          sheet.addRow({
            created_at: pc.created_at,
            post_id: pc.post_id,
            product_name: pc.product_name || '',
            old_price: pc.old_price,
            new_price: pc.new_price,
            diff: pc.change_amount,
            percent: `${pc.change_percent}%`,
            direction: pc.direction === 'UP' ? 'افزایش' : pc.direction === 'DOWN' ? 'کاهش' : 'بدون تغییر'
          });
        });
        break;

      case 'runs':
        sheet.columns = [
          { header: 'شناسه اجرا', key: 'id', width: 12 },
          { header: 'نوع ماشه (Trigger)', key: 'trigger', width: 18 },
          { header: 'جدول قیمت', key: 'table', width: 22 },
          { header: 'وضعیت', key: 'status', width: 15 },
          { header: 'شروع', key: 'started_at', width: 22 },
          { header: 'مدت (میلی‌ثانیه)', key: 'duration_ms', width: 15 },
          { header: 'تعداد کالا', key: 'products', width: 15 },
          { header: 'خطاها', key: 'errors', width: 12 }
        ];
        schema.runs.slice(0, 500).forEach((r) => {
          sheet.addRow({
            id: r.id,
            trigger: r.trigger_type,
            table: r.price_table_name || '',
            status: r.status,
            started_at: r.started_at,
            duration_ms: r.duration_ms || 0,
            products: `${r.products_extracted} / ${r.products_expected}`,
            errors: r.error_count
          });
        });
        break;

      case 'errors':
        sheet.columns = [
          { header: 'شناسه', key: 'id', width: 10 },
          { header: 'زمان وقوع', key: 'created_at', width: 22 },
          { header: 'نوع خطا', key: 'error_type', width: 25 },
          { header: 'پیام خطا', key: 'error_message', width: 40 },
          { header: 'وضعیت', key: 'status', width: 15 },
          { header: 'مرحله اجرا', key: 'stage', width: 18 }
        ];
        schema.errors.slice(0, 500).forEach((e) => {
          sheet.addRow({
            id: e.id,
            created_at: e.created_at,
            error_type: e.error_type,
            error_message: e.error_message,
            status: e.status,
            stage: e.execution_stage
          });
        });
        break;

      case 'logs':
        sheet.columns = [
          { header: 'زمان', key: 'created_at', width: 22 },
          { header: 'سطح لاگ', key: 'level', width: 12 },
          { header: 'پیام', key: 'message', width: 50 },
          { header: 'جزئیات', key: 'meta', width: 30 }
        ];
        schema.logs.slice(0, 1000).forEach((l) => {
          sheet.addRow({
            created_at: l.created_at,
            level: l.level,
            message: l.message,
            meta: JSON.stringify(l.metadata || {})
          });
        });
        break;

      default:
        sheet.columns = [{ header: 'داده', key: 'data', width: 20 }];
    }

    return await workbook.xlsx.writeBuffer();
  }

  // 3. Preview Uploaded Excel File (Requirement #5 & #69)
  public async previewImport(buffer: Buffer, entityType: string, fileName: string): Promise<ImportPreviewResult> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as any);
    const sheet = workbook.worksheets[0];

    if (!sheet) {
      throw new Error('فایل اکسل ارسالی فاقد برگه (Sheet) معتبر است.');
    }

    const schema = db.getSchema();
    const rowsTotal = sheet.rowCount > 1 ? sheet.rowCount - 1 : 0;
    let rowsNew = 0;
    let rowsUpdated = 0;
    let rowsUnchanged = 0;
    let rowsFailed = 0;
    const errors: Array<{ row: number; error: string; data?: any }> = [];
    const validRows: any[] = [];

    // Parse header row
    const headerRow = sheet.getRow(1);
    const headers: string[] = [];
    headerRow.eachCell((cell, colNumber) => {
      headers[colNumber] = cell.text.trim();
    });

    // Validate rows
    for (let rowIdx = 2; rowIdx <= sheet.rowCount; rowIdx++) {
      const row = sheet.getRow(rowIdx);
      if (!row || !row.hasValues) continue;

      const rowData: Record<string, any> = {};
      row.eachCell((cell, colNumber) => {
        const headerName = headers[colNumber];
        if (headerName) {
          rowData[headerName] = cell.value;
        }
      });

      try {
        if (entityType === 'products') {
          // Find post_id column
          let postIdRaw = rowData['post_id (الزامی)'] ?? rowData['post_id'] ?? rowData['شناسه پست ووکامرس (post_id)'];
          let name = rowData['نام محصول (الزامی)'] ?? rowData['نام محصول'] ?? rowData['name'];

          if (!postIdRaw) {
            rowsFailed++;
            errors.push({ row: rowIdx, error: 'شناسه post_id خالی است', data: rowData });
            continue;
          }

          const postId = parseInt(String(postIdRaw), 10);
          if (isNaN(postId) || postId <= 0) {
            rowsFailed++;
            errors.push({ row: rowIdx, error: `شناسه post_id نامعتبر است (${postIdRaw})`, data: rowData });
            continue;
          }

          if (!name || !String(name).trim()) {
            rowsFailed++;
            errors.push({ row: rowIdx, error: 'نام محصول نمی‌تواند خالی باشد', data: rowData });
            continue;
          }

          // Check if exists
          const existing = schema.products.find((p) => p.post_id === postId);
          const priceRaw = rowData['قیمت فعلی'] ?? rowData['current_price'] ?? 0;
          const price = parseFloat(String(priceRaw)) || 0;
          const activeStr = String(rowData['فعال (بله/خیر)'] ?? rowData['وضعیت'] ?? 'بله');
          const active = !/خیر|غیر|false|no|0/i.test(activeStr);

          // Find factory and price table references
          const factoryName = String(rowData['کارخانه'] ?? '').trim();
          const priceTableName = String(rowData['جدول قیمت'] ?? '').trim();

          let factoryId = existing?.factory_id || 1;
          if (factoryName) {
            const foundFac = schema.factories.find((f) => f.name === factoryName);
            if (foundFac) factoryId = foundFac.id;
          }

          let priceTableId = existing?.price_table_id || 1;
          if (priceTableName) {
            const foundTable = schema.price_tables.find((t) => t.name === priceTableName);
            if (foundTable) priceTableId = foundTable.id;
          }

          // Attributes
          const attributes: Record<string, any> = existing?.attributes ? { ...existing.attributes } : {};
          if (rowData['ویژگی: سایز (pa_size)']) attributes['pa_size'] = String(rowData['ویژگی: سایز (pa_size)']);
          if (rowData['ویژگی: گرید (pa_grade)']) attributes['pa_grade'] = String(rowData['ویژگی: گرید (pa_grade)']);
          if (rowData['ویژگی: کارخانه (pa_factory)']) attributes['pa_factory'] = String(rowData['ویژگی: کارخانه (pa_factory)']);
          if (rowData['ویژگی: نوع (pa_type)']) attributes['pa_type'] = String(rowData['ویژگی: نوع (pa_type)']);

          const parsedRow = {
            post_id: postId,
            name: String(name).trim(),
            sku: String(rowData['شناسه فنی SKU'] ?? rowData['sku'] ?? existing?.sku ?? ''),
            factory_id: factoryId,
            price_table_id: priceTableId,
            current_price: price,
            active,
            attributes
          };

          if (existing) {
            if (
              existing.name === parsedRow.name &&
              existing.current_price === parsedRow.current_price &&
              existing.active === parsedRow.active &&
              existing.factory_id === parsedRow.factory_id &&
              existing.price_table_id === parsedRow.price_table_id
            ) {
              rowsUnchanged++;
            } else {
              rowsUpdated++;
            }
          } else {
            rowsNew++;
          }

          validRows.push(parsedRow);
        } else if (entityType === 'factories') {
          const name = String(rowData['نام کارخانه (الزامی)'] ?? rowData['نام کارخانه'] ?? rowData['name'] ?? '').trim();
          if (!name) {
            rowsFailed++;
            errors.push({ row: rowIdx, error: 'نام کارخانه نمی‌تواند خالی باشد' });
            continue;
          }
          const existing = schema.factories.find((f) => f.name.toLowerCase() === name.toLowerCase());
          const activeStr = String(rowData['فعال (بله/خیر)'] ?? 'بله');
          const active = !/خیر|غیر|false|no|0/i.test(activeStr);

          if (existing) {
            if (existing.active === active) rowsUnchanged++;
            else rowsUpdated++;
          } else {
            rowsNew++;
          }
          validRows.push({ name, active });
        } else if (entityType === 'sites') {
          const name = String(rowData['نام سایت/رقیب (الزامی)'] ?? rowData['نام سایت'] ?? rowData['name'] ?? '').trim();
          const baseUrl = String(rowData['آدرس پایه URL (الزامی)'] ?? rowData['آدرس پایه URL'] ?? rowData['base_url'] ?? '').trim();
          if (!name || !baseUrl) {
            rowsFailed++;
            errors.push({ row: rowIdx, error: 'نام سایت و آدرس پایه URL نمی‌توانند خالی باشند', data: rowData });
            continue;
          }
          const rawMethod = String(rowData['روش استخراج (FETCH / PLAYWRIGHT)'] ?? rowData['روش استخراج'] ?? rowData['scrape_method'] ?? 'FETCH').trim().toUpperCase();
          const scrape_method: 'FETCH' | 'PLAYWRIGHT' = rawMethod === 'PLAYWRIGHT' ? 'PLAYWRIGHT' : 'FETCH';
          const timeout = parseInt(String(rowData['مهلت بارگذاری (ثانیه)'] ?? rowData['مهلت انتظار (ثانیه)'] ?? rowData['timeout'] ?? 30), 10) || 30;
          const activeStr = String(rowData['فعال (بله/خیر)'] ?? rowData['وضعیت'] ?? 'بله');
          const active = !/خیر|غیر|false|no|0/i.test(activeStr);

          const existing = schema.sites.find((s) => s.name.toLowerCase() === name.toLowerCase() || s.base_url.toLowerCase() === baseUrl.toLowerCase());
          const parsedRow = { name, base_url: baseUrl, scrape_method, timeout, active };

          if (existing) {
            if (existing.scrape_method === scrape_method && existing.timeout === timeout && existing.active === active) {
              rowsUnchanged++;
            } else {
              rowsUpdated++;
            }
          } else {
            rowsNew++;
          }
          validRows.push(parsedRow);
        } else if (entityType === 'product_selectors') {
          const postIdRaw = rowData['post_id محصول (الزامی)'] ?? rowData['post_id'] ?? rowData['post_id محصول'];
          const priceXpath = String(rowData['XPath قیمت (الزامی)'] ?? rowData['XPath قیمت'] ?? rowData['price_xpath'] ?? '').trim();
          if (!postIdRaw || !priceXpath) {
            rowsFailed++;
            errors.push({ row: rowIdx, error: 'post_id و XPath قیمت الزامی هستند', data: rowData });
            continue;
          }
          const postId = parseInt(String(postIdRaw), 10);
          const updateTimeXpath = String(rowData['XPath تاریخ محصول (اختیاری)'] ?? rowData['XPath تاریخ محصول'] ?? rowData['product_update_time_xpath'] ?? rowData['update_time_xpath'] ?? '').trim();
          const activeStr = String(rowData['فعال (بله/خیر)'] ?? rowData['وضعیت'] ?? 'بله');
          const active = !/خیر|غیر|false|no|0/i.test(activeStr);

          const product = schema.products.find(p => p.post_id === postId);
          const siteName = String(rowData['سایت منبع'] ?? rowData['site'] ?? '').trim();
          const tableName = String(rowData['جدول قیمت'] ?? rowData['price_table'] ?? '').trim();

          let tableSource = schema.table_sources.find(ts => {
            if (siteName) {
              const s = schema.sites.find(site => site.name === siteName);
              if (s && ts.site_id === s.id) return true;
            }
            if (tableName) {
              const pt = schema.price_tables.find(t => t.name === tableName);
              if (pt && ts.price_table_id === pt.id) return true;
            }
            return false;
          });

          const parsedRow = {
            post_id: postId,
            product_id: product?.id,
            table_source_id: tableSource?.id,
            price_xpath: priceXpath,
            update_time_xpath: updateTimeXpath || null,
            active
          };

          const existing = schema.product_selectors.find(ps => 
            (parsedRow.product_id ? ps.product_id === parsedRow.product_id : ps.post_id === postId) &&
            (parsedRow.table_source_id ? ps.table_source_id === parsedRow.table_source_id : true)
          );

          if (existing) {
            if (existing.price_xpath === priceXpath && existing.update_time_xpath === (updateTimeXpath || null) && existing.active === active) {
              rowsUnchanged++;
            } else {
              rowsUpdated++;
            }
          } else {
            rowsNew++;
          }
          validRows.push(parsedRow);
        } else {
          // Generic valid row
          rowsNew++;
          validRows.push(rowData);
        }
      } catch (err: any) {
        rowsFailed++;
        errors.push({ row: rowIdx, error: err.message, data: rowData });
      }
    }

    return {
      file_name: fileName,
      entity_type: entityType,
      rows_total: rowsTotal,
      rows_new: rowsNew,
      rows_updated: rowsUpdated,
      rows_unchanged: rowsUnchanged,
      rows_failed: rowsFailed,
      errors,
      valid_rows: validRows
    };
  }

  // 4. Apply Validated Import Changes (Requirement #5 & #6)
  public applyImport(preview: ImportPreviewResult): void {
    const schema = db.getSchema();
    const now = new Date().toISOString();

    if (preview.entity_type === 'products') {
      for (const row of preview.valid_rows) {
        const existing = schema.products.find((p) => p.post_id === row.post_id);
        if (existing) {
          existing.name = row.name;
          existing.sku = row.sku;
          existing.factory_id = row.factory_id;
          existing.price_table_id = row.price_table_id;
          if (row.current_price > 0) existing.current_price = row.current_price;
          existing.active = row.active;
          existing.attributes = { ...existing.attributes, ...row.attributes };
          existing.updated_at = now;
        } else {
          schema.products.push({
            id: db.getNextId('products'),
            post_id: row.post_id,
            name: row.name,
            sku: row.sku,
            factory_id: row.factory_id,
            price_table_id: row.price_table_id,
            current_price: row.current_price || 0,
            active: row.active,
            attributes: row.attributes || {},
            created_at: now,
            updated_at: now
          });
        }
      }
    } else if (preview.entity_type === 'factories') {
      for (const row of preview.valid_rows) {
        const existing = schema.factories.find((f) => f.name.toLowerCase() === row.name.toLowerCase());
        if (existing) {
          existing.active = row.active;
          existing.updated_at = now;
        } else {
          schema.factories.push({
            id: db.getNextId('factories'),
            name: row.name,
            active: row.active,
            created_at: now,
            updated_at: now
          });
        }
      }
    } else if (preview.entity_type === 'sites') {
      for (const row of preview.valid_rows) {
        const existing = schema.sites.find((s) => s.name.toLowerCase() === row.name.toLowerCase() || s.base_url.toLowerCase() === row.base_url.toLowerCase());
        if (existing) {
          existing.name = row.name;
          existing.base_url = row.base_url;
          existing.scrape_method = row.scrape_method;
          existing.timeout = row.timeout;
          existing.active = row.active;
          existing.updated_at = now;
        } else {
          schema.sites.push({
            id: db.getNextId('sites'),
            name: row.name,
            base_url: row.base_url,
            scrape_method: row.scrape_method,
            browser: 'Chromium',
            timeout: row.timeout,
            wait_after_load: 1000,
            active: row.active,
            created_at: now,
            updated_at: now
          });
        }
      }
    } else if (preview.entity_type === 'product_selectors') {
      for (const row of preview.valid_rows) {
        let productId = row.product_id;
        if (!productId) {
          const p = schema.products.find(prod => prod.post_id === row.post_id);
          productId = p ? p.id : 1;
        }
        let tableSourceId = row.table_source_id;
        if (!tableSourceId) {
          tableSourceId = schema.table_sources[0]?.id || 1;
        }
        const existing = schema.product_selectors.find(ps => ps.product_id === productId && ps.table_source_id === tableSourceId);
        const now = new Date().toISOString();
        if (existing) {
          existing.price_xpath = row.price_xpath;
          existing.update_time_xpath = row.update_time_xpath;
          existing.active = row.active;
          existing.updated_at = now;
        } else {
          schema.product_selectors.push({
            id: db.getNextId('product_selectors'),
            product_id: productId,
            post_id: row.post_id,
            table_source_id: tableSourceId,
            price_xpath: row.price_xpath,
            update_time_xpath: row.update_time_xpath,
            active: row.active,
            created_at: now,
            updated_at: now
          });
        }
      }
    }

    // Record in Import History (Requirement #5 & #39)
    schema.import_history.unshift({
      id: db.getNextId('import_history'),
      file_name: preview.file_name,
      import_type: preview.entity_type,
      uploaded_at: now,
      rows_total: preview.rows_total,
      rows_new: preview.rows_new,
      rows_updated: preview.rows_updated,
      rows_unchanged: preview.rows_unchanged,
      rows_failed: preview.rows_failed,
      status: preview.rows_failed === 0 ? 'SUCCESS' : preview.valid_rows.length > 0 ? 'PARTIAL' : 'FAILED',
      error_report: preview.errors.length > 0 ? JSON.stringify(preview.errors) : undefined
    });

    db.save();
  }
}

export const excelService = new ExcelService();

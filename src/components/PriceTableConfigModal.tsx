import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Download,
  Upload,
  Copy,
  Check,
  AlertCircle,
  CheckCircle2,
  Layers,
  Settings2,
  Table,
  Globe,
  FileCode2,
  RefreshCw,
  Sliders,
  Database
} from 'lucide-react';
import { PriceTable, PriceTablesExportPackage, PriceTablesImportPreview, PriceTablesImportResult } from '../types';
import { useEscapeKey } from '../hooks/useEscapeKey';

interface PriceTableConfigModalProps {
  isOpen: boolean;
  initialTab?: 'export' | 'import';
  preselectedTableIds?: number[];
  tables: PriceTable[];
  onClose: () => void;
  onSuccess: () => Promise<void> | void;
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
}

export const PriceTableConfigModal: React.FC<PriceTableConfigModalProps> = ({
  isOpen,
  initialTab = 'export',
  preselectedTableIds,
  tables,
  onClose,
  onSuccess,
  showToast
}) => {
  const [activeTab, setActiveTab] = useState<'export' | 'import'>(initialTab);

  // Export State
  const [exportScope, setExportScope] = useState<'all' | 'selected'>(
    preselectedTableIds && preselectedTableIds.length > 0 ? 'selected' : 'all'
  );
  const [selectedTableIds, setSelectedTableIds] = useState<number[]>(
    preselectedTableIds && preselectedTableIds.length > 0
      ? preselectedTableIds
      : tables.map((t) => t.id)
  );
  const [isExporting, setIsExporting] = useState(false);
  const [hasCopied, setHasCopied] = useState(false);

  // Import State
  const [importJsonText, setImportJsonText] = useState('');
  const [importFileName, setImportFileName] = useState('');
  const [importMode, setImportMode] = useState<'upsert' | 'skip_existing'>('upsert');
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [previewData, setPreviewData] = useState<PriceTablesImportPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [isApplying, setIsApplying] = useState(false);
  const [applyResult, setApplyResult] = useState<PriceTablesImportResult | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync initial tab and preselected tables when opened
  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
      if (preselectedTableIds && preselectedTableIds.length > 0) {
        setExportScope('selected');
        setSelectedTableIds(preselectedTableIds);
      } else {
        setExportScope('all');
        setSelectedTableIds(tables.map((t) => t.id));
      }
      setImportJsonText('');
      setImportFileName('');
      setPreviewData(null);
      setPreviewError(null);
      setApplyResult(null);
      setHasCopied(false);
    }
  }, [isOpen, initialTab, preselectedTableIds, tables]);

  // Handle Escape key
  useEscapeKey(() => {
    if (isOpen && !isApplying && !isExporting) {
      onClose();
    }
  }, isOpen);

  if (!isOpen) return null;

  // Toggle table selection in export list
  const toggleTableSelection = (id: number) => {
    setSelectedTableIds((prev) =>
      prev.includes(id) ? prev.filter((tId) => tId !== id) : [...prev, id]
    );
  };

  const selectAllTables = () => {
    setSelectedTableIds(tables.map((t) => t.id));
  };

  const deselectAllTables = () => {
    setSelectedTableIds([]);
  };

  // Perform Export Download
  const handleDownloadExport = async () => {
    try {
      setIsExporting(true);
      const queryParam = exportScope === 'selected'
        ? `?table_ids=${selectedTableIds.join(',')}&download=1`
        : '?download=1';

      const response = await fetch(`/api/price-tables/config/export${queryParam}`);
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'خطا در دریافت خروجی تنظیمات');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const dateStr = new Date().toISOString().split('T')[0];
      a.download = exportScope === 'selected' && selectedTableIds.length === 1
        ? `price-table-${selectedTableIds[0]}-config-${dateStr}.json`
        : `price-tables-config-${dateStr}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      showToast('فایل تنظیمات جداول قیمت و منابع با موفقیت دانلود شد', 'success');
    } catch (err: any) {
      showToast(err.message || 'خطا در دانلود فایل تنظیمات', 'error');
    } finally {
      setIsExporting(false);
    }
  };

  // Copy Export JSON to Clipboard
  const handleCopyExport = async () => {
    try {
      setIsExporting(true);
      const queryParam = exportScope === 'selected'
        ? `?table_ids=${selectedTableIds.join(',')}`
        : '';

      const response = await fetch(`/api/price-tables/config/export${queryParam}`);
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'خطا در دریافت خروجی');
      }

      const data = await response.json();
      await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
      setHasCopied(true);
      showToast('محتوای پیکربندی در حافظه کپی شد', 'success');
      setTimeout(() => setHasCopied(false), 2500);
    } catch (err: any) {
      showToast(err.message || 'خطا در کپی پیکربندی', 'error');
    } finally {
      setIsExporting(false);
    }
  };

  // Handle File Upload for Import
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportFileName(file.name);
    setPreviewError(null);
    setApplyResult(null);

    const reader = new FileReader();
    reader.onload = async (event) => {
      const text = event.target?.result as string;
      setImportJsonText(text);
      await fetchPreview(text);
    };
    reader.onerror = () => {
      setPreviewError('خطا در خواندن فایل انتخابی');
    };
    reader.readAsText(file);
  };

  // Fetch Preview for Import
  const fetchPreview = async (jsonString: string) => {
    if (!jsonString.trim()) {
      setPreviewData(null);
      setPreviewError(null);
      return;
    }

    setIsPreviewing(true);
    setPreviewError(null);
    setPreviewData(null);
    setApplyResult(null);

    try {
      let parsed: any;
      try {
        parsed = JSON.parse(jsonString);
      } catch {
        throw new Error('متن یا فایل وارد شده ساختار JSON معتبر ندارد.');
      }

      const res = await fetch('/api/price-tables/config/preview-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed)
      });

      const data: PriceTablesImportPreview = await res.json();
      if (!res.ok || !data.valid) {
        const errMsg = data.errors?.length > 0 ? data.errors.join(' | ') : 'پیکربندی ارسالی معتبر نیست.';
        setPreviewError(errMsg);
      } else {
        setPreviewData(data);
      }
    } catch (err: any) {
      setPreviewError(err.message || 'خطا در بررسی ساختار فایل تنظیمات');
    } finally {
      setIsPreviewing(false);
    }
  };

  // Execute Import
  const handleApplyImport = async () => {
    if (!importJsonText.trim()) return;

    setIsApplying(true);
    setApplyResult(null);

    try {
      let parsed: any;
      try {
        parsed = JSON.parse(importJsonText);
      } catch {
        throw new Error('فرمت JSON معتبر نیست.');
      }

      const res = await fetch('/api/price-tables/config/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          config: parsed,
          mode: importMode
        })
      });

      const data: PriceTablesImportResult = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'خطا در اعمال تنظیمات');
      }

      setApplyResult(data);
      showToast(data.message, 'success');
      await onSuccess();
    } catch (err: any) {
      showToast(err.message || 'خطا در اعمال پیکربندی', 'error');
    } finally {
      setIsApplying(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className="bg-white rounded-xl shadow-2xl border border-gray-200 w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gray-50/70">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-slate-900 text-white shadow-xs">
              <FileCode2 className="w-5 h-5 text-purple-300" />
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900">
                پیکربندی جداول قیمت و منابع (JSON)
              </h2>
              <p className="text-xs text-gray-500 mt-0.5">
                خروجی گرفتن و اعمال مجدد تنظیمات اختصاصی جداول قیمت، منابع مرتبط، XPathها و دستورات
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex border-b border-gray-200 bg-white px-6">
          <button
            type="button"
            onClick={() => setActiveTab('export')}
            className={`flex items-center gap-2 py-3 px-4 text-xs font-semibold border-b-2 transition-all cursor-pointer ${
              activeTab === 'export'
                ? 'border-purple-600 text-purple-700 bg-purple-50/40'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
            }`}
          >
            <Download className="w-4 h-4" />
            <span>خروجی تنظیمات (Export)</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-800 font-bold">
              JSON
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('import')}
            className={`flex items-center gap-2 py-3 px-4 text-xs font-semibold border-b-2 transition-all cursor-pointer ${
              activeTab === 'import'
                ? 'border-purple-600 text-purple-700 bg-purple-50/40'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
            }`}
          >
            <Upload className="w-4 h-4" />
            <span>ورود و اعمال تنظیمات (Import)</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold">
              Restore
            </span>
          </button>
        </div>

        {/* Body Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* ======================================================== */}
          {/* TAB 1: EXPORT */}
          {/* ======================================================== */}
          {activeTab === 'export' && (
            <div className="space-y-4">
              <div className="p-3.5 bg-blue-50/80 rounded-lg border border-blue-200 text-xs text-blue-900 leading-relaxed space-y-1">
                <div className="font-bold flex items-center gap-1.5 text-blue-950">
                  <Database className="w-4 h-4 text-blue-600" />
                  محتوای فایل خروجی فقط شامل تنظیمات جداول و منابع است:
                </div>
                <ul className="list-disc list-inside pr-1 space-y-0.5 text-blue-800">
                  <li>مشخصات جدول قیمت (ساعات شروع، بازه تلاش مجدد، محافظ قیمت، ضرایب تعدیل و نوع انتساب محصول)</li>
                  <li>کلیه منابع متصل به جدول، صفحات هدف، روش استخراج (Playwright/Fetch) و تنظیمات مجدد</li>
                  <li>سلکتورهای XPath قیمت و تاریخ استخراج برای هر محصول</li>
                  <li>دستورات اختصاصی کلیک و اسکرول صفحه (Page Actions) تنظیم‌شده برای منابع</li>
                </ul>
              </div>

              {/* Scope Selection */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-800">محدوده خروجی:</label>
                <div className="grid grid-cols-2 gap-3">
                  <label
                    className={`flex items-center gap-2.5 p-3 rounded-lg border cursor-pointer transition-all ${
                      exportScope === 'all'
                        ? 'border-purple-500 bg-purple-50/40 text-purple-950 font-medium'
                        : 'border-gray-200 hover:bg-gray-50 text-gray-700'
                    }`}
                  >
                    <input
                      type="radio"
                      name="exportScope"
                      checked={exportScope === 'all'}
                      onChange={() => setExportScope('all')}
                      className="text-purple-600 focus:ring-purple-500"
                    />
                    <div>
                      <div className="text-xs font-bold">همه جداول قیمت</div>
                      <div className="text-[11px] text-gray-500">
                        شامل تمام {tables.length} جدول قیمت به همراه تمام منابع پیکربندی‌شده
                      </div>
                    </div>
                  </label>

                  <label
                    className={`flex items-center gap-2.5 p-3 rounded-lg border cursor-pointer transition-all ${
                      exportScope === 'selected'
                        ? 'border-purple-500 bg-purple-50/40 text-purple-950 font-medium'
                        : 'border-gray-200 hover:bg-gray-50 text-gray-700'
                    }`}
                  >
                    <input
                      type="radio"
                      name="exportScope"
                      checked={exportScope === 'selected'}
                      onChange={() => setExportScope('selected')}
                      className="text-purple-600 focus:ring-purple-500"
                    />
                    <div>
                      <div className="text-xs font-bold">انتخاب جداول خاص</div>
                      <div className="text-[11px] text-gray-500">
                        {selectedTableIds.length} جدول از {tables.length} جدول انتخاب شده است
                      </div>
                    </div>
                  </label>
                </div>
              </div>

              {/* Table Selection Checklist (when selected scope is active) */}
              {exportScope === 'selected' && (
                <div className="border border-gray-200 rounded-lg p-3 bg-gray-50/50 space-y-2">
                  <div className="flex items-center justify-between pb-2 border-b border-gray-200">
                    <span className="text-xs font-bold text-gray-700">لیست جداول قیمت برای خروجی:</span>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={selectAllTables}
                        className="text-[11px] text-purple-700 hover:underline cursor-pointer"
                      >
                        انتخاب همه
                      </button>
                      <span className="text-gray-300">|</span>
                      <button
                        type="button"
                        onClick={deselectAllTables}
                        className="text-[11px] text-gray-500 hover:underline cursor-pointer"
                      >
                        لغو همه
                      </button>
                    </div>
                  </div>

                  <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
                    {tables.map((table) => {
                      const isChecked = selectedTableIds.includes(table.id);
                      return (
                        <label
                          key={table.id}
                          className={`flex items-center justify-between p-2 rounded-md border text-xs cursor-pointer transition-colors ${
                            isChecked
                              ? 'bg-white border-purple-300 text-gray-900 shadow-2xs'
                              : 'bg-white/60 border-gray-200 text-gray-500 hover:bg-white'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => toggleTableSelection(table.id)}
                              className="rounded text-purple-600 focus:ring-purple-500"
                            />
                            <span className="font-semibold">{table.name}</span>
                            {table.factory_name && (
                              <span className="text-[11px] text-gray-400">({table.factory_name})</span>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 font-mono">
                              {table.source_count ?? 0} منبع
                            </span>
                            <span
                              className={`w-2 h-2 rounded-full ${
                                table.active ? 'bg-emerald-500' : 'bg-gray-300'
                              }`}
                              title={table.active ? 'فعال' : 'غیرفعال'}
                            />
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ======================================================== */}
          {/* TAB 2: IMPORT */}
          {/* ======================================================== */}
          {activeTab === 'import' && (
            <div className="space-y-4">
              <div className="p-3.5 bg-amber-50/80 rounded-lg border border-amber-200 text-xs text-amber-900 leading-relaxed space-y-1">
                <div className="font-bold flex items-center gap-1.5 text-amber-950">
                  <Sliders className="w-4 h-4 text-amber-600" />
                  اعمال مجدد تنظیمات جداول و منابع:
                </div>
                <p>
                  فایل JSON خروجی گرفته‌شده را در این بخش بارگذاری کنید. سیستم به صورت خودکار جداول، منابع، XPathها و دستورات اختصاصی را تحلیل و مطابق انتخاب شما بروزرسانی یا ایجاد خواهد کرد.
                </p>
              </div>

              {/* Upload Zone */}
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-gray-300 hover:border-purple-400 rounded-xl p-6 text-center cursor-pointer bg-gray-50/50 hover:bg-purple-50/30 transition-all group"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json,application/json"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <div className="w-10 h-10 mx-auto rounded-full bg-purple-100 text-purple-700 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
                  <Upload className="w-5 h-5" />
                </div>
                <p className="text-xs font-bold text-gray-800">
                  {importFileName ? importFileName : 'برای انتخاب فایل JSON کلیک کنید یا آن را اینجا بکشید'}
                </p>
                <p className="text-[11px] text-gray-500 mt-1">
                  پشتیبانی از فایل‌های ساختار `price-tables-config-*.json`
                </p>
              </div>

              {/* Paste Direct JSON Option */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-gray-700">یا متن JSON را مستقیماً اینجا جای‌گذاری (Paste) کنید:</label>
                  {importJsonText && (
                    <button
                      type="button"
                      onClick={() => {
                        setImportJsonText('');
                        setImportFileName('');
                        setPreviewData(null);
                        setPreviewError(null);
                      }}
                      className="text-[11px] text-rose-600 hover:underline cursor-pointer"
                    >
                      پاک کردن
                    </button>
                  )}
                </div>
                <textarea
                  value={importJsonText}
                  onChange={(e) => {
                    const text = e.target.value;
                    setImportJsonText(text);
                    fetchPreview(text);
                  }}
                  rows={4}
                  dir="ltr"
                  placeholder='{"format": "price_tables_config_export", "tables": [...]}'
                  className="w-full p-2.5 text-[11px] font-mono border border-gray-200 rounded-lg focus:border-purple-500 focus:outline-hidden bg-gray-50/30"
                />
              </div>

              {/* Preview Status / Spinner */}
              {isPreviewing && (
                <div className="flex items-center justify-center gap-2 p-3 text-xs text-gray-500">
                  <RefreshCw className="w-4 h-4 animate-spin text-purple-600" />
                  <span>در حال اعتبارسنجی و بررسی ساختار تنظیمات...</span>
                </div>
              )}

              {/* Preview Error */}
              {previewError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2.5 text-xs text-red-800">
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-bold">خطا در اعتبارسنجی فایل:</div>
                    <div className="mt-0.5">{previewError}</div>
                  </div>
                </div>
              )}

              {/* Preview Data Success Card */}
              {previewData && previewData.valid && (
                <div className="border border-emerald-200 bg-emerald-50/40 rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between pb-2 border-b border-emerald-200">
                    <div className="flex items-center gap-2 text-xs font-bold text-emerald-900">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      <span>پیکربندی معتبر است - خلاصه محتوا:</span>
                    </div>
                    {previewData.exported_at && (
                      <span className="text-[10px] text-emerald-700">
                        تاریخ خروجی: {new Date(previewData.exported_at).toLocaleDateString('fa-IR')}
                      </span>
                    )}
                  </div>

                  {/* Summary Metric Counters */}
                  <div className="grid grid-cols-4 gap-2 text-center">
                    <div className="bg-white p-2 rounded-md border border-emerald-200 shadow-2xs">
                      <div className="text-base font-bold text-emerald-900">{previewData.total_tables}</div>
                      <div className="text-[10px] text-gray-500">جدول قیمت</div>
                    </div>
                    <div className="bg-white p-2 rounded-md border border-emerald-200 shadow-2xs">
                      <div className="text-base font-bold text-purple-900">{previewData.total_sources}</div>
                      <div className="text-[10px] text-gray-500">منبع متصل</div>
                    </div>
                    <div className="bg-white p-2 rounded-md border border-emerald-200 shadow-2xs">
                      <div className="text-base font-bold text-blue-900">{previewData.total_selectors}</div>
                      <div className="text-[10px] text-gray-500">سلکتور XPath</div>
                    </div>
                    <div className="bg-white p-2 rounded-md border border-emerald-200 shadow-2xs">
                      <div className="text-base font-bold text-amber-900">{previewData.total_page_actions}</div>
                      <div className="text-[10px] text-gray-500">دستور صفحه</div>
                    </div>
                  </div>

                  {/* Table details list */}
                  <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                    {previewData.tables.map((t, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between p-2 rounded bg-white border border-gray-200 text-xs"
                      >
                        <div className="flex items-center gap-2">
                          <Table className="w-3.5 h-3.5 text-gray-400" />
                          <span className="font-semibold text-gray-800">{t.name}</span>
                          {t.factory_name && (
                            <span className="text-[11px] text-gray-500">({t.factory_name})</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-gray-500 font-mono">
                            {t.sources_count} منبع / {t.selectors_count} سلکتور
                          </span>
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                              t.action === 'UPDATE'
                                ? 'bg-blue-100 text-blue-800'
                                : 'bg-emerald-100 text-emerald-800'
                            }`}
                          >
                            {t.action === 'UPDATE' ? 'بروزرسانی جدول موجود' : 'جدول جدید'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Sites to create */}
                  {previewData.sites_to_create && previewData.sites_to_create.length > 0 && (
                    <div className="text-[11px] text-purple-900 bg-purple-50 p-2 rounded border border-purple-200 flex items-center gap-2">
                      <Globe className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                      <span>سایت‌های جدیدی که به طور خودکار اضافه خواهند شد: {previewData.sites_to_create.join('، ')}</span>
                    </div>
                  )}

                  {/* Import Mode Radio */}
                  <div className="pt-2 border-t border-emerald-200 space-y-1.5">
                    <span className="text-xs font-bold text-gray-800">نحوه اعمال بر روی جداول موجود:</span>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <label
                        className={`flex items-start gap-2 p-2.5 rounded-md border cursor-pointer ${
                          importMode === 'upsert'
                            ? 'bg-white border-purple-500 font-medium text-gray-900'
                            : 'bg-white/60 border-gray-200 text-gray-600'
                        }`}
                      >
                        <input
                          type="radio"
                          name="importMode"
                          checked={importMode === 'upsert'}
                          onChange={() => setImportMode('upsert')}
                          className="mt-0.5 text-purple-600"
                        />
                        <div>
                          <div>بروزرسانی تنظیمات جداول موجود و ایجاد جدیدها (توصیه‌شده)</div>
                          <div className="text-[10px] text-gray-500">منابع و سلکتورهای جداول هم‌نام ارتقا می‌یابند</div>
                        </div>
                      </label>

                      <label
                        className={`flex items-start gap-2 p-2.5 rounded-md border cursor-pointer ${
                          importMode === 'skip_existing'
                            ? 'bg-white border-purple-500 font-medium text-gray-900'
                            : 'bg-white/60 border-gray-200 text-gray-600'
                        }`}
                      >
                        <input
                          type="radio"
                          name="importMode"
                          checked={importMode === 'skip_existing'}
                          onChange={() => setImportMode('skip_existing')}
                          className="mt-0.5 text-purple-600"
                        />
                        <div>
                          <div>فقط افزودن جداول جدید</div>
                          <div className="text-[10px] text-gray-500">جداول موجود دست‌نخورده باقی می‌مانند</div>
                        </div>
                      </label>
                    </div>
                  </div>
                </div>
              )}

              {/* Apply Success Result Box */}
              {applyResult && (
                <div className="p-4 bg-emerald-50 border border-emerald-300 rounded-lg text-xs text-emerald-950 space-y-2">
                  <div className="font-bold flex items-center gap-2 text-emerald-900">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                    <span>{applyResult.message}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center pt-2">
                    <div className="bg-white p-1.5 rounded border border-emerald-200">
                      <span className="font-bold">{applyResult.updated_tables + applyResult.created_tables}</span> جدول اعمال شد
                    </div>
                    <div className="bg-white p-1.5 rounded border border-emerald-200">
                      <span className="font-bold">{applyResult.updated_sources + applyResult.created_sources}</span> منبع فعال
                    </div>
                    <div className="bg-white p-1.5 rounded border border-emerald-200">
                      <span className="font-bold">{applyResult.configured_selectors}</span> سلکتور تنظیم شد
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 bg-gray-50/70">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer"
          >
            بستن
          </button>

          <div className="flex items-center gap-2">
            {activeTab === 'export' ? (
              <>
                <button
                  type="button"
                  onClick={handleCopyExport}
                  disabled={isExporting || (exportScope === 'selected' && selectedTableIds.length === 0)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 cursor-pointer"
                >
                  {hasCopied ? (
                    <>
                      <Check className="w-4 h-4 text-emerald-600" />
                      <span>کپی شد!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4 text-gray-500" />
                      <span>کپی JSON</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleDownloadExport}
                  disabled={isExporting || (exportScope === 'selected' && selectedTableIds.length === 0)}
                  className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-purple-700 hover:bg-purple-800 rounded-lg transition-colors shadow-xs disabled:opacity-50 cursor-pointer"
                >
                  <Download className={`w-4 h-4 ${isExporting ? 'animate-bounce' : ''}`} />
                  <span>دانلود فایل تنظیمات (JSON)</span>
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={handleApplyImport}
                disabled={isApplying || !previewData || !previewData.valid}
                className="inline-flex items-center gap-2 px-5 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg transition-colors shadow-xs disabled:opacity-50 cursor-pointer"
              >
                {isApplying ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>در حال اعمال تنظیمات...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    <span>اعمال و ذخیره پیکربندی در سامانه</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

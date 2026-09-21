import React, { useState } from 'react';
import {
  ArrowRight,
  Play,
  Globe,
  Clock,
  ShieldCheck,
  ShieldAlert,
  Send,
  Plus,
  RefreshCw,
  ExternalLink,
  Code,
  MousePointerClick,
  CheckCircle2,
  AlertTriangle
} from 'lucide-react';
import { PriceTable, TableSource, Product, ProductSelector, TableRevision, TableRevisionItem } from '../types';

interface PriceTableDetailViewProps {
  table: PriceTable;
  sources: TableSource[];
  products: Product[];
  selectors?: ProductSelector[];
  revisions: TableRevision[];
  revisionItems: TableRevisionItem[];
  onBack: () => void;
  onRunTable: (tableId: number) => Promise<void>;
  onRunSource: (sourceId: number) => Promise<void>;
  onSaveSelector?: (tableSourceId: number, productId: number, data: { price_xpath?: string; update_time_xpath?: string; active?: boolean }) => Promise<void>;
  onOpenPicker: (url: string, onSelect?: (xpath: string) => void) => void;
  onOpenTester: (sourceId: number, url: string, xpath?: string, type?: 'PRICE' | 'DATE') => void;
  onRetryPublish: (revisionId: number) => Promise<void>;
}

export const PriceTableDetailView: React.FC<PriceTableDetailViewProps> = ({
  table,
  sources,
  products,
  selectors = [],
  revisions,
  revisionItems,
  onBack,
  onRunTable,
  onRunSource,
  onSaveSelector,
  onOpenPicker,
  onOpenTester,
  onRetryPublish
}) => {
  const [isRunning, setIsRunning] = useState(false);
  const [runningSourceId, setRunningSourceId] = useState<number | null>(null);
  const [selectedSourceForSelectors, setSelectedSourceForSelectors] = useState<number | null>(sources.find(s => s.price_table_id === table.id)?.id || null);
  const [editingSelectors, setEditingSelectors] = useState<Record<string, { price_xpath: string; update_time_xpath: string }>>({});
  const [savingProductId, setSavingProductId] = useState<number | null>(null);

  const tableSources = sources.filter((s) => s.price_table_id === table.id);
  const tableProducts = products.filter((p) => p.price_table_id === table.id);

  // Latest calculated revision
  const latestRevision = revisions
    .filter((r) => r.price_table_id === table.id)
    .sort((a, b) => new Date(b.calculated_at).getTime() - new Date(a.calculated_at).getTime())[0];

  const currentItems = latestRevision
    ? revisionItems.filter((item) => item.table_revision_id === latestRevision.id)
    : [];

  const handleRunTable = async () => {
    setIsRunning(true);
    try {
      await onRunTable(table.id);
    } finally {
      setIsRunning(false);
    }
  };

  const handleRunSource = async (sourceId: number) => {
    setRunningSourceId(sourceId);
    try {
      await onRunSource(sourceId);
    } finally {
      setRunningSourceId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Detail Header */}
      <div className="bg-white p-5 rounded-lg border border-gray-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
            title="بازگشت به لیست جداول"
          >
            <ArrowRight className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-gray-900">{table.name}</h1>
              <span className="text-xs px-2.5 py-0.5 rounded bg-slate-100 text-slate-700 font-medium">
                کارخانه: {table.factory_name}
              </span>
              <span
                className={`text-xs px-2.5 py-0.5 rounded font-medium ${
                  table.today_status === 'COMPLETED'
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-amber-100 text-amber-800'
                }`}
              >
                {table.today_status === 'COMPLETED' ? 'کامل شده امروز' : 'در حال انتظار یا تلاش'}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-4 text-xs text-gray-500 mt-2">
              <span>ساعت شروع: <strong className="text-gray-700">{table.start_time}</strong></span>
              <span>فاصله تکرار: <strong className="text-gray-700">{table.retry_interval_minutes} دقیقه</strong></span>
              <span>حداکثر تلاش: <strong className="text-gray-700">{table.max_attempts} بار</strong></span>
              <span>آستانه Price Guard: <strong className="text-gray-700">{table.price_guard_percent}٪</strong></span>
            </div>
          </div>
        </div>

        {/* Header Action Buttons */}
        <div className="flex items-center gap-2">
          <button
            id={`btn-run-full-table-${table.id}`}
            onClick={handleRunTable}
            disabled={isRunning}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-50 rounded-md transition-colors shadow-xs"
          >
            <Play className={`w-3.5 h-3.5 ${isRunning ? 'animate-spin' : ''}`} />
            <span>{isRunning ? 'در حال اجرای سراسری...' : 'اجرای سراسری جدول'}</span>
          </button>
        </div>
      </div>

      {/* Sources Section (Requirement #11, #51) */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-gray-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Globe className="w-4 h-4 text-slate-700" />
            <h2 className="text-sm font-bold text-gray-900">منابع و سایت‌های رقیب این جدول ({tableSources.length})</h2>
          </div>
          <p className="text-xs text-gray-500">پایش روزانه تاریخ، زمان و استخراج قیمت از هر رقیب</p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-gray-50 text-gray-500 font-medium border-b border-gray-200">
              <tr>
                <th className="py-3 px-4">سایت رقیب / منبع</th>
                <th className="py-3 px-4">آدرس منبع (URL)</th>
                <th className="py-3 px-4">تاریخ استخراج شده</th>
                <th className="py-3 px-4 text-center">تازگی (امروز)</th>
                <th className="py-3 px-4 text-center">تلاش‌ها</th>
                <th className="py-3 px-4 text-center">بررسی مجدد</th>
                <th className="py-3 px-4 text-center">وضعیت امروز</th>
                <th className="py-3 px-4 text-center w-40">عملیات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {tableSources.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-gray-400">
                    هیچ منبعی برای این جدول تعریف نشده است.
                  </td>
                </tr>
              ) : (
                tableSources.map((source) => (
                  <tr key={source.id} className="hover:bg-gray-50/70 transition-colors">
                    <td className="py-3 px-4 font-semibold text-gray-900">{source.site_name}</td>
                    <td className="py-3 px-4 max-w-xs truncate text-gray-500 dir-ltr text-right font-mono text-[11px]">
                      {source.source_page_url || '—'}
                    </td>
                    <td className="py-3 px-4 text-gray-700">
                      {source.last_update_text || '—'}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${
                          source.fresh
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-amber-50 text-amber-700 border border-amber-200'
                        }`}
                      >
                        {source.fresh ? 'بروز (امروز)' : 'قدیمی / نامشخص'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center font-mono">
                      {source.attempt_count} / {source.max_attempts_override || table.max_attempts}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded font-medium ${
                          source.recheck_enabled ? 'bg-blue-50 text-blue-700' : 'bg-gray-100 text-gray-500'
                        }`}
                      >
                        {source.recheck_enabled ? 'فعال' : 'غیرفعال'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded font-medium ${
                          source.today_status === 'DONE' || source.today_status === 'UPDATED'
                            ? 'bg-emerald-100 text-emerald-800'
                            : source.today_status === 'FAILED'
                            ? 'bg-rose-100 text-rose-800'
                            : 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {source.today_status === 'DONE' || source.today_status === 'UPDATED'
                          ? 'استخراج شد'
                          : source.today_status === 'FAILED'
                          ? 'خطا در استخراج'
                          : 'در انتظار'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => handleRunSource(source.id)}
                          disabled={runningSourceId === source.id}
                          className="p-1.5 text-slate-700 hover:text-slate-900 hover:bg-slate-100 rounded transition-colors"
                          title="اجرای مستقل این منبع"
                        >
                          <Play className={`w-3.5 h-3.5 ${runningSourceId === source.id ? 'animate-spin' : ''}`} />
                        </button>
                        <button
                          onClick={() => onOpenTester(source.id, source.source_page_url || '', source.update_time_xpath || undefined, 'DATE')}
                          className="p-1.5 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded transition-colors"
                          title="تست XPath تاریخ جدول"
                        >
                          <Code className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => onOpenPicker(source.source_page_url || '')}
                          className="p-1.5 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded transition-colors"
                          title="انتخاب تعاملی المان از صفحه (Picker)"
                        >
                          <MousePointerClick className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Product Selectors Configuration Section */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-gray-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/70">
          <div>
            <div className="flex items-center gap-2">
              <Code className="w-4 h-4 text-slate-800" />
              <h2 className="text-sm font-bold text-gray-900">پیکربندی سلکتورهای استخراج قیمت و تاریخ کالاها (Product Selectors)</h2>
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              تنظیم XPath قیمت و تاریخ بروزرسانی اختصاصی هر ردیف کالا برای منابع رقیب
            </p>
          </div>

          {/* Source Tabs */}
          {tableSources.length > 0 && (
            <div className="flex items-center gap-1.5 overflow-x-auto">
              {tableSources.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setSelectedSourceForSelectors(s.id)}
                  className={`px-3 py-1 text-xs font-semibold rounded transition-colors whitespace-nowrap ${
                    selectedSourceForSelectors === s.id
                      ? 'bg-slate-900 text-white shadow-xs'
                      : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  {s.site_name}
                </button>
              ))}
            </div>
          )}
        </div>

        {(() => {
          const currentSource = tableSources.find((s) => s.id === selectedSourceForSelectors) || tableSources[0];
          if (!currentSource) {
            return (
              <div className="p-8 text-center text-xs text-gray-400">
                منبعی برای تنظیم سلکتورها وجود ندارد. ابتدا منبع رقیب را به جدول متصل کنید.
              </div>
            );
          }

          return (
            <div className="p-4 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200 text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-gray-700">صفحه منبع {currentSource.site_name}:</span>
                  <span className="font-mono text-gray-600 dir-ltr text-right max-w-md truncate">
                    {currentSource.source_page_url || '—'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-gray-500">XPath تاریخ کل جدول:</span>
                  <span className="font-mono bg-white px-2 py-0.5 rounded border border-gray-200 text-gray-800">
                    {currentSource.update_time_xpath || '(تعریف نشده)'}
                  </span>
                  {currentSource.update_time_xpath && (
                    <button
                      onClick={() =>
                        onOpenTester(currentSource.id, currentSource.source_page_url || '', currentSource.update_time_xpath || undefined, 'DATE')
                      }
                      className="px-2 py-1 bg-white border border-gray-300 rounded text-slate-800 hover:bg-gray-50 text-[11px] font-medium inline-flex items-center gap-1"
                    >
                      <Play className="w-3 h-3 text-slate-700" />
                      <span>تست تاریخ</span>
                    </button>
                  )}
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs">
                  <thead className="bg-gray-50 text-gray-600 font-medium border-b border-gray-200">
                    <tr>
                      <th className="py-2.5 px-3 w-20">کد کالا</th>
                      <th className="py-2.5 px-3 w-44">نام کالا</th>
                      <th className="py-2.5 px-3">عبارت XPath استخراج قیمت <span className="text-rose-500">*</span></th>
                      <th className="py-2.5 px-3">XPath تاریخ اختصاصی کالا (اختیاری)</th>
                      <th className="py-2.5 px-3 text-center w-28">عملیات</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {tableProducts.map((product) => {
                      const sel = selectors.find(
                        (s) => s.table_source_id === currentSource.id && s.product_id === product.id
                      );
                      const key = `${currentSource.id}_${product.id}`;
                      const currentVal = editingSelectors[key] ?? {
                        price_xpath: sel?.price_xpath || '',
                        update_time_xpath: sel?.update_time_xpath || ''
                      };

                      const handleFieldChange = (field: 'price_xpath' | 'update_time_xpath', value: string) => {
                        setEditingSelectors((prev) => ({
                          ...prev,
                          [key]: {
                            ...currentVal,
                            [field]: value
                          }
                        }));
                      };

                      const handleSave = async () => {
                        if (!onSaveSelector) return;
                        setSavingProductId(product.id);
                        try {
                          await onSaveSelector(currentSource.id, product.id, {
                            price_xpath: currentVal.price_xpath,
                            update_time_xpath: currentVal.update_time_xpath || undefined,
                            active: true
                          });
                        } finally {
                          setSavingProductId(null);
                        }
                      };

                      return (
                        <tr key={product.id} className="hover:bg-gray-50/60">
                          <td className="py-2.5 px-3 font-mono text-slate-700 font-medium">
                            {product.post_id}
                          </td>
                          <td className="py-2.5 px-3 font-medium text-gray-900">
                            {product.name}
                          </td>
                          <td className="py-2.5 px-3">
                            <div className="flex items-center gap-1.5">
                              <input
                                type="text"
                                value={currentVal.price_xpath}
                                onChange={(e) => handleFieldChange('price_xpath', e.target.value)}
                                placeholder="//table//tr[1]/td[2]"
                                className="w-full px-2.5 py-1 font-mono text-[11px] dir-ltr text-right bg-white border border-gray-200 rounded focus:border-slate-800 focus:outline-none"
                              />
                              <button
                                type="button"
                                onClick={() =>
                                  onOpenTester(
                                    currentSource.id,
                                    currentSource.source_page_url || '',
                                    currentVal.price_xpath,
                                    'PRICE'
                                  )
                                }
                                disabled={!currentVal.price_xpath}
                                className="p-1.5 text-gray-600 hover:text-slate-900 border border-gray-200 rounded hover:bg-gray-100 transition-colors disabled:opacity-40"
                                title="تست XPath استخراج قیمت"
                              >
                                <Play className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  onOpenPicker(currentSource.source_page_url || '', (pickedXPath) => {
                                    handleFieldChange('price_xpath', pickedXPath);
                                  })
                                }
                                className="p-1.5 text-gray-600 hover:text-slate-900 border border-gray-200 rounded hover:bg-gray-100 transition-colors"
                                title="انتخاب قیمت با موس (Picker)"
                              >
                                <MousePointerClick className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                          <td className="py-2.5 px-3">
                            <div className="flex items-center gap-1.5">
                              <input
                                type="text"
                                value={currentVal.update_time_xpath}
                                onChange={(e) => handleFieldChange('update_time_xpath', e.target.value)}
                                placeholder="اختیاری: //table//tr[1]/td[4]"
                                className="w-full px-2.5 py-1 font-mono text-[11px] dir-ltr text-right bg-white border border-gray-200 rounded focus:border-slate-800 focus:outline-none"
                              />
                              <button
                                type="button"
                                onClick={() =>
                                  onOpenTester(
                                    currentSource.id,
                                    currentSource.source_page_url || '',
                                    currentVal.update_time_xpath,
                                    'DATE'
                                  )
                                }
                                disabled={!currentVal.update_time_xpath}
                                className="p-1.5 text-gray-600 hover:text-slate-900 border border-gray-200 rounded hover:bg-gray-100 transition-colors disabled:opacity-40"
                                title="تست XPath تاریخ این کالا"
                              >
                                <Play className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  onOpenPicker(currentSource.source_page_url || '', (pickedXPath) => {
                                    handleFieldChange('update_time_xpath', pickedXPath);
                                  })
                                }
                                className="p-1.5 text-gray-600 hover:text-slate-900 border border-gray-200 rounded hover:bg-gray-100 transition-colors"
                                title="انتخاب تاریخ کالا با موس (Picker)"
                              >
                                <MousePointerClick className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <button
                              type="button"
                              onClick={handleSave}
                              disabled={savingProductId === product.id || !currentVal.price_xpath}
                              className="px-3 py-1 text-[11px] font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded transition-colors disabled:opacity-50"
                            >
                              {savingProductId === product.id ? 'در حال ثبت...' : 'ذخیره'}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })()}
      </div>

      {/* Calculated Output & WordPress Sync (Requirement #22-#27, #58) */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-gray-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/50">
          <div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-slate-800" />
              <h2 className="text-sm font-bold text-gray-900">اقلام خروجی و بررسی Price Guard</h2>
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              محاسبه حداقل قیمت بین منابع بروز و ارزیابی امنیتی قبل از ارسال به ووکامرس
            </p>
          </div>

          {latestRevision && (
            <div className="flex items-center gap-3">
              <span className="text-xs text-gray-500">
                وضعیت ارسال به وردپرس:
                <strong
                  className={`mr-1 font-semibold ${
                    latestRevision.wordpress_status === 'SUCCESS' ? 'text-emerald-700' : 'text-rose-700'
                  }`}
                >
                  {latestRevision.wordpress_status === 'SUCCESS' ? 'موفق' : 'ناموفق'}
                </strong>
              </span>

              {latestRevision.wordpress_status !== 'SUCCESS' && (
                <button
                  onClick={() => onRetryPublish(latestRevision.id)}
                  className="inline-flex items-center gap-1 px-3 py-1 text-xs font-medium text-slate-800 bg-white border border-gray-300 rounded hover:bg-gray-50 transition-colors shadow-xs"
                >
                  <Send className="w-3 h-3" />
                  <span>تلاش مجدد ارسال</span>
                </button>
              )}
            </div>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-gray-50 text-gray-500 font-medium border-b border-gray-200">
              <tr>
                <th className="py-3 px-4 w-28">post_id</th>
                <th className="py-3 px-4">نام کالا</th>
                <th className="py-3 px-4">قیمت فعلی سیستم</th>
                <th className="py-3 px-4">قیمت حداقل جدید</th>
                <th className="py-3 px-4 text-center">تغییر</th>
                <th className="py-3 px-4 text-center">وضعیت Price Guard</th>
                <th className="py-3 px-4">تعداد منابع استخراجی</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {tableProducts.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-gray-400">
                    کالایی به این جدول اختصاص داده نشده است.
                  </td>
                </tr>
              ) : (
                tableProducts.map((p) => {
                  const revItem = currentItems.find((item) => item.product_id === p.id || item.post_id === p.post_id);
                  const newPrice = revItem ? revItem.calculated_price : p.current_price;
                  const isBlocked = revItem?.is_blocked_by_price_guard || false;
                  const diff = p.current_price > 0 && newPrice > 0 ? newPrice - p.current_price : 0;
                  const diffPct = p.current_price > 0 ? ((diff / p.current_price) * 100).toFixed(1) : '0';

                  return (
                    <tr key={p.id} className="hover:bg-gray-50/70 transition-colors">
                      <td className="py-3 px-4 font-mono font-medium text-slate-700">{p.post_id}</td>
                      <td className="py-3 px-4 font-medium text-gray-900">{p.name}</td>
                      <td className="py-3 px-4 text-gray-600">
                        {p.current_price.toLocaleString('fa-IR')} تومان
                      </td>
                      <td className="py-3 px-4 font-bold text-gray-900">
                        {newPrice > 0 ? `${newPrice.toLocaleString('fa-IR')} تومان` : '—'}
                      </td>
                      <td className="py-3 px-4 text-center font-mono">
                        {diff !== 0 ? (
                          <span className={diff > 0 ? 'text-rose-600' : 'text-emerald-600'}>
                            {diff > 0 ? '+' : ''}{diffPct}٪
                          </span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-center">
                        {isBlocked ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
                            <ShieldAlert className="w-3 h-3" />
                            مسدود شده (نوسان شدید)
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <ShieldCheck className="w-3 h-3" />
                            تایید شده
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-gray-500">
                        {revItem ? `${revItem.sources_count} منبع فعال` : '—'}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

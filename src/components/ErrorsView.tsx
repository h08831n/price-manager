import React, { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Play,
  FileCode,
  Image as ImageIcon,
  Code,
  Filter,
  RefreshCw,
  Search,
  Check,
  EyeOff,
  Download
} from 'lucide-react';
import { SystemError, PriceTable } from '../types';
import { SnapshotModal } from './SnapshotModal';

interface ErrorsViewProps {
  errors: SystemError[];
  priceTables: PriceTable[];
  onResolve: (id: number) => Promise<void>;
  onIgnore: (id: number) => Promise<void>;
  onRetry: (id: number) => Promise<void>;
  onOpenTester: (sourceId: number, url: string, xpath?: string) => void;
  onExport: (entity: string) => void;
}

export const ErrorsView: React.FC<ErrorsViewProps> = ({
  errors,
  priceTables,
  onResolve,
  onIgnore,
  onRetry,
  onOpenTester,
  onExport
}) => {
  const [statusFilter, setStatusFilter] = useState<string>('OPEN');
  const [tableFilter, setTableFilter] = useState<string>('ALL');
  const [search, setSearch] = useState<string>('');
  const [snapshotModal, setSnapshotModal] = useState<{ type: 'html' | 'image'; filename: string; title: string } | null>(null);
  const [retryingId, setRetryingId] = useState<number | null>(null);

  const filteredErrors = errors.filter((e) => {
    const matchesStatus = statusFilter === 'ALL' || e.status === statusFilter;
    const matchesTable = tableFilter === 'ALL' || e.price_table_id === parseInt(tableFilter, 10);
    const matchesSearch =
      !search ||
      e.error_message.toLowerCase().includes(search.toLowerCase()) ||
      e.error_type.toLowerCase().includes(search.toLowerCase()) ||
      (e.product_name && e.product_name.toLowerCase().includes(search.toLowerCase()));

    return matchesStatus && matchesTable && matchesSearch;
  });

  const handleRetry = async (err: SystemError) => {
    setRetryingId(err.id);
    try {
      await onRetry(err.id);
    } finally {
      setRetryingId(null);
    }
  };

  const openCount = errors.filter((e) => e.status === 'OPEN').length;

  return (
    <div className="space-y-4">
      {/* Control Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-lg border border-gray-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold text-gray-900">مرکز عیب‌یابی و مدیریت خطاها</h2>
            {openCount > 0 && (
              <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-rose-100 text-rose-800 border border-rose-200">
                {openCount} خطای باز
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500 mt-0.5">
            بررسی دلایل عدم استخراج قیمت، اسنپ‌شات‌های HTML، تصاویر صفحه و تلاش مجدد
          </p>
        </div>

        <button
          onClick={() => onExport('errors')}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-200 rounded-md hover:bg-gray-50 transition-colors"
        >
          <Download className="w-3.5 h-3.5 text-gray-500" />
          <span>خروجی اکسل خطاها</span>
        </button>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3 rounded-lg border border-gray-200 text-xs">
        <div className="flex items-center gap-2 overflow-x-auto">
          <span className="text-gray-500 font-medium">وضعیت:</span>
          {[
            { id: 'OPEN', label: 'خطاهای باز' },
            { id: 'RETRYING', label: 'در حال تلاش' },
            { id: 'RESOLVED', label: 'حل شده' },
            { id: 'IGNORED', label: 'نادیده گرفته شده' },
            { id: 'ALL', label: 'همه خطاها' }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setStatusFilter(tab.id)}
              className={`px-3 py-1 rounded font-medium transition-colors ${
                statusFilter === tab.id
                  ? 'bg-slate-900 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          {/* Table filter */}
          <select
            value={tableFilter}
            onChange={(e) => setTableFilter(e.target.value)}
            className="bg-gray-50 border border-gray-200 rounded px-2.5 py-1 text-xs text-gray-700 focus:outline-none"
          >
            <option value="ALL">همه جداول</option>
            {priceTables.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>

          {/* Search box */}
          <input
            type="text"
            placeholder="جستجو در پیام یا نوع خطا..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="px-2.5 py-1 text-xs bg-gray-50 border border-gray-200 rounded focus:bg-white focus:outline-none focus:border-slate-800"
          />
        </div>
      </div>

      {/* Errors Table */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-gray-50 text-gray-500 font-medium border-b border-gray-200">
              <tr>
                <th className="py-3 px-4 w-32">زمان وقوع</th>
                <th className="py-3 px-4">نوع خطا</th>
                <th className="py-3 px-4">جدول / منبع</th>
                <th className="py-3 px-4">کالا</th>
                <th className="py-3 px-4">پیام خطا</th>
                <th className="py-3 px-4 text-center">وضعیت</th>
                <th className="py-3 px-4 text-center w-52">عملیات عیب‌یابی</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredErrors.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-gray-400">
                    خطایی با این فیلترها یافت نشد.
                  </td>
                </tr>
              ) : (
                filteredErrors.map((err) => (
                  <tr key={err.id} className="hover:bg-gray-50/80 transition-colors">
                    <td className="py-3 px-4 text-gray-500 font-mono text-[11px]">
                      {new Date(err.created_at).toLocaleTimeString('fa-IR')}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-[11px] font-mono font-semibold ${
                          err.error_type === 'PRICE_GUARD_BLOCKED'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-rose-100 text-rose-800'
                        }`}
                      >
                        {err.error_type}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-gray-700">
                      <div>{err.price_table_name || '—'}</div>
                      <div className="text-[11px] text-gray-400">{err.site_name}</div>
                    </td>
                    <td className="py-3 px-4 text-gray-700">
                      {err.product_name ? (
                        <div>
                          <div className="font-medium text-gray-900">{err.product_name}</div>
                          <div className="text-[10px] font-mono text-gray-400">post_id: {err.post_id}</div>
                        </div>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="py-3 px-4 text-gray-800 max-w-sm">
                      <p className="font-medium truncate">{err.error_message}</p>
                      {err.xpath && (
                        <code className="text-[10px] text-gray-500 dir-ltr text-right block mt-0.5 font-mono truncate">
                          {err.xpath}
                        </code>
                      )}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${
                          err.status === 'OPEN'
                            ? 'bg-rose-50 text-rose-700 border border-rose-200'
                            : err.status === 'RESOLVED'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {err.status === 'OPEN'
                          ? 'باز'
                          : err.status === 'RESOLVED'
                          ? 'حل شده'
                          : err.status === 'RETRYING'
                          ? 'در حال تلاش'
                          : 'نادیده گرفته شده'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <div className="flex items-center justify-center gap-1">
                        {/* HTML Snapshot */}
                        {err.html_snapshot_path && (
                          <button
                            onClick={() =>
                              setSnapshotModal({
                                type: 'html',
                                filename: err.html_snapshot_path!.split('/').pop()!,
                                title: `اسنپ‌شات HTML هنگام وقوع خطا #${err.id}`
                              })
                            }
                            className="p-1 text-blue-600 hover:bg-blue-50 rounded"
                            title="مشاهده اسنپ‌شات HTML صفحه در زمان خطا"
                          >
                            <FileCode className="w-4 h-4" />
                          </button>
                        )}

                        {/* Screenshot */}
                        {err.screenshot_path && (
                          <button
                            onClick={() =>
                              setSnapshotModal({
                                type: 'image',
                                filename: err.screenshot_path!.split('/').pop()!,
                                title: `تصویر صفحه هنگام وقوع خطا #${err.id}`
                              })
                            }
                            className="p-1 text-emerald-600 hover:bg-emerald-50 rounded"
                            title="مشاهده تصویر صفحه"
                          >
                            <ImageIcon className="w-4 h-4" />
                          </button>
                        )}

                        {/* Test XPath */}
                        {err.xpath && (
                          <button
                            onClick={() => onOpenTester(err.table_source_id || 1, '', err.xpath)}
                            className="p-1 text-slate-700 hover:bg-gray-100 rounded"
                            title="تست فوری سلکتور"
                          >
                            <Code className="w-4 h-4" />
                          </button>
                        )}

                        {/* Retry */}
                        {err.status === 'OPEN' && (
                          <button
                            onClick={() => handleRetry(err)}
                            disabled={retryingId === err.id}
                            className="p-1 text-slate-900 hover:bg-gray-100 rounded"
                            title="تلاش مجدد استخراج این جدول"
                          >
                            <Play className={`w-4 h-4 ${retryingId === err.id ? 'animate-spin' : ''}`} />
                          </button>
                        )}

                        {/* Resolve */}
                        {err.status === 'OPEN' && (
                          <button
                            onClick={() => onResolve(err.id)}
                            className="p-1 text-emerald-600 hover:bg-emerald-50 rounded"
                            title="علامت‌گذاری به عنوان حل شده"
                          >
                            <Check className="w-4 h-4" />
                          </button>
                        )}

                        {/* Ignore */}
                        {err.status === 'OPEN' && (
                          <button
                            onClick={() => onIgnore(err.id)}
                            className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
                            title="نادیده گرفتن خطا"
                          >
                            <EyeOff className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Snapshot Modal */}
      {snapshotModal && (
        <SnapshotModal
          type={snapshotModal.type}
          filename={snapshotModal.filename}
          title={snapshotModal.title}
          onClose={() => setSnapshotModal(null)}
        />
      )}
    </div>
  );
};

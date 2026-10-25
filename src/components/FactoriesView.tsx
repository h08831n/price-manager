import React, { useState, useMemo } from 'react';
import {
  Plus,
  Edit2,
  Trash2,
  AlertTriangle,
  Upload,
  Download,
  FileSpreadsheet,
  Factory as FactoryIcon,
  Globe,
  Search,
  X,
  DownloadCloud,
  CheckSquare,
  Square,
  CheckCircle2,
  XCircle
} from 'lucide-react';
import { Factory } from '../types';
import { useEscapeKey } from '../hooks/useEscapeKey';

interface FactoriesViewProps {
  factories: Factory[];
  onSaveFactory: (factory: Partial<Factory>) => Promise<void>;
  onDeleteFactory?: (id: number) => Promise<void>;
  onOpenImport: (entity: string) => void;
  onExport: (entity: string) => void;
  onDownloadTemplate: (entity: string) => void;
  onPullFromDestination?: () => Promise<any>;
  onBatchToggleStatus?: (ids: number[], active: boolean) => Promise<any>;
  onBatchDelete?: (ids: number[]) => Promise<any>;
}

function normalizePersian(str: string): string {
  if (!str) return '';
  return str
    .toLowerCase()
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/۰/g, '0').replace(/۱/g, '1').replace(/۲/g, '2').replace(/۳/g, '3').replace(/۴/g, '4')
    .replace(/۵/g, '5').replace(/۶/g, '6').replace(/۷/g, '7').replace(/۸/g, '8').replace(/۹/g, '9')
    .trim();
}

export const FactoriesView: React.FC<FactoriesViewProps> = ({
  factories,
  onSaveFactory,
  onDeleteFactory,
  onOpenImport,
  onExport,
  onDownloadTemplate,
  onPullFromDestination,
  onBatchToggleStatus,
  onBatchDelete
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingFactory, setEditingFactory] = useState<Partial<Factory> | null>(null);
  const [isPulling, setIsPulling] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Multi-Selection State
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [isBatchUpdating, setIsBatchUpdating] = useState(false);
  const [isBatchDeletingModalOpen, setIsBatchDeletingModalOpen] = useState(false);
  const [isBatchDeleting, setIsBatchDeleting] = useState(false);

  // Delete modal state
  const [deletingFactory, setDeletingFactory] = useState<Factory | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Close modals on Escape
  useEscapeKey(() => {
    if (isBatchDeletingModalOpen) setIsBatchDeletingModalOpen(false);
    else if (deletingFactory) setDeletingFactory(null);
    else if (isModalOpen) {
      setIsModalOpen(false);
      setEditingFactory(null);
    }
  }, Boolean(isBatchDeletingModalOpen || deletingFactory || isModalOpen));

  const filteredFactories = useMemo(() => {
    if (!searchQuery.trim()) return factories;
    const q = normalizePersian(searchQuery);
    return factories.filter((f) => {
      const nameMatch = normalizePersian(f.name).includes(q);
      const idMatch = String(f.id).includes(q);
      const destMatch = String(f.destination_id ?? '').includes(q);
      return nameMatch || idMatch || destMatch;
    });
  }, [factories, searchQuery]);

  // Selection helpers
  const isAllSelected = filteredFactories.length > 0 && filteredFactories.every((f) => selectedIds.has(f.id));

  const toggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredFactories.map((f) => f.id)));
    }
  };

  const toggleSelectOne = (id: number) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  // Bulk actions handlers
  const handleBulkStatusChange = async (active: boolean) => {
    if (selectedIds.size === 0) return;
    setIsBatchUpdating(true);
    try {
      if (onBatchToggleStatus) {
        await onBatchToggleStatus(Array.from(selectedIds), active);
      } else {
        for (const id of Array.from(selectedIds)) {
          await onSaveFactory({ id, active });
        }
      }
      setSelectedIds(new Set());
    } finally {
      setIsBatchUpdating(false);
    }
  };

  const handleBulkDelete = async () => {
    if (!onBatchDelete || selectedIds.size === 0) return;
    setIsBatchDeleting(true);
    try {
      await onBatchDelete(Array.from(selectedIds));
      setSelectedIds(new Set());
      setIsBatchDeletingModalOpen(false);
    } finally {
      setIsBatchDeleting(false);
    }
  };

  const handleOpenAdd = () => {
    setEditingFactory({ name: '', destination_id: undefined, active: true });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (factory: Factory) => {
    setEditingFactory({ ...factory });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingFactory) return;
    await onSaveFactory(editingFactory);
    setIsModalOpen(false);
    setEditingFactory(null);
  };

  return (
    <div className="space-y-4">
      {/* Header & Main Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-lg border border-gray-200 shadow-xs">
        <div>
          <h2 className="text-sm font-bold text-gray-900">مدیریت کارخانجات و تولیدکنندگان</h2>
          <p className="text-xs text-gray-500 mt-0.5">دسته‌بندی مبنای جداول قیمت و محصولات فولادی ({factories.length} کارخانه ثبت شده)</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {onPullFromDestination && (
            <button
              id="btn-pull-factories-destination"
              type="button"
              onClick={async () => {
                setIsPulling(true);
                try {
                  await onPullFromDestination();
                } finally {
                  setIsPulling(false);
                }
              }}
              disabled={isPulling}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-purple-900 bg-purple-50 hover:bg-purple-100 border border-purple-300 disabled:opacity-50 rounded-md transition-colors cursor-pointer shadow-xs"
              title="دریافت خودکار همه کارخانه‌ها، برندها و تولیدکنندگان از سایت مقصد (WordPress)"
            >
              <DownloadCloud className={`w-3.5 h-3.5 text-purple-700 ${isPulling ? 'animate-bounce' : ''}`} />
              <span>{isPulling ? 'در حال دریافت از مقصد...' : 'دریافت از سایت مقصد'}</span>
            </button>
          )}

          <button
            onClick={handleOpenAdd}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-md transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>افزودن کارخانه جدید</span>
          </button>

          <button
            onClick={() => onOpenImport('factories')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-200 rounded-md hover:bg-gray-50 transition-colors"
          >
            <Upload className="w-3.5 h-3.5 text-gray-500" />
            <span>ایمپورت اکسل</span>
          </button>

          <button
            onClick={() => onExport('factories')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-200 rounded-md hover:bg-gray-50 transition-colors"
          >
            <Download className="w-3.5 h-3.5 text-gray-500" />
            <span>خروجی اکسل</span>
          </button>

          <button
            onClick={() => onDownloadTemplate('factories')}
            className="p-1.5 text-gray-500 hover:text-gray-700 transition-colors"
            title="دانلود قالب اکسل"
          >
            <FileSpreadsheet className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="bg-white p-3 rounded-lg border border-gray-200 shadow-xs flex items-center justify-between gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-gray-400 absolute right-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="جستجوی سریع کارخانه بر اساس نام یا آیدی مقصد..."
            className="w-full pl-9 pr-9 py-2 text-xs border border-gray-200 rounded-md focus:border-slate-800 focus:outline-hidden transition-colors"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-0.5"
              title="پاک کردن جستجو"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <div className="text-xs text-gray-500 whitespace-nowrap font-mono">
          نمایش {filteredFactories.length} از {factories.length}
        </div>
      </div>

      {/* Bulk Action Toolbar */}
      {selectedIds.size > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900 text-white px-4 py-2.5 rounded-lg shadow-md animate-in fade-in slide-in-from-top-2 duration-150 text-xs">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 bg-slate-800 rounded font-mono font-bold text-amber-300">
              {selectedIds.size}
            </span>
            <span>کارخانه انتخاب شده است</span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={isBatchUpdating}
              onClick={() => handleBulkStatusChange(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded font-medium transition-colors cursor-pointer"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>فعال‌سازی همگانی</span>
            </button>

            <button
              type="button"
              disabled={isBatchUpdating}
              onClick={() => handleBulkStatusChange(false)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white rounded font-medium transition-colors cursor-pointer"
            >
              <XCircle className="w-3.5 h-3.5" />
              <span>غیرفعال‌سازی همگانی</span>
            </button>

            {onBatchDelete && (
              <button
                type="button"
                disabled={isBatchUpdating || isBatchDeleting}
                onClick={() => setIsBatchDeletingModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white rounded font-medium transition-colors cursor-pointer"
                title="حذف همگانی کارخانجات انتخاب‌شده"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>حذف همگانی</span>
              </button>
            )}

            <button
              type="button"
              disabled={isBatchUpdating}
              onClick={() => setSelectedIds(new Set())}
              className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded font-medium transition-colors text-[11px] cursor-pointer"
            >
              لغو انتخاب
            </button>
          </div>
        </div>
      )}

      {/* Factories Table */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-xs overflow-hidden">
        <table className="w-full text-right text-xs">
          <thead className="bg-gray-50 text-gray-500 font-medium border-b border-gray-200">
            <tr>
              <th className="py-3 px-3 w-10 text-center">
                <button
                  type="button"
                  onClick={toggleSelectAll}
                  className="p-1 hover:bg-gray-200 rounded text-gray-500 transition-colors cursor-pointer inline-flex items-center justify-center"
                  title={isAllSelected ? 'لغو انتخاب همه' : 'انتخاب همه موارد'}
                >
                  {isAllSelected ? (
                    <CheckSquare className="w-4 h-4 text-slate-900" />
                  ) : (
                    <Square className="w-4 h-4 text-gray-400" />
                  )}
                </button>
              </th>
              <th className="py-3 px-4 w-16 text-center font-mono">آیدی سیستم</th>
              <th className="py-3 px-4 w-24 text-center font-mono text-purple-900 bg-purple-50/50">آیدی مقصد</th>
              <th className="py-3 px-4">نام کارخانه</th>
              <th className="py-3 px-4 text-center">تعداد جداول قیمت</th>
              <th className="py-3 px-4 text-center">تعداد کالاها</th>
              <th className="py-3 px-4 text-center w-28">وضعیت اتصال</th>
              <th className="py-3 px-4 text-center w-24">عملیات</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filteredFactories.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-8 text-center text-gray-400">
                  {searchQuery ? 'هیچ کارخانه‌ای با عبارت جستجو شده مطابقت ندارد.' : 'هیچ کارخانه‌ای در سیستم ثبت نشده است.'}
                </td>
              </tr>
            ) : (
              filteredFactories.map((f) => (
                <tr key={f.id} className={`transition-colors ${selectedIds.has(f.id) ? 'bg-indigo-50/50' : 'hover:bg-gray-50/80 bg-white'}`}>
                  <td className="py-3 px-3 text-center" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      onClick={() => toggleSelectOne(f.id)}
                      className="p-1 hover:bg-gray-100 rounded text-gray-500 transition-colors cursor-pointer inline-flex items-center justify-center"
                    >
                      {selectedIds.has(f.id) ? (
                        <CheckSquare className="w-4 h-4 text-slate-900" />
                      ) : (
                        <Square className="w-4 h-4 text-gray-300" />
                      )}
                    </button>
                  </td>
                  <td className="py-3 px-4 font-mono font-bold text-slate-800 text-center bg-slate-50/50">#{f.id}</td>
                  <td className="py-3 px-4 text-center font-mono font-bold text-purple-700 bg-purple-50/30">
                    <span className="px-2 py-0.5 rounded bg-purple-100/70 border border-purple-200" title="شناسه کارخانه در سایت مقصد">
                      {f.destination_id ?? f.id}
                    </span>
                  </td>
                  <td className="py-3 px-4 font-bold text-gray-900">{f.name}</td>
                  <td className="py-3 px-4 text-center font-mono">{f.table_count || 0} جدول</td>
                  <td className="py-3 px-4 text-center font-mono">{f.product_count || 0} کالا</td>
                  <td className="py-3 px-4 text-center">
                    <div className="flex flex-col items-center gap-0.5">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          f.sync_status === 'SYNCED'
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                            : 'bg-amber-50 text-amber-800 border border-amber-200'
                        }`}
                      >
                        {f.sync_status === 'SYNCED' ? 'متصل به مقصد' : 'نیازمند همگام‌سازی'}
                      </span>
                      <span className="text-[9px] text-gray-400">{f.active ? 'فعال' : 'غیرفعال'}</span>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-center">
                    <div className="flex items-center justify-center gap-1.5">
                      <button
                        onClick={() => handleOpenEdit(f)}
                        className="p-1.5 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded transition-colors"
                        title="ویرایش نام کارخانه"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      {onDeleteFactory && (
                        <button
                          onClick={() => setDeletingFactory(f)}
                          className="p-1.5 text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors"
                          title="حذف کارخانه"
                        >
                          <Trash2 className="w-4 h-4 text-rose-500" />
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

      {isModalOpen && editingFactory && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl border border-gray-200 w-full max-w-md p-6 animate-in fade-in zoom-in-95 duration-150">
            <h3 className="text-sm font-bold text-gray-900 mb-4">
              {editingFactory.id ? `ویرایش کارخانه (آیدی سیستم: #${editingFactory.id})` : 'افزودن کارخانه جدید'}
            </h3>

            <form onSubmit={handleSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block text-gray-700 font-medium mb-1">
                  نام کارخانه <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="مثال: ذوب آهن اصفهان"
                  value={editingFactory.name || ''}
                  onChange={(e) => setEditingFactory({ ...editingFactory, name: e.target.value })}
                  className="w-full px-3 py-1.5 bg-gray-50 border border-gray-200 rounded focus:bg-white focus:outline-none focus:border-slate-800"
                />
              </div>

              <div>
                <label className="block text-gray-700 font-medium mb-1">
                  آیدی کارخانه در سایت مقصد (Destination ID)
                </label>
                <input
                  type="number"
                  placeholder="اختیاری - در صورت خالی ماندن برابر شناسه سیستم قرار می‌گیرد"
                  value={editingFactory.destination_id ?? ''}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10);
                    setEditingFactory({
                      ...editingFactory,
                      destination_id: isNaN(val) ? undefined : val
                    });
                  }}
                  className="w-full px-3 py-1.5 bg-gray-50 border border-gray-200 rounded focus:bg-white focus:outline-none focus:border-slate-800 font-mono font-bold text-purple-900"
                />
                <p className="text-[10px] text-gray-500 mt-1">
                  آیدی دسته/ویژگی/پست مرتبط با این کارخانه در وردپرس مقصد (از ثبت تکراری جلوگیری می‌شود)
                </p>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="fac-active"
                  checked={editingFactory.active ?? true}
                  onChange={(e) => setEditingFactory({ ...editingFactory, active: e.target.checked })}
                  className="rounded text-slate-900 focus:ring-0"
                />
                <label htmlFor="fac-active" className="text-gray-700 font-medium cursor-pointer">
                  کارخانه فعال باشد
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-1.5 text-xs text-gray-700 hover:bg-gray-100 rounded transition-colors"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded transition-colors"
                >
                  ذخیره
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Factory Confirmation Modal */}
      {deletingFactory && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl border border-gray-200 w-full max-w-md p-6 animate-in fade-in zoom-in-95 duration-150 space-y-4">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="p-2.5 bg-rose-50 rounded-full">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-gray-900">تأیید حذف کارخانه</h3>
                <p className="text-xs text-gray-500 mt-0.5">عملیات حذف وابسته (Cascade Delete)</p>
              </div>
            </div>

            <div className="p-3 bg-gray-50 rounded-lg border border-gray-200 text-xs text-gray-700 space-y-1">
              <p>
                آیا از حذف کارخانه <strong>«{deletingFactory.name}»</strong> (شناسه: {deletingFactory.id}) اطمینان دارید؟
              </p>
              <p className="text-[11px] text-rose-700 font-medium pt-1">
                ⚠️ هشدار: با حذف کارخانه، تمام جداول قیمت و محصولات مرتبط با آن نیز به صورت خودکار از سیستم حذف خواهند شد!
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setDeletingFactory(null)}
                className="px-4 py-2 text-xs font-medium text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
              >
                انصراف
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={async () => {
                  if (!onDeleteFactory || !deletingFactory) return;
                  setIsDeleting(true);
                  try {
                    await onDeleteFactory(deletingFactory.id);
                    setDeletingFactory(null);
                  } finally {
                    setIsDeleting(false);
                  }
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-50 rounded-md transition-colors shadow-xs cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{isDeleting ? 'در حال حذف...' : 'حذف قطعی کارخانه'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Delete Modal */}
      {isBatchDeletingModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl border border-gray-200 w-full max-w-md p-6 animate-in fade-in zoom-in-95 duration-150 space-y-4">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="p-2.5 bg-rose-50 rounded-full">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-gray-900">تأیید حذف همگانی کارخانجات</h3>
                <p className="text-xs text-gray-500 mt-0.5">عملیات حذف گروهی و کلیه جداول و کالاهای وابسته</p>
              </div>
            </div>

            <div className="p-3 bg-rose-50/50 rounded-lg border border-rose-200 text-xs text-rose-900 space-y-1">
              <p>
                آیا از حذف گروهی <strong>{selectedIds.size}</strong> کارخانه انتخاب‌شده اطمینان دارید؟
              </p>
              <p className="text-[11px] text-rose-700 font-medium pt-1">
                ⚠️ هشدار: با حذف این کارخانه‌ها، تمام جداول قیمت و محصولات مرتبط با آن‌ها به طور کامل حذف خواهند شد!
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
              <button
                type="button"
                disabled={isBatchDeleting}
                onClick={() => setIsBatchDeletingModalOpen(false)}
                className="px-4 py-2 text-xs font-medium text-gray-700 hover:bg-gray-100 rounded-md transition-colors cursor-pointer"
              >
                انصراف
              </button>
              <button
                type="button"
                disabled={isBatchDeleting}
                onClick={handleBulkDelete}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-50 rounded-md transition-colors shadow-xs cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{isBatchDeleting ? 'در حال حذف...' : `حذف قطعی ${selectedIds.size} کارخانه`}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

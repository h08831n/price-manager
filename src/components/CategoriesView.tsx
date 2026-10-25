import React, { useState, useMemo } from 'react';
import {
  Plus,
  Edit2,
  Trash2,
  Search,
  X,
  DownloadCloud,
  Upload,
  Download,
  FileSpreadsheet,
  Layers,
  CheckSquare,
  Square,
  CheckCircle2,
  XCircle,
  AlertTriangle
} from 'lucide-react';
import { Category } from '../types';
import { useEscapeKey } from '../hooks/useEscapeKey';

interface CategoriesViewProps {
  categories: Category[];
  onSaveCategory: (category: Partial<Category>) => Promise<void>;
  onDeleteCategory?: (id: number) => Promise<void>;
  onOpenImport?: (entity: string) => void;
  onExport?: (entity: string) => void;
  onDownloadTemplate?: (entity: string) => void;
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

export const CategoriesView: React.FC<CategoriesViewProps> = ({
  categories,
  onSaveCategory,
  onDeleteCategory,
  onOpenImport,
  onExport,
  onDownloadTemplate,
  onPullFromDestination,
  onBatchToggleStatus,
  onBatchDelete
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Partial<Category> | null>(null);
  const [isPulling, setIsPulling] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Multi-Selection State
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [isBatchUpdating, setIsBatchUpdating] = useState(false);
  const [isBatchDeletingModalOpen, setIsBatchDeletingModalOpen] = useState(false);
  const [isBatchDeleting, setIsBatchDeleting] = useState(false);

  // Delete modal state
  const [deletingCategory, setDeletingCategory] = useState<Category | null>(null);

  // Close modals on Escape
  useEscapeKey(() => {
    if (isBatchDeletingModalOpen) setIsBatchDeletingModalOpen(false);
    else if (deletingCategory) setDeletingCategory(null);
    else if (isModalOpen) {
      setIsModalOpen(false);
      setEditingCategory(null);
    }
  }, Boolean(isBatchDeletingModalOpen || deletingCategory || isModalOpen));

  const filteredCategories = useMemo(() => {
    if (!searchQuery.trim()) return categories;
    const q = normalizePersian(searchQuery);
    return categories.filter((c) => {
      const nameMatch = normalizePersian(c.name).includes(q);
      const idMatch = String(c.id).includes(q);
      const destMatch = String(c.destination_id ?? '').includes(q);
      return nameMatch || idMatch || destMatch;
    });
  }, [categories, searchQuery]);

  // Selection helpers
  const isAllSelected = filteredCategories.length > 0 && filteredCategories.every((c) => selectedIds.has(c.id));

  const toggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredCategories.map((c) => c.id)));
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
          await onSaveCategory({ id, active });
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
    setEditingCategory({ name: '', slug: '', destination_id: undefined, active: true });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (category: Category) => {
    setEditingCategory({ ...category });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCategory) return;
    await onSaveCategory(editingCategory);
    setIsModalOpen(false);
    setEditingCategory(null);
  };

  return (
    <div className="space-y-4">
      {/* Header & Main Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-lg border border-gray-200 shadow-xs">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-indigo-50 text-indigo-700 rounded-lg">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-gray-900">مدیریت دسته‌بندی‌های کالا</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              دسته‌بندی‌های استخراج شده از سایت مقصد (مانند میلگرد، تیرآهن، ورق و...) ({categories.length} دسته‌بندی ثبت شده)
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {onPullFromDestination && (
            <button
              id="btn-pull-categories-destination"
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
              title="دریافت خودکار همه دسته‌بندی‌ها از سایت مقصد (product_cat)"
            >
              <DownloadCloud className={`w-3.5 h-3.5 text-purple-700 ${isPulling ? 'animate-bounce' : ''}`} />
              <span>{isPulling ? 'در حال دریافت از مقصد...' : 'دریافت دسته‌بندی‌ها از سایت مقصد'}</span>
            </button>
          )}

          <button
            onClick={handleOpenAdd}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-md transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>افزودن دسته‌بندی جدید</span>
          </button>

          {onOpenImport && (
            <button
              onClick={() => onOpenImport('categories')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-200 rounded-md hover:bg-gray-50 transition-colors"
            >
              <Upload className="w-3.5 h-3.5 text-gray-500" />
              <span>ایمپورت اکسل</span>
            </button>
          )}

          {onExport && (
            <button
              onClick={() => onExport('categories')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-200 rounded-md hover:bg-gray-50 transition-colors"
            >
              <Download className="w-3.5 h-3.5 text-gray-500" />
              <span>خروجی اکسل</span>
            </button>
          )}

          {onDownloadTemplate && (
            <button
              onClick={() => onDownloadTemplate('categories')}
              className="p-1.5 text-gray-500 hover:text-gray-700 transition-colors"
              title="دانلود قالب اکسل"
            >
              <FileSpreadsheet className="w-4 h-4" />
            </button>
          )}
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
            placeholder="جستجوی سریع دسته‌بندی بر اساس نام یا آیدی مقصد..."
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
          نمایش {filteredCategories.length} از {categories.length}
        </div>
      </div>

      {/* Bulk Action Toolbar */}
      {selectedIds.size > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900 text-white px-4 py-2.5 rounded-lg shadow-md animate-in fade-in slide-in-from-top-2 duration-150 text-xs">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 bg-slate-800 rounded font-mono font-bold text-amber-300">
              {selectedIds.size}
            </span>
            <span>دسته‌بندی انتخاب شده است</span>
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
                title="حذف همگانی دسته‌بندی‌های انتخاب‌شده"
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

      {/* Categories Table */}
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
              <th className="py-3 px-4">نام دسته‌بندی</th>
              <th className="py-3 px-4 text-center">تعداد کالاها</th>
              <th className="py-3 px-4 text-center">تعداد جداول قیمت</th>
              <th className="py-3 px-4 text-center w-28">وضعیت</th>
              <th className="py-3 px-4 text-center w-24">عملیات</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filteredCategories.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-8 text-center text-gray-400">
                  {searchQuery ? 'هیچ دسته‌بندی‌ای با عبارت جستجو شده مطابقت ندارد.' : 'هیچ دسته‌بندی‌ای در سیستم ثبت نشده است. از دکمه «دریافت دسته‌بندی‌ها از سایت مقصد» استفاده کنید.'}
                </td>
              </tr>
            ) : (
              filteredCategories.map((c) => (
                <tr key={c.id} className={`transition-colors ${selectedIds.has(c.id) ? 'bg-indigo-50/50' : 'hover:bg-gray-50/80 bg-white'}`}>
                  <td className="py-3 px-3 text-center" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      onClick={() => toggleSelectOne(c.id)}
                      className="p-1 hover:bg-gray-100 rounded text-gray-500 transition-colors cursor-pointer inline-flex items-center justify-center"
                    >
                      {selectedIds.has(c.id) ? (
                        <CheckSquare className="w-4 h-4 text-slate-900" />
                      ) : (
                        <Square className="w-4 h-4 text-gray-300" />
                      )}
                    </button>
                  </td>
                  <td className="py-3 px-4 font-mono font-bold text-slate-800 text-center bg-slate-50/50">#{c.id}</td>
                  <td className="py-3 px-4 text-center font-mono font-bold text-purple-700 bg-purple-50/30">
                    <span className="px-2 py-0.5 rounded bg-purple-100/70 border border-purple-200" title="شناسه دسته‌بندی در ووکامرس (product_cat)">
                      {c.destination_id ?? c.id}
                    </span>
                  </td>
                  <td className="py-3 px-4 font-bold text-gray-900">{c.name}</td>
                  <td className="py-3 px-4 text-center font-mono">{c.product_count || 0} کالا</td>
                  <td className="py-3 px-4 text-center font-mono">{c.table_count || 0} جدول</td>
                  <td className="py-3 px-4 text-center">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        c.active ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {c.active ? 'فعال' : 'غیرفعال'}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-center">
                    <div className="flex items-center justify-center gap-1.5">
                      <button
                        onClick={() => handleOpenEdit(c)}
                        className="p-1.5 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded transition-colors"
                        title="ویرایش دسته‌بندی"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      {onDeleteCategory && (
                        <button
                          onClick={() => setDeletingCategory(c)}
                          className="p-1.5 text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors"
                          title="حذف دسته‌بندی"
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

      {/* Add / Edit Modal */}
      {isModalOpen && editingCategory && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl border border-gray-200 w-full max-w-md p-6 animate-in fade-in zoom-in-95 duration-150">
            <h3 className="text-sm font-bold text-gray-900 mb-4">
              {editingCategory.id ? `ویرایش دسته‌بندی (آیدی: #${editingCategory.id})` : 'افزودن دسته‌بندی جدید'}
            </h3>

            <form onSubmit={handleSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block text-gray-700 font-medium mb-1">
                  نام دسته‌بندی <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={editingCategory.name || ''}
                  onChange={(e) => setEditingCategory({ ...editingCategory, name: e.target.value })}
                  placeholder="مثال: میلگرد، تیرآهن، ورق سیاه..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:border-slate-800 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-gray-700 font-medium mb-1">
                  آیدی مقصد در وردپرس (term_id در product_cat)
                </label>
                <input
                  type="number"
                  value={editingCategory.destination_id ?? ''}
                  onChange={(e) =>
                    setEditingCategory({
                      ...editingCategory,
                      destination_id: e.target.value ? parseInt(e.target.value, 10) : undefined
                    })
                  }
                  placeholder="اختیاری - خودکار یا از سایت مقصد"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:border-slate-800 focus:outline-hidden font-mono"
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="category-active"
                  checked={editingCategory.active !== false}
                  onChange={(e) => setEditingCategory({ ...editingCategory, active: e.target.checked })}
                  className="rounded border-gray-300 text-slate-900 focus:ring-0"
                />
                <label htmlFor="category-active" className="text-gray-700 select-none">
                  دسته‌بندی فعال باشد
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg transition-colors font-medium"
                >
                  ذخیره
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingCategory && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl border border-gray-200 w-full max-w-md p-6 animate-in fade-in zoom-in-95 duration-150">
            <h3 className="text-sm font-bold text-gray-900 mb-2">تایید حذف دسته‌بندی</h3>
            <p className="text-xs text-gray-600 mb-4">
              آیا از حذف دسته‌بندی <strong>«{deletingCategory.name}»</strong> مطمئن هستید؟
            </p>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeletingCategory(null)}
                className="px-4 py-2 border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
              >
                انصراف
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (onDeleteCategory && deletingCategory.id) {
                    await onDeleteCategory(deletingCategory.id);
                  }
                  setDeletingCategory(null);
                }}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg transition-colors font-medium cursor-pointer"
              >
                حذف قطعی
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Delete Modal */}
      {isBatchDeletingModalOpen && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl border border-gray-200 w-full max-w-md p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="p-2.5 bg-rose-50 rounded-full">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-gray-900">تأیید حذف همگانی دسته‌بندی‌ها</h3>
                <p className="text-xs text-gray-500 mt-0.5">عملیات حذف گروهی غیرقابل بازگشت است.</p>
              </div>
            </div>

            <div className="p-3 bg-rose-50/50 rounded-lg border border-rose-200 text-xs text-rose-900 space-y-1">
              <p>
                آیا از حذف گروهی <strong>{selectedIds.size}</strong> دسته‌بندی انتخاب‌شده اطمینان دارید؟
              </p>
              <p className="text-[11px] text-rose-700 pt-1">
                توجه: وابستگی این دسته‌ها از کالاها و جداول قیمت مربوطه جدا خواهد شد.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
              <button
                type="button"
                disabled={isBatchDeleting}
                onClick={() => setIsBatchDeletingModalOpen(false)}
                className="px-4 py-2 border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer"
              >
                انصراف
              </button>
              <button
                type="button"
                disabled={isBatchDeleting}
                onClick={handleBulkDelete}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg transition-colors font-medium cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{isBatchDeleting ? 'در حال حذف...' : `حذف قطعی ${selectedIds.size} دسته‌بندی`}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

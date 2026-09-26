import React, { useState } from 'react';
import { Plus, Edit2, Trash2, AlertTriangle, Upload, Download, FileSpreadsheet, Factory as FactoryIcon } from 'lucide-react';
import { Factory } from '../types';

interface FactoriesViewProps {
  factories: Factory[];
  onSaveFactory: (factory: Partial<Factory>) => Promise<void>;
  onDeleteFactory?: (id: number) => Promise<void>;
  onOpenImport: (entity: string) => void;
  onExport: (entity: string) => void;
  onDownloadTemplate: (entity: string) => void;
}

export const FactoriesView: React.FC<FactoriesViewProps> = ({
  factories,
  onSaveFactory,
  onDeleteFactory,
  onOpenImport,
  onExport,
  onDownloadTemplate
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingFactory, setEditingFactory] = useState<Partial<Factory> | null>(null);

  // Delete modal state
  const [deletingFactory, setDeletingFactory] = useState<Factory | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleOpenAdd = () => {
    setEditingFactory({ name: '', active: true });
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-lg border border-gray-200 shadow-xs">
        <div>
          <h2 className="text-sm font-bold text-gray-900">مدیریت کارخانجات و تولیدکنندگان</h2>
          <p className="text-xs text-gray-500 mt-0.5">دسته‌بندی مبنای جداول قیمت و محصولات فولادی</p>
        </div>

        <div className="flex items-center gap-2">
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

      <div className="bg-white rounded-lg border border-gray-200 shadow-xs overflow-hidden">
        <table className="w-full text-right text-xs">
          <thead className="bg-gray-50 text-gray-500 font-medium border-b border-gray-200">
            <tr>
              <th className="py-3 px-4 w-16">شناسه</th>
              <th className="py-3 px-4">نام کارخانه</th>
              <th className="py-3 px-4 text-center">تعداد جداول قیمت</th>
              <th className="py-3 px-4 text-center">تعداد کالاها</th>
              <th className="py-3 px-4 text-center w-28">وضعیت</th>
              <th className="py-3 px-4 text-center w-24">عملیات</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {factories.map((f) => (
              <tr key={f.id} className="hover:bg-gray-50/80 transition-colors">
                <td className="py-3 px-4 font-mono text-gray-500">{f.id}</td>
                <td className="py-3 px-4 font-bold text-gray-900">{f.name}</td>
                <td className="py-3 px-4 text-center font-mono">{f.table_count || 0} جدول</td>
                <td className="py-3 px-4 text-center font-mono">{f.product_count || 0} کالا</td>
                <td className="py-3 px-4 text-center">
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${
                      f.active ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-gray-100 text-gray-500'
                    }`}
                  >
                    {f.active ? 'فعال' : 'غیرفعال'}
                  </span>
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
            ))}
          </tbody>
        </table>
      </div>

      {isModalOpen && editingFactory && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl border border-gray-200 w-full max-w-md p-6 animate-in fade-in zoom-in-95 duration-150">
            <h3 className="text-sm font-bold text-gray-900 mb-4">
              {editingFactory.id ? 'ویرایش کارخانه' : 'افزودن کارخانه جدید'}
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
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-50 rounded-md transition-colors shadow-xs"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{isDeleting ? 'در حال حذف...' : 'حذف قطعی کارخانه'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

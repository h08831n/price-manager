import React, { useState } from 'react';
import { Plus, Play, Eye, Edit2, Upload, Download, FileSpreadsheet, Clock, ArrowLeft } from 'lucide-react';
import { PriceTable, Factory } from '../types';

interface PriceTablesViewProps {
  tables: PriceTable[];
  factories: Factory[];
  onSelectTable: (table: PriceTable) => void;
  onRunTable: (tableId: number) => Promise<void>;
  onSaveTable: (table: Partial<PriceTable>) => Promise<void>;
  onOpenImport: (entity: string) => void;
  onExport: (entity: string) => void;
  onDownloadTemplate: (entity: string) => void;
}

export const PriceTablesView: React.FC<PriceTablesViewProps> = ({
  tables,
  factories,
  onSelectTable,
  onRunTable,
  onSaveTable,
  onOpenImport,
  onExport,
  onDownloadTemplate
}) => {
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newTable, setNewTable] = useState<Partial<PriceTable>>({
    name: '',
    factory_id: factories[0]?.id || 1,
    start_time: '11:00',
    retry_interval_minutes: 30,
    max_attempts: 5,
    price_guard_percent: 30,
    active: true
  });
  const [runningId, setRunningId] = useState<number | null>(null);

  const handleOpenAdd = () => {
    setNewTable({
      name: '',
      factory_id: factories[0]?.id || 1,
      start_time: '11:00',
      retry_interval_minutes: 30,
      max_attempts: 5,
      price_guard_percent: 30,
      active: true
    });
    setIsAddModalOpen(true);
  };

  const handleRun = async (tableId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setRunningId(tableId);
    try {
      await onRunTable(tableId);
    } finally {
      setRunningId(null);
    }
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTable.name?.trim()) return;
    await onSaveTable(newTable);
    setIsAddModalOpen(false);
  };

  return (
    <div className="space-y-4">
      {/* Top Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-lg border border-gray-200 shadow-xs">
        <div>
          <h2 className="text-sm font-bold text-gray-900">مدیریت جداول قیمت کارخانجات</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            پایش زمان‌بندی‌شده، محاسبه حداقل قیمت در منابع رقیب و انتشار به ووکامرس
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleOpenAdd}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-md transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>افزودن جدول قیمت</span>
          </button>

          <button
            onClick={() => onOpenImport('price_tables')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-200 rounded-md hover:bg-gray-50 transition-colors"
          >
            <Upload className="w-3.5 h-3.5 text-gray-500" />
            <span>ایمپورت اکسل</span>
          </button>

          <button
            onClick={() => onExport('price_tables')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-200 rounded-md hover:bg-gray-50 transition-colors"
          >
            <Download className="w-3.5 h-3.5 text-gray-500" />
            <span>خروجی اکسل</span>
          </button>

          <button
            onClick={() => onDownloadTemplate('price_tables')}
            className="p-1.5 text-gray-500 hover:text-gray-700 transition-colors"
            title="دانلود قالب اکسل"
          >
            <FileSpreadsheet className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Tables List */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-gray-50 text-gray-500 font-medium border-b border-gray-200">
              <tr>
                <th className="py-3 px-4">نام جدول</th>
                <th className="py-3 px-4">کارخانه مربوطه</th>
                <th className="py-3 px-4 text-center">تعداد منابع</th>
                <th className="py-3 px-4 text-center">تعداد کالاها</th>
                <th className="py-3 px-4 text-center">ساعت شروع</th>
                <th className="py-3 px-4 text-center">فاصله تلاش</th>
                <th className="py-3 px-4 text-center">سقف تلاش</th>
                <th className="py-3 px-4 text-center">Price Guard</th>
                <th className="py-3 px-4 text-center">وضعیت امروز</th>
                <th className="py-3 px-4 text-center w-36">عملیات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {tables.map((tbl) => (
                <tr
                  key={tbl.id}
                  onClick={() => onSelectTable(tbl)}
                  className="hover:bg-gray-50/80 cursor-pointer transition-colors"
                >
                  <td className="py-3 px-4 font-bold text-gray-900">{tbl.name}</td>
                  <td className="py-3 px-4 text-gray-600">{tbl.factory_name}</td>
                  <td className="py-3 px-4 text-center font-mono">{tbl.source_count} منبع</td>
                  <td className="py-3 px-4 text-center font-mono">{tbl.product_count} کالا</td>
                  <td className="py-3 px-4 text-center font-mono text-slate-700 font-semibold">{tbl.start_time}</td>
                  <td className="py-3 px-4 text-center">{tbl.retry_interval_minutes} دقیقه</td>
                  <td className="py-3 px-4 text-center">{tbl.max_attempts} بار</td>
                  <td className="py-3 px-4 text-center font-mono">{tbl.price_guard_percent}٪</td>
                  <td className="py-3 px-4 text-center">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${
                        tbl.today_status === 'COMPLETED'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-amber-50 text-amber-700 border border-amber-200'
                      }`}
                    >
                      {tbl.today_status === 'COMPLETED' ? 'کامل شده' : 'در انتظار'}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-center">
                    <div className="flex items-center justify-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={(e) => handleRun(tbl.id, e)}
                        disabled={runningId === tbl.id}
                        className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded transition-colors"
                        title="اجرای دستی کل جدول"
                      >
                        <Play className={`w-3 h-3 ${runningId === tbl.id ? 'animate-spin' : ''}`} />
                        <span>اجرا</span>
                      </button>

                      <button
                        onClick={() => onSelectTable(tbl)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-800 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded transition-colors"
                        title="ویرایش کامل جدول و مدیریت منابع و سلکتورها"
                      >
                        <Edit2 className="w-3.5 h-3.5 text-slate-700" />
                        <span>ویرایش و منابع</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add New Table Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl border border-gray-200 w-full max-w-lg p-6 animate-in fade-in zoom-in-95 duration-150">
            <h3 className="text-sm font-bold text-gray-900 mb-4">
              افزودن جدول قیمت جدید
            </h3>

            <form onSubmit={handleCreateSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block text-gray-700 font-medium mb-1">
                  نام جدول <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="مثال: میلگرد ذوب آهن"
                  value={newTable.name || ''}
                  onChange={(e) => setNewTable({ ...newTable, name: e.target.value })}
                  className="w-full px-3 py-1.5 bg-gray-50 border border-gray-200 rounded focus:bg-white focus:outline-none focus:border-slate-800"
                />
              </div>

              <div>
                <label className="block text-gray-700 font-medium mb-1">کارخانه مربوطه</label>
                <select
                  value={newTable.factory_id || 1}
                  onChange={(e) =>
                    setNewTable({ ...newTable, factory_id: parseInt(e.target.value, 10) })
                  }
                  className="w-full px-3 py-1.5 bg-gray-50 border border-gray-200 rounded focus:bg-white focus:outline-none"
                >
                  {factories.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-gray-700 font-medium mb-1">ساعت شروع پایش روزانه (HH:mm)</label>
                  <input
                    type="text"
                    required
                    placeholder="11:00"
                    value={newTable.start_time || '11:00'}
                    onChange={(e) => setNewTable({ ...newTable, start_time: e.target.value })}
                    className="w-full px-3 py-1.5 bg-gray-50 border border-gray-200 rounded focus:bg-white focus:outline-none focus:border-slate-800 text-left font-mono"
                  />
                </div>

                <div>
                  <label className="block text-gray-700 font-medium mb-1">فاصله تلاش مجدد (دقیقه)</label>
                  <input
                    type="number"
                    value={newTable.retry_interval_minutes || 30}
                    onChange={(e) =>
                      setNewTable({ ...newTable, retry_interval_minutes: parseInt(e.target.value, 10) })
                    }
                    className="w-full px-3 py-1.5 bg-gray-50 border border-gray-200 rounded focus:bg-white focus:outline-none focus:border-slate-800 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-gray-700 font-medium mb-1">حداکثر دفعات تلاش (Max Attempts)</label>
                  <input
                    type="number"
                    value={newTable.max_attempts || 5}
                    onChange={(e) =>
                      setNewTable({ ...newTable, max_attempts: parseInt(e.target.value, 10) })
                    }
                    className="w-full px-3 py-1.5 bg-gray-50 border border-gray-200 rounded focus:bg-white focus:outline-none focus:border-slate-800 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-gray-700 font-medium mb-1">آستانه هشدار Price Guard (درصد)</label>
                  <input
                    type="number"
                    value={newTable.price_guard_percent || 30}
                    onChange={(e) =>
                      setNewTable({ ...newTable, price_guard_percent: parseFloat(e.target.value) })
                    }
                    className="w-full px-3 py-1.5 bg-gray-50 border border-gray-200 rounded focus:bg-white focus:outline-none focus:border-slate-800 font-mono"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="tbl-active-toggle"
                  checked={newTable.active ?? true}
                  onChange={(e) => setNewTable({ ...newTable, active: e.target.checked })}
                  className="rounded text-slate-900 focus:ring-0"
                />
                <label htmlFor="tbl-active-toggle" className="text-gray-700 font-medium cursor-pointer">
                  جدول فعال باشد و در زمان‌بندی روزانه پایش شود
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-1.5 text-xs text-gray-700 hover:bg-gray-100 rounded transition-colors"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded transition-colors"
                >
                  ثبت و ایجاد جدول
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

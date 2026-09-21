import React, { useState } from 'react';
import { History as HistoryIcon, FileSpreadsheet, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';
import { ConfigHistoryItem, ImportHistoryItem } from '../types';

interface HistoryViewProps {
  configHistory: ConfigHistoryItem[];
  importHistory: ImportHistoryItem[];
}

export const HistoryView: React.FC<HistoryViewProps> = ({ configHistory, importHistory }) => {
  const [activeTab, setActiveTab] = useState<'config' | 'import'>('config');

  return (
    <div className="space-y-4">
      {/* Tab Switcher */}
      <div className="flex items-center justify-between bg-white p-4 rounded-lg border border-gray-200 shadow-xs">
        <div>
          <h2 className="text-sm font-bold text-gray-900">تاریخچه تغییرات و ایمپورت‌ها (Audit Trail)</h2>
          <p className="text-xs text-gray-500 mt-0.5">ردیابی کامل تغییرات تنظیمات سیستم و فایل‌های اکسل بارگذاری شده</p>
        </div>

        <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-md text-xs">
          <button
            onClick={() => setActiveTab('config')}
            className={`px-3 py-1.5 rounded font-medium transition-colors ${
              activeTab === 'config' ? 'bg-white text-gray-900 shadow-xs' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            تغییرات تنظیمات ({configHistory.length})
          </button>
          <button
            onClick={() => setActiveTab('import')}
            className={`px-3 py-1.5 rounded font-medium transition-colors ${
              activeTab === 'import' ? 'bg-white text-gray-900 shadow-xs' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            تاریخچه ایمپورت اکسل ({importHistory.length})
          </button>
        </div>
      </div>

      {activeTab === 'config' ? (
        /* Config History */
        <div className="bg-white rounded-lg border border-gray-200 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-gray-50 text-gray-500 font-medium border-b border-gray-200">
                <tr>
                  <th className="py-3 px-4 w-32">زمان</th>
                  <th className="py-3 px-4 w-28">موجودیت</th>
                  <th className="py-3 px-4 w-24">نوع عملیات</th>
                  <th className="py-3 px-4">توضیحات و مقدار جدید</th>
                  <th className="py-3 px-4 w-28 text-center">کاربر</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {configHistory.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-gray-400">
                      هنوز تغییری ثبت نشده است.
                    </td>
                  </tr>
                ) : (
                  configHistory.map((item) => (
                    <tr key={item.id} className="hover:bg-gray-50/80 transition-colors">
                      <td className="py-3 px-4 text-gray-500 font-mono text-[11px]">
                        {new Date(item.created_at || item.changed_at || Date.now()).toLocaleString('fa-IR')}
                      </td>
                      <td className="py-3 px-4 font-mono font-semibold text-slate-800">{item.entity_type}</td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                            item.action === 'create'
                              ? 'bg-emerald-50 text-emerald-700'
                              : item.action === 'update'
                              ? 'bg-blue-50 text-blue-700'
                              : 'bg-rose-50 text-rose-700'
                          }`}
                        >
                          {item.action === 'create' ? 'ایجاد' : item.action === 'update' ? 'ویرایش' : 'حذف'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-gray-800 font-medium">
                        {typeof item.new_value === 'object' ? JSON.stringify(item.new_value) : String(item.new_value || '—')}
                      </td>
                      <td className="py-3 px-4 text-center text-gray-500">{item.user || 'مدیر سیستم'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* Import History */
        <div className="bg-white rounded-lg border border-gray-200 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-gray-50 text-gray-500 font-medium border-b border-gray-200">
                <tr>
                  <th className="py-3 px-4 w-32">زمان آپلود</th>
                  <th className="py-3 px-4">نام فایل</th>
                  <th className="py-3 px-4">نوع داده</th>
                  <th className="py-3 px-4 text-center">کل سطرها</th>
                  <th className="py-3 px-4 text-center">جدید</th>
                  <th className="py-3 px-4 text-center">ویرایش</th>
                  <th className="py-3 px-4 text-center">خطا</th>
                  <th className="py-3 px-4 text-center">وضعیت</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 font-mono text-[11px]">
                {importHistory.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-gray-400 font-sans">
                      هیچ سابقه‌ای از ایمپورت اکسل موجود نیست.
                    </td>
                  </tr>
                ) : (
                  importHistory.map((item) => (
                    <tr key={item.id} className="hover:bg-gray-50/80 transition-colors">
                      <td className="py-3 px-4 text-gray-500">
                        {new Date(item.uploaded_at).toLocaleString('fa-IR')}
                      </td>
                      <td className="py-3 px-4 font-sans font-medium text-gray-900">{item.file_name}</td>
                      <td className="py-3 px-4 font-semibold text-slate-700">{item.import_type}</td>
                      <td className="py-3 px-4 text-center">{item.rows_total}</td>
                      <td className="py-3 px-4 text-center text-emerald-600 font-semibold">{item.rows_new}</td>
                      <td className="py-3 px-4 text-center text-blue-600 font-semibold">{item.rows_updated}</td>
                      <td className="py-3 px-4 text-center text-rose-600 font-semibold">{item.rows_failed}</td>
                      <td className="py-3 px-4 text-center font-sans">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${
                            item.status === 'SUCCESS'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : item.status === 'PARTIAL'
                              ? 'bg-amber-50 text-amber-700 border border-amber-200'
                              : 'bg-rose-50 text-rose-700 border border-rose-200'
                          }`}
                        >
                          {item.status === 'SUCCESS' ? 'موفق کامل' : item.status === 'PARTIAL' ? 'موفق ناقص' : 'ناموفق'}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

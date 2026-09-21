import React, { useState } from 'react';
import { PlayCircle, CheckCircle2, XCircle, Clock, Download, ChevronDown, ChevronUp } from 'lucide-react';
import { ExecutionRun } from '../types';

interface RunsViewProps {
  runs: ExecutionRun[];
  onExport: (entity: string) => void;
}

export const RunsView: React.FC<RunsViewProps> = ({ runs, onExport }) => {
  const [expandedRunId, setExpandedRunId] = useState<number | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-lg border border-gray-200 shadow-xs">
        <div>
          <h2 className="text-sm font-bold text-gray-900">تاریخچه اجراهای سیستم (Execution Runs)</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            ثبت کلیه مراحل استخراج، بررسی تازگی تاریخ، محافظت Price Guard و ارسال به وردپرس
          </p>
        </div>

        <button
          onClick={() => onExport('runs')}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-200 rounded-md hover:bg-gray-50 transition-colors"
        >
          <Download className="w-3.5 h-3.5 text-gray-500" />
          <span>خروجی اکسل اجراها</span>
        </button>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-gray-50 text-gray-500 font-medium border-b border-gray-200">
              <tr>
                <th className="py-3 px-4 w-20">شناسه</th>
                <th className="py-3 px-4">نوع راه‌اندازی (Trigger)</th>
                <th className="py-3 px-4">جدول قیمت</th>
                <th className="py-3 px-4">شروع</th>
                <th className="py-3 px-4 text-center">مدت زمان</th>
                <th className="py-3 px-4 text-center">کالاهای استخراجی</th>
                <th className="py-3 px-4 text-center">تعداد خطا</th>
                <th className="py-3 px-4 text-center">وضعیت</th>
                <th className="py-3 px-4 text-center w-20">جزئیات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {runs.map((r) => {
                const isExpanded = expandedRunId === r.id;
                return (
                  <React.Fragment key={r.id}>
                    <tr
                      onClick={() => setExpandedRunId(isExpanded ? null : r.id)}
                      className="hover:bg-gray-50/80 cursor-pointer transition-colors"
                    >
                      <td className="py-3 px-4 font-mono text-gray-500">#{r.id}</td>
                      <td className="py-3 px-4">
                        <span className="font-mono text-[11px] font-semibold text-slate-800 bg-slate-100 px-2 py-0.5 rounded">
                          {r.trigger_type}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-bold text-gray-900">{r.price_table_name || '—'}</td>
                      <td className="py-3 px-4 text-gray-500 font-mono text-[11px]">
                        {new Date(r.started_at).toLocaleString('fa-IR')}
                      </td>
                      <td className="py-3 px-4 text-center font-mono">
                        {r.duration_ms ? `${(r.duration_ms / 1000).toFixed(1)} ثانیه` : '—'}
                      </td>
                      <td className="py-3 px-4 text-center font-mono font-semibold">
                        {r.products_extracted} / {r.products_expected}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span
                          className={`font-mono font-bold ${
                            r.error_count > 0 ? 'text-rose-600' : 'text-gray-400'
                          }`}
                        >
                          {r.error_count}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${
                            r.status === 'DONE'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : r.status === 'RUNNING'
                              ? 'bg-blue-50 text-blue-700 border border-blue-200'
                              : 'bg-rose-50 text-rose-700 border border-rose-200'
                          }`}
                        >
                          {r.status === 'DONE' ? 'موفق' : r.status === 'RUNNING' ? 'در حال اجرا' : 'خطا'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <button className="p-1 text-gray-400 hover:text-gray-900">
                          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                      </td>
                    </tr>

                    {/* Detailed expandable drawer */}
                    {isExpanded && (
                      <tr className="bg-slate-50/60">
                        <td colSpan={9} className="p-4 text-xs">
                          <div className="space-y-2">
                            <div className="flex items-center justify-between border-b border-gray-200 pb-2">
                              <span className="font-bold text-gray-800">جزئیات اجرای #{r.id}</span>
                              <span className="text-gray-500 font-mono">
                                شناسه لاگ: run_{r.id}_{new Date(r.started_at).getTime()}
                              </span>
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                              <div className="bg-white p-2.5 rounded border border-gray-200">
                                <span className="text-gray-400 block text-[10px]">تلاش شماره</span>
                                <span className="font-semibold text-gray-900">{r.attempt_number || 1}</span>
                              </div>
                              <div className="bg-white p-2.5 rounded border border-gray-200">
                                <span className="text-gray-400 block text-[10px]">منابع بروزرسانی شده</span>
                                <span className="font-semibold text-gray-900">{r.sources_updated || 0}</span>
                              </div>
                              <div className="bg-white p-2.5 rounded border border-gray-200">
                                <span className="text-gray-400 block text-[10px]">ارسال به وردپرس</span>
                                <span className="font-semibold text-emerald-600">همگام‌سازی مستقیم</span>
                              </div>
                              <div className="bg-white p-2.5 rounded border border-gray-200">
                                <span className="text-gray-400 block text-[10px]">زمان خاتمه</span>
                                <span className="font-semibold text-gray-900 font-mono">
                                  {r.completed_at ? new Date(r.completed_at).toLocaleTimeString('fa-IR') : '—'}
                                </span>
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

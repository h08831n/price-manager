import React, { useState } from 'react';
import { FileText, Download, Filter, Search } from 'lucide-react';
import { SystemLog } from '../types';

interface LogsViewProps {
  logs: SystemLog[];
  onExport: (entity: string) => void;
}

export const LogsView: React.FC<LogsViewProps> = ({ logs, onExport }) => {
  const [levelFilter, setLevelFilter] = useState<string>('ALL');
  const [search, setSearch] = useState<string>('');

  const filteredLogs = logs.filter((l) => {
    const matchesLevel = levelFilter === 'ALL' || l.level === levelFilter;
    const matchesSearch = !search || l.message.toLowerCase().includes(search.toLowerCase());
    return matchesLevel && matchesSearch;
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-lg border border-gray-200 shadow-xs">
        <div>
          <h2 className="text-sm font-bold text-gray-900">لاگ‌های سیستمی و رویدادها (System Logs)</h2>
          <p className="text-xs text-gray-500 mt-0.5">ثبت تمامی رویدادها، تریگرها، خزش‌ها و ارتباط با ووکامرس</p>
        </div>

        <button
          onClick={() => onExport('logs')}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-200 rounded-md hover:bg-gray-50 transition-colors"
        >
          <Download className="w-3.5 h-3.5 text-gray-500" />
          <span>خروجی اکسل لاگ‌ها</span>
        </button>
      </div>

      {/* Filter Bar */}
      <div className="flex items-center justify-between gap-3 bg-white p-3 rounded-lg border border-gray-200 text-xs">
        <div className="flex items-center gap-2">
          <span className="text-gray-500 font-medium">سطح لاگ:</span>
          {['ALL', 'INFO', 'WARNING', 'ERROR'].map((lvl) => (
            <button
              key={lvl}
              onClick={() => setLevelFilter(lvl)}
              className={`px-3 py-1 rounded font-medium transition-colors ${
                levelFilter === lvl
                  ? 'bg-slate-900 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {lvl === 'ALL' ? 'همه سطوح' : lvl}
            </button>
          ))}
        </div>

        <input
          type="text"
          placeholder="جستجو در پیام‌های لاگ..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="px-2.5 py-1 text-xs bg-gray-50 border border-gray-200 rounded focus:bg-white focus:outline-none focus:border-slate-800 w-64"
        />
      </div>

      {/* Logs Table */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-gray-50 text-gray-500 font-medium border-b border-gray-200">
              <tr>
                <th className="py-3 px-4 w-32">زمان</th>
                <th className="py-3 px-4 w-20">سطح</th>
                <th className="py-3 px-4">پیام</th>
                <th className="py-3 px-4">اطلاعات تکمیلی (Metadata)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 font-mono text-[11px]">
              {filteredLogs.map((l) => (
                <tr key={l.id} className="hover:bg-gray-50/80 transition-colors">
                  <td className="py-2 px-4 text-gray-400">
                    {new Date(l.created_at).toLocaleTimeString('fa-IR')}
                  </td>
                  <td className="py-2 px-4">
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                        l.level === 'INFO'
                          ? 'bg-blue-50 text-blue-700'
                          : l.level === 'WARNING'
                          ? 'bg-amber-50 text-amber-700'
                          : 'bg-rose-50 text-rose-700'
                      }`}
                    >
                      {l.level}
                    </span>
                  </td>
                  <td className="py-2 px-4 font-sans text-gray-800 font-medium">{l.message}</td>
                  <td className="py-2 px-4 text-gray-400 truncate max-w-xs dir-ltr text-right">
                    {l.metadata ? JSON.stringify(l.metadata) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

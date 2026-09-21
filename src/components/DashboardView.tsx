import React from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Play,
  ShieldAlert,
  Send,
  ArrowUpRight,
  RefreshCw,
  ExternalLink,
  ChevronLeft
} from 'lucide-react';
import { DashboardData } from '../types';

interface DashboardViewProps {
  data: DashboardData | null;
  onNavigate: (tab: string) => void;
  onRunTable: (tableId: number) => void;
  onViewError: (errorId: number) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  data,
  onNavigate,
  onRunTable,
  onViewError
}) => {
  if (!data) {
    return (
      <div className="flex items-center justify-center py-24 text-gray-500 text-sm">
        <RefreshCw className="w-5 h-5 animate-spin ml-2 text-slate-700" />
        در حال بارگذاری اطلاعات داشبورد...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 1. Operational Overview Cards (Answering the 5 Essential Questions) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Question 1: System Running Status */}
        <div className="bg-white p-5 rounded-lg border border-gray-200 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-500">وضعیت اجرای زنده</span>
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${
                data.running_jobs_count > 0
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : 'bg-gray-100 text-gray-600'
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  data.running_jobs_count > 0 ? 'bg-emerald-500 animate-pulse' : 'bg-gray-400'
                }`}
              />
              {data.running_jobs_count > 0 ? 'در حال پایش' : 'آماده / خواب'}
            </span>
          </div>
          <div className="mt-4">
            <div className="text-2xl font-bold text-gray-900">
              {data.running_jobs_count} <span className="text-xs font-normal text-gray-500">پردازش فعال</span>
            </div>
            <p className="text-xs text-gray-500 mt-1">زمان‌بند فعال بر مبنای پایگاه‌داده (ساعات ۸:۳۰ تا ۱۷:۰۰)</p>
          </div>
        </div>

        {/* Question 2: Completed Tables Today */}
        <div className="bg-white p-5 rounded-lg border border-gray-200 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-500">جداول کامل شده امروز</span>
            <CheckCircle2 className="w-4 h-4 text-slate-500" />
          </div>
          <div className="mt-4">
            <div className="text-2xl font-bold text-gray-900">
              {data.completed_tables_today} <span className="text-sm font-normal text-gray-400">/ {data.total_tables_today}</span>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              {data.total_tables_today - data.completed_tables_today > 0
                ? `${data.total_tables_today - data.completed_tables_today} جدول در انتظار یا در حال تلاش`
                : 'تمام جداول با موفقیت کامل شدند'}
            </p>
          </div>
        </div>

        {/* Question 3: Pending Sources & Retries */}
        <div className="bg-white p-5 rounded-lg border border-gray-200 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-500">منابع در انتظار بروزرسانی</span>
            <Clock className="w-4 h-4 text-amber-500" />
          </div>
          <div className="mt-4">
            <div className="text-2xl font-bold text-amber-600">
              {data.pending_sources_count} <span className="text-xs font-normal text-gray-500">منبع باز</span>
            </div>
            <p className="text-xs text-gray-500 mt-1">منتظر انتشار تاریخ امروز در سایت مرجع جهت استخراج مجدد</p>
          </div>
        </div>

        {/* Question 4: Open Errors Needing Human Attention */}
        <div className="bg-white p-5 rounded-lg border border-gray-200 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-500">خطاهای نیازمند بررسی</span>
            <AlertTriangle className={`w-4 h-4 ${data.open_errors_count > 0 ? 'text-rose-500' : 'text-gray-400'}`} />
          </div>
          <div className="mt-4">
            <div className={`text-2xl font-bold ${data.open_errors_count > 0 ? 'text-rose-600' : 'text-gray-900'}`}>
              {data.open_errors_count} <span className="text-xs font-normal text-gray-500">خطای باز</span>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              {data.blocked_prices_today > 0
                ? `${data.blocked_prices_today} قیمت مسدود شده توسط Price Guard`
                : 'بدون مداخله فوری'}
            </p>
          </div>
        </div>
      </div>

      {/* 2. WordPress Last Sync Card & Price Guard Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* WordPress Sync Box */}
        <div className="bg-white p-5 rounded-lg border border-gray-200 shadow-xs lg:col-span-2">
          <div className="flex items-center justify-between border-b border-gray-100 pb-3">
            <div className="flex items-center gap-2">
              <Send className="w-4 h-4 text-slate-700" />
              <h3 className="font-semibold text-gray-900 text-sm">آخرین ارسال قیمت به سایت وردپرس (ووکامرس)</h3>
            </div>
            <button
              onClick={() => onNavigate('runs')}
              className="text-xs text-slate-700 hover:text-slate-900 inline-flex items-center gap-1 font-medium"
            >
              <span>مشاهده تاریخچه اجراها</span>
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="mt-4">
            {data.last_wordpress_publish ? (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-3 bg-slate-50 rounded-md border border-slate-100">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm text-gray-900">
                      جدول: {data.last_wordpress_publish.table_name}
                    </span>
                    <span
                      className={`text-[11px] px-2 py-0.5 rounded font-medium ${
                        data.last_wordpress_publish.status === 'SUCCESS'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-rose-100 text-rose-800'
                      }`}
                    >
                      {data.last_wordpress_publish.status === 'SUCCESS' ? 'موفق' : 'ناموفق'}
                    </span>
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    زمان ارسال: {new Date(data.last_wordpress_publish.published_at).toLocaleTimeString('fa-IR')} •{' '}
                    تعداد اقلام همگام شده: {data.last_wordpress_publish.products_count} کالا
                  </div>
                </div>

                <div className="text-xs text-slate-600">
                  {data.last_wordpress_publish.message}
                </div>
              </div>
            ) : (
              <p className="text-xs text-gray-400 py-3">هنوز ارسالی در سیستم ثبت نشده است.</p>
            )}
          </div>
        </div>

        {/* Price Guard & Protection Snapshot */}
        <div className="bg-white p-5 rounded-lg border border-gray-200 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between border-b border-gray-100 pb-3">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-slate-700" />
              <h3 className="font-semibold text-gray-900 text-sm">سپر محافظتی قیمت (Price Guard)</h3>
            </div>
          </div>

          <div className="py-2">
            <div className="text-2xl font-bold text-gray-900">
              {data.blocked_prices_today}{' '}
              <span className="text-xs font-normal text-gray-500">قیمت مسدود شده امروز</span>
            </div>
            <p className="text-xs text-gray-500 mt-1 leading-relaxed">
              از نوسانات ناگهانی یا خطای استخراج به سایت اصلی جلوگیری شده است.
            </p>
          </div>

          <button
            onClick={() => onNavigate('errors')}
            className="w-full mt-2 py-2 text-xs font-medium text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors text-center"
          >
            مشاهده اقلام مسدود شده در مرکز خطا
          </button>
        </div>
      </div>

      {/* 3. Pending Updates Table & Recent Errors List */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pending Updates */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-xs overflow-hidden">
          <div className="p-4 border-b border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-gray-500" />
              <h3 className="font-semibold text-gray-900 text-sm">جداول منتظر تکمیل یا تلاش مجدد</h3>
            </div>
            <span className="text-xs text-gray-500">{data.pending_updates.length} جدول</span>
          </div>

          <div className="divide-y divide-gray-100">
            {data.pending_updates.length === 0 ? (
              <div className="p-6 text-center text-xs text-gray-400">
                همه جداول برای امروز کامل شده‌اند یا جدولی در انتظار نیست.
              </div>
            ) : (
              data.pending_updates.map((item) => (
                <div key={item.price_table_id} className="p-4 flex items-center justify-between hover:bg-gray-50">
                  <div>
                    <div className="font-medium text-sm text-gray-900">{item.price_table_name}</div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      تلاش شماره {item.attempt_number} از {item.max_attempts} • {item.pending_sources_count} منبع هنوز بروز نشده است
                    </div>
                  </div>

                  <button
                    id={`btn-run-table-${item.price_table_id}`}
                    onClick={() => onRunTable(item.price_table_id)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors"
                  >
                    <Play className="w-3 h-3" />
                    <span>اجرای دستی</span>
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Recent Open Errors */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-xs overflow-hidden">
          <div className="p-4 border-b border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-500" />
              <h3 className="font-semibold text-gray-900 text-sm">آخرین خطاهای باز</h3>
            </div>
            <button
              onClick={() => onNavigate('errors')}
              className="text-xs text-slate-700 hover:text-slate-900 font-medium"
            >
              مدیریت تمام خطاها ({data.open_errors_count})
            </button>
          </div>

          <div className="divide-y divide-gray-100">
            {data.recent_errors.length === 0 ? (
              <div className="p-6 text-center text-xs text-emerald-600">
                هیچ خطای بازی وجود ندارد. سیستم کاملاً پایدار است.
              </div>
            ) : (
              data.recent_errors.map((err) => (
                <div
                  key={err.id}
                  onClick={() => onViewError(err.id)}
                  className="p-4 flex items-center justify-between hover:bg-rose-50/50 cursor-pointer transition-colors"
                >
                  <div className="max-w-[80%]">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] px-2 py-0.5 rounded bg-rose-100 text-rose-800 font-medium">
                        {err.error_type}
                      </span>
                      <span className="text-xs text-gray-500">
                        {new Date(err.created_at).toLocaleTimeString('fa-IR')}
                      </span>
                    </div>
                    <p className="text-xs text-gray-800 font-medium mt-1 truncate">{err.error_message}</p>
                  </div>

                  <ChevronLeft className="w-4 h-4 text-gray-400" />
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

import React, { useState } from 'react';
import { Save, Check, Globe, Clock, ShieldCheck, Key, RefreshCw } from 'lucide-react';
import { GlobalSettings } from '../types';

interface SettingsViewProps {
  settings: GlobalSettings;
  onSave: (settings: Partial<GlobalSettings>) => Promise<void>;
}

export const SettingsView: React.FC<SettingsViewProps> = ({ settings, onSave }) => {
  const [formData, setFormData] = useState<GlobalSettings>({ ...settings });
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setSaveSuccess(false);

    try {
      await onSave(formData);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="bg-white p-5 rounded-lg border border-gray-200 shadow-xs flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold text-gray-900">تنظیمات سراسری سیستم (Global Settings)</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            ساعات کاری زمان‌بند، مقادیر پیش‌فرض ارث‌بری، آستانه امنیتی Price Guard و اتصال به وردپرس
          </p>
        </div>

        {saveSuccess && (
          <span className="inline-flex items-center gap-1 px-3 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-md text-xs font-semibold">
            <Check className="w-3.5 h-3.5" />
            تنظیمات با موفقیت ذخیره شد
          </span>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-6 text-xs">
        {/* Working Hours & Scheduler (Requirement #7, #18, #20) */}
        <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-xs space-y-4">
          <div className="flex items-center gap-2 border-b border-gray-100 pb-3">
            <Clock className="w-4 h-4 text-slate-800" />
            <h3 className="font-bold text-gray-900 text-sm">تنظیمات ساعات کاری زمان‌بند خودکار</h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-gray-700 font-medium mb-1">ساعت شروع کار سیستم (HH:mm)</label>
              <input
                type="text"
                value={formData.working_hours_start}
                onChange={(e) => setFormData({ ...formData, working_hours_start: e.target.value })}
                className="w-full px-3 py-1.5 bg-gray-50 border border-gray-200 rounded focus:bg-white focus:outline-none focus:border-slate-800 font-mono text-left"
              />
            </div>

            <div>
              <label className="block text-gray-700 font-medium mb-1">ساعت پایان کار سیستم (HH:mm)</label>
              <input
                type="text"
                value={formData.working_hours_end}
                onChange={(e) => setFormData({ ...formData, working_hours_end: e.target.value })}
                className="w-full px-3 py-1.5 bg-gray-50 border border-gray-200 rounded focus:bg-white focus:outline-none focus:border-slate-800 font-mono text-left"
              />
            </div>

            <div>
              <label className="block text-gray-700 font-medium mb-1">منطقه زمانی (Timezone)</label>
              <input
                type="text"
                disabled
                value={formData.timezone}
                className="w-full px-3 py-1.5 bg-gray-100 border border-gray-200 rounded font-mono text-left text-gray-500 cursor-not-allowed"
              />
            </div>
          </div>

          <div className="pt-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.friday_enabled}
                onChange={(e) => setFormData({ ...formData, friday_enabled: e.target.checked })}
                className="rounded text-slate-900 focus:ring-0"
              />
              <span className="text-gray-700 font-medium">
                فعال‌سازی پایش در روز جمعه (به طور پیش‌فرض غیرفعال است)
              </span>
            </label>
          </div>
        </div>

        {/* Default Cascading Inheritance Values (Requirement #7, #21) */}
        <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-xs space-y-4">
          <div className="flex items-center gap-2 border-b border-gray-100 pb-3">
            <ShieldCheck className="w-4 h-4 text-slate-800" />
            <h3 className="font-bold text-gray-900 text-sm">مقادیر پیش‌فرض ارث‌بری و امنیت Price Guard</h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-gray-700 font-medium mb-1">فاصله پیش‌فرض تلاش مجدد (دقیقه)</label>
              <input
                type="number"
                value={formData.default_retry_interval}
                onChange={(e) =>
                  setFormData({ ...formData, default_retry_interval: parseInt(e.target.value, 10) })
                }
                className="w-full px-3 py-1.5 bg-gray-50 border border-gray-200 rounded focus:bg-white focus:outline-none focus:border-slate-800 font-mono"
              />
            </div>

            <div>
              <label className="block text-gray-700 font-medium mb-1">سقف پیش‌فرض تعداد دفعات تلاش (Max Attempts)</label>
              <input
                type="number"
                value={formData.default_max_attempts}
                onChange={(e) =>
                  setFormData({ ...formData, default_max_attempts: parseInt(e.target.value, 10) })
                }
                className="w-full px-3 py-1.5 bg-gray-50 border border-gray-200 rounded focus:bg-white focus:outline-none focus:border-slate-800 font-mono"
              />
            </div>

            <div>
              <label className="block text-gray-700 font-medium mb-1">درصد پیش‌فرض آستانه Price Guard</label>
              <input
                type="number"
                value={formData.default_price_guard_percent}
                onChange={(e) =>
                  setFormData({ ...formData, default_price_guard_percent: parseFloat(e.target.value) })
                }
                className="w-full px-3 py-1.5 bg-gray-50 border border-gray-200 rounded focus:bg-white focus:outline-none focus:border-slate-800 font-mono"
              />
            </div>
          </div>
        </div>

        {/* Browser & Scraping Limits */}
        <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-xs space-y-4">
          <div className="flex items-center gap-2 border-b border-gray-100 pb-3">
            <Globe className="w-4 h-4 text-slate-800" />
            <h3 className="font-bold text-gray-900 text-sm">تنظیمات موتور خزش و مرورگر</h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-gray-700 font-medium mb-1">مهلت پیش‌فرض بارگذاری صفحه (Timeout - ثانیه)</label>
              <input
                type="number"
                value={formData.default_timeout}
                onChange={(e) =>
                  setFormData({ ...formData, default_timeout: parseInt(e.target.value, 10) })
                }
                className="w-full px-3 py-1.5 bg-gray-50 border border-gray-200 rounded focus:bg-white focus:outline-none focus:border-slate-800 font-mono"
              />
            </div>

            <div>
              <label className="block text-gray-700 font-medium mb-1">مدت زمان انتظار پس از بارگذاری کامل صفحه (ms)</label>
              <input
                type="number"
                value={formData.default_wait_after_load}
                onChange={(e) =>
                  setFormData({ ...formData, default_wait_after_load: parseInt(e.target.value, 10) })
                }
                className="w-full px-3 py-1.5 bg-gray-50 border border-gray-200 rounded focus:bg-white focus:outline-none focus:border-slate-800 font-mono"
              />
            </div>
          </div>
        </div>

        {/* WordPress Sync Configuration (Requirement #28, #29) */}
        <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-xs space-y-4">
          <div className="flex items-center gap-2 border-b border-gray-100 pb-3">
            <Key className="w-4 h-4 text-slate-800" />
            <h3 className="font-bold text-gray-900 text-sm">اتصال به وبسایت اصلی وردپرس (ووکامرس)</h3>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-gray-700 font-medium mb-1">
                آدرس سایت وردپرس (WordPress Base URL)
              </label>
              <input
                type="url"
                value={formData.wordpress_url}
                onChange={(e) => setFormData({ ...formData, wordpress_url: e.target.value })}
                placeholder="https://your-site.com"
                className="w-full px-3 py-1.5 bg-gray-50 border border-gray-200 rounded focus:bg-white focus:outline-none focus:border-slate-800 dir-ltr text-right font-mono"
              />
            </div>

            <div>
              <label className="block text-gray-700 font-medium mb-1">
                توکن احراز هویت اختصاصی افزونه (API Token)
              </label>
              <input
                type="password"
                value={formData.wordpress_api_token}
                onChange={(e) => setFormData({ ...formData, wordpress_api_token: e.target.value })}
                placeholder="کلید احراز هویت تعریف شده در افزونه price-system-sync.php"
                className="w-full px-3 py-1.5 bg-gray-50 border border-gray-200 rounded focus:bg-white focus:outline-none focus:border-slate-800 dir-ltr text-right font-mono"
              />
              <p className="text-[11px] text-gray-400 mt-1">
                این توکن در هدر <code>Authorization: Bearer &lt;token&gt;</code> برای ارسال سریع و دسته‌ای قیمت‌ها استفاده می‌شود.
              </p>
            </div>
          </div>
        </div>

        {/* Submit */}
        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={isSaving}
            className="px-6 py-2.5 font-semibold text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-50 rounded-md transition-colors shadow-xs flex items-center gap-2 text-xs"
          >
            {isSaving ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>در حال ذخیره‌سازی...</span>
              </>
            ) : (
              <>
                <Save className="w-3.5 h-3.5" />
                <span>ذخیره کلیه تنظیمات</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
};

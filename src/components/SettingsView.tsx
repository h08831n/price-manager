import React, { useState } from 'react';
import { Save, Check, Globe, Clock, ShieldCheck, Key, RefreshCw, Lock, AlertCircle, Eye, EyeOff, CheckCircle2, XCircle, Wifi, Layers } from 'lucide-react';
import { GlobalSettings } from '../types';

interface SettingsViewProps {
  settings: GlobalSettings;
  onSave: (settings: Partial<GlobalSettings>) => Promise<void>;
}

export const SettingsView: React.FC<SettingsViewProps> = ({ settings, onSave }) => {
  const [formData, setFormData] = useState<GlobalSettings>({
    ...settings,
    wordpress_timeout_sec: settings.wordpress_timeout_sec || 15,
    wordpress_auto_publish: settings.wordpress_auto_publish ?? true,
    wordpress_stock_status: settings.wordpress_stock_status || 'keep_current',
    sync_batch_size: settings.sync_batch_size || 25,
    sync_batch_delay_ms: settings.sync_batch_delay_ms ?? 250
  });
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // WordPress live test state
  const [showToken, setShowToken] = useState(false);
  const [isTestingWp, setIsTestingWp] = useState(false);
  const [wpTestResult, setWpTestResult] = useState<{
    success: boolean;
    message: string;
    site_name?: string;
    site_url?: string;
    woocommerce_active?: boolean;
  } | null>(null);

  // Password change state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);

  const handleTestWpConnection = async () => {
    setIsTestingWp(true);
    setWpTestResult(null);
    try {
      const res = await fetch('/api/wordpress/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wordpress_url: formData.wordpress_url,
          wordpress_api_token: formData.wordpress_api_token
        })
      });
      const data = await res.json();
      setWpTestResult(data);
    } catch (err: any) {
      setWpTestResult({
        success: false,
        message: `خطای ارتباط با سرور: ${err.message}`
      });
    } finally {
      setIsTestingWp(false);
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(null);

    if (!currentPassword) {
      setPasswordError('لطفاً رمز عبور فعلی را وارد نمایید.');
      return;
    }
    if (!newPassword || newPassword.length < 4) {
      setPasswordError('رمز عبور جدید باید حداقل ۴ کاراکتر باشد.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('تکرار رمز عبور با رمز عبور جدید یکسان نیست.');
      return;
    }

    setPasswordLoading(true);
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword
        })
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'خطا در تغییر رمز عبور');
      }

      setPasswordSuccess('رمز عبور پنل با موفقیت تغییر یافت.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => setPasswordSuccess(null), 4000);
    } catch (err: any) {
      setPasswordError(err.message || 'خطا در برقراری ارتباط با سرور');
    } finally {
      setPasswordLoading(false);
    }
  };

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
          <div className="flex items-center justify-between border-b border-gray-100 pb-3">
            <div className="flex items-center gap-2">
              <Key className="w-4 h-4 text-slate-800" />
              <div>
                <h3 className="font-bold text-gray-900 text-sm">اتصال به وبسایت اصلی وردپرس (ووکامرس)</h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  کلیه متغیرهای اتصال به سایت مقصد از طریق این پنل مدیریت شده و در پایگاه‌داده نگهداری می‌شوند
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleTestWpConnection}
              disabled={isTestingWp}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 rounded-md text-xs font-semibold transition-colors disabled:opacity-50"
            >
              {isTestingWp ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-600" />
                  <span>در حال تست اتصال...</span>
                </>
              ) : (
                <>
                  <Wifi className="w-3.5 h-3.5 text-blue-600" />
                  <span>تست ارتباط آنلاین با وردپرس</span>
                </>
              )}
            </button>
          </div>

          {wpTestResult && (
            <div
              className={`p-3 rounded-lg border text-xs flex items-start gap-2.5 animate-in fade-in duration-150 ${
                wpTestResult.success
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : 'bg-rose-50 border-rose-200 text-rose-900'
              }`}
            >
              {wpTestResult.success ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              ) : (
                <XCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              )}
              <div className="space-y-1">
                <div className="font-bold">
                  {wpTestResult.success ? 'اتصال موفقیت‌آمیز است' : 'خطا در برقراری ارتباط با وردپرس'}
                </div>
                <div className="text-[11px] leading-relaxed">
                  {wpTestResult.message}
                </div>
                {wpTestResult.site_name && (
                  <div className="text-[10px] text-emerald-700 font-medium">
                    نام سایت: {wpTestResult.site_name} | ووکامرس:{' '}
                    {wpTestResult.woocommerce_active ? 'فعال ✅' : 'غیرفعال ⚠️'}
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="block text-gray-700 font-medium mb-1">
                آدرس کامل سایت وردپرس (WordPress Base URL) <span className="text-rose-500">*</span>
              </label>
              <input
                type="url"
                required
                value={formData.wordpress_url}
                onChange={(e) => setFormData({ ...formData, wordpress_url: e.target.value })}
                placeholder="https://example.com"
                className="w-full px-3 py-1.5 bg-gray-50 border border-gray-200 rounded focus:bg-white focus:outline-none focus:border-slate-800 dir-ltr text-right font-mono"
              />
              <p className="text-[11px] text-gray-400 mt-1">
                آدرس دامنه سایت شما بدون اسلش انتهایی (مثال: <code>https://my-shop.ir</code>)
              </p>
            </div>

            <div>
              <label className="block text-gray-700 font-medium mb-1">
                توکن احراز هویت اختصاصی افزونه (API Secret Token) <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <input
                  type={showToken ? 'text' : 'password'}
                  required
                  value={formData.wordpress_api_token}
                  onChange={(e) => setFormData({ ...formData, wordpress_api_token: e.target.value })}
                  placeholder="کلید احراز هویت تعریف شده در افزونه price-system-sync.php"
                  className="w-full pl-10 pr-3 py-1.5 bg-gray-50 border border-gray-200 rounded focus:bg-white focus:outline-none focus:border-slate-800 dir-ltr text-right font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowToken(!showToken)}
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1"
                  title={showToken ? 'مخفی‌سازی توکن' : 'نمایش توکن'}
                >
                  {showToken ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
              <p className="text-[11px] text-gray-400 mt-1">
                این کلید امنیتی در هدر <code>Authorization: Bearer</code> جهت احراز هویت درخواست‌های امن ارسال می‌گردد.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
              <div>
                <label className="block text-gray-700 font-medium mb-1">
                  مهلت زمان پاسخگویی وردپرس (Timeout - ثانیه)
                </label>
                <input
                  type="number"
                  min="5"
                  max="120"
                  value={formData.wordpress_timeout_sec || 15}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      wordpress_timeout_sec: parseInt(e.target.value, 10) || 15
                    })
                  }
                  className="w-full px-3 py-1.5 bg-gray-50 border border-gray-200 rounded focus:bg-white focus:outline-none focus:border-slate-800 font-mono"
                />
                <p className="text-[10px] text-gray-400 mt-1">پیش‌فرض: ۱۵ ثانیه</p>
              </div>

              <div>
                <label className="block text-gray-700 font-medium mb-1">
                  وضعیت موجودی انبار در ووکامرس پس از بروزرسانی قیمت
                </label>
                <select
                  value={formData.wordpress_stock_status || 'keep_current'}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      wordpress_stock_status: e.target.value as any
                    })
                  }
                  className="w-full px-3 py-1.5 bg-gray-50 border border-gray-200 rounded focus:bg-white focus:outline-none focus:border-slate-800 text-xs"
                >
                  <option value="keep_current">حفظ وضعیت فعلی موجودی کالا در سایت مقصد</option>
                  <option value="instock">تنظیم وضعیت روی موجود در انبار (In Stock)</option>
                </select>
                <p className="text-[10px] text-gray-400 mt-1">مدیریت خودکار وضعیت انبار ووکامرس</p>
              </div>
            </div>

            {/* Batching & Anti-Overload Settings (Automated Chunking) */}
            <div className="p-3.5 bg-slate-50/80 rounded-lg border border-slate-200 space-y-3">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-slate-700" />
                <span className="font-bold text-gray-800 text-xs">
                  تنظیمات ارسال چندتایی و ضد فشار روی سرور (Batch Sync & Anti-Overload)
                </span>
                <span className="text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-medium">
                  محافظت از منابع سرور وردپرس
                </span>
              </div>
              <p className="text-[11px] text-gray-600 leading-relaxed">
                هنگامی که تعداد زیادی محصول، جدول یا کارخانه در سامانه ثبت شده باشد، ارسال یکجای تمام اقلام ممکن است باعث افت سرعت، اشغال پردازنده و حافظه رم وردپرس، یا خطای قطعی ارتباط (Gateway Timeout) گردد. سامانه به صورت خودکار داده‌ها را در بسته‌های چندتایی با مکث زمانی معین ارسال می‌کند تا هیچ فشاری به هیچ‌یک از سرورها وارد نشود.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                <div>
                  <label className="block text-gray-700 font-medium mb-1">
                    تعداد اقلام در هر بسته (Batch Size)
                  </label>
                  <input
                    type="number"
                    min="5"
                    max="200"
                    value={formData.sync_batch_size || 25}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        sync_batch_size: Math.max(1, parseInt(e.target.value, 10) || 25)
                      })
                    }
                    className="w-full px-3 py-1.5 bg-white border border-gray-300 rounded focus:outline-none focus:border-slate-800 font-mono text-xs"
                  />
                  <p className="text-[10px] text-gray-400 mt-1">
                    پیش‌فرض: ۲۵ قلم در هر بسته (پیشنهادی: بین ۱۵ تا ۵۰)
                  </p>
                </div>

                <div>
                  <label className="block text-gray-700 font-medium mb-1">
                    فاصله زمانی مکث بین ارسال هر بسته (Throttle Delay - میلی‌ثانیه)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="5000"
                    step="50"
                    value={formData.sync_batch_delay_ms ?? 250}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        sync_batch_delay_ms: Math.max(0, parseInt(e.target.value, 10) || 0)
                      })
                    }
                    className="w-full px-3 py-1.5 bg-white border border-gray-300 rounded focus:outline-none focus:border-slate-800 font-mono text-xs"
                  />
                  <p className="text-[10px] text-gray-400 mt-1">
                    پیش‌فرض: ۲۵۰ میلی‌ثانیه مکث جهت تنفس وب‌سرور و دیتابیس MySQL وردپرس
                  </p>
                </div>
              </div>
            </div>

            <div className="pt-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.wordpress_auto_publish ?? true}
                  onChange={(e) =>
                    setFormData({ ...formData, wordpress_auto_publish: e.target.checked })
                  }
                  className="rounded text-slate-900 focus:ring-0"
                />
                <span className="text-gray-700 font-medium">
                  انتشار خودکار قیمت‌های نهایی به سایت ووکامرس بلافاصله پس از محاسبه روزانه
                </span>
              </label>
            </div>

            <div className="p-3 bg-gray-50 rounded-lg border border-gray-200 text-[11px] text-gray-600 leading-relaxed">
              💡 <strong>راهنما:</strong> فایل افزونه اختصاصی وردپرس در مسیر <code>wordpress-plugin/price-system-sync.php</code> قرار دارد. کافیست آن را در پوشه افزونه‌های هاست خود فعال کرده و همان توکنی که در افزونه وارد کرده‌اید را در کادر بالا درج کنید. تمام اطلاعات به صورت پویا در پایگاه‌داده ذخیره می‌شوند و هیچ نیازی به تغییر سورس‌کد پروژه نیست.
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

      {/* Panel Security & Password Management Section */}
      <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b border-gray-100 pb-3">
          <div className="flex items-center gap-2">
            <Lock className="w-4 h-4 text-slate-800" />
            <div>
              <h3 className="font-bold text-gray-900 text-sm">امنیت و رمز عبور ورود به پنل</h3>
              <p className="text-xs text-gray-500 mt-0.5">
                تغییر رمز عبور جهت جلوگیری از دسترسی‌های غیرمجاز به سامانه
              </p>
            </div>
          </div>

          {passwordSuccess && (
            <span className="inline-flex items-center gap-1 px-3 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-md text-xs font-semibold">
              <Check className="w-3.5 h-3.5" />
              {passwordSuccess}
            </span>
          )}
        </div>

        {passwordError && (
          <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-md text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
            <span>{passwordError}</span>
          </div>
        )}

        <form onSubmit={handlePasswordChange} className="space-y-4 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-gray-700 font-medium mb-1">
                رمز عبور فعلی <span className="text-rose-500">*</span>
              </label>
              <input
                type="password"
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="رمز عبور فعلی..."
                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded focus:bg-white focus:outline-none focus:border-slate-800 font-mono"
              />
            </div>

            <div>
              <label className="block text-gray-700 font-medium mb-1">
                رمز عبور جدید <span className="text-rose-500">*</span>
              </label>
              <input
                type="password"
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="حداقل ۴ کاراکتر..."
                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded focus:bg-white focus:outline-none focus:border-slate-800 font-mono"
              />
            </div>

            <div>
              <label className="block text-gray-700 font-medium mb-1">
                تکرار رمز عبور جدید <span className="text-rose-500">*</span>
              </label>
              <input
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="تکرار رمز عبور جدید..."
                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded focus:bg-white focus:outline-none focus:border-slate-800 font-mono"
              />
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            <span className="text-[11px] text-gray-400">
              💡 رمز عبور پیش‌فرض سامانه <code className="font-mono font-bold text-gray-600 bg-gray-100 px-1 py-0.5 rounded">admin123</code> می‌باشد.
            </span>

            <button
              type="submit"
              disabled={passwordLoading}
              className="px-4 py-2 font-semibold text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-50 rounded-md transition-colors shadow-xs flex items-center gap-1.5 text-xs"
            >
              {passwordLoading ? (
                <>
                  <RefreshCw className="w-3 h-3 animate-spin" />
                  <span>در حال تغییر رمز...</span>
                </>
              ) : (
                <>
                  <Key className="w-3.5 h-3.5" />
                  <span>بروزرسانی رمز عبور</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

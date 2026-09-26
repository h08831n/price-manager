import React, { useState } from 'react';
import { Lock, Eye, EyeOff, ShieldCheck, ArrowLeft, AlertCircle } from 'lucide-react';

interface LoginScreenProps {
  onLoginSuccess: (token: string) => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ onLoginSuccess }) => {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) {
      setError('لطفاً رمز عبور را وارد نمایید.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || 'رمز عبور اشتباه است.');
      }

      if (data.token) {
        onLoginSuccess(data.token);
      } else {
        throw new Error('توکن امنیتی از سرور دریافت نشد.');
      }
    } catch (err: any) {
      setError(err.message || 'خطا در برقراری ارتباط با سرور');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col justify-center items-center p-4 selection:bg-slate-700 selection:text-white relative overflow-hidden font-sans">
      {/* Subtle Background Glow */}
      <div className="absolute top-1/4 -right-20 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 -left-20 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200/80 p-8 space-y-6 relative z-10 animate-in fade-in zoom-in-95 duration-200">
        {/* Branding & Header */}
        <div className="text-center space-y-2">
          <div className="w-14 h-14 bg-slate-900 text-white rounded-2xl flex items-center justify-center mx-auto shadow-md shadow-slate-900/20">
            <Lock className="w-7 h-7 text-blue-400" />
          </div>
          <h1 className="text-lg font-bold text-gray-900 tracking-tight pt-2">
            ورود به سامانه پایش قیمت
          </h1>
          <p className="text-xs text-gray-500 leading-relaxed">
            جهت دسترسی به پنل مدیریت ربات و جداول قیمت، رمز عبور را وارد کنید.
          </p>
        </div>

        {/* Error Notification */}
        {error && (
          <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg text-xs flex items-center gap-2 animate-in fade-in duration-150">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
            <span className="font-medium">{error}</span>
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">
              رمز عبور مدیریت
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                autoFocus
                required
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (error) setError(null);
                }}
                placeholder="رمز عبور را وارد نمایید..."
                className="w-full pl-10 pr-3 py-2.5 bg-gray-50 border border-gray-300 rounded-lg text-xs text-gray-900 focus:bg-white focus:outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900 transition-all font-mono"
              />
              <button
                type="button"
                tabIndex={-1}
                onClick={() => setShowPassword(!showPassword)}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 focus:outline-none transition-colors"
                title={showPassword ? 'مخفی‌سازی رمز' : 'نمایش رمز'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-2.5 px-4 bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-white text-xs font-semibold rounded-lg shadow-sm hover:shadow transition-all flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>در حال اعتبارسنجی...</span>
              </>
            ) : (
              <>
                <span>ورود به پنل</span>
                <ArrowLeft className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        {/* Helper Hint */}
        <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-lg text-[11px] text-gray-600 space-y-1 leading-relaxed">
          <div className="flex items-center gap-1.5 font-semibold text-slate-800">
            <ShieldCheck className="w-3.5 h-3.5 text-blue-600" />
            <span>رمز عبور پیش‌فرض سامانه:</span>
          </div>
          <p className="text-gray-500">
            برای ورود از رمز <code className="bg-white px-1.5 py-0.5 rounded border border-gray-200 font-mono font-bold text-slate-800">admin123</code> استفاده فرمایید (قابل تغییر در بخش تنظیمات پنل).
          </p>
        </div>

        {/* Anti-indexing notice */}
        <div className="text-center text-[10px] text-gray-400">
          🔒 سامانه خصوصی و پایش داخلی • مسدود شده برای موتورهای جستجو
        </div>
      </div>
    </div>
  );
};

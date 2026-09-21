import React from 'react';
import {
  LayoutDashboard,
  Package,
  Factory,
  TableProperties,
  Globe,
  PlayCircle,
  AlertOctagon,
  FileText,
  Settings,
  History,
  RefreshCw
} from 'lucide-react';

interface HeaderProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  openErrorsCount: number;
  onRefresh: () => void;
  isRefreshing: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  openErrorsCount,
  onRefresh,
  isRefreshing
}) => {
  const navItems = [
    { id: 'dashboard', label: 'داشبورد', icon: LayoutDashboard },
    { id: 'products', label: 'محصولات', icon: Package },
    { id: 'factories', label: 'کارخانه‌ها', icon: Factory },
    { id: 'price_tables', label: 'جداول قیمت', icon: TableProperties },
    { id: 'sites', label: 'سایت‌ها / منابع', icon: Globe },
    { id: 'runs', label: 'اجراها', icon: PlayCircle },
    {
      id: 'errors',
      label: 'خطاها',
      icon: AlertOctagon,
      badge: openErrorsCount > 0 ? openErrorsCount : undefined
    },
    { id: 'logs', label: 'لاگ‌ها', icon: FileText },
    { id: 'settings', label: 'تنظیمات', icon: Settings },
    { id: 'history', label: 'تاریخچه', icon: History }
  ];

  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-16">
          {/* Brand & System Title */}
          <div className="flex items-center space-x-reverse space-x-3">
            <div className="w-9 h-9 rounded-lg bg-slate-900 text-white flex items-center justify-center font-bold text-lg shadow-sm">
              قیمت
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-gray-900 text-base">سیستم جمع‌آوری قیمت و همگام‌سازی ووکامرس</span>
                <span className="text-[11px] px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-medium border border-slate-200">
                  نسخه عملیاتی
                </span>
              </div>
              <p className="text-xs text-gray-500">پایش رقبـا • استخراج XPath • محافظت Price Guard • ارسال مستقیم به وردپرس</p>
            </div>
          </div>

          {/* Quick Controls */}
          <div className="flex items-center gap-3">
            <button
              id="header-refresh-btn"
              onClick={onRefresh}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-200 rounded-md hover:bg-gray-50 transition-colors shadow-xs"
              title="بروزرسانی داده‌ها"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-gray-500 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span>بروزرسانی وضعیت</span>
            </button>
          </div>
        </div>

        {/* Minimal Navigation Bar */}
        <nav className="flex space-x-reverse space-x-1 overflow-x-auto py-1 scrollbar-none border-t border-gray-100">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                id={`nav-btn-${item.id}`}
                onClick={() => setActiveTab(item.id)}
                className={`relative flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-md whitespace-nowrap transition-colors ${
                  isActive
                    ? 'bg-slate-900 text-white'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-gray-500'}`} />
                <span>{item.label}</span>
                {item.badge !== undefined && (
                  <span
                    className={`px-1.5 py-0.2 text-[10px] font-bold rounded-full transition-colors ${
                      isActive
                        ? 'bg-rose-500 text-white'
                        : 'bg-rose-100 text-rose-700 border border-rose-200'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>
    </header>
  );
};

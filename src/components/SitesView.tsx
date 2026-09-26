import React, { useState } from 'react';
import {
  Globe,
  Plus,
  Edit2,
  ChevronDown,
  ChevronUp,
  Layers,
  CheckCircle2,
  Trash2,
  MoveUp,
  MoveDown,
  Clock,
  MousePointer,
  Scroll,
  Eye,
  Info,
  AlertTriangle
} from 'lucide-react';
import { Site, PageAction, PageActionType } from '../types';
import { useEscapeKey } from '../hooks/useEscapeKey';

interface SitesViewProps {
  sites: Site[];
  pageActions: PageAction[];
  onSaveSite: (site: Partial<Site>) => Promise<void>;
  onDeleteSite?: (id: number) => Promise<void>;
  onSavePageAction: (action: Partial<PageAction>) => Promise<void>;
  onDeletePageAction: (id: number) => Promise<void>;
}

export const SitesView: React.FC<SitesViewProps> = ({
  sites,
  pageActions,
  onSaveSite,
  onDeleteSite,
  onSavePageAction,
  onDeletePageAction
}) => {
  const [selectedSiteId, setSelectedSiteId] = useState<number>(sites[0]?.id || 1);
  const [isSiteModalOpen, setIsSiteModalOpen] = useState(false);
  const [editingSite, setEditingSite] = useState<Partial<Site> | null>(null);

  // Delete site modal state
  const [deletingSite, setDeletingSite] = useState<Site | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Default Page Action Modal / Form state
  const [isActionModalOpen, setIsActionModalOpen] = useState(false);
  const [editingActionId, setEditingActionId] = useState<number | null>(null);
  const [actionForm, setActionForm] = useState<{
    action_type: PageActionType;
    selector: string;
    value: string;
    active: boolean;
  }>({
    action_type: 'WAIT',
    selector: '',
    value: '1000',
    active: true
  });
  const [isSubmittingAction, setIsSubmittingAction] = useState(false);

  // Close modals on Escape
  useEscapeKey(() => {
    if (deletingSite) setDeletingSite(null);
    else if (isActionModalOpen) setIsActionModalOpen(false);
    else if (isSiteModalOpen) setIsSiteModalOpen(false);
  }, Boolean(deletingSite || isActionModalOpen || isSiteModalOpen));

  const currentSite = sites.find((s) => s.id === selectedSiteId) || sites[0];

  // Filter default actions belonging to current site, sorted by order
  const siteDefaultActions = pageActions
    .filter(
      (a) =>
        (a.scope === 'SITE_DEFAULT' && a.site_id === currentSite?.id) ||
        (!a.scope && a.site_id === currentSite?.id && !a.table_source_id && !a.source_page_id)
    )
    .sort((a, b) => a.order - b.order);

  const handleOpenAddSite = () => {
    setEditingSite({
      name: '',
      base_url: '',
      scrape_method: 'PLAYWRIGHT',
      browser: 'Chromium',
      timeout: 30,
      wait_after_load: 1000,
      active: true
    });
    setIsSiteModalOpen(true);
  };

  const handleOpenAddAction = () => {
    setEditingActionId(null);
    setActionForm({
      action_type: 'WAIT',
      selector: '',
      value: '1000',
      active: true
    });
    setIsActionModalOpen(true);
  };

  const handleOpenEditAction = (action: PageAction) => {
    setEditingActionId(action.id);
    setActionForm({
      action_type: action.action_type,
      selector: action.selector || '',
      value: action.value || '',
      active: action.active
    });
    setIsActionModalOpen(true);
  };

  const handleSaveAction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentSite) return;
    setIsSubmittingAction(true);
    try {
      if (editingActionId) {
        const existing = siteDefaultActions.find((a) => a.id === editingActionId);
        await onSavePageAction({
          id: editingActionId,
          scope: 'SITE_DEFAULT',
          site_id: currentSite.id,
          order: existing?.order || 1,
          action_type: actionForm.action_type,
          selector: actionForm.selector.trim(),
          value: actionForm.value.trim(),
          active: actionForm.active
        });
      } else {
        await onSavePageAction({
          scope: 'SITE_DEFAULT',
          site_id: currentSite.id,
          order: siteDefaultActions.length + 1,
          action_type: actionForm.action_type,
          selector: actionForm.selector.trim(),
          value: actionForm.value.trim(),
          active: actionForm.active
        });
      }
      setIsActionModalOpen(false);
    } finally {
      setIsSubmittingAction(false);
    }
  };

  const handleMoveAction = async (index: number, direction: 'UP' | 'DOWN') => {
    const targetIndex = direction === 'UP' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= siteDefaultActions.length) return;

    const currentItem = siteDefaultActions[index];
    const targetItem = siteDefaultActions[targetIndex];

    const currentOrder = currentItem.order;
    const targetOrder = targetItem.order;

    await onSavePageAction({
      id: currentItem.id,
      scope: 'SITE_DEFAULT',
      site_id: currentSite.id,
      order: targetOrder
    });

    await onSavePageAction({
      id: targetItem.id,
      scope: 'SITE_DEFAULT',
      site_id: currentSite.id,
      order: currentOrder
    });
  };

  const handleToggleActionActive = async (action: PageAction) => {
    await onSavePageAction({
      id: action.id,
      scope: 'SITE_DEFAULT',
      site_id: currentSite.id,
      active: !action.active
    });
  };

  const getActionTypeLabel = (type: PageActionType) => {
    switch (type) {
      case 'WAIT':
        return { label: 'توقف زمانی (WAIT)', icon: Clock, color: 'bg-amber-50 text-amber-800 border-amber-200' };
      case 'CLICK':
        return { label: 'کلیک روی عنصر (CLICK)', icon: MousePointer, color: 'bg-blue-50 text-blue-800 border-blue-200' };
      case 'SCROLL':
        return { label: 'اسکرول صفحه (SCROLL)', icon: Scroll, color: 'bg-indigo-50 text-indigo-800 border-indigo-200' };
      case 'SCROLL_TO':
        return { label: 'اسکرول به عنصر (SCROLL_TO)', icon: Scroll, color: 'bg-purple-50 text-purple-800 border-purple-200' };
      case 'WAIT_FOR_ELEMENT':
        return { label: 'انتظار برای عنصر (WAIT_FOR_ELEMENT)', icon: Eye, color: 'bg-emerald-50 text-emerald-800 border-emerald-200' };
      default:
        return { label: type, icon: Clock, color: 'bg-gray-50 text-gray-800 border-gray-200' };
    }
  };

  return (
    <div className="space-y-6">
      {/* Site Tabs & Management Bar */}
      <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
          <span className="text-xs font-bold text-gray-500 ml-2">سایت رقیب:</span>
          {sites.map((site) => (
            <button
              key={site.id}
              onClick={() => setSelectedSiteId(site.id)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                selectedSiteId === site.id
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {site.name}
            </button>
          ))}
        </div>

        <button
          onClick={handleOpenAddSite}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-md transition-colors whitespace-nowrap self-start md:self-auto"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>افزودن سایت رقیب جدید</span>
        </button>
      </div>

      {currentSite && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Site Overview Card */}
          <div className="bg-white p-5 rounded-lg border border-gray-200 shadow-xs h-fit space-y-4">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div>
                <h3 className="text-sm font-bold text-gray-900">{currentSite.name}</h3>
                <a
                  href={currentSite.base_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-slate-600 hover:underline dir-ltr text-right block mt-0.5"
                >
                  {currentSite.base_url}
                </a>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => {
                    setEditingSite({ ...currentSite });
                    setIsSiteModalOpen(true);
                  }}
                  className="p-1.5 text-gray-400 hover:text-gray-700 rounded hover:bg-gray-100 transition-colors"
                  title="ویرایش اطلاعات سایت"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
                {onDeleteSite && (
                  <button
                    onClick={() => setDeletingSite(currentSite)}
                    className="p-1.5 text-gray-400 hover:text-rose-600 rounded hover:bg-rose-50 transition-colors"
                    title="حذف سایت رقیب"
                  >
                    <Trash2 className="w-4 h-4 text-rose-500" />
                  </button>
                )}
              </div>
            </div>

            <div className="text-xs space-y-2.5 text-gray-600">
              <div className="flex justify-between py-1 border-b border-gray-50 items-center">
                <span>روش جمع‌آوری داده:</span>
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold border ${
                    currentSite.scrape_method === 'PLAYWRIGHT'
                      ? 'bg-purple-100 text-purple-800 border-purple-200'
                      : 'bg-blue-100 text-blue-800 border-blue-200'
                  }`}
                >
                  {currentSite.scrape_method === 'PLAYWRIGHT' ? 'Playwright (مرورگر زنده)' : 'FETCH (درخواست HTTP)'}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-gray-50">
                <span>مهلت بارگذاری صفحه (Timeout):</span>
                <span className="font-semibold text-gray-900 font-mono">{currentSite.timeout} ثانیه</span>
              </div>
              <div className="flex justify-between py-1 border-b border-gray-50">
                <span>تأخیر بعد از بارگذاری:</span>
                <span className="font-semibold text-gray-900 font-mono">{currentSite.wait_after_load} میلی‌ثانیه</span>
              </div>
              <div className="flex justify-between py-1 border-b border-gray-50">
                <span>وضعیت سایت:</span>
                <span className={`font-semibold ${currentSite.active ? 'text-emerald-700' : 'text-gray-500'}`}>
                  {currentSite.active ? 'فعال در پایش' : 'غیرفعال'}
                </span>
              </div>
            </div>

            <div className="p-3 bg-slate-50 rounded-md border border-gray-100 text-[11px] text-gray-500 leading-relaxed">
              <p>
                <strong>راهنما:</strong> URLهای استخراج و سلکتورهای هر جدول مستقیماً در بخش «جداول قیمت» مدیریت می‌شوند. دستورات زیر، شبیه‌سازی‌های پیش‌فرض قبل از استخراج برای تمام صفحات این سایت هستند.
              </p>
            </div>
          </div>

          {/* Site Default Page Actions Section */}
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-white rounded-lg border border-gray-200 shadow-xs overflow-hidden">
              <div className="p-4 border-b border-gray-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/70">
                <div>
                  <div className="flex items-center gap-2">
                    <Layers className="w-4 h-4 text-slate-800" />
                    <h3 className="text-sm font-bold text-gray-900">
                      دستورات پیش‌فرض قبل از استخراج ({currentSite.name})
                    </h3>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    این دستورات در تمامی منابع متصل به این سایت اجرا می‌شوند (مگر آنکه منبع جدول، دستورات اختصاصی تعریف کرده باشد).
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleOpenAddAction}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-md transition-colors shadow-xs whitespace-nowrap self-start sm:self-auto"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>افزودن دستور پیش‌فرض</span>
                </button>
              </div>

              {/* Actions List */}
              <div className="p-4">
                {siteDefaultActions.length === 0 ? (
                  <div className="p-8 text-center text-xs text-gray-400 border border-dashed border-gray-200 rounded-lg">
                    هیچ دستور پیش‌فرضی برای این سایت تعریف نشده است.
                    <br />
                    در صورت نیاز (مثلاً کلیک روی تب قیمت‌ها، اسکرول یا انتظار)، روی دکمه «افزودن دستور پیش‌فرض» کلیک کنید.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {siteDefaultActions.map((action, index) => {
                      const typeInfo = getActionTypeLabel(action.action_type);
                      const Icon = typeInfo.icon;

                      return (
                        <div
                          key={action.id}
                          className={`flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-lg border transition-colors gap-3 ${
                            action.active
                              ? 'bg-white border-gray-200 hover:border-gray-300'
                              : 'bg-gray-50 border-gray-200 opacity-60'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            {/* Reorder Buttons */}
                            <div className="flex flex-col gap-0.5">
                              <button
                                type="button"
                                disabled={index === 0}
                                onClick={() => handleMoveAction(index, 'UP')}
                                className="p-0.5 text-gray-400 hover:text-slate-900 disabled:opacity-20 rounded"
                                title="انتقال به بالا"
                              >
                                <MoveUp className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                disabled={index === siteDefaultActions.length - 1}
                                onClick={() => handleMoveAction(index, 'DOWN')}
                                className="p-0.5 text-gray-400 hover:text-slate-900 disabled:opacity-20 rounded"
                                title="انتقال به پایین"
                              >
                                <MoveDown className="w-3.5 h-3.5" />
                              </button>
                            </div>

                            <span className="w-6 h-6 rounded-full bg-slate-100 text-slate-700 font-mono text-xs flex items-center justify-center font-bold">
                              {index + 1}
                            </span>

                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span
                                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold border ${typeInfo.color}`}
                                >
                                  <Icon className="w-3 h-3" />
                                  <span>{typeInfo.label}</span>
                                </span>

                                {!action.active && (
                                  <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
                                    غیرفعال
                                  </span>
                                )}
                              </div>

                              <div className="flex items-center gap-3 text-xs text-gray-600 font-mono dir-ltr text-right">
                                {action.selector && (
                                  <span className="bg-gray-50 px-2 py-0.5 rounded border border-gray-200 text-slate-800">
                                    {action.selector}
                                  </span>
                                )}
                                {action.value && (
                                  <span className="text-gray-500 font-sans">
                                    مقدار / زمان: <strong className="font-mono text-gray-800">{action.value}</strong>
                                    {action.action_type === 'WAIT' && ' ms'}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Action controls */}
                          <div className="flex items-center gap-2 self-end sm:self-auto">
                            <button
                              type="button"
                              onClick={() => handleToggleActionActive(action)}
                              className={`px-2 py-1 text-[11px] rounded font-medium border transition-colors ${
                                action.active
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                                  : 'bg-gray-100 text-gray-600 border-gray-200 hover:bg-gray-200'
                              }`}
                            >
                              {action.active ? 'فعال' : 'غیرفعال'}
                            </button>

                            <button
                              type="button"
                              onClick={() => handleOpenEditAction(action)}
                              className="p-1.5 text-gray-500 hover:text-slate-900 border border-gray-200 rounded hover:bg-gray-50 transition-colors"
                              title="ویرایش دستور"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>

                            <button
                              type="button"
                              onClick={() => onDeletePageAction(action.id)}
                              className="p-1.5 text-rose-500 hover:text-rose-700 border border-rose-100 rounded hover:bg-rose-50 transition-colors"
                              title="حذف دستور"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Site Add / Edit Modal */}
      {isSiteModalOpen && editingSite && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6 space-y-4">
            <h3 className="text-sm font-bold text-gray-900 border-b border-gray-100 pb-3">
              {editingSite.id ? 'ویرایش سایت رقیب' : 'افزودن سایت رقیب جدید'}
            </h3>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                await onSaveSite(editingSite);
                setIsSiteModalOpen(false);
              }}
              className="space-y-4 text-xs"
            >
              <div>
                <label className="block text-gray-700 font-semibold mb-1">
                  نام سایت <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={editingSite.name || ''}
                  onChange={(e) => setEditingSite({ ...editingSite, name: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded focus:bg-white focus:outline-none focus:border-slate-800"
                  placeholder="مثال: آهن آنلاین"
                />
              </div>

              <div>
                <label className="block text-gray-700 font-semibold mb-1">
                  آدرس اصلی (Base URL) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="url"
                  required
                  value={editingSite.base_url || ''}
                  onChange={(e) => setEditingSite({ ...editingSite, base_url: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded focus:bg-white focus:outline-none focus:border-slate-800 dir-ltr text-right"
                  placeholder="https://example.com"
                />
              </div>

              <div>
                <label className="block text-gray-700 font-semibold mb-1">
                  روش جمع‌آوری داده (Scrape Method) <span className="text-rose-500">*</span>
                </label>
                <select
                  value={editingSite.scrape_method || 'PLAYWRIGHT'}
                  onChange={(e) =>
                    setEditingSite({ ...editingSite, scrape_method: e.target.value as 'FETCH' | 'PLAYWRIGHT' })
                  }
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded focus:bg-white focus:outline-none focus:border-slate-800"
                >
                  <option value="PLAYWRIGHT">Playwright (مرورگر زنده - مناسب سایت‌های جاوااسکریپتی)</option>
                  <option value="FETCH">FETCH (درخواست سریع HTTP - فقط سایت‌های بدون جاوااسکریپت پویا)</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-gray-700 font-semibold mb-1">مهلت بارگذاری (Timeout ثانیه)</label>
                  <input
                    type="number"
                    min="5"
                    max="120"
                    value={editingSite.timeout || 30}
                    onChange={(e) => setEditingSite({ ...editingSite, timeout: parseInt(e.target.value, 10) })}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded focus:bg-white focus:outline-none focus:border-slate-800"
                  />
                </div>

                <div>
                  <label className="block text-gray-700 font-semibold mb-1">تأخیر بعد لود (میلی‌ثانیه)</label>
                  <input
                    type="number"
                    min="0"
                    step="100"
                    value={editingSite.wait_after_load ?? 1000}
                    onChange={(e) => setEditingSite({ ...editingSite, wait_after_load: parseInt(e.target.value, 10) })}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded focus:bg-white focus:outline-none focus:border-slate-800"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="site-active-toggle"
                  checked={editingSite.active ?? true}
                  onChange={(e) => setEditingSite({ ...editingSite, active: e.target.checked })}
                  className="rounded border-gray-300 text-slate-800 focus:ring-slate-800"
                />
                <label htmlFor="site-active-toggle" className="text-gray-700 font-medium">
                  این سایت در فرآیندهای استخراج خودکار فعال باشد
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setIsSiteModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-gray-600 hover:text-gray-800"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded transition-colors"
                >
                  ذخیره اطلاعات سایت
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Default Page Action Add / Edit Modal */}
      {isActionModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6 space-y-4">
            <h3 className="text-sm font-bold text-gray-900 border-b border-gray-100 pb-3">
              {editingActionId ? 'ویرایش دستور پیش‌فرض قبل از استخراج' : 'افزودن دستور پیش‌فرض جدید برای سایت'}
            </h3>

            <form onSubmit={handleSaveAction} className="space-y-4 text-xs">
              <div>
                <label className="block text-gray-700 font-semibold mb-1">
                  نوع دستور (Action Type) <span className="text-rose-500">*</span>
                </label>
                <select
                  value={actionForm.action_type}
                  onChange={(e) =>
                    setActionForm({ ...actionForm, action_type: e.target.value as PageActionType })
                  }
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded focus:bg-white focus:outline-none focus:border-slate-800"
                >
                  <option value="WAIT">توقف زمانی (WAIT) - برحسب میلی‌ثانیه</option>
                  <option value="CLICK">کلیک روی عنصر (CLICK)</option>
                  <option value="SCROLL">اسکرول صفحه (SCROLL)</option>
                  <option value="SCROLL_TO">اسکرول به عنصر خاص (SCROLL_TO)</option>
                  <option value="WAIT_FOR_ELEMENT">انتظار برای ظاهر شدن عنصر (WAIT_FOR_ELEMENT)</option>
                </select>
              </div>

              {(actionForm.action_type === 'CLICK' ||
                actionForm.action_type === 'WAIT_FOR_ELEMENT' ||
                actionForm.action_type === 'SCROLL_TO') && (
                <div>
                  <label className="block text-gray-700 font-semibold mb-1">
                    سلکتور عنصر (XPath یا CSS Selector) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={actionForm.selector}
                    onChange={(e) => setActionForm({ ...actionForm, selector: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded focus:bg-white focus:outline-none focus:border-slate-800 font-mono text-[11px] dir-ltr text-right"
                    placeholder="//button[@id='show-price-tab'] یا #price-tab"
                  />
                </div>
              )}

              <div>
                <label className="block text-gray-700 font-semibold mb-1">
                  {actionForm.action_type === 'WAIT'
                    ? 'مدت زمان انتظار (میلی‌ثانیه)'
                    : actionForm.action_type === 'WAIT_FOR_ELEMENT'
                    ? 'حداکثر زمان انتظار (میلی‌ثانیه - اختیاری)'
                    : actionForm.action_type === 'SCROLL'
                    ? 'مقدار اسکرول (پیکسل یا پایین صفحه: 500)'
                    : 'مقدار یا پارامتر کمکی (اختیاری)'}
                </label>
                <input
                  type="text"
                  value={actionForm.value}
                  onChange={(e) => setActionForm({ ...actionForm, value: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded focus:bg-white focus:outline-none focus:border-slate-800 font-mono text-[11px] dir-ltr text-right"
                  placeholder={actionForm.action_type === 'WAIT' ? '1500' : ''}
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="action-active-toggle"
                  checked={actionForm.active}
                  onChange={(e) => setActionForm({ ...actionForm, active: e.target.checked })}
                  className="rounded border-gray-300 text-slate-800 focus:ring-slate-800"
                />
                <label htmlFor="action-active-toggle" className="text-gray-700 font-medium">
                  این دستور در فرآیند استخراج فعال باشد
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setIsActionModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-gray-600 hover:text-gray-800"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingAction}
                  className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-50 rounded transition-colors"
                >
                  {isSubmittingAction ? 'در حال ذخیره...' : 'ذخیره دستور'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Delete Site Confirmation Modal */}
      {deletingSite && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl border border-gray-200 w-full max-w-md p-6 animate-in fade-in zoom-in-95 duration-150 space-y-4">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="p-2.5 bg-rose-50 rounded-full">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-gray-900">تأیید حذف سایت رقیب</h3>
                <p className="text-xs text-gray-500 mt-0.5">عملیات حذف وابسته (Cascade Delete)</p>
              </div>
            </div>

            <div className="p-3 bg-gray-50 rounded-lg border border-gray-200 text-xs text-gray-700 space-y-1">
              <p>
                آیا از حذف سایت <strong>«{deletingSite.name}»</strong> ({deletingSite.base_url}) اطمینان دارید؟
              </p>
              <p className="text-[11px] text-rose-700 font-medium pt-1">
                ⚠️ هشدار: با حذف سایت، تمام منابع جدول و دستورات استخراج مرتبط با این سایت نیز حذف خواهند شد!
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setDeletingSite(null)}
                className="px-4 py-2 text-xs font-medium text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
              >
                انصراف
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={async () => {
                  if (!onDeleteSite || !deletingSite) return;
                  setIsDeleting(true);
                  try {
                    const remaining = sites.filter((s) => s.id !== deletingSite.id);
                    await onDeleteSite(deletingSite.id);
                    if (remaining.length > 0) {
                      setSelectedSiteId(remaining[0].id);
                    }
                    setDeletingSite(null);
                  } finally {
                    setIsDeleting(false);
                  }
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-50 rounded-md transition-colors shadow-xs"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{isDeleting ? 'در حال حذف...' : 'حذف قطعی سایت'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

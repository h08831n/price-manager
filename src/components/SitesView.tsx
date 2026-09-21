import React, { useState } from 'react';
import {
  Globe,
  Plus,
  Edit2,
  MousePointerClick,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Layers,
  CheckCircle2,
  Trash2
} from 'lucide-react';
import { Site, SourcePage, PageAction } from '../types';

interface SitesViewProps {
  sites: Site[];
  sourcePages: SourcePage[];
  pageActions: PageAction[];
  onSaveSite: (site: Partial<Site>) => Promise<void>;
  onSaveSourcePage: (page: Partial<SourcePage>) => Promise<void>;
  onSavePageAction: (action: Partial<PageAction>) => Promise<void>;
  onDeletePageAction: (id: number) => Promise<void>;
  onOpenPicker: (url: string) => void;
}

export const SitesView: React.FC<SitesViewProps> = ({
  sites,
  sourcePages,
  pageActions,
  onSaveSite,
  onSaveSourcePage,
  onSavePageAction,
  onDeletePageAction,
  onOpenPicker
}) => {
  const [selectedSiteId, setSelectedSiteId] = useState<number>(sites[0]?.id || 1);
  const [isSiteModalOpen, setIsSiteModalOpen] = useState(false);
  const [editingSite, setEditingSite] = useState<Partial<Site> | null>(null);

  // New Source Page Modal
  const [isPageModalOpen, setIsPageModalOpen] = useState(false);
  const [newPageUrl, setNewPageUrl] = useState('');

  // Page Action Add Form state
  const [selectedPageForActions, setSelectedPageForActions] = useState<number | null>(null);
  const [newActionType, setNewActionType] = useState<string>('WAIT');
  const [newActionSelector, setNewActionSelector] = useState('');
  const [newActionValue, setNewActionValue] = useState('');

  const currentSite = sites.find((s) => s.id === selectedSiteId) || sites[0];
  const sitePages = sourcePages.filter((p) => p.site_id === currentSite?.id);

  const handleOpenAddSite = () => {
    setEditingSite({
      name: '',
      base_url: '',
      scrape_method: 'FETCH',
      browser: 'Chromium',
      timeout: 30,
      wait_after_load: 1000,
      active: true
    });
    setIsSiteModalOpen(true);
  };

  const handleAddPageAction = async (pageId: number) => {
    const existingActions = pageActions.filter((a) => a.source_page_id === pageId);
    await onSavePageAction({
      source_page_id: pageId,
      order: existingActions.length + 1,
      action_type: newActionType as any,
      selector: newActionSelector,
      value: newActionValue,
      active: true
    });
    setNewActionSelector('');
    setNewActionValue('');
  };

  const handleAddSourcePage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentSite || !newPageUrl.trim()) return;
    await onSaveSourcePage({
      site_id: currentSite.id,
      url: newPageUrl.trim(),
      active: true
    });
    setNewPageUrl('');
    setIsPageModalOpen(false);
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
              <button
                onClick={() => {
                  setEditingSite({ ...currentSite });
                  setIsSiteModalOpen(true);
                }}
                className="p-1.5 text-gray-400 hover:text-gray-700 rounded hover:bg-gray-100"
              >
                <Edit2 className="w-4 h-4" />
              </button>
            </div>

            <div className="text-xs space-y-2 text-gray-600">
              <div className="flex justify-between py-1 border-b border-gray-50 items-center">
                <span>روش جمع‌آوری داده:</span>
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold ${
                    currentSite.scrape_method === 'PLAYWRIGHT'
                      ? 'bg-purple-100 text-purple-800 border border-purple-200'
                      : 'bg-blue-100 text-blue-800 border border-blue-200'
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

            <div className="pt-2">
              <button
                onClick={() => setIsPageModalOpen(true)}
                className="w-full py-2 text-xs font-medium text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors flex items-center justify-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>ثبت آدرس صفحه (URL) جدید</span>
              </button>
            </div>
          </div>

          {/* Source Pages & Page Actions (Requirement #10, #16) */}
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-white rounded-lg border border-gray-200 shadow-xs overflow-hidden">
              <div className="p-4 border-b border-gray-200 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-slate-700" />
                  <h3 className="text-sm font-bold text-gray-900">صفحات هدف و دستورات شبیه‌سازی مرورگر (Page Actions)</h3>
                </div>
              </div>

              <div className="divide-y divide-gray-100">
                {sitePages.length === 0 ? (
                  <div className="p-6 text-center text-xs text-gray-400">
                    هنوز صفحه‌ای برای این سایت ثبت نشده است.
                  </div>
                ) : (
                  sitePages.map((page) => {
                    const actions = pageActions
                      .filter((a) => a.source_page_id === page.id)
                      .sort((a, b) => a.order - b.order);
                    const isExpanded = selectedPageForActions === page.id;

                    return (
                      <div key={page.id} className="p-4 space-y-3">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div className="dir-ltr text-right max-w-lg truncate">
                            <span className="font-mono text-xs font-medium text-slate-800 bg-gray-50 px-2 py-1 rounded border border-gray-200">
                              {page.url}
                            </span>
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => onOpenPicker(page.url)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-800 bg-white border border-gray-300 rounded hover:bg-gray-50 transition-colors shadow-xs"
                              title="باز کردن صفحه در محیط انتخابگر تعاملی XPath"
                            >
                              <MousePointerClick className="w-3.5 h-3.5" />
                              <span>انتخاب با موس (Picker)</span>
                            </button>

                            <button
                              onClick={() => setSelectedPageForActions(isExpanded ? null : page.id)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded transition-colors"
                            >
                              <span>دستورات کلیک/اسکرول ({actions.length})</span>
                              {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                            </button>
                          </div>
                        </div>

                        {/* Expandable Page Actions Editor */}
                        {isExpanded && (
                          <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 space-y-3 mt-2 text-xs">
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-gray-700">ترتیب دستورات قبل از استخراج اطلاعات:</span>
                              <span className="text-gray-400">مثال: باز کردن تب قیمت‌ها یا اسکرول برای بارگذاری تنبل</span>
                            </div>

                            {/* Actions List */}
                            <div className="space-y-1.5">
                              {actions.length === 0 ? (
                                <p className="text-gray-400 py-1">هیچ دستوری تعریف نشده است (صفحه به صورت ساده بارگذاری می‌شود).</p>
                              ) : (
                                actions.map((act, idx) => (
                                  <div
                                    key={act.id}
                                    className="flex items-center justify-between bg-white p-2 rounded border border-gray-200"
                                  >
                                    <div className="flex items-center gap-2">
                                      <span className="w-5 h-5 rounded-full bg-slate-900 text-white text-[10px] font-bold flex items-center justify-center">
                                        {idx + 1}
                                      </span>
                                      <span className="font-mono font-bold text-slate-800 text-[11px] px-1.5 py-0.5 bg-slate-100 rounded">
                                        {act.action_type}
                                      </span>
                                      {act.selector && (
                                        <span className="font-mono text-[11px] text-gray-600 dir-ltr">
                                          {act.selector}
                                        </span>
                                      )}
                                      {act.value && (
                                        <span className="text-gray-500 text-[11px]">
                                          (مقدار: {act.value})
                                        </span>
                                      )}
                                    </div>

                                    <button
                                      onClick={() => onDeletePageAction(act.id)}
                                      className="text-gray-400 hover:text-rose-600 p-1"
                                      title="حذف دستور"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                ))
                              )}
                            </div>

                            {/* Add Action Row */}
                            <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-gray-200">
                              <select
                                value={newActionType}
                                onChange={(e) => setNewActionType(e.target.value)}
                                className="bg-white border border-gray-300 rounded px-2 py-1 text-xs"
                              >
                                <option value="WAIT">WAIT (انتظار زمانی)</option>
                                <option value="CLICK">CLICK (کلیک روی دکمه/تب)</option>
                                <option value="SCROLL">SCROLL (اسکرول به پایین)</option>
                                <option value="SCROLL_TO">SCROLL_TO (اسکرول به المان)</option>
                                <option value="WAIT_FOR_ELEMENT">WAIT_FOR_ELEMENT (انتظار برای المان)</option>
                              </select>

                              {newActionType !== 'SCROLL' && newActionType !== 'WAIT' && (
                                <input
                                  type="text"
                                  placeholder="سلکتور XPath یا CSS"
                                  value={newActionSelector}
                                  onChange={(e) => setNewActionSelector(e.target.value)}
                                  className="bg-white border border-gray-300 rounded px-2 py-1 text-xs flex-1 dir-ltr text-right font-mono"
                                />
                              )}

                              {(newActionType === 'WAIT' || newActionType === 'SCROLL') && (
                                <input
                                  type="text"
                                  placeholder={newActionType === 'WAIT' ? 'مدت به میلی‌ثانیه (مثلا 2000)' : 'میزان اسکرول به پیکسل (مثلا 500)'}
                                  value={newActionValue}
                                  onChange={(e) => setNewActionValue(e.target.value)}
                                  className="bg-white border border-gray-300 rounded px-2 py-1 text-xs font-mono"
                                />
                              )}

                              <button
                                onClick={() => handleAddPageAction(page.id)}
                                className="px-3 py-1 bg-slate-900 text-white rounded text-xs hover:bg-slate-800 transition-colors"
                              >
                                ثبت دستور
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add / Edit Site Modal */}
      {isSiteModalOpen && editingSite && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl border border-gray-200 w-full max-w-md p-6 animate-in fade-in zoom-in-95 duration-150">
            <h3 className="text-sm font-bold text-gray-900 mb-4">
              {editingSite.id ? 'ویرایش اطلاعات سایت' : 'افزودن سایت رقیب جدید'}
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
                <label className="block text-gray-700 font-medium mb-1">
                  نام سایت رقیب <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="مثال: آهن آنلاین"
                  value={editingSite.name || ''}
                  onChange={(e) => setEditingSite({ ...editingSite, name: e.target.value })}
                  className="w-full px-3 py-1.5 bg-gray-50 border border-gray-200 rounded focus:bg-white focus:outline-none focus:border-slate-800"
                />
              </div>

              <div>
                <label className="block text-gray-700 font-medium mb-1">
                  آدرس پایه سایت (Base URL) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="url"
                  required
                  placeholder="https://example.com"
                  value={editingSite.base_url || ''}
                  onChange={(e) => setEditingSite({ ...editingSite, base_url: e.target.value })}
                  className="w-full px-3 py-1.5 bg-gray-50 border border-gray-200 rounded focus:bg-white focus:outline-none focus:border-slate-800 dir-ltr text-right font-mono"
                />
              </div>

              <div>
                <label className="block text-gray-700 font-medium mb-1">
                  روش جمع‌آوری و رندر صفحات (Scrape Method) <span className="text-rose-500">*</span>
                </label>
                <select
                  value={editingSite.scrape_method || 'FETCH'}
                  onChange={(e) => setEditingSite({ ...editingSite, scrape_method: e.target.value as any })}
                  className="w-full px-3 py-1.5 bg-gray-50 border border-gray-200 rounded focus:bg-white focus:outline-none focus:border-slate-800 font-medium text-xs"
                >
                  <option value="FETCH">FETCH (سبک و سریع - مناسب صفحات ساده بدون جاوااسکریپت سنگین)</option>
                  <option value="PLAYWRIGHT">PLAYWRIGHT (مرورگر واقعی Headless Chromium - رندر کامل JS، کلیک و اسکرول)</option>
                </select>
                <p className="text-[11px] text-gray-500 mt-1">
                  {editingSite.scrape_method === 'PLAYWRIGHT'
                    ? 'از مرورگر واقعی Chromium برای اجرای کدهای جاوااسکریپت صفحه و اجرای کامل اکشن‌های کلیک و اسکرول استفاده می‌شود.'
                    : 'از درخواست استاندارد HTTP Fetch استفاده می‌شود که بسیار سریع و کم‌مصرف است (دستورات کلیک/اسکرول تعاملی در این حالت شبیه‌سازی نمی‌شوند).'}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-gray-700 font-medium mb-1">مهلت انتظار بارگذاری (ثانیه)</label>
                  <input
                    type="number"
                    value={editingSite.timeout || 30}
                    onChange={(e) => setEditingSite({ ...editingSite, timeout: parseInt(e.target.value, 10) })}
                    className="w-full px-3 py-1.5 bg-gray-50 border border-gray-200 rounded focus:bg-white focus:outline-none focus:border-slate-800 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-gray-700 font-medium mb-1">تأخیر بعد از بارگذاری (ms)</label>
                  <input
                    type="number"
                    value={editingSite.wait_after_load || 1000}
                    onChange={(e) =>
                      setEditingSite({ ...editingSite, wait_after_load: parseInt(e.target.value, 10) })
                    }
                    className="w-full px-3 py-1.5 bg-gray-50 border border-gray-200 rounded focus:bg-white focus:outline-none focus:border-slate-800 font-mono"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="site-active"
                  checked={editingSite.active ?? true}
                  onChange={(e) => setEditingSite({ ...editingSite, active: e.target.checked })}
                  className="rounded text-slate-900 focus:ring-0"
                />
                <label htmlFor="site-active" className="text-gray-700 font-medium cursor-pointer">
                  سایت فعال باشد و در پایش شرکت داده شود
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => setIsSiteModalOpen(false)}
                  className="px-4 py-1.5 text-xs text-gray-700 hover:bg-gray-100 rounded transition-colors"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded transition-colors"
                >
                  ذخیره سایت
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Source Page Modal */}
      {isPageModalOpen && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl border border-gray-200 w-full max-w-lg p-6 animate-in fade-in zoom-in-95 duration-150">
            <h3 className="text-sm font-bold text-gray-900 mb-4">ثبت آدرس صفحه (URL) منبع در سایت {currentSite.name}</h3>

            <form onSubmit={handleAddSourcePage} className="space-y-4 text-xs">
              <div>
                <label className="block text-gray-700 font-medium mb-1">
                  آدرس دقیق صفحه وب (Full URL) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="url"
                  required
                  placeholder="https://example.com/rebar-prices"
                  value={newPageUrl}
                  onChange={(e) => setNewPageUrl(e.target.value)}
                  className="w-full px-3 py-1.5 bg-gray-50 border border-gray-200 rounded focus:bg-white focus:outline-none focus:border-slate-800 dir-ltr text-right font-mono"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => setIsPageModalOpen(false)}
                  className="px-4 py-1.5 text-xs text-gray-700 hover:bg-gray-100 rounded transition-colors"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded transition-colors"
                >
                  افزودن صفحه
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

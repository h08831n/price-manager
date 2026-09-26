import React, { useState } from 'react';
import {
  ArrowRight,
  Play,
  Globe,
  Plus,
  Edit2,
  Trash2,
  X,
  Check,
  Sliders,
  ChevronDown,
  ChevronUp,
  MousePointerClick,
  Code,
  Layers,
  Clock,
  MousePointer,
  Scroll,
  Eye,
  RotateCcw,
  CheckCircle2,
  ExternalLink,
  MoveUp,
  MoveDown,
  AlertTriangle
} from 'lucide-react';
import {
  PriceTable,
  TableSource,
  Product,
  ProductSelector,
  TableRevision,
  TableRevisionItem,
  Site,
  Factory,
  PageAction,
  PageActionType
} from '../types';

interface PriceTableDetailViewProps {
  table: PriceTable;
  sources: TableSource[];
  products: Product[];
  selectors?: ProductSelector[];
  revisions: TableRevision[];
  revisionItems: TableRevisionItem[];
  sites?: Site[];
  pageActions?: PageAction[];
  factories?: Factory[];
  onBack: () => void;
  onRunTable: (tableId: number) => Promise<void>;
  onRunSource: (sourceId: number) => Promise<void>;
  onSaveTable?: (table: Partial<PriceTable>) => Promise<void>;
  onDeleteTable?: (tableId: number) => Promise<void>;
  onSaveTableSource?: (data: Partial<TableSource> & { url?: string; new_url?: string }) => Promise<void>;
  onDeleteTableSource?: (id: number) => Promise<void>;
  onSaveSelector?: (tableSourceId: number, productId: number, data: { price_xpath?: string; update_time_xpath?: string; active?: boolean }) => Promise<void>;
  onSavePageAction?: (action: Partial<PageAction>) => Promise<void>;
  onDeletePageAction?: (id: number) => Promise<void>;
  onClearTableSourceActions?: (tableSourceId: number) => Promise<void>;
  onOpenPicker: (url: string, sourceId?: number, onSelect?: (xpath: string) => void, target?: 'TABLE_UPDATE' | 'PRODUCT_UPDATE' | 'PRODUCT_PRICE') => void;
  onOpenTester: (sourceId: number, url: string, xpath?: string, type?: 'PRICE' | 'DATE') => void;
  onRetryPublish: (revisionId: number) => Promise<void>;
}

export const PriceTableDetailView: React.FC<PriceTableDetailViewProps> = ({
  table,
  sources,
  products,
  selectors = [],
  revisions,
  revisionItems,
  sites = [],
  pageActions = [],
  factories = [],
  onBack,
  onRunTable,
  onRunSource,
  onSaveTable,
  onDeleteTable,
  onSaveTableSource,
  onDeleteTableSource,
  onSaveSelector,
  onSavePageAction,
  onDeletePageAction,
  onClearTableSourceActions,
  onOpenPicker,
  onOpenTester,
  onRetryPublish
}) => {
  const [activeTab, setActiveTab] = useState<'sources' | 'settings'>('sources');
  const [isRunning, setIsRunning] = useState(false);
  const [runningSourceId, setRunningSourceId] = useState<number | null>(null);
  const [isDeleteTableModalOpen, setIsDeleteTableModalOpen] = useState(false);
  const [isDeletingTable, setIsDeletingTable] = useState(false);

  // General Table Settings state
  const [tableSettings, setTableSettings] = useState({
    name: table.name,
    factory_id: table.factory_id,
    start_time: table.start_time || '11:00',
    retry_interval_minutes: table.retry_interval_minutes || 30,
    max_attempts: table.max_attempts || 5,
    price_guard_percent: table.price_guard_percent || 30,
    active: table.active ?? true
  });
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsSavedSuccess, setSettingsSavedSuccess] = useState(false);

  // New TableSource Modal state
  const [isAddSourceModalOpen, setIsAddSourceModalOpen] = useState(false);
  const [newSourceForm, setNewSourceForm] = useState({
    site_id: sites[0]?.id || 1,
    url: '',
    update_time_xpath: '',
    recheck_enabled: true,
    active: true,
    max_attempts_override: '',
    retry_interval_override: '',
    timeout_override: '',
    price_guard_override: ''
  });
  const [isSubmittingNewSource, setIsSubmittingNewSource] = useState(false);

  // Edit Source Settings Modal state
  const [editingSourceSettings, setEditingSourceSettings] = useState<TableSource | null>(null);

  // Inline inputs state for each TableSource
  const [sourceSites, setSourceSites] = useState<Record<number, number>>({});
  const [sourceUrls, setSourceUrls] = useState<Record<number, string>>({});
  const [sourceUpdateXPaths, setSourceUpdateXPaths] = useState<Record<number, string>>({});
  const [savingSourceId, setSavingSourceId] = useState<number | null>(null);

  // Expanded states for accordions
  const [expandedProducts, setExpandedProducts] = useState<Record<number, boolean>>({});
  const [expandedActions, setExpandedActions] = useState<Record<number, boolean>>({});

  // Product Selector inline edits: Record<`sourceId_productId`, { price_xpath: string; update_time_xpath: string }>
  const [editingSelectors, setEditingSelectors] = useState<Record<string, { price_xpath: string; update_time_xpath: string }>>({});
  const [savingSelectorKey, setSavingSelectorKey] = useState<string | null>(null);
  const [savedSelectorKey, setSavedSelectorKey] = useState<string | null>(null);

  // Page Action Add / Edit Modal state for TableSource
  const [actionModal, setActionModal] = useState<{
    isOpen: boolean;
    sourceId: number | null;
    actionId: number | null;
    action_type: PageActionType;
    selector: string;
    value: string;
    active: boolean;
  }>({
    isOpen: false,
    sourceId: null,
    actionId: null,
    action_type: 'WAIT',
    selector: '',
    value: '1000',
    active: true
  });
  const [isSubmittingAction, setIsSubmittingAction] = useState(false);

  // Modals for deleting a TableSource and reverting actions to site defaults
  const [deletingSource, setDeletingSource] = useState<TableSource | null>(null);
  const [isDeletingSource, setIsDeletingSource] = useState(false);
  const [revertingSourceId, setRevertingSourceId] = useState<number | null>(null);
  const [isRevertingSource, setIsRevertingSource] = useState(false);
  const [addSourceError, setAddSourceError] = useState<string | null>(null);

  const tableSources = sources.filter((s) => s.price_table_id === table.id);
  const tableProducts = products.filter((p) => p.price_table_id === table.id);

  // Helpers for Source Page URLs, Sites, and Actions
  const getSourceSiteId = (source: TableSource): number => {
    if (sourceSites[source.id] !== undefined) return sourceSites[source.id];
    return source.site_id;
  };

  const getSourceUrl = (source: TableSource): string => {
    if (sourceUrls[source.id] !== undefined) return sourceUrls[source.id];
    return source.url || source.source_page_url || '';
  };

  const getSourceUpdateXPath = (source: TableSource): string => {
    if (sourceUpdateXPaths[source.id] !== undefined) return sourceUpdateXPaths[source.id];
    return source.update_time_xpath || '';
  };

  // Get override actions for a source
  const getSourceOverrideActions = (sourceId: number): PageAction[] => {
    return pageActions
      .filter((a) => a.scope === 'TABLE_SOURCE' && a.table_source_id === sourceId)
      .sort((a, b) => a.order - b.order);
  };

  // Get default actions for a site
  const getSiteDefaultActions = (siteId: number): PageAction[] => {
    return pageActions
      .filter(
        (a) =>
          (a.scope === 'SITE_DEFAULT' && a.site_id === siteId) ||
          (!a.scope && a.site_id === siteId && !a.table_source_id && !a.source_page_id)
      )
      .sort((a, b) => a.order - b.order);
  };

  const getSelectorForProduct = (sourceId: number, productId: number): ProductSelector | undefined => {
    return selectors.find((s) => s.table_source_id === sourceId && s.product_id === productId);
  };

  const getSelectorInputValues = (sourceId: number, productId: number) => {
    const key = `${sourceId}_${productId}`;
    if (editingSelectors[key]) return editingSelectors[key];
    const existing = getSelectorForProduct(sourceId, productId);
    return {
      price_xpath: existing?.price_xpath || '',
      update_time_xpath: existing?.update_time_xpath || ''
    };
  };

  const handleRunTable = async () => {
    setIsRunning(true);
    try {
      await onRunTable(table.id);
    } finally {
      setIsRunning(false);
    }
  };

  const handleRunSource = async (sourceId: number) => {
    setRunningSourceId(sourceId);
    try {
      await onRunSource(sourceId);
    } finally {
      setRunningSourceId(null);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onSaveTable) return;
    setSavingSettings(true);
    try {
      await onSaveTable({
        id: table.id,
        ...tableSettings
      });
      setSettingsSavedSuccess(true);
      setTimeout(() => setSettingsSavedSuccess(false), 3000);
    } finally {
      setSavingSettings(false);
    }
  };

  const handleSaveSourceInline = async (source: TableSource) => {
    if (!onSaveTableSource) return;
    setSavingSourceId(source.id);
    try {
      const siteIdVal = getSourceSiteId(source);
      const urlVal = getSourceUrl(source).trim();
      const xpathVal = getSourceUpdateXPath(source).trim();
      await onSaveTableSource({
        id: source.id,
        site_id: siteIdVal,
        url: urlVal,
        update_time_xpath: xpathVal
      });
    } finally {
      setSavingSourceId(null);
    }
  };

  // Helper to ensure source config is saved before launching Tester or Picker (Requirement #3)
  const ensureSourceSavedBeforeInspect = async (source: TableSource) => {
    const siteIdVal = getSourceSiteId(source);
    const urlVal = getSourceUrl(source).trim();
    const xpathVal = getSourceUpdateXPath(source).trim();

    const isDirty =
      siteIdVal !== source.site_id ||
      urlVal !== (source.url || source.source_page_url || '').trim() ||
      xpathVal !== (source.update_time_xpath || '').trim();

    if (isDirty && onSaveTableSource) {
      await handleSaveSourceInline(source);
    }
    return { siteIdVal, urlVal, xpathVal };
  };

  const handleOpenSourceTester = async (source: TableSource, xpathVal?: string, type: 'PRICE' | 'DATE' = 'DATE') => {
    const { urlVal } = await ensureSourceSavedBeforeInspect(source);
    onOpenTester(source.id, urlVal, xpathVal || undefined, type);
  };

  const handleOpenSourcePicker = async (
    source: TableSource,
    onSelect: (xpath: string) => void,
    target: 'TABLE_UPDATE' | 'PRODUCT_UPDATE' | 'PRODUCT_PRICE'
  ) => {
    const { urlVal } = await ensureSourceSavedBeforeInspect(source);
    onOpenPicker(urlVal, source.id, onSelect, target);
  };

  const handleDeleteSource = (source: TableSource) => {
    setDeletingSource(source);
  };

  const handleAddSourceSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onSaveTableSource) return;
    if (!newSourceForm.url.trim()) {
      setAddSourceError('لطفاً آدرس صفحه (URL) منبع را وارد نمایید.');
      return;
    }
    setAddSourceError(null);

    setIsSubmittingNewSource(true);
    try {
      await onSaveTableSource({
        price_table_id: table.id,
        site_id: newSourceForm.site_id,
        url: newSourceForm.url.trim(),
        update_time_xpath: newSourceForm.update_time_xpath.trim(),
        recheck_enabled: newSourceForm.recheck_enabled,
        active: newSourceForm.active,
        max_attempts_override: newSourceForm.max_attempts_override ? parseInt(newSourceForm.max_attempts_override, 10) : null,
        retry_interval_override: newSourceForm.retry_interval_override ? parseInt(newSourceForm.retry_interval_override, 10) : null,
        timeout_override: newSourceForm.timeout_override ? parseInt(newSourceForm.timeout_override, 10) : null,
        price_guard_override: newSourceForm.price_guard_override ? parseFloat(newSourceForm.price_guard_override) : null
      });
      setIsAddSourceModalOpen(false);
      setNewSourceForm({
        site_id: sites[0]?.id || 1,
        url: '',
        update_time_xpath: '',
        recheck_enabled: true,
        active: true,
        max_attempts_override: '',
        retry_interval_override: '',
        timeout_override: '',
        price_guard_override: ''
      });
    } finally {
      setIsSubmittingNewSource(false);
    }
  };

  const handleSaveSelector = async (sourceId: number, productId: number) => {
    if (!onSaveSelector) return;
    const key = `${sourceId}_${productId}`;
    const vals = getSelectorInputValues(sourceId, productId);
    setSavingSelectorKey(key);
    try {
      await onSaveSelector(sourceId, productId, {
        price_xpath: vals.price_xpath.trim(),
        update_time_xpath: vals.update_time_xpath.trim() || undefined,
        active: true
      });
      setSavedSelectorKey(key);
      setTimeout(() => setSavedSelectorKey(null), 2500);
    } finally {
      setSavingSelectorKey(null);
    }
  };

  // Actions management
  const handleSaveSourceAction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onSavePageAction || !actionModal.sourceId) return;
    setIsSubmittingAction(true);
    try {
      const overrides = getSourceOverrideActions(actionModal.sourceId);
      if (actionModal.actionId) {
        const existing = overrides.find((a) => a.id === actionModal.actionId);
        await onSavePageAction({
          id: actionModal.actionId,
          scope: 'TABLE_SOURCE',
          table_source_id: actionModal.sourceId,
          order: existing?.order || 1,
          action_type: actionModal.action_type,
          selector: actionModal.selector.trim(),
          value: actionModal.value.trim(),
          active: actionModal.active
        });
      } else {
        await onSavePageAction({
          scope: 'TABLE_SOURCE',
          table_source_id: actionModal.sourceId,
          order: overrides.length + 1,
          action_type: actionModal.action_type,
          selector: actionModal.selector.trim(),
          value: actionModal.value.trim(),
          active: actionModal.active
        });
      }
      setActionModal((prev) => ({ ...prev, isOpen: false }));
    } finally {
      setIsSubmittingAction(false);
    }
  };

  const handleRevertToSiteDefaults = (sourceId: number) => {
    setRevertingSourceId(sourceId);
  };

  const handleMoveSourceAction = async (sourceId: number, index: number, direction: 'UP' | 'DOWN') => {
    if (!onSavePageAction) return;
    const overrides = getSourceOverrideActions(sourceId);
    const targetIndex = direction === 'UP' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= overrides.length) return;

    const currentItem = overrides[index];
    const targetItem = overrides[targetIndex];

    await onSavePageAction({
      id: currentItem.id,
      scope: 'TABLE_SOURCE',
      table_source_id: sourceId,
      order: targetItem.order
    });

    await onSavePageAction({
      id: targetItem.id,
      scope: 'TABLE_SOURCE',
      table_source_id: sourceId,
      order: currentItem.order
    });
  };

  const getActionTypeLabel = (type: PageActionType) => {
    switch (type) {
      case 'WAIT':
        return { label: 'توقف (WAIT)', icon: Clock, color: 'bg-amber-50 text-amber-800 border-amber-200' };
      case 'CLICK':
        return { label: 'کلیک (CLICK)', icon: MousePointer, color: 'bg-blue-50 text-blue-800 border-blue-200' };
      case 'SCROLL':
        return { label: 'اسکرول (SCROLL)', icon: Scroll, color: 'bg-indigo-50 text-indigo-800 border-indigo-200' };
      case 'SCROLL_TO':
        return { label: 'اسکرول به (SCROLL_TO)', icon: Scroll, color: 'bg-purple-50 text-purple-800 border-purple-200' };
      case 'WAIT_FOR_ELEMENT':
        return { label: 'انتظار عنصر (WAIT_FOR_ELEMENT)', icon: Eye, color: 'bg-emerald-50 text-emerald-800 border-emerald-200' };
      default:
        return { label: type, icon: Clock, color: 'bg-gray-50 text-gray-800 border-gray-200' };
    }
  };

  return (
    <div className="space-y-6">
      {/* Detail Header */}
      <div className="bg-white p-5 rounded-lg border border-gray-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
            title="بازگشت به لیست جداول"
          >
            <ArrowRight className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-gray-900">{table.name}</h1>
              <span className="text-xs px-2.5 py-0.5 rounded bg-slate-100 text-slate-700 font-medium">
                کارخانه: {table.factory_name}
              </span>
              <span
                className={`text-xs px-2.5 py-0.5 rounded font-medium ${
                  table.today_status === 'COMPLETED'
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-amber-100 text-amber-800'
                }`}
              >
                {table.today_status === 'COMPLETED' ? 'کامل شده امروز' : 'در حال انتظار یا تلاش'}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-4 text-xs text-gray-500 mt-2">
              <span>ساعت شروع: <strong className="text-gray-700">{table.start_time}</strong></span>
              <span>فاصله تکرار: <strong className="text-gray-700">{table.retry_interval_minutes} دقیقه</strong></span>
              <span>حداکثر تلاش: <strong className="text-gray-700">{table.max_attempts} بار</strong></span>
              <span>آستانه Price Guard: <strong className="text-gray-700">{table.price_guard_percent}٪</strong></span>
            </div>
          </div>
        </div>

        {/* Header Action Buttons */}
        <div className="flex items-center gap-2">
          {onDeleteTable && (
            <button
              type="button"
              onClick={() => setIsDeleteTableModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-md transition-colors shadow-xs"
              title="حذف این جدول قیمت"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>حذف جدول</span>
            </button>
          )}

          <button
            id={`btn-run-full-table-${table.id}`}
            onClick={handleRunTable}
            disabled={isRunning}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-50 rounded-md transition-colors shadow-xs"
          >
            <Play className={`w-3.5 h-3.5 ${isRunning ? 'animate-spin' : ''}`} />
            <span>{isRunning ? 'در حال اجرای سراسری...' : 'اجرای سراسری جدول'}</span>
          </button>
        </div>
      </div>

      {/* Navigation Tabs between Sources & Table Settings */}
      <div className="flex border-b border-gray-200 gap-2">
        <button
          type="button"
          onClick={() => setActiveTab('sources')}
          className={`inline-flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 transition-colors ${
            activeTab === 'sources'
              ? 'border-slate-900 text-slate-900 bg-white'
              : 'border-transparent text-gray-500 hover:text-gray-900 hover:border-gray-300'
          }`}
        >
          <Globe className="w-4 h-4 text-slate-700" />
          <span>منابع قیمت و سلکتورها</span>
          <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-gray-100 text-gray-700 font-mono">
            {tableSources.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('settings')}
          className={`inline-flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 transition-colors ${
            activeTab === 'settings'
              ? 'border-slate-900 text-slate-900 bg-white'
              : 'border-transparent text-gray-500 hover:text-gray-900 hover:border-gray-300'
          }`}
        >
          <Sliders className="w-4 h-4 text-slate-700" />
          <span>تنظیمات عمومی جدول</span>
        </button>
      </div>

      {activeTab === 'settings' ? (
        /* Settings Section */
        <div className="bg-white rounded-lg border border-gray-200 shadow-xs p-6 max-w-3xl animate-in fade-in duration-150">
          <div className="border-b border-gray-100 pb-4 mb-5 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                <Sliders className="w-4 h-4 text-slate-700" />
                تنظیمات عمومی جدول: {table.name}
              </h2>
              <p className="text-xs text-gray-500 mt-1">
                پیکربندی کارخانه، زمان‌بندی روزانه، دفعات تلاش مجدد و آستانه نوسان قیمت (Price Guard)
              </p>
            </div>
            {settingsSavedSuccess && (
              <span className="inline-flex items-center gap-1 px-3 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded text-xs font-medium">
                <CheckCircle2 className="w-3.5 h-3.5" />
                تنظیمات با موفقیت ذخیره شد
              </span>
            )}
          </div>

          <form onSubmit={handleSaveSettings} className="space-y-4 text-xs">
            <div>
              <label className="block text-gray-700 font-semibold mb-1">
                نام جدول قیمت <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={tableSettings.name}
                onChange={(e) => setTableSettings((prev) => ({ ...prev, name: e.target.value }))}
                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded focus:bg-white focus:outline-none focus:border-slate-800"
              />
            </div>

            <div>
              <label className="block text-gray-700 font-semibold mb-1">کارخانه تولیدکننده</label>
              <select
                value={tableSettings.factory_id}
                onChange={(e) => setTableSettings((prev) => ({ ...prev, factory_id: parseInt(e.target.value, 10) }))}
                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded focus:bg-white focus:outline-none focus:border-slate-800"
              >
                {factories.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-gray-700 font-semibold mb-1">ساعت شروع پایش روزانه</label>
                <input
                  type="time"
                  value={tableSettings.start_time}
                  onChange={(e) => setTableSettings((prev) => ({ ...prev, start_time: e.target.value }))}
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded focus:bg-white focus:outline-none focus:border-slate-800 text-left font-mono"
                />
              </div>

              <div>
                <label className="block text-gray-700 font-semibold mb-1">فاصله تلاش مجدد در صورت عدم انتشار (دقیقه)</label>
                <input
                  type="number"
                  min="5"
                  max="120"
                  value={tableSettings.retry_interval_minutes}
                  onChange={(e) =>
                    setTableSettings((prev) => ({ ...prev, retry_interval_minutes: parseInt(e.target.value, 10) }))
                  }
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded focus:bg-white focus:outline-none focus:border-slate-800 font-mono"
                />
              </div>

              <div>
                <label className="block text-gray-700 font-semibold mb-1">حداکثر دفعات تلاش مجدد در روز</label>
                <input
                  type="number"
                  min="1"
                  max="20"
                  value={tableSettings.max_attempts}
                  onChange={(e) => setTableSettings((prev) => ({ ...prev, max_attempts: parseInt(e.target.value, 10) }))}
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded focus:bg-white focus:outline-none focus:border-slate-800 font-mono"
                />
              </div>

              <div>
                <label className="block text-gray-700 font-semibold mb-1">آستانه محافظ نوسان قیمت (Price Guard درصد)</label>
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={tableSettings.price_guard_percent}
                  onChange={(e) =>
                    setTableSettings((prev) => ({ ...prev, price_guard_percent: parseFloat(e.target.value) }))
                  }
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded focus:bg-white focus:outline-none focus:border-slate-800 font-mono"
                />
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <input
                type="checkbox"
                id="active-toggle"
                checked={tableSettings.active}
                onChange={(e) => setTableSettings((prev) => ({ ...prev, active: e.target.checked }))}
                className="rounded border-gray-300 text-slate-800 focus:ring-slate-800"
              />
              <label htmlFor="active-toggle" className="text-gray-700 font-medium">
                این جدول قیمت فعال باشد
              </label>
            </div>

            <div className="pt-4 border-t border-gray-100 flex justify-end">
              <button
                type="submit"
                disabled={savingSettings}
                className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-50 rounded transition-colors shadow-xs"
              >
                {savingSettings ? 'در حال ذخیره...' : 'ذخیره تنظیمات جدول'}
              </button>
            </div>
          </form>

          {onDeleteTable && (
            <div className="mt-8 pt-6 border-t border-rose-100">
              <div className="p-4 bg-rose-50/60 rounded-lg border border-rose-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h4 className="text-xs font-bold text-rose-800 flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 text-rose-600" />
                    حذف این جدول قیمت
                  </h4>
                  <p className="text-[11px] text-rose-600 mt-0.5">
                    با حذف جدول، کلیه منابع متصل، سلکتورها و تاریخچه نسخه‌های آن حذف خواهند شد.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsDeleteTableModalOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-md transition-colors shadow-xs shrink-0 self-start sm:self-auto"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>حذف جدول قیمت</span>
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* Sources & Selectors Section */
        <div className="space-y-4">
          <div className="flex items-center justify-between bg-white p-4 rounded-lg border border-gray-200 shadow-xs">
            <div>
              <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                <Globe className="w-4 h-4 text-slate-800" />
                منابع استخراج قیمت برای این جدول
              </h2>
              <p className="text-xs text-gray-500 mt-0.5">
                تعریف سایت رقیب، آدرس URL، سلکتور تاریخ جدول، دستورات قبل از استخراج و XPath قیمت محصولات
              </p>
            </div>

            {onSaveTableSource && (
              <button
                type="button"
                onClick={() => setIsAddSourceModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-md transition-colors shadow-xs"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>افزودن منبع جدید</span>
              </button>
            )}
          </div>

          {tableSources.length === 0 ? (
            <div className="bg-white p-8 text-center rounded-lg border border-dashed border-gray-300 text-xs text-gray-400">
              هنوز هیچ منبعی برای این جدول تعریف نشده است.
              <br />
              برای شروع روی دکمه «افزودن منبع جدید» کلیک کنید و سایت رقیب و URL صفحه را وارد نمایید.
            </div>
          ) : (
            <div className="space-y-5">
              {tableSources.map((source) => {
                const currentSiteIdVal = getSourceSiteId(source);
                const currentUrlVal = getSourceUrl(source);
                const currentXPathVal = getSourceUpdateXPath(source);
                const siteObj = sites.find((s) => s.id === currentSiteIdVal) || sites.find((s) => s.id === source.site_id);
                const overrideActions = getSourceOverrideActions(source.id);
                const siteDefaults = getSiteDefaultActions(currentSiteIdVal);
                const hasOverrides = overrideActions.length > 0;
                const isProductsOpen = expandedProducts[source.id] !== false; // open by default
                const isActionsOpen = expandedActions[source.id] === true;

                return (
                  <div
                    key={source.id}
                    className="bg-white rounded-lg border border-gray-200 shadow-xs overflow-hidden transition-all"
                  >
                    {/* Source Card Header */}
                    <div className="p-4 bg-slate-50/80 border-b border-gray-200 flex flex-col md:flex-row md:items-center justify-between gap-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-sm text-gray-900 flex items-center gap-1.5">
                          <Globe className="w-4 h-4 text-slate-700" />
                          {source.site_name || siteObj?.name || `سایت ${source.site_id}`}
                        </span>

                        <span
                          className={`text-[11px] px-2 py-0.5 rounded font-medium border ${
                            siteObj?.scrape_method === 'PLAYWRIGHT'
                              ? 'bg-purple-50 text-purple-700 border-purple-200'
                              : 'bg-blue-50 text-blue-700 border-blue-200'
                          }`}
                        >
                          {siteObj?.scrape_method === 'PLAYWRIGHT' ? 'Playwright' : 'FETCH'}
                        </span>

                        <span
                          className={`text-[11px] px-2 py-0.5 rounded font-medium ${
                            source.fresh
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-amber-50 text-amber-700 border border-amber-200'
                          }`}
                        >
                          {source.fresh ? 'بروز امروز' : 'قدیمی / نامشخص'}
                        </span>

                        <span
                          className={`text-[11px] px-2 py-0.5 rounded font-medium ${
                            source.today_status === 'DONE' || source.today_status === 'UPDATED'
                              ? 'bg-emerald-100 text-emerald-800'
                              : source.today_status === 'FAILED'
                              ? 'bg-rose-100 text-rose-800'
                              : 'bg-gray-100 text-gray-700'
                          }`}
                        >
                          {source.today_status === 'DONE' || source.today_status === 'UPDATED'
                            ? 'استخراج موفق'
                            : source.today_status === 'FAILED'
                            ? 'خطا در استخراج'
                            : 'در انتظار'}
                        </span>

                        {source.last_update_text && (
                          <span className="text-xs text-gray-500 mr-2">
                            تاریخ خوانده شده: <strong className="text-gray-800">{source.last_update_text}</strong>
                          </span>
                        )}
                      </div>

                      {/* Header Controls */}
                      <div className="flex items-center gap-1.5 self-end md:self-auto">
                        <button
                          type="button"
                          onClick={() => handleRunSource(source.id)}
                          disabled={runningSourceId === source.id}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-slate-800 bg-white border border-gray-300 rounded hover:bg-gray-50 shadow-xs disabled:opacity-50 transition-colors"
                          title="اجرای مستقل این منبع"
                        >
                          <Play className={`w-3 h-3 ${runningSourceId === source.id ? 'animate-spin' : ''}`} />
                          <span>تست استخراج</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setEditingSourceSettings(source)}
                          className="p-1.5 text-gray-500 hover:text-slate-900 border border-gray-200 rounded hover:bg-gray-50 transition-colors"
                          title="تنظیمات پیشرفته منبع"
                        >
                          <Sliders className="w-3.5 h-3.5" />
                        </button>

                        {onDeleteTableSource && (
                          <button
                            type="button"
                            onClick={() => handleDeleteSource(source)}
                            className="p-1.5 text-rose-500 hover:text-rose-700 border border-rose-200 rounded hover:bg-rose-50 transition-colors"
                            title="حذف این منبع"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                      {/* Source Site, URL & Table Update XPath Form */}
                      <div className="p-4 border-b border-gray-100 space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                          {/* Site Select Input */}
                          <div className="md:col-span-3">
                            <label className="block text-xs font-semibold text-gray-700 mb-1">
                              سایت منبع
                            </label>
                            <select
                              value={currentSiteIdVal}
                              onChange={(e) => setSourceSites((prev) => ({ ...prev, [source.id]: parseInt(e.target.value, 10) }))}
                              className="w-full px-2.5 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded focus:bg-white focus:border-slate-800 focus:outline-none"
                            >
                              {sites.map((s) => (
                                <option key={s.id} value={s.id}>
                                  {s.name}
                                </option>
                              ))}
                            </select>
                          </div>

                          {/* URL Direct Input */}
                          <div className="md:col-span-5">
                            <label className="block text-xs font-semibold text-gray-700 mb-1">
                              آدرس صفحه استخراج (URL مستقیم)
                            </label>
                            <div className="flex items-center gap-1.5">
                              <input
                                type="url"
                                value={currentUrlVal}
                                onChange={(e) => setSourceUrls((prev) => ({ ...prev, [source.id]: e.target.value }))}
                                placeholder="https://example.com/rebar/zobahan"
                                className="w-full px-3 py-1.5 font-mono text-xs dir-ltr text-right bg-gray-50 border border-gray-200 rounded focus:bg-white focus:border-slate-800 focus:outline-none"
                              />
                              {currentUrlVal && (
                                <a
                                  href={currentUrlVal}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="p-1.5 text-gray-400 hover:text-slate-800 border border-gray-200 rounded hover:bg-gray-50"
                                  title="باز کردن در تب جدید"
                                >
                                  <ExternalLink className="w-3.5 h-3.5" />
                                </a>
                              )}
                            </div>
                          </div>

                          {/* Table Update XPath Input */}
                          <div className="md:col-span-4">
                            <div className="flex items-center justify-between mb-1">
                              <label className="block text-xs font-semibold text-gray-700">
                                XPath تاریخ کل جدول
                              </label>
                              <span className="text-[11px] text-gray-400">اختیاری</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <input
                                type="text"
                                value={currentXPathVal}
                                onChange={(e) => setSourceUpdateXPaths((prev) => ({ ...prev, [source.id]: e.target.value }))}
                                placeholder="//div[@class='update-time']"
                                className="w-full px-2.5 py-1.5 font-mono text-xs dir-ltr text-right bg-gray-50 border border-gray-200 rounded focus:bg-white focus:border-slate-800 focus:outline-none"
                              />
                              <button
                                type="button"
                                onClick={() => handleOpenSourceTester(source, currentXPathVal || undefined, 'DATE')}
                                className="p-1.5 text-gray-600 hover:text-slate-900 border border-gray-200 rounded hover:bg-gray-100 transition-colors"
                                title="تست XPath تاریخ جدول"
                              >
                                <Play className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  handleOpenSourcePicker(
                                    source,
                                    (pickedXPath) => {
                                      setSourceUpdateXPaths((prev) => ({ ...prev, [source.id]: pickedXPath }));
                                    },
                                    'TABLE_UPDATE'
                                  )
                                }
                                className="p-1.5 text-gray-600 hover:text-slate-900 border border-gray-200 rounded hover:bg-gray-100 transition-colors"
                                title="انتخابگر تعاملی تاریخ با موس (Picker)"
                              >
                                <MousePointerClick className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setSourceUpdateXPaths((prev) => ({ ...prev, [source.id]: '' }))}
                                className="p-1.5 text-gray-400 hover:text-rose-600 border border-gray-200 rounded hover:bg-gray-100 transition-colors"
                                title="پاک کردن"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                              {onSaveTableSource && (
                                <button
                                  type="button"
                                  onClick={() => handleSaveSourceInline(source)}
                                  disabled={savingSourceId === source.id}
                                  className="px-2.5 py-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 rounded transition-colors disabled:opacity-50 flex items-center gap-1 shrink-0"
                                  title="ذخیره سایت، URL و XPath منبع"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                  <span>{savingSourceId === source.id ? '...' : 'ذخیره'}</span>
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Pre-Extraction Page Actions for this Source (Requirement #5) */}
                      <div className="bg-slate-50/60 rounded-md border border-gray-200 p-3 space-y-2">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <Layers className="w-4 h-4 text-slate-700" />
                            <span className="text-xs font-bold text-gray-800">دستورات قبل از استخراج:</span>
                            {hasOverrides ? (
                              <span className="text-[11px] px-2 py-0.5 rounded font-semibold bg-purple-50 text-purple-700 border border-purple-200">
                                در حال استفاده از {overrideActions.length} دستور اختصاصی این منبع
                              </span>
                            ) : (
                              <span className="text-[11px] px-2 py-0.5 rounded font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                                در حال استفاده از {siteDefaults.length} دستور پیش‌فرض سایت ({siteObj?.name || source.site_name || `سایت ${currentSiteIdVal}`})
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-2">
                            {hasOverrides ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setActionModal({
                                      isOpen: true,
                                      sourceId: source.id,
                                      actionId: null,
                                      action_type: 'WAIT',
                                      selector: '',
                                      value: '1000',
                                      active: true
                                    })
                                  }
                                  className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-slate-800 bg-white border border-gray-300 rounded hover:bg-gray-50"
                                >
                                  <Plus className="w-3 h-3" />
                                  <span>افزودن دستور اختصاصی</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleRevertToSiteDefaults(source.id)}
                                  className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-rose-600 hover:text-rose-800 hover:bg-rose-50 rounded transition-colors"
                                  title="حذف دستورات اختصاصی و بازگشت به پیش‌فرض‌های سایت"
                                >
                                  <RotateCcw className="w-3 h-3" />
                                  <span>بازگشت به پیش‌فرض سایت</span>
                                </button>
                              </>
                            ) : (
                              <button
                                type="button"
                                onClick={() =>
                                  setActionModal({
                                    isOpen: true,
                                    sourceId: source.id,
                                    actionId: null,
                                    action_type: 'WAIT',
                                    selector: '',
                                    value: '1000',
                                    active: true
                                  })
                                }
                                className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-slate-800 bg-white border border-gray-300 rounded hover:bg-gray-50 shadow-xs"
                              >
                                <Plus className="w-3 h-3" />
                                <span>تعریف دستورات اختصاصی برای این منبع</span>
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => setExpandedActions((prev) => ({ ...prev, [source.id]: !isActionsOpen }))}
                              className="p-1 text-gray-500 hover:text-gray-900 rounded"
                              title={isActionsOpen ? 'بستن لیست دستورات' : 'مشاهده لیست دستورات'}
                            >
                              {isActionsOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                            </button>
                          </div>
                        </div>

                        {/* Expandable actions preview / editor */}
                        {isActionsOpen && (
                          <div className="pt-2 border-t border-gray-200 space-y-2">
                            {hasOverrides ? (
                              <div className="space-y-1.5">
                                <div className="text-[11px] text-gray-500">
                                  دستورات اختصاصی زیر قبل از استخراج این منبع به ترتیب اجرا می‌شوند:
                                </div>
                                {overrideActions.map((action, idx) => {
                                  const typeInfo = getActionTypeLabel(action.action_type);
                                  const Icon = typeInfo.icon;
                                  return (
                                    <div
                                      key={action.id}
                                      className="flex items-center justify-between p-2 rounded bg-white border border-gray-200 text-xs"
                                    >
                                      <div className="flex items-center gap-2">
                                        <div className="flex flex-col gap-0.5">
                                          <button
                                            type="button"
                                            disabled={idx === 0}
                                            onClick={() => handleMoveSourceAction(source.id, idx, 'UP')}
                                            className="p-0.5 text-gray-400 hover:text-slate-800 disabled:opacity-20"
                                          >
                                            <MoveUp className="w-3 h-3" />
                                          </button>
                                          <button
                                            type="button"
                                            disabled={idx === overrideActions.length - 1}
                                            onClick={() => handleMoveSourceAction(source.id, idx, 'DOWN')}
                                            className="p-0.5 text-gray-400 hover:text-slate-800 disabled:opacity-20"
                                          >
                                            <MoveDown className="w-3 h-3" />
                                          </button>
                                        </div>
                                        <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-700 font-mono text-[10px] flex items-center justify-center font-bold">
                                          {idx + 1}
                                        </span>
                                        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold border ${typeInfo.color}`}>
                                          <Icon className="w-3 h-3" />
                                          <span>{typeInfo.label}</span>
                                        </span>
                                        {action.selector && (
                                          <span className="font-mono text-[11px] dir-ltr text-slate-800 bg-gray-50 px-1.5 py-0.5 rounded border border-gray-100">
                                            {action.selector}
                                          </span>
                                        )}
                                        {action.value && (
                                          <span className="text-[11px] text-gray-500 font-mono">
                                            {action.value} {action.action_type === 'WAIT' ? 'ms' : ''}
                                          </span>
                                        )}
                                      </div>

                                      <div className="flex items-center gap-1.5">
                                        <button
                                          type="button"
                                          onClick={() =>
                                            setActionModal({
                                              isOpen: true,
                                              sourceId: source.id,
                                              actionId: action.id,
                                              action_type: action.action_type,
                                              selector: action.selector || '',
                                              value: action.value || '',
                                              active: action.active
                                            })
                                          }
                                          className="p-1 text-gray-500 hover:text-slate-900 rounded"
                                        >
                                          <Edit2 className="w-3 h-3" />
                                        </button>
                                        {onDeletePageAction && (
                                          <button
                                            type="button"
                                            onClick={() => onDeletePageAction(action.id)}
                                            className="p-1 text-rose-500 hover:text-rose-700 rounded"
                                          >
                                            <Trash2 className="w-3 h-3" />
                                          </button>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            ) : (
                              <div className="space-y-1 text-xs text-gray-600">
                                <div className="text-[11px] text-gray-500">
                                  در حال حاضر از دستورات پیش‌فرض تعریف‌شده در بخش سایت‌ها استفاده می‌شود:
                                </div>
                                {siteDefaults.length === 0 ? (
                                  <div className="text-gray-400 italic text-[11px]">هیچ دستور پیش‌فرضی در سایت تعریف نشده است.</div>
                                ) : (
                                  <div className="space-y-1">
                                    {siteDefaults.map((action, idx) => {
                                      const typeInfo = getActionTypeLabel(action.action_type);
                                      const Icon = typeInfo.icon;
                                      return (
                                        <div key={action.id} className="flex items-center gap-2 p-1.5 rounded bg-white border border-gray-100 text-[11px]">
                                          <span className="w-4 h-4 rounded-full bg-slate-100 text-slate-700 font-mono text-[10px] flex items-center justify-center font-bold">
                                            {idx + 1}
                                          </span>
                                          <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold border ${typeInfo.color}`}>
                                            <Icon className="w-2.5 h-2.5" />
                                            <span>{typeInfo.label}</span>
                                          </span>
                                          {action.selector && (
                                            <span className="font-mono text-[10px] dir-ltr text-slate-700">{action.selector}</span>
                                          )}
                                          {action.value && (
                                            <span className="text-gray-500 font-mono text-[10px]">
                                              {action.value} {action.action_type === 'WAIT' ? 'ms' : ''}
                                            </span>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                    {/* Product Selectors under this Source (Requirement #6) */}
                    <div className="p-4 bg-white">
                      <button
                        type="button"
                        onClick={() => setExpandedProducts((prev) => ({ ...prev, [source.id]: !isProductsOpen }))}
                        className="w-full flex items-center justify-between p-2.5 bg-gray-50 hover:bg-gray-100 rounded-md border border-gray-200 transition-colors text-right"
                      >
                        <div className="flex items-center gap-2">
                          <Code className="w-4 h-4 text-slate-800" />
                          <span className="text-xs font-bold text-gray-900">
                            محصولات این منبع و سلکتورهای استخراج قیمت و تاریخ
                          </span>
                          <span className="text-[11px] font-mono px-2 py-0.5 bg-slate-200 text-slate-800 rounded-full font-semibold">
                            {tableProducts.length} محصول
                          </span>
                        </div>

                        <div className="flex items-center gap-1 text-xs text-gray-500 font-medium">
                          <span>{isProductsOpen ? 'بستن محصولات' : 'مشاهده محصولات و XPathها'}</span>
                          {isProductsOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </div>
                      </button>

                      {/* Products List */}
                      {isProductsOpen && (
                        <div className="mt-3 space-y-3">
                          {tableProducts.length === 0 ? (
                            <div className="p-6 text-center text-xs text-gray-400 border border-dashed border-gray-200 rounded">
                              هیچ کالایی برای این جدول قیمت تعریف نشده است.
                            </div>
                          ) : (
                            tableProducts.map((product) => {
                              const key = `${source.id}_${product.id}`;
                              const inputVals = getSelectorInputValues(source.id, product.id);
                              const isSaving = savingSelectorKey === key;
                              const isSaved = savedSelectorKey === key;

                              return (
                                <div
                                  key={product.id}
                                  className="p-3.5 rounded-lg border border-gray-200 hover:border-gray-300 bg-white transition-all space-y-3"
                                >
                                  {/* Product Row Header */}
                                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-gray-100 pb-2">
                                    <div className="flex items-center gap-2">
                                      <span className="font-bold text-xs text-gray-900">{product.name}</span>
                                      <span className="text-[10px] font-mono bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">
                                        کد وردپرس: {product.post_id}
                                      </span>
                                      {product.attributes?.pa_size && (
                                        <span className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                                          سایز: {product.attributes.pa_size}
                                        </span>
                                      )}
                                    </div>

                                    <div className="flex items-center gap-3 text-xs">
                                      <span className="text-gray-500">
                                        قیمت فعلی:{' '}
                                        <strong className="text-slate-900 font-mono">
                                          {product.current_price?.toLocaleString('fa-IR')}
                                        </strong>{' '}
                                        تومان
                                      </span>
                                    </div>
                                  </div>

                                  {/* Product Selectors Inputs Grid */}
                                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-xs">
                                    {/* Price XPath */}
                                    <div>
                                      <div className="flex items-center justify-between mb-1">
                                        <label className="font-semibold text-gray-700">
                                          XPath قیمت محصول <span className="text-rose-500">*</span>
                                        </label>
                                        <span className="text-[10px] text-gray-400">الزامی برای استخراج</span>
                                      </div>
                                      <div className="flex items-center gap-1">
                                        <input
                                          type="text"
                                          value={inputVals.price_xpath}
                                          onChange={(e) =>
                                            setEditingSelectors((prev) => ({
                                              ...prev,
                                              [key]: { ...inputVals, price_xpath: e.target.value }
                                            }))
                                          }
                                          placeholder="//table//tr[1]/td[2]"
                                          className="w-full px-2.5 py-1.5 font-mono text-xs dir-ltr text-right bg-gray-50 border border-gray-200 rounded focus:bg-white focus:border-slate-800 focus:outline-none"
                                        />
                                        <button
                                          type="button"
                                          onClick={async () => {
                                            const { urlVal } = await ensureSourceSavedBeforeInspect(source);
                                            onOpenTester(source.id, urlVal, inputVals.price_xpath || undefined, 'PRICE');
                                          }}
                                          className="p-1.5 text-gray-600 hover:text-slate-900 border border-gray-200 rounded hover:bg-gray-100"
                                          title="تست استخراج قیمت"
                                        >
                                          <Play className="w-3.5 h-3.5" />
                                        </button>
                                        <button
                                          type="button"
                                          onClick={async () => {
                                            const { urlVal } = await ensureSourceSavedBeforeInspect(source);
                                            onOpenPicker(
                                              urlVal,
                                              source.id,
                                              (pickedXPath) => {
                                                setEditingSelectors((prev) => ({
                                                  ...prev,
                                                  [key]: { ...inputVals, price_xpath: pickedXPath }
                                                }));
                                              },
                                              'PRODUCT_PRICE'
                                            );
                                          }}
                                          className="p-1.5 text-gray-600 hover:text-slate-900 border border-gray-200 rounded hover:bg-gray-100"
                                          title="انتخابگر قیمت با موس (Picker)"
                                        >
                                          <MousePointerClick className="w-3.5 h-3.5" />
                                        </button>
                                      </div>
                                    </div>

                                    {/* Date XPath */}
                                    <div>
                                      <div className="flex items-center justify-between mb-1">
                                        <label className="font-semibold text-gray-700">XPath تاریخ اختصاصی کالا</label>
                                        <span className="text-[10px] text-gray-400">
                                          اختیاری (در صورت خالی بودن، تاریخ کل جدول ملاک است)
                                        </span>
                                      </div>
                                      <div className="flex items-center gap-1">
                                        <input
                                          type="text"
                                          value={inputVals.update_time_xpath}
                                          onChange={(e) =>
                                            setEditingSelectors((prev) => ({
                                              ...prev,
                                              [key]: { ...inputVals, update_time_xpath: e.target.value }
                                            }))
                                          }
                                          placeholder="ارث‌بری از تاریخ جدول"
                                          className="w-full px-2.5 py-1.5 font-mono text-xs dir-ltr text-right bg-gray-50 border border-gray-200 rounded focus:bg-white focus:border-slate-800 focus:outline-none placeholder:text-gray-400 placeholder:font-sans"
                                        />
                                        <button
                                          type="button"
                                          onClick={async () => {
                                            const { urlVal } = await ensureSourceSavedBeforeInspect(source);
                                            onOpenTester(
                                              source.id,
                                              urlVal,
                                              inputVals.update_time_xpath || undefined,
                                              'DATE'
                                            );
                                          }}
                                          className="p-1.5 text-gray-600 hover:text-slate-900 border border-gray-200 rounded hover:bg-gray-100"
                                          title="تست تاریخ کالا"
                                        >
                                          <Play className="w-3.5 h-3.5" />
                                        </button>
                                        <button
                                          type="button"
                                          onClick={async () => {
                                            const { urlVal } = await ensureSourceSavedBeforeInspect(source);
                                            onOpenPicker(
                                              urlVal,
                                              source.id,
                                              (pickedXPath) => {
                                                setEditingSelectors((prev) => ({
                                                  ...prev,
                                                  [key]: { ...inputVals, update_time_xpath: pickedXPath }
                                                }));
                                              },
                                              'PRODUCT_UPDATE'
                                            );
                                          }}
                                          className="p-1.5 text-gray-600 hover:text-slate-900 border border-gray-200 rounded hover:bg-gray-100"
                                          title="انتخابگر تاریخ کالا با موس (Picker)"
                                        >
                                          <MousePointerClick className="w-3.5 h-3.5" />
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => handleSaveSelector(source.id, product.id)}
                                          disabled={isSaving}
                                          className="px-3 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded transition-colors disabled:opacity-50 whitespace-nowrap flex items-center gap-1 shadow-xs"
                                        >
                                          {isSaved ? (
                                            <>
                                              <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                                              <span>ذخیره شد</span>
                                            </>
                                          ) : (
                                            <span>{isSaving ? '...' : 'ذخیره'}</span>
                                          )}
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              );
                            })
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Add New Source Modal (Direct Site + URL) */}
      {isAddSourceModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                <Plus className="w-4 h-4 text-slate-800" />
                افزودن منبع قیمت جدید برای {table.name}
              </h3>
              <button
                type="button"
                onClick={() => setIsAddSourceModalOpen(false)}
                className="text-gray-400 hover:text-gray-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {addSourceError && (
              <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded">
                {addSourceError}
              </div>
            )}

            <form onSubmit={handleAddSourceSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block text-gray-700 font-semibold mb-1">
                  انتخاب سایت رقیب <span className="text-rose-500">*</span>
                </label>
                <select
                  value={newSourceForm.site_id}
                  onChange={(e) => setNewSourceForm({ ...newSourceForm, site_id: parseInt(e.target.value, 10) })}
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded focus:bg-white focus:outline-none focus:border-slate-800"
                >
                  {sites.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.base_url}) - {s.scrape_method}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-gray-700 font-semibold mb-1">
                  آدرس مستقیم صفحه استخراج (URL) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="url"
                  required
                  value={newSourceForm.url}
                  onChange={(e) => setNewSourceForm({ ...newSourceForm, url: e.target.value })}
                  placeholder="https://example.com/rebar/zobahan"
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded focus:bg-white focus:outline-none focus:border-slate-800 font-mono text-[11px] dir-ltr text-right"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-gray-700 font-semibold">XPath تاریخ کل جدول</label>
                  <span className="text-gray-400 text-[10px]">اختیاری</span>
                </div>
                <input
                  type="text"
                  value={newSourceForm.update_time_xpath}
                  onChange={(e) => setNewSourceForm({ ...newSourceForm, update_time_xpath: e.target.value })}
                  placeholder="//div[@class='update-date']"
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded focus:bg-white focus:outline-none focus:border-slate-800 font-mono text-[11px] dir-ltr text-right"
                />
              </div>

              <div className="pt-2 border-t border-gray-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddSourceModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-gray-600 hover:text-gray-800"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingNewSource}
                  className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-50 rounded transition-colors shadow-xs"
                >
                  {isSubmittingNewSource ? 'در حال ایجاد...' : 'افزودن منبع به جدول'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Advanced Settings Modal for TableSource (Overrides) */}
      {editingSourceSettings && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h3 className="text-sm font-bold text-gray-900">
                تنظیمات پیشرفته و Overrideهای منبع: {editingSourceSettings.site_name}
              </h3>
              <button
                type="button"
                onClick={() => setEditingSourceSettings(null)}
                className="text-gray-400 hover:text-gray-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!onSaveTableSource) return;
                await onSaveTableSource({
                  id: editingSourceSettings.id,
                  recheck_enabled: editingSourceSettings.recheck_enabled,
                  active: editingSourceSettings.active,
                  max_attempts_override: editingSourceSettings.max_attempts_override,
                  retry_interval_override: editingSourceSettings.retry_interval_override,
                  timeout_override: editingSourceSettings.timeout_override,
                  price_guard_override: editingSourceSettings.price_guard_override
                });
                setEditingSourceSettings(null);
              }}
              className="space-y-4 text-xs"
            >
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-gray-700 font-semibold mb-1">تلاش مجدد اختصاصی</label>
                  <input
                    type="number"
                    value={editingSourceSettings.max_attempts_override ?? ''}
                    onChange={(e) =>
                      setEditingSourceSettings({
                        ...editingSourceSettings,
                        max_attempts_override: e.target.value ? parseInt(e.target.value, 10) : (null as any)
                      })
                    }
                    placeholder="پیش‌فرض جدول"
                    className="w-full px-3 py-1.5 bg-gray-50 border border-gray-200 rounded font-mono"
                  />
                </div>

                <div>
                  <label className="block text-gray-700 font-semibold mb-1">فاصله تکرار (دقیقه)</label>
                  <input
                    type="number"
                    value={editingSourceSettings.retry_interval_override ?? ''}
                    onChange={(e) =>
                      setEditingSourceSettings({
                        ...editingSourceSettings,
                        retry_interval_override: e.target.value ? parseInt(e.target.value, 10) : (null as any)
                      })
                    }
                    placeholder="پیش‌فرض جدول"
                    className="w-full px-3 py-1.5 bg-gray-50 border border-gray-200 rounded font-mono"
                  />
                </div>

                <div>
                  <label className="block text-gray-700 font-semibold mb-1">Timeout بارگذاری (ثانیه)</label>
                  <input
                    type="number"
                    value={editingSourceSettings.timeout_override ?? ''}
                    onChange={(e) =>
                      setEditingSourceSettings({
                        ...editingSourceSettings,
                        timeout_override: e.target.value ? parseInt(e.target.value, 10) : (null as any)
                      })
                    }
                    placeholder="پیش‌فرض سایت"
                    className="w-full px-3 py-1.5 bg-gray-50 border border-gray-200 rounded font-mono"
                  />
                </div>

                <div>
                  <label className="block text-gray-700 font-semibold mb-1">Price Guard اختصاصی (٪)</label>
                  <input
                    type="number"
                    value={editingSourceSettings.price_guard_override ?? ''}
                    onChange={(e) =>
                      setEditingSourceSettings({
                        ...editingSourceSettings,
                        price_guard_override: e.target.value ? parseFloat(e.target.value) : (null as any)
                      })
                    }
                    placeholder="پیش‌فرض جدول"
                    className="w-full px-3 py-1.5 bg-gray-50 border border-gray-200 rounded font-mono"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="source-active-override"
                  checked={editingSourceSettings.active}
                  onChange={(e) =>
                    setEditingSourceSettings({ ...editingSourceSettings, active: e.target.checked })
                  }
                  className="rounded border-gray-300 text-slate-800"
                />
                <label htmlFor="source-active-override" className="text-gray-700 font-medium">
                  منبع فعال باشد
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setEditingSourceSettings(null)}
                  className="px-4 py-2 text-xs font-semibold text-gray-600 hover:text-gray-800"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded transition-colors"
                >
                  ذخیره تنظیمات
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add / Edit TableSource Override Action Modal */}
      {actionModal.isOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6 space-y-4">
            <h3 className="text-sm font-bold text-gray-900 border-b border-gray-100 pb-3">
              {actionModal.actionId ? 'ویرایش دستور اختصاصی منبع' : 'افزودن دستور اختصاصی قبل از استخراج منبع'}
            </h3>

            <form onSubmit={handleSaveSourceAction} className="space-y-4 text-xs">
              <div>
                <label className="block text-gray-700 font-semibold mb-1">
                  نوع دستور (Action Type) <span className="text-rose-500">*</span>
                </label>
                <select
                  value={actionModal.action_type}
                  onChange={(e) =>
                    setActionModal((prev) => ({ ...prev, action_type: e.target.value as PageActionType }))
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

              {(actionModal.action_type === 'CLICK' ||
                actionModal.action_type === 'WAIT_FOR_ELEMENT' ||
                actionModal.action_type === 'SCROLL_TO') && (
                <div>
                  <label className="block text-gray-700 font-semibold mb-1">
                    سلکتور عنصر (XPath یا CSS Selector) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={actionModal.selector}
                    onChange={(e) => setActionModal((prev) => ({ ...prev, selector: e.target.value }))}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded focus:bg-white focus:outline-none focus:border-slate-800 font-mono text-[11px] dir-ltr text-right"
                    placeholder="//button[@id='show-prices'] یا #show-prices"
                  />
                </div>
              )}

              <div>
                <label className="block text-gray-700 font-semibold mb-1">
                  {actionModal.action_type === 'WAIT'
                    ? 'مدت زمان انتظار (میلی‌ثانیه)'
                    : actionModal.action_type === 'WAIT_FOR_ELEMENT'
                    ? 'حداکثر زمان انتظار (میلی‌ثانیه - اختیاری)'
                    : actionModal.action_type === 'SCROLL'
                    ? 'مقدار اسکرول (پیکسل یا ۵۰۰)'
                    : 'مقدار کمکی (اختیاری)'}
                </label>
                <input
                  type="text"
                  value={actionModal.value}
                  onChange={(e) => setActionModal((prev) => ({ ...prev, value: e.target.value }))}
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded focus:bg-white focus:outline-none focus:border-slate-800 font-mono text-[11px] dir-ltr text-right"
                  placeholder={actionModal.action_type === 'WAIT' ? '1500' : ''}
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="source-action-active"
                  checked={actionModal.active}
                  onChange={(e) => setActionModal((prev) => ({ ...prev, active: e.target.checked }))}
                  className="rounded border-gray-300 text-slate-800"
                />
                <label htmlFor="source-action-active" className="text-gray-700 font-medium">
                  این دستور در فرآیند استخراج فعال باشد
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setActionModal((prev) => ({ ...prev, isOpen: false }))}
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
      {/* Delete Entire PriceTable Confirmation Modal */}
      {isDeleteTableModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl border border-gray-200 w-full max-w-md p-6 animate-in fade-in zoom-in-95 duration-150 space-y-4">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="p-2.5 bg-rose-50 rounded-full">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-gray-900">تأیید حذف جدول قیمت</h3>
                <p className="text-xs text-gray-500 mt-0.5">عملیات حذف جدول و منابع وابسته</p>
              </div>
            </div>

            <div className="p-3 bg-gray-50 rounded-lg border border-gray-200 text-xs text-gray-700 space-y-1">
              <p>
                آیا از حذف کامل جدول قیمت <strong>«{table.name}»</strong> اطمینان دارید؟
              </p>
              <p className="text-[11px] text-rose-700 font-medium pt-1">
                ⚠️ هشدار: با حذف این جدول، تمامی منابع استخراج، سلکتورهای محصولات و تاریخچه نسخه‌ها حذف خواهند شد!
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
              <button
                type="button"
                disabled={isDeletingTable}
                onClick={() => setIsDeleteTableModalOpen(false)}
                className="px-4 py-2 text-xs font-medium text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
              >
                انصراف
              </button>
              <button
                type="button"
                disabled={isDeletingTable}
                onClick={async () => {
                  if (!onDeleteTable) return;
                  setIsDeletingTable(true);
                  try {
                    await onDeleteTable(table.id);
                    setIsDeleteTableModalOpen(false);
                    onBack();
                  } finally {
                    setIsDeletingTable(false);
                  }
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-50 rounded-md transition-colors shadow-xs"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{isDeletingTable ? 'در حال حذف...' : 'حذف قطعی جدول'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Source Confirmation Modal */}
      {deletingSource && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl border border-gray-200 w-full max-w-md p-6 animate-in fade-in zoom-in-95 duration-150 space-y-4">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="p-2.5 bg-rose-50 rounded-full">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-gray-900">تأیید حذف منبع قیمت</h3>
                <p className="text-xs text-gray-500 mt-0.5">عملیات حذف وابسته (Cascade Delete)</p>
              </div>
            </div>

            <div className="p-3 bg-gray-50 rounded-lg border border-gray-200 text-xs text-gray-700 space-y-1">
              <p>
                آیا از حذف منبع مربوط به سایت <strong>«{deletingSource.site_name || `سایت شماره ${deletingSource.site_id}`}»</strong> اطمینان دارید؟
              </p>
              <p className="text-[11px] text-rose-700 font-medium pt-1">
                ⚠️ با حذف این منبع، تمام سلکتورهای استخراج و دستورات اختصاصی متصل به آن حذف خواهند شد.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
              <button
                type="button"
                disabled={isDeletingSource}
                onClick={() => setDeletingSource(null)}
                className="px-4 py-2 text-xs font-medium text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
              >
                انصراف
              </button>
              <button
                type="button"
                disabled={isDeletingSource}
                onClick={async () => {
                  if (!onDeleteTableSource || !deletingSource) return;
                  setIsDeletingSource(true);
                  try {
                    await onDeleteTableSource(deletingSource.id);
                    setDeletingSource(null);
                  } finally {
                    setIsDeletingSource(false);
                  }
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-50 rounded-md transition-colors shadow-xs"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{isDeletingSource ? 'در حال حذف...' : 'حذف قطعی منبع'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Revert Actions to Site Defaults Modal */}
      {revertingSourceId && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl border border-gray-200 w-full max-w-md p-6 animate-in fade-in zoom-in-95 duration-150 space-y-4">
            <div className="flex items-center gap-3 text-amber-600">
              <div className="p-2.5 bg-amber-50 rounded-full">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-gray-900">بازنشانی دستورات به پیش‌فرض سایت</h3>
                <p className="text-xs text-gray-500 mt-0.5">حذف دستورات سفارشی منبع</p>
              </div>
            </div>

            <div className="p-3 bg-gray-50 rounded-lg border border-gray-200 text-xs text-gray-700">
              <p>
                آیا می‌خواهید دستورات اختصاصی این منبع حذف شوند و فرایند استخراج از دستورات پیش‌فرض سایت استفاده کند؟
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
              <button
                type="button"
                disabled={isRevertingSource}
                onClick={() => setRevertingSourceId(null)}
                className="px-4 py-2 text-xs font-medium text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
              >
                انصراف
              </button>
              <button
                type="button"
                disabled={isRevertingSource}
                onClick={async () => {
                  if (!revertingSourceId) return;
                  setIsRevertingSource(true);
                  try {
                    if (onClearTableSourceActions) {
                      await onClearTableSourceActions(revertingSourceId);
                    } else if (onDeletePageAction) {
                      const overrides = getSourceOverrideActions(revertingSourceId);
                      for (const act of overrides) {
                        await onDeletePageAction(act.id);
                      }
                    }
                    setRevertingSourceId(null);
                  } finally {
                    setIsRevertingSource(false);
                  }
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 disabled:opacity-50 rounded-md transition-colors shadow-xs"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>{isRevertingSource ? 'در حال بازنشانی...' : 'تأیید بازنشانی'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

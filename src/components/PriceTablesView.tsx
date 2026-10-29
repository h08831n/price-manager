import React, { useState, useMemo } from 'react';
import {
  Plus,
  Play,
  Eye,
  Edit2,
  Trash2,
  AlertTriangle,
  Upload,
  Download,
  FileSpreadsheet,
  Clock,
  ArrowLeft,
  Globe,
  Search,
  X,
  DownloadCloud,
  CheckSquare,
  Square,
  CheckCircle2,
  XCircle,
  Power,
  FileCode2
} from 'lucide-react';
import { PriceTable, Factory } from '../types';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { PriceTableConfigModal } from './PriceTableConfigModal';

interface PriceTablesViewProps {
  tables: PriceTable[];
  factories: Factory[];
  onSelectTable: (table: PriceTable) => void;
  onRunTable: (tableId: number) => Promise<void>;
  onSaveTable: (table: Partial<PriceTable>) => Promise<void>;
  onDeleteTable?: (tableId: number) => Promise<void>;
  onOpenImport: (entity: string) => void;
  onExport: (entity: string) => void;
  onDownloadTemplate: (entity: string) => void;
  onPullFromDestination?: () => Promise<any>;
  onBatchToggleStatus?: (ids: number[], active: boolean) => Promise<any>;
  onBatchDelete?: (ids: number[]) => Promise<any>;
  onBatchRun?: (ids: number[]) => Promise<any>;
  onReload?: () => Promise<void> | void;
  showToast?: (message: string, type?: 'success' | 'error' | 'info') => void;
}

function normalizePersian(str: string): string {
  if (!str) return '';
  return str
    .toLowerCase()
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/۰/g, '0').replace(/۱/g, '1').replace(/۲/g, '2').replace(/۳/g, '3').replace(/۴/g, '4')
    .replace(/۵/g, '5').replace(/۶/g, '6').replace(/۷/g, '7').replace(/۸/g, '8').replace(/۹/g, '9')
    .trim();
}

export const PriceTablesView: React.FC<PriceTablesViewProps> = ({
  tables,
  factories,
  onSelectTable,
  onRunTable,
  onSaveTable,
  onDeleteTable,
  onOpenImport,
  onExport,
  onDownloadTemplate,
  onPullFromDestination,
  onBatchToggleStatus,
  onBatchDelete,
  onBatchRun,
  onReload,
  showToast = () => {}
}) => {
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newTable, setNewTable] = useState<Partial<PriceTable>>({
    name: '',
    destination_id: undefined,
    factory_id: factories[0]?.id || 1,
    start_time: '11:00',
    retry_interval_minutes: 30,
    max_attempts: 5,
    price_guard_percent: 30,
    default_price_adjustment: 0,
    vat_percent: 10,
    active: true
  });
  const [runningId, setRunningId] = useState<number | null>(null);
  const [isPulling, setIsPulling] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFactoryFilter, setSelectedFactoryFilter] = useState<number | null>(null);

  // Multi-Selection State
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [isBatchUpdating, setIsBatchUpdating] = useState(false);
  const [isBatchDeletingModalOpen, setIsBatchDeletingModalOpen] = useState(false);
  const [isBatchDeleting, setIsBatchDeleting] = useState(false);
  const [isBatchRunning, setIsBatchRunning] = useState(false);

  // Delete modal state
  const [deletingTable, setDeletingTable] = useState<PriceTable | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Price Table Config Export / Import Modal State
  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);
  const [configModalTab, setConfigModalTab] = useState<'export' | 'import'>('export');
  const [configModalPreselectedIds, setConfigModalPreselectedIds] = useState<number[] | undefined>(undefined);

  const handleOpenConfigExport = (ids?: number[]) => {
    setConfigModalPreselectedIds(ids);
    setConfigModalTab('export');
    setIsConfigModalOpen(true);
  };

  const handleOpenConfigImport = () => {
    setConfigModalPreselectedIds(undefined);
    setConfigModalTab('import');
    setIsConfigModalOpen(true);
  };

  // Close modals on Escape
  useEscapeKey(() => {
    if (isConfigModalOpen) setIsConfigModalOpen(false);
    else if (isBatchDeletingModalOpen) setIsBatchDeletingModalOpen(false);
    else if (deletingTable) setDeletingTable(null);
    else if (isAddModalOpen) setIsAddModalOpen(false);
  }, Boolean(isConfigModalOpen || isBatchDeletingModalOpen || deletingTable || isAddModalOpen));

  const filteredTables = useMemo(() => {
    const list = tables.filter((tbl) => {
      if (selectedFactoryFilter && tbl.factory_id !== selectedFactoryFilter) {
        return false;
      }
      if (!searchQuery.trim()) return true;
      const q = normalizePersian(searchQuery);
      const nameMatch = normalizePersian(tbl.name).includes(q);
      const factoryMatch = tbl.factory_name && normalizePersian(tbl.factory_name).includes(q);
      const categoryMatch = tbl.category_name && normalizePersian(tbl.category_name).includes(q);
      const idMatch = String(tbl.id).includes(q);
      const destMatch = String(tbl.destination_id ?? '').includes(q);
      return nameMatch || factoryMatch || categoryMatch || idMatch || destMatch;
    });

    // Sort active tables first per user requirement: "اونایی که فعال هستند رو هم بالاتر نشون بده"
    return list.sort((a, b) => {
      if (a.active === b.active) return b.id - a.id;
      return a.active ? -1 : 1;
    });
  }, [tables, searchQuery, selectedFactoryFilter]);

  // Selection helpers
  const isAllSelected = filteredTables.length > 0 && filteredTables.every((t) => selectedIds.has(t.id));

  const toggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredTables.map((t) => t.id)));
    }
  };

  const toggleSelectOne = (id: number) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  // Bulk actions handlers
  const handleBulkStatusChange = async (active: boolean) => {
    if (selectedIds.size === 0) return;
    setIsBatchUpdating(true);
    try {
      if (onBatchToggleStatus) {
        await onBatchToggleStatus(Array.from(selectedIds), active);
      } else {
        for (const id of Array.from(selectedIds)) {
          await onSaveTable({ id, active });
        }
      }
      setSelectedIds(new Set());
    } finally {
      setIsBatchUpdating(false);
    }
  };

  const handleBulkDelete = async () => {
    if (!onBatchDelete || selectedIds.size === 0) return;
    setIsBatchDeleting(true);
    try {
      await onBatchDelete(Array.from(selectedIds));
      setSelectedIds(new Set());
      setIsBatchDeletingModalOpen(false);
    } finally {
      setIsBatchDeleting(false);
    }
  };

  const handleBulkRun = async () => {
    if (selectedIds.size === 0) return;
    setIsBatchRunning(true);
    try {
      if (onBatchRun) {
        await onBatchRun(Array.from(selectedIds));
      } else {
        // Run active selected tables sequentially
        const activeSelected = filteredTables.filter((t) => selectedIds.has(t.id) && t.active);
        for (const tbl of activeSelected) {
          await onRunTable(tbl.id);
        }
      }
      setSelectedIds(new Set());
    } finally {
      setIsBatchRunning(false);
    }
  };

  const handleOpenAdd = () => {
    setNewTable({
      name: '',
      destination_id: undefined,
      factory_id: factories[0]?.id || 1,
      start_time: '11:00',
      retry_interval_minutes: 30,
      max_attempts: 5,
      price_guard_percent: 30,
      default_price_adjustment: 0,
      active: true
    });
    setIsAddModalOpen(true);
  };

  const handleRun = async (tableId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setRunningId(tableId);
    try {
      await onRunTable(tableId);
    } finally {
      setRunningId(null);
    }
  };

  const handleToggleTableActive = async (tbl: PriceTable, e: React.MouseEvent) => {
    e.stopPropagation();
    await onSaveTable({
      id: tbl.id,
      active: !tbl.active
    });
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTable.name?.trim()) return;
    await onSaveTable(newTable);
    setIsAddModalOpen(false);
  };

  return (
    <div className="space-y-4">
      {/* Top Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-lg border border-gray-200 shadow-xs">
        <div>
          <h2 className="text-sm font-bold text-gray-900">مدیریت جداول قیمت کارخانجات</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            پایش زمان‌بندی‌شده و محاسبه حداقل قیمت در منابع رقیب بر اساس جدول‌های فعال ({tables.length} جدول ثبت شده - فعال‌ها در بالای لیست)
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {onPullFromDestination && (
            <button
              id="btn-pull-tables-destination"
              type="button"
              onClick={async () => {
                setIsPulling(true);
                try {
                  await onPullFromDestination();
                } finally {
                  setIsPulling(false);
                }
              }}
              disabled={isPulling}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-purple-900 bg-purple-50 hover:bg-purple-100 border border-purple-300 disabled:opacity-50 rounded-md transition-colors cursor-pointer shadow-xs"
              title="دریافت خودکار همه جداول قیمت از پست تایپ price سایت مقصد (WordPress)"
            >
              <DownloadCloud className={`w-3.5 h-3.5 text-purple-700 ${isPulling ? 'animate-bounce' : ''}`} />
              <span>{isPulling ? 'در حال دریافت از مقصد...' : 'دریافت جداول از سایت مقصد'}</span>
            </button>
          )}

          <button
            onClick={handleOpenAdd}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-md transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>افزودن جدول قیمت</span>
          </button>

          <button
            id="btn-export-tables-config"
            type="button"
            onClick={() => handleOpenConfigExport()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-purple-900 bg-purple-50 hover:bg-purple-100 border border-purple-300 rounded-md transition-colors cursor-pointer shadow-xs"
            title="خروجی گرفتن از تنظیمات تمام جداول قیمت، منابع، XPathها و دستورات صفحه به فرمت JSON"
          >
            <FileCode2 className="w-3.5 h-3.5 text-purple-700" />
            <span>خروجی تنظیمات (JSON)</span>
          </button>

          <button
            id="btn-import-tables-config"
            type="button"
            onClick={handleOpenConfigImport}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-900 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 rounded-md transition-colors cursor-pointer shadow-xs"
            title="ورود و اعمال تنظیمات جداول قیمت و منابع از فایل JSON"
          >
            <Upload className="w-3.5 h-3.5 text-emerald-700" />
            <span>ورود تنظیمات (JSON)</span>
          </button>

          <button
            onClick={() => onOpenImport('price_tables')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-200 rounded-md hover:bg-gray-50 transition-colors"
          >
            <Upload className="w-3.5 h-3.5 text-gray-500" />
            <span>ایمپورت اکسل</span>
          </button>

          <button
            onClick={() => onExport('price_tables')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-200 rounded-md hover:bg-gray-50 transition-colors"
          >
            <Download className="w-3.5 h-3.5 text-gray-500" />
            <span>خروجی اکسل</span>
          </button>

          <button
            onClick={() => onDownloadTemplate('price_tables')}
            className="p-1.5 text-gray-500 hover:text-gray-700 transition-colors"
            title="دانلود قالب اکسل"
          >
            <FileSpreadsheet className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Search and Factory Filter Bar */}
      <div className="bg-white p-3 rounded-lg border border-gray-200 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 text-gray-400 absolute right-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="جستجوی جدول قیمت بر اساس نام، نام کارخانه، دسته‌بندی یا شناسه مقصد..."
            className="w-full pl-9 pr-9 py-2 text-xs border border-gray-200 rounded-md focus:border-slate-800 focus:outline-hidden transition-colors"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-0.5"
              title="پاک کردن جستجو"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <select
            value={selectedFactoryFilter || ''}
            onChange={(e) => setSelectedFactoryFilter(e.target.value ? Number(e.target.value) : null)}
            className="text-xs border border-gray-200 rounded-md px-3 py-2 bg-white text-gray-700 focus:border-slate-800 focus:outline-hidden transition-colors"
          >
            <option value="">همه کارخانجات</option>
            {factories.map((fac) => (
              <option key={fac.id} value={fac.id}>
                {fac.name}
              </option>
            ))}
          </select>

          <div className="text-xs text-gray-500 whitespace-nowrap font-mono px-2 py-1 bg-gray-50 rounded border border-gray-100">
            نمایش {filteredTables.length} از {tables.length}
          </div>
        </div>
      </div>

      {/* Bulk Action Toolbar */}
      {selectedIds.size > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900 text-white px-4 py-2.5 rounded-lg shadow-md animate-in fade-in slide-in-from-top-2 duration-150 text-xs">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 bg-slate-800 rounded font-mono font-bold text-amber-300">
              {selectedIds.size}
            </span>
            <span>جدول قیمت انتخاب شده است</span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={isBatchUpdating || isBatchRunning}
              onClick={() => handleBulkStatusChange(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded font-medium transition-colors cursor-pointer"
              title="جداول فعال می‌شوند و سیستم برای آن‌ها قیمت استخراج می‌کند"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>فعال‌سازی همگانی (شروع پایش قیمت)</span>
            </button>

            <button
              type="button"
              disabled={isBatchUpdating || isBatchRunning}
              onClick={() => handleBulkStatusChange(false)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white rounded font-medium transition-colors cursor-pointer"
              title="جداول غیرفعال می‌شوند و استخراج قیمت برای آن‌ها متوقف می‌شود"
            >
              <XCircle className="w-3.5 h-3.5" />
              <span>غیرفعال‌سازی همگانی (توقف پایش قیمت)</span>
            </button>

            <button
              type="button"
              disabled={isBatchUpdating || isBatchRunning}
              onClick={handleBulkRun}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded font-medium transition-colors cursor-pointer"
              title="اجرای دستی و همگانی تمام جداول فعال انتخاب‌شده"
            >
              <Play className={`w-3.5 h-3.5 ${isBatchRunning ? 'animate-spin' : ''}`} />
              <span>{isBatchRunning ? 'در حال اجرای گروهی...' : 'اجرای همگانی جداول فعال'}</span>
            </button>

            <button
              type="button"
              disabled={isBatchUpdating || isBatchRunning}
              onClick={() => handleOpenConfigExport(Array.from(selectedIds))}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-purple-700 hover:bg-purple-600 disabled:opacity-50 text-white rounded font-medium transition-colors cursor-pointer"
              title="خروجی گرفتن از تنظیمات جداول انتخاب‌شده به همراه منابع آن‌ها به فرمت JSON"
            >
              <FileCode2 className="w-3.5 h-3.5 text-purple-200" />
              <span>خروجی تنظیمات ({selectedIds.size})</span>
            </button>

            {onBatchDelete && (
              <button
                type="button"
                disabled={isBatchUpdating || isBatchDeleting || isBatchRunning}
                onClick={() => setIsBatchDeletingModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white rounded font-medium transition-colors cursor-pointer"
                title="حذف همگانی جداول قیمت انتخاب‌شده"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>حذف همگانی</span>
              </button>
            )}

            <button
              type="button"
              disabled={isBatchUpdating || isBatchRunning}
              onClick={() => setSelectedIds(new Set())}
              className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded font-medium transition-colors text-[11px] cursor-pointer"
            >
              لغو انتخاب
            </button>
          </div>
        </div>
      )}

      {/* Tables List */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-gray-50 text-gray-500 font-medium border-b border-gray-200">
              <tr>
                <th className="py-3 px-3 w-10 text-center">
                  <button
                    type="button"
                    onClick={toggleSelectAll}
                    className="p-1 hover:bg-gray-200 rounded text-gray-500 transition-colors cursor-pointer inline-flex items-center justify-center"
                    title={isAllSelected ? 'لغو انتخاب همه' : 'انتخاب همه موارد'}
                  >
                    {isAllSelected ? (
                      <CheckSquare className="w-4 h-4 text-slate-900" />
                    ) : (
                      <Square className="w-4 h-4 text-gray-400" />
                    )}
                  </button>
                </th>
                <th className="py-3 px-4 w-16 text-center font-mono">آیدی سیستم</th>
                <th className="py-3 px-4 w-24 text-center font-mono text-purple-900 bg-purple-50/50">آیدی مقصد</th>
                <th className="py-3 px-4">نام جدول قیمت</th>
                <th className="py-3 px-4">دسته‌بندی کالا</th>
                <th className="py-3 px-4">کارخانه مربوطه</th>
                <th className="py-3 px-4 text-center">تعداد منابع</th>
                <th className="py-3 px-4 text-center">تعداد کالاها</th>
                <th className="py-3 px-4 text-center">ساعت شروع</th>
                <th className="py-3 px-4 text-center">فاصله تلاش</th>
                <th className="py-3 px-4 text-center">سقف تلاش</th>
                <th className="py-3 px-4 text-center">Price Guard</th>
                <th className="py-3 px-4 text-center w-32">وضعیت فعال‌سازی</th>
                <th className="py-3 px-4 text-center w-36">عملیات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredTables.length === 0 ? (
                <tr>
                  <td colSpan={14} className="py-8 text-center text-gray-400">
                    {searchQuery || selectedFactoryFilter ? 'هیچ جدول قیمتی با فیلتر انتخابی یافت نشد.' : 'هیچ جدول قیمتی در سیستم ثبت نشده است.'}
                  </td>
                </tr>
              ) : (
                filteredTables.map((tbl) => (
                  <tr
                    key={tbl.id}
                    onClick={() => onSelectTable(tbl)}
                    className={`cursor-pointer transition-colors ${selectedIds.has(tbl.id) ? 'bg-indigo-50/50' : tbl.active ? 'hover:bg-slate-50/80 bg-white' : 'hover:bg-amber-50/40 bg-amber-50/20'}`}
                  >
                    <td className="py-3 px-3 text-center" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={() => toggleSelectOne(tbl.id)}
                        className="p-1 hover:bg-gray-100 rounded text-gray-500 transition-colors cursor-pointer inline-flex items-center justify-center"
                      >
                        {selectedIds.has(tbl.id) ? (
                          <CheckSquare className="w-4 h-4 text-slate-900" />
                        ) : (
                          <Square className="w-4 h-4 text-gray-300" />
                        )}
                      </button>
                    </td>
                    <td className="py-3 px-4 font-mono font-bold text-slate-800 text-center bg-slate-50/50">#{tbl.id}</td>
                    <td className="py-3 px-4 text-center font-mono font-bold text-purple-700 bg-purple-50/30">
                      <span className="px-2 py-0.5 rounded bg-purple-100/70 border border-purple-200" title="شناسه جدول در سایت مقصد (پست تایپ price)">
                        {tbl.destination_id ?? tbl.id}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-bold text-gray-900">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={`w-2 h-2 rounded-full ${tbl.active ? 'bg-emerald-500' : 'bg-gray-300'}`} />
                        <span>{tbl.name}</span>
                        {tbl.assignment_mode === 'MANUAL' ? (
                          <span className="px-1.5 py-0.5 text-[10px] bg-purple-100 text-purple-800 border border-purple-200 rounded font-normal" title="محصولات مشخصاً و به صورت دستی در فیلد products در ACF انتخاب شده‌اند">
                            دستی ({tbl.manual_product_ids?.length || tbl.product_count || 0})
                          </span>
                        ) : tbl.assignment_mode === 'ATTRIBUTE' ? (
                          <span className="px-1.5 py-0.5 text-[10px] bg-blue-100 text-blue-800 border border-blue-200 rounded font-normal" title="بر اساس ویژگی‌های محصول (product_by_attr)">
                            ویژگی
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-indigo-700 font-medium">
                      <span className="px-2 py-0.5 bg-indigo-50 border border-indigo-200 rounded">
                        {tbl.category_name || 'همه دسته‌ها'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-gray-700 font-medium">{tbl.factory_name || '-'}</td>
                    <td className="py-3 px-4 text-center font-mono">{tbl.source_count || 0} منبع</td>
                    <td className="py-3 px-4 text-center font-mono font-bold text-slate-900">{tbl.product_count || 0} کالا</td>
                    <td className="py-3 px-4 text-center font-mono text-slate-700 font-semibold">{tbl.start_time}</td>
                    <td className="py-3 px-4 text-center">{tbl.retry_interval_minutes} دقیقه</td>
                    <td className="py-3 px-4 text-center">{tbl.max_attempts} بار</td>
                    <td className="py-3 px-4 text-center font-mono">{tbl.price_guard_percent}٪</td>
                    <td className="py-3 px-4 text-center" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={(e) => handleToggleTableActive(tbl, e)}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold cursor-pointer transition-all border ${
                          tbl.active
                            ? 'bg-emerald-100 hover:bg-emerald-200 text-emerald-900 border-emerald-300 shadow-2xs'
                            : 'bg-amber-100/80 hover:bg-amber-200 text-amber-900 border-amber-300'
                        }`}
                        title={tbl.active ? 'جدول فعال است (کلیک برای غیرفعال‌سازی)' : 'جدول غیرفعال است (کلیک برای فعال‌سازی و شروع پایش قیمت)'}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${tbl.active ? 'bg-emerald-600' : 'bg-amber-600'}`} />
                        <span>{tbl.active ? 'فعال' : 'غیرفعال'}</span>
                      </button>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <div className="flex items-center justify-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={(e) => handleRun(tbl.id, e)}
                          disabled={runningId === tbl.id}
                          className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded transition-colors"
                          title="اجرای دستی کل جدول"
                        >
                          <Play className={`w-3 h-3 ${runningId === tbl.id ? 'animate-spin' : ''}`} />
                          <span>اجرا</span>
                        </button>

                        <button
                          onClick={() => onSelectTable(tbl)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-800 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded transition-colors"
                          title="ویرایش کامل جدول و مدیریت منابع و سلکتورها"
                        >
                          <Edit2 className="w-3.5 h-3.5 text-slate-700" />
                          <span>ویرایش و منابع</span>
                        </button>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenConfigExport([tbl.id]);
                          }}
                          className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-purple-700 hover:text-purple-800 bg-purple-50 hover:bg-purple-100 border border-purple-200 rounded transition-colors"
                          title="خروجی گرفتن از تنظیمات و منابع این جدول قیمت (JSON)"
                        >
                          <FileCode2 className="w-3 h-3 text-purple-600" />
                          <span>خروجی</span>
                        </button>

                        {onDeleteTable && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeletingTable(tbl);
                            }}
                            className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded transition-colors"
                            title="حذف جدول قیمت"
                          >
                            <Trash2 className="w-3 h-3 text-rose-500" />
                            <span>حذف</span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add New Table Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl border border-gray-200 w-full max-w-lg p-6 animate-in fade-in zoom-in-95 duration-150">
            <h3 className="text-sm font-bold text-gray-900 mb-4">
              افزودن جدول قیمت جدید
            </h3>

            <form onSubmit={handleCreateSubmit} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-gray-700 font-medium mb-1">
                    نام جدول <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="مثال: میلگرد ذوب آهن"
                    value={newTable.name || ''}
                    onChange={(e) => setNewTable({ ...newTable, name: e.target.value })}
                    className="w-full px-3 py-1.5 bg-gray-50 border border-gray-200 rounded focus:bg-white focus:outline-none focus:border-slate-800"
                  />
                </div>

                <div>
                  <label className="block text-gray-700 font-medium mb-1">
                    آیدی در سایت مقصد (post_id / شناسه یکتا)
                  </label>
                  <input
                    type="number"
                    placeholder="اختیاری (مثال: 5410)"
                    value={newTable.destination_id ?? ''}
                    onChange={(e) =>
                      setNewTable({
                        ...newTable,
                        destination_id: e.target.value ? parseInt(e.target.value, 10) : undefined
                      })
                    }
                    className="w-full px-3 py-1.5 bg-gray-50 border border-gray-200 rounded focus:bg-white focus:outline-none focus:border-slate-800 font-mono text-left"
                  />
                  <p className="text-[10px] text-gray-400 mt-1">شناسه یکتای جدول در وردپرس (عدم تکرار تضمین می‌شود)</p>
                </div>
              </div>

              <div>
                <label className="block text-gray-700 font-medium mb-1">کارخانه مربوطه</label>
                <select
                  value={newTable.factory_id || 1}
                  onChange={(e) =>
                    setNewTable({ ...newTable, factory_id: parseInt(e.target.value, 10) })
                  }
                  className="w-full px-3 py-1.5 bg-gray-50 border border-gray-200 rounded focus:bg-white focus:outline-none"
                >
                  {factories.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-gray-700 font-medium mb-1">ساعت شروع پایش روزانه (HH:mm)</label>
                  <input
                    type="text"
                    required
                    placeholder="11:00"
                    value={newTable.start_time || '11:00'}
                    onChange={(e) => setNewTable({ ...newTable, start_time: e.target.value })}
                    className="w-full px-3 py-1.5 bg-gray-50 border border-gray-200 rounded focus:bg-white focus:outline-none focus:border-slate-800 text-left font-mono"
                  />
                </div>

                <div>
                  <label className="block text-gray-700 font-medium mb-1">فاصله تلاش مجدد (دقیقه)</label>
                  <input
                    type="number"
                    value={newTable.retry_interval_minutes || 30}
                    onChange={(e) =>
                      setNewTable({ ...newTable, retry_interval_minutes: parseInt(e.target.value, 10) })
                    }
                    className="w-full px-3 py-1.5 bg-gray-50 border border-gray-200 rounded focus:bg-white focus:outline-none focus:border-slate-800 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-gray-700 font-medium mb-1">حداکثر دفعات تلاش (Max Attempts)</label>
                  <input
                    type="number"
                    value={newTable.max_attempts || 5}
                    onChange={(e) =>
                      setNewTable({ ...newTable, max_attempts: parseInt(e.target.value, 10) })
                    }
                    className="w-full px-3 py-1.5 bg-gray-50 border border-gray-200 rounded focus:bg-white focus:outline-none focus:border-slate-800 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-gray-700 font-medium mb-1">آستانه هشدار Price Guard (درصد)</label>
                  <input
                    type="number"
                    value={newTable.price_guard_percent || 30}
                    onChange={(e) =>
                      setNewTable({ ...newTable, price_guard_percent: parseFloat(e.target.value) })
                    }
                    className="w-full px-3 py-1.5 bg-gray-50 border border-gray-200 rounded focus:bg-white focus:outline-none focus:border-slate-800 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-gray-700 font-semibold mb-1">
                    درصد مالیات بر ارزش افزوده (ارزش افزوده)
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.5"
                      value={newTable.vat_percent ?? 10}
                      onChange={(e) =>
                        setNewTable({
                          ...newTable,
                          vat_percent: e.target.value === '' ? 10 : parseFloat(e.target.value)
                        })
                      }
                      className="w-full px-3 py-1.5 bg-gray-50 border border-gray-200 rounded focus:bg-white focus:outline-none focus:border-slate-800 font-mono"
                    />
                    <span className="text-xs text-gray-500 font-medium">٪</span>
                  </div>
                  <p className="text-[10px] text-gray-400 mt-0.5">
                    قیمت ارسالی به مقصد بر اساس این درصد با ارزش افزوده محاسبه می‌شود (پیش‌فرض: ۱۰٪).
                  </p>
                </div>
              </div>

              <div className="p-3 bg-blue-50/70 border border-blue-200/80 rounded-lg">
                <label className="block text-slate-900 font-semibold mb-1">
                  تعدیل پیش‌فرض قیمت جدول (تومان)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    placeholder="مثلاً 100- یا 200+ (پیش‌فرض: 0)"
                    value={newTable.default_price_adjustment || ''}
                    onChange={(e) =>
                      setNewTable({
                        ...newTable,
                        default_price_adjustment: e.target.value === '' ? 0 : parseFloat(e.target.value)
                      })
                    }
                    className="flex-1 px-3 py-1.5 bg-white border border-blue-300 rounded focus:bg-white focus:outline-none focus:border-slate-800 font-mono text-xs"
                  />
                  <span className="text-xs text-blue-900 font-medium">تومان</span>
                </div>
                <p className="text-[11px] text-blue-800/80 mt-1">
                  مقدار اضافه (+) یا کسر (-) به تومان از کمترین نرخ بازار برای تمام کالاهای این جدول.
                </p>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="tbl-active-toggle"
                  checked={newTable.active ?? true}
                  onChange={(e) => setNewTable({ ...newTable, active: e.target.checked })}
                  className="rounded text-slate-900 focus:ring-0"
                />
                <label htmlFor="tbl-active-toggle" className="text-gray-700 font-medium cursor-pointer">
                  جدول فعال باشد و در زمان‌بندی روزانه پایش شود
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-1.5 text-xs text-gray-700 hover:bg-gray-100 rounded transition-colors"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded transition-colors"
                >
                  ثبت و ایجاد جدول
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingTable && (
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
                آیا از حذف جدول قیمت <strong>«{deletingTable.name}»</strong> (شناسه: {deletingTable.id}) اطمینان دارید؟
              </p>
              <p className="text-[11px] text-rose-700 font-medium pt-1">
                ⚠️ هشدار: با حذف این جدول، تمام منابع استخراج متصل، سلکتورها و تاریخچه نسخه‌های این جدول حذف خواهند شد!
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setDeletingTable(null)}
                className="px-4 py-2 text-xs font-medium text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
              >
                انصراف
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={async () => {
                  if (!onDeleteTable || !deletingTable) return;
                  setIsDeleting(true);
                  try {
                    await onDeleteTable(deletingTable.id);
                    setDeletingTable(null);
                  } finally {
                    setIsDeleting(false);
                  }
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-50 rounded-md transition-colors shadow-xs cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{isDeleting ? 'در حال حذف...' : 'حذف قطعی جدول قیمت'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Delete Modal */}
      {isBatchDeletingModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl border border-gray-200 w-full max-w-md p-6 animate-in fade-in zoom-in-95 duration-150 space-y-4">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="p-2.5 bg-rose-50 rounded-full">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-gray-900">تأیید حذف همگانی جداول قیمت</h3>
                <p className="text-xs text-gray-500 mt-0.5">عملیات حذف گروهی و کلیه منابع متصل</p>
              </div>
            </div>

            <div className="p-3 bg-rose-50/50 rounded-lg border border-rose-200 text-xs text-rose-900 space-y-1">
              <p>
                آیا از حذف گروهی <strong>{selectedIds.size}</strong> جدول قیمت انتخاب‌شده اطمینان دارید؟
              </p>
              <p className="text-[11px] text-rose-700 font-medium pt-1">
                ⚠️ هشدار: کلیه منابع استخراج، سلکتورها و وظایف زمان‌بندی مربوط به این جداول به طور کامل حذف خواهند شد!
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
              <button
                type="button"
                disabled={isBatchDeleting}
                onClick={() => setIsBatchDeletingModalOpen(false)}
                className="px-4 py-2 text-xs font-medium text-gray-700 hover:bg-gray-100 rounded-md transition-colors cursor-pointer"
              >
                انصراف
              </button>
              <button
                type="button"
                disabled={isBatchDeleting}
                onClick={handleBulkDelete}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-50 rounded-md transition-colors shadow-xs cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{isBatchDeleting ? 'در حال حذف...' : `حذف قطعی ${selectedIds.size} جدول قیمت`}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Price Table Config Export & Import Modal */}
      <PriceTableConfigModal
        isOpen={isConfigModalOpen}
        initialTab={configModalTab}
        preselectedTableIds={configModalPreselectedIds}
        tables={tables}
        onClose={() => setIsConfigModalOpen(false)}
        onSuccess={async () => {
          if (onReload) await onReload();
        }}
        showToast={showToast}
      />
    </div>
  );
};

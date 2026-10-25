import React, { useState, useMemo } from 'react';
import {
  Search,
  Plus,
  FileSpreadsheet,
  Download,
  Upload,
  Eye,
  Edit2,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Filter,
  RefreshCw,
  Globe,
  CloudDownload,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  CheckSquare,
  Square,
  Check,
  Power,
  SlidersHorizontal
} from 'lucide-react';
import { Product, Factory, PriceTable, ProductSelector, PriceChange } from '../types';
import { ProductDetailModal } from './ProductDetailModal';
import { useEscapeKey } from '../hooks/useEscapeKey';

interface ProductsViewProps {
  products: Product[];
  factories: Factory[];
  priceTables: PriceTable[];
  selectors: ProductSelector[];
  priceChanges: PriceChange[];
  onSaveProduct: (product: Partial<Product>) => Promise<void>;
  onDeleteProduct?: (id: number) => Promise<void>;
  onOpenImport: (entity: string) => void;
  onExport: (entity: string) => void;
  onDownloadTemplate: (entity: string) => void;
  onReload?: () => Promise<void> | void;
  onSyncWithDestination?: () => Promise<any>;
  onPullFromDestination?: () => Promise<any>;
  onBatchToggleStatus?: (ids: number[], active: boolean) => Promise<any>;
}

export const ProductsView: React.FC<ProductsViewProps> = ({
  products,
  factories,
  priceTables,
  selectors,
  priceChanges,
  onSaveProduct,
  onDeleteProduct,
  onOpenImport,
  onExport,
  onDownloadTemplate,
  onReload,
  onSyncWithDestination,
  onPullFromDestination,
  onBatchToggleStatus
}) => {
  const [search, setSearch] = useState('');
  const [selectedFactory, setSelectedFactory] = useState<string>('ALL');
  const [selectedTable, setSelectedTable] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');
  const [selectedProductForDetail, setSelectedProductForDetail] = useState<Product | null>(null);
  const [isRecalculating, setIsRecalculating] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isPulling, setIsPulling] = useState(false);
  const [isBatchUpdating, setIsBatchUpdating] = useState(false);

  // Pagination state
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(25);
  const [jumpPageInput, setJumpPageInput] = useState<string>('');

  // Bulk Selection state
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  // Edit/Add modal state
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Partial<Product> | null>(null);

  // Delete modal state
  const [deletingProduct, setDeletingProduct] = useState<Product | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Close modals on Escape key
  useEscapeKey(() => {
    if (deletingProduct) setDeletingProduct(null);
    else if (isEditModalOpen) setIsEditModalOpen(false);
    else if (selectedProductForDetail) setSelectedProductForDetail(null);
  }, Boolean(deletingProduct || isEditModalOpen || selectedProductForDetail));

  // Filter products
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const s = search.trim().toLowerCase();
      const matchesSearch =
        !s ||
        p.name.toLowerCase().includes(s) ||
        String(p.post_id || '').includes(s) ||
        String(p.destination_id || '').includes(s) ||
        (p.sku && p.sku.toLowerCase().includes(s));

      const matchesFactory = selectedFactory === 'ALL' || p.factory_id === parseInt(selectedFactory, 10);
      const matchesTable = selectedTable === 'ALL' || p.price_table_id === parseInt(selectedTable, 10);
      const matchesStatus =
        statusFilter === 'ALL' ||
        (statusFilter === 'ACTIVE' && p.active) ||
        (statusFilter === 'INACTIVE' && !p.active);

      return matchesSearch && matchesFactory && matchesTable && matchesStatus;
    });
  }, [products, search, selectedFactory, selectedTable, statusFilter]);

  // Pagination calculation
  const totalItems = filteredProducts.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safeCurrentPage = Math.min(Math.max(1, currentPage), totalPages);
  const startIndex = (safeCurrentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalItems);
  const pagedProducts = useMemo(() => {
    return filteredProducts.slice(startIndex, endIndex);
  }, [filteredProducts, startIndex, endIndex]);

  // Counts for tabs/filters
  const activeCount = useMemo(() => products.filter((p) => p.active).length, [products]);
  const inactiveCount = useMemo(() => products.filter((p) => !p.active).length, [products]);

  // Selection helpers
  const isAllOnPageSelected = pagedProducts.length > 0 && pagedProducts.every((p) => selectedIds.has(p.id));
  const toggleSelectAllOnPage = () => {
    const next = new Set(selectedIds);
    if (isAllOnPageSelected) {
      pagedProducts.forEach((p) => next.delete(p.id));
    } else {
      pagedProducts.forEach((p) => next.add(p.id));
    }
    setSelectedIds(next);
  };

  const toggleSelectOne = (id: number) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const handleBulkStatusChange = async (active: boolean) => {
    if (selectedIds.size === 0) return;
    setIsBatchUpdating(true);
    try {
      if (onBatchToggleStatus) {
        await onBatchToggleStatus(Array.from(selectedIds), active);
      } else {
        for (const id of Array.from(selectedIds)) {
          const prod = products.find((p) => p.id === id);
          if (prod) await onSaveProduct({ ...prod, active });
        }
      }
      setSelectedIds(new Set());
      if (onReload) await onReload();
    } finally {
      setIsBatchUpdating(false);
    }
  };

  const handleToggleSingleActive = async (p: Product, e: React.MouseEvent) => {
    e.stopPropagation();
    await onSaveProduct({ ...p, active: !p.active });
  };

  const handleOpenAdd = () => {
    setEditingProduct({
      post_id: undefined,
      name: '',
      sku: '',
      factory_id: factories[0]?.id || 1,
      price_table_id: priceTables[0]?.id || 1,
      current_price: 0,
      active: true,
      attributes: {}
    });
    setIsEditModalOpen(true);
  };

  const handleOpenEdit = (product: Product) => {
    setEditingProduct({ ...product });
    setIsEditModalOpen(true);
  };

  const handleSubmitSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProduct) return;
    await onSaveProduct(editingProduct);
    setIsEditModalOpen(false);
    setEditingProduct(null);
  };

  const handleRecalculatePrices = async () => {
    setIsRecalculating(true);
    try {
      const res = await fetch('/api/products/recalculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      if (res.ok) {
        if (onReload) await onReload();
      }
    } catch (err) {
      console.error('Failed to recalculate prices:', err);
    } finally {
      setIsRecalculating(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Action Bar & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-lg border border-gray-200 shadow-xs">
        {/* Search Input */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-gray-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            id="product-search-input"
            type="text"
            placeholder="جستجو در محصولات (نام، شناسه post_id، شناسه فنی SKU)..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-3 pr-9 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-md focus:bg-white focus:outline-none focus:border-slate-800 transition-colors"
          />
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {onPullFromDestination && (
            <button
              id="btn-pull-destination-data"
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
              title="دریافت اطلاعات محصولات، دسته‌ها و کارخانه‌ها از سایت وردپرس مقصد"
            >
              <CloudDownload className={`w-3.5 h-3.5 text-purple-700 ${isPulling ? 'animate-spin' : ''}`} />
              <span>{isPulling ? 'در حال دریافت از وردپرس...' : 'دریافت محصولات از سایت مقصد'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleRecalculatePrices}
            disabled={isRecalculating}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-800 bg-blue-50/70 border border-blue-200 hover:bg-blue-100 disabled:opacity-50 rounded-md transition-colors cursor-pointer"
            title="محاسبه مجدد تمام قیمت‌ها بر اساس کمترین نرخ سورس‌ها و اعمال تعدیل (Offset)"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-blue-700 ${isRecalculating ? 'animate-spin' : ''}`} />
            <span>{isRecalculating ? 'در حال محاسبه...' : 'محاسبه مجدد قیمت‌ها'}</span>
          </button>

          <button
            id="btn-add-product"
            onClick={handleOpenAdd}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-md transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>افزودن محصول جدید</span>
          </button>

          <div className="h-4 w-px bg-gray-200 mx-1 hidden sm:block" />

          <button
            id="btn-import-products"
            onClick={() => onOpenImport('products')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-200 rounded-md hover:bg-gray-50 transition-colors"
          >
            <Upload className="w-3.5 h-3.5 text-gray-500" />
            <span>ایمپورت اکسل</span>
          </button>

          <button
            id="btn-export-products"
            onClick={() => onExport('products')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-200 rounded-md hover:bg-gray-50 transition-colors"
          >
            <Download className="w-3.5 h-3.5 text-gray-500" />
            <span>خروجی اکسل</span>
          </button>

          <button
            onClick={() => onDownloadTemplate('products')}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-gray-500 hover:text-gray-700 transition-colors"
            title="دانلود فایل نمونه اکسل جهت آماده‌سازی داده‌ها"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>قالب نمونه</span>
          </button>
        </div>
      </div>

      {/* Filters & Status Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-white px-4 py-2.5 rounded-lg border border-gray-200 text-xs shadow-2xs">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="text-gray-500 font-medium flex items-center gap-1">
            <Filter className="w-3.5 h-3.5 text-gray-400" />
            فیلترها:
          </span>

          {/* Status Tabs */}
          <div className="inline-flex p-0.5 bg-gray-100 rounded-md border border-gray-200/80">
            <button
              type="button"
              onClick={() => {
                setStatusFilter('ALL');
                setCurrentPage(1);
              }}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                statusFilter === 'ALL'
                  ? 'bg-white text-slate-900 shadow-2xs font-bold'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              همه ({products.length})
            </button>
            <button
              type="button"
              onClick={() => {
                setStatusFilter('ACTIVE');
                setCurrentPage(1);
              }}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-colors flex items-center gap-1 ${
                statusFilter === 'ACTIVE'
                  ? 'bg-emerald-50 text-emerald-800 shadow-2xs font-bold border border-emerald-200/70'
                  : 'text-gray-600 hover:text-emerald-700'
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              فعال‌ها ({activeCount})
            </button>
            <button
              type="button"
              onClick={() => {
                setStatusFilter('INACTIVE');
                setCurrentPage(1);
              }}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-colors flex items-center gap-1 ${
                statusFilter === 'INACTIVE'
                  ? 'bg-amber-50 text-amber-900 shadow-2xs font-bold border border-amber-200/70'
                  : 'text-gray-600 hover:text-amber-800'
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
              غیرفعال‌ها (جدید وردپرس) ({inactiveCount})
            </button>
          </div>

          <div className="h-4 w-px bg-gray-200 hidden sm:block" />

          {/* Factory Filter */}
          <select
            value={selectedFactory}
            onChange={(e) => {
              setSelectedFactory(e.target.value);
              setCurrentPage(1);
            }}
            className="bg-gray-50 border border-gray-200 rounded px-2.5 py-1 text-xs text-gray-700 focus:outline-none"
          >
            <option value="ALL">تمام کارخانه‌ها</option>
            {factories.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>

          {/* Table Filter */}
          <select
            value={selectedTable}
            onChange={(e) => {
              setSelectedTable(e.target.value);
              setCurrentPage(1);
            }}
            className="bg-gray-50 border border-gray-200 rounded px-2.5 py-1 text-xs text-gray-700 focus:outline-none"
          >
            <option value="ALL">تمام جداول قیمت</option>
            {priceTables.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 text-gray-600">
            <span>تعداد در صفحه:</span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="bg-gray-50 border border-gray-200 rounded px-2 py-1 text-xs font-mono font-medium focus:outline-none"
            >
              <option value={10}>۱۰</option>
              <option value={25}>۲۵</option>
              <option value={50}>۵۰</option>
              <option value={100}>۱۰۰</option>
              <option value={200}>۲۰۰</option>
            </select>
          </div>

          <span className="text-gray-400 font-mono text-[11px]">
            نمایش {totalItems > 0 ? (startIndex + 1).toLocaleString('fa-IR') : '۰'} تا {endIndex.toLocaleString('fa-IR')} از {totalItems.toLocaleString('fa-IR')}
          </span>
        </div>
      </div>

      {/* Bulk Action Toolbar */}
      {selectedIds.size > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900 text-white px-4 py-2.5 rounded-lg shadow-md animate-in fade-in slide-in-from-top-2 duration-150 text-xs">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 bg-slate-800 rounded font-mono font-bold text-amber-300">
              {selectedIds.size}
            </span>
            <span>محصول انتخاب شده است</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={isBatchUpdating}
              onClick={() => handleBulkStatusChange(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded font-medium transition-colors"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>فعال‌سازی موارد انتخاب‌شده</span>
            </button>

            <button
              type="button"
              disabled={isBatchUpdating}
              onClick={() => handleBulkStatusChange(false)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white rounded font-medium transition-colors"
            >
              <XCircle className="w-3.5 h-3.5" />
              <span>غیرفعال‌سازی موارد انتخاب‌شده</span>
            </button>

            <button
              type="button"
              disabled={isBatchUpdating}
              onClick={() => setSelectedIds(new Set())}
              className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded font-medium transition-colors text-[11px]"
            >
              لغو انتخاب
            </button>
          </div>
        </div>
      )}

      {/* Products Table */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-gray-50/80 text-gray-500 font-medium border-b border-gray-200">
              <tr>
                <th className="py-3 px-3 w-10 text-center">
                  <input
                    type="checkbox"
                    checked={isAllOnPageSelected}
                    onChange={toggleSelectAllOnPage}
                    className="rounded border-gray-300 text-slate-900 focus:ring-0 cursor-pointer"
                    title="انتخاب تمام محصولات این صفحه"
                  />
                </th>
                <th className="py-3 px-3 w-16 text-center font-mono">آیدی سیستم</th>
                <th className="py-3 px-3 w-24 text-center font-mono text-purple-900 bg-purple-50/50">آیدی مقصد (post_id)</th>
                <th className="py-3 px-3">نام محصول</th>
                <th className="py-3 px-3 w-24">SKU</th>
                <th className="py-3 px-3 w-28">کارخانه</th>
                <th className="py-3 px-3 w-28">جدول قیمت</th>
                <th className="py-3 px-3 w-32 bg-emerald-50/60 text-emerald-950 font-bold">کمترین سورس بازار</th>
                <th className="py-3 px-3 w-28 text-center bg-purple-50/50 text-purple-950 font-bold">تعدیل (افست)</th>
                <th className="py-3 px-3 w-32 bg-blue-50/60 text-blue-950 font-bold">قیمت نهایی سامانه</th>
                <th className="py-3 px-3 text-center w-28">وضعیت پایش</th>
                <th className="py-3 px-3 text-center w-24">وضعیت اتصال</th>
                <th className="py-3 px-3 text-center w-24">عملیات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {pagedProducts.length === 0 ? (
                <tr>
                  <td colSpan={13} className="py-12 text-center text-gray-400">
                    محصولی با این مشخصات یافت نشد.
                  </td>
                </tr>
              ) : (
                pagedProducts.map((p) => {
                  const isSelected = selectedIds.has(p.id);
                  return (
                    <tr
                      key={p.id}
                      className={`hover:bg-gray-50/80 transition-colors ${
                        isSelected ? 'bg-amber-50/40' : ''
                      }`}
                    >
                      <td className="py-3 px-3 text-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelectOne(p.id)}
                          className="rounded border-gray-300 text-slate-900 focus:ring-0 cursor-pointer"
                        />
                      </td>
                      <td className="py-3 px-3 text-center font-mono font-bold text-slate-900 bg-slate-50/50">#{p.id}</td>
                      <td className="py-3 px-3 text-center font-mono font-bold text-purple-700 bg-purple-50/30">
                        <span className="px-2 py-0.5 rounded bg-purple-100/70 border border-purple-200" title="شناسه دقیق محصول در وردپرس/ووکامرس مقصد">
                          {p.destination_id || p.post_id || '—'}
                        </span>
                      </td>
                      <td className="py-3 px-3 font-medium text-gray-900">{p.name}</td>
                      <td className="py-3 px-3 font-mono text-gray-500">{p.sku || '—'}</td>
                      <td className="py-3 px-3 text-gray-600">{p.factory_name || '—'}</td>
                      <td className="py-3 px-3 text-gray-600">{p.price_table_name || '—'}</td>

                      {/* Lowest Scraped Price */}
                      <td className="py-3 px-3 font-mono text-emerald-800 bg-emerald-50/20 font-semibold">
                        {p.raw_min_price && p.raw_min_price > 0 ? (
                          <span>
                            {p.raw_min_price.toLocaleString('fa-IR')} <span className="text-[10px] text-emerald-600 font-normal">تومان</span>
                          </span>
                        ) : (
                          <span className="text-gray-400 font-normal text-[11px]">—</span>
                        )}
                      </td>

                      {/* Price Adjustment Offset */}
                      <td className="py-3 px-3 text-center font-mono bg-purple-50/10">
                        {(() => {
                          const hasCustom = p.price_adjustment !== undefined && p.price_adjustment !== null;
                          const effAdj = p.effective_adjustment !== undefined ? p.effective_adjustment : (hasCustom ? p.price_adjustment! : 0);
                          if (effAdj === 0) {
                            return <span className="text-gray-300 text-[11px] font-normal">۰</span>;
                          }
                          return (
                            <span
                              className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-bold ${
                                effAdj < 0
                                  ? 'bg-rose-50 text-rose-700 border border-rose-200'
                                  : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              }`}
                              title={hasCustom ? 'تنظیم اختصاصی کالا (اولویت اول)' : 'ارث‌بری از تنظیم جدول قیمت'}
                            >
                              <span>{effAdj > 0 ? `+${effAdj.toLocaleString('fa-IR')}` : effAdj.toLocaleString('fa-IR')}</span>
                              <span className="text-[9px] font-normal text-gray-500">({hasCustom ? 'تک' : 'جدول'})</span>
                            </span>
                          );
                        })()}
                      </td>

                      {/* Final System Price */}
                      <td className="py-3 px-3 font-bold text-slate-900 font-mono bg-blue-50/20">
                        {p.current_price > 0 ? (
                          <span>
                            {p.current_price.toLocaleString('fa-IR')} <span className="text-[10px] text-gray-500 font-normal">تومان</span>
                          </span>
                        ) : (
                          <span className="text-gray-400 font-normal text-[11px]">—</span>
                        )}
                      </td>

                      {/* Interactive Active / Inactive Status Toggle Button */}
                      <td className="py-3 px-3 text-center">
                        <button
                          type="button"
                          onClick={(e) => handleToggleSingleActive(p, e)}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-all cursor-pointer shadow-2xs ${
                            p.active
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100'
                              : 'bg-gray-100 text-gray-600 border-gray-200 hover:bg-gray-200/80 hover:text-gray-800'
                          }`}
                          title="جهت فعال یا غیرفعال‌سازی سریع کلیک کنید"
                        >
                          <span
                            className={`w-2 h-2 rounded-full ${
                              p.active ? 'bg-emerald-500 animate-pulse' : 'bg-gray-400'
                            }`}
                          />
                          <span>{p.active ? 'فعال' : 'غیرفعال'}</span>
                        </button>
                      </td>

                      {/* Destination Sync Status */}
                      <td className="py-3 px-3 text-center">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            p.sync_status === 'SYNCED'
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                              : 'bg-amber-50 text-amber-800 border border-amber-200'
                          }`}
                        >
                          {p.sync_status === 'SYNCED' ? 'متصل به مقصد' : 'همگام‌نشده'}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-3 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => setSelectedProductForDetail(p)}
                            className="p-1.5 text-gray-400 hover:text-slate-900 hover:bg-gray-100 rounded transition-colors"
                            title="مشاهده جزئیات، ویژگی‌ها و تاریخچه"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleOpenEdit(p)}
                            className="p-1.5 text-gray-400 hover:text-slate-900 hover:bg-gray-100 rounded transition-colors"
                            title="ویرایش محصول"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          {onDeleteProduct && (
                            <button
                              onClick={() => setDeletingProduct(p)}
                              className="p-1.5 text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors"
                              title="حذف محصول"
                            >
                              <Trash2 className="w-4 h-4 text-rose-500" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        {totalPages > 1 && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3 bg-gray-50/80 border-t border-gray-200 text-xs">
            <div className="text-gray-500 font-mono">
              صفحه <strong className="text-gray-800 font-bold">{safeCurrentPage}</strong> از <strong className="text-gray-800 font-bold">{totalPages}</strong> ({totalItems.toLocaleString('fa-IR')} قلم محصول)
            </div>

            <div className="flex items-center gap-1">
              {/* First Page */}
              <button
                type="button"
                onClick={() => setCurrentPage(1)}
                disabled={safeCurrentPage === 1}
                className="p-1.5 rounded border border-gray-200 bg-white text-gray-600 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                title="صفحه اول"
              >
                <ChevronsRight className="w-3.5 h-3.5" />
              </button>

              {/* Prev Page */}
              <button
                type="button"
                onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                disabled={safeCurrentPage === 1}
                className="p-1.5 rounded border border-gray-200 bg-white text-gray-600 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                title="صفحه قبل"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>

              {/* Page Number Pills */}
              <div className="flex items-center gap-1 mx-1 font-mono">
                {(() => {
                  const pages: (number | string)[] = [];
                  const maxButtons = 5;
                  let start = Math.max(1, safeCurrentPage - 2);
                  let end = Math.min(totalPages, start + maxButtons - 1);
                  if (end - start < maxButtons - 1) {
                    start = Math.max(1, end - maxButtons + 1);
                  }

                  if (start > 1) {
                    pages.push(1);
                    if (start > 2) pages.push('...');
                  }

                  for (let i = start; i <= end; i++) {
                    pages.push(i);
                  }

                  if (end < totalPages) {
                    if (end < totalPages - 1) pages.push('...');
                    pages.push(totalPages);
                  }

                  return pages.map((pg, idx) => {
                    if (pg === '...') {
                      return (
                        <span key={`dots-${idx}`} className="px-1 text-gray-400">
                          ...
                        </span>
                      );
                    }
                    const isCur = pg === safeCurrentPage;
                    return (
                      <button
                        key={`page-${pg}`}
                        type="button"
                        onClick={() => setCurrentPage(Number(pg))}
                        className={`min-w-7 h-7 px-2 rounded font-semibold text-xs transition-colors ${
                          isCur
                            ? 'bg-slate-900 text-white shadow-2xs'
                            : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-100'
                        }`}
                      >
                        {pg}
                      </button>
                    );
                  });
                })()}
              </div>

              {/* Next Page */}
              <button
                type="button"
                onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                disabled={safeCurrentPage === totalPages}
                className="p-1.5 rounded border border-gray-200 bg-white text-gray-600 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                title="صفحه بعد"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>

              {/* Last Page */}
              <button
                type="button"
                onClick={() => setCurrentPage(totalPages)}
                disabled={safeCurrentPage === totalPages}
                className="p-1.5 rounded border border-gray-200 bg-white text-gray-600 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                title="صفحه آخر"
              >
                <ChevronsLeft className="w-3.5 h-3.5" />
              </button>

              {/* Jump to page form */}
              <div className="flex items-center gap-1 mr-2 pl-1 border-r border-gray-200">
                <input
                  type="number"
                  min="1"
                  max={totalPages}
                  placeholder="شماره"
                  value={jumpPageInput}
                  onChange={(e) => setJumpPageInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      const p = parseInt(jumpPageInput, 10);
                      if (p >= 1 && p <= totalPages) {
                        setCurrentPage(p);
                        setJumpPageInput('');
                      }
                    }
                  }}
                  className="w-14 px-2 py-1 text-center bg-white border border-gray-200 rounded font-mono text-xs focus:outline-none focus:border-slate-800"
                />
                <button
                  type="button"
                  onClick={() => {
                    const p = parseInt(jumpPageInput, 10);
                    if (p >= 1 && p <= totalPages) {
                      setCurrentPage(p);
                      setJumpPageInput('');
                    }
                  }}
                  className="px-2 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded text-[11px] font-medium transition-colors"
                >
                  برو
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Product Detail Modal */}
      <ProductDetailModal
        product={selectedProductForDetail}
        selectors={selectors}
        priceChanges={priceChanges}
        onClose={() => setSelectedProductForDetail(null)}
      />

      {/* Edit / Add Product Modal */}
      {isEditModalOpen && editingProduct && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl border border-gray-200 w-full max-w-lg p-6 animate-in fade-in zoom-in-95 duration-150">
            <h3 className="text-sm font-bold text-gray-900 mb-4">
              {editingProduct.id ? `ویرایش محصول (آیدی سیستم: #${editingProduct.id})` : 'افزودن محصول جدید'}
            </h3>

            <form onSubmit={handleSubmitSave} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-gray-700 font-semibold">
                      آیدی سایت مقصد (post_id) <span className="text-rose-500">*</span>
                    </label>
                  </div>
                  <input
                    type="number"
                    required
                    placeholder="مثال: 1840"
                    value={editingProduct.destination_id ?? editingProduct.post_id ?? ''}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10);
                      setEditingProduct({
                        ...editingProduct,
                        destination_id: isNaN(val) ? undefined : val,
                        post_id: isNaN(val) ? 0 : val
                      });
                    }}
                    className="w-full px-3 py-1.5 bg-gray-50 border border-gray-200 rounded focus:bg-white focus:outline-none focus:border-slate-800 font-mono font-bold text-purple-900"
                  />
                  <p className="text-[10px] text-gray-500 mt-1">
                    شناسه یکتای محصول در وردپرس/ووکامرس (مانع از ثبت تکراری)
                  </p>
                </div>

                <div>
                  <label className="block text-gray-700 font-medium mb-1">شناسه فنی SKU</label>
                  <input
                    type="text"
                    value={editingProduct.sku || ''}
                    onChange={(e) => setEditingProduct({ ...editingProduct, sku: e.target.value })}
                    className="w-full px-3 py-1.5 bg-gray-50 border border-gray-200 rounded focus:bg-white focus:outline-none focus:border-slate-800 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-gray-700 font-medium mb-1">
                  نام محصول <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={editingProduct.name || ''}
                  onChange={(e) => setEditingProduct({ ...editingProduct, name: e.target.value })}
                  className="w-full px-3 py-1.5 bg-gray-50 border border-gray-200 rounded focus:bg-white focus:outline-none focus:border-slate-800"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-gray-700 font-medium mb-1">کارخانه</label>
                  <select
                    value={editingProduct.factory_id || 1}
                    onChange={(e) =>
                      setEditingProduct({ ...editingProduct, factory_id: parseInt(e.target.value, 10) })
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

                <div>
                  <label className="block text-gray-700 font-medium mb-1">جدول قیمت</label>
                  <select
                    value={editingProduct.price_table_id || 1}
                    onChange={(e) =>
                      setEditingProduct({ ...editingProduct, price_table_id: parseInt(e.target.value, 10) })
                    }
                    className="w-full px-3 py-1.5 bg-gray-50 border border-gray-200 rounded focus:bg-white focus:outline-none"
                  >
                    {priceTables.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="p-3.5 bg-purple-50/70 border border-purple-200/90 rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-purple-950 font-bold text-xs">
                    تعدیل اختصاصی قیمت این محصول (افست به تومان)
                  </label>
                  <span className="text-[10px] text-purple-800 bg-white px-2 py-0.5 rounded border border-purple-300 font-semibold">
                    ★ اولویت اول نسبت به جدول قیمت
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    placeholder="مثلاً 100- برای کسر یا 200+ برای افزایش (خالی = ارث‌بری از جدول)"
                    value={editingProduct.price_adjustment ?? ''}
                    onChange={(e) =>
                      setEditingProduct({
                        ...editingProduct,
                        price_adjustment: e.target.value === '' ? null : parseFloat(e.target.value)
                      })
                    }
                    className="flex-1 px-3 py-2 bg-white border border-purple-300 rounded focus:bg-white focus:outline-none focus:border-purple-600 font-mono text-xs"
                  />
                  <span className="text-xs text-purple-900 font-medium">تومان</span>
                </div>
                <p className="text-[11px] text-purple-900/80 leading-relaxed">
                  مقدار اضافه (+) یا کسر (-) به تومان از کمترین قیمت استخراج‌شده بین سورس‌ها. اگر خالی بماند، به صورت پیش‌فرض از تنظیم جدول قیمت ارث‌بری خواهد کرد.
                </p>
                {editingProduct.raw_min_price && editingProduct.raw_min_price > 0 && (
                  <div className="pt-1.5 border-t border-purple-200/60 flex items-center justify-between text-xs text-purple-950">
                    <span>کمترین نرخ بازار: <strong className="font-mono">{editingProduct.raw_min_price.toLocaleString('fa-IR')}</strong> تومان</span>
                    <span>
                      قیمت نهایی جدید:{' '}
                      <strong className="font-mono font-bold text-emerald-800">
                        {Math.max(
                          0,
                          editingProduct.raw_min_price +
                            (editingProduct.price_adjustment !== null && editingProduct.price_adjustment !== undefined
                              ? editingProduct.price_adjustment
                              : (priceTables.find((t) => t.id === editingProduct.price_table_id)?.default_price_adjustment || 0))
                        ).toLocaleString('fa-IR')}{' '}
                        تومان
                      </strong>
                    </span>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-gray-700 font-medium mb-1">قیمت فعلی سیستم (تومان)</label>
                <input
                  type="number"
                  value={editingProduct.current_price || ''}
                  onChange={(e) =>
                    setEditingProduct({ ...editingProduct, current_price: parseFloat(e.target.value) || 0 })
                  }
                  className="w-full px-3 py-1.5 bg-gray-50 border border-gray-200 rounded focus:bg-white focus:outline-none focus:border-slate-800 font-mono text-xs"
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="prod-active-toggle"
                  checked={editingProduct.active ?? true}
                  onChange={(e) => setEditingProduct({ ...editingProduct, active: e.target.checked })}
                  className="rounded text-slate-900 focus:ring-0"
                />
                <label htmlFor="prod-active-toggle" className="text-gray-700 font-medium cursor-pointer">
                  محصول در جدول فعال باشد و پایش شود
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="px-4 py-1.5 text-xs text-gray-700 hover:bg-gray-100 rounded transition-colors"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded transition-colors"
                >
                  ذخیره اطلاعات
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingProduct && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl border border-gray-200 w-full max-w-md p-6 animate-in fade-in zoom-in-95 duration-150 space-y-4">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="p-2.5 bg-rose-50 rounded-full">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-gray-900">تأیید حذف محصول</h3>
                <p className="text-xs text-gray-500 mt-0.5">این عملیات غیرقابل بازگشت است.</p>
              </div>
            </div>

            <div className="p-3 bg-gray-50 rounded-lg border border-gray-200 text-xs text-gray-700 space-y-1">
              <p>
                آیا از حذف محصول <strong>«{deletingProduct.name}»</strong> (شناسه post_id:{' '}
                <span className="font-mono font-bold text-slate-800">{deletingProduct.post_id}</span>) اطمینان دارید؟
              </p>
              <p className="text-[11px] text-gray-500 pt-1">
                توجه: با حذف این محصول، تمام سلکتورهای استخراج و تاریخچه تغییرات قیمت مرتبط با آن حذف خواهند شد.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setDeletingProduct(null)}
                className="px-4 py-2 text-xs font-medium text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
              >
                انصراف
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={async () => {
                  if (!onDeleteProduct || !deletingProduct) return;
                  setIsDeleting(true);
                  try {
                    await onDeleteProduct(deletingProduct.id);
                    setDeletingProduct(null);
                  } finally {
                    setIsDeleting(false);
                  }
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-50 rounded-md transition-colors shadow-xs"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{isDeleting ? 'در حال حذف...' : 'حذف قطعی محصول'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

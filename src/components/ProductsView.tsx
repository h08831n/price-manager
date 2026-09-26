import React, { useState } from 'react';
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
  Filter
} from 'lucide-react';
import { Product, Factory, PriceTable, ProductSelector, PriceChange } from '../types';
import { ProductDetailModal } from './ProductDetailModal';

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
  onDownloadTemplate
}) => {
  const [search, setSearch] = useState('');
  const [selectedFactory, setSelectedFactory] = useState<string>('ALL');
  const [selectedTable, setSelectedTable] = useState<string>('ALL');
  const [selectedProductForDetail, setSelectedProductForDetail] = useState<Product | null>(null);

  // Edit/Add modal state
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Partial<Product> | null>(null);

  // Delete modal state
  const [deletingProduct, setDeletingProduct] = useState<Product | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Filter products
  const filteredProducts = products.filter((p) => {
    const matchesSearch =
      !search ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      String(p.post_id).includes(search) ||
      (p.sku && p.sku.toLowerCase().includes(search.toLowerCase()));

    const matchesFactory = selectedFactory === 'ALL' || p.factory_id === parseInt(selectedFactory, 10);
    const matchesTable = selectedTable === 'ALL' || p.price_table_id === parseInt(selectedTable, 10);

    return matchesSearch && matchesFactory && matchesTable;
  });

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

      {/* Filters Bar */}
      <div className="flex items-center gap-3 bg-white px-4 py-2.5 rounded-lg border border-gray-200 text-xs">
        <span className="text-gray-500 font-medium flex items-center gap-1">
          <Filter className="w-3.5 h-3.5" />
          فیلترها:
        </span>

        {/* Factory Filter */}
        <select
          value={selectedFactory}
          onChange={(e) => setSelectedFactory(e.target.value)}
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
          onChange={(e) => setSelectedTable(e.target.value)}
          className="bg-gray-50 border border-gray-200 rounded px-2.5 py-1 text-xs text-gray-700 focus:outline-none"
        >
          <option value="ALL">تمام جداول قیمت</option>
          {priceTables.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>

        <span className="text-gray-400 mr-auto">
          نمایش {filteredProducts.length.toLocaleString('fa-IR')} از {products.length.toLocaleString('fa-IR')} محصول
        </span>
      </div>

      {/* Products Table */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-gray-50/80 text-gray-500 font-medium border-b border-gray-200">
              <tr>
                <th className="py-3 px-4 w-28">post_id</th>
                <th className="py-3 px-4">نام محصول</th>
                <th className="py-3 px-4">SKU</th>
                <th className="py-3 px-4">کارخانه</th>
                <th className="py-3 px-4">جدول قیمت</th>
                <th className="py-3 px-4">قیمت فعلی (تومان)</th>
                <th className="py-3 px-4 text-center w-24">وضعیت</th>
                <th className="py-3 px-4 text-center w-28">عملیات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-gray-400">
                    محصولی با این مشخصات یافت نشد.
                  </td>
                </tr>
              ) : (
                filteredProducts.map((p) => (
                  <tr key={p.id} className="hover:bg-gray-50/80 transition-colors">
                    <td className="py-3 px-4 font-mono font-medium text-slate-700">{p.post_id}</td>
                    <td className="py-3 px-4 font-medium text-gray-900">{p.name}</td>
                    <td className="py-3 px-4 font-mono text-gray-500">{p.sku || '—'}</td>
                    <td className="py-3 px-4 text-gray-600">{p.factory_name || '—'}</td>
                    <td className="py-3 px-4 text-gray-600">{p.price_table_name || '—'}</td>
                    <td className="py-3 px-4 font-semibold text-gray-900">
                      {p.current_price > 0 ? p.current_price.toLocaleString('fa-IR') : '—'}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${
                          p.active ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-gray-100 text-gray-500'
                        }`}
                      >
                        {p.active ? 'فعال' : 'غیرفعال'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center">
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
                ))
              )}
            </tbody>
          </table>
        </div>
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
              {editingProduct.id ? 'ویرایش محصول' : 'افزودن محصول جدید'}
            </h3>

            <form onSubmit={handleSubmitSave} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-gray-700 font-medium mb-1">
                    شناسه ووکامرس post_id <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    required
                    disabled={Boolean(editingProduct.id)}
                    value={editingProduct.post_id || ''}
                    onChange={(e) =>
                      setEditingProduct({ ...editingProduct, post_id: parseInt(e.target.value, 10) })
                    }
                    className="w-full px-3 py-1.5 bg-gray-50 border border-gray-200 rounded focus:bg-white focus:outline-none focus:border-slate-800 disabled:opacity-50"
                  />
                </div>

                <div>
                  <label className="block text-gray-700 font-medium mb-1">شناسه فنی SKU</label>
                  <input
                    type="text"
                    value={editingProduct.sku || ''}
                    onChange={(e) => setEditingProduct({ ...editingProduct, sku: e.target.value })}
                    className="w-full px-3 py-1.5 bg-gray-50 border border-gray-200 rounded focus:bg-white focus:outline-none focus:border-slate-800"
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

              <div>
                <label className="block text-gray-700 font-medium mb-1">قیمت فعلی (تومان)</label>
                <input
                  type="number"
                  value={editingProduct.current_price || ''}
                  onChange={(e) =>
                    setEditingProduct({ ...editingProduct, current_price: parseFloat(e.target.value) || 0 })
                  }
                  className="w-full px-3 py-1.5 bg-gray-50 border border-gray-200 rounded focus:bg-white focus:outline-none focus:border-slate-800"
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

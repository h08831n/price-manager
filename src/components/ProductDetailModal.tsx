import React from 'react';
import { X, ExternalLink, Calendar, TrendingUp, TrendingDown, Layers, Hash } from 'lucide-react';
import { Product, ProductSelector, PriceChange } from '../types';

interface ProductDetailModalProps {
  product: Product | null;
  selectors: ProductSelector[];
  priceChanges: PriceChange[];
  onClose: () => void;
}

export const ProductDetailModal: React.FC<ProductDetailModalProps> = ({
  product,
  selectors,
  priceChanges,
  onClose
}) => {
  if (!product) return null;

  const productSelectors = selectors.filter((s) => s.product_id === product.id || s.post_id === product.post_id);
  const productChanges = priceChanges.filter((c) => c.product_id === product.id || c.post_id === product.post_id);

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4 backdrop-blur-xs">
      <div className="bg-white rounded-xl shadow-xl border border-gray-200 w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between bg-slate-50/50">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs px-2 py-0.5 rounded bg-slate-200 text-slate-800 font-mono font-bold">
                post_id: {product.post_id}
              </span>
              <h2 className="text-base font-bold text-gray-900">{product.name}</h2>
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              کارخانه: {product.factory_name || 'نامشخص'} • جدول: {product.price_table_name || 'نامشخص'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-700 rounded-md hover:bg-gray-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6">
          {/* Top Quick Stats */}
          <div className="grid grid-cols-3 gap-4">
            <div className="p-4 rounded-lg bg-gray-50 border border-gray-100">
              <span className="text-xs text-gray-500">قیمت فعلی سیستم</span>
              <div className="text-lg font-bold text-gray-900 mt-1">
                {product.current_price.toLocaleString('fa-IR')} <span className="text-xs font-normal text-gray-500">تومان</span>
              </div>
            </div>

            <div className="p-4 rounded-lg bg-gray-50 border border-gray-100">
              <span className="text-xs text-gray-500">کد محصول (SKU)</span>
              <div className="text-base font-bold text-gray-900 mt-1 font-mono">
                {product.sku || '—'}
              </div>
            </div>

            <div className="p-4 rounded-lg bg-gray-50 border border-gray-100">
              <span className="text-xs text-gray-500">وضعیت پایش</span>
              <div className="mt-1">
                <span
                  className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    product.active
                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                      : 'bg-gray-200 text-gray-700'
                  }`}
                >
                  {product.active ? 'فعال در جدول' : 'غیرفعال'}
                </span>
              </div>
            </div>
          </div>

          {/* WooCommerce Attributes Section (Requirement #4) */}
          <div>
            <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-slate-500" />
              <span>ویژگی‌های ووکامرس (WooCommerce Attributes)</span>
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-gray-50 p-3 rounded-lg border border-gray-200">
              {product.attributes && Object.keys(product.attributes).length > 0 ? (
                Object.entries(product.attributes).map(([key, value]) => (
                  <div key={key} className="bg-white p-2.5 rounded border border-gray-200 text-xs">
                    <span className="text-gray-400 block font-mono text-[10px]">{key}</span>
                    <span className="font-semibold text-gray-800 mt-0.5 block">{String(value)}</span>
                  </div>
                ))
              ) : (
                <div className="col-span-4 text-xs text-gray-400 text-center py-2">
                  ویژگی اختصاصی برای این محصول ثبت نشده است.
                </div>
              )}
            </div>
          </div>

          {/* Configured XPaths across Table Sources */}
          <div>
            <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Hash className="w-3.5 h-3.5 text-slate-500" />
              <span>سلکتورهای استخراج قیمت این کالا در منابع ({productSelectors.length})</span>
            </h3>
            <div className="border border-gray-200 rounded-lg overflow-hidden divide-y divide-gray-100">
              {productSelectors.length === 0 ? (
                <div className="p-4 text-center text-xs text-gray-400">
                  هنوز سلکتور XPath برای این محصول ثبت نشده است.
                </div>
              ) : (
                productSelectors.map((sel) => (
                  <div key={sel.id} className="p-3 text-xs flex items-center justify-between hover:bg-gray-50">
                    <div>
                      <div className="font-medium text-gray-900">{sel.site_name || `منبع #${sel.table_source_id}`}</div>
                      <div className="font-mono text-[11px] text-slate-600 dir-ltr text-right mt-1 bg-gray-100 px-2 py-1 rounded inline-block">
                        {sel.price_xpath}
                      </div>
                    </div>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded font-medium ${
                        sel.active ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      {sel.active ? 'فعال' : 'غیرفعال'}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Price Change History */}
          <div>
            <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <TrendingUp className="w-3.5 h-3.5 text-slate-500" />
              <span>تاریخچه تغییرات قیمت ({productChanges.length})</span>
            </h3>
            <div className="border border-gray-200 rounded-lg overflow-hidden divide-y divide-gray-100 max-h-48 overflow-y-auto">
              {productChanges.length === 0 ? (
                <div className="p-4 text-center text-xs text-gray-400">
                  هیچ نوسان قیمتی برای این کالا تاکنون ثبت نشده است.
                </div>
              ) : (
                productChanges.map((ch) => (
                  <div key={ch.id} className="p-3 text-xs flex items-center justify-between hover:bg-gray-50">
                    <div className="flex items-center gap-3">
                      {ch.direction === 'UP' ? (
                        <TrendingUp className="w-4 h-4 text-rose-500" />
                      ) : ch.direction === 'DOWN' ? (
                        <TrendingDown className="w-4 h-4 text-emerald-500" />
                      ) : (
                        <span className="w-4 h-4 text-gray-400 text-center">—</span>
                      )}
                      <div>
                        <div className="font-medium text-gray-900">
                          {ch.old_price.toLocaleString('fa-IR')} ← {ch.new_price.toLocaleString('fa-IR')} تومان
                        </div>
                        <div className="text-[11px] text-gray-500">
                          {new Date(ch.created_at).toLocaleString('fa-IR')}
                        </div>
                      </div>
                    </div>

                    <div className="text-left">
                      <span
                        className={`font-semibold ${
                          ch.direction === 'UP'
                            ? 'text-rose-600'
                            : ch.direction === 'DOWN'
                            ? 'text-emerald-600'
                            : 'text-gray-500'
                        }`}
                      >
                        {ch.direction === 'UP' ? '+' : ch.direction === 'DOWN' ? '-' : ''}
                        {Math.abs(ch.change_percent)}%
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-gray-200 bg-gray-50 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
          >
            بستن
          </button>
        </div>
      </div>
    </div>
  );
};

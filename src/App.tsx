import React, { useState, useEffect, useCallback } from 'react';
import { Header } from './components/Header';
import { DashboardView } from './components/DashboardView';
import { ProductsView } from './components/ProductsView';
import { FactoriesView } from './components/FactoriesView';
import { PriceTablesView } from './components/PriceTablesView';
import { PriceTableDetailView } from './components/PriceTableDetailView';
import { SitesView } from './components/SitesView';
import { RunsView } from './components/RunsView';
import { ErrorsView } from './components/ErrorsView';
import { LogsView } from './components/LogsView';
import { SettingsView } from './components/SettingsView';
import { HistoryView } from './components/HistoryView';
import { ExcelImportModal } from './components/ExcelImportModal';
import { XPathPickerModal } from './components/XPathPickerModal';
import { XPathTesterModal } from './components/XPathTesterModal';
import {
  DashboardData,
  Product,
  Factory,
  PriceTable,
  Site,
  SourcePage,
  TableSource,
  ProductSelector,
  PageAction,
  ExecutionRun,
  SystemError,
  SystemLog,
  ConfigHistoryItem,
  ImportHistoryItem,
  PriceChange,
  TableRevision,
  TableRevisionItem,
  GlobalSettings
} from './types';

export default function App() {
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [selectedTable, setSelectedTable] = useState<PriceTable | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Core Data State
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [factories, setFactories] = useState<Factory[]>([]);
  const [priceTables, setPriceTables] = useState<PriceTable[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [sourcePages, setSourcePages] = useState<SourcePage[]>([]);
  const [tableSources, setTableSources] = useState<TableSource[]>([]);
  const [selectors, setSelectors] = useState<ProductSelector[]>([]);
  const [pageActions, setPageActions] = useState<PageAction[]>([]);
  const [runs, setRuns] = useState<ExecutionRun[]>([]);
  const [errors, setErrors] = useState<SystemError[]>([]);
  const [logs, setLogs] = useState<SystemLog[]>([]);
  const [configHistory, setConfigHistory] = useState<ConfigHistoryItem[]>([]);
  const [importHistory, setImportHistory] = useState<ImportHistoryItem[]>([]);
  const [priceChanges, setPriceChanges] = useState<PriceChange[]>([]);
  const [tableRevisions, setTableRevisions] = useState<TableRevision[]>([]);
  const [tableRevisionItems, setTableRevisionItems] = useState<TableRevisionItem[]>([]);
  const [settings, setSettings] = useState<GlobalSettings | null>(null);

  // Global Modals State
  const [importModal, setImportModal] = useState<{ isOpen: boolean; entityType: string; title: string } | null>(null);
  const [pickerModal, setPickerModal] = useState<{
    isOpen: boolean;
    url: string;
    sourceId?: number;
    target?: 'TABLE_UPDATE' | 'PRODUCT_UPDATE' | 'PRODUCT_PRICE';
    onSelect?: (xpath: string) => void;
  } | null>(null);
  const [testerModal, setTesterModal] = useState<{ isOpen: boolean; url: string; xpath?: string; sourceId?: number; type?: 'PRICE' | 'DATE' } | null>(null);

  // Toast Notification
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  // Safe API Fetch Helpers
  const safeJson = async (res: Response) => {
    try {
      const text = await res.text();
      return text ? JSON.parse(text) : {};
    } catch {
      return { error: `پاسخ نامعتبر از سرور (کد ${res.status})` };
    }
  };

  const fetchJson = async <T,>(url: string, fallback: T): Promise<T> => {
    try {
      const res = await fetch(url);
      if (!res.ok) {
        console.warn(`[API] Endpoint ${url} returned ${res.status}`);
        return fallback;
      }
      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        console.warn(`[API] Endpoint ${url} returned non-JSON response`);
        return fallback;
      }
      return await res.json();
    } catch (err) {
      console.warn(`[API] Fetch failed for ${url}:`, err);
      return fallback;
    }
  };

  // Fetch All Application Data
  const loadAllData = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const [
        dashRes,
        prodRes,
        facRes,
        tblRes,
        siteRes,
        spRes,
        tsRes,
        selRes,
        actRes,
        runRes,
        errRes,
        logRes,
        confHistRes,
        impHistRes,
        changesRes,
        revRes,
        settRes
      ] = await Promise.all([
        fetchJson<DashboardData | null>('/api/dashboard', null),
        fetchJson<Product[]>('/api/products', []),
        fetchJson<Factory[]>('/api/factories', []),
        fetchJson<PriceTable[]>('/api/price-tables', []),
        fetchJson<Site[]>('/api/sites', []),
        fetchJson<SourcePage[]>('/api/source-pages', []),
        fetchJson<TableSource[]>('/api/table-sources', []),
        fetchJson<ProductSelector[]>('/api/selectors', []),
        fetchJson<PageAction[]>('/api/page-actions', []),
        fetchJson<ExecutionRun[]>('/api/runs', []),
        fetchJson<SystemError[]>('/api/errors', []),
        fetchJson<SystemLog[]>('/api/logs', []),
        fetchJson<ConfigHistoryItem[]>('/api/history/config', []),
        fetchJson<ImportHistoryItem[]>('/api/history/import', []),
        fetchJson<PriceChange[]>('/api/price-changes', []),
        fetchJson<TableRevision[]>('/api/table-revisions', []),
        fetchJson<GlobalSettings | null>('/api/settings', null)
      ]);

      if (dashRes) setDashboardData(dashRes);
      if (Array.isArray(prodRes)) setProducts(prodRes);
      if (Array.isArray(facRes)) setFactories(facRes);
      if (Array.isArray(tblRes)) setPriceTables(tblRes);
      if (Array.isArray(siteRes)) setSites(siteRes);
      if (Array.isArray(spRes)) setSourcePages(spRes);
      if (Array.isArray(tsRes)) setTableSources(tsRes);
      if (Array.isArray(selRes)) setSelectors(selRes);
      if (Array.isArray(actRes)) setPageActions(actRes);
      if (Array.isArray(runRes)) setRuns(runRes);
      if (Array.isArray(errRes)) setErrors(errRes);
      if (Array.isArray(logRes)) setLogs(logRes);
      if (Array.isArray(confHistRes)) setConfigHistory(confHistRes);
      if (Array.isArray(impHistRes)) setImportHistory(impHistRes);
      if (Array.isArray(changesRes)) setPriceChanges(changesRes);
      if (Array.isArray(revRes)) setTableRevisions(revRes);
      if (settRes) setSettings(settRes);

      // Keep selectedTable in sync if open
      if (selectedTable && Array.isArray(tblRes)) {
        const refreshedTbl = tblRes.find((t: PriceTable) => t.id === selectedTable.id);
        if (refreshedTbl) setSelectedTable(refreshedTbl);
      }
    } catch (err: any) {
      console.error('Error loading data:', err);
      showToast('خطا در برقراری ارتباط با سرور', 'error');
    } finally {
      setIsRefreshing(false);
    }
  }, [selectedTable]);

  useEffect(() => {
    loadAllData();
    // Auto polling every 20s
    const timer = setInterval(() => {
      loadAllData();
    }, 20000);
    return () => clearInterval(timer);
  }, []);

  // Action Handlers
  const handleRunTable = async (tableId: number) => {
    try {
      showToast('اجرای جدول قیمت آغاز شد...', 'info');
      const res = await fetch(`/api/price-tables/${tableId}/run`, { method: 'POST' });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data.error || 'خطا در اجرای جدول');
      showToast('اجرای جدول با موفقیت به پایان رسید');
      loadAllData();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const handleRunSource = async (sourceId: number) => {
    try {
      showToast('اجرای منبع آغاز شد...', 'info');
      const res = await fetch(`/api/table-sources/${sourceId}/run`, { method: 'POST' });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data.error || 'خطا در اجرای منبع');
      showToast('اجرای منبع با موفقیت انجام شد');
      loadAllData();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const handleSaveProduct = async (prod: Partial<Product>) => {
    try {
      const method = prod.id ? 'PUT' : 'POST';
      const url = prod.id ? `/api/products/${prod.id}` : '/api/products';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(prod)
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data.error || 'خطا در ذخیره محصول');
      showToast(prod.id ? 'محصول بروزرسانی شد' : 'محصول با موفقیت اضافه شد');
      loadAllData();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const handleSaveFactory = async (fac: Partial<Factory>) => {
    try {
      const method = fac.id ? 'PUT' : 'POST';
      const url = fac.id ? `/api/factories/${fac.id}` : '/api/factories';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fac)
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data.error || 'خطا در ثبت کارخانه');
      showToast(fac.id ? 'کارخانه بروزرسانی شد' : 'کارخانه جدید با موفقیت ثبت شد');
      loadAllData();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const handleSavePriceTable = async (table: Partial<PriceTable>) => {
    try {
      const method = table.id ? 'PUT' : 'POST';
      const url = table.id ? `/api/price-tables/${table.id}` : '/api/price-tables';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(table)
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data.error || 'خطا در ذخیره جدول');
      showToast(table.id ? 'جدول قیمت بروزرسانی شد' : 'جدول قیمت جدید ثبت شد');
      await loadAllData();
      if (selectedTable && table.id && selectedTable.id === table.id) {
        setSelectedTable((prev) => (prev ? { ...prev, ...data } : null));
      }
      return data;
    } catch (err: any) {
      showToast(err.message, 'error');
      throw err;
    }
  };

  const handleSaveSite = async (site: Partial<Site>) => {
    try {
      const method = site.id ? 'PUT' : 'POST';
      const url = site.id ? `/api/sites/${site.id}` : '/api/sites';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(site)
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data.error || 'خطا در ثبت سایت');
      showToast('اطلاعات سایت با موفقیت ذخیره شد');
      loadAllData();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const handleSaveSourcePage = async (page: Partial<SourcePage>) => {
    try {
      const res = await fetch('/api/source-pages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(page)
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data.error || 'خطا در ثبت صفحه');
      showToast('صفحه منبع با موفقیت اضافه شد');
      loadAllData();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const handleSavePageAction = async (action: Partial<PageAction>) => {
    try {
      const res = await fetch('/api/page-actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(action)
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data.error || 'خطا در ثبت دستور');
      showToast('دستور شبیه‌سازی مرورگر اضافه شد');
      loadAllData();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const handleDeletePageAction = async (id: number) => {
    try {
      const res = await fetch(`/api/page-actions/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('خطا در حذف دستور');
      showToast('دستور حذف گردید');
      loadAllData();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const handleSaveSelector = async (
    tableSourceId: number,
    productId: number,
    data: { price_xpath?: string; update_time_xpath?: string; active?: boolean }
  ) => {
    try {
      const res = await fetch(`/api/table-sources/${tableSourceId}/products/${productId}/selector`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      const result = await safeJson(res);
      if (!res.ok) throw new Error(result.error || 'خطا در ذخیره سلکتور');
      showToast('سلکتور با موفقیت بروزرسانی شد');
      loadAllData();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const handleSaveTableSource = async (ts: Partial<TableSource>) => {
    try {
      const method = ts.id ? 'PUT' : 'POST';
      const url = ts.id ? `/api/table-sources/${ts.id}` : '/api/table-sources';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ts)
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data.error || 'خطا در ثبت منبع جدول');
      showToast('اطلاعات منبع با موفقیت ذخیره شد');
      loadAllData();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const handleDeleteTableSource = async (id: number) => {
    try {
      const res = await fetch(`/api/table-sources/${id}`, { method: 'DELETE' });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data.error || 'خطا در حذف منبع جدول');
      showToast('منبع جدول با موفقیت حذف گردید');
      loadAllData();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const handleResolveError = async (id: number) => {
    try {
      const res = await fetch(`/api/errors/${id}/resolve`, { method: 'POST' });
      if (!res.ok) throw new Error('خطا در تغییر وضعیت');
      showToast('خطا به عنوان حل شده علامت‌گذاری شد');
      loadAllData();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const handleIgnoreError = async (id: number) => {
    try {
      const res = await fetch(`/api/errors/${id}/ignore`, { method: 'POST' });
      if (!res.ok) throw new Error('خطا در تغییر وضعیت');
      showToast('خطا نادیده گرفته شد');
      loadAllData();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const handleRetryError = async (id: number) => {
    try {
      showToast('تلاش مجدد آغاز شد...', 'info');
      const res = await fetch(`/api/errors/${id}/retry`, { method: 'POST' });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data.error || 'خطا در تلاش مجدد');
      showToast('تلاش مجدد با موفقیت انجام شد و خطا رفع گردید');
      loadAllData();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const handleRetryPublish = async (revisionId: number) => {
    try {
      showToast('در حال ارسال مجدد به وردپرس...', 'info');
      const res = await fetch(`/api/wordpress/retry-publish/${revisionId}`, { method: 'POST' });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data.error || 'خطا در ارسال به وردپرس');
      showToast('قیمت‌ها با موفقیت در ووکامرس بروزرسانی شدند');
      loadAllData();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const handleSaveSettings = async (newSettings: Partial<GlobalSettings>) => {
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newSettings)
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data.error || 'خطا در ذخیره تنظیمات');
      setSettings(data);
      showToast('تنظیمات با موفقیت در سیستم ذخیره گردید');
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  // Excel Downloads
  const handleExport = (entity: string) => {
    window.open(`/api/excel/export/${entity}`, '_blank');
  };

  const handleDownloadTemplate = (entity: string) => {
    window.open(`/api/excel/template/${entity}`, '_blank');
  };

  const openImportModal = (entityType: string) => {
    const titles: Record<string, string> = {
      products: 'محصولات و ویژگی‌های ووکامرس',
      factories: 'کارخانجات',
      price_tables: 'جداول قیمت',
      sites: 'سایت‌های رقیب'
    };
    setImportModal({
      isOpen: true,
      entityType,
      title: titles[entityType] || entityType
    });
  };

  return (
    <div className="min-h-screen bg-slate-50/50 text-gray-900 flex flex-col font-sans selection:bg-slate-900 selection:text-white">
      {/* Toast Alert */}
      {toast && (
        <div className="fixed bottom-5 left-5 z-50 animate-in fade-in slide-in-from-bottom-3 duration-200">
          <div
            className={`px-4 py-2.5 rounded-lg shadow-lg text-xs font-semibold flex items-center gap-2 border ${
              toast.type === 'error'
                ? 'bg-rose-900 text-white border-rose-800'
                : toast.type === 'info'
                ? 'bg-slate-900 text-white border-slate-800'
                : 'bg-emerald-900 text-white border-emerald-800'
            }`}
          >
            <span>{toast.message}</span>
          </div>
        </div>
      )}

      {/* Main Header */}
      <Header
        activeTab={selectedTable ? 'price_tables' : activeTab}
        setActiveTab={(tab) => {
          setSelectedTable(null);
          setActiveTab(tab);
        }}
        openErrorsCount={dashboardData?.open_errors_count || 0}
        onRefresh={loadAllData}
        isRefreshing={isRefreshing}
      />

      {/* Main Application Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6">
        {/* If a price table detail is selected */}
        {selectedTable ? (
          <PriceTableDetailView
            table={selectedTable}
            sources={tableSources}
            products={products}
            selectors={selectors}
            revisions={tableRevisions}
            revisionItems={tableRevisionItems}
            sites={sites}
            sourcePages={sourcePages}
            factories={factories}
            onBack={() => setSelectedTable(null)}
            onRunTable={handleRunTable}
            onRunSource={handleRunSource}
            onSaveTable={handleSavePriceTable}
            onSaveTableSource={handleSaveTableSource}
            onDeleteTableSource={handleDeleteTableSource}
            onSaveSelector={handleSaveSelector}
            onOpenPicker={(url, sourceId, onSelect, target) =>
              setPickerModal({ isOpen: true, url, sourceId, onSelect, target })
            }
            onOpenTester={(sourceId, url, xpath, type) =>
              setTesterModal({ isOpen: true, sourceId, url, xpath, type })
            }
            onRetryPublish={handleRetryPublish}
          />
        ) : (
          <>
            {activeTab === 'dashboard' && (
              <DashboardView
                data={dashboardData}
                onNavigate={(tab) => setActiveTab(tab)}
                onRunTable={handleRunTable}
                onViewError={(errorId) => setActiveTab('errors')}
              />
            )}

            {activeTab === 'products' && (
              <ProductsView
                products={products}
                factories={factories}
                priceTables={priceTables}
                selectors={selectors}
                priceChanges={priceChanges}
                onSaveProduct={handleSaveProduct}
                onOpenImport={openImportModal}
                onExport={handleExport}
                onDownloadTemplate={handleDownloadTemplate}
              />
            )}

            {activeTab === 'factories' && (
              <FactoriesView
                factories={factories}
                onSaveFactory={handleSaveFactory}
                onOpenImport={openImportModal}
                onExport={handleExport}
                onDownloadTemplate={handleDownloadTemplate}
              />
            )}

            {activeTab === 'price_tables' && (
              <PriceTablesView
                tables={priceTables}
                factories={factories}
                onSelectTable={(table) => setSelectedTable(table)}
                onRunTable={handleRunTable}
                onSaveTable={handleSavePriceTable}
                onOpenImport={openImportModal}
                onExport={handleExport}
                onDownloadTemplate={handleDownloadTemplate}
              />
            )}

            {activeTab === 'sites' && (
              <SitesView
                sites={sites}
                sourcePages={sourcePages}
                pageActions={pageActions}
                onSaveSite={handleSaveSite}
                onSaveSourcePage={handleSaveSourcePage}
                onSavePageAction={handleSavePageAction}
                onDeletePageAction={handleDeletePageAction}
                onOpenPicker={(url) => setPickerModal({ isOpen: true, url })}
              />
            )}

            {activeTab === 'runs' && <RunsView runs={runs} onExport={handleExport} />}

            {activeTab === 'errors' && (
              <ErrorsView
                errors={errors}
                priceTables={priceTables}
                onResolve={handleResolveError}
                onIgnore={handleIgnoreError}
                onRetry={handleRetryError}
                onOpenTester={(sourceId, url, xpath) =>
                  setTesterModal({ isOpen: true, sourceId, url, xpath })
                }
                onExport={handleExport}
              />
            )}

            {activeTab === 'logs' && <LogsView logs={logs} onExport={handleExport} />}

            {activeTab === 'settings' && settings && (
              <SettingsView settings={settings} onSave={handleSaveSettings} />
            )}

            {activeTab === 'history' && (
              <HistoryView configHistory={configHistory} importHistory={importHistory} />
            )}
          </>
        )}
      </main>

      {/* Global Excel Import Modal */}
      {importModal?.isOpen && (
        <ExcelImportModal
          entityType={importModal.entityType}
          entityTitle={importModal.title}
          onClose={() => setImportModal(null)}
          onSuccess={() => {
            showToast('اطلاعات فایل اکسل با موفقیت اعمال گردید');
            loadAllData();
          }}
        />
      )}

      {/* Interactive XPath Picker Modal */}
      {pickerModal?.isOpen && (
        <XPathPickerModal
          url={pickerModal.url}
          sourceId={pickerModal.sourceId}
          target={pickerModal.target}
          onSelectXPath={(xpath) => {
            if (pickerModal.onSelect) {
              pickerModal.onSelect(xpath);
            }
            showToast(`XPath انتخاب شد: ${xpath}`);
            setPickerModal(null);
          }}
          onClose={() => setPickerModal(null)}
        />
      )}

      {/* Immediate XPath Tester Modal */}
      {testerModal?.isOpen && (
        <XPathTesterModal
          initialUrl={testerModal.url}
          initialXPath={testerModal.xpath}
          initialType={testerModal.type || 'PRICE'}
          sourceId={testerModal.sourceId}
          onClose={() => setTesterModal(null)}
        />
      )}
    </div>
  );
}

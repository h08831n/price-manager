import React, { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
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
} from '../types';

interface AppContextType {
  // Core Data
  dashboardData: DashboardData | null;
  products: Product[];
  factories: Factory[];
  priceTables: PriceTable[];
  sites: Site[];
  sourcePages: SourcePage[];
  tableSources: TableSource[];
  selectors: ProductSelector[];
  pageActions: PageAction[];
  settings: GlobalSettings | null;
  schemaVersion: number;
  openErrorsCount: number;

  // On-demand operational data
  runs: ExecutionRun[];
  errors: SystemError[];
  logs: SystemLog[];
  priceChanges: PriceChange[];
  tableRevisions: TableRevision[];
  tableRevisionItems: TableRevisionItem[];
  configHistory: ConfigHistoryItem[];
  importHistory: ImportHistoryItem[];

  // Auth State
  isAuthenticated: boolean;
  isCheckingAuth: boolean;
  handleLoginSuccess: (token: string) => void;
  handleLogout: () => void;

  // Global UI state
  isRefreshing: boolean;
  refreshData: () => Promise<void>;
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void;

  // Modals & Testers
  openImportModal: (entityType: string, title: string) => void;
  openPickerModal: (url: string, sourceId?: number, onSelect?: (xpath: string) => void, target?: 'TABLE_UPDATE' | 'PRODUCT_UPDATE' | 'PRODUCT_PRICE') => void;
  openTesterModal: (sourceId: number, url: string, xpath?: string, type?: 'PRICE' | 'DATE', onApply?: (xpath: string) => void) => void;

  // Handlers
  handleSaveProduct: (prod: Partial<Product>) => Promise<void>;
  handleDeleteProduct: (id: number) => Promise<void>;
  handleSaveFactory: (factory: Partial<Factory>) => Promise<void>;
  handleDeleteFactory: (id: number) => Promise<void>;
  handleSavePriceTable: (table: Partial<PriceTable>) => Promise<any>;
  handleDeletePriceTable: (id: number) => Promise<void>;
  handleSaveSite: (site: Partial<Site>) => Promise<void>;
  handleDeleteSite: (id: number) => Promise<void>;
  handleSaveTableSource: (source: Partial<TableSource>) => Promise<any>;
  handleDeleteTableSource: (id: number) => Promise<void>;
  handleSaveSelector: (tableSourceId: number, productId: number, data: { price_xpath?: string; update_time_xpath?: string; active?: boolean }) => Promise<void>;
  handleSavePageAction: (action: Partial<PageAction>) => Promise<any>;
  handleDeletePageAction: (id: number) => Promise<void>;
  handleClearTableSourceActions: (tableSourceId: number) => Promise<void>;
  handleRunTable: (tableId: number) => Promise<void>;
  handleRunSource: (sourceId: number) => Promise<any>;
  handleRetryPublish: (revisionId: number) => Promise<void>;
  handleSaveSettings: (newSettings: Partial<GlobalSettings>) => Promise<void>;
  handleExport: (entity: string) => void;
  handleDownloadTemplate: (entity: string) => void;

  // Fetch on-demand view data
  loadRuns: () => Promise<void>;
  loadErrors: () => Promise<void>;
  loadLogs: () => Promise<void>;
  loadHistory: () => Promise<void>;
  loadPriceChanges: () => Promise<void>;
}

const AppContext = createContext<AppContextType | null>(null);

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  // Core states
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [factories, setFactories] = useState<Factory[]>([]);
  const [priceTables, setPriceTables] = useState<PriceTable[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [sourcePages, setSourcePages] = useState<SourcePage[]>([]);
  const [tableSources, setTableSources] = useState<TableSource[]>([]);
  const [selectors, setSelectors] = useState<ProductSelector[]>([]);
  const [pageActions, setPageActions] = useState<PageAction[]>([]);
  const [settings, setSettings] = useState<GlobalSettings | null>(null);
  const [schemaVersion, setSchemaVersion] = useState<number>(5);
  const [openErrorsCount, setOpenErrorsCount] = useState<number>(0);

  // Operational states (loaded on-demand)
  const [runs, setRuns] = useState<ExecutionRun[]>([]);
  const [errors, setErrors] = useState<SystemError[]>([]);
  const [logs, setLogs] = useState<SystemLog[]>([]);
  const [priceChanges, setPriceChanges] = useState<PriceChange[]>([]);
  const [tableRevisions, setTableRevisions] = useState<TableRevision[]>([]);
  const [tableRevisionItems, setTableRevisionItems] = useState<TableRevisionItem[]>([]);
  const [configHistory, setConfigHistory] = useState<ConfigHistoryItem[]>([]);
  const [importHistory, setImportHistory] = useState<ImportHistoryItem[]>([]);

  // Auth
  const [authToken, setAuthToken] = useState<string | null>(() => localStorage.getItem('crawler_auth_token'));
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState<boolean>(true);

  // Refresh lock and UI
  const [isRefreshing, setIsRefreshing] = useState(false);
  const isFetchingRef = useRef(false);

  // Global Modals State
  const [importModal, setImportModal] = useState<{ isOpen: boolean; entityType: string; title: string } | null>(null);
  const [pickerModal, setPickerModal] = useState<{
    isOpen: boolean;
    url: string;
    sourceId?: number;
    target?: 'TABLE_UPDATE' | 'PRODUCT_UPDATE' | 'PRODUCT_PRICE';
    onSelect?: (xpath: string) => void;
  } | null>(null);
  const [testerModal, setTesterModal] = useState<{
    isOpen: boolean;
    url: string;
    xpath?: string;
    sourceId?: number;
    type?: 'PRICE' | 'DATE';
    onApply?: (xpath: string) => void;
  } | null>(null);

  // Toast
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  }, []);

  const getAuthHeaders = useCallback((): Record<string, string> => {
    const token = authToken || localStorage.getItem('crawler_auth_token');
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, [authToken]);

  const safeJson = async (res: Response) => {
    try {
      const text = await res.text();
      return text ? JSON.parse(text) : {};
    } catch {
      return { error: `پاسخ نامعتبر از سرور (کد ${res.status})` };
    }
  };

  // 1. Single-request bootstrap loader (Replaces 17 separate HTTP calls!)
  const refreshData = useCallback(async () => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    setIsRefreshing(true);

    try {
      const res = await fetch('/api/bootstrap', { headers: getAuthHeaders() });
      if (res.status === 401) {
        setIsAuthenticated(false);
        return;
      }
      if (!res.ok) throw new Error(`خطای دریافت اطلاعات اولیه (${res.status})`);

      const data = await res.json();
      if (data.dashboard) setDashboardData(data.dashboard);
      if (Array.isArray(data.products)) setProducts(data.products);
      if (Array.isArray(data.factories)) setFactories(data.factories);
      if (Array.isArray(data.price_tables)) setPriceTables(data.price_tables);
      if (Array.isArray(data.sites)) setSites(data.sites);
      if (Array.isArray(data.source_pages)) setSourcePages(data.source_pages);
      if (Array.isArray(data.table_sources)) setTableSources(data.table_sources);
      if (Array.isArray(data.selectors)) setSelectors(data.selectors);
      if (Array.isArray(data.page_actions)) setPageActions(data.page_actions);
      if (data.settings) setSettings(data.settings);
      if (typeof data.schema_version === 'number') setSchemaVersion(data.schema_version);
      if (typeof data.open_errors_count === 'number') setOpenErrorsCount(data.open_errors_count);
    } catch (err: any) {
      console.warn('[Bootstrap] Error refreshing app data:', err);
    } finally {
      setIsRefreshing(false);
      isFetchingRef.current = false;
    }
  }, [getAuthHeaders]);

  // Check auth session validity on startup
  useEffect(() => {
    const checkAuth = async () => {
      const token = localStorage.getItem('crawler_auth_token');
      if (!token) {
        setIsAuthenticated(false);
        setIsCheckingAuth(false);
        return;
      }

      try {
        const res = await fetch('/api/auth/verify', {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          setAuthToken(token);
          setIsAuthenticated(true);
        } else {
          localStorage.removeItem('crawler_auth_token');
          setAuthToken(null);
          setIsAuthenticated(false);
        }
      } catch {
        setIsAuthenticated(false);
      } finally {
        setIsCheckingAuth(false);
      }
    };

    checkAuth();
  }, []);

  // Safe background polling: exactly every 30s, ONLY when authenticated & window visible
  useEffect(() => {
    if (!isAuthenticated) return;
    refreshData();

    const interval = setInterval(() => {
      if (document.visibilityState === 'visible' && !isFetchingRef.current) {
        refreshData();
      }
    }, 30000);

    return () => clearInterval(interval);
  }, [isAuthenticated, refreshData]);

  const handleLoginSuccess = (token: string) => {
    localStorage.setItem('crawler_auth_token', token);
    setAuthToken(token);
    setIsAuthenticated(true);
    refreshData();
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: getAuthHeaders()
      });
    } catch {
      // Ignored
    }
    localStorage.removeItem('crawler_auth_token');
    setAuthToken(null);
    setIsAuthenticated(false);
  };

  // On-demand loaders for operational views
  const loadRuns = useCallback(async () => {
    try {
      const res = await fetch('/api/runs', { headers: getAuthHeaders() });
      if (res.ok) setRuns(await res.json());
    } catch (e) {
      console.warn('Failed loading runs:', e);
    }
  }, [getAuthHeaders]);

  const loadErrors = useCallback(async () => {
    try {
      const res = await fetch('/api/errors', { headers: getAuthHeaders() });
      if (res.ok) setErrors(await res.json());
    } catch (e) {
      console.warn('Failed loading errors:', e);
    }
  }, [getAuthHeaders]);

  const loadLogs = useCallback(async () => {
    try {
      const res = await fetch('/api/logs', { headers: getAuthHeaders() });
      if (res.ok) setLogs(await res.json());
    } catch (e) {
      console.warn('Failed loading logs:', e);
    }
  }, [getAuthHeaders]);

  const loadHistory = useCallback(async () => {
    try {
      const [confRes, impRes] = await Promise.all([
        fetch('/api/history/config', { headers: getAuthHeaders() }),
        fetch('/api/history/import', { headers: getAuthHeaders() })
      ]);
      if (confRes.ok) setConfigHistory(await confRes.json());
      if (impRes.ok) setImportHistory(await impRes.json());
    } catch (e) {
      console.warn('Failed loading history:', e);
    }
  }, [getAuthHeaders]);

  const loadPriceChanges = useCallback(async () => {
    try {
      const res = await fetch('/api/price-changes', { headers: getAuthHeaders() });
      if (res.ok) setPriceChanges(await res.json());
    } catch (e) {
      console.warn('Failed loading price changes:', e);
    }
  }, [getAuthHeaders]);

  // CRUD Handlers
  const handleSaveProduct = async (prod: Partial<Product>) => {
    try {
      const method = prod.id ? 'PUT' : 'POST';
      const url = prod.id ? `/api/products/${prod.id}` : '/api/products';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify(prod)
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data.error || 'خطا در ثبت محصول');
      showToast('محصول با موفقیت ذخیره شد');
      await refreshData();
    } catch (err: any) {
      showToast(err.message, 'error');
      throw err;
    }
  };

  const handleDeleteProduct = async (id: number) => {
    try {
      const res = await fetch(`/api/products/${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data.error || 'خطا در حذف محصول');
      showToast('محصول با موفقیت حذف گردید');
      await refreshData();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const handleSaveFactory = async (factory: Partial<Factory>) => {
    try {
      const method = factory.id ? 'PUT' : 'POST';
      const url = factory.id ? `/api/factories/${factory.id}` : '/api/factories';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify(factory)
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data.error || 'خطا در ثبت کارخانه');
      showToast('کارخانه با موفقیت ثبت شد');
      await refreshData();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const handleDeleteFactory = async (id: number) => {
    try {
      const res = await fetch(`/api/factories/${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data.error || 'خطا در حذف کارخانه');
      showToast('کارخانه حذف شد');
      await refreshData();
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
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify(table)
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data.error || 'خطا در ثبت جدول قیمت');
      showToast('جدول قیمت با موفقیت ذخیره شد');
      await refreshData();
      return data;
    } catch (err: any) {
      showToast(err.message, 'error');
      throw err;
    }
  };

  const handleDeletePriceTable = async (id: number) => {
    try {
      const res = await fetch(`/api/price-tables/${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data.error || 'خطا در حذف جدول قیمت');
      showToast('جدول قیمت حذف شد');
      await refreshData();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const handleSaveSite = async (site: Partial<Site>) => {
    try {
      const method = site.id ? 'PUT' : 'POST';
      const url = site.id ? `/api/sites/${site.id}` : '/api/sites';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify(site)
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data.error || 'خطا در ثبت سایت');
      showToast('اطلاعات سایت با موفقیت ذخیره شد');
      await refreshData();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const handleDeleteSite = async (id: number) => {
    try {
      const res = await fetch(`/api/sites/${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data.error || 'خطا در حذف سایت');
      showToast('سایت با موفقیت حذف شد');
      await refreshData();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const handleSaveTableSource = async (source: Partial<TableSource>) => {
    try {
      let res: Response;
      if (source.id) {
        res = await fetch(`/api/table-sources/${source.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify(source)
        });
      } else {
        res = await fetch(`/api/price-tables/${source.price_table_id}/sources`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify(source)
        });
      }
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data.error || 'خطا در ثبت منبع جدول');
      showToast('اطلاعات منبع قیمت با موفقیت ذخیره شد');
      await refreshData();
      return data;
    } catch (err: any) {
      showToast(err.message, 'error');
      throw err;
    }
  };

  const handleDeleteTableSource = async (id: number) => {
    try {
      const res = await fetch(`/api/table-sources/${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data.error || 'خطا در حذف منبع جدول');
      showToast('منبع استخراج حذف گردید');
      await refreshData();
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
      const res = await fetch(`/api/table-sources/${tableSourceId}/selectors/${productId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify(data)
      });
      const resData = await safeJson(res);
      if (!res.ok) throw new Error(resData.error || 'خطا در ثبت سلکتور محصول');
      showToast('سلکتور محصول ذخیره شد');
      await refreshData();
    } catch (err: any) {
      showToast(err.message, 'error');
      throw err;
    }
  };

  const handleSavePageAction = async (action: Partial<PageAction>) => {
    try {
      let url = '/api/page-actions';
      let method = 'POST';

      if (action.scope === 'SITE_DEFAULT' && action.site_id) {
        if (action.id) {
          url = `/api/sites/${action.site_id}/page-actions/${action.id}`;
          method = 'PUT';
        } else {
          url = `/api/sites/${action.site_id}/page-actions`;
          method = 'POST';
        }
      } else if (action.scope === 'TABLE_SOURCE' && action.table_source_id) {
        if (action.id) {
          url = `/api/table-sources/${action.table_source_id}/page-actions/${action.id}`;
          method = 'PUT';
        } else {
          url = `/api/table-sources/${action.table_source_id}/page-actions`;
          method = 'POST';
        }
      } else if (action.id) {
        url = `/api/page-actions/${action.id}`;
        method = 'PUT';
      }

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify(action)
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data.error || 'خطا در ثبت دستور');
      showToast('دستور با موفقیت ذخیره شد');
      await refreshData();
      return data;
    } catch (err: any) {
      showToast(err.message, 'error');
      throw err;
    }
  };

  const handleDeletePageAction = async (id: number) => {
    try {
      const act = pageActions.find((a) => a.id === id);
      let url = `/api/page-actions/${id}`;
      if (act?.scope === 'SITE_DEFAULT' && act.site_id) {
        url = `/api/sites/${act.site_id}/page-actions/${id}`;
      } else if (act?.scope === 'TABLE_SOURCE' && act.table_source_id) {
        url = `/api/table-sources/${act.table_source_id}/page-actions/${id}`;
      }

      const res = await fetch(url, { method: 'DELETE', headers: getAuthHeaders() });
      if (!res.ok) throw new Error('خطا در حذف دستور');
      showToast('دستور حذف گردید');
      await refreshData();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const handleClearTableSourceActions = async (tableSourceId: number) => {
    try {
      const res = await fetch(`/api/table-sources/${tableSourceId}/page-actions`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      });
      if (!res.ok) throw new Error('خطا در بازنشانی دستورات');
      showToast('دستورات اختصاصی منبع حذف شد و به پیش‌فرض بازگشت');
      await refreshData();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const handleRunTable = async (tableId: number) => {
    try {
      showToast('در حال اجرای فرآیند استخراج سراسری جدول...', 'info');
      const res = await fetch(`/api/price-tables/${tableId}/run`, {
        method: 'POST',
        headers: getAuthHeaders()
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data.error || 'خطا در اجرای جدول قیمت');
      showToast(data.message || 'اجرای استخراج جدول با موفقیت پایان یافت');
      await refreshData();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const handleRunSource = async (sourceId: number) => {
    try {
      showToast('در حال اجرای تست استخراج این منبع...', 'info');
      const res = await fetch(`/api/table-sources/${sourceId}/run`, {
        method: 'POST',
        headers: getAuthHeaders()
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data.error || 'خطا در برقراری ارتباط با سرور');

      if (!data.success && data.source_status === 'FAILED') {
        const errMsg = data.message || data.last_error || 'المان‌های قیمت با XPath در صفحه یافت نشدند';
        showToast(`نتیجه استخراج منبع: ${errMsg}`, 'error');
      } else if (data.source_status === 'NOT_UPDATED' || !data.fresh) {
        showToast(
          `صفحه بررسی شد اما تاریخ بروزرسانی امروز نیست (${data.last_update_text || 'تاریخ قدیمی'})`,
          'info'
        );
      } else {
        const count = data.products_extracted ?? 0;
        showToast(
          count > 0
            ? `استخراج منبع با موفقیت انجام شد (${count} محصول خوانده شد)`
            : 'استخراج منبع با موفقیت انجام شد',
          'success'
        );
      }
      await refreshData();
      return data;
    } catch (err: any) {
      showToast(err.message, 'error');
      throw err;
    }
  };

  const handleRetryPublish = async (revisionId: number) => {
    try {
      showToast('در حال تلاش مجدد برای ارسال به وردپرس...', 'info');
      const res = await fetch(`/api/table-revisions/${revisionId}/publish`, {
        method: 'POST',
        headers: getAuthHeaders()
      });
      const data = await safeJson(res);
      if (!res.ok || !data.success) throw new Error(data.error || 'خطا در ارسال به وردپرس');
      showToast('ارسال به وردپرس با موفقیت انجام شد');
      await refreshData();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const handleSaveSettings = async (newSettings: Partial<GlobalSettings>) => {
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify(newSettings)
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data.error || 'خطا در ذخیره تنظیمات');
      showToast('تنظیمات عمومی با موفقیت ذخیره شد');
      setSettings(data);
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const handleExport = (entity: string) => {
    window.location.href = `/api/export/${entity}`;
  };

  const handleDownloadTemplate = (entity: string) => {
    window.location.href = `/api/templates/${entity}`;
  };

  const openImportModal = (entityType: string, title: string) => {
    setImportModal({ isOpen: true, entityType, title });
  };

  const openPickerModal = (
    url: string,
    sourceId?: number,
    onSelect?: (xpath: string) => void,
    target?: 'TABLE_UPDATE' | 'PRODUCT_UPDATE' | 'PRODUCT_PRICE'
  ) => {
    setPickerModal({ isOpen: true, url, sourceId, onSelect, target });
  };

  const openTesterModal = (
    sourceId: number,
    url: string,
    xpath?: string,
    type?: 'PRICE' | 'DATE',
    onApply?: (xpath: string) => void
  ) => {
    setTesterModal({ isOpen: true, sourceId, url, xpath, type, onApply });
  };

  return (
    <AppContext.Provider
      value={{
        dashboardData,
        products,
        factories,
        priceTables,
        sites,
        sourcePages,
        tableSources,
        selectors,
        pageActions,
        settings,
        schemaVersion,
        openErrorsCount,
        runs,
        errors,
        logs,
        priceChanges,
        tableRevisions,
        tableRevisionItems,
        configHistory,
        importHistory,
        isAuthenticated,
        isCheckingAuth,
        handleLoginSuccess,
        handleLogout,
        isRefreshing,
        refreshData,
        showToast,
        openImportModal,
        openPickerModal,
        openTesterModal,
        handleSaveProduct,
        handleDeleteProduct,
        handleSaveFactory,
        handleDeleteFactory,
        handleSavePriceTable,
        handleDeletePriceTable,
        handleSaveSite,
        handleDeleteSite,
        handleSaveTableSource,
        handleDeleteTableSource,
        handleSaveSelector,
        handleSavePageAction,
        handleDeletePageAction,
        handleClearTableSourceActions,
        handleRunTable,
        handleRunSource,
        handleRetryPublish,
        handleSaveSettings,
        handleExport,
        handleDownloadTemplate,
        loadRuns,
        loadErrors,
        loadLogs,
        loadHistory,
        loadPriceChanges
      }}
    >
      {children}

      {/* Global Toast */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className={`fixed bottom-5 left-5 z-50 px-4 py-2.5 rounded-lg shadow-xl text-xs font-semibold flex items-center gap-2 animate-in slide-in-from-bottom-2 duration-200 ${
            toast.type === 'success'
              ? 'bg-emerald-800 text-white'
              : toast.type === 'error'
              ? 'bg-rose-800 text-white'
              : 'bg-slate-800 text-white'
          }`}
        >
          <span>{toast.message}</span>
        </div>
      )}

      {/* Modals placed here or in App */}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};

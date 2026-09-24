import React, { useState } from 'react';
import { X, Play, CheckCircle2, AlertCircle, RefreshCw, Hash, Calendar } from 'lucide-react';

interface XPathTesterModalProps {
  initialUrl: string;
  initialXPath?: string;
  initialType?: 'PRICE' | 'DATE';
  sourceId?: number;
  onClose: () => void;
}

export const XPathTesterModal: React.FC<XPathTesterModalProps> = ({
  initialUrl,
  initialXPath = '',
  initialType = 'PRICE',
  sourceId,
  onClose
}) => {
  const [url, setUrl] = useState(initialUrl);
  const [xpath, setXpath] = useState(initialXPath);
  const [testType, setTestType] = useState<'PRICE' | 'DATE'>(initialType);
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<any | null>(null);

  const handleTest = async () => {
    if (!url || !xpath) return;
    setIsLoading(true);
    setResult(null);

    try {
      const response = await fetch('/api/selectors/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, xpath, source_id: sourceId, type: testType })
      });
      const text = await response.text();
      let data: any = {};
      try { data = text ? JSON.parse(text) : {}; } catch { data = { success: false, error: `پاسخ نامعتبر از سرور (${response.status})` }; }
      setResult(data);
    } catch (err: any) {
      setResult({ success: false, error: err.message });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-xs">
      <div className="bg-white rounded-xl shadow-xl border border-gray-200 w-full max-w-2xl p-6 animate-in fade-in zoom-in-95 duration-150 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 pb-3 mb-4">
          <div className="flex items-center gap-2">
            <Play className="w-4 h-4 text-slate-900" />
            <h2 className="text-sm font-bold text-gray-900">تست فوری سلکتور XPath</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-700 rounded hover:bg-gray-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Inputs */}
        <div className="space-y-3 text-xs">
          <div className="flex items-center gap-2 pb-1 border-b border-gray-100">
            <span className="text-gray-600 font-medium">نوع تست:</span>
            <button
              type="button"
              onClick={() => setTestType('PRICE')}
              className={`px-3 py-1 rounded text-xs font-semibold transition-colors ${
                testType === 'PRICE'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              استخراج قیمت محصول
            </button>
            <button
              type="button"
              onClick={() => setTestType('DATE')}
              className={`px-3 py-1 rounded text-xs font-semibold transition-colors ${
                testType === 'DATE'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              ارزیابی تاریخ و زمان بروزرسانی
            </button>
          </div>

          <div>
            <label className="block text-gray-700 font-medium mb-1">آدرس اینترنتی صفحه هدف (URL)</label>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/page"
              className="w-full px-3 py-1.5 bg-gray-50 border border-gray-200 rounded focus:bg-white focus:outline-none focus:border-slate-800 dir-ltr text-right font-mono"
            />
          </div>

          <div>
            <label className="block text-gray-700 font-medium mb-1">عبارت XPath</label>
            <input
              type="text"
              value={xpath}
              onChange={(e) => setXpath(e.target.value)}
              placeholder={testType === 'PRICE' ? "//table[@id='prices']//tr[1]/td[3]" : "//div[@class='update-date']"}
              className="w-full px-3 py-1.5 bg-gray-50 border border-gray-200 rounded focus:bg-white focus:outline-none focus:border-slate-800 dir-ltr text-right font-mono"
            />
          </div>

          <div>
            <button
              onClick={handleTest}
              disabled={isLoading || !url || !xpath}
              className="w-full py-2 bg-slate-900 text-white rounded font-medium hover:bg-slate-800 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>در حال دانلود صفحه و ارزیابی XPath...</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5" />
                  <span>اجرای تست زنده ({testType === 'PRICE' ? 'قیمت' : 'تاریخ'})</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Test Result Tray */}
        {result && (
          <div className="mt-4 p-4 rounded-lg bg-gray-50 border border-gray-200 overflow-y-auto space-y-3 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-bold text-gray-700">نتیجه ارزیابی:</span>
              <span
                className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                  result.success
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-rose-100 text-rose-800'
                }`}
              >
                {result.success
                  ? `موفق (${result.count || 1} المان یافت شد)`
                  : 'ناموفق / مقدار نامعتبر'}
              </span>
            </div>

            {result.error && (
              <div className="p-2.5 bg-rose-50 border border-rose-200 rounded text-rose-700 font-mono text-[11px]">
                {result.error}
              </div>
            )}

            {result.first_value !== undefined && (
              <div className="space-y-2">
                <div className="bg-white p-2.5 rounded border border-gray-200">
                  <span className="text-[11px] text-gray-500 block mb-1">متن خام استخراج شده از صفحه:</span>
                  <div className="font-semibold text-gray-900 text-sm">
                    «{result.first_value || '(خالی)'}»
                  </div>
                </div>

                {/* Parsed Price */}
                {testType === 'PRICE' && result.parsed_price !== undefined && (
                  <div className="bg-white p-2.5 rounded border border-gray-200">
                    <span className="text-[11px] text-gray-500 block mb-1">ارزیابی به عنوان قیمت:</span>
                    <div className="flex items-center gap-3">
                      <span className="text-base font-bold text-gray-900">
                        {Number(result.parsed_price).toLocaleString('fa-IR')} تومان
                      </span>
                      <span
                        className={`text-[11px] px-2 py-0.5 rounded font-medium ${
                          result.valid ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                        }`}
                      >
                        {result.valid ? 'عدد معتبر' : 'نامعتبر'}
                      </span>
                    </div>
                  </div>
                )}

                {/* Parsed Freshness */}
                {testType === 'DATE' && (
                  <div className="bg-white p-2.5 rounded border border-gray-200">
                    <span className="text-[11px] text-gray-500 block mb-1">ارزیابی به عنوان تاریخ و زمان:</span>
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-bold text-gray-900">
                          {result.normalized_date || '—'}{' '}
                          {result.normalized_time ? `(ساعت: ${result.normalized_time})` : ''}
                        </span>
                        <p className="text-[11px] text-gray-500 mt-0.5">{result.reason}</p>
                      </div>
                      <span
                        className={`text-[11px] px-2 py-0.5 rounded font-medium ${
                          result.fresh ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {result.fresh ? 'متعلق به امروز (تازه)' : 'قدیمی یا نامشخص'}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="mt-4 pt-3 border-t border-gray-200 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs text-gray-700 hover:bg-gray-100 rounded"
          >
            بستن
          </button>
        </div>
      </div>
    </div>
  );
};

import React, { useState, useEffect } from 'react';
import { X, MousePointerClick, Copy, Check, Code, Play } from 'lucide-react';
import { useEscapeKey } from '../hooks/useEscapeKey';

interface XPathPickerModalProps {
  url: string;
  sourceId?: number;
  target?: 'TABLE_UPDATE' | 'PRODUCT_UPDATE' | 'PRODUCT_PRICE';
  onSelectXPath: (xpath: string) => void;
  onClose: () => void;
}

export const XPathPickerModal: React.FC<XPathPickerModalProps> = ({
  url,
  sourceId,
  target,
  onSelectXPath,
  onClose
}) => {
  useEscapeKey(onClose);
  const [currentXPath, setCurrentXPath] = useState<string>('');
  const [selectedText, setSelectedText] = useState<string>('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (
        event.data &&
        (event.data.type === 'PICKER_ELEMENT_SELECTED' || event.data.type === 'XPATH_SELECTED')
      ) {
        setCurrentXPath(event.data.xpath || '');
        setSelectedText(event.data.text || '');
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const handleCopy = () => {
    if (!currentXPath) return;
    navigator.clipboard.writeText(currentXPath);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleApply = () => {
    if (!currentXPath) return;
    onSelectXPath(currentXPath);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-xs">
      <div className="bg-white rounded-xl shadow-2xl border border-gray-200 w-full max-w-6xl h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-6 py-3 border-b border-gray-200 flex items-center justify-between bg-slate-900 text-white">
          <div className="flex items-center gap-2">
            <MousePointerClick className="w-5 h-5 text-emerald-400" />
            <h2 className="text-sm font-bold">انتخابگر تعاملی XPath (Interactive Visual Picker)</h2>
            {target && (
              <span className={`text-[11px] px-2 py-0.5 rounded font-medium ${
                target === 'TABLE_UPDATE'
                  ? 'bg-blue-500/20 text-blue-300 border border-blue-400/30'
                  : target === 'PRODUCT_UPDATE'
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-400/30'
                  : 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/30'
              }`}>
                {target === 'TABLE_UPDATE' && 'هدف: استخراج تاریخ کل جدول'}
                {target === 'PRODUCT_UPDATE' && 'هدف: استخراج تاریخ کالا'}
                {target === 'PRODUCT_PRICE' && 'هدف: استخراج قیمت کالا'}
              </span>
            )}
            <span className="text-xs text-slate-400 mr-2 max-w-md truncate dir-ltr">
              {url}
            </span>
          </div>

          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Live Inspection Webview Frame */}
        <div className="flex-1 bg-gray-100 relative overflow-hidden">
          <iframe
            src={`/api/picker/inspect?url=${encodeURIComponent(url)}${sourceId ? `&table_source_id=${sourceId}` : ''}`}
            className="w-full h-full border-none"
            title="Interactive Element Inspector"
          />
        </div>

        {/* Bottom Control & Result Tray */}
        <div className="p-4 border-t border-gray-200 bg-white space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-center">
            <div className="md:col-span-2">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-bold text-gray-700">عبارت XPath تولید شده:</span>
                {selectedText && (
                  <span className="text-[11px] text-gray-500 truncate max-w-md">
                    محتوای المان: <strong className="text-gray-900">«{selectedText.slice(0, 40)}»</strong>
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={currentXPath}
                  onChange={(e) => setCurrentXPath(e.target.value)}
                  placeholder="روی هر قیمت، جدول یا تاریخ در صفحه بالا کلیک کنید تا XPath استخراج شود..."
                  className={`w-full px-3 py-1.5 text-xs font-mono dir-ltr text-right border rounded focus:outline-none transition-colors ${
                    currentXPath
                      ? 'bg-emerald-50/70 border-emerald-400 text-emerald-950 font-bold'
                      : 'bg-gray-50 border-gray-300 focus:bg-white focus:border-slate-800'
                  }`}
                />
                <button
                  onClick={handleCopy}
                  disabled={!currentXPath}
                  className="p-2 text-gray-600 hover:text-gray-900 border border-gray-300 rounded hover:bg-gray-100 transition-colors disabled:opacity-40"
                  title="کپی در حافظه"
                >
                  {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-4 md:pt-0">
              <button
                onClick={onClose}
                className="px-4 py-2 text-xs text-gray-700 hover:bg-gray-100 rounded transition-colors"
              >
                انصراف
              </button>
              <button
                onClick={handleApply}
                disabled={!currentXPath}
                className="px-5 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-40 rounded transition-colors shadow-xs flex items-center gap-1.5"
              >
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span>انتخاب و استفاده از این سلکتور</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

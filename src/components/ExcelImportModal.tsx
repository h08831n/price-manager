import React, { useState } from 'react';
import { X, Upload, FileSpreadsheet, AlertCircle, CheckCircle2, AlertTriangle, RefreshCw } from 'lucide-react';
import { useEscapeKey } from '../hooks/useEscapeKey';

interface ExcelImportModalProps {
  entityType: string;
  entityTitle: string;
  onClose: () => void;
  onSuccess: () => void;
}

export const ExcelImportModal: React.FC<ExcelImportModalProps> = ({
  entityType,
  entityTitle,
  onClose,
  onSuccess
}) => {
  useEscapeKey(onClose);
  const [file, setFile] = useState<File | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [previewData, setPreviewData] = useState<any | null>(null);
  const [isApplying, setIsApplying] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setPreviewData(null);
      setErrorMessage(null);
    }
  };

  const handlePreview = async () => {
    if (!file) return;
    setIsPreviewLoading(true);
    setErrorMessage(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch(`/api/excel/preview/${entityType}`, {
        method: 'POST',
        body: formData
      });
      const text = await res.text();
      let data: any = {};
      try { data = text ? JSON.parse(text) : {}; } catch { data = { error: `پاسخ نامعتبر از سرور (${res.status})` }; }
      if (!res.ok) throw new Error(data.error || 'خطا در خواندن فایل اکسل');
      setPreviewData(data);
    } catch (err: any) {
      setErrorMessage(err.message);
    } finally {
      setIsPreviewLoading(false);
    }
  };

  const handleApply = async () => {
    if (!previewData) return;
    setIsApplying(true);
    try {
      const res = await fetch('/api/excel/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(previewData)
      });
      const text = await res.text();
      let data: any = {};
      try { data = text ? JSON.parse(text) : {}; } catch { data = { error: `پاسخ نامعتبر از سرور (${res.status})` }; }
      if (!res.ok) throw new Error(data.error || 'خطا در ثبت تغییرات');
      onSuccess();
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message);
    } finally {
      setIsApplying(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-xs">
      <div className="bg-white rounded-xl shadow-xl border border-gray-200 w-full max-w-2xl p-6 animate-in fade-in zoom-in-95 duration-150 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 pb-3 mb-4">
          <div className="flex items-center gap-2">
            <Upload className="w-5 h-5 text-slate-900" />
            <h2 className="text-sm font-bold text-gray-900">ایمپورت هوشمند اکسل: {entityTitle}</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-700 rounded hover:bg-gray-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Upload & Step 1 */}
        <div className="space-y-4 text-xs">
          {!previewData ? (
            <div className="space-y-3">
              <p className="text-gray-600 leading-relaxed">
                فایل اکسل آماده شده را انتخاب نمایید. سیستم پیش از اعمال هرگونه تغییر، تمام سطرها را ارزیابی و
                گزارش مغایرت یا سطر‌های جدید را نمایش خواهد داد.
              </p>

              <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-slate-800 transition-colors bg-gray-50/50">
                <FileSpreadsheet className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                <input
                  type="file"
                  id="excel-file-input"
                  accept=".xlsx, .xls"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <label
                  htmlFor="excel-file-input"
                  className="cursor-pointer font-semibold text-slate-900 hover:underline"
                >
                  {file ? file.name : 'برای انتخاب فایل کلیک کنید یا فایل را اینجا رها کنید'}
                </label>
                <p className="text-[11px] text-gray-400 mt-1">فرمت پشتیبانی شده: XLSX</p>
              </div>

              {errorMessage && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded text-rose-700 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-3 border-t border-gray-200">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded"
                >
                  انصراف
                </button>
                <button
                  type="button"
                  disabled={!file || isPreviewLoading}
                  onClick={handlePreview}
                  className="px-5 py-2 font-semibold text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-50 rounded transition-colors flex items-center gap-2"
                >
                  {isPreviewLoading ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>در حال خواندن و اعتبارسنجی فایل...</span>
                    </>
                  ) : (
                    <span>پیش‌نمایش تغییرات</span>
                  )}
                </button>
              </div>
            </div>
          ) : (
            /* Step 2: Preview Results & Approval */
            <div className="space-y-4">
              <div className="p-4 rounded-lg bg-slate-50 border border-slate-200">
                <h3 className="font-bold text-gray-900 text-sm mb-3">گزارش اعتبارسنجی پیش از اعمال</h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                  <div className="bg-white p-2.5 rounded border border-gray-200">
                    <span className="text-[11px] text-gray-500 block">سطرهای جدید</span>
                    <span className="text-base font-bold text-emerald-600">
                      {previewData.rows_new.toLocaleString('fa-IR')}
                    </span>
                  </div>
                  <div className="bg-white p-2.5 rounded border border-gray-200">
                    <span className="text-[11px] text-gray-500 block">بروزرسانی‌ها</span>
                    <span className="text-base font-bold text-blue-600">
                      {previewData.rows_updated.toLocaleString('fa-IR')}
                    </span>
                  </div>
                  <div className="bg-white p-2.5 rounded border border-gray-200">
                    <span className="text-[11px] text-gray-500 block">بدون تغییر</span>
                    <span className="text-base font-bold text-gray-500">
                      {previewData.rows_unchanged.toLocaleString('fa-IR')}
                    </span>
                  </div>
                  <div className="bg-white p-2.5 rounded border border-gray-200">
                    <span className="text-[11px] text-gray-500 block">سطرهای دارای خطا</span>
                    <span className="text-base font-bold text-rose-600">
                      {previewData.rows_failed.toLocaleString('fa-IR')}
                    </span>
                  </div>
                </div>
              </div>

              {/* Row Level Errors List */}
              {previewData.errors && previewData.errors.length > 0 && (
                <div className="space-y-2">
                  <span className="font-bold text-rose-700 flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    خطاهای شناسایی شده ({previewData.errors.length}):
                  </span>
                  <div className="max-h-40 overflow-y-auto border border-rose-200 bg-rose-50/50 rounded-lg p-3 space-y-1.5 font-mono text-[11px] text-rose-800">
                    {previewData.errors.map((err: any, idx: number) => (
                      <div key={idx}>
                        سطر {err.row}: {err.error}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {errorMessage && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded text-rose-700 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              )}

              <div className="flex items-center justify-between pt-3 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => setPreviewData(null)}
                  className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded"
                >
                  بازگشت و انتخاب فایل دیگر
                </button>
                <button
                  type="button"
                  disabled={isApplying || previewData.valid_rows.length === 0}
                  onClick={handleApply}
                  className="px-6 py-2 font-semibold text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-50 rounded transition-colors flex items-center gap-2"
                >
                  {isApplying ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>در حال اعمال اطلاعات در پایگاه داده...</span>
                    </>
                  ) : (
                    <span>تایید و اعمال ایمپورت</span>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

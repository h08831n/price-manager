import React from 'react';
import { X, FileCode, Image as ImageIcon } from 'lucide-react';
import { useEscapeKey } from '../hooks/useEscapeKey';

interface SnapshotModalProps {
  type: 'html' | 'image';
  filename: string;
  title: string;
  onClose: () => void;
}

export const SnapshotModal: React.FC<SnapshotModalProps> = ({
  type,
  filename,
  title,
  onClose
}) => {
  useEscapeKey(onClose);
  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-xs">
      <div className="bg-white rounded-xl shadow-2xl border border-gray-200 w-full max-w-5xl h-[85vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-6 py-3 border-b border-gray-200 flex items-center justify-between bg-slate-900 text-white">
          <div className="flex items-center gap-2">
            {type === 'html' ? <FileCode className="w-5 h-5 text-blue-400" /> : <ImageIcon className="w-5 h-5 text-emerald-400" />}
            <h2 className="text-sm font-bold">{title}</h2>
            <span className="text-xs text-slate-400 font-mono mr-2">{filename}</span>
          </div>

          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Viewer */}
        <div className="flex-1 bg-gray-100 relative overflow-hidden flex items-center justify-center">
          {type === 'html' ? (
            <iframe
              src={`/api/snapshots/${filename}`}
              className="w-full h-full border-none bg-white"
              title="HTML Snapshot"
            />
          ) : (
            <div className="p-6 max-w-full max-h-full overflow-auto flex items-center justify-center">
              <img
                src={`/api/screenshots/${filename}`}
                alt="Error Screenshot"
                className="max-w-full max-h-full rounded shadow-md border border-gray-300"
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-gray-200 bg-gray-50 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50"
          >
            بستن
          </button>
        </div>
      </div>
    </div>
  );
};

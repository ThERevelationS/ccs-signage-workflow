import React from "react";
import { Loader2, CheckCircle2, XCircle, X } from "lucide-react";
import { Progress } from "@/components/ui/progress";

export default function SalesPipelineImportProgress({ importProgress, importStateRef }) {
  if (!importProgress) return null;

  const { done, indeterminate, current, total, message } = importProgress;
  const isError = done && message?.includes('failed') && !message?.startsWith('✓');
  const percent = indeterminate ? null : (total > 0 ? Math.round((current / total) * 100) : 100);

  return (
    <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 w-96 max-w-[90vw] shadow-xl rounded-xl border border-blue-200 bg-white p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {done ? (
            isError
              ? <XCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
              : <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
          ) : (
            <Loader2 className="w-4 h-4 animate-spin text-blue-600 flex-shrink-0" />
          )}
          <span className={`text-sm font-semibold ${done ? (isError ? 'text-red-600' : 'text-green-700') : 'text-blue-700'}`}>
            {done ? (isError ? 'Import Failed' : 'Import Complete!') : 'Importing...'}
          </span>
        </div>
        {!indeterminate && total > 0 && (
          <span className="text-xs text-gray-500">{current}/{total}</span>
        )}
      </div>

      {indeterminate ? (
        // Animated indeterminate bar
        <>
          <style>{`
            @keyframes importSlide {
              0%   { left: -45%; width: 45%; }
              60%  { left: 100%; width: 100%; }
              100% { left: 120%; width: 10%; }
            }
          `}</style>
          <div className="relative w-full h-2 bg-gray-200 rounded-full overflow-hidden mb-2">
            <div
              className="absolute h-full bg-blue-500 rounded-full"
              style={{ animation: 'importSlide 1.5s cubic-bezier(0.65, 0.815, 0.735, 0.395) infinite' }}
            />
          </div>
        </>
      ) : (
        <Progress value={percent} className="h-2 mb-2" />
      )}

      <p className="text-xs text-gray-600 truncate">{message}</p>
    </div>
  );
}
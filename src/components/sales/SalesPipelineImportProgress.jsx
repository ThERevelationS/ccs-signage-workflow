import React from "react";
import { Loader2 } from "lucide-react";
import { Progress } from "@/components/ui/progress";

export default function SalesPipelineImportProgress({ importProgress }) {
  if (!importProgress) return null;
  return (
    <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 w-96 max-w-[90vw] shadow-xl rounded-xl border border-blue-200 bg-white p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {importProgress.done
            ? <span className="text-green-600 font-semibold text-sm">✓ Import complete!</span>
            : <><Loader2 className="w-4 h-4 animate-spin text-blue-600" /><span className="text-sm font-semibold text-blue-700">Importing...</span></>}
        </div>
        <span className="text-xs text-gray-500">{importProgress.current}/{importProgress.total}</span>
      </div>
      <Progress value={importProgress.total > 0 ? Math.round((importProgress.current / importProgress.total) * 100) : 0} className="h-2 mb-2" />
      <p className="text-xs text-gray-600 truncate">{importProgress.message}</p>
    </div>
  );
}
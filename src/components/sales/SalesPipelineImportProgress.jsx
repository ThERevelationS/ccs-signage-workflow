import React from "react";
import { Loader2, Pause, Play, X } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";

export default function SalesPipelineImportProgress({ importProgress, importStateRef }) {
  if (!importProgress) return null;

  const isPaused = importStateRef?.current?.paused;

  const togglePause = () => {
    if (importStateRef?.current) {
      importStateRef.current.paused = !importStateRef.current.paused;
    }
  };

  const cancel = () => {
    if (importStateRef?.current) {
      importStateRef.current.cancelled = true;
      importStateRef.current.paused = false;
    }
  };

  return (
    <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 w-96 max-w-[90vw] shadow-xl rounded-xl border border-blue-200 bg-white p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {importProgress.done
            ? <span className="text-green-600 font-semibold text-sm">✓ Import complete!</span>
            : isPaused
              ? <span className="text-yellow-600 font-semibold text-sm">⏸ Paused</span>
              : <><Loader2 className="w-4 h-4 animate-spin text-blue-600" /><span className="text-sm font-semibold text-blue-700">Importing...</span></>}
        </div>
        <div className="flex items-center gap-1">
          <span className="text-xs text-gray-500 mr-1">{importProgress.current}/{importProgress.total}</span>
          {!importProgress.done && (
            <>
              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={togglePause} title={isPaused ? "Resume" : "Pause"}>
                {isPaused ? <Play className="w-3 h-3 text-green-600" /> : <Pause className="w-3 h-3 text-yellow-600" />}
              </Button>
              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={cancel} title="Cancel import">
                <X className="w-3 h-3 text-red-500" />
              </Button>
            </>
          )}
        </div>
      </div>
      <Progress value={importProgress.total > 0 ? Math.round((importProgress.current / importProgress.total) * 100) : 0} className="h-2 mb-2" />
      <p className="text-xs text-gray-600 truncate">{importProgress.message}</p>
    </div>
  );
}
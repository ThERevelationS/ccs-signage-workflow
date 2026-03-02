import React from "react";
import { Loader2, CheckCircle2, AlertCircle, X } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { useResearchProgress } from "./ResearchProgressContext";

export default function ResearchProgressBar() {
  const { progress, clearProgress } = useResearchProgress();

  if (!progress) return null;

  const percentage = (progress.processed / progress.total) * 100;

  return (
    <div className="fixed bottom-3 right-3 w-80 bg-white rounded-lg shadow-lg border border-gray-200 p-3 z-40">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {progress.isComplete ? (
            <>
              {progress.error ? (
                <AlertCircle className="w-4 h-4 text-red-500" />
              ) : (
                <CheckCircle2 className="w-4 h-4 text-green-500" />
              )}
            </>
          ) : (
            <Loader2 className="w-4 h-4 text-purple-600 animate-spin" />
          )}
          <span className="text-xs font-semibold text-gray-800">
            {progress.isComplete 
              ? progress.error ? "Research Failed" : "Research Complete"
              : "Researching..."}
          </span>
        </div>
        {progress.isComplete && (
          <button
            onClick={clearProgress}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Progress Bar */}
      {!progress.isComplete && (
        <>
          <Progress value={percentage} className="h-1.5 mb-2" />
          <div className="flex justify-between text-xs text-gray-600 mb-2">
            <span>{progress.processed}/{progress.total}</span>
            <span>{Math.round(percentage)}%</span>
          </div>

          {/* Current Jurisdiction */}
          {progress.currentJurisdiction && (
            <div className="bg-purple-50 rounded p-2 text-xs text-purple-900 border border-purple-100 font-medium">
              {progress.currentJurisdiction}
            </div>
          )}
        </>
      )}

      {/* Results */}
      {progress.isComplete && !progress.error && (
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div className="bg-green-50 rounded p-2 text-center border border-green-100">
            <p className="font-bold text-green-600">{progress.updated}</p>
            <p className="text-green-700">Updated</p>
          </div>
          <div className="bg-amber-50 rounded p-2 text-center border border-amber-100">
            <p className="font-bold text-amber-600">{progress.skipped}</p>
            <p className="text-amber-700">Skipped</p>
          </div>
          <div className="bg-blue-50 rounded p-2 text-center border border-blue-100">
            <p className="font-bold text-blue-600">{progress.total}</p>
            <p className="text-blue-700">Total</p>
          </div>
        </div>
      )}

      {progress.isComplete && progress.error && (
        <div className="bg-red-50 rounded p-2 text-xs text-red-900 border border-red-100">
          <p className="font-semibold mb-1">Error:</p>
          <p className="line-clamp-2">{progress.error}</p>
        </div>
      )}
    </div>
  );
}
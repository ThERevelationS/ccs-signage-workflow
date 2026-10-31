import React from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Surfaces a failed data load instead of letting it render as an empty
 * list/board. `message` is shown verbatim; `onRetry` re-runs the load.
 */
export default function LoadErrorBanner({ message, onRetry, className = "" }) {
  if (!message) return null;
  return (
    <div className={`mb-4 flex items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900 flex-wrap ${className}`}>
      <div className="flex items-center gap-2 min-w-0">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        <span className="break-words">{message}</span>
      </div>
      {onRetry && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={onRetry}
          className="shrink-0 gap-1 border-red-300 bg-white text-red-800"
        >
          Retry
        </Button>
      )}
    </div>
  );
}

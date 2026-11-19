import { useEffect, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";

// Global lazy-page fallback. A bare spinner is fine for the normal fast path,
// but under backend congestion a page can sit here indefinitely — after a
// delay, say what is happening and offer a manual reload instead of leaving
// the user staring at an unexplained spinner.
export default function PageLoading() {
  const [slowLoad, setSlowLoad] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setSlowLoad(true), 12000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3" role="status" aria-label="Loading page">
      <Loader2 className="h-7 w-7 animate-spin text-violet-500" />
      {slowLoad && (
        <div className="flex flex-col items-center gap-2 px-4 text-center">
          <p className="text-sm text-gray-500">Still loading — the service is busy right now. It usually clears in a moment.</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Reload page
          </button>
        </div>
      )}
    </div>
  );
}

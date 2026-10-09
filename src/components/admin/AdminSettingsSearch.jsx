import { useRef, useState } from "react";
import { ArrowRight, Search, X } from "lucide-react";
import { searchAdminSettings } from "@/components/admin/adminTabNavigation";

// Search is deliberately inline rather than an unbounded dropdown overlay:
// results remain within the Admin navigation card on narrow viewports.
export default function AdminSettingsSearch({ isAdmin, onNavigate }) {
  const [query, setQuery] = useState("");
  const searchInputRef = useRef(null);
  const results = searchAdminSettings(query, isAdmin);
  const hasQuery = Boolean(query.trim());

  const openResult = (result) => {
    onNavigate(result.tab, result.subtab || null);
    setQuery("");
    // A clicked result disappears after navigation; keep focus in a usable control.
    searchInputRef.current?.focus();
  };

  return (
    <div className="mb-2 min-w-0 border-b border-red-200/70 pb-2">
      <form
        role="search"
        aria-label="Search Admin pages and settings"
        onSubmit={(event) => {
          event.preventDefault();
          if (results.length) openResult(results[0]);
        }}
      >
        <div className="relative w-full min-w-0">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" aria-hidden="true" />
          <input
            ref={searchInputRef}
            type="search"
            aria-label="Find an Admin page or setting"
            placeholder="Find a setting... (PTO, sync, backup)"
            maxLength={100}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                setQuery("");
                event.stopPropagation();
              }
            }}
            className="h-10 w-full min-w-0 rounded-lg border border-red-200 bg-white/85 py-2 pl-9 pr-9 text-sm text-gray-900 placeholder:text-gray-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
          />
          {hasQuery && (
            <button
              type="button"
              aria-label="Clear Admin search"
              title="Clear search"
              onClick={() => setQuery("")}
              className="absolute right-1 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>
      </form>
      {hasQuery && (
        <div aria-label="Admin search results" className="mt-2 min-w-0">
          <p role="status" aria-live="polite" className="mb-1 px-1 text-xs text-gray-600">
            {results.length ? "Choose a matching page or setting (Enter opens the first result)." : "No matching Admin settings. Try another term."}
          </p>
          {results.length > 0 && (
            <div className="grid max-h-60 min-w-0 grid-cols-1 gap-1.5 overflow-y-auto sm:grid-cols-2">
              {results.map((result) => (
                <button
                  key={result.id}
                  type="button"
                  onClick={() => openResult(result)}
                  className="flex min-h-11 min-w-0 items-center justify-between gap-2 rounded-lg border border-red-200/60 bg-white/85 px-3 py-2 text-left text-sm text-gray-900 hover:border-red-300 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
                >
                  <span className="min-w-0">
                    <span className="block break-words font-medium">{result.label}</span>
                    <span className="block break-words text-xs text-gray-600">
                      {result.group}{result.parentLabel ? ` / ${result.parentLabel}` : ""}
                    </span>
                  </span>
                  <ArrowRight className="h-4 w-4 shrink-0 text-gray-500" aria-hidden="true" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

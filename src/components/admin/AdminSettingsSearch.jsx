import { useEffect, useId, useRef, useState } from "react";
import { ArrowRight, Search, X } from "lucide-react";
import { ADMIN_TAB_GROUPS, getAdminSearchKeyboardIndex, searchAdminSettings } from "@/components/admin/adminTabNavigation";
import { createPageUrl } from "@/utils";

// Search is deliberately inline rather than an unbounded dropdown overlay:
// results remain within the Admin navigation card on narrow viewports.
// Wrap matched query terms in <mark> so users see why a result appeared.
const highlightTerms = (text, q) => {
  const terms = String(q || "").trim().split(/\s+/).filter(Boolean).slice(0, 4);
  if (!terms.length) return text;
  const pattern = new RegExp(`(${terms.map((t) => t.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")).join("|")})`, "ig");
  const parts = String(text || "").split(pattern);
  return parts.map((part, i) =>
    i % 2 === 1 ? <mark key={i} className="rounded bg-amber-200/70 px-0.5 text-inherit">{part}</mark> : part
  );
};

export default function AdminSettingsSearch({ isAdmin, currentUser, onNavigate }) {
  const inputRef = useRef(null);
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const [dense, setDense] = useState(() => { try { return localStorage.getItem("admin_search_dense") === "1"; } catch { return false; } });
  const [topQueries, setTopQueries] = useState(() => {
    try { return JSON.parse(localStorage.getItem("admin_search_counts") || "{}"); } catch { return {}; }
  });
  const logQuery = (q) => {
    const key = String(q || "").trim().toLowerCase();
    if (!key) return;
    setTopQueries((cur) => {
      const next = { ...cur, [key]: (cur[key] || 0) + 1 };
      try { localStorage.setItem("admin_search_counts", JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  };
  const toggleDense = () => setDense((d) => { const next = !d; try { localStorage.setItem("admin_search_dense", next ? "1" : "0"); } catch { /* ignore */ } return next; });
  const [recentTabs, setRecentTabs] = useState(() => {
    try { return JSON.parse(localStorage.getItem("admin_visited_tabs_v1") || "[]"); } catch { return []; }
  });
  const tabLabel = (() => {
    const map = {};
    ADMIN_TAB_GROUPS.forEach((g) => (g.tabs || []).forEach((t) => { map[t.value] = t.label; }));
    return map;
  })();
  const [activeIndex, setActiveIndex] = useState(-1);
  const resultsListRef = useRef(null);
  const searchStatusId = useId();
  const resultsListId = useId();
  const results = searchAdminSettings(query, isAdmin, 8, currentUser);
  const hasQuery = Boolean(query.trim());
  const selectedResult = activeIndex >= 0 ? results[activeIndex] : null;
  const hasResults = hasQuery && results.length > 0;

  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (selectedResult) {
      resultsListRef.current?.querySelector('[data-admin-search-active="true"]')
        ?.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
  }, [activeIndex, selectedResult?.id]);

  const openResult = (result) => {
    logQuery(result.label);
    if (result.page) {
      window.location.href = createPageUrl(result.page);
      return;
    }
    onNavigate(result.tab, result.subtab || null);
    setQuery("");
    setActiveIndex(-1);
    // A clicked result disappears after navigation; keep focus in a usable control.
    inputRef.current?.focus();
  };

  return (
    <div className="mb-2 min-w-0 border-b border-red-200/70 pb-2">
      <form
        role="search"
        aria-label="Search Admin pages and settings"
        onSubmit={(event) => {
          event.preventDefault();
          if (results.length) openResult(selectedResult || results[0]);
        }}
      >
        <div className="relative w-full min-w-0">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" aria-hidden="true" />
          <input
            ref={inputRef}
            type="search"
            role="combobox"
            aria-label="Find an Admin page or setting"
            aria-autocomplete="list"
            aria-haspopup="listbox"
            aria-expanded={hasResults}
            aria-controls={hasResults ? resultsListId : undefined}
            aria-activedescendant={selectedResult ? `${resultsListId}-option-${activeIndex}` : undefined}
            aria-describedby={hasQuery ? searchStatusId : undefined}
            placeholder="Find a setting... (Ctrl+K)"
            maxLength={100}
            onFocus={() => {
              setFocused(true);
              try { setRecentTabs(JSON.parse(localStorage.getItem("admin_visited_tabs_v1") || "[]")); } catch { /* ignore */ }
            }}
            onBlur={() => setTimeout(() => setFocused(false), 200)}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveIndex(-1);
            }}
            onKeyDown={(event) => {
              const nextIndex = getAdminSearchKeyboardIndex(event.key, activeIndex, results.length);
              if (nextIndex !== null) {
                event.preventDefault();
                setActiveIndex(nextIndex);
                return;
              }
              if (event.key === "Escape") {
                setQuery("");
                setActiveIndex(-1);
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
              onClick={() => { setQuery(""); setActiveIndex(-1); }}
              className="absolute right-1 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>
      </form>
      {focused && !hasQuery && recentTabs.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1 px-1">
          <span className="text-[10px] font-medium uppercase text-gray-400">Recent:</span>
          {Object.entries(topQueries).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([q]) => (
            <button key={`q-${q}`} type="button"
              className="rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[11px] text-sky-800 hover:border-sky-400"
              onMouseDown={(e) => { e.preventDefault(); setQuery(q); inputRef.current?.focus(); }}>
              {q}
            </button>
          ))}
          {[...recentTabs].slice(-5).reverse().map((v) => (
            <button key={v} type="button"
              className="rounded-full border border-gray-200 bg-white px-2 py-0.5 text-[11px] text-gray-700 hover:border-sky-300 hover:text-sky-800"
              onMouseDown={(e) => { e.preventDefault(); onNavigate(v, null); }}>
              {tabLabel[v] || v}
            </button>
          ))}
        </div>
      )}
      {hasQuery && (
        <div aria-label="Admin search results" className="mt-2 min-w-0">
          <p id={searchStatusId} role="status" aria-live="polite" className="mb-1 px-1 text-xs text-gray-600">
            {results.length
              ? selectedResult
                ? `Selected ${selectedResult.label} (${activeIndex + 1} of ${results.length}). Press Enter to open; Up/Down to change.`
                : "Use Up/Down arrows to highlight a result. Enter opens the first result."
              : "No matching Admin settings. Try another term."}
          </p>
          {results.length > 0 && (
            <>
              <div id={resultsListId} ref={resultsListRef} role="listbox" aria-label="Matching Admin settings" className={`grid min-w-0 grid-cols-1 overflow-y-auto sm:grid-cols-2 ${dense ? "max-h-40 gap-0.5" : "max-h-60 gap-1.5"}`}>
                {results.map((result, index) => (
                  <button
                    id={`${resultsListId}-option-${index}`}
                    key={result.id}
                    type="button"
                    role="option"
                    aria-selected={index === activeIndex}
                    data-admin-search-active={index === activeIndex ? "true" : "false"}
                    onClick={() => openResult(result)}
                    className={`flex min-h-11 min-w-0 items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-sm text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${index === activeIndex ? "border-blue-500 bg-blue-50 ring-2 ring-blue-300" : "border-red-200/60 bg-white/85 hover:border-red-300 hover:bg-white"}`}
                  >
                    <span className="min-w-0">
                      <span className="block break-words font-medium">{highlightTerms(result.label, query)}</span>
                      <span className="block break-words text-xs text-gray-600">
                        {result.group}{result.parentLabel ? ` / ${result.parentLabel}` : ""}
                      </span>
                    </span>
                    <ArrowRight className="h-4 w-4 shrink-0 text-gray-500" aria-hidden="true" />
                  </button>
                ))}
              </div>
              <p className="px-1 pt-1 text-[10px] text-gray-400">
                <span className="font-semibold">Up/Down</span> choose · <span className="font-semibold">Enter</span> open · <span className="font-semibold">Esc</span> close
                <button type="button" onClick={toggleDense} className="ml-2 rounded border border-gray-200 px-1 text-[10px] text-gray-500 hover:text-gray-800">{dense ? "Comfortable" : "Compact"}</button>
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
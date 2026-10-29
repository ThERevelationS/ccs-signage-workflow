import { useEffect, useRef, useState } from "react";
import { Bookmark, Check, ChevronDown, Star, Trash2 } from "lucide-react";

const readViews = (key) => {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(parsed) ? parsed.filter((v) => v && typeof v.name === "string" && v.state && typeof v.state === "object") : [];
  } catch { return []; }
};

// Named, localStorage-backed filter presets. `getState` returns the current
// serializable filter state; `onApply` restores it. Per-page, per-browser.
export default function SavedViews({ storageKey, getState, onApply, activeName, autoApply = false }) {
  const [views, setViews] = useState(() => readViews(storageKey));
  const [open, setOpen] = useState(false);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const ref = useRef(null);
  const [defaultName, setDefaultName] = useState(() => {
    try { return localStorage.getItem(`${storageKey}_default`) || ""; } catch { return ""; }
  });
  const autoAppliedRef = useRef(false);

  // Auto-apply the user's default view once on mount — only when the parent
  // says the URL carries no explicit filters (deep links always win).
  useEffect(() => {
    if (autoAppliedRef.current || !autoApply || !defaultName) return;
    const view = views.find((v) => v.name === defaultName);
    if (!view) return;
    autoAppliedRef.current = true;
    onApply(view.state, view.name);
  }, [autoApply, defaultName]); // eslint-disable-line react-hooks/exhaustive-deps

  const setDefault = (viewName) => {
    const next = defaultName === viewName ? "" : viewName;
    setDefaultName(next);
    try {
      if (next) localStorage.setItem(`${storageKey}_default`, next);
      else localStorage.removeItem(`${storageKey}_default`);
    } catch { /* quota — non-fatal */ }
  };

  useEffect(() => {
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) { setOpen(false); setNaming(false); } };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const persist = (next) => {
    setViews(next);
    try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* quota — non-fatal */ }
  };

  const save = () => {
    const trimmed = name.trim().slice(0, 40);
    if (!trimmed) return;
    const state = getState();
    const next = [...views.filter((v) => v.name !== trimmed), { name: trimmed, state, saved_at: new Date().toISOString() }];
    persist(next);
    setName("");
    setNaming(false);
    onApply(state, trimmed);
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-slate-300 px-3 text-sm font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
      >
        <Bookmark className="h-4 w-4" />
        {activeName || "Views"}
        <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-1 w-60 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900">
          {views.length === 0 && <p className="px-3 py-2.5 text-xs text-slate-400">No saved views yet.</p>}
          {views.map((v) => (
            <div key={v.name} className="group flex items-center hover:bg-violet-50 dark:hover:bg-slate-800">
              <button
                type="button"
                onClick={() => { onApply(v.state, v.name); setOpen(false); }}
                className="flex-1 px-3 py-2 text-left text-sm text-slate-700 dark:text-slate-200"
              >
                {v.name === activeName && <Check className="mr-1 inline h-3.5 w-3.5 text-violet-600" />}
                {v.name}
              </button>
              <button
                type="button"
                onClick={() => setDefault(v.name)}
                className={`mr-1 rounded p-1 ${v.name === defaultName ? "text-amber-500" : "text-slate-300 hover:text-amber-500"} invisible group-hover:visible`}
                aria-label={v.name === defaultName ? `Unset ${v.name} as default` : `Set ${v.name} as default`}
                title={v.name === defaultName ? "Default view (auto-applied)" : "Set as default view"}
              >
                <Star className="h-3.5 w-3.5" fill={v.name === defaultName ? "currentColor" : "none"} />
              </button>
              <button
                type="button"
                onClick={() => persist(views.filter((x) => x.name !== v.name))}
                className="invisible mr-2 rounded p-1 text-slate-400 hover:text-red-500 group-hover:visible"
                aria-label={`Delete ${v.name}`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          <div className="border-t border-slate-100 p-2 dark:border-slate-800">
            {naming ? (
              <div className="flex gap-1.5">
                <input
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") setNaming(false); }}
                  placeholder="View name"
                  className="min-w-0 flex-1 rounded-lg border border-slate-300 px-2 py-1.5 text-xs dark:border-slate-600 dark:bg-slate-800"
                />
                <button type="button" onClick={save} className="rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs font-semibold text-white dark:bg-violet-600">Save</button>
              </div>
            ) : (
              <button type="button" onClick={() => setNaming(true)} className="w-full rounded-lg px-2 py-1.5 text-left text-xs font-semibold text-violet-600 hover:bg-violet-50 dark:text-violet-300 dark:hover:bg-slate-800">
                + Save current filters
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

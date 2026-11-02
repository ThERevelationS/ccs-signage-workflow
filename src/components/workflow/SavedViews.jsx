import { useEffect, useRef, useState } from "react";
import { Bookmark, Check, ChevronDown, Pencil, Pin, Star, Trash2 } from "lucide-react";
import {
  SAVED_VIEWS_UNAVAILABLE,
  applyView,
  deleteView,
  listViews,
  pinView,
  renameView,
  saveView,
  setDefaultView,
} from "@/components/queues/savedViewsPersistence";
import {
  findViewByName,
  isMirrorView,
  isOwnView,
  isViewShared,
  sortViews,
} from "@/components/queues/savedViewsModel";

const readViews = (key) => {
  try {
    const parsed = JSON.parse(localStorage.getItem(key || "") || "[]");
    return Array.isArray(parsed) ? parsed.filter((v) => v && typeof v.name === "string" && v.state && typeof v.state === "object") : [];
  } catch { return []; }
};

// Named filter presets — server-saved via the SavedQueueView entity when a
// signed-in owner is known, else the original per-browser localStorage mode.
//
// Props (component stays prop-driven — no hooks into auth/router):
//   pageKey    — REQUIRED for the server-backed path: the SavedQueueView.page
//                scope the views belong to. When omitted the component falls
//                back to `storageKey` as the scope so existing callers keep
//                working unchanged; new mount points should always pass an
//                explicit pageKey.
//   storageKey — legacy localStorage namespace; also the scope fallback and
//                the whole data path when no ownerEmail is supplied.
//   ownerEmail — the signed-in staff email; presence enables server mode.
//   getState   — () => serializable filter state to store.
//   onApply    — (state, name) restores a picked view.
//   activeName — label/highlight for the currently applied view.
//   autoApply  — apply the owner's is_default view once on mount (the parent
//                gates this on "URL carried no explicit filters").
//
// Server mode adds pin (Pin), rename (Pencil) and server-default (Star)
// row actions; shared rows show an apply-only entry and session-mirror rows
// (saved while the gateway was unreachable) carry an "offline" hint. While
// degraded, the dropdown badge notes it — the mirror is per-session only.
export default function SavedViews({
  pageKey,
  storageKey,
  ownerEmail = "",
  getState,
  onApply,
  activeName,
  autoApply = false,
}) {
  const scope = String(pageKey || storageKey || "").trim();
  const serverMode = Boolean(ownerEmail && scope);

  // pageKey is the required scope prop for the server-backed path — when it's
  // missing the storageKey namespace doubles as the scope so existing callers
  // keep working; warn once so new mount points notice.
  useEffect(() => {
    if (ownerEmail && !pageKey && storageKey) {
      // eslint-disable-next-line no-console
      console.warn(`SavedViews: pageKey prop missing — scoping views to storageKey "${storageKey}". Pass an explicit pageKey.`);
    }
  }, [ownerEmail, pageKey, storageKey]);

  const [views, setViews] = useState(() => (serverMode ? [] : readViews(storageKey)));
  const [degraded, setDegraded] = useState(false);
  const [open, setOpen] = useState(false);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const [renamingId, setRenamingId] = useState(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const ref = useRef(null);
  const autoAppliedRef = useRef(false);

  const [defaultName, setDefaultName] = useState(() => {
    try { return localStorage.getItem(`${storageKey}_default`) || ""; } catch { return ""; }
  });

  // Server-backed load — scoped by SavedQueueView.page. degraded comes back
  // true when the entity read failed and the session mirror answered instead.
  useEffect(() => {
    if (!serverMode) return undefined;
    let cancelled = false;
    listViews({ pageKey: scope, ownerEmail }).then(
      (res) => {
        if (cancelled) return;
        setViews(res.views || []);
        setDegraded(res.degraded === true);
        setNotice(res.available === false ? SAVED_VIEWS_UNAVAILABLE : "");
      },
      (e) => {
        if (!cancelled) setNotice(e?.message || "Saved views could not be loaded.");
      }
    );
    return () => { cancelled = true; };
  }, [serverMode, scope, ownerEmail, reloadKey]);

  // Auto-apply the owner's default view once on mount — only when the parent
  // says the URL carries no explicit filters (deep links always win).
  useEffect(() => {
    if (autoAppliedRef.current || !autoApply) return;
    if (serverMode) {
      const def = views.find((v) => v.is_default === true && isOwnView(v, ownerEmail));
      if (!def) return;
      autoAppliedRef.current = true;
      onApply(applyView(def), def.name);
      return;
    }
    if (!defaultName) return;
    const view = views.find((v) => v.name === defaultName);
    if (!view) return;
    autoAppliedRef.current = true;
    onApply(view.state, view.name);
  }, [autoApply, views, defaultName, serverMode]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) { setOpen(false); setNaming(false); setRenamingId(null); } };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  // --- legacy local-mode persistence (no ownerEmail) ------------------------

  const persist = (next) => {
    setViews(next);
    if (!storageKey) return;
    try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* quota — non-fatal */ }
  };

  const setLocalDefault = (viewName) => {
    const next = defaultName === viewName ? "" : viewName;
    setDefaultName(next);
    if (!storageKey) return;
    try {
      if (next) localStorage.setItem(`${storageKey}_default`, next);
      else localStorage.removeItem(`${storageKey}_default`);
    } catch { /* quota — non-fatal */ }
  };

  // --- actions --------------------------------------------------------------

  const applyOne = (v) => {
    onApply(serverMode ? applyView(v) : v.state, v.name);
    setOpen(false);
  };

  const save = async () => {
    const trimmed = name.trim().slice(0, 40);
    if (!trimmed) return;
    const state = getState?.() ?? {};
    if (!serverMode) {
      const next = [...views.filter((v) => v.name !== trimmed), { name: trimmed, state, saved_at: new Date().toISOString() }];
      persist(next);
      setName("");
      setNaming(false);
      onApply(state, trimmed);
      return;
    }
    setBusy(true);
    setNotice("");
    try {
      const existing = findViewByName(views, { name: trimmed, ownerEmail, pageKey: scope });
      const res = await saveView({
        name: trimmed,
        pageKey: scope,
        filters: state,
        ownerEmail,
        existing,
        // Overwriting keeps the row's flags — a save must not silently unpin
        // or un-default the view it replaces.
        ...(existing
          ? {
              pinned: existing.pinned === true,
              sort: existing.sort,
              isDefault: existing.is_default === true,
              shared: isViewShared(existing),
            }
          : {}),
      });
      setDegraded(res.degraded === true);
      setName("");
      setNaming(false);
      setReloadKey((n) => n + 1);
      if (res.view) onApply(applyView(res.view), trimmed);
    } catch (e) {
      setNotice(e?.message || "The saved view could not be saved.");
    } finally {
      setBusy(false);
    }
  };

  const commitRename = async (v) => {
    const trimmed = renameDraft.trim().slice(0, 40);
    setRenamingId(null);
    if (!trimmed || trimmed === v.name) return;
    if (!serverMode) {
      persist([...views.filter((x) => x.name !== v.name && x.name !== trimmed), { ...v, name: trimmed }]);
      if (defaultName === v.name) {
        setDefaultName(trimmed);
        try { localStorage.setItem(`${storageKey}_default`, trimmed); } catch { /* quota — non-fatal */ }
      }
      return;
    }
    setBusy(true);
    try {
      const res = await renameView({ view: v, name: trimmed, ownerEmail, pageKey: scope });
      setDegraded(res.degraded === true);
      setReloadKey((n) => n + 1);
    } catch (e) {
      setNotice(e?.message || "The saved view could not be renamed.");
    } finally {
      setBusy(false);
    }
  };

  const togglePin = async (v) => {
    setBusy(true);
    try {
      const res = await pinView({ view: v, pinned: v.pinned !== true, views, ownerEmail, pageKey: scope });
      setDegraded(res.degraded === true);
      setReloadKey((n) => n + 1);
    } catch (e) {
      setNotice(e?.message || "The saved view could not be pinned.");
    } finally {
      setBusy(false);
    }
  };

  const toggleDefault = async (v) => {
    if (!serverMode) { setLocalDefault(v.name); return; }
    setBusy(true);
    try {
      const res = await setDefaultView({ view: v, views, isDefault: v.is_default !== true, ownerEmail, pageKey: scope });
      setDegraded(res.degraded === true);
      if (res.warning) setNotice(res.warning);
      setReloadKey((n) => n + 1);
    } catch (e) {
      setNotice(e?.message || "The default view could not be changed.");
    } finally {
      setBusy(false);
    }
  };

  const removeView = async (v) => {
    if (!serverMode) { persist(views.filter((x) => x.name !== v.name)); return; }
    setBusy(true);
    try {
      const res = await deleteView(v, { ownerEmail, pageKey: scope });
      setDegraded(res.degraded === true);
      setReloadKey((n) => n + 1);
    } catch (e) {
      setNotice(e?.message || "The saved view could not be deleted.");
    } finally {
      setBusy(false);
    }
  };

  // Pinned first (then sort weight, then name) — sortViews is deterministic,
  // so the dropdown order is stable across reloads.
  const ordered = serverMode ? sortViews(views, ownerEmail) : views;
  const rowKey = (v) => (serverMode ? v.id || v.name : v.name);
  const isDefaultRow = (v) => (serverMode ? v.is_default === true : v.name === defaultName);
  const canMutate = (v) => !serverMode || isOwnView(v, ownerEmail);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-slate-300 px-3 text-sm font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
      >
        <Bookmark className="h-4 w-4 shrink-0" />
        <span className="max-w-[10rem] truncate">{activeName || "Views"}</span>
        {degraded && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" title="Saved views offline — session mirror" />}
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400" />
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-1 w-64 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900">
          {degraded && (
            <p className="border-b border-amber-100 bg-amber-50 px-3 py-1.5 text-[10px] font-medium text-amber-700 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-300">
              Saved views offline — showing this session's mirror.
            </p>
          )}
          {ordered.length === 0 && <p className="px-3 py-2.5 text-xs text-slate-400">No saved views yet.</p>}
          {ordered.map((v) => {
            const shared = serverMode && isViewShared(v) && !isOwnView(v, ownerEmail);
            const mirrored = serverMode && isMirrorView(v);
            const renaming = (serverMode ? renamingId === v.id : renamingId === v.name);
            return (
              <div key={rowKey(v)} className="group flex items-center hover:bg-violet-50 dark:hover:bg-slate-800">
                {renaming ? (
                  <div className="flex flex-1 items-center gap-1 px-2 py-1">
                    <input
                      autoFocus
                      value={renameDraft}
                      onChange={(e) => setRenameDraft(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") commitRename(v); if (e.key === "Escape") setRenamingId(null); }}
                      className="min-w-0 flex-1 rounded-md border border-slate-300 px-1.5 py-1 text-xs dark:border-slate-600 dark:bg-slate-800"
                    />
                    <button type="button" onClick={() => commitRename(v)} className="rounded-md bg-slate-900 px-2 py-1 text-[11px] font-semibold text-white dark:bg-violet-600">OK</button>
                  </div>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => applyOne(v)}
                      className="flex-1 px-3 py-2 text-left text-sm text-slate-700 dark:text-slate-200"
                      title={mirrored ? "Saved to this session's mirror (saved views offline)" : undefined}
                    >
                      {v.name === activeName && <Check className="mr-1 inline h-3.5 w-3.5 text-violet-600" />}
                      {v.name}
                      {shared && <span className="ml-1 text-[10px] text-slate-400">(shared)</span>}
                      {mirrored && <span className="ml-1 text-[10px] font-medium text-amber-600">(offline)</span>}
                    </button>
                    {canMutate(v) && (
                      <>
                        {serverMode && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => togglePin(v)}
                            className={`mr-1 rounded p-1 invisible group-hover:visible ${v.pinned === true ? "text-violet-500" : "text-slate-300 hover:text-violet-500"}`}
                            aria-label={v.pinned === true ? `Unpin ${v.name}` : `Pin ${v.name}`}
                            title={v.pinned === true ? "Pinned — click to unpin" : "Pin to top"}
                          >
                            <Pin className="h-3.5 w-3.5" fill={v.pinned === true ? "currentColor" : "none"} />
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => toggleDefault(v)}
                          className={`mr-1 rounded p-1 ${isDefaultRow(v) ? "text-amber-500" : "text-slate-300 hover:text-amber-500"} invisible group-hover:visible`}
                          aria-label={isDefaultRow(v) ? `Unset ${v.name} as default` : `Set ${v.name} as default`}
                          title={isDefaultRow(v) ? "Default view (auto-applied)" : "Set as default view"}
                        >
                          <Star className="h-3.5 w-3.5" fill={isDefaultRow(v) ? "currentColor" : "none"} />
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => { setRenamingId(serverMode ? v.id : v.name); setRenameDraft(v.name); }}
                          className="invisible mr-1 rounded p-1 text-slate-300 hover:text-slate-600 group-hover:visible dark:hover:text-slate-200"
                          aria-label={`Rename ${v.name}`}
                          title="Rename"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => removeView(v)}
                          className="invisible mr-2 rounded p-1 text-slate-400 hover:text-red-500 group-hover:visible"
                          aria-label={`Delete ${v.name}`}
                          title="Delete"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </>
                    )}
                  </>
                )}
              </div>
            );
          })}
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
                <button type="button" disabled={busy} onClick={save} className="rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs font-semibold text-white dark:bg-violet-600">Save</button>
              </div>
            ) : (
              <button type="button" onClick={() => setNaming(true)} className="w-full rounded-lg px-2 py-1.5 text-left text-xs font-semibold text-violet-600 hover:bg-violet-50 dark:text-violet-300 dark:hover:bg-slate-800">
                + Save current filters
              </button>
            )}
            {notice && <p className="mt-1 px-1 text-[10px] text-rose-600 dark:text-rose-400">{notice}</p>}
          </div>
        </div>
      )}
    </div>
  );
}

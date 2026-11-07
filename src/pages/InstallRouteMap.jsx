import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { staffEntities } from "@/components/staff/staffEntities";
import { useAllWorkOrders } from "@/lib/workOrderCache";
import { createPageUrl } from "@/utils";
import { CcsDateField } from "@/components/ui/ccs-date-field";
import { AlertTriangle, ArrowDown, ArrowUp, CalendarDays, ChevronLeft, ChevronRight, ExternalLink, Loader2, MapPin, Navigation } from "lucide-react";

const clean = (v) => String(v ?? "").trim();
const DAY_MS = 86400000;
const dayKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const parseDay = (s) => { const d = s ? new Date(`${s}T00:00:00`) : null; return d && !Number.isNaN(d.getTime()) ? d : null; };
const fmtDay = (d) => d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
const ORIGIN_KEY = "installRouteMap.origin";

const urlParam = (name) => {
  try { return new URLSearchParams(window.location.search).get(name); } catch { return null; }
};

export default function InstallRouteMap() {
  const { data: allWorkOrders, isLoading, error, refetch } = useAllWorkOrders();
  const [date, setDate] = useState(() => parseDay(urlParam("date")) || new Date());
  const [origin, setOrigin] = useState(() => { try { return localStorage.getItem(ORIGIN_KEY) || ""; } catch { return ""; } });
  const [busy, setBusy] = useState(false);
  const [reorderErr, setReorderErr] = useState("");

  // Keep ?date= in the address bar so a day's route can be linked/shared.
  useEffect(() => {
    try {
      const p = new URLSearchParams(window.location.search);
      p.set("date", dayKey(date));
      window.history.replaceState(null, "", `${window.location.pathname}?${p.toString()}`);
    } catch { /* no-op outside the browser */ }
  }, [date]);

  useEffect(() => {
    try { localStorage.setItem(ORIGIN_KEY, clean(origin)); } catch { /* private mode */ }
  }, [origin]);

  const stops = useMemo(() => {
    const key = dayKey(date);
    return (allWorkOrders || [])
      .filter((wo) =>
        wo && !wo.completed && !wo.deleted
        && wo.current_stage !== "completed"
        && wo.sales_status !== "lost"
        && clean(wo.project_install_date) === key)
      .map((wo, i) => {
        const ord = Number(wo.install_route_order);
        return { wo, hasLoc: !!clean(wo.install_location), ord: Number.isFinite(ord) ? ord : 10000 + i };
      })
      .sort((a, b) => a.ord - b.ord || clean(a.wo.title).localeCompare(clean(b.wo.title)));
  }, [allWorkOrders, date]);

  const routable = stops.filter((s) => s.hasLoc);
  const needsLocation = stops.filter((s) => !s.hasLoc);

  const move = async (idx, dir) => {
    const next = routable.slice();
    const swap = idx + dir;
    if (idx < 0 || swap < 0 || swap >= next.length) return;
    next.splice(swap, 0, next.splice(idx, 1)[0]);
    setBusy(true);
    setReorderErr("");
    try {
      // Persist sequential stop numbers; only write rows whose order actually changed.
      const writes = [];
      next.forEach((s, i) => {
        const want = i + 1;
        if (Number(s.wo.install_route_order) !== want) {
          writes.push(staffEntities.WorkOrder.updateMany({ id: s.wo.id, updated_date: s.wo.updated_date }, { $set: { install_route_order: want } }));
        }
      });
      if (writes.length) await Promise.all(writes);
      await refetch();
    } catch (e) {
      setReorderErr(e?.message || "Could not save the stop order.");
    } finally {
      setBusy(false);
    }
  };

  // Google Maps URL API: destination = last stop, earlier stops become waypoints.
  // No origin → the crew's current location is the start, which is what install
  // crews want on the road; the origin field lets dispatchers pin the shop.
  const mapsUrl = useMemo(() => {
    const locs = routable.map((s) => clean(s.wo.install_location)).filter(Boolean);
    if (!locs.length) return "";
    const p = new URLSearchParams({ api: "1", destination: locs[locs.length - 1] });
    if (clean(origin)) p.set("origin", clean(origin));
    const waypoints = locs.slice(0, -1);
    if (waypoints.length) p.set("waypoints", waypoints.join("|"));
    return `https://www.google.com/maps/dir/?${p.toString()}`;
  }, [routable, origin]);

  const todayKey = dayKey(new Date());
  const isToday = dayKey(date) === todayKey;

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-violet-600" />
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Install Route Map</h1>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Ordered install stops for {isToday ? "today" : fmtDay(date)} — send the crew a multi-stop route.
          </p>
        </div>
        <Link
          to={createPageUrl("ProductionSchedule")}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300"
        >
          <CalendarDays className="h-3.5 w-3.5" /> Production Schedule
        </Link>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
        <button type="button" onClick={() => setDate(new Date(date.getTime() - DAY_MS))}
          className="rounded-lg border border-slate-300 p-2 text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300" aria-label="Previous day">
          <ChevronLeft className="h-4 w-4" /></button>
        <button type="button" onClick={() => setDate(new Date())}
          className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300">
          Today</button>
        <button type="button" onClick={() => setDate(new Date(date.getTime() + DAY_MS))}
          className="rounded-lg border border-slate-300 p-2 text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300" aria-label="Next day">
          <ChevronRight className="h-4 w-4" /></button>
        <CcsDateField
          value={dayKey(date)}
          onChange={(e) => { const d = parseDay(e.target.value); if (d) setDate(d); }}
          className="min-h-9 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300" />
        <input
          value={origin}
          onChange={(e) => setOrigin(e.target.value)}
          placeholder="Route origin (blank = current location)"
          aria-label="Route origin address"
          className="min-h-9 min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300" />
        <a
          href={mapsUrl || undefined}
          target="_blank" rel="noreferrer"
          aria-disabled={!mapsUrl}
          className={`inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold ${mapsUrl ? "bg-violet-600 text-white hover:bg-violet-700" : "cursor-not-allowed bg-slate-200 text-slate-400 dark:bg-slate-800 dark:text-slate-600"}`}
          onClick={(e) => { if (!mapsUrl) e.preventDefault(); }}
        >
          <Navigation className="h-3.5 w-3.5" /> Open in Google Maps <ExternalLink className="h-3 w-3 opacity-70" />
        </a>
      </div>

      {reorderErr ? (
        <div className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300" role="alert">
          {reorderErr}
        </div>
      ) : null}

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading work orders…</div>
      ) : error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300" role="alert">
          Could not load work orders: {error?.message || "unknown error"}
        </div>
      ) : stops.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
          No installs scheduled for {fmtDay(date)}. Set a work order's install date on its job workspace to route it.
        </div>
      ) : (
        <>
          <ol className="space-y-2">
            {routable.map((s, i) => (
              <li key={s.wo.id} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-violet-600 text-xs font-bold text-white">{i + 1}</div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{s.wo.title || s.wo.work_order_number || "Untitled job"}</span>
                    {clean(s.wo.client_name) ? <span className="text-xs text-slate-500 dark:text-slate-400">{s.wo.client_name}</span> : null}
                  </div>
                  <div className="mt-0.5 flex items-start gap-1 text-xs text-slate-500 dark:text-slate-400">
                    <MapPin className="mt-0.5 h-3 w-3 shrink-0" /><span className="break-words">{s.wo.install_location}</span>
                  </div>
                </div>
                <Link
                  to={`${createPageUrl("JobWorkspace")}?wo=${encodeURIComponent(s.wo.id)}`}
                  className="shrink-0 rounded-lg border border-slate-300 px-2 py-1.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300"
                >Job</Link>
                <div className="flex shrink-0 flex-col">
                  <button type="button" disabled={busy || i === 0} onClick={() => move(i, -1)} aria-label={`Move ${s.wo.title || "stop"} earlier`}
                    className="rounded p-1 text-slate-500 hover:bg-slate-100 disabled:opacity-30 dark:hover:bg-slate-800"><ArrowUp className="h-4 w-4" /></button>
                  <button type="button" disabled={busy || i === routable.length - 1} onClick={() => move(i, 1)} aria-label={`Move ${s.wo.title || "stop"} later`}
                    className="rounded p-1 text-slate-500 hover:bg-slate-100 disabled:opacity-30 dark:hover:bg-slate-800"><ArrowDown className="h-4 w-4" /></button>
                </div>
              </li>
            ))}
          </ol>

          {needsLocation.length ? (
            <div className="mt-6">
              <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400">
                <AlertTriangle className="h-3.5 w-3.5" /> Needs install location ({needsLocation.length})
              </div>
              <ul className="space-y-2">
                {needsLocation.map((s) => (
                  <li key={s.wo.id} className="flex items-center gap-3 rounded-xl border border-dashed border-amber-300 bg-amber-50/50 p-3 dark:border-amber-800 dark:bg-amber-950/20">
                    <div className="min-w-0 flex-1">
                      <span className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{s.wo.title || s.wo.work_order_number || "Untitled job"}</span>
                      {clean(s.wo.client_name) ? <span className="ml-2 text-xs text-slate-500 dark:text-slate-400">{s.wo.client_name}</span> : null}
                    </div>
                    <Link
                      to={`${createPageUrl("JobWorkspace")}?wo=${encodeURIComponent(s.wo.id)}`}
                      className="shrink-0 rounded-lg border border-amber-300 px-2 py-1.5 text-[11px] font-semibold text-amber-700 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-300"
                    >Add location</Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAllWorkOrders } from "@/lib/workOrderCache";
import { buildWorkOrderSegments, stageColors, stageNames } from "@/components/workflow/workOrderTimelineSegments";
import { CalendarDays, ChevronLeft, ChevronRight, Loader2, Search } from "lucide-react";
import { CcsDateField } from "@/components/ui/ccs-date-field";

const clean = (v) => String(v ?? "").trim();
const DAY_MS = 86400000;
const dayKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const startOfWeek = (d) => { const t = new Date(d.getFullYear(), d.getMonth(), d.getDate()); return new Date(t.getTime() - ((t.getDay() + 6) % 7) * DAY_MS); }; // Monday-first
const fmtDay = (d) => d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
const EXCLUDED_TASK = /^Prospect Initiation|^Completed Sale|^Lost$|^Lost -|^Closed -/i;

const STAGE_KEYS = ["sales", "estimating", "permitting", "design", "production", "fabrication", "installation"];

// Estimated hours live on the WO's note/task items; a task segment's id embeds
// the note id (`<woId>__task_<noteId>`). Main-segment records may also carry a
// top-level estimated_hours if one is ever added.
const segEstHours = (s) => {
  const top = Number(s?.record?.estimated_hours);
  if (Number.isFinite(top) && top > 0) return top;
  if (s?.kind === "task" && Array.isArray(s.record?.notes)) {
    const noteId = String(s.id || "").split("__task_")[1];
    const note = s.record.notes.find((n) => String(n?.id) === String(noteId));
    const h = Number(note?.estimated_hours);
    if (Number.isFinite(h) && h > 0) return h;
  }
  return 0;
};

// Item counts come from the WO's products[].quantity — only counted on the
// "main" segment so each job contributes its BOM quantity once.
const segItemCount = (s) => {
  if (s?.kind !== "main") return 0;
  const prods = Array.isArray(s.record?.products) ? s.record.products : [];
  return prods.reduce((t, p) => t + (Number(p?.quantity) || 0), 0);
};

const urlParam = (name) => {
  try { return new URLSearchParams(window.location.search).get(name); } catch { return null; }
};

function Chip({ seg, onOpen }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(seg)}
      title={`${seg.label} — ${seg.record?.title || ""}`}
      className="block w-full truncate rounded-md px-2 py-1 text-left text-[11px] font-semibold text-slate-800 hover:ring-2 hover:ring-violet-400"
      style={{ background: seg.color, printColorAdjust: "exact", WebkitPrintColorAdjust: "exact" }}
    >
      <span className="opacity-60">{seg.kind === "main" ? "●" : seg.kind === "rider" ? "↳" : seg.kind === "task" ? "□" : "◆"}</span>{" "}
      {seg.record?.title ? `${seg.record.title}: ` : ""}{seg.label}
    </button>
  );
}

export default function ProductionSchedule() {
  const navigate = useNavigate();
  const { data: allWorkOrders, isLoading, error } = useAllWorkOrders();
  const [weekStart, setWeekStart] = useState(() => {
    const w = urlParam("week"); // ?week=YYYY-MM-DD jumps to the week containing that date
    const d = w ? new Date(`${w}T00:00:00`) : null;
    return startOfWeek(d && !Number.isNaN(d.getTime()) ? d : new Date());
  });
  const [query, setQuery] = useState(() => urlParam("q") || "");
  const [stageFilter, setStageFilter] = useState(() => {
    const s = clean(urlParam("stage"));
    return STAGE_KEYS.includes(s) ? s : "";
  });

  // Keep the address bar in sync so filtered/week views can be linked.
  useEffect(() => {
    try {
      const p = new URLSearchParams(window.location.search);
      if (clean(query)) p.set("q", clean(query)); else p.delete("q");
      if (stageFilter) p.set("stage", stageFilter); else p.delete("stage");
      p.set("week", dayKey(weekStart));
      const qs = p.toString();
      window.history.replaceState(null, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
    } catch { /* no-op outside the browser */ }
  }, [query, stageFilter, weekStart]);

  const segments = useMemo(() => {
    const q = clean(query).toLowerCase();
    const all = allWorkOrders || [];
    const active = all.filter((wo) =>
      wo && !wo.completed && !wo.deleted && wo.current_stage !== "completed"
      && wo.sales_status !== "lost" && !EXCLUDED_TASK.test(wo.current_task_description || ""));
    const parents = active.filter((w) => !w.is_rider);
    const riders = active.filter((w) => w.is_rider);
    const withRiders = parents.map((p) => ({ ...p, riders: riders.filter((r) => r.parent_work_order_id === p.id) }));
    const segs = [];
    for (const wo of withRiders) segs.push(...buildWorkOrderSegments(wo));
    return segs.filter((s) => {
      if (stageFilter && s.stage !== stageFilter) return false;
      if (q && ![s.label, s.record?.title, s.record?.client_name].some((v) => clean(v).toLowerCase().includes(q))) return false;
      return true;
    });
  }, [allWorkOrders, query, stageFilter]);

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => new Date(weekStart.getTime() + i * DAY_MS)), [weekStart]);
  const todayKey = dayKey(new Date());
  const byDay = useMemo(() => {
    const m = new Map(days.map((d) => [dayKey(d), []]));
    const overdue = [];
    for (const s of segments) {
      const d = new Date(s.due);
      if (Number.isNaN(d.getTime())) continue;
      const k = dayKey(d);
      if (m.has(k)) m.get(k).push(s);
      else if (k < dayKey(days[0])) overdue.push(s);
    }
    for (const list of m.values()) list.sort((a, b) => a.label.localeCompare(b.label));
    overdue.sort((a, b) => String(a.due).localeCompare(String(b.due)));
    const stats = new Map();
    for (const [k, list] of m) {
      stats.set(k, {
        jobs: new Set(list.map((s) => s.record?.id).filter(Boolean)).size,
        hours: list.reduce((t, s) => t + segEstHours(s), 0),
        items: list.reduce((t, s) => t + segItemCount(s), 0),
        stages: [...new Set(list.map((s) => s.stage).filter(Boolean))],
      });
    }
    return { m, overdue, stats };
  }, [segments, days]);

  const weekSummary = useMemo(() => {
    const jobs = new Set();
    const byStage = {};
    let items = 0;
    for (const list of byDay.m.values()) {
      for (const s of list) {
        items += 1;
        if (s.record?.id) jobs.add(s.record.id);
        if (s.stage) byStage[s.stage] = (byStage[s.stage] || 0) + 1;
      }
    }
    return { jobs: jobs.size, items, byStage, overdue: byDay.overdue.length };
  }, [byDay]);

  const open = (seg) => {
    const id = seg?.record?.id;
    if (id) navigate(`/MainWorkflow?wo=${id}`);
  };

  return (
    <div className="mx-auto max-w-[1400px] p-4 md:p-6 print:max-w-none print:bg-white print:p-0">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-violet-600" />
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Production Schedule</h1>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Week view of every dated job portion — job due dates, rider due dates, task deadlines, and sales milestones.
          </p>
        </div>
        <div className="flex items-center gap-2 print:hidden">
          <button type="button" onClick={() => setWeekStart(new Date(weekStart.getTime() - 7 * DAY_MS))}
            className="rounded-lg border border-slate-300 p-2 text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300"><ChevronLeft className="h-4 w-4" /></button>
          <button type="button" onClick={() => setWeekStart(startOfWeek(new Date()))}
            className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300">This week</button>
          <button type="button" onClick={() => setWeekStart(new Date(weekStart.getTime() + 7 * DAY_MS))}
            className="rounded-lg border border-slate-300 p-2 text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300"><ChevronRight className="h-4 w-4" /></button>
          <CcsDateField
            value={dayKey(weekStart)}
            onChange={(e) => {
              const d = new Date(`${e.target.value}T00:00:00`);
              if (!Number.isNaN(d.getTime())) setWeekStart(startOfWeek(d));
            }}
            title="Jump to the week containing this date"
            className="min-h-9 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300" />
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2 print:hidden">
        <div className="relative min-w-52 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            className="min-h-10 w-full rounded-xl border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
            value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search job, client, milestone…" />
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button type="button" onClick={() => setStageFilter("")}
            className={`min-h-9 rounded-full px-3 text-xs font-semibold ${!stageFilter ? "bg-violet-600 text-white" : "border border-slate-300 text-slate-600 dark:border-slate-600 dark:text-slate-300"}`}>All</button>
          {STAGE_KEYS.map((s) => (
            <button key={s} type="button" onClick={() => setStageFilter(stageFilter === s ? "" : s)}
              className={`min-h-9 rounded-full px-3 text-xs font-semibold ${stageFilter === s ? "bg-violet-600 text-white" : "border border-slate-300 text-slate-600 dark:border-slate-600 dark:text-slate-300"}`}>
              {stageNames[s]}
            </button>
          ))}
        </div>
      </div>

      {error && <div className="mb-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">{String(error.message || error)}</div>}

      {isLoading ? (
        <div className="flex items-center justify-center py-20 text-slate-500"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Loading schedule…</div>
      ) : (
        <>
        <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300 print:bg-white">
          <span className="font-bold text-slate-700 dark:text-slate-200">
            {weekSummary.jobs} job{weekSummary.jobs === 1 ? "" : "s"} · {weekSummary.items} item{weekSummary.items === 1 ? "" : "s"} this week
          </span>
          {STAGE_KEYS.filter((s) => weekSummary.byStage[s]).map((s) => (
            <span key={s} className="inline-flex items-center gap-1">
              <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: stageColors[s], printColorAdjust: "exact", WebkitPrintColorAdjust: "exact" }} />
              {stageNames[s]} {weekSummary.byStage[s]}
            </span>
          ))}
          <span className={`ml-auto font-semibold ${weekSummary.overdue ? "text-red-600 dark:text-red-300" : "text-slate-400"}`}>
            {weekSummary.overdue} overdue
          </span>
        </div>
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 print:overflow-visible print:bg-white">
          <div className="grid min-w-[1100px] grid-cols-8 print:min-w-0">
            <div className="border-b border-r border-red-200 bg-red-50/60 p-2 dark:border-red-900 dark:bg-red-950/20">
              <p className="text-xs font-bold uppercase text-red-700 dark:text-red-300">Overdue</p>
              <p className="text-[10px] text-red-500">{byDay.overdue.length} item{byDay.overdue.length === 1 ? "" : "s"}</p>
            </div>
            {days.map((d) => {
              const st = byDay.stats.get(dayKey(d)) || { jobs: 0, hours: 0, items: 0, stages: [] };
              const isToday = dayKey(d) === todayKey;
              return (
                <div key={dayKey(d)} className={`border-b border-r border-slate-200 p-2 last:border-r-0 dark:border-slate-700 ${isToday ? "bg-violet-50 dark:bg-violet-950/30" : ""}`}>
                  <p className={`text-xs font-bold ${isToday ? "text-violet-700 dark:text-violet-300" : "text-slate-600 dark:text-slate-300"}`}>{fmtDay(d)}</p>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400">
                    {st.jobs > 0 ? `${st.jobs} job${st.jobs === 1 ? "" : "s"}` : "—"}
                    {st.hours > 0 ? ` · ${st.hours}h est` : ""}
                    {st.items > 0 ? ` · ${st.items} item${st.items === 1 ? "" : "s"}` : ""}
                  </p>
                  {st.stages.length > 0 && (
                    <div className="mt-0.5 flex flex-wrap gap-0.5">
                      {st.stages.map((sg) => (
                        <span key={sg} title={stageNames[sg] || sg}
                          className="inline-block h-1.5 w-1.5 rounded-full border border-slate-400/40"
                          style={{ background: stageColors[sg] || "#cbd5e1", printColorAdjust: "exact", WebkitPrintColorAdjust: "exact" }} />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            <div className="min-h-64 border-r border-red-200 bg-red-50/30 p-1.5 dark:border-red-900 dark:bg-red-950/10">
              {byDay.overdue.map((s) => <Chip key={s.id} seg={s} onOpen={open} />)}
              {byDay.overdue.length === 0 && <p className="p-2 text-center text-[10px] text-slate-300">—</p>}
            </div>
            {days.map((d) => (
              <div key={dayKey(d)} className={`min-h-64 space-y-1 border-r border-slate-100 p-1.5 last:border-r-0 dark:border-slate-800 ${dayKey(d) === todayKey ? "bg-violet-50/40 dark:bg-violet-950/10" : ""}`}>
                {(byDay.m.get(dayKey(d)) || []).map((s) => <Chip key={s.id} seg={s} onOpen={open} />)}
              </div>
            ))}
          </div>
        </div>
        </>
      )}

      <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-slate-500">
        {STAGE_KEYS.map((s) => (
          <span key={s} className="inline-flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: stageColors[s] }} />{stageNames[s]}</span>
        ))}
        <span className="ml-auto">● job · ↳ rider · □ task · ◆ milestone</span>
      </div>
    </div>
  );
}
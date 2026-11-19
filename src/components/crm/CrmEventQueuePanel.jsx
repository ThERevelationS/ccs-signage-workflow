import React, { useMemo, useState, useCallback } from "react";

import { cn } from "@/lib/utils";
import {
  EmptyState,
  FilterBar,
  FilterField,
  FilterSelect,
  filterInputCls,
  RecordLink,
  StatusChip,
} from "@/components/kit";
import { CcsDateField } from "@/components/ui/ccs-date-field";
import {
  QUEUE_GROUP_ORDER,
  QUEUE_GROUPS,
  buildCreateEventFields,
  distinctQueueAssignees,
  eventTypeOptions,
  filterQueue,
  groupQueueRows,
  isEventComplete,
  queueRows,
  resolveAssigneeName,
  sortQueue,
} from "@/components/crm/crmEventQueueModel";

// Typed CRM event queue panel (G-05). The CrmEventType-backed successor to
// the legacy CrmEventsQueue list — same kit vocabulary, but rows are the
// normalized shape from crmEventQueueModel.queueRows().
//
// Self-contained: `rows` may be normalized queue rows OR raw
// OpportunityActivity records (the panel normalizes them via queueRows).
// Persistence lives in the caller — the panel only emits intents:
//   onCreate(fields)   — buildCreateEventFields payload, ready to persist
//   onComplete(row)    — mark one row complete (caller writes
//                        completeEventPayload via the gateway)
//   onSnooze(row, days) — optional; renders a Snooze select when provided

const sel = "rounded border border-gray-300 bg-white px-1.5 py-1 text-xs";
const lab = "text-[11px] font-semibold uppercase tracking-wide text-gray-500";

const GROUP_TONES = {
  overdue: "text-rose-700",
  today: "text-amber-700",
  upcoming: "text-slate-600",
  nodate: "text-slate-500",
  completed: "text-emerald-700",
};

// A raw activity carries entity fields a normalized row never does.
const isRawActivity = (r) =>
  !!r && ("event_type" in r || "event_type_id" in r || "assigned_to" in r || "company_name" in r);

// A date-only pick means "due by end of that day" (local) — same convention
// as the legacy queue so today's rows don't flag overdue at midnight UTC.
const toDueIso = (dateStr) => {
  const d = String(dateStr || "").trim();
  if (!d) return "";
  const parsed = new Date(`${d}T23:59:59`);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : "";
};

const formatDue = (v) => {
  const t = Date.parse(String(v || ""));
  return Number.isFinite(t) ? new Date(t).toLocaleDateString() : "";
};

// ---------------------------------------------------------------------------
// Create form — type select + title + due date + assignee (spec'd minimum).
// ---------------------------------------------------------------------------

function CreateEventForm({ eventTypes, actor, onCreate, onCancel }) {
  const types = useMemo(() => eventTypeOptions(eventTypes), [eventTypes]);
  const [form, setForm] = useState({ typeId: types[0]?.id || "", title: "", dueDate: "", assignee: actor });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    const type = types.find((t) => t.id === form.typeId) || types[0] || null;
    if (!type) {
      setError("No event types are configured.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await onCreate?.(buildCreateEventFields({
        typeId: type.id,
        typeLabel: type.label,
        channel: type.channel,
        title: form.title,
        dueAt: toDueIso(form.dueDate),
        assignee: form.assignee,
        actor,
        source: "manual",
      }));
      setForm((f) => ({ ...f, title: "", dueDate: "" }));
      onCancel?.();
    } catch (e) {
      setError(e?.message || "Event could not be saved.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-wrap items-end gap-2 rounded border border-sky-200 bg-sky-50/60 p-2">
      <label className="flex flex-col gap-0.5"><span className={lab}>Event type</span>
        <select className={sel} value={form.typeId} onChange={(e) => set("typeId", e.target.value)}>
          {types.map((t) => <option key={t.id || t.label} value={t.id}>{t.label}</option>)}
        </select></label>
      <label className="flex flex-col gap-0.5"><span className={lab}>Title</span>
        <input className={sel} placeholder="optional — defaults to type" value={form.title}
          onChange={(e) => set("title", e.target.value)} /></label>
      <label className="flex flex-col gap-0.5"><span className={lab}>Due date</span>
        <CcsDateField className={sel} value={form.dueDate} onChange={(e) => set("dueDate", e.target.value)} /></label>
      <label className="flex flex-col gap-0.5"><span className={lab}>Assignee</span>
        <input className={sel} value={form.assignee} onChange={(e) => set("assignee", e.target.value)} /></label>
      <button type="button" className={`${sel} font-semibold text-sky-700`} disabled={busy || !types.length} onClick={save}>
        {busy ? "Saving…" : "Save event"}
      </button>
      <button type="button" className={sel} disabled={busy} onClick={onCancel}>Cancel</button>
      {error && <div className="w-full text-xs text-rose-700">{error}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// One queue row
// ---------------------------------------------------------------------------

function QueueRow({ row, users, busy, error, onComplete, onSnooze, onCreate, actor }) {
  const [snooze, setSnooze] = useState("");
  const complete = isEventComplete(row);
  const suggestion = row.suggestion === true;

  const confirmSuggestion = () => {
    onCreate?.(buildCreateEventFields({
      typeId: row.type_id,
      typeLabel: row.type_label,
      channel: row.channel,
      title: row.title,
      dueAt: row.due_at,
      assignee: row.assignee || actor,
      actor,
      customerId: row.customer_id,
      customerName: row.customer_name,
      contactName: row.contact_name,
      estimateId: row.estimate_id,
      opportunityId: row.opportunity_id,
      workOrderId: row.work_order_id,
      source: "auto_followup",
    }));
  };

  return (
    <div className={cn(
      "flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-slate-100 px-3 py-2",
      suggestion ? "bg-violet-50/50" : "odd:bg-white even:bg-slate-50/50",
    )}>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className={cn(
            "rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
            row.type_id ? "bg-violet-100 text-violet-800" : "bg-slate-100 text-slate-600",
          )}>
            {row.type_label || "Event"}
          </span>
          <span className="truncate text-xs font-medium text-slate-800">{row.title}</span>
          {suggestion && <StatusChip tone="violet" label={`suggested · ${row.stale_days ?? "?"}d stale`} size="sm" />}
        </div>
        <div className="mt-0.5 flex flex-wrap gap-x-2 text-[11px] text-slate-500">
          {row.customer_id ? (
            <RecordLink kind="customer" id={row.customer_id}>{row.customer_name || "Customer"}</RecordLink>
          ) : (
            row.customer_name && <span>{row.customer_name}</span>
          )}
          {row.contact_name && row.contact_name !== row.customer_name && <span>{row.contact_name}</span>}
          {row.estimate_number && <span>· {row.estimate_number}</span>}
          {row.opportunity_id && <RecordLink kind="opportunity" id={row.opportunity_id} className="text-[11px]">Linked opportunity</RecordLink>}
          {row.notes && <span className="max-w-[280px] truncate italic" title={row.notes}>{row.notes}</span>}
        </div>
      </div>

      <span className="w-32 truncate text-xs text-slate-500" title={row.assignee}>
        {resolveAssigneeName(row.assignee, users) || "—"}
      </span>

      <span className={cn("w-20 whitespace-nowrap text-xs", row.overdue ? "font-semibold text-rose-700" : "text-slate-600")}>
        {formatDue(row.due_at) || <span className="font-normal text-slate-400">—</span>}
        {row.overdue && <div className="text-[10px]">overdue</div>}
      </span>

      <span className="flex items-center gap-1">
        {suggestion && onCreate && (
          <button type="button" className={`${sel} font-semibold text-violet-700`} disabled={busy} onClick={confirmSuggestion}>
            {busy ? "Saving…" : "Create event"}
          </button>
        )}
        {!suggestion && !complete && (
          <>
            <button
              type="button"
              className={`${sel} font-semibold text-emerald-700`}
              disabled={busy || !onComplete}
              onClick={() => onComplete?.(row)}
            >
              {busy ? "Saving…" : "Complete"}
            </button>
            {onSnooze && (
              <select
                className={sel}
                value={snooze}
                disabled={busy}
                onChange={(e) => {
                  const days = Number(e.target.value) || 0;
                  setSnooze("");
                  if (days) onSnooze(row, days);
                }}
              >
                <option value="">Snooze…</option>
                <option value="1">+1 day</option>
                <option value="3">+3 days</option>
                <option value="7">+1 week</option>
              </select>
            )}
          </>
        )}
        {!suggestion && complete && (
          <span className="text-[11px] text-emerald-700">
            Done{row.completed_by ? ` · ${row.completed_by}` : ""}
          </span>
        )}
      </span>
      {error && <div className="w-full text-[10px] text-rose-700">{error}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------

export default function CrmEventQueuePanel({
  rows = [],
  eventTypes = [],
  users = [],
  suggestions,
  currentUser = null,
  onComplete,
  onCreate,
  onSnooze,
  now: nowProp,
  title = "CRM Event Queue",
  loading = false,
  className,
}) {
  const actor = String(currentUser?.email || currentUser?.full_name || "").trim();
  const now = useMemo(() => (nowProp ? new Date(nowProp) : new Date()), [nowProp]);

  const [salesperson, setSalesperson] = useState("all");
  const [typeId, setTypeId] = useState("all");
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [busy, setBusy] = useState({});
  const [errors, setErrors] = useState({});

  // Accept normalized queue rows or raw OpportunityActivity records.
  const normRows = useMemo(() => {
    const list = Array.isArray(rows) ? rows : [];
    const ready = list.filter((r) => r && !isRawActivity(r));
    const raw = list.filter(isRawActivity);
    const normalized = queueRows(raw, { eventTypes, users, now, includeCompleted: true });
    return [...ready, ...normalized];
  }, [rows, eventTypes, users, now]);

  // Suggestion rows never mix into the dated groups — they render in their
  // own section (and would land in "Today" since their due_at is now).
  const eventRows = useMemo(() => normRows.filter((r) => !r?.suggestion), [normRows]);
  const filtered = useMemo(
    () => sortQueue(filterQueue(eventRows, {
      salesperson: salesperson === "all" ? "" : salesperson,
      typeId: typeId === "all" ? "" : typeId,
      overdueOnly,
      openOnly: !showCompleted,
      now,
    }), { now }),
    [eventRows, salesperson, typeId, overdueOnly, showCompleted, now],
  );
  const groups = useMemo(() => groupQueueRows(filtered, { now }), [filtered, now]);

  const assignees = useMemo(() => distinctQueueAssignees(normRows), [normRows]);
  const typeOptions = useMemo(() => {
    const opts = eventTypeOptions(eventTypes);
    const seen = new Set(opts.map((t) => t.id));
    const seenLabels = new Set(opts.map((t) => t.label.toLowerCase()));
    // Types referenced by rows but missing from the registry (deleted /
    // archived types, legacy label-only rows) stay filterable.
    for (const r of normRows) {
      const label = String(r?.type_label || "").trim();
      if (r?.type_id && !seen.has(r.type_id)) {
        seen.add(r.type_id);
        opts.push({ id: r.type_id, label: label || r.type_id });
      } else if (!r?.type_id && label && !seenLabels.has(label.toLowerCase())) {
        seenLabels.add(label.toLowerCase());
        opts.push({ id: label, label });
      }
    }
    return opts;
  }, [eventTypes, normRows]);

  const openCount = normRows.filter((r) => !isEventComplete(r) && !r.suggestion).length;
  const overdueCount = normRows.filter((r) => r.overdue && !r.suggestion).length;
  const suggestionRows = useMemo(() => {
    const fromProp = Array.isArray(suggestions) ? suggestions : [];
    const inline = normRows.filter((r) => r?.suggestion === true);
    const seen = new Set(inline.map((r) => r.id));
    return [...inline, ...fromProp.filter((s) => s && !seen.has(s.id))];
  }, [suggestions, normRows]);

  const withGuard = useCallback(async (key, fn) => {
    setBusy((b) => ({ ...b, [key]: true }));
    setErrors((e) => ({ ...e, [key]: "" }));
    try {
      await fn();
    } catch (e) {
      setErrors((prev) => ({ ...prev, [key]: e?.message || "Action failed. Try again." }));
    } finally {
      setBusy((b) => ({ ...b, [key]: false }));
    }
  }, []);

  const handleComplete = (row) => withGuard(row.id, () => onComplete?.(row));
  const handleSnooze = (row, days) => withGuard(row.id, () => onSnooze?.(row, days));

  const filtersActive = salesperson !== "all" || typeId !== "all" || overdueOnly || showCompleted;
  const clearFilters = () => { setSalesperson("all"); setTypeId("all"); setOverdueOnly(false); setShowCompleted(false); };
  const groupKeys = [...QUEUE_GROUP_ORDER, ...(groups.completed.length ? ["completed"] : [])];

  return (
    <div className={cn("flex h-full flex-col gap-2 p-3", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-bold text-slate-900">{title}</h2>
          <span className="text-xs text-slate-500">
            {openCount} open{overdueCount ? ` · ${overdueCount} overdue` : ""}
          </span>
        </div>
        {onCreate && (
          <button
            type="button"
            className={cn(filterInputCls, "w-auto cursor-pointer font-semibold text-violet-700 hover:bg-violet-50")}
            onClick={() => setAddOpen((v) => !v)}
          >
            {addOpen ? "Close" : "New event"}
          </button>
        )}
      </div>

      {addOpen && onCreate && (
        <CreateEventForm
          eventTypes={eventTypes}
          actor={actor}
          onCreate={onCreate}
          onCancel={() => setAddOpen(false)}
        />
      )}

      <FilterBar
        className="mb-0 items-end"
        actions={(
          <>
            <label className="flex items-center gap-1 pb-1 text-xs text-slate-600">
              <input type="checkbox" checked={overdueOnly} onChange={(e) => setOverdueOnly(e.target.checked)} />
              Overdue only
            </label>
            <label className="flex items-center gap-1 pb-1 text-xs text-slate-600">
              <input type="checkbox" checked={showCompleted} onChange={(e) => setShowCompleted(e.target.checked)} />
              Show completed
            </label>
            <button
              type="button"
              className={cn(filterInputCls, "w-auto cursor-pointer font-semibold text-slate-600 hover:bg-slate-50")}
              onClick={clearFilters}
            >
              Clear
            </button>
          </>
        )}
      >
        <FilterField label="Salesperson">
          <FilterSelect value={salesperson} onChange={(e) => setSalesperson(e.target.value)}>
            <option value="all">All</option>
            {assignees.map((a) => (
              <option key={a} value={a}>{resolveAssigneeName(a, users) || a}</option>
            ))}
          </FilterSelect>
        </FilterField>
        <FilterField label="Event type">
          <FilterSelect value={typeId} onChange={(e) => setTypeId(e.target.value)}>
            <option value="all">All</option>
            {typeOptions.map((t) => <option key={t.id || t.label} value={t.id}>{t.label}</option>)}
          </FilterSelect>
        </FilterField>
      </FilterBar>

      {suggestionRows.length > 0 && (
        <div className="rounded border border-violet-200 bg-violet-50/40">
          <div className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-violet-800">
            Suggested follow-ups · {suggestionRows.length}
          </div>
          {suggestionRows.map((r) => (
            <QueueRow
              key={r.id}
              row={r}
              users={users}
              now={now}
              busy={!!busy[r.id]}
              error={errors[r.id]}
              onCreate={onCreate ? (fields) => withGuard(r.id, () => onCreate(fields)) : undefined}
              actor={actor}
            />
          ))}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-auto rounded border border-slate-200">
        {loading ? (
          <div className="px-3 py-6 text-center text-xs text-slate-400">Loading…</div>
        ) : filtered.length === 0 ? (
          <EmptyState
            compact
            title={filtersActive ? "No events match these filters." : "Queue is clear."}
            message={filtersActive
              ? "Widen a filter or clear them to see more rows."
              : "Calls, e-mails, visits and consultations land here once they are logged."}
            actionLabel={filtersActive ? "Clear filters" : (onCreate ? "New event" : undefined)}
            onAction={filtersActive ? clearFilters : () => setAddOpen(true)}
          />
        ) : (
          groupKeys.map((key) => {
            const list = groups[key] || [];
            if (!list.length) return null;
            return (
              <div key={key}>
                <div className={cn(
                  "sticky top-0 border-t border-slate-200 bg-slate-100 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide first:border-t-0",
                  GROUP_TONES[key],
                )}>
                  {QUEUE_GROUPS[key]} · {list.length}
                </div>
                {list.map((r) => (
                  <QueueRow
                    key={r.id}
                    row={r}
                    users={users}
                    now={now}
                    busy={!!busy[r.id]}
                    error={errors[r.id]}
                    onComplete={onComplete ? handleComplete : undefined}
                    onSnooze={onSnooze ? handleSnooze : undefined}
                    onCreate={undefined}
                    actor={actor}
                  />
                ))}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

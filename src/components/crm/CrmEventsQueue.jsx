import React, { useEffect, useMemo, useState, useCallback } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { queryClientInstance } from "@/lib/query-client";
import { useAuth } from "@/components/auth/EmailGate";
import { loadAllEntityRows } from "@/components/estimator/loadAllEntityRows";
import { OpportunityActivity, Customer } from "@/api/gatedEntities";
import { createCrmEvent, completeCrmEvent } from "@/components/crm/crmActivityPersistence";
import {
  CRM_EVENT_TYPES,
  CRM_EVENT_OUTCOMES,
  eventsForQueue,
  distinctAssignees,
  eventName,
  outcomeLabel,
  isOpenEvent,
  isOverdue,
} from "@/components/crm/crmEventsModel";
import { CcsDateField } from "@/components/ui/ccs-date-field";

export const CRM_EVENTS_QUERY_KEY = ["crm-events", "all"];
const PAGE_SIZES = [25, 50, 100, 200];

const sel = "rounded border border-gray-300 bg-white px-1.5 py-1 text-xs";
const lab = "text-[11px] font-semibold uppercase tracking-wide text-gray-500";

const badge = (text, tone) => (
  <span className={`inline-block rounded px-1.5 py-0.5 text-[11px] font-medium ${tone}`}>{text}</span>
);
const outcomeTone = (o) => {
  o = String(o || "").toLowerCase();
  if (o === "completed") return "bg-emerald-100 text-emerald-800";
  if (o === "cancelled") return "bg-gray-100 text-gray-600";
  if (o === "rescheduled") return "bg-sky-100 text-sky-800";
  return "bg-amber-100 text-amber-800"; // no_answer / left_message / other
};

const dateOnly = (v) => String(v || "").slice(0, 10);
// A date-only picker means "due by end of that day" — local end-of-day keeps
// the queue from flagging today's rows overdue at midnight UTC.
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

function AddEventForm({ actor, customers, onCreated, onCancel }) {
  const [form, setForm] = useState({
    eventType: CRM_EVENT_TYPES[0],
    subject: "",
    contactName: "",
    companyName: "",
    assignedTo: actor,
    dueDate: "",
    notes: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      const company = String(form.companyName || "").trim();
      const matched = company
        ? customers.find((c) => String(c?.company_name || "").trim().toLowerCase() === company.toLowerCase())
        : null;
      await createCrmEvent({
        eventType: form.eventType,
        subject: form.subject,
        contactName: form.contactName,
        companyName: company,
        customerId: matched?.id || "",
        assignedTo: form.assignedTo,
        dueAt: toDueIso(form.dueDate),
        notes: form.notes,
        source: "manual",
        actor,
      });
      await queryClientInstance.invalidateQueries({ queryKey: CRM_EVENTS_QUERY_KEY });
      onCreated?.();
    } catch (e) {
      setError(e?.message || "Event could not be saved.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-wrap items-end gap-2 rounded border border-sky-200 bg-sky-50/60 p-2">
      <label className="flex flex-col gap-0.5"><span className={lab}>Event type</span>
        <select className={sel} value={form.eventType} onChange={(e) => set("eventType", e.target.value)}>
          {CRM_EVENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select></label>
      <label className="flex flex-col gap-0.5"><span className={lab}>Subject</span>
        <input className={sel} placeholder="optional" value={form.subject} onChange={(e) => set("subject", e.target.value)} /></label>
      <label className="flex flex-col gap-0.5"><span className={lab}>Contact</span>
        <input className={sel} value={form.contactName} onChange={(e) => set("contactName", e.target.value)} /></label>
      <label className="flex flex-col gap-0.5"><span className={lab}>Company</span>
        <input className={sel} list="crm-company-list" value={form.companyName} onChange={(e) => set("companyName", e.target.value)} />
        <datalist id="crm-company-list">
          {customers.map((c) => <option key={c.id} value={c.company_name} />)}
        </datalist></label>
      <label className="flex flex-col gap-0.5"><span className={lab}>Assigned to</span>
        <input className={sel} value={form.assignedTo} onChange={(e) => set("assignedTo", e.target.value)} /></label>
      <label className="flex flex-col gap-0.5"><span className={lab}>Due date</span>
        <CcsDateField className={sel} value={form.dueDate} onChange={(e) => set("dueDate", e.target.value)} /></label>
      <label className="flex flex-col gap-0.5"><span className={lab}>Notes</span>
        <input className={`${sel} w-56`} value={form.notes} onChange={(e) => set("notes", e.target.value)} /></label>
      <button className={`${sel} font-semibold text-sky-700`} disabled={saving} onClick={save}>
        {saving ? "Saving…" : "Save event"}
      </button>
      <button className={sel} disabled={saving} onClick={onCancel}>Cancel</button>
      {error && <div className="w-full text-xs text-rose-700">{error}</div>}
    </div>
  );
}

export default function CrmEventsQueue({ title = "CRM Events" }) {
  const { currentUser } = useAuth();
  const actor = String(currentUser?.email || currentUser?.full_name || "").trim();
  const [searchParams, setSearchParams] = useSearchParams();
  const [page, setPage] = useState(0);
  const [addOpen, setAddOpen] = useState(false);
  const [busy, setBusy] = useState({});
  const [errors, setErrors] = useState({});
  const now = useMemo(() => new Date(), []);

  const { data: activities = [], isFetched } = useQuery({
    queryKey: CRM_EVENTS_QUERY_KEY,
    queryFn: () => loadAllEntityRows({
      entity: OpportunityActivity,
      sort: "-updated_date",
      label: "CRM events",
    }),
  });
  const { data: customers = [] } = useQuery({
    queryKey: ["crm-events", "customers"],
    queryFn: () => loadAllEntityRows({
      entity: Customer,
      sort: "company_name",
      label: "CRM event customers",
      cacheTtlMs: 30000,
    }),
  });

  // Filters live in the URL so a queue view can be shared or bookmarked.
  const filters = useMemo(() => ({
    type: searchParams.get("type") || "all",
    assignedTo: searchParams.get("assignedTo") || "all",
    search: searchParams.get("q") || "",
    includeCompleted: searchParams.get("done") === "1",
    pageSize: Math.max(10, Number(searchParams.get("size")) || 50),
  }), [searchParams]);

  const setFilters = useCallback((patch) => {
    setPage(0);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      const merged = { ...filters, ...patch };
      const write = (key, value, blank) => {
        next.delete(key);
        if (String(value) !== String(blank)) next.set(key, String(value));
      };
      write("type", merged.type, "all");
      write("assignedTo", merged.assignedTo, "all");
      write("q", merged.search, "");
      write("done", merged.includeCompleted ? "1" : "", "");
      write("size", merged.pageSize, 50);
      return next;
    });
  }, [filters, setSearchParams]);

  const set = (key, value) => setFilters({ [key]: value });
  const clearFilters = () => setFilters({ type: "all", assignedTo: "all", search: "", includeCompleted: false, pageSize: 50 });

  const filtered = useMemo(() => eventsForQueue(activities, filters), [activities, filters]);
  const assignees = useMemo(() => distinctAssignees(activities), [activities]);
  const openCount = useMemo(() => activities.filter(isOpenEvent).length, [activities]);

  useEffect(() => { setPage(0); }, [filters]);

  const paged = filtered.slice(page * filters.pageSize, (page + 1) * filters.pageSize);
  const pages = Math.max(1, Math.ceil(filtered.length / filters.pageSize));

  const complete = async (row, outcome) => {
    const key = row.id;
    setBusy((b) => ({ ...b, [key]: true }));
    setErrors((e) => ({ ...e, [key]: "" }));
    try {
      await completeCrmEvent({ activity: row, outcome });
      await queryClientInstance.invalidateQueries({ queryKey: CRM_EVENTS_QUERY_KEY });
    } catch (e) {
      setErrors((prev) => ({ ...prev, [key]: e?.message || "Could not mark this event complete." }));
    } finally {
      setBusy((b) => ({ ...b, [key]: false }));
    }
  };

  return (
    <div className="flex h-full flex-col gap-2 p-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{title}</h2>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">{filtered.length} shown · {openCount} open</span>
          <button className={`${sel} font-semibold text-sky-700`} onClick={() => setAddOpen((v) => !v)}>
            {addOpen ? "Close" : "Add Event"}
          </button>
        </div>
      </div>

      {addOpen && (
        <AddEventForm
          actor={actor}
          customers={customers}
          onCreated={() => setAddOpen(false)}
          onCancel={() => setAddOpen(false)}
        />
      )}

      <div className="flex flex-wrap items-end gap-2 rounded border border-gray-200 bg-gray-50 p-2">
        <label className="flex flex-col gap-0.5"><span className={lab}>Event type</span>
          <select className={sel} value={filters.type} onChange={(e) => set("type", e.target.value)}>
            <option value="all">All</option>
            {CRM_EVENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select></label>
        <label className="flex flex-col gap-0.5"><span className={lab}>Salesperson</span>
          <select className={sel} value={filters.assignedTo} onChange={(e) => set("assignedTo", e.target.value)}>
            <option value="all">All</option>
            {assignees.map((a) => <option key={a} value={a}>{a}</option>)}
          </select></label>
        <label className="flex flex-col gap-0.5"><span className={lab}>Search</span>
          <input className={sel} placeholder="contact, company, subject…" value={filters.search} onChange={(e) => set("search", e.target.value)} /></label>
        <label className="flex flex-col gap-0.5"><span className={lab}>Per page</span>
          <select className={sel} value={filters.pageSize} onChange={(e) => set("pageSize", Number(e.target.value))}>
            {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
          </select></label>
        <label className="flex items-center gap-1 pb-1 text-xs text-gray-600">
          <input type="checkbox" checked={filters.includeCompleted} onChange={(e) => set("includeCompleted", e.target.checked)} />
          Show completed</label>
        <button className={sel} onClick={clearFilters}>Clear</button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto rounded border border-gray-200">
        <table className="w-full text-left text-xs">
          <thead className="sticky top-0 bg-gray-100 text-[11px] uppercase tracking-wide text-gray-600">
            <tr>
              <th className="px-2 py-1.5">Contact</th>
              <th className="px-2 py-1.5">Company</th>
              <th className="px-2 py-1.5">Event</th>
              <th className="px-2 py-1.5">Assigned To</th>
              <th className="px-2 py-1.5">Due</th>
              <th className="px-2 py-1.5">Outcome</th>
              <th className="px-2 py-1.5" />
            </tr>
          </thead>
          <tbody>
            {paged.map((r) => {
              const key = r.id;
              const isBusy = !!busy[key];
              const open = isOpenEvent(r);
              const overdue = isOverdue(r, now);
              return (
                <tr key={key} className="border-t border-gray-100 odd:bg-white even:bg-gray-50/60">
                  <td className="max-w-[160px] truncate px-2 py-1.5">
                    {r.customer_id ? (
                      <Link className="text-sky-700 hover:underline" to={`/Customer360?id=${r.customer_id}`}>
                        {r.contact_name || r.company_name || "Customer"}
                      </Link>
                    ) : (
                      r.contact_name || <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="max-w-[160px] truncate px-2 py-1.5">{r.company_name || <span className="text-gray-400">—</span>}</td>
                  <td className="px-2 py-1.5">
                    <div className="font-medium text-gray-800">{eventName(r)}</div>
                    <div className="text-[10px] text-gray-500">{r.event_type}</div>
                    {r.opportunity_id && (
                      <Link className="text-[10px] text-sky-700 hover:underline" to={`/Opportunities?open=${r.opportunity_id}`}>Linked opportunity</Link>
                    )}
                    {r.notes && <div className="mt-0.5 max-w-[260px] truncate text-[10px] italic text-gray-500" title={r.notes}>{r.notes}</div>}
                  </td>
                  <td className="px-2 py-1.5 text-gray-500">{r.assigned_to || "—"}</td>
                  <td className={`whitespace-nowrap px-2 py-1.5 ${overdue ? "font-semibold text-rose-700" : ""}`}>
                    {formatDue(r.due_at) || <span className="font-normal text-gray-400">—</span>}
                    {overdue && <div className="text-[10px]">overdue</div>}
                  </td>
                  <td className="px-2 py-1.5">
                    {open
                      ? <span className="text-gray-400">—</span>
                      : badge(outcomeLabel(r.outcome), outcomeTone(r.outcome))}
                  </td>
                  <td className="px-2 py-1.5">
                    {open && (
                      <select
                        className={sel}
                        disabled={isBusy}
                        value=""
                        onChange={(e) => { if (e.target.value) complete(r, e.target.value); e.target.value = ""; }}
                      >
                        <option value="">Mark…</option>
                        {CRM_EVENT_OUTCOMES.map((o) => <option key={o} value={o}>{outcomeLabel(o)}</option>)}
                      </select>
                    )}
                    {isBusy && <span className="ml-1 text-[10px] text-gray-400">saving…</span>}
                    {errors[key] && <div className="mt-0.5 max-w-[200px] text-[10px] text-rose-700">{errors[key]}</div>}
                  </td>
                </tr>
              );
            })}
            {!paged.length && (
              <tr><td colSpan={7} className="px-3 py-6 text-center text-gray-400">
                {isFetched ? "No events match these filters." : "Loading…"}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-xs text-gray-500">
        <span>Page {page + 1} of {pages}</span>
        <div className="flex gap-1">
          <button className={sel} disabled={page === 0} onClick={() => setPage(0)}>First</button>
          <button className={sel} disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Prev</button>
          <button className={sel} disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)}>Next</button>
          <button className={sel} disabled={page >= pages - 1} onClick={() => setPage(pages - 1)}>Last</button>
        </div>
      </div>
    </div>
  );
}

// Re-exported for tests and sibling views.
export { dateOnly };

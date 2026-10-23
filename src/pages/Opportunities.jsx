import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/components/auth/EmailGate";
import {
  AlertTriangle,
  ArrowRight,
  Briefcase,
  CheckCircle2,
  ChevronRight,
  FileText,
  GitBranch,
  Inbox,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Send,
  X,
} from "lucide-react";

const STAGES = [
  { key: "new", label: "New" },
  { key: "qualified", label: "Qualified" },
  { key: "estimating", label: "Estimating" },
  { key: "quoted", label: "Quoted" },
  { key: "follow_up", label: "Follow Up" },
  { key: "on_hold", label: "On Hold" },
  { key: "won", label: "Won" },
  { key: "lost", label: "Lost" },
];
const CLOSED_STAGES = new Set(["won", "lost"]);
const REQUIREMENT_OPTIONS = ["unknown", "yes", "no", "maybe", "na"];
const PRIORITY_OPTIONS = ["low", "normal", "high", "rush"];
const PROPERTY_OPTIONS = ["owner", "tenant", "agent", "unknown"];
const SOURCE_TYPES = [
  ["manual", "Manual entry"],
  ["existing_customer", "Existing customer"],
  ["repeat_customer", "Repeat customer"],
  ["phone", "Phone"],
  ["email", "Email"],
  ["website", "Website"],
  ["walk_in", "Walk-in"],
  ["integration", "Integration"],
];

const clean = (v) => String(v ?? "").trim();
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);

const STAGE_TONE = {
  new: "bg-sky-100 text-sky-800 dark:bg-sky-950/40 dark:text-sky-300",
  qualified: "bg-indigo-100 text-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-300",
  estimating: "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
  quoted: "bg-violet-100 text-violet-800 dark:bg-violet-950/40 dark:text-violet-300",
  follow_up: "bg-cyan-100 text-cyan-800 dark:bg-cyan-950/40 dark:text-cyan-300",
  on_hold: "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  won: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300",
  lost: "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300",
};

function StageBadge({ stage }) {
  const key = clean(stage) || "new";
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${STAGE_TONE[key] || STAGE_TONE.new}`}>
      {key.replace(/_/g, " ")}
    </span>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">{label}</span>
      {children}
    </label>
  );
}

const inputCls = "min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100";

const invoke = async (sessionToken, body) => {
  const r = await base44.functions.invoke("opportunityWorkspaceAction", { session_token: sessionToken, ...body });
  const data = r?.data || r;
  if (!data?.success) throw new Error(data?.error || "Request failed.");
  return data;
};

function RequirementSelect({ value, onChange }) {
  return (
    <select className={inputCls} value={value || "unknown"} onChange={(e) => onChange(e.target.value)}>
      {REQUIREMENT_OPTIONS.map((opt) => <option key={opt} value={opt}>{opt === "na" ? "N/A" : opt}</option>)}
    </select>
  );
}

function CustomerPicker({ sessionToken, selected, onSelect }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const q = clean(query);
    if (q.length < 2) { setResults([]); return; }
    let cancelled = false;
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const r = await base44.functions.invoke("opportunityWorkspaceAction", {
          session_token: sessionToken, action: "search_customers", query: q,
        });
        if (!cancelled) setResults((r?.data || r)?.customers || []);
      } catch { if (!cancelled) setResults([]); }
      finally { if (!cancelled) setSearching(false); }
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [query, sessionToken]);

  if (selected?.id) {
    return (
      <div className="flex min-h-10 items-center justify-between rounded-lg border border-emerald-300 bg-emerald-50 px-3 text-sm dark:border-emerald-800 dark:bg-emerald-950/30">
        <span className="font-medium text-emerald-900 dark:text-emerald-200">{selected.company_name}</span>
        <button type="button" onClick={() => onSelect(null)} className="text-xs font-semibold text-emerald-700 hover:underline dark:text-emerald-300">
          change
        </button>
      </div>
    );
  }
  return (
    <div className="relative">
      <input
        className={inputCls}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search existing customers…"
      />
      {searching && <Loader2 className="absolute right-3 top-3 h-4 w-4 animate-spin text-slate-400" />}
      {results.length > 0 && (
        <div className="absolute z-10 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900">
          {results.map((row) => (
            <button
              key={row.id}
              type="button"
              onClick={() => { onSelect(row); setQuery(""); setResults([]); }}
              className="flex w-full flex-col px-3 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">{row.company_name}</span>
              <span className="text-xs text-slate-500">{[row.contact_name, row.contact_email].filter(Boolean).join(" · ")}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function NewIntakeDialog({ sessionToken, onClose, onCreated }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [customer, setCustomer] = useState(null);
  const [f, setF] = useState({
    source_type: "manual", customer_display_name: "", contact_name: "",
    contact_email: "", contact_phone: "", title: "", job_description: "",
    salesperson: "", lead_source: "", budget_amount: "", desired_install_date: "",
    next_action: "", next_action_due: "", next_action_assignee: "",
    priority: "normal", permit_requirement: "unknown", installation_requirement: "unknown",
    removal_requirement: "unknown", electrical_requirement: "unknown",
    survey_requirement: "unknown", property_relationship: "unknown",
    electrical_details: "", notes: "",
  });
  const set = (k, v) => setF((prev) => ({ ...prev, [k]: v }));

  const submit = async () => {
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      const fields = { ...f };
      if (customer?.id) {
        fields.customer_id = customer.id;
        if (!clean(fields.customer_display_name)) fields.customer_display_name = customer.company_name;
      }
      const r = await base44.functions.invoke("opportunityWorkspaceAction", {
        session_token: sessionToken,
        action: "capture_intake",
        creation_request_key: uuid(),
        source_type: f.source_type,
        fields,
      });
      const data = r?.data || r;
      if (!data?.success) throw new Error(data?.error || "Intake capture failed.");
      onCreated(data.opportunity);
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || "Intake capture failed.");
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/50 p-4" role="dialog" aria-modal="true">
      <div className="my-8 w-full max-w-3xl rounded-2xl border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-700 dark:bg-slate-900">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Inbox className="h-5 w-5 text-violet-600" />
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">New Opportunity Intake</h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 hover:bg-slate-100 dark:hover:bg-slate-800"><X className="h-4 w-4" /></button>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Source">
            <select className={inputCls} value={f.source_type} onChange={(e) => set("source_type", e.target.value)}>
              {SOURCE_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </Field>
          <Field label="Existing customer (optional)">
            <CustomerPicker sessionToken={sessionToken} selected={customer} onSelect={setCustomer} />
          </Field>
          <Field label="Customer name">
            <input className={inputCls} value={f.customer_display_name} onChange={(e) => set("customer_display_name", e.target.value)} placeholder={customer?.company_name || "Company / prospect name"} />
          </Field>
          <Field label="Title">
            <input className={inputCls} value={f.title} onChange={(e) => set("title", e.target.value)} placeholder="Short pursuit title (defaults to customer name)" />
          </Field>
          <Field label="Contact name">
            <input className={inputCls} value={f.contact_name} onChange={(e) => set("contact_name", e.target.value)} />
          </Field>
          <Field label="Contact email">
            <input className={inputCls} value={f.contact_email} onChange={(e) => set("contact_email", e.target.value)} />
          </Field>
          <Field label="Contact phone">
            <input className={inputCls} value={f.contact_phone} onChange={(e) => set("contact_phone", e.target.value)} />
          </Field>
          <Field label="Salesperson">
            <input className={inputCls} value={f.salesperson} onChange={(e) => set("salesperson", e.target.value)} />
          </Field>
          <Field label="Lead source">
            <input className={inputCls} value={f.lead_source} onChange={(e) => set("lead_source", e.target.value)} />
          </Field>
          <Field label="Budget amount">
            <input className={inputCls} type="number" min="0" step="0.01" value={f.budget_amount} onChange={(e) => set("budget_amount", e.target.value)} />
          </Field>
          <Field label="Desired install date">
            <input className={inputCls} type="date" value={f.desired_install_date} onChange={(e) => set("desired_install_date", e.target.value)} />
          </Field>
          <Field label="Priority">
            <select className={inputCls} value={f.priority} onChange={(e) => set("priority", e.target.value)}>
              {PRIORITY_OPTIONS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </Field>
          <Field label="Survey needed?"><RequirementSelect value={f.survey_requirement} onChange={(v) => set("survey_requirement", v)} /></Field>
          <Field label="Permit needed?"><RequirementSelect value={f.permit_requirement} onChange={(v) => set("permit_requirement", v)} /></Field>
          <Field label="Installation needed?"><RequirementSelect value={f.installation_requirement} onChange={(v) => set("installation_requirement", v)} /></Field>
          <Field label="Removal needed?"><RequirementSelect value={f.removal_requirement} onChange={(v) => set("removal_requirement", v)} /></Field>
          <Field label="Electrical needed?"><RequirementSelect value={f.electrical_requirement} onChange={(v) => set("electrical_requirement", v)} /></Field>
          <Field label="Property relationship">
            <select className={inputCls} value={f.property_relationship} onChange={(e) => set("property_relationship", e.target.value)}>
              {PROPERTY_OPTIONS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </Field>
          <Field label="Next action">
            <input className={inputCls} value={f.next_action} onChange={(e) => set("next_action", e.target.value)} />
          </Field>
          <Field label="Next action due">
            <input className={inputCls} type="date" value={f.next_action_due} onChange={(e) => set("next_action_due", e.target.value)} />
          </Field>
          <Field label="Next action assignee">
            <input className={inputCls} value={f.next_action_assignee} onChange={(e) => set("next_action_assignee", e.target.value)} />
          </Field>
          <div className="md:col-span-2">
            <Field label="Job description">
              <textarea className={`${inputCls} min-h-20 py-2`} value={f.job_description} onChange={(e) => set("job_description", e.target.value)} />
            </Field>
          </div>
          <div className="md:col-span-2">
            <Field label="Notes">
              <textarea className={`${inputCls} min-h-16 py-2`} value={f.notes} onChange={(e) => set("notes", e.target.value)} />
            </Field>
          </div>
        </div>

        {error && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/20 dark:text-red-200">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{error}
          </div>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="min-h-11 rounded-xl border border-slate-300 px-4 text-sm font-semibold text-slate-700 dark:border-slate-600 dark:text-slate-200">Cancel</button>
          <button
            type="button"
            onClick={submit}
            disabled={saving}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-violet-600 px-4 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Capture Intake
          </button>
        </div>
      </div>
    </div>
  );
}

function PermitPanel({ sessionToken, detail, opportunity, onLinked }) {
  const intakes = detail?.intakes || [];
  const captured = intakes.find((row) => clean(row?.captured_fields?.site_address || row?.captured_fields?.install_location))?.captured_fields || {};
  const linkedLocation = detail?.location || null;
  const customer = detail?.customer || null;
  const defaultAddress = clean(captured.site_address || captured.install_location)
    || [clean(linkedLocation?.address_line_1), clean(linkedLocation?.city), clean(linkedLocation?.state)].filter(Boolean).join(", ")
    || [clean(customer?.location_address_1), clean(customer?.location_city), clean(customer?.location_state)].filter(Boolean).join(", ");

  const [address, setAddress] = useState(defaultAddress);
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const check = async () => {
    const a = clean(address);
    if (!a || checking) return;
    setChecking(true);
    setError("");
    setResult(null);
    try {
      const r = await base44.functions.invoke("findLocalityByAddress", {
        address: a,
        session_token: sessionToken,
      });
      const data = r?.data || r;
      if (data?.success === false) throw new Error(data?.error || "Jurisdiction lookup failed.");
      setResult(data);
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || "Jurisdiction lookup failed.");
    } finally {
      setChecking(false);
    }
  };

  const suggested = result?.suggested_locality || null;
  const resolved = result?.apply_allowed === true && clean(suggested?.jurisdiction_profile_id);

  const saveLocation = async () => {
    if (!resolved || saving || !clean(opportunity?.customer_id)) return;
    setSaving(true);
    setError("");
    try {
      const a = clean(address);
      const created = await base44.entities.CustomerLocation.create({
        customer_id: clean(opportunity.customer_id),
        label: a,
        address_line_1: a,
        city: clean(suggested?.name),
        state: clean(suggested?.state),
        site_type: "install",
        jurisdiction_profile_id: clean(suggested.jurisdiction_profile_id),
        jurisdiction_name: clean(suggested?.name),
        source_summary: { resolved_via: "findLocalityByAddress", resolved_from_opportunity_id: clean(opportunity.id), match_confidence: clean(result?.match_confidence), resolved_at: new Date().toISOString() },
      });
      const r = await base44.functions.invoke("opportunityWorkspaceAction", {
        session_token: sessionToken,
        action: "update_opportunity",
        opportunity_id: opportunity.id,
        baseline: opportunity,
        fields: { location_id: clean(created?.id) },
      });
      const data = r?.data || r;
      if (!data?.success) throw new Error(data?.error || "The location was saved but could not be linked.");
      setSaved(true);
      onLinked?.();
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || "The location could not be saved.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-xl border border-rose-200 bg-rose-50/50 p-4 dark:border-rose-900 dark:bg-rose-950/20">
      <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Permitting</h3>
      <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
        Requirement: <span className="font-semibold">{clean(opportunity?.permit_requirement) || "unknown"}</span>
        {linkedLocation?.jurisdiction_name ? ` · site jurisdiction: ${linkedLocation.jurisdiction_name}` : ""}
      </p>
      {linkedLocation && (
        <div className="mt-2 rounded-lg bg-white/70 p-2 text-xs text-slate-700 dark:bg-slate-900/60 dark:text-slate-300">
          <span className="font-semibold">Site:</span> {clean(linkedLocation.label || linkedLocation.address_line_1)}
        </div>
      )}
      <div className="mt-2 flex gap-2">
        <input
          className={inputCls}
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="Site address for jurisdiction lookup"
        />
        <button
          type="button"
          onClick={check}
          disabled={checking || !clean(address)}
          className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-xl border border-rose-300 bg-white px-3 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-60 dark:border-rose-800 dark:bg-slate-900 dark:text-rose-300"
        >
          {checking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          Check
        </button>
      </div>
      {result && (
        <div className="mt-2 rounded-lg bg-white/80 p-2.5 text-xs dark:bg-slate-900/70">
          {resolved ? (
            <div className="flex items-center gap-1.5 font-semibold text-emerald-700 dark:text-emerald-300">
              <CheckCircle2 className="h-4 w-4" />
              {suggested.name}{suggested.state ? `, ${suggested.state}` : ""} — jurisdiction resolved ({clean(result.match_confidence) || "high"})
            </div>
          ) : (
            <div className="flex items-center gap-1.5 font-semibold text-amber-700 dark:text-amber-300">
              <AlertTriangle className="h-4 w-4" />
              {clean(result.match_reason) || "No configured jurisdiction matched — manual review needed."}
            </div>
          )}
          <div className="mt-1.5 flex flex-wrap items-center gap-3">
            <a href="/Permitting?view=jurisdictions" className="font-semibold text-violet-700 hover:underline dark:text-violet-300">Open Permitting</a>
            {resolved && !saved && clean(opportunity?.customer_id) && (
              <button
                type="button"
                onClick={saveLocation}
                disabled={saving}
                className="inline-flex items-center gap-1 font-semibold text-emerald-700 hover:underline disabled:opacity-60 dark:text-emerald-300"
              >
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                Save as customer site
              </button>
            )}
            {saved && <span className="font-semibold text-emerald-700 dark:text-emerald-300">Saved + linked</span>}
          </div>
        </div>
      )}
      {error && <div className="mt-2 text-xs font-medium text-red-700 dark:text-red-300">{error}</div>}
    </div>
  );
}

const REQUEST_STATUS_STYLES = {
  draft: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  ready: "bg-blue-100 text-blue-700 dark:bg-blue-900/60 dark:text-blue-300",
  in_progress: "bg-amber-100 text-amber-700 dark:bg-amber-900/60 dark:text-amber-300",
  completed: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300",
  cancelled: "bg-red-100 text-red-700 dark:bg-red-900/60 dark:text-red-300",
};
const PRIORITY_STYLES = {
  rush: "bg-red-100 text-red-700 dark:bg-red-900/60 dark:text-red-300",
  high: "bg-orange-100 text-orange-700 dark:bg-orange-900/60 dark:text-orange-300",
  normal: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  low: "bg-slate-50 text-slate-500 dark:bg-slate-800/60 dark:text-slate-400",
};

function EstimatingQueue({ sessionToken, onOpenOpportunity }) {
  const [requests, setRequests] = useState([]);
  const [includeClosed, setIncludeClosed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [edits, setEdits] = useState({});
  const [saving, setSaving] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await invoke(sessionToken, { action: "list_estimating_requests", include_closed: includeClosed });
      setRequests(data.estimating_requests || []);
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || "Queue load failed.");
    } finally {
      setLoading(false);
    }
  }, [sessionToken, includeClosed]);

  useEffect(() => { load(); }, [load]);

  const openOpportunity = async (row) => {
    try {
      const data = await invoke(sessionToken, { action: "get_opportunity", opportunity_id: row.opportunity_id });
      onOpenOpportunity?.(data.opportunity);
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || "Could not open the opportunity.");
    }
  };

  const saveAssign = async (row) => {
    const edit = edits[row.id] || {};
    if (saving) return;
    setSaving(row.id);
    setError("");
    try {
      await invoke(sessionToken, {
        action: "assign_estimator",
        estimating_request_id: row.id,
        baseline: row,
        assigned_estimator: clean(edit.assigned_estimator ?? row.assigned_estimator),
        priority: clean(edit.priority ?? row.priority),
      });
      setEdits((e) => ({ ...e, [row.id]: {} }));
      await load();
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || "Assignment failed.");
    } finally {
      setSaving("");
    }
  };

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <div className="text-sm text-slate-500 dark:text-slate-400">
          Open estimating requests, sorted by priority then request age.
        </div>
        <label className="flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
          <input type="checkbox" className="h-4 w-4 accent-violet-600" checked={includeClosed} onChange={(e) => setIncludeClosed(e.target.checked)} />
          Include completed/cancelled
        </label>
      </div>
      {error && <div className="mb-3 rounded-xl bg-red-50 px-3 py-2 text-sm font-medium text-red-700 dark:bg-red-950/40 dark:text-red-300">{error}</div>}
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
        {loading ? (
          <div className="flex items-center justify-center py-14 text-slate-500"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Loading queue…</div>
        ) : requests.length === 0 ? (
          <div className="py-14 text-center text-slate-500">No estimating requests in the queue.</div>
        ) : (
          <table className="w-full min-w-[880px] text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500 dark:bg-slate-800 dark:text-slate-400">
              <tr>
                <th className="px-3 py-2.5">Priority</th><th className="px-3 py-2.5">Opportunity</th>
                <th className="px-3 py-2.5">Customer</th><th className="px-3 py-2.5">Status</th>
                <th className="px-3 py-2.5">Requested</th><th className="px-3 py-2.5">Estimator</th>
                <th className="px-3 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {requests.map((r) => {
                const edit = edits[r.id] || {};
                const dirty = Object.keys(edit).length > 0;
                return (
                  <tr key={r.id} className="border-t border-slate-100 dark:border-slate-800">
                    <td className="px-3 py-2.5">
                      <select className="rounded-lg border border-slate-200 bg-transparent px-1.5 py-1 text-xs font-semibold dark:border-slate-700"
                        value={edit.priority ?? r.priority}
                        onChange={(e) => setEdits((s) => ({ ...s, [r.id]: { ...s[r.id], priority: e.target.value } }))}>
                        {["rush", "high", "normal", "low"].map((p) => <option key={p} value={p}>{p}</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-2.5">
                      <button type="button" onClick={() => openOpportunity(r)} className="font-semibold text-violet-700 hover:underline dark:text-violet-300">
                        {r.opportunity_title || "Untitled"}
                      </button>
                      {r.estimate_id && <div className="text-xs text-slate-400">Estimate linked</div>}
                    </td>
                    <td className="px-3 py-2.5 text-slate-600 dark:text-slate-300">{r.customer_display_name || "—"}</td>
                    <td className="px-3 py-2.5">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${REQUEST_STATUS_STYLES[r.status] || REQUEST_STATUS_STYLES.draft}`}>
                        {clean(r.status).replace(/_/g, " ") || "draft"}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-slate-500">{clean(r.requested_at).slice(0, 10) || "—"}</td>
                    <td className="px-3 py-2.5">
                      <input className="w-40 rounded-lg border border-slate-200 bg-transparent px-2 py-1 text-xs dark:border-slate-700"
                        placeholder="Estimator name/email"
                        value={edit.assigned_estimator ?? r.assigned_estimator}
                        onChange={(e) => setEdits((s) => ({ ...s, [r.id]: { ...s[r.id], assigned_estimator: e.target.value } }))} />
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      {dirty && (
                        <button type="button" onClick={() => saveAssign(r)} disabled={saving === r.id}
                          className="inline-flex items-center gap-1 rounded-lg bg-violet-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-violet-700 disabled:opacity-60">
                          {saving === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}Save
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function FollowUps({ sessionToken, onOpenOpportunity }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [clearing, setClearing] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await invoke(sessionToken, { action: "list_follow_ups" });
      setItems(data.follow_ups || []);
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || "Follow-ups failed to load.");
    } finally {
      setLoading(false);
    }
  }, [sessionToken]);

  useEffect(() => { load(); }, [load]);

  const openOpportunity = async (row) => {
    try {
      const data = await invoke(sessionToken, { action: "get_opportunity", opportunity_id: row.id });
      onOpenOpportunity?.(data.opportunity);
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || "Could not open the opportunity.");
    }
  };

  const markDone = async (row) => {
    if (clearing) return;
    setClearing(row.id);
    setError("");
    try {
      await invoke(sessionToken, {
        action: "update_opportunity",
        opportunity_id: row.id,
        baseline: row,
        fields: { next_action: "", next_action_due: "", next_action_assignee: "" },
      });
      await load();
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || "Could not clear the follow-up.");
    } finally {
      setClearing("");
    }
  };

  return (
    <div>
      <div className="mb-3 text-sm text-slate-500 dark:text-slate-400">
        Open opportunities with a next action on record — overdue first. "Done" clears the action.
      </div>
      {error && <div className="mb-3 rounded-xl bg-red-50 px-3 py-2 text-sm font-medium text-red-700 dark:bg-red-950/40 dark:text-red-300">{error}</div>}
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
        {loading ? (
          <div className="flex items-center justify-center py-14 text-slate-500"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Loading follow-ups…</div>
        ) : items.length === 0 ? (
          <div className="py-14 text-center text-slate-500">Nothing on the follow-up list.</div>
        ) : (
          <table className="w-full min-w-[880px] text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500 dark:bg-slate-800 dark:text-slate-400">
              <tr>
                <th className="px-3 py-2.5">Due</th><th className="px-3 py-2.5">Opportunity</th>
                <th className="px-3 py-2.5">Customer</th><th className="px-3 py-2.5">Stage</th>
                <th className="px-3 py-2.5">Next action</th><th className="px-3 py-2.5">Assignee</th>
                <th className="px-3 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {items.map((r) => (
                <tr key={r.id} className="border-t border-slate-100 dark:border-slate-800">
                  <td className={`px-3 py-2.5 text-xs font-semibold ${r.overdue ? "text-red-600 dark:text-red-400" : "text-slate-600 dark:text-slate-300"}`}>
                    {r.next_action_due || "No date"}
                    {r.overdue && <div className="text-[10px] uppercase tracking-wide">Overdue</div>}
                  </td>
                  <td className="px-3 py-2.5">
                    <button type="button" onClick={() => openOpportunity(r)} className="font-semibold text-violet-700 hover:underline dark:text-violet-300">
                      {r.title || "Untitled"}
                    </button>
                    {r.salesperson && <div className="text-xs text-slate-400">{r.salesperson}</div>}
                  </td>
                  <td className="px-3 py-2.5 text-slate-600 dark:text-slate-300">{r.customer_display_name || "—"}</td>
                  <td className="px-3 py-2.5"><StageBadge stage={r.stage} /></td>
                  <td className="px-3 py-2.5 text-slate-700 dark:text-slate-200">{r.next_action || "—"}</td>
                  <td className="px-3 py-2.5 text-xs text-slate-500">{r.next_action_assignee || "—"}</td>
                  <td className="px-3 py-2.5 text-right">
                    <button type="button" onClick={() => markDone(r)} disabled={clearing === r.id}
                      className="inline-flex items-center gap-1 rounded-lg border border-emerald-300 px-2.5 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-60 dark:border-emerald-800 dark:text-emerald-300 dark:hover:bg-emerald-950/40">
                      {clearing === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}Done
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function OpportunityDetail({ sessionToken, opportunity, onClose, onChanged }) {
  const navigate = useNavigate();
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [error, setError] = useState("");
  const [edit, setEdit] = useState({});
  const keyRef = useRef(uuid());

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const r = await base44.functions.invoke("opportunityWorkspaceAction", {
        session_token: sessionToken, action: "get_opportunity", opportunity_id: opportunity.id,
      });
      const data = r?.data || r;
      if (!data?.success) throw new Error(data?.error || "Could not load the opportunity.");
      setDetail(data);
      const o = data.opportunity || {};
      setEdit({
        stage: clean(o.stage) || "new",
        salesperson: clean(o.salesperson),
        lead_source: clean(o.lead_source),
        next_action: clean(o.next_action),
        next_action_due: clean(o.next_action_due),
        next_action_assignee: clean(o.next_action_assignee),
        priority: clean(o.priority) || "normal",
        budget_amount: o.budget_amount ?? "",
        lost_reason: clean(o.lost_reason),
        notes: clean(o.notes),
      });
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || "Could not load the opportunity.");
    } finally {
      setLoading(false);
    }
  }, [sessionToken, opportunity.id]);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (saving || !detail?.opportunity) return;
    setSaving(true);
    setError("");
    try {
      const fields = { ...edit };
      fields.budget_amount = clean(fields.budget_amount) === "" ? null : Number(fields.budget_amount);
      if (!CLOSED_STAGES.has(fields.stage)) fields.lost_reason = "";
      const r = await base44.functions.invoke("opportunityWorkspaceAction", {
        session_token: sessionToken,
        action: "update_opportunity",
        opportunity_id: opportunity.id,
        baseline: detail.opportunity,
        fields,
      });
      const data = r?.data || r;
      if (!data?.success) throw new Error(data?.error || "Save failed.");
      await load();
      onChanged?.();
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  const requestEstimate = async () => {
    if (requesting || !detail?.opportunity) return;
    setRequesting(true);
    setError("");
    try {
      const r = await base44.functions.invoke("opportunityWorkspaceAction", {
        session_token: sessionToken,
        action: "request_estimate",
        opportunity_id: opportunity.id,
        creation_request_key: keyRef.current,
      });
      const data = r?.data || r;
      if (!data?.success) throw new Error(data?.error || "Estimate request failed.");
      const estimateId = clean(data?.estimate?.id);
      onChanged?.();
      if (estimateId) navigate(`/EstimateDetail?id=${estimateId}`);
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || "Estimate request failed.");
      setRequesting(false);
    }
  };

  const o = detail?.opportunity || opportunity;
  const requests = detail?.estimating_requests || [];
  const intakes = detail?.intakes || [];
  const estimates = detail?.estimates || [];
  const openRequest = requests.find((row) => ["draft", "ready", "in_progress"].includes(clean(row?.status)));

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/50 p-4" role="dialog" aria-modal="true">
      <div className="my-8 w-full max-w-4xl rounded-2xl border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-700 dark:bg-slate-900">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-lg font-bold text-slate-900 dark:text-slate-100">{clean(o.title) || "Opportunity"}</h2>
              <StageBadge stage={o.stage} />
            </div>
            <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              {clean(o.customer_display_name) || "Unresolved customer"}
              {detail?.customer?.company_name && clean(detail.customer.company_name) !== clean(o.customer_display_name)
                ? ` · verified: ${detail.customer.company_name}` : ""}
              {o.salesperson ? ` · ${o.salesperson}` : ""}
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 hover:bg-slate-100 dark:hover:bg-slate-800"><X className="h-4 w-4" /></button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-violet-600" /></div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            <section className="space-y-3 rounded-xl border border-slate-200 p-4 dark:border-slate-700">
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Details</h3>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Stage">
                  <select className={inputCls} value={edit.stage || "new"} onChange={(e) => setEdit((p) => ({ ...p, stage: e.target.value }))}>
                    {STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                  </select>
                </Field>
                <Field label="Priority">
                  <select className={inputCls} value={edit.priority || "normal"} onChange={(e) => setEdit((p) => ({ ...p, priority: e.target.value }))}>
                    {PRIORITY_OPTIONS.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                </Field>
                <Field label="Salesperson"><input className={inputCls} value={edit.salesperson || ""} onChange={(e) => setEdit((p) => ({ ...p, salesperson: e.target.value }))} /></Field>
                <Field label="Lead source"><input className={inputCls} value={edit.lead_source || ""} onChange={(e) => setEdit((p) => ({ ...p, lead_source: e.target.value }))} /></Field>
                <Field label="Budget"><input className={inputCls} type="number" min="0" step="0.01" value={edit.budget_amount ?? ""} onChange={(e) => setEdit((p) => ({ ...p, budget_amount: e.target.value }))} /></Field>
                <Field label="Next action due"><input className={inputCls} type="date" value={edit.next_action_due || ""} onChange={(e) => setEdit((p) => ({ ...p, next_action_due: e.target.value }))} /></Field>
                <Field label="Next action"><input className={inputCls} value={edit.next_action || ""} onChange={(e) => setEdit((p) => ({ ...p, next_action: e.target.value }))} /></Field>
                <Field label="Assignee"><input className={inputCls} value={edit.next_action_assignee || ""} onChange={(e) => setEdit((p) => ({ ...p, next_action_assignee: e.target.value }))} /></Field>
                {CLOSED_STAGES.has(edit.stage) && (
                  <div className="col-span-2">
                    <Field label="Lost reason"><input className={inputCls} value={edit.lost_reason || ""} onChange={(e) => setEdit((p) => ({ ...p, lost_reason: e.target.value }))} /></Field>
                  </div>
                )}
                <div className="col-span-2">
                  <Field label="Notes"><textarea className={`${inputCls} min-h-16 py-2`} value={edit.notes || ""} onChange={(e) => setEdit((p) => ({ ...p, notes: e.target.value }))} /></Field>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs text-slate-600 dark:text-slate-300 sm:grid-cols-3">
                {REQUIREMENT_OPTIONS && ["survey_requirement", "permit_requirement", "installation_requirement", "removal_requirement", "electrical_requirement"].map((key) => (
                  <div key={key} className="rounded-lg bg-slate-50 p-2 dark:bg-slate-800/60">
                    <div className="font-semibold uppercase tracking-wide text-[10px] text-slate-400">{key.replace(/_requirement/, "").replace(/_/g, " ")}</div>
                    <div className="font-semibold">{clean(o[key]) || "unknown"}</div>
                  </div>
                ))}
                <div className="rounded-lg bg-slate-50 p-2 dark:bg-slate-800/60">
                  <div className="font-semibold uppercase tracking-wide text-[10px] text-slate-400">Property</div>
                  <div className="font-semibold">{clean(o.property_relationship) || "unknown"}</div>
                </div>
              </div>
              {clean(o.job_description) && (
                <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700 dark:bg-slate-800/60 dark:text-slate-200">{o.job_description}</div>
              )}
              <button
                type="button"
                onClick={save}
                disabled={saving}
                className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-300 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Save changes
              </button>
            </section>

            <section className="space-y-3">
              <div className="rounded-xl border border-violet-200 bg-violet-50/60 p-4 dark:border-violet-900 dark:bg-violet-950/20">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Estimating handoff</h3>
                    <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                      Freezes a verified handoff snapshot, creates the EstimatingRequest, and opens a draft Estimate linked to this Opportunity.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={requestEstimate}
                    disabled={requesting || Boolean(openRequest) || CLOSED_STAGES.has(clean(o.stage))}
                    className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl bg-violet-600 px-4 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
                  >
                    {requesting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    Request Estimate
                  </button>
                </div>
                {openRequest && (
                  <div className="mt-2 flex items-center gap-2 rounded-lg bg-white/70 p-2 text-xs font-medium text-violet-900 dark:bg-slate-900/60 dark:text-violet-200">
                    <CheckCircle2 className="h-4 w-4" /> Active request {clean(openRequest.status)} — opens the linked estimate on retry.
                  </div>
                )}
              </div>

              <PermitPanel
                sessionToken={sessionToken}
                detail={detail}
                opportunity={o}
                onLinked={async () => { await load(); onChanged?.(); }}
              />

              {requests.length > 0 && (
                <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
                  <h3 className="mb-2 text-sm font-bold text-slate-900 dark:text-slate-100">Estimating requests</h3>
                  <div className="space-y-2">
                    {requests.map((row) => (
                      <div key={row.id} className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 p-2.5 text-xs dark:bg-slate-800/60">
                        <div className="min-w-0">
                          <span className="font-semibold text-slate-800 dark:text-slate-200">{clean(row.status)}</span>
                          <span className="ml-2 text-slate-500">{clean(row.submitted_at || row.requested_at || "").slice(0, 10)}</span>
                          <span className="ml-2 text-slate-400">by {clean(row.requested_by)}</span>
                        </div>
                        {clean(row.estimate_id) && (
                          <a href={`/EstimateDetail?id=${clean(row.estimate_id)}`} className="inline-flex shrink-0 items-center gap-1 font-semibold text-violet-700 hover:underline dark:text-violet-300">
                            <FileText className="h-3.5 w-3.5" /> Estimate <ArrowRight className="h-3 w-3" />
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {estimates.length > 0 && (
                <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
                  <h3 className="mb-2 text-sm font-bold text-slate-900 dark:text-slate-100">Estimates</h3>
                  <div className="space-y-2">
                    {estimates.map((row) => (
                      <a key={row.id} href={`/EstimateDetail?id=${row.id}`} className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 p-2.5 text-xs hover:bg-slate-100 dark:bg-slate-800/60 dark:hover:bg-slate-800">
                        <span className="min-w-0 truncate font-semibold text-slate-800 dark:text-slate-200">{clean(row.project_name) || clean(row.estimate_number) || row.id}</span>
                        <span className="shrink-0 text-slate-500">{clean(row.status)}</span>
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {detail?.financials && (
                <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
                  <h3 className="mb-2 text-sm font-bold text-slate-900 dark:text-slate-100">Financials</h3>
                  <div className="grid grid-cols-3 gap-2 text-center text-xs">
                    {[
                      ["Invoiced", detail.financials.invoiced],
                      ["Collected", detail.financials.collected],
                      ["Open AR", detail.financials.open_ar],
                      ["PO committed", detail.financials.po_committed],
                      ["CO delta", detail.financials.co_delta],
                    ].map(([label, val]) => (
                      <div key={label} className="rounded-lg bg-slate-50 p-2 dark:bg-slate-800/60">
                        <div className="font-semibold uppercase tracking-wide text-[10px] text-slate-400">{label}</div>
                        <div className="font-bold text-slate-800 dark:text-slate-100">${Number(val || 0).toFixed(2)}</div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-2 space-y-1.5 text-xs">
                    {(detail.invoices || []).map((row) => (
                      <a key={row.id} href="/Invoices" className="flex items-center justify-between rounded-lg bg-slate-50 p-2 hover:bg-slate-100 dark:bg-slate-800/60 dark:hover:bg-slate-800">
                        <span className="font-semibold text-slate-700 dark:text-slate-200">{clean(row.invoice_number)} <span className="text-slate-400">({clean(row.status)})</span></span>
                        <span className="text-slate-500">${Number(row.balance_due || 0).toFixed(2)} due</span>
                      </a>
                    ))}
                    {(detail.purchase_orders || []).map((row) => (
                      <a key={row.id} href="/PurchaseOrders" className="flex items-center justify-between rounded-lg bg-slate-50 p-2 hover:bg-slate-100 dark:bg-slate-800/60 dark:hover:bg-slate-800">
                        <span className="font-semibold text-slate-700 dark:text-slate-200">{clean(row.po_number)} · {clean(row.vendor_name)} <span className="text-slate-400">({clean(row.status)})</span></span>
                        <span className="text-slate-500">${Number(row.total || 0).toFixed(2)}</span>
                      </a>
                    ))}
                    {(detail.change_orders || []).map((row) => (
                      <a key={row.id} href="/ChangeOrders" className="flex items-center justify-between rounded-lg bg-slate-50 p-2 hover:bg-slate-100 dark:bg-slate-800/60 dark:hover:bg-slate-800">
                        <span className="font-semibold text-slate-700 dark:text-slate-200">{clean(row.change_order_number)} · {clean(row.title)} <span className="text-slate-400">({clean(row.status)})</span></span>
                        <span className="text-slate-500">{Number(row.amount_delta || 0) >= 0 ? "+" : "−"}${Math.abs(Number(row.amount_delta || 0)).toFixed(2)}</span>
                      </a>
                    ))}
                  </div>
                </div>
              )}

              <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
                <h3 className="mb-2 text-sm font-bold text-slate-900 dark:text-slate-100">Intake history</h3>
                {intakes.length === 0 ? (
                  <p className="text-xs text-slate-500">No intake events recorded.</p>
                ) : (
                  <div className="space-y-2">
                    {intakes.map((row) => (
                      <div key={row.id} className="rounded-lg bg-slate-50 p-2.5 text-xs dark:bg-slate-800/60">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-slate-800 dark:text-slate-200">{clean(row.source_type)}</span>
                          <span className="text-slate-500">{clean(row.captured_at).slice(0, 10)}</span>
                        </div>
                        <div className="mt-0.5 text-slate-500">
                          {clean(row.resolution_status)} · by {clean(row.captured_by) || "system"}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {clean(o.compatibility_work_order_id) && (
                <div className="rounded-xl border border-slate-200 p-4 text-xs text-slate-600 dark:border-slate-700 dark:text-slate-300">
                  <GitBranch className="mr-1 inline h-3.5 w-3.5" />
                  Linked legacy pipeline WorkOrder <span className="font-mono">{clean(o.compatibility_work_order_id)}</span>
                  {detail?.work_order?.client_name ? ` (${detail.work_order.client_name})` : ""}
                </div>
              )}
            </section>
          </div>
        )}

        {error && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/20 dark:text-red-200">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{error}
          </div>
        )}
      </div>
    </div>
  );
}

export default function Opportunities() {
  const { sessionToken, isRegistered, currentUser } = useAuth();
  const [opportunities, setOpportunities] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [stageFilter, setStageFilter] = useState("open");
  const [search, setSearch] = useState("");
  const [includeClosed, setIncludeClosed] = useState(false);
  const [intakeOpen, setIntakeOpen] = useState(false);
  const [selected, setSelected] = useState(null);
  const [view, setView] = useState("pipeline");
  const [funnel, setFunnel] = useState(null);

  const load = useCallback(async () => {
    if (!sessionToken) return;
    setLoading(true);
    setError("");
    try {
      const r = await base44.functions.invoke("opportunityWorkspaceAction", {
        session_token: sessionToken,
        action: "list_opportunities",
        include_closed: includeClosed,
      });
      const data = r?.data || r;
      if (!data?.success) throw new Error(data?.error || "Could not load opportunities.");
      setOpportunities(data.opportunities || []);
      setTotal(data.total ?? (data.opportunities || []).length);
      setFunnel(data.funnel || null);
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || "Could not load opportunities.");
    } finally {
      setLoading(false);
    }
  }, [sessionToken, includeClosed]);

  useEffect(() => { if (sessionToken) load(); }, [sessionToken, load]);

  const visible = useMemo(() => {
    const q = clean(search).toLowerCase();
    return opportunities.filter((o) => {
      if (stageFilter === "open" && CLOSED_STAGES.has(clean(o.stage))) return false;
      if (stageFilter !== "open" && stageFilter !== "all" && clean(o.stage) !== stageFilter) return false;
      if (q && ![o.title, o.customer_display_name, o.salesperson, o.next_action].some((v) => clean(v).toLowerCase().includes(q))) return false;
      return true;
    });
  }, [opportunities, stageFilter, search]);

  if (!isRegistered && !currentUser) {
    return <div className="p-6 text-sm text-slate-600">Sign in to view Opportunities.</div>;
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-4 md:p-6">
      <section className="rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50 to-white p-4 dark:border-violet-900 dark:from-violet-950/30 dark:to-slate-900">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <GitBranch className="h-5 w-5 text-violet-600" />
              <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Opportunities</h1>
            </div>
            <p className="mt-1 max-w-2xl text-sm text-slate-600 dark:text-slate-300">
              Canonical pre-job commercial pipeline: Intake → Opportunity → EstimatingRequest → Estimate. The existing Smartsheet Sales Pipeline keeps running in parallel during migration.
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={load}
              disabled={loading}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-violet-300 bg-white px-4 text-sm font-semibold text-violet-700 shadow-sm hover:bg-violet-50 disabled:opacity-60 dark:border-violet-800 dark:bg-slate-900 dark:text-violet-300"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Refresh
            </button>
            <button
              type="button"
              onClick={() => setIntakeOpen(true)}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-violet-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-violet-700"
            >
              <Plus className="h-4 w-4" /> New Intake
            </button>
          </div>
        </div>
      </section>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/20 dark:text-red-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{error}
        </div>
      )}

      {funnel && (
        <section className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            {STAGES.map((s) => (
              <button key={s.key} type="button" onClick={() => { setView("pipeline"); setStageFilter(s.key); }}
                className="text-left" title={`Show ${s.label}`}>
                <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{s.label}</div>
                <div className="text-lg font-bold text-slate-800 dark:text-slate-100">{funnel.stage_counts?.[s.key] || 0}</div>
              </button>
            ))}
            <div className="ml-auto flex flex-wrap items-center gap-x-5 gap-y-1 text-right">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Open pipeline</div>
                <div className="text-lg font-bold text-violet-700 dark:text-violet-300">${Number(funnel.open_pipeline_value || 0).toLocaleString()}</div>
              </div>
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Won</div>
                <div className="text-lg font-bold text-emerald-600">${Number(funnel.won_value || 0).toLocaleString()}</div>
              </div>
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Win rate</div>
                <div className="text-lg font-bold text-slate-800 dark:text-slate-100">{funnel.win_rate == null ? "—" : `${funnel.win_rate}%`}</div>
              </div>
            </div>
          </div>
        </section>
      )}

      <div className="flex gap-1.5">
        {[["pipeline", "Pipeline"], ["queue", "Estimating queue"], ["follow_ups", "Follow-ups"]].map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setView(key)}
            className={`min-h-10 rounded-lg border px-4 text-sm font-semibold ${view === key
              ? "border-violet-500 bg-violet-600 text-white"
              : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {view === "queue" && (
        <section className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
          <EstimatingQueue
            sessionToken={sessionToken}
            onOpenOpportunity={(opp) => { if (opp?.id) setSelected(opp); }}
          />
        </section>
      )}

      {view === "follow_ups" && (
        <section className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
          <FollowUps
            sessionToken={sessionToken}
            onOpenOpportunity={(opp) => { if (opp?.id) setSelected(opp); }}
          />
        </section>
      )}

      {view === "pipeline" && (
      <section className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap gap-2">
            {[{ key: "open", label: "Open" }, ...STAGES, { key: "all", label: "All" }].map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => setStageFilter(s.key)}
                aria-pressed={stageFilter === s.key}
                className={`min-h-10 rounded-lg border px-3 text-xs font-semibold ${stageFilter === s.key
                  ? "border-violet-500 bg-violet-600 text-white"
                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"}`}
              >
                {s.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-300">
              <input type="checkbox" checked={includeClosed} onChange={(e) => setIncludeClosed(e.target.checked)} className="h-4 w-4 rounded border-slate-300" />
              include won/lost
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
              <input
                className="min-h-10 w-56 rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-sm dark:border-slate-700 dark:bg-slate-900"
                placeholder="Search…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="mt-4">
          {loading && opportunities.length === 0 ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-violet-600" /></div>
          ) : visible.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center dark:border-slate-700">
              <Briefcase className="mx-auto h-8 w-8 text-slate-300" />
              <p className="mt-2 text-sm text-slate-500">No opportunities match. Capture a new intake or wait for the bridge pilot to seed historical rows.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {visible.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => setSelected(o)}
                  className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 text-left hover:border-violet-300 hover:bg-violet-50/40 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-violet-800"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-semibold text-slate-900 dark:text-slate-100">{clean(o.title) || "Opportunity"}</span>
                      <StageBadge stage={o.stage} />
                      {clean(o.priority) && clean(o.priority) !== "normal" && (
                        <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-700 dark:bg-red-950/40 dark:text-red-300">{o.priority}</span>
                      )}
                    </div>
                    <div className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
                      {clean(o.customer_display_name) || "Unresolved customer"}
                      {o.salesperson ? ` · ${o.salesperson}` : ""}
                      {o.next_action ? ` · next: ${o.next_action}${o.next_action_due ? ` (${o.next_action_due})` : ""}` : ""}
                    </div>
                  </div>
                  {(() => {
                    const since = Date.parse(clean(o.stage_changed_at));
                    const days = Number.isFinite(since) ? Math.max(0, Math.floor((Date.now() - since) / 86400000)) : null;
                    return days == null ? null : (
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${days >= 30
                        ? "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300"
                        : days >= 14
                          ? "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
                          : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"}`}
                        title="Days in current stage">
                        {days}d
                      </span>
                    );
                  })()}
                  {Number.isFinite(Number(o.budget_amount)) && Number(o.budget_amount) > 0 && (
                    <span className="shrink-0 text-sm font-semibold text-slate-700 dark:text-slate-200">${Number(o.budget_amount).toLocaleString()}</span>
                  )}
                  <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
                </button>
              ))}
            </div>
          )}
          <p className="mt-3 text-xs text-slate-400">{visible.length} shown · {total} loaded</p>
        </div>
      </section>
      )}

      {intakeOpen && (
        <NewIntakeDialog
          sessionToken={sessionToken}
          onClose={() => setIntakeOpen(false)}
          onCreated={(opportunity) => { setIntakeOpen(false); load(); if (opportunity?.id) setSelected(opportunity); }}
        />
      )}
      {selected && (
        <OpportunityDetail
          sessionToken={sessionToken}
          opportunity={selected}
          onClose={() => setSelected(null)}
          onChanged={load}
        />
      )}
    </div>
  );
}

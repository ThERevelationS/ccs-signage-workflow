import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryClientInstance } from "@/lib/query-client";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/components/auth/EmailGate";
import { loadAllEntityRows } from "@/components/estimator/loadAllEntityRows";
import {
  AllInOneEstimate,
  Customer,
  GlobalSettings,
  OpportunityActivity,
} from "@/api/gatedEntities";
import {
  loadSingleGlobalSetting,
  saveGlobalSettingValueIfUnchanged,
} from "@/components/shared/globalSettingsPersistence";
import FollowupQueue from "@/components/comms/FollowupQueue";
import {
  DEFAULT_FOLLOWUP_RULES,
  normalizeFollowupRules,
} from "@/components/comms/followupModel";

// Communication automation — the CoreBridge-style two-stage follow-up queue
// for sent estimates/quotes and overdue invoices. The page loads the three
// data feeds (sent estimates via staffDataRead, invoices via the
// invoicingAction list_invoices gateway, and OpportunityActivity log rows for
// dedupe), renders FollowupQueue, and hosts the rules panel that persists
// thresholds to GlobalSettings through the shared
// saveGlobalSettingValueIfUnchanged settings path (same convention as
// AdminSettings' automations_paused / notificationQuietHours rows).

export const FOLLOWUP_RULES_SETTING_KEY = "followupAutomationRules";
export const FOLLOWUP_ACTIVITY_QUERY_KEY = ["comms-followups", "activities"];

const RULE_FIELDS = [
  ["quote1", "Quote — 1st follow-up", "days after the quote is sent"],
  ["quote2", "Quote — 2nd follow-up", "days after the quote is sent"],
  ["inv1", "Invoice — 1st notice", "days past the invoice due date"],
  ["inv2", "Invoice — 2nd notice", "days past the invoice due date"],
];

const numInput =
  "w-20 rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900 focus:border-violet-400 focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100";

function RulesPanel({ record, rules }) {
  const [form, setForm] = useState(() => ({ ...rules }));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  // Reseed the form once the saved record arrives or changes elsewhere.
  useEffect(() => {
    setForm({ ...rules });
  }, [rules]);

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));
  const dirty = JSON.stringify(normalizeFollowupRules(form)) !== JSON.stringify(rules);

  const save = async () => {
    const next = normalizeFollowupRules(form);
    setSaving(true);
    setMessage("");
    setError("");
    try {
      await saveGlobalSettingValueIfUnchanged({
        entity: GlobalSettings,
        loadedRecord: record || null,
        settingKey: FOLLOWUP_RULES_SETTING_KEY,
        nextValue: next,
        label: "Follow-up rules",
      });
      await queryClientInstance.invalidateQueries({ queryKey: ["comms-followups", "rules"] });
      setMessage("Follow-up rules saved.");
    } catch (e) {
      setError(e?.message || "Follow-up rules could not be saved.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <details className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-700 dark:bg-slate-900/50">
      <summary className="cursor-pointer text-sm font-semibold text-slate-700 dark:text-slate-200">
        Follow-up rules
        <span className="ml-2 text-xs font-normal text-slate-500">
          quotes {rules.quote1}/{rules.quote2}d · invoices {rules.inv1}/{rules.inv2}d past due
        </span>
      </summary>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {RULE_FIELDS.map(([key, label, hint]) => (
          <label key={key} className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">{label}</span>
            <span className="flex items-center gap-1.5">
              <input
                type="number"
                min="0"
                step="1"
                className={numInput}
                value={form[key]}
                onChange={(e) => set(key, e.target.value)}
              />
              <span className="text-[11px] text-slate-500">{hint}</span>
            </span>
          </label>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-2">
        <button
          className="rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
          disabled={saving || !dirty}
          onClick={save}
        >
          {saving ? "Saving…" : "Save rules"}
        </button>
        <button
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-600 disabled:opacity-50 dark:border-slate-600 dark:text-slate-300"
          disabled={saving}
          onClick={() => setForm({ ...DEFAULT_FOLLOWUP_RULES })}
        >
          Reset to defaults
        </button>
        {message && <span className="text-xs text-emerald-600">{message}</span>}
        {error && <span className="text-xs text-rose-700">{error}</span>}
      </div>
    </details>
  );
}

export default function CommsFollowups() {
  const { sessionToken, currentUser } = useAuth();
  const actor = String(currentUser?.email || currentUser?.full_name || "").trim();
  const [loadError, setLoadError] = useState("");

  useEffect(() => { document.title = "Follow-ups"; }, []);

  const { data: estimates = [] } = useQuery({
    queryKey: ["comms-followups", "estimates"],
    queryFn: () =>
      loadAllEntityRows({
        entity: AllInOneEstimate,
        query: { status: "sent" },
        sort: "-updated_date",
        label: "Follow-up estimates",
      }),
  });

  const { data: activities = [] } = useQuery({
    queryKey: FOLLOWUP_ACTIVITY_QUERY_KEY,
    queryFn: () =>
      loadAllEntityRows({
        entity: OpportunityActivity,
        sort: "-updated_date",
        label: "Follow-up activity log",
      }),
  });

  const { data: customers = [] } = useQuery({
    queryKey: ["comms-followups", "customers"],
    queryFn: () =>
      loadAllEntityRows({
        entity: Customer,
        sort: "company_name",
        label: "Follow-up customers",
        cacheTtlMs: 30000,
      }),
  });

  // Invoices are backend-only — the session-authenticated invoicingAction
  // gateway returns balance/due-date snapshots (same shape the Invoices page
  // and ops reports consume).
  const { data: invoices = [], error: invoiceError } = useQuery({
    queryKey: ["comms-followups", "invoices"],
    enabled: !!sessionToken,
    queryFn: async () => {
      const r = await base44.functions.invoke("invoicingAction", {
        session_token: sessionToken,
        action: "list_invoices",
      });
      const data = r?.data || r;
      if (!data?.success) throw new Error(data?.error || "Invoices could not load.");
      return data.invoices || [];
    },
  });

  const { data: rulesRecord } = useQuery({
    queryKey: ["comms-followups", "rules"],
    queryFn: () =>
      loadSingleGlobalSetting({
        entity: GlobalSettings,
        settingKey: FOLLOWUP_RULES_SETTING_KEY,
        label: "Follow-up rules",
      }),
  });
  const rules = useMemo(
    () => normalizeFollowupRules(rulesRecord?.setting_value),
    [rulesRecord],
  );

  useEffect(() => {
    setLoadError(invoiceError ? invoiceError.message || "Invoices could not load." : "");
  }, [invoiceError]);

  const onChanged = () =>
    queryClientInstance.invalidateQueries({ queryKey: FOLLOWUP_ACTIVITY_QUERY_KEY });

  return (
    <div className="flex h-full flex-col gap-3 overflow-auto p-3">
      <div>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Communication follow-ups</h2>
        <p className="text-xs text-slate-500">
          Two-stage follow-ups on sent quotes and overdue invoices. Send writes an
          OpportunityActivity log row so a handled follow-up is never suggested twice.
        </p>
      </div>

      <RulesPanel record={rulesRecord} rules={rules} />

      {loadError && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
          {loadError}
        </div>
      )}

      <FollowupQueue
        estimates={estimates}
        invoices={invoices}
        activities={activities}
        customers={customers}
        rules={rules}
        sessionToken={sessionToken}
        actor={actor}
        onChanged={onChanged}
      />
    </div>
  );
}

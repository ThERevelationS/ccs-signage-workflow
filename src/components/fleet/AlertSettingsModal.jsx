import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { AlertCircle, ExternalLink, Fuel, Gauge, Loader2, Save, X } from "lucide-react";

const initialRules = () => ({
  speed: { rule_key: "speed", enabled: false, threshold: "", source: "default", inherited: false },
  fuel_level: { rule_key: "fuel_level", enabled: false, threshold: "", source: "default", inherited: false },
});

export default function AlertSettingsModal({ open, onClose, vehicle }) {
  const vin = String(vehicle?.vin || "").trim().toUpperCase();
  const [rules, setRules] = useState(initialRules);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");

  useEffect(() => {
    if (!open || !vin) return;
    let mounted = true;
    setLoading(true);
    setError("");
    setSaved("");
    base44.functions.invoke("fleetAlertSettingsAction", { action: "get", vehicle_vin: vin })
      .then(({ data }) => {
        if (!mounted) return;
        if (data?.error) throw new Error(data.error);
        const next = initialRules();
        for (const row of data?.rules || []) {
          if (!next[row.rule_key]) continue;
          next[row.rule_key] = {
            ...next[row.rule_key],
            ...row,
            threshold: row.threshold == null ? "" : String(row.threshold),
          };
        }
        setRules(next);
      })
      .catch((e) => mounted && setError(e?.message || "Unable to load CCS Fleet alert settings."))
      .finally(() => mounted && setLoading(false));
    return () => { mounted = false; };
  }, [open, vin]);

  if (!open) return null;

  const updateRule = (key, patch) => setRules(prev => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  const save = async () => {
    setSaving(true);
    setError("");
    setSaved("");
    try {
      const payload = [rules.speed, rules.fuel_level].map(rule => ({
        rule_key: rule.rule_key,
        enabled: !!rule.enabled,
        threshold: rule.threshold,
        expected_updated_date: rule.source === "vehicle" ? (rule.updated_date || "") : "",
      }));
      const { data } = await base44.functions.invoke("fleetAlertSettingsAction", {
        action: "save_vehicle",
        vehicle_vin: vin,
        rules: payload,
      });
      if (data?.error) throw new Error(data.error);
      const next = initialRules();
      for (const row of data?.rules || []) {
        if (!next[row.rule_key]) continue;
        next[row.rule_key] = { ...next[row.rule_key], ...row, threshold: row.threshold == null ? "" : String(row.threshold), source: "vehicle", inherited: false };
      }
      setRules(next);
      setSaved("CCS local alert rules saved for this vehicle.");
    } catch (e) {
      setError(e?.message || "Unable to save CCS Fleet alert settings.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 p-3 sm:p-5" onClick={onClose}>
      <div className="w-full max-w-lg max-h-[90vh] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-4 py-4 dark:border-slate-800">
          <div>
            <h2 className="font-bold text-slate-900 dark:text-slate-100">CCS Local Alert Rules</h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{vehicle?.nickName || vehicle?.model?.name || "Vehicle"}{vin ? ` · ${vin}` : ""}</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800" aria-label="Close alert settings"><X className="h-4 w-4" /></button>
        </div>

        <div className="max-h-[calc(90vh-70px)] overflow-y-auto p-4 sm:p-5 space-y-4">
          <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-200">
            These are CCS-generated threshold alerts evaluated from Bouncie vehicle data. They do not change Bouncie-owned notifications, webhooks, trips, or device settings.
          </div>

          {error && <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300"><AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />{error}</div>}
          {saved && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300">{saved}</div>}

          {loading ? <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div> : <>
            <RuleCard
              icon={Gauge}
              title="Speed"
              description="Create a CCS warning when Bouncie reports a speed above this vehicle-specific threshold."
              unit="mph"
              placeholder="e.g. 70"
              min="1"
              max="150"
              rule={rules.speed}
              onChange={(patch) => updateRule("speed", patch)}
            />
            <RuleCard
              icon={Fuel}
              title="Low Fuel"
              description="Create a CCS warning when Bouncie reports fuel at or below this percentage."
              unit="%"
              placeholder="e.g. 25"
              min="1"
              max="100"
              rule={rules.fuel_level}
              onChange={(patch) => updateRule("fuel_level", patch)}
            />
          </>}

          <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
            <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Bouncie-owned alert settings</div>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Impact, geozones, curfews, trip notifications, device alerts and other Bouncie-owned behavior stay managed by Bouncie. CCS does not duplicate or overwrite those settings.</p>
            <a href="https://www.bouncie.com/app" target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-indigo-600 dark:text-indigo-300">Open Bouncie settings <ExternalLink className="h-4 w-4" /></a>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button onClick={onClose} disabled={saving} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">Cancel</button>
            <button onClick={save} disabled={loading || saving || !vin} className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}{saving ? "Saving…" : "Save CCS Alerts"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function RuleCard({ icon: Icon, title, description, unit, placeholder, min, max, rule, onChange }) {
  return <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
    <div className="flex items-start gap-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800"><Icon className="h-4 w-4 text-slate-600 dark:text-slate-300" /></div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-3">
          <div className="font-semibold text-slate-900 dark:text-slate-100">{title}</div>
          <button type="button" onClick={() => onChange({ enabled: !rule.enabled })} className={`relative h-6 w-11 rounded-full transition-colors ${rule.enabled ? "bg-emerald-600" : "bg-slate-300 dark:bg-slate-700"}`} aria-pressed={!!rule.enabled} aria-label={`${rule.enabled ? "Disable" : "Enable"} ${title} alert`}>
            <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${rule.enabled ? "left-[22px]" : "left-0.5"}`} />
          </button>
        </div>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{description}</p>
        {rule.inherited && <div className="mt-2 text-[11px] font-medium text-amber-700 dark:text-amber-300">Currently inherited from the global CCS Fleet rule. Saving creates a vehicle-specific override.</div>}
        <label className="mt-3 block text-xs font-medium text-slate-600 dark:text-slate-300">Threshold
          <div className="mt-1 flex items-center gap-2"><input type="number" min={min} max={max} step="1" value={rule.threshold} onChange={(e) => onChange({ threshold: e.target.value })} placeholder={placeholder} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100" /><span className="w-10 text-xs text-slate-500 dark:text-slate-400">{unit}</span></div>
        </label>
      </div>
    </div>
  </div>;
}
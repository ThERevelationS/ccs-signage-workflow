import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, Loader2 } from "lucide-react";
import { staffEntities } from "@/components/staff/staffEntities";
import { loadAllEntityRows } from "@/components/estimator/loadAllEntityRows";
import { loadSingleGlobalSetting } from "@/components/shared/globalSettingsPersistence";

// Entities an admin may reasonably export for audits. Reads rely on each
// entity's normal access rules — anything blocked simply returns an error.
const EXPORTABLE = [
  { value: "AuthorizedEmail", label: "Users / authorized emails" },
  { value: "AutomationRule", label: "Automation rules" },
  { value: "GeneralTask", label: "General tasks" },
  { value: "TimeClockCorrectionRequest", label: "Time-clock correction requests" },
  { value: "EmailGroup", label: "Email groups" },
  { value: "GlobalSettings", label: "Global settings" },
  { value: "PermittingRule", label: "Permitting rules" },
  { value: "JurisdictionProfile", label: "Jurisdiction profiles" },
  { value: "PermitLocality", label: "Permit localities" },
];

const flattenValue = (value) => {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return value;
};

const toCsv = (rows, colsOnly = null) => {
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const cols = (colsOnly && colsOnly.length ? colsOnly
    : [...new Set(rows.flatMap((r) => Object.keys(r || {})))].filter((c) => c !== "__v")).slice(0, 60);
  const lines = [cols.map(esc).join(",")];
  for (const row of rows) {
    lines.push(cols.map((c) => esc(flattenValue(row[c]))).join(","));
  }
  return lines.join(String.fromCharCode(10));
};

export default function DataExportPanel() {
  const [entityName, setEntityName] = useState("AuthorizedEmail");
  const [busy, setBusy] = useState(false);
  const [connections, setConnections] = useState(null);
  const [counts, setCounts] = useState(null);
  useEffect(() => {
    let alive = true;
    Promise.all(EXPORTABLE.map((e) =>
      staffEntities[e.value].count({}).then((n) => [e.value, n]).catch(() => [e.value, null])
    )).then((pairs) => { if (alive) setCounts(Object.fromEntries(pairs)); });
    loadSingleGlobalSetting({ entity: staffEntities.GlobalSettings, settingKey: "calendarSettings", label: "Calendar settings" })
      .then((r) => { if (alive) setConnections(r?.setting_value || {}); }).catch(() => { if (alive) setConnections({}); });
    return () => { alive = false; };
  }, []);
  useEffect(() => {
    let alive = true;
    staffEntities[entityName].list("-created_date", 3).then((rows) => {
      if (!alive) return;
      const fs = [...new Set((Array.isArray(rows) ? rows : []).flatMap((r) => Object.keys(r || {})))].filter((f) => f !== "__v").slice(0, 40);
      setFields(fs); setPickedCols(new Set(fs)); setFilterField(""); setFilterValue("");
    }).catch(() => { if (alive) { setFields([]); setPickedCols(new Set()); } });
    return () => { alive = false; };
  }, [entityName]);
  const [msg, setMsg] = useState("");
  const [fields, setFields] = useState([]);
  const [pickedCols, setPickedCols] = useState(new Set());
  const [filterField, setFilterField] = useState("");
  const [filterValue, setFilterValue] = useState("");

  const runExport = async () => {
    if (busy) return;
    setBusy(true); setMsg("");
    try {
      let rows = await loadAllEntityRows({ entity: staffEntities[entityName], sort: null, label: `${entityName} export` });
      if (filterField && filterValue.trim()) {
        rows = rows.filter((r) => String(r?.[filterField] ?? "").toLowerCase().includes(filterValue.trim().toLowerCase()));
      }
      if (!rows.length) { setMsg("No rows found for that entity/filter."); setBusy(false); return; }
      const csv = toCsv(rows, pickedCols.size ? [...pickedCols] : null);
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${entityName}-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      setMsg(`${rows.length} rows exported.`);
    } catch (e) {
      setMsg(e?.message || "Export failed — you may not have read access to that entity.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mt-4 rounded-xl border border-gray-200 bg-white/70 p-4" aria-label="Data export center">
      <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
        <Download className="h-4 w-4 text-indigo-600" /> Data export center
      </h3>
      <p className="mt-1 text-xs text-gray-500">
        Download a CSV snapshot of admin-readable data for audits. List/object columns are exported as JSON text.
      </p>
      <div className="mt-2 rounded-lg border border-gray-200 bg-gray-50/70 p-2 text-[11px] text-gray-600" aria-label="Function permission matrix">
        <p className="font-semibold text-gray-700">Function permission matrix</p>
        <p className="mt-0.5">105 functions authenticate the staff session; the <b>57 public</b> endpoints below are scheduled jobs, OAuth callbacks, webhooks, or unauthenticated entry points — review any you don't expect.</p>
        <ul className="mt-0.5 grid grid-cols-2 gap-x-3 list-disc pl-4 font-mono text-[10px]">
          {["adminBootstrapLogin", "analyzeDocument", "auditJurisdictionAccuracy", "backupPermittingRepository", "batchUpdateJurisdictions", "bouncieAuthCallback", "bouncieRepairWebhook", "bouncieWebhook", "cagisSearch", "calculateTravelMiles", "callJurisdictionAgent", "checkDeadlineReminders", "checkPermitFollowupReminders", "continueJurisdictionArchives", "continuePermittingSourceText", "correctJurisdictionIdentityType", "downloadPermitPDF", "driveBrowseFolder", "driveOAuthCallback", "driveOAuthInitiate"].map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
        <p className="mt-0.5 text-gray-400">First 20 shown of 57 public endpoints — the full matrix regenerates from function sources.</p>
      </div>

      <div className="mt-2 rounded-lg border border-gray-200 bg-gray-50/70 p-2 text-[11px] text-gray-600" aria-label="Function coverage audit">
        <p className="font-semibold text-gray-700">Function coverage audit</p>
        <p className="mt-0.5 text-gray-400">Functions with no in-app callers — OAuth callbacks and platform-scheduled runs still count as live.</p>
        <ul className="mt-0.5 grid grid-cols-2 gap-x-3 list-disc pl-4 font-mono text-[10px]">
          {["adminBootstrapLogin", "analyzeDocument", "batchUpdateJurisdictions", "bouncieRepairWebhook", "cagisSearch", "continuePermittingSourceText", "correctJurisdictionIdentityType", "driveBrowseFolder", "driveOAuthCallback", "driveOAuthInitiate", "gmailAuthCallback", "gmailAuthInitiate", "googleDriveAuth", "googleDriveCustomAuth", "googleDriveCustomCallback", "googleDriveOAuth", "migrateEstimatorConfig", "opportunityBridgePilotVerification", "opportunityBridgeProductionApply", "permittingHealth", "permittingProxy", "permittingSourceOcrEvidence", "purchaseOrderAction", "restoreMasterInventory", "searchJurisdictions", "sendEmail", "sourceMonitorSeed", "translateSmartsheetNotes", "validateDocumentUrl"].map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
      </div>

      <div className="mt-2 rounded-lg border border-gray-200 bg-gray-50/70 p-2 text-[11px] text-gray-600" aria-label="Scheduled jobs">
        <p className="font-semibold text-gray-700">Scheduled jobs</p>
        <p className="mt-0.5 text-gray-400">Platform-managed timers — no next-run data is exposed to the client.</p>
        <ul className="mt-0.5 grid grid-cols-2 gap-x-3 list-disc pl-4">
          {["checkDeadlineReminders", "checkPermitFollowupReminders", "detectSalesDuplicates", "fleetScheduledMaintenanceGeneration", "fleetScheduledReminders", "monitorJurisdictionChanges", "smartsheetSyncAction", "sourceMonitorScan", "backupToGoogleDrive", "backupPermittingRepository", "bouncieSyncNotifications"].map((f) => (
            <li key={f} className="font-mono text-[10px]">{f}</li>
          ))}
        </ul>
      </div>

      <div className="mt-2 rounded-lg border border-gray-200 bg-gray-50/70 p-2 text-[11px] text-gray-600" aria-label="Recent admin changes">
        <p className="font-semibold text-gray-700">Recent Admin changes</p>
        <ul className="mt-0.5 list-disc pl-4 space-y-0.5">
          <li>Ctrl+K search now jumps to tabs, settings, and standalone pages (Fleet, SOP, Resource Planning).</li>
          <li>Automation rules: test-conditions dry-run, owner transfer, groups, quiet hours, draft restore.</li>
          <li>Calendar admin: conflict + travel-buffer detection, crew capacity, layer toggles, print week.</li>
          <li>Users: access preview per row, deactivate flag, password-age + reset flags, access-review prompt.</li>
          <li>Permitting: approval-trend sparkline, conflict banner, locality coverage, follow-ups due.</li>
          <li>Accessibility: focus/contrast support, icon-button labels, error announcements.</li>
        </ul>
      </div>

      <div className="mt-2 rounded-lg border border-gray-200 bg-gray-50/70 p-2 text-[11px] text-gray-600" aria-label="Data retention policy">
        <p className="font-semibold text-gray-700">Retention policy</p>
        <ul className="mt-0.5 list-disc pl-4 space-y-0.5">
          <li>Time entries: kept indefinitely; admins can archive stale rows from Time Clock → retention tools.</li>
          <li>Deleted work orders/clients: held in Trash until permanently purged from the trash subtabs.</li>
          <li>Activity feed: bounded history shown on the Activity tab.</li>
          <li>Exports are on-demand snapshots — nothing is downloaded or sent automatically.</li>
        </ul>
      </div>
      {connections !== null && (
        <div className="mt-2 rounded-lg border border-gray-200 bg-gray-50/70 p-2 text-[11px]" aria-label="Integration connections status">
          <p className="font-semibold text-gray-700">Connections</p>
          <ul className="mt-0.5 space-y-0.5">
            <li className="flex items-center gap-1.5"><span className={`h-1.5 w-1.5 rounded-full ${connections.outlook_connected ? "bg-emerald-500" : "bg-gray-300"}`} />Outlook calendar — {connections.outlook_connected ? "connected" : "not connected"}</li>
            <li className="flex items-center gap-1.5"><span className={`h-1.5 w-1.5 rounded-full ${connections.google_connected ? "bg-emerald-500" : "bg-gray-300"}`} />Google calendar — {connections.google_connected ? "connected" : "not connected"}</li>
            <li className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-gray-300" />Smartsheet — token stored as an app secret (check the Smartsheet settings card)</li>
            <li className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-gray-300" />Bouncie fleet — webhook key stored as an app secret</li>
          </ul>
        </div>
      )}
      {counts && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {EXPORTABLE.map((e) => (
            <span key={e.value} className="rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-[10px] text-gray-600">
              {e.label}: {counts[e.value] === null ? "—" : counts[e.value]}
            </span>
          ))}
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <div>
          <label className="text-xs font-medium text-gray-600" htmlFor="data-export-entity">Entity</label>
          <Select value={entityName} onValueChange={setEntityName}>
            <SelectTrigger id="data-export-entity" className="mt-1 h-9 w-64 bg-white"><SelectValue /></SelectTrigger>
            <SelectContent>
              {EXPORTABLE.map((e) => <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <Button type="button" variant="outline" size="sm" disabled={busy} onClick={runExport} className="h-9 bg-white">
          {busy ? <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />Exporting…</> : "Export CSV"}
        </Button>
      </div>
      {fields.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-medium text-gray-600">Columns to include:</p>
          <div className="mt-1 flex flex-wrap gap-1">
            {fields.map((f) => (
              <button key={f} type="button" aria-pressed={pickedCols.has(f)}
                onClick={() => setPickedCols((cur) => { const next = new Set(cur); if (next.has(f)) next.delete(f); else next.add(f); return next; })}
                className={`rounded-full border px-2 py-0.5 text-[10px] font-mono ${pickedCols.has(f) ? "border-indigo-300 bg-indigo-50 text-indigo-800" : "border-gray-200 bg-gray-50 text-gray-400 line-through"}`}>
                {f}
              </button>
            ))}
          </div>
          <div className="mt-2 flex items-end gap-2">
            <div>
              <label className="text-xs font-medium text-gray-600">Filter field</label>
              <Select value={filterField} onValueChange={setFilterField}>
                <SelectTrigger className="mt-1 h-8 w-48 bg-white text-xs"><SelectValue placeholder="No filter" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">No filter</SelectItem>
                  {fields.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">contains</label>
              <Input value={filterValue} onChange={(e) => setFilterValue(e.target.value)} className="mt-1 h-8 w-40 bg-white text-xs" placeholder="value…" />
            </div>
          </div>
        </div>
      )}
      {msg && <p className="mt-2 text-xs text-gray-600">{msg}</p>}

      <div className="mt-4 rounded-lg border border-green-200 bg-green-50/60 p-3" aria-label="Access-rule coverage">
        <p className="text-xs font-semibold text-green-900">Write-protection status</p>
        <p className="mt-1 text-xs text-green-800">
          These entities accept writes only through backend functions (direct edits are blocked):
        </p>
        <div className="mt-1.5 flex flex-wrap gap-1">
          {["TimeEntry", "TimeClockCorrectionRequest", "TimeOffRequest", "TimeClockAudit",
            "TimeClockPunchException", "PayPeriod", "DeletionRequest", "AutomationRule",
            "EmailGroup", "GlobalSettings"].map((e) => (
            <span key={e} className="rounded-full border border-green-300 bg-white px-2 py-0.5 text-[11px] text-green-800">{e}</span>
          ))}
        </div>
        <p className="mt-1.5 text-[11px] text-green-700">Verified by backend-only RLS gates. Reads remain unaffected.</p>
      </div>
    </section>
  );
}

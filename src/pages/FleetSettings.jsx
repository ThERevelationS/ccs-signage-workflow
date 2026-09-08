import { useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import FleetModuleNav from "@/components/fleet/FleetModuleNav";
import { Settings, Loader2, ShieldCheck, AlertTriangle, CheckCircle2, XCircle, RefreshCw } from "lucide-react";

export default function FleetSettings() {
  const [user, setUser] = useState(null);
  const [settings, setSettings] = useState(null);
  const [connection, setConnection] = useState(null);
  const [audit, setAudit] = useState(null);
  const [serverStatus, setServerStatus] = useState(null);
  const [checking, setChecking] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const u = await base44.auth.me();
        setUser(u);
        if (u?.role === "admin") {
          const [settingsRows, connectionRows, auditRows, statusResult] = await Promise.all([
            base44.entities.FleetSettings.list("-updated_date", 10),
            base44.entities.BouncieConnection.list("-updated_date", 10),
            base44.entities.FleetMigrationAudit.list("-created_date", 20),
            base44.functions.invoke("fleetCutoverControl", { action: "status" }).catch(() => null),
          ]);
          setSettings((settingsRows || [])[0] || null);
          setConnection((connectionRows || [])[0] || null);
          setAudit((auditRows || []).find((row) => row.mode === "verification") || (auditRows || [])[0] || null);
          setServerStatus(statusResult?.data || null);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const readiness = useMemo(() => {
    const labels = {
      settings_present: "Fleet settings present",
      fleet_url_configured: "CCS Fleet production URL configured",
      source_freeze_confirmed: "FleetMaster source freeze confirmed",
      verification_audit_passed: "Migration verification audit passed",
      verification_audit_no_delta: "Final source delta is clean",
      destination_counts_match_audit: "Destination counts match verified snapshot",
      notification_queue_clean: "Notification queue has no unresolved work",
      operation_receipts_clean: "Operation ledger has no unresolved work",
      bouncie_connection_present: "Bouncie connection present",
      bouncie_reconnect_clear: "Bouncie REST authorization healthy",
      bouncie_webhook_active: "Bouncie webhook active",
      bouncie_rest_sync_recent: "Bouncie REST sync is recent",
      bouncie_live_probe: "Bouncie live REST probe",
    };
    if (serverStatus?.checks?.length) {
      return serverStatus.checks.map((item) => ({ label: labels[item.key] || item.key, ok: !!item.pass, detail: item.detail || "" }));
    }
    if (!settings) return [];
    return [
      { label: "Fleet migration snapshot reconciled", ok: !!audit?.summary?.migration_snapshot_reconciled, detail: audit?.run_key || "No verification audit found" },
      { label: "CCS Fleet production URL configured", ok: !!settings.fleet_app_base_url, detail: settings.fleet_app_base_url || "Not configured" },
      { label: "FleetMaster source freeze confirmed", ok: !!settings.source_freeze_confirmed, detail: settings.source_freeze_confirmed_at || "Not yet frozen" },
      { label: "Bouncie webhook active", ok: !!connection?.webhook_active, detail: connection?.last_webhook_at ? `Last event ${new Date(connection.last_webhook_at).toLocaleString()}` : "No recent webhook timestamp" },
      { label: "Bouncie REST authorization healthy", ok: !!connection && !connection.needs_reconnect, detail: connection?.needs_reconnect ? "Administrator OAuth reconnect required" : "No reconnect flag" },
    ];
  }, [settings, connection, audit, serverStatus]);

  const runServerCheck = async () => {
    setChecking(true);
    try {
      const { data } = await base44.functions.invoke("fleetCutoverControl", { action: "status" });
      setServerStatus(data || null);
      const [settingsRows, connectionRows] = await Promise.all([
        base44.entities.FleetSettings.list("-updated_date", 10),
        base44.entities.BouncieConnection.list("-updated_date", 10),
      ]);
      setSettings((settingsRows || [])[0] || null);
      setConnection((connectionRows || [])[0] || null);
    } finally {
      setChecking(false);
    }
  };

  if (loading) return <div className="h-full flex flex-col bg-gray-50 dark:bg-slate-950"><FleetModuleNav/><div className="flex-1 flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-gray-400"/></div></div>;
  if (user?.role !== "admin") return <div className="min-h-full bg-gray-50 dark:bg-slate-950"><FleetModuleNav/><div className="max-w-3xl mx-auto p-6"><div className="rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 p-5"><div className="flex items-center gap-2 font-semibold text-amber-800 dark:text-amber-200"><ShieldCheck className="w-5 h-5"/>Admin access required</div><p className="text-sm text-amber-700 dark:text-amber-300 mt-2">Fleet administration is protected by CCS authentication and RLS. The legacy FleetMaster Settings password is not used here.</p></div></div></div>;

  const oldUrl = settings?.email_body_template?.includes("ccsfleet-master") || settings?.email_body_template?.includes("68accb163a1b474cdb95ea70");
  const blocked = readiness.some((item) => !item.ok);

  return <div className="min-h-full bg-gray-50 dark:bg-slate-950"><FleetModuleNav/><div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-5">
    <div><h1 className="text-2xl font-bold text-gray-900 dark:text-slate-100 flex items-center gap-2"><Settings className="w-6 h-6"/>Fleet Settings</h1><p className="text-sm text-gray-500 dark:text-slate-400">CCS Fleet administration and cutover readiness. Operational gates remain off until controlled activation.</p></div>

    <div className={`rounded-xl border p-4 ${blocked ? "border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800" : "border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30 dark:border-emerald-800"}`}>
      <div className={`font-semibold ${blocked ? "text-amber-900 dark:text-amber-100" : "text-emerald-900 dark:text-emerald-100"}`}>{blocked ? "Cutover has blockers" : "Ready for controlled cutover"}</div>
      <div className="mt-3 space-y-2">{readiness.map(item => <div key={item.label} className="flex items-start gap-2 text-sm">{item.ok ? <CheckCircle2 className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0"/> : <XCircle className="w-4 h-4 text-red-600 mt-0.5 shrink-0"/>}<div><div className="font-medium text-gray-900 dark:text-slate-100">{item.label}</div><div className="text-xs text-gray-500 dark:text-slate-400 break-all">{item.detail}</div></div></div>)}</div>
    </div>

    {connection?.needs_reconnect && <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-800 p-4 flex gap-3"><AlertTriangle className="w-5 h-5 text-red-600 shrink-0"/><div><div className="font-semibold text-red-800 dark:text-red-200">Bouncie administrator reconnect required</div><p className="text-sm text-red-700 dark:text-red-300 mt-1">The stored refresh credential was rejected. Webhooks may continue independently, but Fleet Tracking REST vehicles/trips must be reauthorized from the Tracking page before cutover.</p></div></div>}

    {oldUrl && <div className="rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 p-4 flex gap-3"><AlertTriangle className="w-5 h-5 text-amber-600 shrink-0"/><div><div className="font-semibold text-amber-800 dark:text-amber-200">Legacy FleetMaster URL still preserved in a template</div><p className="text-sm text-amber-700 dark:text-amber-300 mt-1">Replace this before notifications are enabled.</p></div></div>}

    {settings ? <div className="grid md:grid-cols-2 gap-4">
      <Card title="Cutover Gates"><Row label="Maintenance generation" value={settings.maintenance_generation_enabled ? "ON" : "OFF"}/><Row label="Operational notifications" value={settings.notifications_enabled ? "ON" : "OFF"}/><Row label="Scheduled reminders" value={settings.scheduled_reminders_enabled ? "ON" : "OFF"}/><Row label="Public reporting" value={settings.public_reporting_enabled ? "ON" : "OFF"}/></Card>
      <Card title="Company & Fleet URL"><Row label="Company name" value={settings.company_name}/><Row label="Fleet URL" value={settings.fleet_app_base_url}/><Row label="Setting type" value={settings.setting_type}/></Card>
      <Card title="Reminder Schedule"><Row label="Items on order" value={(settings.item_order_reminder_days||[]).join(", ")||"Disabled"}/><Row label="Open work orders" value={(settings.open_work_order_reminder_days||[]).join(", ")||"Disabled"}/></Card>
      <Card title="Notification Recipients"><Recipient label="New work orders" values={settings.work_order_creation_emails}/><Recipient label="Completed work orders" values={settings.work_order_completed_emails}/><Recipient label="Low stock" values={settings.low_stock_emails}/><Recipient label="Requests" values={settings.request_emails}/><Recipient label="Parts received" values={settings.parts_received_emails}/></Card>
      <Card title="Reminder Recipients"><Recipient label="Items on order" values={settings.item_order_reminder_emails}/><Recipient label="Open work orders" values={settings.open_work_order_reminder_emails}/><Recipient label="System reports" values={settings.report_emails}/></Card>
      <Card title="Migration Verification"><Row label="Latest audit" value={audit?.run_key}/><Row label="Audit status" value={audit?.status}/><Row label="Delta records migrated" value={audit?.summary?.delta_records_migrated ?? "—"}/></Card>
      <div className="md:col-span-2"><Card title="Templates"><Row label="New WO subject" value={settings.email_subject_template}/><Row label="Completed WO subject" value={settings.email_completed_subject_template}/><Row label="Items reminder subject" value={settings.item_order_reminder_subject_template}/><Row label="Open WO reminder subject" value={settings.open_work_order_reminder_subject_template}/></Card></div>
    </div> : <div className="rounded-xl border border-gray-200 bg-white dark:bg-slate-900 dark:border-slate-800 p-8 text-center text-gray-500">No Fleet settings record found.</div>}
  </div></div>;
}

function Card({title,children}){return <div className="rounded-xl border border-gray-200 bg-white dark:bg-slate-900 dark:border-slate-800 p-4 shadow-sm"><h2 className="font-semibold text-gray-900 dark:text-slate-100 mb-3">{title}</h2><div className="space-y-3">{children}</div></div>}
function Row({label,value}){return <div><div className="text-xs text-gray-400">{label}</div><div className="text-sm text-gray-800 dark:text-slate-200 mt-0.5 whitespace-pre-wrap break-words">{value === 0 ? "0" : value || "—"}</div></div>}
function Recipient({label,values}){return <Row label={label} value={(values||[]).map(v=>`${v.email}${v.delay_minutes!=null?` (${v.delay_minutes}m)`:""}`).join(", ")||"None"}/>}

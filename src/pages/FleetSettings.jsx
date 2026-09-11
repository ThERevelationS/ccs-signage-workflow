import { useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import FleetModuleNav from "@/components/fleet/FleetModuleNav";
import FleetSettingsEditor from "@/components/fleet/FleetSettingsEditor";
import FleetConfirmDialog from "@/components/fleet/FleetConfirmDialog";
import { filterAllFleetRows } from "@/components/fleet/fleetEntityLoaders";
import { Settings, Loader2, ShieldCheck, AlertTriangle, CheckCircle2, XCircle, RefreshCw, Activity, Pencil, Play, Mail, Copy, Download, QrCode } from "lucide-react";

const LEGACY_FLEET_PUBLIC_REPORT_URL = "https://app--ccsfleet-master-db95ea70.base44.app/PublicReport";
const LEGACY_FLEET_QR_DISPLAY_SRC = "/fleet/fleetmaster-public-report-qr-200.png";
const LEGACY_FLEET_QR_DOWNLOAD_SRC = "/fleet/fleetmaster-public-report-qr-400.png";
const AUTOMATION_SOURCES = ["fleetScheduledMaintenanceGeneration", "fleetScheduledReminders", "fleetNotificationWorker", "fleetReminderFallback", "bouncieSyncNotifications"];

async function loadAutomationHealthData() {
  const [maintenance, reminders, worker, reminderFallback, bouncieAlerts, queuePending, queueSending, queueFailed, receiptStarted, receiptFailed] = await Promise.all([
    base44.entities.FleetSystemLog.filter({ source: "fleetScheduledMaintenanceGeneration" }, "-created_date", 1),
    base44.entities.FleetSystemLog.filter({ source: "fleetScheduledReminders" }, "-created_date", 1),
    base44.entities.FleetSystemLog.filter({ source: "fleetNotificationWorker" }, "-created_date", 1),
    base44.entities.FleetSystemLog.filter({ source: "fleetReminderFallback" }, "-created_date", 1),
    base44.entities.FleetSystemLog.filter({ source: "bouncieSyncNotifications" }, "-created_date", 1),
    filterAllFleetRows(base44.entities.FleetNotificationQueue, { status: "pending" }, "-created_date", { label: "Pending Fleet notifications" }),
    filterAllFleetRows(base44.entities.FleetNotificationQueue, { status: "sending" }, "-created_date", { label: "Sending Fleet notifications" }),
    filterAllFleetRows(base44.entities.FleetNotificationQueue, { status: "failed" }, "-created_date", { label: "Failed Fleet notifications" }),
    filterAllFleetRows(base44.entities.FleetOperationReceipt, { status: "started" }, "-created_date", { label: "Started Fleet operation receipts" }),
    filterAllFleetRows(base44.entities.FleetOperationReceipt, { status: "failed" }, "-created_date", { label: "Failed Fleet operation receipts" }),
  ]);
  return {
    logs: [...(maintenance || []), ...(reminders || []), ...(worker || []), ...(reminderFallback || []), ...(bouncieAlerts || [])],
    notifications: [...queuePending, ...queueSending, ...queueFailed],
    receipts: [...receiptStarted, ...receiptFailed],
  };
}

export default function FleetSettings() {
  const [user, setUser] = useState(null);
  const [settings, setSettings] = useState(null);
  const [connection, setConnection] = useState(null);
  const [audit, setAudit] = useState(null);
  const [serverStatus, setServerStatus] = useState(null);
  const [integrity, setIntegrity] = useState(null);
  const [integrityBusy, setIntegrityBusy] = useState(false);
  const [automationLogs, setAutomationLogs] = useState([]);
  const [queueRows, setQueueRows] = useState([]);
  const [receiptRows, setReceiptRows] = useState([]);
  const [checking, setChecking] = useState(false);
  const [actionBusy, setActionBusy] = useState("");
  const [actionError, setActionError] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [manualAction, setManualAction] = useState(null);
  const [manualBusy, setManualBusy] = useState("");
  const [manualError, setManualError] = useState("");
  const [manualResult, setManualResult] = useState("");
  const [qrCopied, setQrCopied] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const u = await base44.auth.me();
        setUser(u);
        if (u?.role === "admin") {
          const [settingsRows, bouncieStatusResult, auditRows, statusResult, integrityResult, health] = await Promise.all([
            base44.entities.FleetSettings.list("-updated_date", 10),
            base44.functions.invoke("bouncieStatus", {}).catch(() => null),
            base44.entities.FleetMigrationAudit.list("-created_date", 20),
            base44.functions.invoke("fleetCutoverControl", { action: "status" }).catch(() => null),
            base44.functions.invoke("fleetIntegrityAudit", {}).catch(() => null),
            loadAutomationHealthData(),
          ]);
          setSettings((settingsRows || [])[0] || null);
          setConnection(bouncieStatusResult?.data || null);
          setAudit((auditRows || []).find((row) => row.mode === "verification") || (auditRows || [])[0] || null);
          setServerStatus(statusResult?.data || null);
          setIntegrity(integrityResult?.data || null);
          setAutomationLogs((health.logs || []).filter(row => AUTOMATION_SOURCES.includes(row.source)));
          setQueueRows(health.notifications || []);
          setReceiptRows(health.receipts || []);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const readiness = useMemo(() => {
    const labels = {
      settings_present: "Fleet settings present",
      cutover_state_present: "Server-owned cutover state present",
      fleet_url_configured: "CCS Fleet production URL configured",
      source_freeze_confirmed: "FleetMaster source freeze confirmed",
      verification_audit_passed: "Migration verification audit passed",
      verification_audit_no_delta: "Final source delta is clean",
      destination_counts_match_audit: "FleetMaster-migrated records retained",
      notification_queue_clean: "Notification queue has no unresolved work",
      operation_receipts_clean: "Operation ledger has no unresolved work",
      gmail_sender_connected: "Fleet Gmail sender connected",
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
      { label: "Bouncie webhook active", ok: !!connection?.webhookActive, detail: connection?.lastWebhookAt ? `Last event ${new Date(connection.lastWebhookAt).toLocaleString()}` : "No recent webhook timestamp" },
      { label: "Bouncie REST authorization healthy", ok: !!connection?.connected && !connection.needsReconnect, detail: connection?.needsReconnect ? "Administrator OAuth reconnect required" : "No reconnect flag" },
    ];
  }, [settings, connection, audit, serverStatus]);

  const runServerCheck = async () => {
    setChecking(true);
    try {
      const { data } = await base44.functions.invoke("fleetCutoverControl", { action: "status" });
      setServerStatus(data || null);
      const [settingsRows, bouncieStatusResult, health] = await Promise.all([
        base44.entities.FleetSettings.list("-updated_date", 10),
        base44.functions.invoke("bouncieStatus", {}).catch(() => null),
        loadAutomationHealthData(),
      ]);
      setSettings((settingsRows || [])[0] || null);
      setConnection(bouncieStatusResult?.data || null);
      setAutomationLogs((health.logs || []).filter(row => AUTOMATION_SOURCES.includes(row.source)));
      setQueueRows(health.notifications || []);
      setReceiptRows(health.receipts || []);
    } finally {
      setChecking(false);
    }
  };

  const runIntegrityAudit = async () => {
    setIntegrityBusy(true);
    try {
      const { data } = await base44.functions.invoke("fleetIntegrityAudit", {});
      setIntegrity(data || null);
    } finally {
      setIntegrityBusy(false);
    }
  };

  const runManualAutomation = async () => {
    if (!manualAction) return;
    const action = manualAction;
    setManualBusy(action);
    setManualError("");
    setManualResult("");
    try {
      const functionName = action === "maintenance" ? "fleetScheduledMaintenanceGeneration" : "fleetScheduledReminders";
      const { data } = await base44.functions.invoke(functionName, {});
      if (data?.error) throw new Error(data.error);
      if (action === "maintenance") {
        setManualResult(`Maintenance generation finished: ${data?.due ?? 0} due schedule(s), ${data?.created ?? 0} new Fleet work order(s).`);
      } else {
        setManualResult(`Reminder check finished for ${data?.day || "today"}: ${data?.queued ?? 0} queued, ${data?.reused ?? 0} already handled.`);
      }
      setManualAction(null);
      await runServerCheck();
    } catch (error) {
      setManualError(error?.message || "Manual Fleet automation run failed.");
    } finally {
      setManualBusy("");
    }
  };

  const copyLegacyQrUrl = async () => {
    try {
      await navigator.clipboard.writeText(LEGACY_FLEET_PUBLIC_REPORT_URL);
      setQrCopied(true);
      window.setTimeout(() => setQrCopied(false), 1500);
    } catch {
      setQrCopied(false);
    }
  };

  const downloadLegacyQr = () => {
    const link = document.createElement("a");
    link.href = LEGACY_FLEET_QR_DOWNLOAD_SRC;
    link.download = "fleetmaster-public-report-qr.png";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const runCutoverAction = async (action) => {
    setActionBusy(action);
    setActionError("");
    try {
      const payload = action === "confirm_source_freeze"
        ? {
            action,
            confirmation: "FLEETMASTER_FROZEN_AND_DELTA_CHECKED",
            notes: "FleetMaster source write paths and scheduled automation were frozen after a clean final delta check on 2026-09-09.",
          }
        : { action };
      const { data } = await base44.functions.invoke("fleetCutoverControl", payload);
      if (data?.error) throw new Error(data.error);
      await runServerCheck();
    } catch (error) {
      setActionError(error?.message || "Cutover action failed.");
    } finally {
      setActionBusy("");
    }
  };

  if (loading) return <div className="h-full flex flex-col bg-gray-50 dark:bg-slate-950"><FleetModuleNav/><div className="flex-1 flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-gray-400"/></div></div>;
  if (user?.role !== "admin") return <div className="min-h-full bg-gray-50 dark:bg-slate-950"><FleetModuleNav/><div className="max-w-3xl mx-auto p-6"><div className="rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 p-5"><div className="flex items-center gap-2 font-semibold text-amber-800 dark:text-amber-200"><ShieldCheck className="w-5 h-5"/>Admin access required</div><p className="text-sm text-amber-700 dark:text-amber-300 mt-2">Fleet administration is protected by CCS authentication and RLS. The legacy FleetMaster Settings password is not used here.</p></div></div></div>;

  const oldUrl = settings?.email_body_template?.includes("ccsfleet-master") || settings?.email_body_template?.includes("68accb163a1b474cdb95ea70");
  const latestAutomation = Object.fromEntries(AUTOMATION_SOURCES.map(source => [source, automationLogs.find(row => row.source === source) || null]));
  const queueUnresolved = queueRows.filter(row => ["pending","sending","failed"].includes(row.status));
  const receiptUnresolved = receiptRows.filter(row => ["started","failed"].includes(row.status));
  const blocked = readiness.some((item) => !item.ok);
  const gates = serverStatus?.cutover || settings || {};
  const cutoverComplete = !!gates.cutover_completed_at && !!gates.notifications_enabled && !!gates.scheduled_reminders_enabled && !!gates.maintenance_generation_enabled && !!gates.public_reporting_enabled;

  return <div className="min-h-full bg-gray-50 dark:bg-slate-950"><FleetModuleNav/><div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-5">
    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3"><div><h1 className="text-2xl font-bold text-gray-900 dark:text-slate-100 flex items-center gap-2"><Settings className="w-6 h-6"/>Fleet Settings</h1><p className="text-sm text-gray-500 dark:text-slate-400">CCS Fleet operations health, production gates, notification configuration, and migration safety records.</p></div><div className="flex flex-col sm:flex-row gap-2"><button onClick={()=>setEditorOpen(true)} disabled={!settings} className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-indigo-300 bg-indigo-50 text-sm font-medium text-indigo-700 hover:bg-indigo-100 disabled:opacity-50 dark:bg-indigo-950/40 dark:border-indigo-800 dark:text-indigo-200 dark:hover:bg-indigo-950/60"><Pencil className="w-4 h-4"/>Edit notifications & reminders</button><button onClick={runServerCheck} disabled={checking} className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-gray-300 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">{checking?<Loader2 className="w-4 h-4 animate-spin"/>:<RefreshCw className="w-4 h-4"/>}Refresh operations health</button></div></div>

    <div className={`rounded-xl border p-4 ${blocked ? "border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800" : "border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30 dark:border-emerald-800"}`}>
      <div className={`font-semibold ${blocked ? "text-amber-900 dark:text-amber-100" : "text-emerald-900 dark:text-emerald-100"}`}>{blocked ? "Fleet operations need attention" : cutoverComplete ? "Fleet production is live" : "Fleet operational checks are passing"}</div>
      <div className="mt-3 space-y-2">{readiness.map(item => <div key={item.label} className="flex items-start gap-2 text-sm">{item.ok ? <CheckCircle2 className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0"/> : <XCircle className="w-4 h-4 text-red-600 mt-0.5 shrink-0"/>}<div><div className="font-medium text-gray-900 dark:text-slate-100">{item.label}</div><div className="text-xs text-gray-500 dark:text-slate-400 break-all">{item.detail}</div></div></div>)}</div>
    </div>

    <div className="rounded-xl border border-gray-200 bg-white dark:bg-slate-900 dark:border-slate-800 p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3"><div><h2 className="font-semibold text-gray-900 dark:text-slate-100">Production Controls</h2><p className="text-xs text-gray-500 dark:text-slate-400 mt-1">Admin-only server controls. Production activation is permanent in normal UI use; every action remains validated server-side.</p></div><ShieldCheck className="w-5 h-5 text-gray-400 shrink-0"/></div>
      {actionError && <div className="mt-3 rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-800 px-3 py-2 text-sm text-red-700 dark:text-red-300">{actionError}</div>}
      {cutoverComplete ? <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/30 dark:border-emerald-900 p-3"><div className="flex items-start justify-between gap-3"><div><div className="font-semibold text-emerald-800 dark:text-emerald-200">Production cutover completed</div><div className="text-xs text-emerald-700 dark:text-emerald-300 mt-1">Completed {new Date(gates.cutover_completed_at).toLocaleString()}{gates.cutover_completed_by ? ` by ${gates.cutover_completed_by}` : ""}. FleetMaster remains frozen as the retained source archive.</div></div><CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0"/></div><button onClick={()=>runCutoverAction("probe_bouncie")} disabled={!!actionBusy} className="mt-3 px-3 py-2 rounded-lg border border-emerald-300 bg-white text-sm font-medium text-emerald-800 hover:bg-emerald-50 disabled:opacity-50 dark:bg-slate-950 dark:border-emerald-800 dark:text-emerald-200">{actionBusy==="probe_bouncie"?"Checking…":"Run live Bouncie probe"}</button></div> : <div className="mt-4 grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
        <button onClick={()=>runCutoverAction("probe_bouncie")} disabled={!!actionBusy} className="px-3 py-2 rounded-lg border border-gray-300 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:bg-slate-950 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">{actionBusy==="probe_bouncie"?"Checking…":"Run live Bouncie probe"}</button>
        <button onClick={()=>runCutoverAction("confirm_source_freeze")} disabled={!!actionBusy || !!gates.source_freeze_confirmed} className="px-3 py-2 rounded-lg border border-gray-300 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:bg-slate-950 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">{gates.source_freeze_confirmed?"Source freeze confirmed":actionBusy==="confirm_source_freeze"?"Confirming…":"Confirm source freeze"}</button>
        <button onClick={()=>runCutoverAction("enable_notifications")} disabled={!!actionBusy || !gates.source_freeze_confirmed || !!gates.notifications_enabled} className="px-3 py-2 rounded-lg border border-gray-300 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:bg-slate-950 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">{gates.notifications_enabled?"Notifications ON":actionBusy==="enable_notifications"?"Enabling…":"Enable notifications"}</button>
        <button onClick={()=>runCutoverAction("enable_scheduled_reminders")} disabled={!!actionBusy || !gates.notifications_enabled || !!gates.scheduled_reminders_enabled} className="px-3 py-2 rounded-lg border border-gray-300 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:bg-slate-950 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">{gates.scheduled_reminders_enabled?"Scheduled reminders ON":actionBusy==="enable_scheduled_reminders"?"Enabling…":"Enable scheduled reminders"}</button>
        <button onClick={()=>runCutoverAction("enable_maintenance_generation")} disabled={!!actionBusy || !gates.scheduled_reminders_enabled || !!gates.maintenance_generation_enabled} className="px-3 py-2 rounded-lg border border-gray-300 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:bg-slate-950 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">{gates.maintenance_generation_enabled?"Maintenance generation ON":actionBusy==="enable_maintenance_generation"?"Enabling…":"Enable maintenance generation"}</button>
        <button onClick={()=>runCutoverAction("enable_public_reporting")} disabled={!!actionBusy || !gates.maintenance_generation_enabled || !!gates.public_reporting_enabled} className="px-3 py-2 rounded-lg border border-gray-300 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:bg-slate-950 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">{gates.public_reporting_enabled?"Public reporting ON":actionBusy==="enable_public_reporting"?"Enabling…":"Enable public reporting"}</button>
      </div>}
    </div>

    <div className="rounded-xl border border-gray-200 bg-white dark:bg-slate-900 dark:border-slate-800 p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3"><div><h2 className="font-semibold text-gray-900 dark:text-slate-100">Automation Health</h2><p className="text-xs text-gray-500 dark:text-slate-400 mt-1">Durable Fleet-scoped heartbeats and delivery state. Scheduled jobs now leave a summary even when nothing is due.</p></div><Activity className="w-5 h-5 text-gray-400 shrink-0"/></div>
      <div className="mt-4 grid md:grid-cols-2 xl:grid-cols-5 gap-3">
        <AutomationStatus label="Maintenance generation" schedule="Daily · 6:45 AM ET" log={latestAutomation.fleetScheduledMaintenanceGeneration}/>
        <AutomationStatus label="Scheduled reminders" schedule="Daily · 7:00 AM ET" log={latestAutomation.fleetScheduledReminders}/>
        <AutomationStatus label="Notification worker" schedule="Every 10 min · idle heartbeat ≤ 6 hr" log={latestAutomation.fleetNotificationWorker}/>
        <AutomationStatus label="Reminder safety net" schedule="Configured reminder days · after 7:10 AM ET" log={latestAutomation.fleetReminderFallback}/>
        <AutomationStatus label="Bouncie local alerts" schedule="Every 5 min · heartbeat ≤ 6 hr" log={latestAutomation.bouncieSyncNotifications}/>
      </div>
      <div className="mt-4 grid sm:grid-cols-2 gap-3"><HealthCount label="Notification queue unresolved" value={queueUnresolved.length} ok={queueUnresolved.length===0}/><HealthCount label="Operation receipts unresolved" value={receiptUnresolved.length} ok={receiptUnresolved.length===0}/></div>
      {(queueUnresolved.length>0 || receiptUnresolved.length>0) && <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-900 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">Unresolved automation state is intentionally surfaced rather than silently replayed. Ambiguous notification delivery is not automatically resent.</div>}
      <div className="mt-4 pt-4 border-t border-gray-100 dark:border-slate-800">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div><div className="text-sm font-semibold text-gray-900 dark:text-slate-100">Manual automation controls</div><div className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">Runs the same production-gated server functions used by the schedules. Confirmation is required because these actions can create Fleet work orders or send reminder email.</div></div>
          <div className="flex flex-col sm:flex-row gap-2 shrink-0">
            <button onClick={()=>{setManualError("");setManualResult("");setManualAction("maintenance");}} disabled={!!manualBusy || !gates.maintenance_generation_enabled} className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-indigo-300 text-sm font-medium text-indigo-700 disabled:opacity-50 dark:border-indigo-800 dark:text-indigo-300"><Play className="w-4 h-4"/>Run generation now</button>
            <button onClick={()=>{setManualError("");setManualResult("");setManualAction("reminders");}} disabled={!!manualBusy || !gates.scheduled_reminders_enabled || !gates.notifications_enabled} className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-indigo-300 text-sm font-medium text-indigo-700 disabled:opacity-50 dark:border-indigo-800 dark:text-indigo-300"><Mail className="w-4 h-4"/>Run reminders now</button>
          </div>
        </div>
        {manualResult && <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">{manualResult}</div>}
        {manualError && <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">{manualError}</div>}
      </div>
    </div>

    <div className="rounded-xl border border-gray-200 bg-white dark:bg-slate-900 dark:border-slate-800 p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div><h2 className="font-semibold text-gray-900 dark:text-slate-100">Public Work Order Submission</h2><p className="text-xs text-gray-500 dark:text-slate-400 mt-1">Exact legacy FleetMaster QR preserved for existing equipment labels and printed materials.</p></div>
        <QrCode className="w-5 h-5 text-gray-400 shrink-0"/>
      </div>
      <div className="mt-4 flex flex-col sm:flex-row gap-4 sm:items-center">
        <div className="rounded-lg border border-gray-200 bg-white p-3 shrink-0">
          <img src={LEGACY_FLEET_QR_DISPLAY_SRC} width="200" height="200" alt="Original FleetMaster Public Report QR Code" className="block w-[200px] h-[200px]"/>
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-gray-900 dark:text-slate-100">Original QR destination</div>
          <div className="mt-1 text-xs text-gray-500 dark:text-slate-400 break-all">{LEGACY_FLEET_PUBLIC_REPORT_URL}</div>
          <p className="mt-3 text-xs text-gray-600 dark:text-slate-300">This QR intentionally keeps the original FleetMaster URL. That legacy route forwards scans into CCS Fleet reporting, so old and newly printed copies use the same QR identity without writing back to the frozen FleetMaster database.</p>
          <div className="mt-4 flex flex-col sm:flex-row gap-2">
            <button type="button" onClick={copyLegacyQrUrl} className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-gray-300 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 dark:bg-slate-950 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"><Copy className="w-4 h-4"/>{qrCopied ? "Copied" : "Copy QR URL"}</button>
            <button type="button" onClick={downloadLegacyQr} className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-indigo-300 bg-indigo-50 text-sm font-medium text-indigo-700 hover:bg-indigo-100 dark:bg-indigo-950/40 dark:border-indigo-800 dark:text-indigo-200 dark:hover:bg-indigo-950/60"><Download className="w-4 h-4"/>Download QR Code</button>
          </div>
        </div>
      </div>
    </div>

    <IntegrityPanel data={integrity} busy={integrityBusy} onRefresh={runIntegrityAudit} />

    {connection?.needsReconnect && <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-800 p-4 flex gap-3"><AlertTriangle className="w-5 h-5 text-red-600 shrink-0"/><div><div className="font-semibold text-red-800 dark:text-red-200">Bouncie administrator reconnect required</div><p className="text-sm text-red-700 dark:text-red-300 mt-1">The stored refresh credential was rejected. Webhooks may continue independently, but Fleet Tracking REST vehicles/trips must be reauthorized from the Tracking page to restore full Fleet tracking.</p></div></div>}

    {oldUrl && <div className="rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 p-4 flex gap-3"><AlertTriangle className="w-5 h-5 text-amber-600 shrink-0"/><div><div className="font-semibold text-amber-800 dark:text-amber-200">Legacy FleetMaster URL still preserved in a template</div><p className="text-sm text-amber-700 dark:text-amber-300 mt-1">Notifications are live. Update this template immediately so future Fleet messages do not send users to the retired FleetMaster route.</p></div></div>}

    {settings ? <div className="grid md:grid-cols-2 gap-4">
      <Card title="Production Gates"><Row label="FleetMaster source freeze" value={gates.source_freeze_confirmed ? `CONFIRMED${gates.source_freeze_confirmed_at?` · ${new Date(gates.source_freeze_confirmed_at).toLocaleString()}`:""}` : "NOT CONFIRMED"}/><Row label="Maintenance generation" value={gates.maintenance_generation_enabled ? "ON" : "OFF"}/><Row label="Operational notifications" value={gates.notifications_enabled ? "ON" : "OFF"}/><Row label="Scheduled reminders" value={gates.scheduled_reminders_enabled ? "ON" : "OFF"}/><Row label="Public reporting" value={gates.public_reporting_enabled ? "ON" : "OFF"}/></Card>
      <Card title="Company & Fleet URL"><Row label="Company name" value={settings.company_name}/><Row label="Fleet URL" value={settings.fleet_app_base_url}/><Row label="Setting type" value={settings.setting_type}/></Card>
      <Card title="Reminder Schedule"><Row label="Items on order" value={(settings.item_order_reminder_days||[]).join(", ")||"Disabled"}/><Row label="Open work orders" value={(settings.open_work_order_reminder_days||[]).join(", ")||"Disabled"}/></Card>
      <Card title="Notification Recipients"><Recipient label="New work orders" values={settings.work_order_creation_emails}/><Recipient label="Completed work orders" values={settings.work_order_completed_emails}/><Recipient label="Low stock" values={settings.low_stock_emails}/><Recipient label="Requests" values={settings.request_emails}/><Recipient label="Parts received" values={settings.parts_received_emails}/></Card>
      <Card title="Reminder Recipients"><Recipient label="Items on order" values={settings.item_order_reminder_emails}/><Recipient label="Open work orders" values={settings.open_work_order_reminder_emails}/><Recipient label="System reports" values={settings.report_emails}/></Card>
      <Card title="Migration Verification"><Row label="Latest audit" value={audit?.run_key}/><Row label="Audit status" value={audit?.status}/><Row label="Delta records migrated" value={audit?.summary?.delta_records_migrated ?? "—"}/></Card>
      <div className="md:col-span-2"><Card title="Templates"><Row label="New WO subject" value={settings.email_subject_template}/><Row label="Completed WO subject" value={settings.email_completed_subject_template}/><Row label="Items reminder subject" value={settings.item_order_reminder_subject_template}/><Row label="Open WO reminder subject" value={settings.open_work_order_reminder_subject_template}/></Card></div>
    </div> : <div className="rounded-xl border border-gray-200 bg-white dark:bg-slate-900 dark:border-slate-800 p-8 text-center text-gray-500">No Fleet settings record found.</div>}
    <FleetSettingsEditor open={editorOpen} settings={settings} onClose={()=>setEditorOpen(false)} onSaved={(updated)=>{ if(updated) setSettings(updated); runServerCheck(); }}/>
    <FleetConfirmDialog
      open={!!manualAction}
      title={manualAction==="maintenance"?"Run Fleet maintenance generation now?":"Run Fleet reminders now?"}
      description={manualAction==="maintenance"?"This runs the same guarded production generator used at 6:45 AM ET. It may create FleetMaintenanceWorkOrder records for schedules due today or earlier. Existing generation keys, receipts, and active-work checks prevent duplicate maintenance work orders.":"This runs the same guarded reminder check used at 7:00 AM ET. If today is a configured reminder day, it may queue and send Fleet reminder emails. Existing per-day/per-recipient keys prevent duplicate digests."}
      confirmLabel={manualAction==="maintenance"?"Run Generation":"Run Reminders"}
      tone="warning"
      busy={!!manualBusy}
      onCancel={()=>!manualBusy&&setManualAction(null)}
      onConfirm={runManualAutomation}
    />
  </div></div>;
}

function Card({title,children}){return <div className="rounded-xl border border-gray-200 bg-white dark:bg-slate-900 dark:border-slate-800 p-4 shadow-sm"><h2 className="font-semibold text-gray-900 dark:text-slate-100 mb-3">{title}</h2><div className="space-y-3">{children}</div></div>}
function Row({label,value}){return <div><div className="text-xs text-gray-400">{label}</div><div className="text-sm text-gray-800 dark:text-slate-200 mt-0.5 whitespace-pre-wrap break-words">{value === 0 ? "0" : value || "—"}</div></div>}
function Recipient({label,values}){return <Row label={label} value={(values||[]).map(v=>`${v.email}${v.delay_minutes!=null?` (${v.delay_minutes}m)`:""}`).join(", ")||"None"}/>} 
function AutomationStatus({label,schedule,log}){const tone=log?.level==="error"?"border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/20":log?.level==="warning"?"border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/20":"border-gray-200 bg-gray-50 dark:border-slate-800 dark:bg-slate-950/40";const details=log?.details||{};const summary=log?.source==="fleetScheduledMaintenanceGeneration"?`due ${details.due??"—"} · created ${details.created??"—"} · errors ${details.errors??0}`:log?.source==="fleetScheduledReminders"?`queued ${details.queued??"—"} · reused ${details.reused??"—"}`:log?.source==="fleetNotificationWorker"?`processed ${details.processed??0} · sent ${details.sent??0} · failed ${details.failed??0}`:log?.source==="bouncieSyncNotifications"?`vehicles ${details.vehicles??"—"} · rules ${details.configured_rules??0} · alerts ${details.created??0}`:"";return <div className={`rounded-lg border p-3 ${tone}`}><div className="font-medium text-sm text-gray-900 dark:text-slate-100">{label}</div><div className="text-xs text-gray-400 mt-0.5">{schedule}</div>{log?<><div className="text-xs text-gray-600 dark:text-slate-300 mt-2">Last: {new Date(log.created_date).toLocaleString()} · {log.level}</div><div className="text-xs text-gray-500 dark:text-slate-400 mt-1">{summary||log.message}</div></>:<div className="text-xs text-gray-500 dark:text-slate-400 mt-2">Awaiting first production heartbeat.</div>}</div>}
function HealthCount({label,value,ok}){return <div className={`rounded-lg border px-3 py-2 ${ok?"border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/20":"border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/20"}`}><div className="text-xs text-gray-500 dark:text-slate-400">{label}</div><div className={`text-lg font-bold mt-0.5 ${ok?"text-emerald-700 dark:text-emerald-300":"text-amber-700 dark:text-amber-300"}`}>{value}</div></div>}

function IntegrityPanel({data,busy,onRefresh}) {
  const summary=data?.summary||{};
  const findings=data?.findings||[];
  const health=summary.health||"unknown";
  const tone=health==="error"?"border-red-200 dark:border-red-900":health==="warning"?"border-amber-200 dark:border-amber-900":"border-emerald-200 dark:border-emerald-900";
  return <div className={`rounded-xl border bg-white dark:bg-slate-900 p-4 shadow-sm ${tone}`}>
    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
      <div><h2 className="font-semibold text-gray-900 dark:text-slate-100">Fleet Data Integrity</h2><p className="text-xs text-gray-500 dark:text-slate-400 mt-1">Read-only relationship and inventory audit. Preserved historical findings are surfaced, never auto-repaired.</p></div>
      <button onClick={onRefresh} disabled={busy} className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-gray-300 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:bg-slate-950 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">{busy?<Loader2 className="w-4 h-4 animate-spin"/>:<RefreshCw className="w-4 h-4"/>}Run integrity audit</button>
    </div>
    {data ? <>
      <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
        <IntegrityMetric label="Errors" value={summary.error_count||0} tone="error"/>
        <IntegrityMetric label="Warnings" value={summary.warning_count||0} tone="warning"/>
        <IntegrityMetric label="Informational" value={summary.info_count||0} tone="info"/>
        <IntegrityMetric label="Finding groups" value={summary.finding_groups||0} tone="neutral"/>
      </div>
      {findings.length ? <div className="mt-4 space-y-3">{findings.map((finding)=><IntegrityFinding key={finding.code} finding={finding}/>)}</div> : <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/20 px-3 py-3 text-sm text-emerald-800 dark:text-emerald-200">No integrity findings were detected.</div>}
      <div className="mt-3 text-[11px] text-gray-400">Last generated: {data.generated_at?new Date(data.generated_at).toLocaleString():"—"}</div>
    </> : <div className="mt-4 text-sm text-gray-500 dark:text-slate-400">Integrity audit has not completed yet.</div>}
  </div>;
}

function IntegrityMetric({label,value,tone}) {
  const cls=tone==="error"?"text-red-700 dark:text-red-300":tone==="warning"?"text-amber-700 dark:text-amber-300":tone==="info"?"text-blue-700 dark:text-blue-300":"text-gray-800 dark:text-slate-200";
  return <div className="rounded-lg border border-gray-200 bg-gray-50 dark:border-slate-800 dark:bg-slate-950/40 px-3 py-2"><div className="text-xs text-gray-500 dark:text-slate-400">{label}</div><div className={`text-lg font-bold mt-0.5 ${cls}`}>{value}</div></div>;
}

function IntegrityFinding({finding}) {
  const cls=finding.severity==="error"?"border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/20":finding.severity==="warning"?"border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/20":"border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/20";
  return <details className={`rounded-lg border px-3 py-2 ${cls}`}>
    <summary className="cursor-pointer text-sm font-medium text-gray-900 dark:text-slate-100">{finding.title} <span className="text-xs font-normal text-gray-500 dark:text-slate-400">({finding.count})</span></summary>
    <p className="mt-2 text-xs text-gray-600 dark:text-slate-300">{finding.description}</p>
    {!!finding.items?.length && <div className="mt-2 space-y-1">{finding.items.map((item,index)=><div key={`${finding.code}-${index}`} className="rounded bg-white/70 dark:bg-slate-950/50 px-2 py-1 text-[11px] text-gray-600 dark:text-slate-300 break-all">{integrityItemText(item)}</div>)}</div>}
  </details>;
}

function integrityItemText(item) {
  if (!item || typeof item!=="object") return String(item||"");
  return Object.entries(item).map(([key,value])=>`${key}: ${Array.isArray(value)?JSON.stringify(value):String(value??"")}`).join(" · ");
}

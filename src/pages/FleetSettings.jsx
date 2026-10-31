import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { createPageUrl } from "@/utils";
import FleetModuleNav from "@/components/fleet/FleetModuleNav";
import FleetSettingsEditor from "@/components/fleet/FleetSettingsEditor";
import FleetRepairApprovalPolicies from "@/components/fleet/FleetRepairApprovalPolicies";
import FleetConfirmDialog from "@/components/fleet/FleetConfirmDialog";
import { filterAllFleetRows, listAllFleetRows, readFleetRows } from "@/components/fleet/fleetEntityLoaders";
import { useAuth, getSessionUser } from "@/components/auth/EmailGate";
import { Settings, Loader2, ShieldCheck, AlertTriangle, CheckCircle2, XCircle, RefreshCw, Activity, Pencil, Play, Mail, Copy, Download, QrCode, Link2, UserCog, Ban } from "lucide-react";
import { invokeFleet } from "@/components/fleet/fleetInvoke";

const LEGACY_FLEET_PUBLIC_REPORT_URL = "https://app--ccsfleet-master-db95ea70.base44.app/PublicReport";
const LEGACY_FLEET_QR_DISPLAY_SRC = "/fleet/fleetmaster-public-report-qr-200.png";
const LEGACY_FLEET_QR_DOWNLOAD_SRC = "/fleet/fleetmaster-public-report-qr-400.png";
const AUTOMATION_SOURCES = ["fleetScheduledMaintenanceGeneration", "fleetScheduledReminders", "fleetNotificationWorker", "fleetReminderFallback", "bouncieSyncNotifications"];

async function loadAutomationHealthData() {
  // One $in query per entity keeps entity_list volume low; consumers already
  // select by source/status, and the -created_date sort preserves latest-first.
  const [logs, notifications, receipts] = await Promise.all([
    readFleetRows("FleetSystemLog", { query: { source: { $in: AUTOMATION_SOURCES } }, sort: "-created_date", limit: 500 }),
    filterAllFleetRows("FleetNotificationQueue", { status: { $in: ["pending", "sending", "failed"] } }, "-created_date", { label: "Unresolved Fleet notifications" }),
    filterAllFleetRows("FleetOperationReceipt", { status: { $in: ["started", "failed"] } }, "-created_date", { label: "Unresolved Fleet operation receipts" }),
  ]);
  return {
    logs: logs || [],
    notifications: notifications || [],
    receipts: receipts || [],
  };
}

export default function FleetSettings({ embedded = false }) {
  const { sessionToken } = useAuth();
  const [user, setUser] = useState(null);
  const [bouncieReconnectBusy, setBouncieReconnectBusy] = useState(false);
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
  const [mechanicLinks, setMechanicLinks] = useState([]);
  const [mechanicName, setMechanicName] = useState("External Mechanic");
  const [mechanicExpiryDays, setMechanicExpiryDays] = useState("0");
  const [mechanicAllowEstimates, setMechanicAllowEstimates] = useState(false);
  const [mechanicScopeMode, setMechanicScopeMode] = useState("all_active");
  const [mechanicEquipmentIds, setMechanicEquipmentIds] = useState([]);
  const [mechanicEquipment, setMechanicEquipment] = useState([]);
  const [mechanicScopeEdit, setMechanicScopeEdit] = useState(null);
  const [generatedMechanicLink, setGeneratedMechanicLink] = useState("");
  const [mechanicBusy, setMechanicBusy] = useState("");
  const [mechanicError, setMechanicError] = useState("");
  const [mechanicNotice, setMechanicNotice] = useState("");
  const [mechanicCopied, setMechanicCopied] = useState(false);
  const [mechanicRevoke, setMechanicRevoke] = useState(null);
  const [loading, setLoading] = useState(true);
  const checkSequenceRef = useRef(0);
  const integritySequenceRef = useRef(0);

  useEffect(() => {
    (async () => {
      try {
        const u = getSessionUser();
        setUser(u);
        if (u?.role === "admin") {
          const [settingsRows, bouncieStatusResult, auditRows, statusResult, integrityResult, health, mechanicResult, mechanicEquipmentRows] = await Promise.all([
            readFleetRows("FleetSettings", { sort: "-updated_date", limit: 10 }),
            base44.functions.invoke("bouncieStatus", { session_token: sessionToken }).catch(() => null),
            readFleetRows("FleetMigrationAudit", { sort: "-created_date", limit: 20 }),
            invokeFleet("fleetCutoverControl", { action: "status" }).catch(() => null),
            invokeFleet("fleetIntegrityAudit", {}).catch(() => null),
            loadAutomationHealthData(),
            invokeFleet("fleetMechanicPortal", { action: "admin_list_links" }).catch(() => null),
            listAllFleetRows("FleetEquipment", "name", { label: "Fleet mechanic scope equipment" }).catch(() => []),
          ]);
          setSettings((settingsRows || [])[0] || null);
          setConnection(bouncieStatusResult?.data || null);
          setAudit((auditRows || []).find((row) => row.mode === "verification") || (auditRows || [])[0] || null);
          setServerStatus(statusResult?.data || null);
          setIntegrity(integrityResult?.data || null);
          setAutomationLogs((health.logs || []).filter(row => AUTOMATION_SOURCES.includes(row.source)));
          setQueueRows(health.notifications || []);
          setReceiptRows(health.receipts || []);
          setMechanicLinks(mechanicResult?.data?.links || []);
          setMechanicEquipment(mechanicEquipmentRows || []);
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
      { label: "Fleet migration snapshot reconciled", ok: !!(audit?.summary?.migration_snapshot_reconciled || audit?.summary?.migration_reconciled), detail: audit?.run_key || "No verification audit found" },
      { label: "CCS Fleet production URL configured", ok: !!settings.fleet_app_base_url, detail: settings.fleet_app_base_url || "Not configured" },
      { label: "FleetMaster source freeze confirmed", ok: !!settings.source_freeze_confirmed, detail: settings.source_freeze_confirmed_at || "Not yet frozen" },
      { label: "Bouncie webhook active", ok: !!connection?.webhookActive, detail: connection?.lastWebhookAt ? `Last event ${new Date(connection.lastWebhookAt).toLocaleString()}` : "No recent webhook timestamp" },
      { label: "Bouncie REST authorization healthy", ok: !!connection?.connected && !connection.needsReconnect, detail: connection?.needsReconnect ? "Administrator OAuth reconnect required" : "No reconnect flag" },
    ];
  }, [settings, connection, audit, serverStatus]);

  const featureSetup = useMemo(() => {
    const totals = integrity?.summary?.totals || {};
    const activeMechanicLinks = mechanicLinks.filter(link => link.enabled !== false && (!link.expires_at || Date.parse(link.expires_at) > Date.now()));
    return [
      {
        key: "inspection_templates",
        label: "Inspection Templates",
        state: Number(totals.inspection_templates || 0) > 0 ? "configured" : "needs_setup",
        value: Number(totals.inspection_templates || 0),
        detail: Number(totals.inspection_templates || 0) > 0 ? `${totals.inspection_templates} template${Number(totals.inspection_templates) === 1 ? "" : "s"} configured.` : "Create at least one checklist before employees can run inspections.",
        actionLabel: "Open Inspections",
        to: createPageUrl("FleetInspections"),
      },
      {
        key: "meter_rules",
        label: "Mileage / Hour Maintenance",
        state: Number(totals.meter_rules || 0) > 0 ? "configured" : "needs_setup",
        value: Number(totals.meter_rules || 0),
        detail: Number(totals.meter_rules || 0) > 0 ? `${totals.meter_rules} meter rule${Number(totals.meter_rules) === 1 ? "" : "s"} configured.` : "Date-based maintenance still works. Add meter rules only to assets that need mileage/hour service intervals.",
        actionLabel: "Open Maintenance",
        to: createPageUrl("FleetMaintenance"),
      },
      {
        key: "approval_policies",
        label: "Repair Approval Thresholds",
        state: Number(totals.repair_approval_policies || 0) > 0 ? "configured" : "needs_setup",
        value: Number(totals.repair_approval_policies || 0),
        detail: Number(totals.repair_approval_policies || 0) > 0 ? `${totals.repair_approval_policies} approval polic${Number(totals.repair_approval_policies) === 1 ? "y" : "ies"} configured.` : "No dollar thresholds are configured yet. Estimates without a required policy follow the existing no-threshold approval behavior.",
        actionLabel: "Configure Thresholds",
        href: "#repair-approval-policies",
      },
      {
        key: "lifecycle",
        label: "Lifecycle / Replacement Planning",
        state: Number(totals.lifecycle_profiles || 0) > 0 ? "in_use" : "ready",
        value: Number(totals.lifecycle_profiles || 0),
        detail: Number(totals.lifecycle_profiles || 0) > 0 ? `${totals.lifecycle_profiles} asset plan${Number(totals.lifecycle_profiles) === 1 ? "" : "s"} entered.` : "Ready. Add acquisition cost, replacement targets, and budget only where CCS wants planning data.",
        actionLabel: "Open Analytics",
        to: createPageUrl("FleetAnalytics"),
      },
      {
        key: "warranties",
        label: "Warranty Tracking",
        state: Number(totals.warranties || 0) > 0 ? "in_use" : "ready",
        value: Number(totals.warranties || 0),
        detail: Number(totals.warranties || 0) > 0 ? `${totals.warranties} warrant${Number(totals.warranties) === 1 ? "y" : "ies"} tracked.` : "Ready for real vehicle/component coverage. No placeholder warranties are required.",
        actionLabel: "Open Warranties",
        to: createPageUrl("FleetWarranties"),
      },
      {
        key: "fuel",
        label: "Fuel & Operating Cost",
        state: Number(totals.fuel_entries || 0) > 0 ? "in_use" : "ready",
        value: Number(totals.fuel_entries || 0),
        detail: Number(totals.fuel_entries || 0) > 0 ? `${totals.fuel_entries} fuel entr${Number(totals.fuel_entries) === 1 ? "y" : "ies"} recorded.` : "Ready for manual entry or reviewed CSV import. No fake fill-ups were seeded.",
        actionLabel: "Open Fuel",
        to: createPageUrl("FleetFuel"),
      },
      {
        key: "reservations",
        label: "Reservations & Assignments",
        state: Number(totals.reservations || 0) > 0 ? "in_use" : "ready",
        value: Number(totals.reservations || 0),
        detail: Number(totals.reservations || 0) > 0 ? `${totals.reservations} reservation record${Number(totals.reservations) === 1 ? "" : "s"} preserved.` : "Ready for real bookings. Server overlap protection is already active.",
        actionLabel: "Open Assignments",
        to: createPageUrl("FleetReservations"),
      },
      {
        key: "parts_ai",
        label: "AI Parts Identification",
        state: Number(totals.part_identifications || 0) > 0 ? "in_use" : "ready",
        value: Number(totals.part_identifications || 0),
        detail: Number(totals.part_identifications || 0) > 0 ? `${totals.part_identifications} identification session${Number(totals.part_identifications) === 1 ? "" : "s"} recorded.` : "Ready for photo, barcode, part-number, and text lookup from the Fleet Parts room workflow.",
        actionLabel: "Open Parts",
        to: createPageUrl("FleetParts"),
      },
      {
        key: "dashboard",
        label: "Personal Dashboard Layouts",
        state: Number(totals.dashboard_preferences || 0) > 0 ? "in_use" : "ready",
        value: Number(totals.dashboard_preferences || 0),
        detail: Number(totals.dashboard_preferences || 0) > 0 ? `${totals.dashboard_preferences} user layout${Number(totals.dashboard_preferences) === 1 ? "" : "s"} saved.` : "Ready. Everyone starts with the safe default Overview until they customize their own layout.",
        actionLabel: "Open Overview",
        to: createPageUrl("FleetOverview"),
      },
      {
        key: "mechanic",
        label: "Standalone Mechanic Access",
        state: activeMechanicLinks.length > 0 ? "in_use" : "ready",
        value: activeMechanicLinks.length,
        detail: activeMechanicLinks.length > 0 ? `${activeMechanicLinks.length} active private mechanic link${activeMechanicLinks.length === 1 ? "" : "s"}.` : "Ready if CCS needs outside-mechanic access. No CCS account or app-shell access is required.",
        actionLabel: "Mechanic Access",
        href: "#mechanic-portal",
      },
    ];
  }, [integrity, mechanicLinks]);

  const runServerCheck = async () => {
    const requestSequence = ++checkSequenceRef.current;
    setChecking(true);
    try {
      const { data } = await invokeFleet("fleetCutoverControl", { action: "status" });
      if (requestSequence !== checkSequenceRef.current) return;
      setServerStatus(data || null);
      const [settingsRows, bouncieStatusResult, health, mechanicResult, mechanicEquipmentRows] = await Promise.all([
        readFleetRows("FleetSettings", { sort: "-updated_date", limit: 10 }),
        base44.functions.invoke("bouncieStatus", { session_token: sessionToken }).catch(() => null),
        loadAutomationHealthData(),
        invokeFleet("fleetMechanicPortal", { action: "admin_list_links" }).catch(() => null),
        listAllFleetRows("FleetEquipment", "name", { label: "Fleet mechanic scope equipment" }).catch(() => []),
      ]);
      if (requestSequence !== checkSequenceRef.current) return;
      setSettings((settingsRows || [])[0] || null);
      setConnection(bouncieStatusResult?.data || null);
      setAutomationLogs((health.logs || []).filter(row => AUTOMATION_SOURCES.includes(row.source)));
      setQueueRows(health.notifications || []);
      setReceiptRows(health.receipts || []);
      setMechanicLinks(mechanicResult?.data?.links || []);
      setMechanicEquipment(mechanicEquipmentRows || []);
    } finally {
      if (requestSequence === checkSequenceRef.current) setChecking(false);
    }
  };

  const runIntegrityAudit = async () => {
    const requestSequence = ++integritySequenceRef.current;
    setIntegrityBusy(true);
    try {
      const { data } = await invokeFleet("fleetIntegrityAudit", {});
      if (requestSequence !== integritySequenceRef.current) return;
      setIntegrity(data || null);
    } finally {
      if (requestSequence === integritySequenceRef.current) setIntegrityBusy(false);
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
      const { data } = await invokeFleet(functionName, {});
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

  const createMechanicLink = async () => {
    setMechanicBusy("create");
    setMechanicError("");
    setGeneratedMechanicLink("");
    try {
      const { data } = await invokeFleet("fleetMechanicPortal", { action: "admin_create_link", name: mechanicName.trim() || "External Mechanic", expires_in_days: Number(mechanicExpiryDays || 0), allow_estimates: mechanicAllowEstimates, scope_mode: mechanicScopeMode, allowed_equipment_ids: mechanicScopeMode === "selected_equipment" ? mechanicEquipmentIds : [] });
      if (data?.error || !data?.token) throw new Error(data?.error || "Mechanic access link was not generated.");
      setGeneratedMechanicLink(`${window.location.origin}/FleetMechanic#${data.token}`);
      const listed = await invokeFleet("fleetMechanicPortal", { action: "admin_list_links" });
      setMechanicLinks(listed?.data?.links || []);
    } catch (error) {
      setMechanicError(error?.message || "Mechanic access link could not be created.");
    } finally {
      setMechanicBusy("");
    }
  };

  const revokeMechanicLink = async (id) => {
    setMechanicBusy(id);
    setMechanicError("");
    setMechanicNotice("");
    try {
      const { data } = await invokeFleet("fleetMechanicPortal", { action: "admin_revoke_link", id });
      if (data?.error) throw new Error(data.error);
      setMechanicLinks(data?.links || []);
      setGeneratedMechanicLink("");
      setMechanicRevoke(null);
      if (Number(data?.reconciled_applied || 0) || Number(data?.reconciled_cancelled || 0)) setMechanicNotice(`Link revoked. ${Number(data?.reconciled_applied || 0)} in-flight mechanic operation(s) were confirmed applied and ${Number(data?.reconciled_cancelled || 0)} were closed without replay.`);
      await runServerCheck();
      await runIntegrityAudit();
    } catch (error) {
      setMechanicError(error?.message || "Mechanic access link could not be revoked.");
    } finally {
      setMechanicBusy("");
    }
  };

  const reconcileMechanicReceipt = async (receipt) => {
    if (!receipt?.id) return;
    setMechanicBusy(`receipt-${receipt.id}`);
    setMechanicError("");
    setMechanicNotice("");
    try {
      const { data } = await invokeFleet("fleetMechanicPortal", { action: "admin_reconcile_mechanic_mutation", receipt_id: receipt.id });
      if (data?.error) throw new Error(data.error);
      setMechanicNotice(data?.status === "applied"
        ? "Mechanic operation confirmed and reconciled as applied. The bearer link was not re-enabled."
        : `Mechanic operation closed without replay${data?.error_message ? `: ${data.error_message}` : "."}`);
      await runServerCheck();
      await runIntegrityAudit();
    } catch (error) {
      setMechanicError(error?.message || "Mechanic operation receipt could not be reconciled.");
    } finally {
      setMechanicBusy("");
    }
  };

  const setMechanicEstimatePermission = async (link, allowEstimates) => {
    setMechanicBusy(`estimate-${link.id}`);
    setMechanicError("");
    try {
      const { data } = await invokeFleet("fleetMechanicPortal", { action: "admin_update_estimate_permission", id: link.id, allow_estimates: allowEstimates });
      if (data?.error) throw new Error(data.error);
      setMechanicLinks(current => current.map(row => row.id === link.id ? data.link : row));
    } catch (error) {
      setMechanicError(error?.message || "Mechanic estimate permission could not be changed.");
    } finally {
      setMechanicBusy("");
    }
  };

  const saveMechanicScope = async () => {
    if (!mechanicScopeEdit?.id) return;
    setMechanicBusy(`scope-${mechanicScopeEdit.id}`);
    setMechanicError("");
    try {
      const { data } = await invokeFleet("fleetMechanicPortal", { action: "admin_update_scope", id: mechanicScopeEdit.id, scope_mode: mechanicScopeEdit.scope_mode, allowed_equipment_ids: mechanicScopeEdit.scope_mode === "selected_equipment" ? mechanicScopeEdit.allowed_equipment_ids : [] });
      if (data?.error) throw new Error(data.error);
      setMechanicLinks(current => current.map(row => row.id === mechanicScopeEdit.id ? data.link : row));
      setMechanicScopeEdit(null);
    } catch (error) {
      setMechanicError(error?.message || "Mechanic work scope could not be changed.");
    } finally {
      setMechanicBusy("");
    }
  };

  const copyMechanicLink = async () => {
    if (!generatedMechanicLink) return;
    try {
      await navigator.clipboard.writeText(generatedMechanicLink);
      setMechanicCopied(true);
      window.setTimeout(() => setMechanicCopied(false), 1500);
    } catch {
      setMechanicCopied(false);
    }
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
      const { data } = await invokeFleet("fleetCutoverControl", payload);
      if (data?.error) throw new Error(data.error);
      await runServerCheck();
    } catch (error) {
      setActionError(error?.message || "Cutover action failed.");
    } finally {
      setActionBusy("");
    }
  };

  const reconnectBouncie = async () => {
    setBouncieReconnectBusy(true);
    setActionError("");
    try {
      const { data } = await base44.functions.invoke("bouncieAuthInitiate", { session_token: sessionToken });
      if (data?.authUrl) {
        window.location.href = data.authUrl;
        return;
      }
      setActionError(data?.error || "Bouncie authorization could not be started. You can also reconnect from the Fleet Tracking page.");
    } catch (error) {
      setActionError(error?.message || "Bouncie authorization could not be started. You can also reconnect from the Fleet Tracking page.");
    } finally {
      setBouncieReconnectBusy(false);
    }
  };

  if (loading) return embedded
    ? <div className="flex min-h-[16rem] items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-gray-400"/></div>
    : <div className="h-full flex flex-col bg-gray-50 dark:bg-slate-950"><FleetModuleNav/><div className="flex-1 flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-gray-400"/></div></div>;
  if (user?.role !== "admin") {
    const gate = <div className="rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 p-5"><div className="flex items-center gap-2 font-semibold text-amber-800 dark:text-amber-200"><ShieldCheck className="w-5 h-5"/>Admin access required</div><p className="text-sm text-amber-700 dark:text-amber-300 mt-2">Fleet administration is protected by CCS authentication and RLS. The legacy FleetMaster Settings password is not used here.</p></div>;
    return embedded ? gate : <div className="min-h-full bg-gray-50 dark:bg-slate-950"><FleetModuleNav/><div className="max-w-3xl mx-auto p-6">{gate}</div></div>;
  }

  const oldUrl = settings?.email_body_template?.includes("ccsfleet-master") || settings?.email_body_template?.includes("68accb163a1b474cdb95ea70");
  const latestAutomation = Object.fromEntries(AUTOMATION_SOURCES.map(source => [source, automationLogs.find(row => row.source === source) || null]));
  const queueUnresolved = queueRows.filter(row => ["pending","sending","failed"].includes(row.status));
  const receiptUnresolved = receiptRows.filter(row => ["started","failed"].includes(row.status));
  const mechanicReceiptUnresolved = receiptUnresolved.filter(row => ["mechanic_start","mechanic_progress_save"].includes(row.operation_type));
  const blocked = readiness.some((item) => !item.ok);
  const setupNeedsCount = featureSetup.filter(item => item.state === "needs_setup").length;
  const setupUsableCount = featureSetup.length - setupNeedsCount;
  const gates = serverStatus?.cutover || settings || {};
  const cutoverComplete = !!gates.cutover_completed_at && !!gates.notifications_enabled && !!gates.scheduled_reminders_enabled && !!gates.maintenance_generation_enabled && !!gates.public_reporting_enabled;

  return <div className={embedded ? "w-full min-w-0" : "min-h-full bg-gray-50 dark:bg-slate-950"}>{embedded ? null : <FleetModuleNav/>}<div className={embedded ? "space-y-5" : "max-w-5xl mx-auto p-4 sm:p-6 space-y-5"}>
    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3"><div><h1 className="text-2xl font-bold text-gray-900 dark:text-slate-100 flex items-center gap-2"><Settings className="w-6 h-6"/>Fleet Settings</h1><p className="text-sm text-gray-500 dark:text-slate-400">CCS Fleet operations health, production gates, notification configuration, and migration safety records.</p></div><div className="flex flex-col sm:flex-row gap-2"><button type="button" onClick={()=>setEditorOpen(true)} disabled={!settings} className="min-h-11 inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-indigo-300 bg-indigo-50 text-sm font-medium text-indigo-700 hover:bg-indigo-100 disabled:opacity-50 dark:bg-indigo-950/40 dark:border-indigo-800 dark:text-indigo-200 dark:hover:bg-indigo-950/60"><Pencil className="w-4 h-4"/>Edit notifications & reminders</button><button type="button" onClick={runServerCheck} disabled={checking} className="min-h-11 inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-gray-300 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">{checking?<Loader2 className="w-4 h-4 animate-spin"/>:<RefreshCw className="w-4 h-4"/>}Refresh operations health</button></div></div>

    <nav aria-label="Fleet Settings sections" className={`sticky ${embedded ? "top-0" : "top-[69px] lg:top-[61px]"} z-20 -mx-1 rounded-xl border border-gray-200 bg-white/95 p-1.5 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-900/95 overflow-x-auto overscroll-x-contain`}>
      <div className="flex min-w-max gap-1">
        <a href="#fleet-feature-setup" className="min-h-11 px-3 rounded-lg inline-flex items-center gap-2 text-sm font-semibold text-gray-700 hover:bg-gray-100 dark:text-slate-200 dark:hover:bg-slate-800">Setup{setupNeedsCount>0&&<span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-800 dark:bg-amber-950 dark:text-amber-300">{setupNeedsCount}</span>}</a>
        <a href="#fleet-production-controls" className="min-h-11 px-3 rounded-lg inline-flex items-center text-sm font-semibold text-gray-700 hover:bg-gray-100 dark:text-slate-200 dark:hover:bg-slate-800">Production</a>
        <a href="#repair-approval-policies" className="min-h-11 px-3 rounded-lg inline-flex items-center text-sm font-semibold text-gray-700 hover:bg-gray-100 dark:text-slate-200 dark:hover:bg-slate-800">Approvals</a>
        <a href="#fleet-automation-health" className="min-h-11 px-3 rounded-lg inline-flex items-center gap-2 text-sm font-semibold text-gray-700 hover:bg-gray-100 dark:text-slate-200 dark:hover:bg-slate-800">Automation{queueUnresolved.length+receiptUnresolved.length>0&&<span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-800 dark:bg-amber-950 dark:text-amber-300">{queueUnresolved.length+receiptUnresolved.length}</span>}</a>
        <a href="#mechanic-portal" className="min-h-11 px-3 rounded-lg inline-flex items-center text-sm font-semibold text-gray-700 hover:bg-gray-100 dark:text-slate-200 dark:hover:bg-slate-800">Mechanic</a>
        <a href="#fleet-public-reporting" className="min-h-11 px-3 rounded-lg inline-flex items-center text-sm font-semibold text-gray-700 hover:bg-gray-100 dark:text-slate-200 dark:hover:bg-slate-800">Public QR</a>
        <a href="#fleet-data-integrity" className="min-h-11 px-3 rounded-lg inline-flex items-center text-sm font-semibold text-gray-700 hover:bg-gray-100 dark:text-slate-200 dark:hover:bg-slate-800">Integrity</a>
        <a href="#fleet-config-summary" className="min-h-11 px-3 rounded-lg inline-flex items-center text-sm font-semibold text-gray-700 hover:bg-gray-100 dark:text-slate-200 dark:hover:bg-slate-800">Summary</a>
      </div>
    </nav>

    <div className={`rounded-xl border p-4 ${blocked ? "border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800" : "border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30 dark:border-emerald-800"}`}>
      <div className={`font-semibold ${blocked ? "text-amber-900 dark:text-amber-100" : "text-emerald-900 dark:text-emerald-100"}`}>{blocked ? "Fleet operations need attention" : cutoverComplete ? "Fleet production is live" : "Fleet operational checks are passing"}</div>
      <div className="mt-3 space-y-2">{readiness.map(item => <div key={item.label} className="flex items-start gap-2 text-sm">{item.ok ? <CheckCircle2 className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0"/> : <XCircle className="w-4 h-4 text-red-600 mt-0.5 shrink-0"/>}<div><div className="font-medium text-gray-900 dark:text-slate-100">{item.label}</div><div className="text-xs text-gray-500 dark:text-slate-400 break-all">{item.detail}</div></div></div>)}</div>
    </div>

    <div id="fleet-feature-setup" className="scroll-mt-36 rounded-xl border border-gray-200 bg-white dark:bg-slate-900 dark:border-slate-800 p-4 shadow-sm">
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
        <div><h2 className="font-semibold text-gray-900 dark:text-slate-100">Fleet Feature Setup Readiness</h2><p className="text-xs text-gray-500 dark:text-slate-400 mt-1">Shows what needs real CCS configuration versus what is already ready to use. This section never seeds placeholder production data.</p><div className="mt-2 flex flex-wrap gap-2"><span className={`text-[11px] font-bold rounded-full px-2.5 py-1 ${setupNeedsCount ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300" : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"}`}>{setupNeedsCount} item{setupNeedsCount===1?"":"s"} need CCS setup</span><span className="text-[11px] font-bold rounded-full px-2.5 py-1 bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300">{setupUsableCount} ready / in use</span></div></div>
        <button type="button" onClick={runIntegrityAudit} disabled={integrityBusy} className="min-h-11 px-3 rounded-lg border border-gray-300 bg-white text-sm font-medium inline-flex items-center justify-center gap-2 disabled:opacity-50 dark:bg-slate-950 dark:border-slate-700">{integrityBusy?<Loader2 className="w-4 h-4 animate-spin"/>:<RefreshCw className="w-4 h-4"/>}Refresh Setup Status</button>
      </div>
      <div className="mt-4 grid md:grid-cols-2 gap-3">{featureSetup.map(item => <FeatureSetupCard key={item.key} item={item} />)}</div>
      <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800 dark:border-blue-900 dark:bg-blue-950/20 dark:text-blue-200"><b>Needs setup</b> means the feature requires CCS choices before that specific workflow is useful. <b>Ready</b> means the workflow can be used immediately and zero records is a valid production state.</div>
    </div>

    <div id="fleet-production-controls" className="scroll-mt-36 rounded-xl border border-gray-200 bg-white dark:bg-slate-900 dark:border-slate-800 p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3"><div><h2 className="font-semibold text-gray-900 dark:text-slate-100">Production Controls</h2><p className="text-xs text-gray-500 dark:text-slate-400 mt-1">Admin-only server controls. Production activation is permanent in normal UI use; every action remains validated server-side.</p></div><ShieldCheck className="w-5 h-5 text-gray-400 shrink-0"/></div>
      {actionError && <div className="mt-3 rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-800 px-3 py-2 text-sm text-red-700 dark:text-red-300">{actionError}</div>}
      {cutoverComplete ? <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/30 dark:border-emerald-900 p-3"><div className="flex items-start justify-between gap-3"><div><div className="font-semibold text-emerald-800 dark:text-emerald-200">Production cutover completed</div><div className="text-xs text-emerald-700 dark:text-emerald-300 mt-1">Completed {new Date(gates.cutover_completed_at).toLocaleString()}{gates.cutover_completed_by ? ` by ${gates.cutover_completed_by}` : ""}. FleetMaster remains frozen as the retained source archive.</div></div><CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0"/></div><button type="button" onClick={()=>runCutoverAction("probe_bouncie")} disabled={!!actionBusy} className="mt-3 min-h-11 px-3 py-2 rounded-lg border border-emerald-300 bg-white text-sm font-medium text-emerald-800 hover:bg-emerald-50 disabled:opacity-50 dark:bg-slate-950 dark:border-emerald-800 dark:text-emerald-200">{actionBusy==="probe_bouncie"?"Checking…":"Run live Bouncie probe"}</button></div> : <div className="mt-4 grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
        <button type="button" onClick={()=>runCutoverAction("probe_bouncie")} disabled={!!actionBusy} className="min-h-11 px-3 py-2 rounded-lg border border-gray-300 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:bg-slate-950 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">{actionBusy==="probe_bouncie"?"Checking…":"Run live Bouncie probe"}</button>
        <button type="button" onClick={()=>runCutoverAction("confirm_source_freeze")} disabled={!!actionBusy || !!gates.source_freeze_confirmed} className="min-h-11 px-3 py-2 rounded-lg border border-gray-300 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:bg-slate-950 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">{gates.source_freeze_confirmed?"Source freeze confirmed":actionBusy==="confirm_source_freeze"?"Confirming…":"Confirm source freeze"}</button>
        <button type="button" onClick={()=>runCutoverAction("enable_notifications")} disabled={!!actionBusy || !gates.source_freeze_confirmed || !!gates.notifications_enabled} className="min-h-11 px-3 py-2 rounded-lg border border-gray-300 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:bg-slate-950 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">{gates.notifications_enabled?"Notifications ON":actionBusy==="enable_notifications"?"Enabling…":"Enable notifications"}</button>
        <button type="button" onClick={()=>runCutoverAction("enable_scheduled_reminders")} disabled={!!actionBusy || !gates.notifications_enabled || !!gates.scheduled_reminders_enabled} className="min-h-11 px-3 py-2 rounded-lg border border-gray-300 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:bg-slate-950 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">{gates.scheduled_reminders_enabled?"Scheduled reminders ON":actionBusy==="enable_scheduled_reminders"?"Enabling…":"Enable scheduled reminders"}</button>
        <button type="button" onClick={()=>runCutoverAction("enable_maintenance_generation")} disabled={!!actionBusy || !gates.scheduled_reminders_enabled || !!gates.maintenance_generation_enabled} className="min-h-11 px-3 py-2 rounded-lg border border-gray-300 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:bg-slate-950 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">{gates.maintenance_generation_enabled?"Maintenance generation ON":actionBusy==="enable_maintenance_generation"?"Enabling…":"Enable maintenance generation"}</button>
        <button type="button" onClick={()=>runCutoverAction("enable_public_reporting")} disabled={!!actionBusy || !gates.maintenance_generation_enabled || !!gates.public_reporting_enabled} className="min-h-11 px-3 py-2 rounded-lg border border-gray-300 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:bg-slate-950 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">{gates.public_reporting_enabled?"Public reporting ON":actionBusy==="enable_public_reporting"?"Enabling…":"Enable public reporting"}</button>
      </div>}
    </div>

    <div id="repair-approval-policies" className="scroll-mt-36"><FleetRepairApprovalPolicies /></div>

    <div id="fleet-automation-health" className="scroll-mt-36 rounded-xl border border-gray-200 bg-white dark:bg-slate-900 dark:border-slate-800 p-4 shadow-sm">
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
            <button type="button" onClick={()=>{setManualError("");setManualResult("");setManualAction("maintenance");}} disabled={!!manualBusy || !gates.maintenance_generation_enabled} className="min-h-11 inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-indigo-300 text-sm font-medium text-indigo-700 disabled:opacity-50 dark:border-indigo-800 dark:text-indigo-300"><Play className="w-4 h-4"/>Run generation now</button>
            <button type="button" onClick={()=>{setManualError("");setManualResult("");setManualAction("reminders");}} disabled={!!manualBusy || !gates.scheduled_reminders_enabled || !gates.notifications_enabled} className="min-h-11 inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-indigo-300 text-sm font-medium text-indigo-700 disabled:opacity-50 dark:border-indigo-800 dark:text-indigo-300"><Mail className="w-4 h-4"/>Run reminders now</button>
          </div>
        </div>
        {manualResult && <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">{manualResult}</div>}
        {manualError && <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">{manualError}</div>}
      </div>
    </div>

    <div id="mechanic-portal" className="scroll-mt-36 rounded-xl border border-gray-200 bg-white dark:bg-slate-900 dark:border-slate-800 p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div><h2 className="font-semibold text-gray-900 dark:text-slate-100">Standalone Mechanic Portal</h2><p className="text-xs text-gray-500 dark:text-slate-400 mt-1">Private Fleet-only bearer links for outside mechanics. No CCS account, app shell, signage workflow, Bouncie admin, inventory administration, requests, or settings access.</p></div>
        <UserCog className="w-5 h-5 text-gray-400 shrink-0"/>
      </div>
      {mechanicError && <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">{mechanicError}</div>}
      {mechanicNotice && <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">{mechanicNotice}</div>}
      {mechanicReceiptUnresolved.length>0&&<div className="mt-4 rounded-xl border border-amber-300 bg-amber-50/70 p-3 dark:border-amber-900 dark:bg-amber-950/20"><div className="flex items-start gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700"/><div><div className="text-sm font-semibold text-amber-900 dark:text-amber-100">Mechanic operations need reconciliation</div><p className="mt-1 text-xs text-amber-800 dark:text-amber-200">These Start Work / Save Progress receipts are unresolved. Reconcile checks the authoritative work order and current bearer-link status. A revoked or expired credential is never re-enabled.</p></div></div><div className="mt-3 space-y-2">{mechanicReceiptUnresolved.map(receipt=><div key={receipt.id} className="rounded-lg border border-amber-200 bg-white p-3 dark:border-amber-900 dark:bg-slate-950"><div className="flex flex-col sm:flex-row sm:items-center gap-3"><div className="min-w-0 flex-1"><div className="text-xs font-semibold text-gray-900 dark:text-slate-100">{receipt.operation_type==="mechanic_start"?"Start Work":"Save Progress"} · {receipt.status}</div><div className="mt-1 text-[11px] text-gray-500 dark:text-slate-400 break-all">Work order {receipt.target_id || "—"} · {receipt.operation_key || receipt.id}</div>{Array.isArray(receipt?.result_summary?.uploaded_photo_urls)&&receipt.result_summary.uploaded_photo_urls.length>0&&<div className="mt-1 text-[11px] text-amber-700 dark:text-amber-300">{receipt.result_summary.uploaded_photo_urls.length} uploaded photo file{receipt.result_summary.uploaded_photo_urls.length===1?"":"s"} retained as recovery evidence.</div>}{receipt.error_message&&<div className="mt-1 text-[11px] text-red-600 dark:text-red-300">{receipt.error_message}</div>}</div><button type="button" onClick={()=>reconcileMechanicReceipt(receipt)} disabled={!!mechanicBusy} className="min-h-11 shrink-0 rounded-lg border border-amber-400 bg-white px-3 text-xs font-semibold text-amber-900 disabled:opacity-50 dark:bg-slate-900 dark:border-amber-800 dark:text-amber-200">{mechanicBusy===`receipt-${receipt.id}`?<Loader2 className="mr-1 inline h-4 w-4 animate-spin"/>:<RefreshCw className="mr-1 inline h-4 w-4"/>}Reconcile</button></div></div>)}</div></div>}
      <div className="mt-4 grid sm:grid-cols-[minmax(0,1fr)_170px_auto] gap-2">
        <input value={mechanicName} onChange={e=>setMechanicName(e.target.value)} maxLength={80} placeholder="Mechanic name" className="min-h-11 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:bg-slate-950 dark:border-slate-700"/>
        <select value={mechanicExpiryDays} onChange={e=>setMechanicExpiryDays(e.target.value)} className="min-h-11 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:bg-slate-950 dark:border-slate-700"><option value="0">Never expires</option><option value="7">Expires in 7 days</option><option value="30">Expires in 30 days</option><option value="90">Expires in 90 days</option></select>
        <button type="button" onClick={createMechanicLink} disabled={!!mechanicBusy || (mechanicScopeMode === "selected_equipment" && mechanicEquipmentIds.length === 0)} className="min-h-11 inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium disabled:opacity-50">{mechanicBusy==="create"?<Loader2 className="w-4 h-4 animate-spin"/>:<Link2 className="w-4 h-4"/>}Generate Private Link</button>
      </div>
      <div className="mt-3 rounded-xl border border-gray-200 bg-gray-50/70 p-3 dark:border-slate-800 dark:bg-slate-950/40"><div className="text-sm font-semibold text-gray-900 dark:text-slate-100">Work-order scope</div><p className="text-xs text-gray-500 dark:text-slate-400 mt-1">Limit what this private link can see. Existing links keep their current all-active scope until you explicitly change them.</p><div className="mt-3 grid sm:grid-cols-2 gap-2"><button type="button" onClick={()=>setMechanicScopeMode("all_active")} className={`min-h-11 rounded-lg border px-3 text-sm font-semibold text-left ${mechanicScopeMode==="all_active"?"border-indigo-400 bg-indigo-50 text-indigo-800 dark:border-indigo-700 dark:bg-indigo-950/30 dark:text-indigo-200":"border-gray-300 bg-white dark:border-slate-700 dark:bg-slate-900"}`}><span className="block">All active Fleet work</span><span className="block text-[11px] font-normal opacity-70 mt-0.5">Current portal behavior</span></button><button type="button" onClick={()=>setMechanicScopeMode("selected_equipment")} className={`min-h-11 rounded-lg border px-3 text-sm font-semibold text-left ${mechanicScopeMode==="selected_equipment"?"border-indigo-400 bg-indigo-50 text-indigo-800 dark:border-indigo-700 dark:bg-indigo-950/30 dark:text-indigo-200":"border-gray-300 bg-white dark:border-slate-700 dark:bg-slate-900"}`}><span className="block">Selected equipment only</span><span className="block text-[11px] font-normal opacity-70 mt-0.5">Only jobs tied to chosen assets</span></button></div>{mechanicScopeMode==="selected_equipment"&&<EquipmentScopePicker equipment={mechanicEquipment} selectedIds={mechanicEquipmentIds} onChange={setMechanicEquipmentIds}/>}</div>
      <label className="mt-3 min-h-11 inline-flex items-start gap-2 py-1 text-sm text-gray-700 dark:text-slate-300"><input type="checkbox" checked={mechanicAllowEstimates} onChange={e=>setMechanicAllowEstimates(e.target.checked)} className="mt-1"/><span><b>Allow repair-estimate submission</b><span className="block text-xs text-gray-500 dark:text-slate-400 mt-0.5">Mechanic may draft and submit pricing for active Fleet maintenance work inside this link's scope. They cannot approve estimates, see CCS-managed estimate amounts, change approval thresholds, complete work orders, or post inventory.</span></span></label>
      {generatedMechanicLink && <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/20 p-3"><div className="text-sm font-semibold text-emerald-800 dark:text-emerald-200">Copy this link now</div><p className="text-xs text-emerald-700 dark:text-emerald-300 mt-1">The raw access key is shown only for this newly generated link. If it is lost, revoke it and generate another.</p><div className="mt-3 flex flex-col sm:flex-row gap-2"><input readOnly value={generatedMechanicLink} className="min-h-11 flex-1 rounded-lg border border-emerald-300 bg-white px-3 py-2 text-xs font-mono text-gray-700 dark:bg-slate-950 dark:border-emerald-800 dark:text-slate-200"/><button type="button" onClick={copyMechanicLink} className="min-h-11 inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-emerald-300 bg-white text-sm font-medium text-emerald-800 dark:bg-slate-950 dark:border-emerald-800 dark:text-emerald-200"><Copy className="w-4 h-4"/>{mechanicCopied?"Copied":"Copy Link"}</button></div></div>}
      <div className="mt-4 space-y-2">{mechanicLinks.length ? mechanicLinks.map(link => <MechanicLinkCard key={link.id} link={link} equipment={mechanicEquipment} scopeEdit={mechanicScopeEdit?.id === link.id ? mechanicScopeEdit : null} busy={mechanicBusy} onEditScope={() => setMechanicScopeEdit({ id: link.id, scope_mode: link.scope_mode === "selected_equipment" ? "selected_equipment" : "all_active", allowed_equipment_ids: [...(link.allowed_equipment_ids || [])] })} onScopeEditChange={setMechanicScopeEdit} onCancelScope={() => setMechanicScopeEdit(null)} onSaveScope={saveMechanicScope} onToggleEstimates={() => setMechanicEstimatePermission(link,!link.allow_estimates)} onRevoke={() => setMechanicRevoke(link)} />) : <div className="rounded-lg bg-gray-50 dark:bg-slate-950/50 px-3 py-3 text-xs text-gray-500 dark:text-slate-400">No external mechanic links have been created.</div>}</div>
      <div className="mt-3 text-xs text-gray-500 dark:text-slate-400">Portal access is enforced server-side. A link may see all active Fleet maintenance work or only work tied to explicitly selected Fleet equipment. Linked equipment, maintenance-task details, estimate state, progress updates, notes and photos are derived only from work inside that scope. Final completion, inventory posting, CCS-managed estimate values, approval decisions and thresholds remain inside authenticated CCS Fleet.</div>
    </div>

    <div id="fleet-public-reporting" className="scroll-mt-36 rounded-xl border border-gray-200 bg-white dark:bg-slate-900 dark:border-slate-800 p-4 shadow-sm">
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
            <button type="button" onClick={copyLegacyQrUrl} className="min-h-11 inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-gray-300 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 dark:bg-slate-950 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"><Copy className="w-4 h-4"/>{qrCopied ? "Copied" : "Copy QR URL"}</button>
            <button type="button" onClick={downloadLegacyQr} className="min-h-11 inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-indigo-300 bg-indigo-50 text-sm font-medium text-indigo-700 hover:bg-indigo-100 dark:bg-indigo-950/40 dark:border-indigo-800 dark:text-indigo-200 dark:hover:bg-indigo-950/60"><Download className="w-4 h-4"/>Download QR Code</button>
          </div>
        </div>
      </div>
    </div>

    <div id="fleet-data-integrity" className="scroll-mt-36"><IntegrityPanel data={integrity} busy={integrityBusy} onRefresh={runIntegrityAudit} /></div>

    {connection?.needsReconnect && <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-800 p-4 flex gap-3"><AlertTriangle className="w-5 h-5 text-red-600 shrink-0"/><div><div className="font-semibold text-red-800 dark:text-red-200">Bouncie administrator reconnect required</div><p className="text-sm text-red-700 dark:text-red-300 mt-1">The stored refresh credential was rejected. Webhooks may continue independently, but Fleet Tracking REST vehicles/trips need a fresh authorization to restore full Fleet tracking.</p><button type="button" onClick={reconnectBouncie} disabled={bouncieReconnectBusy} className="mt-3 min-h-11 px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-50 inline-flex items-center gap-2"><Link2 className="w-4 h-4"/>{bouncieReconnectBusy ? "Opening Bouncie…" : "Reconnect Bouncie"}</button></div></div>}

    {oldUrl && <div className="rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 p-4 flex gap-3"><AlertTriangle className="w-5 h-5 text-amber-600 shrink-0"/><div><div className="font-semibold text-amber-800 dark:text-amber-200">Legacy FleetMaster URL still preserved in a template</div><p className="text-sm text-amber-700 dark:text-amber-300 mt-1">Notifications are live. Update this template immediately so future Fleet messages do not send users to the retired FleetMaster route.</p></div></div>}

    {settings ? <div id="fleet-config-summary" className="scroll-mt-36 grid md:grid-cols-2 gap-4">
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
      open={!!mechanicRevoke}
      title={`Revoke ${mechanicRevoke?.name || "mechanic"} portal link?`}
      description="That private link will stop working immediately. Existing Fleet data and work-order history are not changed. Generate a new link later if access needs to be restored."
      confirmLabel="Revoke Link"
      tone="warning"
      busy={!!mechanicBusy}
      onCancel={()=>!mechanicBusy&&setMechanicRevoke(null)}
      onConfirm={()=>revokeMechanicLink(mechanicRevoke?.id)}
    />
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

function EquipmentScopePicker({equipment=[],selectedIds=[],onChange}) {
  const selected = new Set(selectedIds || []);
  const visible = (equipment || []).filter(item => item.status !== "retired" || selected.has(item.id));
  const toggle = id => onChange(selected.has(id) ? selectedIds.filter(value => value !== id) : [...selectedIds,id]);
  return <div className="mt-3"><div className="flex items-center justify-between gap-3"><div className="text-xs font-semibold text-gray-600 dark:text-slate-300">Allowed equipment</div><div className="text-[11px] text-gray-400">{selected.size} selected</div></div><div className="mt-2 max-h-56 overflow-y-auto rounded-lg border border-gray-200 bg-white divide-y divide-gray-100 dark:border-slate-700 dark:bg-slate-900 dark:divide-slate-800">{visible.map(item => <label key={item.id} className="min-h-11 px-3 py-2 flex items-center gap-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-800/50"><input type="checkbox" checked={selected.has(item.id)} onChange={()=>toggle(item.id)} className="h-4 w-4"/><span className="min-w-0 flex-1"><span className="block text-sm font-medium text-gray-900 dark:text-slate-100 truncate">{item.name}</span><span className="block text-[11px] text-gray-500 dark:text-slate-400 truncate">{[item.year,item.make,item.model].filter(Boolean).join(" ") || String(item.type || "Fleet equipment").replaceAll("_"," ")}{item.status === "retired" ? " · retired" : ""}</span></span></label>)}{visible.length===0&&<div className="px-3 py-4 text-xs text-gray-500 dark:text-slate-400">No active Fleet equipment is available.</div>}</div></div>;
}

function MechanicLinkCard({link,equipment,scopeEdit,busy,onEditScope,onScopeEditChange,onCancelScope,onSaveScope,onToggleEstimates,onRevoke}) {
  const expired = !!link.expires_at && Date.parse(link.expires_at) <= Date.now();
  const active = link.enabled !== false && !expired;
  const selectedScope = link.scope_mode === "selected_equipment";
  const scopeCount = (link.allowed_equipment_ids || []).length;
  const savingScope = busy === `scope-${link.id}`;
  return <div className="rounded-lg border border-gray-200 dark:border-slate-800 px-3 py-3">
    <div className="flex flex-col sm:flex-row sm:items-center gap-3"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className="text-sm font-medium text-gray-900 dark:text-slate-100">{link.name || "External Mechanic"}</span><span className={`text-[10px] font-semibold rounded-full px-2 py-0.5 ${active?"bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300":"bg-gray-100 text-gray-500 dark:bg-slate-800 dark:text-slate-400"}`}>{active?"ACTIVE":expired?"EXPIRED":"REVOKED"}</span><span className={`text-[10px] font-semibold rounded-full px-2 py-0.5 ${link.allow_estimates?"bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300":"bg-gray-100 text-gray-500 dark:bg-slate-800 dark:text-slate-400"}`}>ESTIMATES {link.allow_estimates?"ON":"OFF"}</span><span className="text-[10px] font-semibold rounded-full px-2 py-0.5 bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300">{selectedScope?`${scopeCount} EQUIPMENT`:"ALL ACTIVE"}</span></div><div className="text-xs text-gray-500 dark:text-slate-400 mt-1">Created {link.created_at?new Date(link.created_at).toLocaleString():"—"}{link.created_by?` by ${link.created_by}`:""}</div><div className="text-xs text-gray-500 dark:text-slate-400 mt-1">Last used {link.last_used_at?new Date(link.last_used_at).toLocaleString():"Never"} · {link.expires_at?`Expires ${new Date(link.expires_at).toLocaleString()}`:"No expiration"}</div></div>{active&&<div className="flex flex-wrap gap-2"><button type="button" onClick={onEditScope} disabled={!!busy} className="min-h-11 px-3 rounded-lg border border-violet-300 text-xs font-semibold text-violet-700 disabled:opacity-50 dark:border-violet-900 dark:text-violet-300">Edit Scope</button><button type="button" onClick={onToggleEstimates} disabled={!!busy} className="min-h-11 px-3 rounded-lg border border-indigo-300 text-xs font-semibold text-indigo-700 disabled:opacity-50 dark:border-indigo-900 dark:text-indigo-300">{busy===`estimate-${link.id}`?<Loader2 className="w-4 h-4 animate-spin inline mr-1"/>:null}{link.allow_estimates?"Disable Estimates":"Enable Estimates"}</button><button type="button" onClick={onRevoke} disabled={!!busy} className="min-h-11 px-3 rounded-lg border border-red-300 text-xs font-semibold text-red-700 disabled:opacity-50 dark:border-red-900 dark:text-red-300"><Ban className="w-4 h-4 inline mr-1"/>Revoke</button></div>}</div>
    {scopeEdit&&<div className="mt-3 pt-3 border-t border-gray-100 dark:border-slate-800"><div className="text-xs font-bold uppercase tracking-wide text-gray-400">Edit work-order scope</div><div className="mt-2 grid sm:grid-cols-2 gap-2"><button type="button" onClick={()=>onScopeEditChange({...scopeEdit,scope_mode:"all_active"})} className={`min-h-11 rounded-lg border px-3 text-xs font-semibold text-left ${scopeEdit.scope_mode==="all_active"?"border-violet-400 bg-violet-50 text-violet-800 dark:border-violet-700 dark:bg-violet-950/30 dark:text-violet-200":"border-gray-300 dark:border-slate-700"}`}>All active Fleet work</button><button type="button" onClick={()=>onScopeEditChange({...scopeEdit,scope_mode:"selected_equipment"})} className={`min-h-11 rounded-lg border px-3 text-xs font-semibold text-left ${scopeEdit.scope_mode==="selected_equipment"?"border-violet-400 bg-violet-50 text-violet-800 dark:border-violet-700 dark:bg-violet-950/30 dark:text-violet-200":"border-gray-300 dark:border-slate-700"}`}>Selected equipment only</button></div>{scopeEdit.scope_mode==="selected_equipment"&&<EquipmentScopePicker equipment={equipment} selectedIds={scopeEdit.allowed_equipment_ids || []} onChange={ids=>onScopeEditChange({...scopeEdit,allowed_equipment_ids:ids})}/>}<div className="mt-3 flex justify-end gap-2"><button type="button" onClick={onCancelScope} disabled={savingScope} className="min-h-11 px-3 rounded-lg border border-gray-300 text-xs font-semibold dark:border-slate-700">Cancel</button><button type="button" onClick={onSaveScope} disabled={savingScope || (scopeEdit.scope_mode==="selected_equipment" && !(scopeEdit.allowed_equipment_ids || []).length)} className="min-h-11 px-3 rounded-lg bg-violet-600 text-white text-xs font-semibold disabled:opacity-50 inline-flex items-center gap-2">{savingScope&&<Loader2 className="w-4 h-4 animate-spin"/>}Save Scope</button></div></div>}
  </div>;
}

function FeatureSetupCard({item}) {
  const state = item.state || "ready";
  const positive = state === "configured" || state === "in_use";
  const tone = state === "needs_setup"
    ? "border-amber-200 bg-amber-50/60 dark:border-amber-900 dark:bg-amber-950/15"
    : positive
      ? "border-emerald-200 bg-emerald-50/50 dark:border-emerald-900 dark:bg-emerald-950/10"
      : "border-gray-200 bg-gray-50/70 dark:border-slate-800 dark:bg-slate-950/30";
  const badge = state === "needs_setup" ? "Needs setup" : state === "configured" ? "Configured" : state === "in_use" ? "In use" : "Ready";
  const badgeTone = state === "needs_setup"
    ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
    : positive
      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
      : "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300";
  const actionClass = "min-h-11 px-3 rounded-lg border border-gray-300 bg-white text-xs font-semibold inline-flex items-center justify-center hover:border-indigo-300 dark:bg-slate-900 dark:border-slate-700 dark:hover:border-indigo-700";
  return <div className={`rounded-xl border p-3 ${tone}`}>
    <div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="font-semibold text-sm text-gray-900 dark:text-slate-100">{item.label}</div><div className="text-xs text-gray-500 dark:text-slate-400 mt-1">{item.detail}</div></div><span className={`text-[10px] uppercase font-bold rounded-full px-2 py-1 whitespace-nowrap ${badgeTone}`}>{badge}</span></div>
    <div className="mt-3 flex items-center justify-between gap-3"><div className="text-[11px] text-gray-400">Current records: <b className="text-gray-600 dark:text-slate-300">{item.value ?? 0}</b></div>{item.to ? <Link to={item.to} className={actionClass}>{item.actionLabel}</Link> : <a href={item.href || "#"} className={actionClass}>{item.actionLabel}</a>}</div>
  </div>;
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
      <button type="button" onClick={onRefresh} disabled={busy} className="min-h-11 inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-gray-300 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:bg-slate-950 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">{busy?<Loader2 className="w-4 h-4 animate-spin"/>:<RefreshCw className="w-4 h-4"/>}Run integrity audit</button>
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

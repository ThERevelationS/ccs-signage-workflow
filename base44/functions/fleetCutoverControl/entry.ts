import { createClientFromRequest } from 'npm:@base44/sdk@0.8.46';
import { callBouncieApi, getActiveConnection } from '../../shared/bouncie.ts';

const SOURCE_APP_ID = '68accb163a1b474cdb95ea70';
const DEST_APP_ID = '68dfcc5e57bbbc35387da97c';
const CUTOVER_STATE_KEY = 'primary';
const MAX_REST_SYNC_AGE_MS = 24 * 60 * 60 * 1000;
const COUNT_PAGE_SIZE = 500;
const MAX_COUNT_ROWS = 50000;
const nowIso = () => new Date().toISOString();

async function listAllRows(entity:any, label:string) {
  const rows:any[] = [];
  for (let skip = 0; skip < MAX_COUNT_ROWS; skip += COUNT_PAGE_SIZE) {
    const page = await entity.list('-created_date', COUNT_PAGE_SIZE, skip);
    rows.push(...(page || []));
    if (!page || page.length < COUNT_PAGE_SIZE) return rows;
  }
  throw new Error(`${label} count exceeded the ${MAX_COUNT_ROWS}-row Fleet health safety limit.`);
}

function migrationRetentionStats(rows:any[]) {
  const sourceIds = (rows || [])
    .filter((row:any) => row?.migration_source_app_id === SOURCE_APP_ID && !!row?.migration_source_id)
    .map((row:any) => String(row.migration_source_id));
  const unique = new Set(sourceIds);
  return { unique: unique.size, duplicates: sourceIds.length - unique.size };
}

function countFromAudit(audit:any, key:string) {
  const n = Number(audit?.destination_counts?.[key]);
  return Number.isFinite(n) ? n : null;
}

async function latestVerification(base44:any) {
  const rows = await base44.asServiceRole.entities.FleetMigrationAudit.filter({ mode:'verification' });
  return (rows || []).sort((a:any,b:any) => new Date(b.created_date || b.updated_date || 0).getTime() - new Date(a.created_date || a.updated_date || 0).getTime())[0] || null;
}

async function getCutoverState(base44:any, createIfMissing = false) {
  const rows = await base44.asServiceRole.entities.FleetCutoverState.filter({ state_key:CUTOVER_STATE_KEY });
  const existing = (rows || []).sort((a:any,b:any)=>String(a.id||'').localeCompare(String(b.id||'')))[0] || null;
  if (existing || !createIfMissing) return existing;
  return await base44.asServiceRole.entities.FleetCutoverState.create({
    state_key:CUTOVER_STATE_KEY,
    source_freeze_confirmed:false,
    notifications_enabled:false,
    scheduled_reminders_enabled:false,
    maintenance_generation_enabled:false,
    public_reporting_enabled:false,
  });
}

async function currentCounts(base44:any) {
  const E = base44.asServiceRole.entities;
  const [equipment,tasks,workOrders,parts,fluids,logs,requests,settings,systemLogs,systemReports,queue,receipts] = await Promise.all([
    listAllRows(E.FleetEquipment, 'FleetEquipment'),
    listAllRows(E.FleetMaintenanceTask, 'FleetMaintenanceTask'),
    listAllRows(E.FleetMaintenanceWorkOrder, 'FleetMaintenanceWorkOrder'),
    listAllRows(E.FleetPart, 'FleetPart'),
    listAllRows(E.FleetFluid, 'FleetFluid'),
    listAllRows(E.FleetEquipmentLog, 'FleetEquipmentLog'),
    listAllRows(E.FleetPartFluidRequest, 'FleetPartFluidRequest'),
    listAllRows(E.FleetSettings, 'FleetSettings'),
    listAllRows(E.FleetSystemLog, 'FleetSystemLog'),
    listAllRows(E.FleetSystemReport, 'FleetSystemReport'),
    listAllRows(E.FleetNotificationQueue, 'FleetNotificationQueue'),
    listAllRows(E.FleetOperationReceipt, 'FleetOperationReceipt'),
  ]);
  const retention = {
    FleetEquipment: migrationRetentionStats(equipment),
    FleetMaintenanceTask: migrationRetentionStats(tasks),
    FleetMaintenanceWorkOrder: migrationRetentionStats(workOrders),
    FleetPart: migrationRetentionStats(parts),
    FleetFluid: migrationRetentionStats(fluids),
    FleetEquipmentLog: migrationRetentionStats(logs),
    FleetPartFluidRequest: migrationRetentionStats(requests),
    FleetSettings: migrationRetentionStats(settings),
    FleetSystemLog: migrationRetentionStats(systemLogs),
    FleetSystemReport: migrationRetentionStats(systemReports),
  };
  return {
    FleetEquipment: equipment.length,
    FleetEquipment_migrated_from_source: retention.FleetEquipment.unique,
    FleetEquipment_migration_duplicates: retention.FleetEquipment.duplicates,
    FleetMaintenanceTask: tasks.length,
    FleetMaintenanceTask_migrated_from_source: retention.FleetMaintenanceTask.unique,
    FleetMaintenanceTask_migration_duplicates: retention.FleetMaintenanceTask.duplicates,
    FleetMaintenanceWorkOrder: workOrders.length,
    FleetMaintenanceWorkOrder_migrated_from_source: retention.FleetMaintenanceWorkOrder.unique,
    FleetMaintenanceWorkOrder_migration_duplicates: retention.FleetMaintenanceWorkOrder.duplicates,
    FleetMaintenanceWorkOrder_completed: workOrders.filter((r:any)=>r.status==='completed').length,
    FleetMaintenanceWorkOrder_active: workOrders.filter((r:any)=>['open','assigned','in_progress'].includes(r.status)).length,
    FleetPart: parts.length,
    FleetPart_migrated_from_source: retention.FleetPart.unique,
    FleetPart_migration_duplicates: retention.FleetPart.duplicates,
    FleetFluid: fluids.length,
    FleetFluid_migrated_from_source: retention.FleetFluid.unique,
    FleetFluid_migration_duplicates: retention.FleetFluid.duplicates,
    FleetEquipmentLog: logs.length,
    FleetEquipmentLog_migrated_from_source: retention.FleetEquipmentLog.unique,
    FleetEquipmentLog_migration_duplicates: retention.FleetEquipmentLog.duplicates,
    FleetPartFluidRequest: requests.length,
    FleetPartFluidRequest_migrated_from_source: retention.FleetPartFluidRequest.unique,
    FleetPartFluidRequest_migration_duplicates: retention.FleetPartFluidRequest.duplicates,
    FleetSettings: settings.length,
    FleetSettings_migrated_from_source: retention.FleetSettings.unique,
    FleetSettings_migration_duplicates: retention.FleetSettings.duplicates,
    FleetSystemLog: systemLogs.length,
    FleetSystemLog_migrated_from_source: retention.FleetSystemLog.unique,
    FleetSystemLog_migration_duplicates: retention.FleetSystemLog.duplicates,
    FleetSystemReport: systemReports.length,
    FleetSystemReport_migrated_from_source: retention.FleetSystemReport.unique,
    FleetSystemReport_migration_duplicates: retention.FleetSystemReport.duplicates,
    FleetNotificationQueue: queue.length,
    FleetNotificationQueue_unresolved: queue.filter((r:any)=>['pending','sending','failed'].includes(r.status)).length,
    FleetOperationReceipt: receipts.length,
    FleetOperationReceipt_unresolved: receipts.filter((r:any)=>['started','failed'].includes(r.status)).length,
  };
}

async function mirrorSettings(base44:any, settings:any, patch:any) {
  if (!settings) return;
  await base44.asServiceRole.entities.FleetSettings.update(settings.id, patch);
}

async function evaluate(base44:any, { liveBouncieProbe = false } = {}) {
  const settingsRows = await base44.asServiceRole.entities.FleetSettings.filter({ setting_type:'general' });
  const settings = settingsRows?.[0] || null;
  const state = await getCutoverState(base44, true);
  const audit = await latestVerification(base44);
  const counts = await currentCounts(base44);
  let conn = await getActiveConnection(base44);
  let bouncieProbeOk = false;
  let bouncieProbeError = '';
  let gmailSenderOk = false;
  let gmailSenderDetail = 'Gmail sender connection unavailable.';

  try {
    const gmailConnection = await base44.asServiceRole.connectors.getConnection('gmail');
    gmailSenderOk = !!gmailConnection?.accessToken;
    gmailSenderDetail = gmailSenderOk ? 'Gmail sender connection is active.' : 'Gmail sender has no active access token.';
  } catch (error:any) {
    gmailSenderDetail = error?.message || 'Gmail sender connection check failed.';
  }

  if (liveBouncieProbe) {
    try {
      await callBouncieApi(base44, 'GET', '/v1/user');
      bouncieProbeOk = true;
      conn = await getActiveConnection(base44);
    } catch (error:any) {
      bouncieProbeError = error?.message || String(error);
      conn = await getActiveConnection(base44);
    }
  }

  const checks:any[] = [];
  const add = (key:string, pass:boolean, detail:string) => checks.push({ key, pass:!!pass, detail });

  add('settings_present', !!settings, settings ? 'FleetSettings record present.' : 'FleetSettings record missing.');
  add('cutover_state_present', !!state, state ? 'Server-owned FleetCutoverState present.' : 'FleetCutoverState missing.');
  add('fleet_url_configured', !!settings?.fleet_app_base_url && /^https:\/\//i.test(settings.fleet_app_base_url), settings?.fleet_app_base_url || 'Fleet URL missing.');
  add('source_freeze_confirmed', !!state?.source_freeze_confirmed && !!state?.source_freeze_confirmed_at, state?.source_freeze_confirmed_at || 'FleetMaster freeze has not been confirmed.');

  const auditStatusOk = !!audit && ['passed','passed_with_findings'].includes(audit.status);
  const auditAppsOk = audit?.source_app_id === SOURCE_APP_ID && audit?.destination_app_id === DEST_APP_ID;
  const auditDeltaOk = audit?.relationship_checks?.source_delta_detected === false;
  add('verification_audit_passed', auditStatusOk && auditAppsOk, audit ? `${audit.run_key}: ${audit.status}` : 'No verification audit found.');
  add('verification_audit_no_delta', !!audit && auditDeltaOk, audit ? `delta_records_migrated=${audit?.summary?.delta_records_migrated ?? 'unknown'}` : 'No verification audit found.');

  const protectedCountKeys = [
    'FleetEquipment','FleetMaintenanceTask','FleetMaintenanceWorkOrder','FleetMaintenanceWorkOrder_completed','FleetMaintenanceWorkOrder_active',
    'FleetPart','FleetFluid','FleetEquipmentLog','FleetPartFluidRequest','FleetSettings','FleetSystemLog','FleetSystemReport'
  ];
  const countMismatches = protectedCountKeys.flatMap((key) => {
    const expected = countFromAudit(audit,key);
    if (expected == null) return [];
    return counts[key] === expected ? [] : [{ key, expected, actual:counts[key] }];
  });
  add('destination_counts_match_audit', countMismatches.length === 0, countMismatches.length ? JSON.stringify(countMismatches) : 'Destination counts match latest verification audit.');
  add('notification_queue_clean', counts.FleetNotificationQueue_unresolved === 0, `${counts.FleetNotificationQueue_unresolved} unresolved of ${counts.FleetNotificationQueue} total queue record(s).`);
  add('operation_receipts_clean', counts.FleetOperationReceipt_unresolved === 0, `${counts.FleetOperationReceipt_unresolved} unresolved of ${counts.FleetOperationReceipt} total operation receipt(s).`);
  add('gmail_sender_connected', gmailSenderOk, gmailSenderDetail);

  const restFresh = !!conn?.last_sync_at && (Date.now() - new Date(conn.last_sync_at).getTime()) <= MAX_REST_SYNC_AGE_MS;
  add('bouncie_connection_present', !!conn, conn ? 'Bouncie connection record present.' : 'No Bouncie connection record.');
  add('bouncie_reconnect_clear', !!conn && !conn.needs_reconnect, conn?.needs_reconnect ? 'Bouncie REST OAuth reconnect is required.' : 'Bouncie reconnect flag clear.');
  add('bouncie_webhook_active', !!conn?.webhook_active && !conn?.webhook_error, conn?.webhook_error || (conn?.webhook_active ? 'Webhook active.' : 'Webhook not active.'));
  add('bouncie_rest_sync_recent', !!conn && restFresh, conn?.last_sync_at || 'No successful REST sync timestamp.');
  if (liveBouncieProbe) add('bouncie_live_probe', bouncieProbeOk, bouncieProbeOk ? 'Live /v1/user probe passed.' : (bouncieProbeError || 'Live Bouncie probe failed.'));

  const blocking = checks.filter(c => !c.pass);
  return {
    ready: blocking.length === 0,
    checks,
    blocking,
    settings: settings ? {
      id: settings.id,
      fleet_app_base_url: settings.fleet_app_base_url || '',
    } : null,
    cutover: state ? {
      id:state.id,
      source_freeze_confirmed:!!state.source_freeze_confirmed,
      source_freeze_confirmed_at:state.source_freeze_confirmed_at || null,
      notifications_enabled:!!state.notifications_enabled,
      scheduled_reminders_enabled:!!state.scheduled_reminders_enabled,
      maintenance_generation_enabled:!!state.maintenance_generation_enabled,
      public_reporting_enabled:!!state.public_reporting_enabled,
      cutover_started_at:state.cutover_started_at || null,
      cutover_completed_at:state.cutover_completed_at || null,
    } : null,
    audit: audit ? { id:audit.id, run_key:audit.run_key, status:audit.status, created_date:audit.created_date } : null,
    counts,
    bouncie: conn ? {
      needs_reconnect: !!conn.needs_reconnect,
      last_sync_at: conn.last_sync_at || null,
      last_webhook_at: conn.last_webhook_at || null,
      last_webhook_event: conn.last_webhook_event || '',
      webhook_active: !!conn.webhook_active,
      webhook_error: conn.webhook_error || '',
      last_error: conn.last_error || '',
    } : null,
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(()=>null);
    if (!user) return Response.json({ error:'Unauthorized' }, { status:401 });
    if (user.role !== 'admin') return Response.json({ error:'Admin only' }, { status:403 });

    const body = await req.json().catch(()=>({}));
    const action = String(body.action || 'status');
    const settingsRows = await base44.asServiceRole.entities.FleetSettings.filter({ setting_type:'general' });
    const settings = settingsRows?.[0];
    if (!settings) return Response.json({ error:'FleetSettings record missing.' }, { status:409 });
    const state = await getCutoverState(base44, true);

    if (action === 'status') return Response.json(await evaluate(base44));
    if (action === 'probe_bouncie') return Response.json(await evaluate(base44,{liveBouncieProbe:true}));

    if (action === 'disable_all') {
      const patch = {
        maintenance_generation_enabled:false,
        notifications_enabled:false,
        scheduled_reminders_enabled:false,
        public_reporting_enabled:false,
        cutover_completed_at:null,
        cutover_completed_by:'',
      };
      await base44.asServiceRole.entities.FleetCutoverState.update(state.id, patch);
      await mirrorSettings(base44, settings, patch);
      return Response.json({ success:true, disabled:true, status:await evaluate(base44) });
    }

    if (action === 'confirm_source_freeze') {
      if (body.confirmation !== 'FLEETMASTER_FROZEN_AND_DELTA_CHECKED') {
        return Response.json({ error:'Explicit FleetMaster freeze confirmation is required.' }, { status:400 });
      }
      const latest = await latestVerification(base44);
      const auditOk = latest && ['passed','passed_with_findings'].includes(latest.status) && latest.relationship_checks?.source_delta_detected === false;
      if (!auditOk) return Response.json({ error:'A passing no-delta verification audit is required before confirming source freeze.' }, { status:409 });
      const patch = {
        source_freeze_confirmed:true,
        source_freeze_confirmed_at:nowIso(),
        source_freeze_confirmed_by:user.email || user.id || 'admin',
        source_freeze_notes:String(body.notes || '').slice(0,1000),
      };
      await base44.asServiceRole.entities.FleetCutoverState.update(state.id, patch);
      await mirrorSettings(base44, settings, patch);
      return Response.json({ success:true, status:await evaluate(base44) });
    }

    if (action === 'clear_source_freeze') {
      const patch = {
        source_freeze_confirmed:false,
        source_freeze_confirmed_at:null,
        source_freeze_confirmed_by:'',
        source_freeze_notes:'',
        maintenance_generation_enabled:false,
        notifications_enabled:false,
        scheduled_reminders_enabled:false,
        public_reporting_enabled:false,
      };
      await base44.asServiceRole.entities.FleetCutoverState.update(state.id, patch);
      await mirrorSettings(base44, settings, patch);
      return Response.json({ success:true, status:await evaluate(base44) });
    }

    const enableMap:any = {
      enable_notifications: { notifications_enabled:true },
      enable_scheduled_reminders: { scheduled_reminders_enabled:true },
      enable_maintenance_generation: { maintenance_generation_enabled:true },
      enable_public_reporting: { public_reporting_enabled:true },
    };
    const patch = enableMap[action];
    if (!patch) return Response.json({ error:'Unknown cutover action.' }, { status:400 });

    const readiness = await evaluate(base44,{liveBouncieProbe:true});
    if (!readiness.ready) return Response.json({ error:'Fleet cutover readiness checks failed.', readiness }, { status:409 });

    if (action === 'enable_scheduled_reminders' && !state.notifications_enabled) {
      return Response.json({ error:'Enable Fleet notifications before scheduled reminders.' }, { status:409 });
    }
    if (action === 'enable_maintenance_generation' && (!state.notifications_enabled || !state.scheduled_reminders_enabled)) {
      return Response.json({ error:'Enable Fleet notifications and scheduled reminders before maintenance generation.' }, { status:409 });
    }
    if (action === 'enable_public_reporting' && (!state.notifications_enabled || !state.scheduled_reminders_enabled || !state.maintenance_generation_enabled)) {
      return Response.json({ error:'Enable notifications, scheduled reminders, and maintenance generation before public reporting.' }, { status:409 });
    }

    const stamp = nowIso();
    const statePatch = {
      ...patch,
      cutover_started_at: state.cutover_started_at || stamp,
      cutover_started_by: state.cutover_started_by || user.email || user.id || 'admin',
      ...(action === 'enable_public_reporting' ? { cutover_completed_at:stamp, cutover_completed_by:user.email || user.id || 'admin' } : {}),
    };
    await base44.asServiceRole.entities.FleetCutoverState.update(state.id, statePatch);
    await mirrorSettings(base44, settings, statePatch);
    return Response.json({ success:true, action, status:await evaluate(base44) });
  } catch (error:any) {
    console.error('fleetCutoverControl error:', error);
    return Response.json({ error:error?.message || 'Fleet cutover control failed.' }, { status:500 });
  }
});

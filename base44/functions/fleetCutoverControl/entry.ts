import { createClientFromRequest } from 'npm:@base44/sdk@0.8.46';
import { callBouncieApi, getActiveConnection } from '../../shared/bouncie.ts';

const SOURCE_APP_ID = '68accb163a1b474cdb95ea70';
const DEST_APP_ID = '68dfcc5e57bbbc35387da97c';
const MAX_REST_SYNC_AGE_MS = 24 * 60 * 60 * 1000;
const nowIso = () => new Date().toISOString();

function countFromAudit(audit:any, key:string) {
  const n = Number(audit?.destination_counts?.[key]);
  return Number.isFinite(n) ? n : null;
}

async function latestVerification(base44:any) {
  const rows = await base44.asServiceRole.entities.FleetMigrationAudit.filter({ mode:'verification' });
  return (rows || []).sort((a:any,b:any) => new Date(b.created_date || b.updated_date || 0).getTime() - new Date(a.created_date || a.updated_date || 0).getTime())[0] || null;
}

async function currentCounts(base44:any) {
  const [equipment,tasks,workOrders,parts,fluids,logs,requests,settings,systemLogs,systemReports,queue,receipts] = await Promise.all([
    base44.asServiceRole.entities.FleetEquipment.list(),
    base44.asServiceRole.entities.FleetMaintenanceTask.list(),
    base44.asServiceRole.entities.FleetMaintenanceWorkOrder.list(),
    base44.asServiceRole.entities.FleetPart.list(),
    base44.asServiceRole.entities.FleetFluid.list(),
    base44.asServiceRole.entities.FleetEquipmentLog.list(),
    base44.asServiceRole.entities.FleetPartFluidRequest.list(),
    base44.asServiceRole.entities.FleetSettings.list(),
    base44.asServiceRole.entities.FleetSystemLog.list(),
    base44.asServiceRole.entities.FleetSystemReport.list(),
    base44.asServiceRole.entities.FleetNotificationQueue.list(),
    base44.asServiceRole.entities.FleetOperationReceipt.list(),
  ]);
  return {
    FleetEquipment: equipment.length,
    FleetMaintenanceTask: tasks.length,
    FleetMaintenanceWorkOrder: workOrders.length,
    FleetMaintenanceWorkOrder_completed: workOrders.filter((r:any)=>r.status==='completed').length,
    FleetMaintenanceWorkOrder_active: workOrders.filter((r:any)=>['open','assigned','in_progress'].includes(r.status)).length,
    FleetPart: parts.length,
    FleetFluid: fluids.length,
    FleetEquipmentLog: logs.length,
    FleetPartFluidRequest: requests.length,
    FleetSettings: settings.length,
    FleetSystemLog: systemLogs.length,
    FleetSystemReport: systemReports.length,
    FleetNotificationQueue: queue.length,
    FleetNotificationQueue_unresolved: queue.filter((r:any)=>['pending','sending','failed'].includes(r.status)).length,
    FleetOperationReceipt: receipts.length,
    FleetOperationReceipt_unresolved: receipts.filter((r:any)=>['started','failed'].includes(r.status)).length,
  };
}

async function evaluate(base44:any, { liveBouncieProbe = false } = {}) {
  const settingsRows = await base44.asServiceRole.entities.FleetSettings.filter({ setting_type:'general' });
  const settings = settingsRows?.[0] || null;
  const audit = await latestVerification(base44);
  const counts = await currentCounts(base44);
  let conn = await getActiveConnection(base44);
  let bouncieProbeOk = false;
  let bouncieProbeError = '';

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
  add('fleet_url_configured', !!settings?.fleet_app_base_url && /^https:\/\//i.test(settings.fleet_app_base_url), settings?.fleet_app_base_url || 'Fleet URL missing.');
  add('source_freeze_confirmed', !!settings?.source_freeze_confirmed && !!settings?.source_freeze_confirmed_at, settings?.source_freeze_confirmed_at || 'FleetMaster freeze has not been confirmed.');

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
      maintenance_generation_enabled: !!settings.maintenance_generation_enabled,
      notifications_enabled: !!settings.notifications_enabled,
      scheduled_reminders_enabled: !!settings.scheduled_reminders_enabled,
      public_reporting_enabled: !!settings.public_reporting_enabled,
      source_freeze_confirmed: !!settings.source_freeze_confirmed,
      source_freeze_confirmed_at: settings.source_freeze_confirmed_at || null,
      fleet_app_base_url: settings.fleet_app_base_url || '',
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

    if (action === 'status') return Response.json(await evaluate(base44));
    if (action === 'probe_bouncie') return Response.json(await evaluate(base44,{liveBouncieProbe:true}));

    if (action === 'disable_all') {
      await base44.asServiceRole.entities.FleetSettings.update(settings.id, {
        maintenance_generation_enabled:false,
        notifications_enabled:false,
        scheduled_reminders_enabled:false,
        public_reporting_enabled:false,
        cutover_completed_at:null,
        cutover_completed_by:'',
      });
      return Response.json({ success:true, disabled:true, status:await evaluate(base44) });
    }

    if (action === 'confirm_source_freeze') {
      if (body.confirmation !== 'FLEETMASTER_FROZEN_AND_DELTA_CHECKED') {
        return Response.json({ error:'Explicit FleetMaster freeze confirmation is required.' }, { status:400 });
      }
      const latest = await latestVerification(base44);
      const auditOk = latest && ['passed','passed_with_findings'].includes(latest.status) && latest.relationship_checks?.source_delta_detected === false;
      if (!auditOk) return Response.json({ error:'A passing no-delta verification audit is required before confirming source freeze.' }, { status:409 });
      await base44.asServiceRole.entities.FleetSettings.update(settings.id, {
        source_freeze_confirmed:true,
        source_freeze_confirmed_at:nowIso(),
        source_freeze_confirmed_by:user.email || user.id || 'admin',
        source_freeze_notes:String(body.notes || '').slice(0,1000),
      });
      return Response.json({ success:true, status:await evaluate(base44) });
    }

    if (action === 'clear_source_freeze') {
      await base44.asServiceRole.entities.FleetSettings.update(settings.id, {
        source_freeze_confirmed:false,
        source_freeze_confirmed_at:null,
        source_freeze_confirmed_by:'',
        source_freeze_notes:'',
        maintenance_generation_enabled:false,
        notifications_enabled:false,
        scheduled_reminders_enabled:false,
        public_reporting_enabled:false,
      });
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

    if (action === 'enable_scheduled_reminders' && !settings.notifications_enabled) {
      return Response.json({ error:'Enable Fleet notifications before scheduled reminders.' }, { status:409 });
    }
    if (action === 'enable_maintenance_generation' && (!settings.notifications_enabled || !settings.scheduled_reminders_enabled)) {
      return Response.json({ error:'Enable Fleet notifications and scheduled reminders before maintenance generation.' }, { status:409 });
    }
    if (action === 'enable_public_reporting' && (!settings.notifications_enabled || !settings.scheduled_reminders_enabled || !settings.maintenance_generation_enabled)) {
      return Response.json({ error:'Enable notifications, scheduled reminders, and maintenance generation before public reporting.' }, { status:409 });
    }

    const stamp = nowIso();
    await base44.asServiceRole.entities.FleetSettings.update(settings.id, {
      ...patch,
      cutover_started_at: settings.cutover_started_at || stamp,
      cutover_started_by: settings.cutover_started_by || user.email || user.id || 'admin',
      ...(action === 'enable_public_reporting' ? { cutover_completed_at:stamp, cutover_completed_by:user.email || user.id || 'admin' } : {}),
    });
    return Response.json({ success:true, action, status:await evaluate(base44) });
  } catch (error:any) {
    console.error('fleetCutoverControl error:', error);
    return Response.json({ error:error?.message || 'Fleet cutover control failed.' }, { status:500 });
  }
});

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { loadAllEntityRows } from '../../shared/pagedEntityRows.ts';

const ACTIVE_WO = new Set(['open','assigned','in_progress']);

const normVin = (value:any) => String(value || '').trim().toUpperCase();
const normIdentity = (value:any) => String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
const groupBy = (rows:any[], keyFn:(row:any)=>string) => {
  const map = new Map<string,any[]>();
  for (const row of rows) {
    const key = keyFn(row);
    if (!key) continue;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(row);
  }
  return map;
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user || user.role !== 'admin') return Response.json({ error:'Forbidden' }, { status:403 });

    const E = base44.asServiceRole.entities;
    const [equipment,tasks,workOrders,parts,fluids,logs,requests,metadata,liveState,recentBouncieNotifications,receipts,queue,meterRules,repairEstimates,lifecycleProfiles,fuelEntries,warranties,reservations,dashboardPreferences,approvalPolicies,partIdentifications,inspectionTemplates,inspections] = await Promise.all([
      loadAllEntityRows({ entity:E.FleetEquipment, sort:'name', label:'Fleet equipment integrity data' }),
      loadAllEntityRows({ entity:E.FleetMaintenanceTask, sort:'-created_date', label:'Fleet maintenance integrity data' }),
      loadAllEntityRows({ entity:E.FleetMaintenanceWorkOrder, sort:'-created_date', label:'Fleet work-order integrity data' }),
      loadAllEntityRows({ entity:E.FleetPart, sort:'part_name', label:'Fleet part integrity data' }),
      loadAllEntityRows({ entity:E.FleetFluid, sort:'fluid_name', label:'Fleet fluid integrity data' }),
      loadAllEntityRows({ entity:E.FleetEquipmentLog, sort:'-created_date', label:'Fleet usage-log integrity data' }),
      loadAllEntityRows({ entity:E.FleetPartFluidRequest, sort:'-created_date', label:'Fleet request integrity data' }),
      loadAllEntityRows({ entity:E.FleetVehicleMetadata, sort:'-created_date', label:'Fleet vehicle metadata integrity data' }),
      loadAllEntityRows({ entity:E.BouncieVehicleLiveState, sort:'-last_seen_at', label:'Bouncie live-state integrity data' }),
      E.BouncieNotification.list('-created_date',500,0).catch(()=>[]),
      loadAllEntityRows({ entity:E.FleetOperationReceipt, sort:'-created_date', label:'Fleet operation-receipt integrity data' }),
      loadAllEntityRows({ entity:E.FleetNotificationQueue, sort:'-created_date', label:'Fleet notification-queue integrity data' }),
      loadAllEntityRows({ entity:E.FleetMaintenanceMeterRule, sort:'-created_date', label:'Fleet meter-rule integrity data' }),
      loadAllEntityRows({ entity:E.FleetRepairEstimate, sort:'-created_date', label:'Fleet repair-estimate integrity data' }),
      loadAllEntityRows({ entity:E.FleetLifecycleProfile, sort:'-created_date', label:'Fleet lifecycle integrity data' }),
      loadAllEntityRows({ entity:E.FleetFuelEntry, sort:'-fueled_at', label:'Fleet fuel-entry integrity data' }),
      loadAllEntityRows({ entity:E.FleetWarranty, sort:'-created_date', label:'Fleet warranty integrity data' }),
      loadAllEntityRows({ entity:E.FleetReservation, sort:'-created_date', label:'Fleet reservation integrity data' }),
      loadAllEntityRows({ entity:E.FleetDashboardPreference, sort:'-created_date', label:'Fleet dashboard-preference integrity data' }),
      loadAllEntityRows({ entity:E.FleetRepairApprovalPolicy, sort:'sort_order', label:'Fleet repair-approval integrity data' }),
      loadAllEntityRows({ entity:E.FleetPartIdentification, sort:'-created_date', label:'Fleet part-identification integrity data' }),
      loadAllEntityRows({ entity:E.FleetInspectionTemplate, sort:'name', label:'Fleet inspection-template integrity data' }),
      loadAllEntityRows({ entity:E.FleetInspection, sort:'-started_at', label:'Fleet inspection integrity data' }),
    ]);

    const equipmentIds = new Set(equipment.map((r:any)=>r.id));
    const taskById = new Map(tasks.map((r:any)=>[r.id,r]));
    const workOrderById = new Map(workOrders.map((r:any)=>[r.id,r]));
    const workOrderIds = new Set(workOrders.map((r:any)=>r.id));
    const partIds = new Set(parts.map((r:any)=>r.id));
    const fluidIds = new Set(fluids.map((r:any)=>r.id));
    const inspectionTemplateIds = new Set(inspectionTemplates.map((r:any)=>r.id));
    const findings:any[] = [];
    const add = (severity:string, code:string, title:string, items:any[], description:string) => {
      if (!items.length) return;
      findings.push({ severity, code, title, count:items.length, description, items:items.slice(0,25) });
    };

    const missingWoEquipment = workOrders.filter((wo:any)=>wo.equipment_id && !equipmentIds.has(wo.equipment_id));
    const orphanWo = workOrders.filter((wo:any)=>!wo.equipment_id);
    add('error','work_order_missing_equipment_record','Work orders point to missing equipment',missingWoEquipment.map((wo:any)=>({id:wo.id,work_order_number:wo.work_order_number,equipment_id:wo.equipment_id})),'A Fleet work order references an equipment ID that no longer exists.');
    add('warning','work_order_no_equipment','Work orders without an equipment link',orphanWo.map((wo:any)=>({id:wo.id,work_order_number:wo.work_order_number,status:wo.status,source_equipment_id:wo.source_equipment_id || ''})),'Historical orphan work orders are preserved rather than assigned to guessed equipment.');

    const badTaskEquipment = tasks.filter((task:any)=>!equipmentIds.has(task.equipment_id));
    add('error','maintenance_task_missing_equipment','Maintenance schedules point to missing equipment',badTaskEquipment.map((task:any)=>({id:task.id,title:task.title,equipment_id:task.equipment_id,status:task.status})),'Scheduled maintenance must always point to valid FleetEquipment.');
    const explicitOverdue = tasks.filter((task:any)=>task.status === 'overdue');
    add('info','legacy_explicit_overdue_status','Schedules using the legacy explicit overdue status',explicitOverdue.map((task:any)=>({id:task.id,title:task.title,equipment_id:task.equipment_id,start_date:task.start_date})),'Overdue is now derived from due date while pending. Legacy explicit overdue rows remain generation-safe and normalize to pending when edited.');

    const badWoTask = workOrders.filter((wo:any)=>wo.maintenance_task_id && !taskById.has(wo.maintenance_task_id));
    add('error','work_order_missing_task','Work orders point to missing maintenance schedules',badWoTask.map((wo:any)=>({id:wo.id,work_order_number:wo.work_order_number,maintenance_task_id:wo.maintenance_task_id})),'A linked maintenance schedule no longer exists.');

    const mismatchedWoTask = workOrders.filter((wo:any)=>{
      if (!wo.maintenance_task_id || !wo.equipment_id) return false;
      const task:any = taskById.get(wo.maintenance_task_id);
      return task && task.equipment_id !== wo.equipment_id;
    });
    add('error','work_order_task_equipment_mismatch','Work order and schedule equipment do not match',mismatchedWoTask.map((wo:any)=>({id:wo.id,work_order_number:wo.work_order_number,equipment_id:wo.equipment_id,maintenance_task_id:wo.maintenance_task_id,task_equipment_id:taskById.get(wo.maintenance_task_id)?.equipment_id})),'A work order linked to a schedule must use the same FleetEquipment record.');

    const taskActiveGroups = groupBy(workOrders.filter((wo:any)=>wo.maintenance_task_id && ACTIVE_WO.has(wo.status)), (wo:any)=>String(wo.maintenance_task_id));
    const inProgressWithoutActiveWorkOrder = tasks.filter((task:any)=>task.status === 'in_progress' && !(taskActiveGroups.get(String(task.id)) || []).length);
    add('error','maintenance_task_in_progress_without_active_work_order','In-progress maintenance schedules without an active work order',inProgressWithoutActiveWorkOrder.map((task:any)=>({id:task.id,title:task.title,equipment_id:task.equipment_id,start_date:task.start_date || '',generation_key:task.generation_key || '',last_generated_for_date:task.last_generated_for_date || ''})),'An in-progress maintenance schedule must have an active linked Fleet work order. This state blocks future scheduled generation until an administrator reconciles the schedule or work-order history.');
    const duplicateActiveScheduled:any[] = [];
    for (const [taskId,rows] of taskActiveGroups) if (rows.length > 1) duplicateActiveScheduled.push({maintenance_task_id:taskId,work_orders:rows.map((wo:any)=>wo.work_order_number)});
    add('warning','multiple_active_work_orders_for_task','Maintenance schedules with multiple active work orders',duplicateActiveScheduled,'Automatic generation is designed to keep one active work order per maintenance schedule.');

    const badPartCompatibility:any[] = [];
    for (const part of parts) for (const id of part.compatible_equipment_ids || []) if (!equipmentIds.has(id)) badPartCompatibility.push({id:part.id,item:part.part_name,equipment_id:id});
    add('warning','part_compatibility_missing_equipment','Parts reference missing compatible equipment',badPartCompatibility,'Compatibility links should point only to current FleetEquipment records.');
    const badFluidCompatibility:any[] = [];
    for (const fluid of fluids) for (const id of fluid.compatible_equipment_ids || []) if (!equipmentIds.has(id)) badFluidCompatibility.push({id:fluid.id,item:fluid.fluid_name,equipment_id:id});
    add('warning','fluid_compatibility_missing_equipment','Fluids reference missing compatible equipment',badFluidCompatibility,'Compatibility links should point only to current FleetEquipment records.');

    const partReceiveGroups = groupBy(parts, (part:any) => normIdentity(part.part_number));
    const duplicatePartReceiveIdentity:any[] = [];
    for (const [partNumber,rows] of partReceiveGroups) if (rows.length > 1) duplicatePartReceiveIdentity.push({part_number:partNumber,rows:rows.map((row:any)=>({id:row.id,name:row.part_name,manufacturer:row.manufacturer || ''}))});
    add('warning','duplicate_part_receive_identity','Parts sharing the same receive-match part number',duplicatePartReceiveIdentity,'Unlinked Fleet requests cannot be safely auto-matched when multiple parts share a normalized part number. Preserve the records and use an exact inventory link before receiving.');

    const fluidReceiveGroups = groupBy(fluids, (fluid:any) => {
      const name = normIdentity(fluid.fluid_name);
      if (!name) return '';
      return `${name}|${normIdentity(fluid.brand || '')}`;
    });
    const duplicateFluidReceiveIdentity:any[] = [];
    for (const [identity,rows] of fluidReceiveGroups) if (rows.length > 1) duplicateFluidReceiveIdentity.push({identity,rows:rows.map((row:any)=>({id:row.id,name:row.fluid_name,brand:row.brand || '',unit:row.unit || '',location:row.location || ''}))});
    add('warning','duplicate_fluid_receive_identity','Fluids sharing the same receive-match name and brand',duplicateFluidReceiveIdentity,'Unlinked Fleet requests cannot be safely auto-matched when multiple fluids share a normalized name and brand. Preserve the records and use an exact inventory link before receiving.');

    add('error','negative_part_stock','Parts with negative stock',parts.filter((p:any)=>Number(p.quantity_on_hand) < 0).map((p:any)=>({id:p.id,item:p.part_name,quantity:p.quantity_on_hand})),'Fleet parts inventory should never be negative.');
    add('error','negative_fluid_stock','Fluids with negative stock',fluids.filter((f:any)=>f.quantity != null && Number(f.quantity) < 0).map((f:any)=>({id:f.id,item:f.fluid_name,quantity:f.quantity,unit:f.unit})),'Fleet fluid inventory should never be negative.');
    const incompleteFluidStock = fluids.filter((f:any)=>[f.quantity,f.unit,f.minimum_stock,f.minimum_stock_unit].some((v:any)=>v == null || v === ''));
    add('info','fluid_stock_incomplete','Fluids with incomplete stock metadata',incompleteFluidStock.map((f:any)=>({id:f.id,item:f.fluid_name,quantity:f.quantity ?? null,unit:f.unit || '',minimum_stock:f.minimum_stock ?? null,minimum_stock_unit:f.minimum_stock_unit || ''})),'These historical fluids are preserved but cannot participate reliably in low-stock calculations until their stock metadata is completed.');

    const receivedUnlinked = requests.filter((r:any)=>r.status === 'received' && !r.inventory_item_id);
    add('warning','received_request_without_inventory_link','Received requests without a resolved inventory item',receivedUnlinked.map((r:any)=>({id:r.id,item:r.item_name,item_type:r.item_type,migration_source_id:r.migration_source_id || ''})),'Historical received requests may remain intentionally unresolved when no safe inventory match exists.');
    const brokenRequestLinks = requests.filter((r:any)=>{
      if (!r.inventory_item_id) return false;
      return r.item_type === 'part' ? !partIds.has(r.inventory_item_id) : !fluidIds.has(r.inventory_item_id);
    });
    add('error','request_inventory_link_missing','Requests point to missing inventory records',brokenRequestLinks.map((r:any)=>({id:r.id,item:r.item_name,item_type:r.item_type,inventory_item_id:r.inventory_item_id,status:r.status})),'A request with an exact inventory link must resolve to a current FleetPart or FleetFluid.');

    const brokenUsage:any[] = [];
    for (const log of logs) {
      if (!equipmentIds.has(log.equipment_id)) brokenUsage.push({id:log.id,type:'equipment',equipment_id:log.equipment_id,item:log.item_name});
      if (log.item_id && (log.item_type === 'part' ? !partIds.has(log.item_id) : !fluidIds.has(log.item_id))) brokenUsage.push({id:log.id,type:'inventory',item_id:log.item_id,item:log.item_name,item_type:log.item_type});
    }
    add('warning','equipment_log_broken_link','Equipment usage logs with unresolved current links',brokenUsage,'Historical source IDs remain preserved; current links should resolve when a destination record exists.');

    const equipmentVinGroups = groupBy(equipment,(r:any)=>normVin(r.vin));
    const duplicateEquipmentVin:any[] = [];
    for (const [vin,rows] of equipmentVinGroups) if (rows.length > 1) duplicateEquipmentVin.push({vin,equipment:rows.map((r:any)=>({id:r.id,name:r.name}))});
    add('error','duplicate_fleet_equipment_vin','Duplicate VINs in FleetEquipment',duplicateEquipmentVin,'A road-vehicle VIN should identify one FleetEquipment maintenance record.');

    const liveVinGroups = groupBy(liveState,(r:any)=>normVin(r.vehicle_vin));
    const duplicateLive:any[] = [];
    for (const [vin,rows] of liveVinGroups) if (rows.length > 1) duplicateLive.push({vin,rows:rows.map((r:any)=>({id:r.id,imei:r.vehicle_imei,last_seen_at:r.last_seen_at,is_trip_active:r.is_trip_active}))});
    add('warning','duplicate_bouncie_live_state','Duplicate Bouncie live-state rows',duplicateLive,'Bouncie live state is a derived cache. Duplicate VIN rows should be coalesced without changing trip or notification history.');

    const contradictoryLive = liveState.filter((row:any)=>{
      if (row?.is_trip_active !== true || !row?.ended_at || String(row?.transaction_id || '').trim()) return false;
      const endedAt = Date.parse(row.ended_at) || 0;
      const startedAt = Date.parse(row.started_at || '') || 0;
      const lastEventAt = Date.parse(row.last_event_at || '') || 0;
      return endedAt > 0 && (!startedAt || endedAt >= startedAt) && (!lastEventAt || endedAt >= lastEventAt);
    });
    add('warning','bouncie_live_state_ended_but_active','Bouncie live-state rows marked active after a definitive trip end',contradictoryLive.map((row:any)=>({id:row.id,vin:row.vehicle_vin || '',imei:row.vehicle_imei || '',started_at:row.started_at || '',ended_at:row.ended_at || '',last_event_at:row.last_event_at || ''})),'A derived live-state row cannot remain active when its latest known trip has ended and no active transaction remains. The cache self-heal should normalize this state without touching history.');

    const observedImeiGroups = groupBy([
      ...liveState.map((row:any)=>({vin:normVin(row.vehicle_vin),imei:String(row.vehicle_imei || '').trim(),observed_at:row.last_seen_at || row.updated_date || '',source:'live_state'})),
      ...(recentBouncieNotifications || []).map((row:any)=>({vin:normVin(row.vehicle_vin),imei:String(row.vehicle_imei || '').trim(),observed_at:row.timestamp || row.created_date || '',source:'notification'})),
    ],(row:any)=>row.imei);
    const multiVinImei:any[] = [];
    for (const [imei,rows] of observedImeiGroups) {
      const vins = [...new Set(rows.map((row:any)=>row.vin).filter(Boolean))];
      if (vins.length <= 1) continue;
      const linkedEquipment = equipment.filter((eq:any)=>String(eq.bouncie_imei || '').trim() === imei).map((eq:any)=>({id:eq.id,name:eq.name,vin:eq.vin || '',link_status:eq.bouncie_link_status || ''}));
      const newest = rows.slice().sort((a:any,b:any)=>(Date.parse(b.observed_at || '') || 0)-(Date.parse(a.observed_at || '') || 0))[0] || {};
      multiVinImei.push({imei,vins,latest_vin:newest.vin || '',latest_observed_at:newest.observed_at || '',linked_equipment:linkedEquipment});
    }
    add('warning','bouncie_imei_observed_with_multiple_vins','Bouncie device IMEIs observed with multiple VINs',multiVinImei,'A Bouncie device has reported more than one VIN in recent live/notification evidence. Do not auto-relink FleetEquipment. An administrator should confirm whether the device moved vehicles, Bouncie changed VIN identity, or historical/test data is involved.');

    const liveVins = new Set(Array.from(liveVinGroups.keys()));
    const equipmentVins = new Set(Array.from(equipmentVinGroups.keys()));
    const trackingOnly:any[] = [];
    for (const [vin,rows] of liveVinGroups) {
      if (equipmentVins.has(vin)) continue;
      const newest = rows.slice().sort((a:any,b:any)=>(Date.parse(b?.last_seen_at || b?.updated_date || '') || 0)-(Date.parse(a?.last_seen_at || a?.updated_date || '') || 0))[0] || {};
      trackingOnly.push({vin,imei:newest.vehicle_imei || '',last_seen_at:newest.last_seen_at || ''});
    }
    add('info','bouncie_tracking_without_fleet_equipment','Bouncie tracked vehicles without a FleetEquipment maintenance identity',trackingOnly,'Tracking-only Bouncie vehicles are allowed. Do not auto-create FleetEquipment; link or create maintenance identity only after an administrator confirms the asset belongs in CCS Fleet maintenance.');
    const brokenMatched = equipment.filter((eq:any)=>['matched','manual'].includes(eq.bouncie_link_status) && (!normVin(eq.vin) || !liveVins.has(normVin(eq.vin))));
    add('warning','matched_equipment_without_live_bouncie','Bouncie-linked equipment without a live-state VIN',brokenMatched.map((eq:any)=>({id:eq.id,name:eq.name,vin:eq.vin || '',link_status:eq.bouncie_link_status})),'Matched/manual links should resolve to current Bouncie live state; unlinked road assets are not considered errors.');
    add('warning','ambiguous_bouncie_equipment_link','Equipment marked with ambiguous Bouncie link',equipment.filter((eq:any)=>eq.bouncie_link_status === 'ambiguous').map((eq:any)=>({id:eq.id,name:eq.name,vin:eq.vin || ''})),'Ambiguous VIN matching requires admin review and is never auto-resolved.');

    const metadataGroups = groupBy(metadata,(r:any)=>normVin(r.vehicle_vin));
    const duplicateMetadata:any[] = [];
    for (const [vin,rows] of metadataGroups) if (rows.length > 1) duplicateMetadata.push({vin,rows:rows.map((r:any)=>({id:r.id}))});
    add('warning','duplicate_vehicle_metadata','Duplicate FleetVehicleMetadata VIN rows',duplicateMetadata,'CCS vehicle metadata should have one row per VIN.');

    // Expansion-system integrity. These checks intentionally use the same Fleet-only
    // identities as the feature actions; they never infer or repair links automatically.
    const badMeterRules = meterRules.filter((rule:any)=>!equipmentIds.has(rule.equipment_id) || !taskById.has(rule.maintenance_task_id) || (taskById.get(rule.maintenance_task_id) as any)?.equipment_id !== rule.equipment_id);
    add('error','meter_rule_broken_link','Mileage/hour maintenance rules with invalid equipment or schedule links',badMeterRules.map((rule:any)=>({id:rule.id,equipment_id:rule.equipment_id,maintenance_task_id:rule.maintenance_task_id})),'A meter rule must point to an existing FleetEquipment record and a maintenance schedule for that same asset.');
    const meterRuleGroups = groupBy(meterRules,(rule:any)=>String(rule.maintenance_task_id || ''));
    const duplicateMeterRules:any[] = [];
    for (const [taskId,rows] of meterRuleGroups) if (rows.length > 1) duplicateMeterRules.push({maintenance_task_id:taskId,rule_ids:rows.map((row:any)=>row.id)});
    add('error','duplicate_meter_rules_for_schedule','Maintenance schedules with multiple mileage/hour rules',duplicateMeterRules,'A FleetMaintenanceTask may have at most one meter rule so date-or-meter generation remains deterministic.');

    const badEstimateWo = repairEstimates.filter((row:any)=>!workOrderIds.has(row.work_order_id));
    add('error','repair_estimate_missing_work_order','Repair estimates pointing to missing Fleet work orders',badEstimateWo.map((row:any)=>({id:row.id,work_order_id:row.work_order_id,equipment_id:row.equipment_id||''})),'Fleet repair estimates must stay attached to FleetMaintenanceWorkOrder only.');
    const mismatchedEstimates = repairEstimates.filter((row:any)=>{
      const wo:any = workOrderById.get(row.work_order_id);
      return wo && row.equipment_id && wo.equipment_id && row.equipment_id !== wo.equipment_id;
    });
    add('error','repair_estimate_equipment_mismatch','Repair estimate and work-order equipment do not match',mismatchedEstimates.map((row:any)=>({id:row.id,work_order_id:row.work_order_id,equipment_id:row.equipment_id,work_order_equipment_id:(workOrderById.get(row.work_order_id) as any)?.equipment_id||''})),'Repair-estimate equipment identity must match its Fleet maintenance work order.');
    const estimateGroups = groupBy(repairEstimates,(row:any)=>String(row.work_order_id || ''));
    const duplicateEstimates:any[] = [];
    for (const [workOrderId,rows] of estimateGroups) if (rows.length > 1) duplicateEstimates.push({work_order_id:workOrderId,estimate_ids:rows.map((row:any)=>row.id)});
    add('error','duplicate_repair_estimates','Fleet work orders with multiple repair estimates',duplicateEstimates,'Each Fleet maintenance work order may have at most one repair-estimate/approval record.');

    const badLifecycle = lifecycleProfiles.filter((row:any)=>!equipmentIds.has(row.equipment_id));
    add('error','lifecycle_missing_equipment','Lifecycle profiles pointing to missing equipment',badLifecycle.map((row:any)=>({id:row.id,equipment_id:row.equipment_id})),'Lifecycle planning must point to current FleetEquipment.');
    const lifecycleGroups = groupBy(lifecycleProfiles,(row:any)=>String(row.equipment_id || ''));
    const duplicateLifecycle:any[] = [];
    for (const [equipmentId,rows] of lifecycleGroups) if (rows.length > 1) duplicateLifecycle.push({equipment_id:equipmentId,profile_ids:rows.map((row:any)=>row.id)});
    add('error','duplicate_lifecycle_profiles','Equipment with multiple lifecycle profiles',duplicateLifecycle,'Each Fleet asset should have one lifecycle/replacement-planning profile.');

    add('error','fuel_entry_missing_equipment','Fuel entries pointing to missing equipment',fuelEntries.filter((row:any)=>!equipmentIds.has(row.equipment_id)).map((row:any)=>({id:row.id,equipment_id:row.equipment_id,fueled_at:row.fueled_at||''})),'Fleet fuel history must stay linked to a current FleetEquipment identity.');
    add('error','warranty_missing_equipment','Warranty records pointing to missing equipment',warranties.filter((row:any)=>!equipmentIds.has(row.equipment_id)).map((row:any)=>({id:row.id,equipment_id:row.equipment_id,name:row.name||''})),'Fleet warranty coverage must stay linked to FleetEquipment.');
    add('error','reservation_missing_equipment','Reservations pointing to missing equipment',reservations.filter((row:any)=>!equipmentIds.has(row.equipment_id)).map((row:any)=>({id:row.id,equipment_id:row.equipment_id,status:row.status||''})),'Fleet reservations/assignments must point to current FleetEquipment.');
    const activeReservationGroups = groupBy(reservations.filter((row:any)=>['reserved','checked_out'].includes(row.status)),(row:any)=>String(row.equipment_id || ''));
    const reservationConflicts:any[] = [];
    for (const [equipmentId,rows] of activeReservationGroups) {
      for (let i=0;i<rows.length;i+=1) for (let j=i+1;j<rows.length;j+=1) {
        const a:any=rows[i], b:any=rows[j];
        const aStart=Date.parse(a.start_at||''), aEnd=Date.parse(a.end_at||''), bStart=Date.parse(b.start_at||''), bEnd=Date.parse(b.end_at||'');
        const checkedOut = a.status === 'checked_out' || b.status === 'checked_out';
        const overlap = [aStart,aEnd,bStart,bEnd].every(Number.isFinite) && aStart < bEnd && bStart < aEnd;
        if (checkedOut || overlap) reservationConflicts.push({equipment_id:equipmentId,reservation_ids:[a.id,b.id],statuses:[a.status,b.status]});
      }
    }
    add('error','active_reservation_conflict','Conflicting active reservations/checkouts',reservationConflicts,'The reservation action prevents overlapping active assignments. Existing conflicts require admin review rather than automatic deletion.');

    const dashboardGroups = groupBy(dashboardPreferences,(row:any)=>normIdentity(row.user_email));
    const duplicateDashboardPreferences:any[] = [];
    for (const [email,rows] of dashboardGroups) if (rows.length > 1) duplicateDashboardPreferences.push({user_email:email,preference_ids:rows.map((row:any)=>row.id)});
    add('warning','duplicate_dashboard_preferences','Users with multiple Fleet dashboard preferences',duplicateDashboardPreferences,'Dashboard customization is one preference row per signed-in user.');

    const enabledPolicies = approvalPolicies.filter((row:any)=>row.enabled !== false).slice().sort((a:any,b:any)=>Number(a.minimum_amount||0)-Number(b.minimum_amount||0));
    const overlappingPolicies:any[] = [];
    for (let i=0;i<enabledPolicies.length;i+=1) for (let j=i+1;j<enabledPolicies.length;j+=1) {
      const a:any=enabledPolicies[i], b:any=enabledPolicies[j];
      const aMin=Math.max(0,Number(a.minimum_amount||0)), bMin=Math.max(0,Number(b.minimum_amount||0));
      const aMax=Number(a.maximum_amount||0)>0?Number(a.maximum_amount):Infinity;
      const bMax=Number(b.maximum_amount||0)>0?Number(b.maximum_amount):Infinity;
      if (aMin <= bMax && bMin <= aMax) overlappingPolicies.push({policy_ids:[a.id,b.id],names:[a.name||'',b.name||''],ranges:[[aMin,Number.isFinite(aMax)?aMax:null],[bMin,Number.isFinite(bMax)?bMax:null]]});
    }
    add('warning','overlapping_repair_approval_policies','Enabled repair-approval tiers with overlapping amount ranges',overlappingPolicies,'Overlapping tiers make policy selection order-sensitive. Adjust ranges so one estimate amount maps to one intended approval tier.');

    const badIdentificationPromotions = partIdentifications.filter((row:any)=>row.promoted_part_id && !partIds.has(row.promoted_part_id));
    add('warning','part_identification_missing_promoted_part','Part-identification records pointing to missing promoted parts',badIdentificationPromotions.map((row:any)=>({id:row.id,promoted_part_id:row.promoted_part_id,status:row.status||''})),'Promoted identification history should resolve to the FleetPart it created or matched.');
    const badIdentificationEquipment:any[] = [];
    for (const row of partIdentifications) for (const id of [...(row.confirmed_equipment_ids||[]),...(row.suggested_equipment_ids||[])]) if (id && !equipmentIds.has(id)) badIdentificationEquipment.push({id:row.id,equipment_id:id,status:row.status||''});
    add('warning','part_identification_missing_equipment','Part-identification fitment references missing equipment',badIdentificationEquipment,'AI suggestions and confirmed fitment references should resolve to current FleetEquipment records.');

    const emptyInspectionTemplates = inspectionTemplates.filter((row:any)=>row.active !== false && (!Array.isArray(row.items) || row.items.length === 0));
    add('warning','active_inspection_template_empty','Active inspection templates with no checklist items',emptyInspectionTemplates.map((row:any)=>({id:row.id,name:row.name||'',inspection_type:row.inspection_type||''})),'An active Fleet inspection template should contain at least one checklist item.');
    const badInspections = inspections.filter((row:any)=>!equipmentIds.has(row.equipment_id) || !inspectionTemplateIds.has(row.template_id));
    add('error','inspection_broken_link','Inspections pointing to missing equipment or templates',badInspections.map((row:any)=>({id:row.id,equipment_id:row.equipment_id,template_id:row.template_id,status:row.status||''})),'Fleet inspections must retain their equipment and inspection-template relationships.');
    const badInspectionWorkOrders:any[] = [];
    for (const inspection of inspections) for (const id of inspection.generated_work_order_ids || []) if (id && !workOrderIds.has(id)) badInspectionWorkOrders.push({inspection_id:inspection.id,work_order_id:id});
    add('error','inspection_missing_generated_work_order','Inspections referencing missing generated Fleet work orders',badInspectionWorkOrders,'Failed inspection follow-up IDs must resolve to FleetMaintenanceWorkOrder records.');
    const incompleteCompletedInspections = inspections.filter((row:any)=>['passed','failed'].includes(row.status) && !row.completed_at);
    add('warning','completed_inspection_missing_timestamp','Passed/failed inspections without completion timestamps',incompleteCompletedInspections.map((row:any)=>({id:row.id,status:row.status,equipment_id:row.equipment_id})),'Completed inspection history should carry a completion timestamp.');

    const unresolvedReceipts = receipts.filter((r:any)=>['started','failed'].includes(r.status));
    add('error','unresolved_operation_receipts','Unresolved Fleet operation receipts',unresolvedReceipts.map((r:any)=>({id:r.id,operation_key:r.operation_key,operation_type:r.operation_type,status:r.status,error:r.error_message || ''})),'Unresolved receipts can indicate an interrupted or ambiguous side effect and must not be silently replayed.');
    const unresolvedQueue = queue.filter((r:any)=>['pending','sending','failed'].includes(r.status));
    add('warning','unresolved_notification_queue','Unresolved Fleet notification jobs',unresolvedQueue.map((r:any)=>({id:r.id,event_type:r.event_type,status:r.status,attempts:r.attempts,last_error:r.last_error || ''})),'Pending/sending/failed email jobs should be visible to Fleet admins.');

    const severityWeight:any = { error:3, warning:2, info:1 };
    findings.sort((a,b)=>(severityWeight[b.severity]||0)-(severityWeight[a.severity]||0) || a.code.localeCompare(b.code));
    const counts = findings.reduce((acc:any,f:any)=>{acc[f.severity]=(acc[f.severity]||0)+f.count; return acc;},{error:0,warning:0,info:0});

    return Response.json({
      success:true,
      generated_at:new Date().toISOString(),
      summary:{
        health:counts.error ? 'error' : counts.warning ? 'warning' : 'healthy',
        error_count:counts.error,
        warning_count:counts.warning,
        info_count:counts.info,
        finding_groups:findings.length,
        totals:{equipment:equipment.length,maintenance_tasks:tasks.length,work_orders:workOrders.length,parts:parts.length,fluids:fluids.length,equipment_logs:logs.length,requests:requests.length,bouncie_live_rows:liveState.length},
      },
      findings,
    });
  } catch (error) {
    console.error('fleetIntegrityAudit error:', error);
    return Response.json({ error:error?.message || 'Fleet integrity audit failed.' }, { status:500 });
  }
});

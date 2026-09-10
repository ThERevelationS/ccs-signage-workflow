import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const PAGE_SIZE = 1000;
const MAX_ROWS = 20000;
const ACTIVE_WO = new Set(['open','assigned','in_progress']);

async function listAll(entity:any, sort='created_date') {
  const out:any[] = [];
  for (let skip=0; skip<MAX_ROWS; skip+=PAGE_SIZE) {
    const rows = await entity.list(sort, PAGE_SIZE, skip);
    out.push(...(rows || []));
    if (!rows || rows.length < PAGE_SIZE) return out;
  }
  throw new Error('Fleet integrity audit exceeded its safety row limit.');
}

const normVin = (value:any) => String(value || '').trim().toUpperCase();
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
    const [equipment,tasks,workOrders,parts,fluids,logs,requests,metadata,liveState,receipts,queue] = await Promise.all([
      listAll(E.FleetEquipment,'name'),
      listAll(E.FleetMaintenanceTask,'-created_date'),
      listAll(E.FleetMaintenanceWorkOrder,'-created_date'),
      listAll(E.FleetPart,'part_name'),
      listAll(E.FleetFluid,'fluid_name'),
      listAll(E.FleetEquipmentLog,'-created_date'),
      listAll(E.FleetPartFluidRequest,'-created_date'),
      listAll(E.FleetVehicleMetadata,'-created_date'),
      listAll(E.BouncieVehicleLiveState,'-last_seen_at'),
      listAll(E.FleetOperationReceipt,'-created_date'),
      listAll(E.FleetNotificationQueue,'-created_date'),
    ]);

    const equipmentIds = new Set(equipment.map((r:any)=>r.id));
    const taskById = new Map(tasks.map((r:any)=>[r.id,r]));
    const partIds = new Set(parts.map((r:any)=>r.id));
    const fluidIds = new Set(fluids.map((r:any)=>r.id));
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

    const badWoTask = workOrders.filter((wo:any)=>wo.maintenance_task_id && !taskById.has(wo.maintenance_task_id));
    add('error','work_order_missing_task','Work orders point to missing maintenance schedules',badWoTask.map((wo:any)=>({id:wo.id,work_order_number:wo.work_order_number,maintenance_task_id:wo.maintenance_task_id})),'A linked maintenance schedule no longer exists.');

    const mismatchedWoTask = workOrders.filter((wo:any)=>{
      if (!wo.maintenance_task_id || !wo.equipment_id) return false;
      const task:any = taskById.get(wo.maintenance_task_id);
      return task && task.equipment_id !== wo.equipment_id;
    });
    add('error','work_order_task_equipment_mismatch','Work order and schedule equipment do not match',mismatchedWoTask.map((wo:any)=>({id:wo.id,work_order_number:wo.work_order_number,equipment_id:wo.equipment_id,maintenance_task_id:wo.maintenance_task_id,task_equipment_id:taskById.get(wo.maintenance_task_id)?.equipment_id})),'A work order linked to a schedule must use the same FleetEquipment record.');

    const taskActiveGroups = groupBy(workOrders.filter((wo:any)=>wo.maintenance_task_id && ACTIVE_WO.has(wo.status)), (wo:any)=>String(wo.maintenance_task_id));
    const duplicateActiveScheduled:any[] = [];
    for (const [taskId,rows] of taskActiveGroups) if (rows.length > 1) duplicateActiveScheduled.push({maintenance_task_id:taskId,work_orders:rows.map((wo:any)=>wo.work_order_number)});
    add('warning','multiple_active_work_orders_for_task','Maintenance schedules with multiple active work orders',duplicateActiveScheduled,'Automatic generation is designed to keep one active work order per maintenance schedule.');

    const badPartCompatibility:any[] = [];
    for (const part of parts) for (const id of part.compatible_equipment_ids || []) if (!equipmentIds.has(id)) badPartCompatibility.push({id:part.id,item:part.part_name,equipment_id:id});
    add('warning','part_compatibility_missing_equipment','Parts reference missing compatible equipment',badPartCompatibility,'Compatibility links should point only to current FleetEquipment records.');
    const badFluidCompatibility:any[] = [];
    for (const fluid of fluids) for (const id of fluid.compatible_equipment_ids || []) if (!equipmentIds.has(id)) badFluidCompatibility.push({id:fluid.id,item:fluid.fluid_name,equipment_id:id});
    add('warning','fluid_compatibility_missing_equipment','Fluids reference missing compatible equipment',badFluidCompatibility,'Compatibility links should point only to current FleetEquipment records.');

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
    add('warning','duplicate_bouncie_live_state','Duplicate Bouncie live-state rows',duplicateLive,'This is a preserved pre-existing Bouncie condition. Do not deduplicate automatically without validating webhook ownership.');

    const liveVins = new Set(Array.from(liveVinGroups.keys()));
    const brokenMatched = equipment.filter((eq:any)=>['matched','manual'].includes(eq.bouncie_link_status) && (!normVin(eq.vin) || !liveVins.has(normVin(eq.vin))));
    add('warning','matched_equipment_without_live_bouncie','Bouncie-linked equipment without a live-state VIN',brokenMatched.map((eq:any)=>({id:eq.id,name:eq.name,vin:eq.vin || '',link_status:eq.bouncie_link_status})),'Matched/manual links should resolve to current Bouncie live state; unlinked road assets are not considered errors.');
    add('warning','ambiguous_bouncie_equipment_link','Equipment marked with ambiguous Bouncie link',equipment.filter((eq:any)=>eq.bouncie_link_status === 'ambiguous').map((eq:any)=>({id:eq.id,name:eq.name,vin:eq.vin || ''})),'Ambiguous VIN matching requires admin review and is never auto-resolved.');

    const metadataGroups = groupBy(metadata,(r:any)=>normVin(r.vehicle_vin));
    const duplicateMetadata:any[] = [];
    for (const [vin,rows] of metadataGroups) if (rows.length > 1) duplicateMetadata.push({vin,rows:rows.map((r:any)=>({id:r.id}))});
    add('warning','duplicate_vehicle_metadata','Duplicate FleetVehicleMetadata VIN rows',duplicateMetadata,'CCS vehicle metadata should have one row per VIN.');

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

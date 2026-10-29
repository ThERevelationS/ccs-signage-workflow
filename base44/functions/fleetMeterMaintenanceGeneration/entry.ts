import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { loadAllEntityRows } from '../../shared/pagedEntityRows.ts';
import { resolveFleetMeterReading, fleetMeterState } from '../../shared/fleetMeterReading.ts';
import { getCanonicalCutoverState } from '../../shared/fleetCutoverState.ts';

const ACTIVE = new Set(['open','assigned','in_progress']);
const TASK_READY = new Set(['pending','overdue']);
const STALE_MS = 30 * 60 * 1000;
const nowIso = () => new Date().toISOString();
const today = () => new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const canonical = (rows:any[]=[]) => rows.slice().sort((a,b)=>String(a.id||'').localeCompare(String(b.id||'')))[0] || null;
const thresholdKey = (value:any) => Number(value).toFixed(3).replace(/\.?0+$/,'');

async function claim(Receipt:any,key:string,rule:any,reading:any) {
  const applied = canonical(await Receipt.filter({operation_key:key,status:'applied'}));
  if (applied) return {owner:false,applied:true,receipt:applied};
  let started = canonical(await Receipt.filter({operation_key:key,status:'started'}));
  if (started) {
    const age = Date.now() - (Date.parse(started.started_at || started.created_date || '') || Date.now());
    if (age < STALE_MS) return {owner:false,applied:false,receipt:started};
    const token = crypto.randomUUID();
    await Receipt.update(started.id,{started_at:nowIso(),error_message:'',result_summary:{...(started.result_summary||{}),recovery_token:token,recovered_at:nowIso()}});
    await new Promise(r=>setTimeout(r,75));
    started = await Receipt.get(started.id);
    if (started?.result_summary?.recovery_token !== token) return {owner:false,applied:false,receipt:started};
    return {owner:true,applied:false,receipt:started};
  }
  const failed = canonical(await Receipt.filter({operation_key:key,status:'failed'}));
  if (failed) return {owner:false,applied:false,failed:true,receipt:failed};
  const generationDate = today();
  const created = await Receipt.create({operation_key:key,operation_type:'meter_generation',target_entity:'FleetMaintenanceMeterRule',target_id:rule.id,status:'started',started_at:nowIso(),result_summary:{generation_date:generationDate,threshold:Number(rule.next_due_value),reading:Number(reading.value),source:reading.source,unit:reading.unit,maintenance_task_id:rule.maintenance_task_id,equipment_id:rule.equipment_id}});
  await new Promise(r=>setTimeout(r,75));
  const contenders = await Receipt.filter({operation_key:key,status:'started'});
  const winner = canonical(contenders) || created;
  if (winner.id !== created.id) { await Receipt.delete(created.id).catch(()=>null); return {owner:false,applied:false,receipt:winner}; }
  return {owner:true,applied:false,receipt:created};
}

async function log(base44:any,level:string,message:string,details:any) {
  await base44.asServiceRole.entities.FleetSystemLog.create({source:'fleetMeterMaintenanceGeneration',level,message,details}).catch(()=>null);
}

Deno.serve(async req => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(()=>null);
    if (!user || user.role !== 'admin') return Response.json({error:'Forbidden'},{status:403});
    const cutover = await getCanonicalCutoverState(base44);
    if (!cutover?.maintenance_generation_enabled) return Response.json({success:true,disabled:true,due:0,created:0,results:[]});

    const Rule = base44.asServiceRole.entities.FleetMaintenanceMeterRule;
    const Task = base44.asServiceRole.entities.FleetMaintenanceTask;
    const Equipment = base44.asServiceRole.entities.FleetEquipment;
    const WorkOrder = base44.asServiceRole.entities.FleetMaintenanceWorkOrder;
    const Receipt = base44.asServiceRole.entities.FleetOperationReceipt;
    const [rules,tasks,equipmentRows] = await Promise.all([
      loadAllEntityRows({entity:Rule,sort:'-created_date',label:'Fleet meter maintenance rules'}),
      loadAllEntityRows({entity:Task,sort:'-created_date',label:'Fleet schedules for meter generation'}),
      loadAllEntityRows({entity:Equipment,sort:'name',label:'Fleet equipment for meter generation'}),
    ]);
    const taskById = new Map(tasks.map((row:any)=>[row.id,row]));
    const equipmentById = new Map(equipmentRows.map((row:any)=>[row.id,row]));
    const results:any[] = [];

    for (const rule of rules.filter((row:any)=>row.enabled !== false)) {
      const task:any = taskById.get(rule.maintenance_task_id);
      const equipment:any = equipmentById.get(rule.equipment_id);
      if (!task) { results.push({rule_id:rule.id,status:'error',reason:'task_missing'}); continue; }
      if (!equipment) { results.push({rule_id:rule.id,status:'error',reason:'equipment_missing'}); continue; }
      if (equipment.status === 'retired') { results.push({rule_id:rule.id,status:'skipped',reason:'equipment_retired'}); continue; }
      if (task.equipment_id !== equipment.id) { results.push({rule_id:rule.id,status:'error',reason:'task_equipment_mismatch'}); continue; }
      if (!TASK_READY.has(task.status)) { results.push({rule_id:rule.id,status:'skipped',reason:'task_not_ready',task_status:task.status}); continue; }
      const reading = await resolveFleetMeterReading(base44,equipment,rule);
      const state = fleetMeterState(rule,reading);
      if (state.state !== 'due') { results.push({rule_id:rule.id,status:'skipped',reason:state.state,reading:reading.value,next_due:rule.next_due_value}); continue; }

      const existingOrders = await loadAllEntityRows({entity:WorkOrder,query:{maintenance_task_id:task.id},sort:'-created_date',label:`Fleet work orders for meter task ${task.id}`});
      const active = existingOrders.find((wo:any)=>ACTIVE.has(wo.status));
      if (active) { results.push({rule_id:rule.id,status:'skipped',reason:'active_work_order_exists',work_order_id:active.id}); continue; }

      const key = `fleetmeter:${rule.id}:due:${thresholdKey(rule.next_due_value)}`;
      const receipt = await claim(Receipt,key,rule,reading);
      if (receipt.applied) { results.push({rule_id:rule.id,status:'reused',work_order_id:receipt.receipt?.result_summary?.work_order_id||''}); continue; }
      if (!receipt.owner) { results.push({rule_id:rule.id,status:receipt.failed?'error':'in_progress_elsewhere',reason:receipt.failed?'failed_generation_receipt_needs_review':'claim_owned_elsewhere'}); continue; }

      try {
        const currentRule = await Rule.get(rule.id);
        const currentTask = await Task.get(task.id);
        const currentEquipment = await Equipment.get(equipment.id);
        const currentReading = await resolveFleetMeterReading(base44,currentEquipment,currentRule);
        const currentState = fleetMeterState(currentRule,currentReading);
        if (currentRule.enabled === false || currentState.state !== 'due' || !TASK_READY.has(currentTask.status) || Number(currentRule.next_due_value) !== Number(rule.next_due_value)) {
          await Receipt.update(receipt.receipt.id,{status:'applied',applied_at:nowIso(),result_summary:{...(receipt.receipt.result_summary||{}),skipped:true,skip_reason:'rule_or_reading_changed'}});
          results.push({rule_id:rule.id,status:'skipped',reason:'rule_or_reading_changed'});
          continue;
        }
        const activeNow = (await loadAllEntityRows({entity:WorkOrder,query:{maintenance_task_id:task.id},sort:'-created_date',label:`Fleet active work check for meter task ${task.id}`})).find((wo:any)=>ACTIVE.has(wo.status));
        if (activeNow) {
          await Receipt.update(receipt.receipt.id,{status:'applied',applied_at:nowIso(),result_summary:{...(receipt.receipt.result_summary||{}),skipped:true,skip_reason:'active_work_order_exists',work_order_id:activeNow.id}});
          results.push({rule_id:rule.id,status:'skipped',reason:'active_work_order_exists',work_order_id:activeNow.id});
          continue;
        }
        const generationDate = String(receipt.receipt?.result_summary?.generation_date || today());
        const operationKey = `${generationDate}-meter-${rule.id}-${thresholdKey(rule.next_due_value)}`;
        const response = await base44.asServiceRole.functions.invoke('fleetWorkOrderAction',{
          action:'create',
          operation_key:operationKey,
          maintenance_task_expected_updated_date:currentTask.updated_date || '',
          work_order:{equipment_id:currentEquipment.id,maintenance_task_id:currentTask.id,title:currentTask.title,description:`Meter-triggered maintenance: ${currentTask.title}. Current ${currentReading.unit}: ${currentReading.value}; due at ${currentRule.next_due_value}.`,type:'scheduled',priority:currentTask.priority||'medium',status:'open',assigned_to:currentTask.assigned_to||'',notes:`Generated from Fleet meter rule ${currentRule.id} (${currentRule.trigger_mode||'date_or_meter'}).`}
        });
        if (response?.data?.error) throw new Error(response.data.error);
        const created = response?.data?.work_order;
        if (!created?.id) throw new Error('Meter-triggered work order creation returned no work order.');
        await Receipt.update(receipt.receipt.id,{status:'applied',applied_at:nowIso(),error_message:'',result_summary:{...(receipt.receipt.result_summary||{}),work_order_id:created.id,work_order_number:created.work_order_number,operation_key:operationKey}});
        results.push({rule_id:rule.id,status:response?.data?.reused?'recovered':'created',work_order_id:created.id,work_order_number:created.work_order_number,reading:currentReading.value,next_due:currentRule.next_due_value});
      } catch (error:any) {
        await Receipt.update(receipt.receipt.id,{status:'failed',failed_at:nowIso(),error_message:error?.message||String(error),result_summary:{...(receipt.receipt.result_summary||{}),safe_retry:false}}).catch(()=>null);
        results.push({rule_id:rule.id,status:'error',error:error?.message||String(error)});
      }
    }

    const created = results.filter(row=>row.status==='created').length;
    const errors = results.filter(row=>row.status==='error').length;
    const due = results.filter(row=>['created','recovered','reused','in_progress_elsewhere'].includes(row.status) || row.reason==='active_work_order_exists').length;
    await log(base44,errors?'warning':'info','Fleet meter maintenance generation run completed.',{rules:rules.length,due,created,errors});
    return Response.json({success:true,disabled:false,due,created,results});
  } catch (error:any) {
    console.error('fleetMeterMaintenanceGeneration error:',error);
    return Response.json({error:error?.message||'Fleet meter maintenance generation failed.'},{status:500});
  }
});

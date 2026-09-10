import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { loadAllEntityRows } from '../../shared/pagedEntityRows.ts';

const ACTIVE = new Set(['open','assigned','in_progress']);
const DUE_TASK_STATUSES = new Set(['pending','overdue']);
const STALE_CLAIM_MS = 30 * 60 * 1000;
const nowIso = () => new Date().toISOString();
const todayEastern = () => new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const canonical = (rows:any[]=[]) => rows.slice().sort((a,b)=>String(a.id||'').localeCompare(String(b.id||'')))[0] || null;

async function logRun(base44:any, level:'info'|'warning'|'error', message:string, details:any={}) {
  await base44.asServiceRole.entities.FleetSystemLog.create({source:'fleetScheduledMaintenanceGeneration',level,message,details}).catch(()=>null);
}

function workOrderNumber(task:any) {
  const date = String(task.start_date || todayEastern()).replaceAll('-','');
  return `FWO-${date}-${String(task.id || '').slice(-6).toUpperCase()}`;
}

async function claim(Receipt:any, key:string, task:any) {
  const applied = canonical(await Receipt.filter({operation_key:key,status:'applied'}));
  if (applied) return {applied:true,owner:false,receipt:applied};
  const started = canonical(await Receipt.filter({operation_key:key,status:'started'}));
  if (started) {
    const startedAt = Date.parse(started.started_at || started.created_date || '') || 0;
    if (!startedAt || (Date.now() - startedAt) < STALE_CLAIM_MS) return {applied:false,owner:false,receipt:started};

    // A serverless invocation cannot legitimately hold this claim for 30 minutes.
    // Reclaim the same durable receipt using a nonce so concurrent recovery attempts
    // elect one owner instead of creating another receipt for the same due cycle.
    const recoveryToken = crypto.randomUUID();
    const recoveryStamp = nowIso();
    await Receipt.update(started.id, {
      started_at: recoveryStamp,
      error_message: '',
      result_summary: {
        ...(started.result_summary || {}),
        recovery_claim_token: recoveryToken,
        recovery_claimed_at: recoveryStamp,
      },
    });
    await new Promise(r=>setTimeout(r,75));
    const refreshed = await Receipt.get(started.id);
    if (refreshed?.result_summary?.recovery_claim_token !== recoveryToken) {
      return {applied:false,owner:false,receipt:refreshed || started};
    }
    return {applied:false,owner:true,receipt:refreshed,recoveredClaim:true};
  }
  const created = await Receipt.create({operation_key:key,operation_type:'scheduled_generation',target_entity:'FleetMaintenanceTask',target_id:task.id,status:'started',started_at:nowIso(),result_summary:{due_date:task.start_date,title:task.title}});
  await new Promise(r=>setTimeout(r,75));
  const contenders = await Receipt.filter({operation_key:key,status:'started'});
  const winner = canonical(contenders) || created;
  if (winner.id !== created.id) {
    await Receipt.delete(created.id).catch(()=>null);
    return {applied:false,owner:false,receipt:winner};
  }
  return {applied:false,owner:true,receipt:created};
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(()=>null);
    if (!user || user.role !== 'admin') return Response.json({error:'Forbidden'},{status:403});

    const cutoverRows = await base44.asServiceRole.entities.FleetCutoverState.filter({state_key:'primary'});
    const cutover = cutoverRows?.[0];
    if (!cutover?.maintenance_generation_enabled) return Response.json({success:true,disabled:true,created:0});

    const Task = base44.asServiceRole.entities.FleetMaintenanceTask;
    const WorkOrder = base44.asServiceRole.entities.FleetMaintenanceWorkOrder;
    const Receipt = base44.asServiceRole.entities.FleetOperationReceipt;
    const today = todayEastern();
    const due = (await loadAllEntityRows({ entity:Task, sort:'-created_date', label:'Fleet maintenance schedules' })).filter((task:any)=>DUE_TASK_STATUSES.has(task.status) && task.start_date && task.start_date<=today);
    const results:any[] = [];

    for (const task of due) {
      const key = `fleetmaint:${task.id}:due:${task.start_date}`;
      const existingOrders = await loadAllEntityRows({ entity:WorkOrder, query:{maintenance_task_id:task.id}, sort:'-created_date', label:`Fleet work orders for maintenance task ${task.id}` });
      const exact = canonical(existingOrders.filter((wo:any)=>wo.generation_key===key));

      // Recover cleanly if a prior invocation created the work order but stopped
      // before advancing the task and applying its operation receipt.
      if (exact) {
        if (task.status !== 'in_progress' || task.generation_key !== key || task.last_generated_for_date !== task.start_date) {
          await Task.update(task.id,{status:'in_progress',generation_key:key,last_generated_for_date:task.start_date});
        }
        const appliedReceipt = canonical(await Receipt.filter({operation_key:key,status:'applied'}));
        const startedReceipt = canonical(await Receipt.filter({operation_key:key,status:'started'}));
        if (!appliedReceipt && startedReceipt) {
          await Receipt.update(startedReceipt.id,{status:'applied',applied_at:nowIso(),error_message:'',result_summary:{...(startedReceipt.result_summary||{}),work_order_id:exact.id,work_order_number:exact.work_order_number,recovered:true}});
        }
        results.push({task_id:task.id,status:'recovered',reason:'generation_key_exists',work_order_id:exact.id,work_order_number:exact.work_order_number});
        continue;
      }

      const active = existingOrders.find((wo:any)=>ACTIVE.has(wo.status));
      if (active) {
        results.push({task_id:task.id,status:'skipped',reason:'active_work_order_exists',work_order_id:active.id});
        continue;
      }

      const receipt = await claim(Receipt,key,task);
      if (receipt.applied) {
        const found = canonical(await WorkOrder.filter({generation_key:key}));
        results.push({task_id:task.id,status:'reused',work_order_id:found?.id||''});
        continue;
      }
      if (!receipt.owner) {
        const found = canonical(await WorkOrder.filter({generation_key:key}));
        if (found) {
          await Task.update(task.id,{status:'in_progress',generation_key:key,last_generated_for_date:task.start_date});
          await Receipt.update(receipt.receipt.id,{status:'applied',applied_at:nowIso(),result_summary:{...(receipt.receipt.result_summary||{}),work_order_id:found.id,recovered:true}});
          results.push({task_id:task.id,status:'recovered',work_order_id:found.id});
        } else {
          results.push({task_id:task.id,status:'in_progress_elsewhere'});
        }
        continue;
      }

      try {
        const fresh = await Task.get(task.id);
        if (!fresh || !DUE_TASK_STATUSES.has(fresh.status) || !fresh.start_date || fresh.start_date>today) {
          await Receipt.update(receipt.receipt.id,{status:'failed',failed_at:nowIso(),error_message:'Task changed before generation.'});
          results.push({task_id:task.id,status:'skipped',reason:'task_changed'});
          continue;
        }
        const activeNow = (await loadAllEntityRows({ entity:WorkOrder, query:{maintenance_task_id:task.id}, sort:'-created_date', label:`Fleet work orders for maintenance task ${task.id}` })).find((wo:any)=>ACTIVE.has(wo.status));
        if (activeNow) {
          await Receipt.update(receipt.receipt.id,{status:'applied',applied_at:nowIso(),result_summary:{existing_work_order_id:activeNow.id,skipped:true}});
          results.push({task_id:task.id,status:'skipped',reason:'active_work_order_exists',work_order_id:activeNow.id});
          continue;
        }

        const number = workOrderNumber(fresh);
        const byKey = canonical(await WorkOrder.filter({generation_key:key}));
        const byNumber = canonical(await WorkOrder.filter({work_order_number:number}));
        const created = byKey || byNumber || await WorkOrder.create({
          work_order_number:number,
          equipment_id:fresh.equipment_id,
          maintenance_task_id:fresh.id,
          title:fresh.title,
          description:fresh.description || `Scheduled maintenance: ${fresh.title}`,
          type:'scheduled',
          priority:fresh.priority || 'medium',
          status:'open',
          assigned_to:fresh.assigned_to || '',
          generation_key:key,
        });
        await Task.update(fresh.id,{status:'in_progress',generation_key:key,last_generated_for_date:fresh.start_date});
        const stamp = nowIso();
        await Receipt.update(receipt.receipt.id,{status:'applied',applied_at:stamp,result_summary:{work_order_id:created.id,work_order_number:created.work_order_number}});
        await base44.asServiceRole.functions.invoke('fleetNotificationDispatcher',{event_type:'work_order_created',target_id:created.id,event_token:key}).catch(()=>null);
        results.push({task_id:fresh.id,status:byKey||byNumber?'recovered':'created',work_order_id:created.id,work_order_number:created.work_order_number});
      } catch (error) {
        const message = error?.message || String(error);
        await Receipt.update(receipt.receipt.id,{status:'failed',failed_at:nowIso(),error_message:message}).catch(()=>null);
        results.push({task_id:task.id,status:'error',error:message});
      }
    }

    const createdCount = results.filter(r=>r.status==='created').length;
    const recoveredCount = results.filter(r=>r.status==='recovered').length;
    const errorCount = results.filter(r=>r.status==='error').length;
    const skippedCount = results.filter(r=>['skipped','reused','in_progress_elsewhere'].includes(r.status)).length;
    await logRun(base44, errorCount ? 'warning' : 'info', 'Fleet scheduled maintenance generation run completed.', {date:today,due:due.length,created:createdCount,recovered:recoveredCount,skipped:skippedCount,errors:errorCount});
    return Response.json({success:true,disabled:false,date:today,due:due.length,created:createdCount,results});
  } catch (error) {
    console.error('fleetScheduledMaintenanceGeneration error:',error);
    try { await logRun(createClientFromRequest(req),'error','Fleet scheduled maintenance generation failed.',{error:error?.message || String(error)}); } catch {}
    return Response.json({error:error?.message || 'Fleet scheduled maintenance generation failed.'},{status:500});
  }
});
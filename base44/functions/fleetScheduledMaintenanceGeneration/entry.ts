import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const ACTIVE = new Set(['open','assigned','in_progress']);
const nowIso = () => new Date().toISOString();
const todayEastern = () => new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const canonical = (rows:any[]=[]) => rows.slice().sort((a,b)=>String(a.id||'').localeCompare(String(b.id||'')))[0] || null;

function workOrderNumber(task:any) {
  const date = String(task.start_date || todayEastern()).replaceAll('-','');
  return `FWO-${date}-${String(task.id || '').slice(-6).toUpperCase()}`;
}

async function claim(Receipt:any, key:string, task:any) {
  const applied = canonical(await Receipt.filter({operation_key:key,status:'applied'}));
  if (applied) return {applied:true,owner:false,receipt:applied};
  const started = canonical(await Receipt.filter({operation_key:key,status:'started'}));
  if (started) return {applied:false,owner:false,receipt:started};
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
    if (user && user.role !== 'admin') return Response.json({error:'Forbidden'},{status:403});

    const settingsRows = await base44.asServiceRole.entities.FleetSettings.filter({setting_type:'general'});
    const settings = settingsRows?.[0];
    if (!settings?.maintenance_generation_enabled) return Response.json({success:true,disabled:true,created:0});

    const Task = base44.asServiceRole.entities.FleetMaintenanceTask;
    const WorkOrder = base44.asServiceRole.entities.FleetMaintenanceWorkOrder;
    const Receipt = base44.asServiceRole.entities.FleetOperationReceipt;
    const today = todayEastern();
    const due = (await Task.list()).filter((task:any)=>task.status==='pending' && task.start_date && task.start_date<=today);
    const results:any[] = [];

    for (const task of due) {
      const key = `fleetmaint:${task.id}:due:${task.start_date}`;
      const existingOrders = await WorkOrder.filter({maintenance_task_id:task.id});
      const active = existingOrders.find((wo:any)=>ACTIVE.has(wo.status));
      const exact = existingOrders.find((wo:any)=>wo.generation_key===key);
      if (active || exact) {
        results.push({task_id:task.id,status:'skipped',reason:active?'active_work_order_exists':'generation_key_exists',work_order_id:(active||exact)?.id||''});
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
        if (!fresh || fresh.status!=='pending' || !fresh.start_date || fresh.start_date>today) {
          await Receipt.update(receipt.receipt.id,{status:'failed',failed_at:nowIso(),error_message:'Task changed before generation.'});
          results.push({task_id:task.id,status:'skipped',reason:'task_changed'});
          continue;
        }
        const activeNow = (await WorkOrder.filter({maintenance_task_id:task.id})).find((wo:any)=>ACTIVE.has(wo.status));
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

    return Response.json({success:true,disabled:false,date:today,due:due.length,created:results.filter(r=>r.status==='created').length,results});
  } catch (error) {
    console.error('fleetScheduledMaintenanceGeneration error:',error);
    return Response.json({error:error?.message || 'Fleet scheduled maintenance generation failed.'},{status:500});
  }
});
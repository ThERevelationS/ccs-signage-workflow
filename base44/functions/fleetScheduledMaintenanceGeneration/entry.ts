import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { loadAllEntityRows } from '../../shared/pagedEntityRows.ts';
import { updateFleetRecordIfCurrent } from '../../shared/fleetRecordPersistence.ts';

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
  const failed = canonical(await Receipt.filter({operation_key:key,status:'failed'}));
  if (failed) return {applied:false,owner:false,receipt:failed,failed:true};
  const created = await Receipt.create({operation_key:key,operation_type:'scheduled_generation',target_entity:'FleetMaintenanceTask',target_id:task.id,status:'started',started_at:nowIso(),result_summary:{due_date:task.start_date,title:task.title,task_expected_updated_date:task.updated_date || '',prior_generation_key:task.generation_key || '',prior_status:task.status || ''}});
  await new Promise(r=>setTimeout(r,75));
  const contenders = await Receipt.filter({operation_key:key,status:'started'});
  const winner = canonical(contenders) || created;
  if (winner.id !== created.id) {
    await Receipt.delete(created.id).catch(()=>null);
    return {applied:false,owner:false,receipt:winner};
  }
  return {applied:false,owner:true,receipt:created};
}

async function acquireTaskGenerationLock(Task:any, Receipt:any, task:any, key:string, receipt:any) {
  let activeReceipt = receipt;
  let summary = activeReceipt?.result_summary || {};
  const current = await Task.get(task.id);
  if (!current) throw new Error(`Maintenance task ${task.id} no longer exists.`);

  if (String(current.generation_key || '') === key && summary.task_lock_acquired === true) {
    const lockedVersion = String(summary.task_locked_updated_date || '').trim();
    if (!lockedVersion || lockedVersion !== String(current.updated_date || '')) {
      const conflict:any = new Error('Maintenance schedule changed after its generation lock was acquired. Work-order generation was stopped.');
      conflict.code = 'FLEET_RECORD_CONFLICT';
      throw conflict;
    }
    return { task: current, receipt: activeReceipt };
  }

  const expectedUpdatedAt = String(summary.task_expected_updated_date || task.updated_date || '').trim();
  if (!expectedUpdatedAt) throw new Error('Maintenance schedule version is missing; generation cannot be reserved safely.');
  if (!DUE_TASK_STATUSES.has(current.status) || !current.start_date || current.start_date !== summary.due_date) {
    const conflict:any = new Error('Maintenance schedule changed before generation could acquire its lock.');
    conflict.code = 'FLEET_RECORD_CONFLICT';
    throw conflict;
  }

  const locked = await updateFleetRecordIfCurrent({
    entity: Task,
    id: current.id,
    expectedUpdatedAt,
    patch: { generation_key: key },
    label: 'Fleet maintenance schedule generation lock',
  });
  try {
    await Receipt.update(activeReceipt.id, {
      result_summary: {
        ...summary,
        task_lock_acquired: true,
        task_locked_updated_date: String(locked.updated_date || ''),
        task_expected_updated_date: expectedUpdatedAt,
        prior_generation_key: summary.prior_generation_key ?? task.generation_key ?? '',
        prior_status: summary.prior_status || task.status || '',
      },
    });
    activeReceipt = await Receipt.get(activeReceipt.id);
    return { task: locked, receipt: activeReceipt };
  } catch (error:any) {
    try {
      await updateFleetRecordIfCurrent({
        entity: Task,
        id: locked.id,
        expectedUpdatedAt: String(locked.updated_date || ''),
        patch: { generation_key: String(summary.prior_generation_key || task.generation_key || '') },
        label: 'Fleet maintenance schedule generation lock rollback',
      });
    } catch (rollbackError:any) {
      throw new Error(`Generation lock metadata failed and the task lock could not be rolled back safely: ${rollbackError?.message || String(rollbackError)}`);
    }
    throw error;
  }
}

async function advanceLockedTask(Task:any, Receipt:any, taskId:string, key:string, receipt:any, dueDate:string) {
  const current = await Task.get(taskId);
  if (!current) throw new Error(`Maintenance task ${taskId} no longer exists.`);
  if (current.status === 'in_progress' && current.generation_key === key && current.last_generated_for_date === dueDate) return current;

  const summary = receipt?.result_summary || {};
  const lockedVersion = String(summary.task_locked_updated_date || '').trim();
  if (summary.task_lock_acquired !== true || String(current.generation_key || '') !== key || String(current.start_date || '') !== String(dueDate || '') || !lockedVersion || lockedVersion !== String(current.updated_date || '')) {
    const conflict:any = new Error('Maintenance schedule no longer matches its generation lock. The generated work order was preserved, but the schedule was not overwritten.');
    conflict.code = 'FLEET_RECORD_CONFLICT';
    throw conflict;
  }

  return updateFleetRecordIfCurrent({
    entity: Task,
    id: taskId,
    expectedUpdatedAt: lockedVersion,
    patch: { status:'in_progress', generation_key:key, last_generated_for_date:dueDate },
    label: 'Fleet maintenance schedule generation finalization',
  });
}

async function releaseTaskGenerationLock(Task:any, task:any, receipt:any) {
  const summary = receipt?.result_summary || {};
  const lockedVersion = String(summary.task_locked_updated_date || '').trim();
  if (!task?.id || !lockedVersion || String(task.updated_date || '') !== lockedVersion || String(task.generation_key || '') !== String(receipt?.operation_key || '')) return false;
  await updateFleetRecordIfCurrent({
    entity: Task,
    id: task.id,
    expectedUpdatedAt: lockedVersion,
    patch: { generation_key: String(summary.prior_generation_key || '') },
    label: 'Fleet maintenance schedule generation lock release',
  });
  return true;
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
    const Equipment = base44.asServiceRole.entities.FleetEquipment;
    const Receipt = base44.asServiceRole.entities.FleetOperationReceipt;
    const today = todayEastern();
    const due = (await loadAllEntityRows({ entity:Task, sort:'-created_date', label:'Fleet maintenance schedules' })).filter((task:any)=>DUE_TASK_STATUSES.has(task.status) && task.start_date && task.start_date<=today);
    const results:any[] = [];

    for (const task of due) {
      const key = `fleetmaint:${task.id}:due:${task.start_date}`;
      const existingOrders = await loadAllEntityRows({ entity:WorkOrder, query:{maintenance_task_id:task.id}, sort:'-created_date', label:`Fleet work orders for maintenance task ${task.id}` });
      const exact = canonical(existingOrders.filter((wo:any)=>wo.generation_key===key));

      // Recover only when the exact generated work order and the task's durable
      // generation lock agree. A changed schedule is never overwritten merely
      // because a work order with this generation key exists.
      if (exact) {
        const appliedReceipt = canonical(await Receipt.filter({operation_key:key,status:'applied'}));
        const startedReceipt = canonical(await Receipt.filter({operation_key:key,status:'started'}));
        const failedReceipt = canonical(await Receipt.filter({operation_key:key,status:'failed'}));
        const recoveryReceipt = appliedReceipt || startedReceipt || failedReceipt;
        const currentTask = await Task.get(task.id);
        const alreadyAdvanced = currentTask?.status === 'in_progress'
          && currentTask?.generation_key === key
          && currentTask?.last_generated_for_date === task.start_date;

        if (!alreadyAdvanced) {
          const lockEvidence = recoveryReceipt?.result_summary?.task_lock_acquired === true
            && currentTask?.generation_key === key
            && String(currentTask?.start_date || '') === String(task.start_date || '');
          if (!lockEvidence) {
            if (recoveryReceipt && recoveryReceipt.status !== 'failed') {
              await Receipt.update(recoveryReceipt.id,{status:'failed',failed_at:nowIso(),error_message:'Generated work order exists but the maintenance schedule no longer matches its generation lock.'}).catch(()=>null);
            }
            results.push({task_id:task.id,status:'error',reason:'generation_recovery_lock_mismatch',work_order_id:exact.id,work_order_number:exact.work_order_number});
            continue;
          }
          try {
            await advanceLockedTask(Task,Receipt,task.id,key,recoveryReceipt,task.start_date);
          } catch (error:any) {
            await Receipt.update(recoveryReceipt.id,{status:'failed',failed_at:nowIso(),error_message:error?.message || String(error)}).catch(()=>null);
            results.push({task_id:task.id,status:'error',reason:'generation_recovery_conflict',error:error?.message || String(error),work_order_id:exact.id});
            continue;
          }
        }

        if (recoveryReceipt && recoveryReceipt.status !== 'applied') {
          await Receipt.update(recoveryReceipt.id,{status:'applied',applied_at:nowIso(),error_message:'',result_summary:{...(recoveryReceipt.result_summary||{}),work_order_id:exact.id,work_order_number:exact.work_order_number,recovered:true}});
        }
        results.push({task_id:task.id,status:'recovered',reason:'generation_key_exists',work_order_id:exact.id,work_order_number:exact.work_order_number});
        continue;
      }

      const active = existingOrders.find((wo:any)=>ACTIVE.has(wo.status));
      if (active) {
        results.push({task_id:task.id,status:'skipped',reason:'active_work_order_exists',work_order_id:active.id});
        continue;
      }

      const equipmentBeforeClaim = await Equipment.get(task.equipment_id).catch(()=>null);
      if (!equipmentBeforeClaim) {
        results.push({task_id:task.id,status:'error',reason:'equipment_missing'});
        continue;
      }
      if (equipmentBeforeClaim.status === 'retired') {
        results.push({task_id:task.id,status:'skipped',reason:'equipment_retired'});
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
          try {
            const activeReceipt = await Receipt.get(receipt.receipt.id).catch(()=>receipt.receipt);
            const dueDate = String(activeReceipt?.result_summary?.due_date || task.start_date || '');
            await advanceLockedTask(Task,Receipt,task.id,key,activeReceipt,dueDate);
            await Receipt.update(activeReceipt.id,{status:'applied',applied_at:nowIso(),error_message:'',result_summary:{...(activeReceipt.result_summary||{}),work_order_id:found.id,work_order_number:found.work_order_number,recovered:true}});
            results.push({task_id:task.id,status:'recovered',work_order_id:found.id});
          } catch (error:any) {
            const message = error?.message || String(error);
            await Receipt.update(receipt.receipt.id,{status:'failed',failed_at:nowIso(),error_message:message}).catch(()=>null);
            results.push({task_id:task.id,status:'error',reason:'generation_recovery_conflict',error:message,work_order_id:found.id});
          }
        } else {
          results.push({task_id:task.id,status:receipt.failed?'error':'in_progress_elsewhere',reason:receipt.failed?'failed_generation_receipt_needs_review':'claim_owned_elsewhere'});
        }
        continue;
      }

      try {
        const fresh = await Task.get(task.id);
        if (!fresh || !DUE_TASK_STATUSES.has(fresh.status) || !fresh.start_date || fresh.start_date>today || String(fresh.start_date) !== String(task.start_date)) {
          await Receipt.delete(receipt.receipt.id).catch(()=>null);
          results.push({task_id:task.id,status:'skipped',reason:'task_changed'});
          continue;
        }

        const lock = await acquireTaskGenerationLock(Task,Receipt,task,key,receipt.receipt);
        const lockedTask = lock.task;
        receipt.receipt = lock.receipt;

        const equipmentAfterLock = await Equipment.get(lockedTask.equipment_id).catch(()=>null);
        if (!equipmentAfterLock || equipmentAfterLock.status === 'retired') {
          const released = await releaseTaskGenerationLock(Task,lockedTask,receipt.receipt);
          await Receipt.update(receipt.receipt.id,{status:'applied',applied_at:nowIso(),error_message:'',result_summary:{...(receipt.receipt.result_summary||{}),skipped:true,skip_reason:equipmentAfterLock?'equipment_retired':'equipment_missing',task_lock_released:released}});
          results.push({task_id:task.id,status:'skipped',reason:equipmentAfterLock?'equipment_retired':'equipment_missing'});
          continue;
        }

        const activeNow = (await loadAllEntityRows({ entity:WorkOrder, query:{maintenance_task_id:task.id}, sort:'-created_date', label:`Fleet work orders for maintenance task ${task.id}` })).find((wo:any)=>ACTIVE.has(wo.status));
        if (activeNow) {
          const released = await releaseTaskGenerationLock(Task,lockedTask,receipt.receipt);
          await Receipt.update(receipt.receipt.id,{status:'applied',applied_at:nowIso(),error_message:'',result_summary:{...(receipt.receipt.result_summary||{}),existing_work_order_id:activeNow.id,skipped:true,task_lock_released:released}});
          results.push({task_id:task.id,status:'skipped',reason:'active_work_order_exists',work_order_id:activeNow.id});
          continue;
        }

        const equipmentBeforeCreate = await Equipment.get(lockedTask.equipment_id).catch(()=>null);
        if (!equipmentBeforeCreate || equipmentBeforeCreate.status === 'retired') {
          const currentLockedTask = await Task.get(lockedTask.id).catch(()=>lockedTask);
          const released = await releaseTaskGenerationLock(Task,currentLockedTask,receipt.receipt);
          await Receipt.update(receipt.receipt.id,{status:'applied',applied_at:nowIso(),error_message:'',result_summary:{...(receipt.receipt.result_summary||{}),skipped:true,skip_reason:equipmentBeforeCreate?'equipment_retired':'equipment_missing',task_lock_released:released}});
          results.push({task_id:task.id,status:'skipped',reason:equipmentBeforeCreate?'equipment_retired':'equipment_missing'});
          continue;
        }

        const number = workOrderNumber(lockedTask);
        const byKey = canonical(await WorkOrder.filter({generation_key:key}));
        const byNumber = canonical(await WorkOrder.filter({work_order_number:number}));
        const created = byKey || byNumber || await WorkOrder.create({
          work_order_number:number,
          equipment_id:lockedTask.equipment_id,
          maintenance_task_id:lockedTask.id,
          title:lockedTask.title,
          description:lockedTask.description || `Scheduled maintenance: ${lockedTask.title}`,
          type:'scheduled',
          priority:lockedTask.priority || 'medium',
          status:'open',
          assigned_to:lockedTask.assigned_to || '',
          generation_key:key,
        });
        await advanceLockedTask(Task,Receipt,lockedTask.id,key,receipt.receipt,lockedTask.start_date);
        const stamp = nowIso();
        await Receipt.update(receipt.receipt.id,{status:'applied',applied_at:stamp,error_message:'',result_summary:{...(receipt.receipt.result_summary||{}),work_order_id:created.id,work_order_number:created.work_order_number}});
        await base44.asServiceRole.functions.invoke('fleetNotificationDispatcher',{event_type:'work_order_created',target_id:created.id,event_token:key}).catch(()=>null);
        results.push({task_id:lockedTask.id,status:byKey||byNumber?'recovered':'created',work_order_id:created.id,work_order_number:created.work_order_number});
      } catch (error:any) {
        const message = error?.message || String(error);
        const generated = canonical(await WorkOrder.filter({generation_key:key}).catch(()=>[]));
        const activeReceipt = await Receipt.get(receipt.receipt.id).catch(()=>receipt.receipt);
        const hasTaskLock = activeReceipt?.result_summary?.task_lock_acquired === true;
        let released = false;
        if (!generated && hasTaskLock) {
          const currentTask = await Task.get(task.id).catch(()=>null);
          try { released = await releaseTaskGenerationLock(Task,currentTask,activeReceipt); } catch {}
        }
        if (!generated && (!hasTaskLock || released)) {
          await Receipt.delete(activeReceipt.id).catch(()=>null);
        } else {
          await Receipt.update(activeReceipt.id,{status:'failed',failed_at:nowIso(),error_message:message,result_summary:{...(activeReceipt.result_summary||{}),generated_work_order_id:generated?.id || '',task_lock_release_failed:!generated&&hasTaskLock&&!released}}).catch(()=>null);
        }
        results.push({task_id:task.id,status:'error',error:message,work_order_id:generated?.id || ''});
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
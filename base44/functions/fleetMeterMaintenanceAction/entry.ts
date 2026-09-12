import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { loadAllEntityRows } from '../../shared/pagedEntityRows.ts';
import { updateFleetRecordIfCurrent } from '../../shared/fleetRecordPersistence.ts';
import { resolveFleetMeterReading, fleetMeterState } from '../../shared/fleetMeterReading.ts';

const norm = (value: unknown) => String(value ?? '').trim();
const num = (value: unknown) => value == null || value === '' ? null : Number(value);
const validMeterTypes = new Set(['odometer_miles','engine_hours','manual']);
const validSources = new Set(['bouncie','manual']);
const validModes = new Set(['meter_only','date_or_meter']);
const canonical = (rows:any[]=[]) => rows.slice().sort((a,b)=>String(a.id||'').localeCompare(String(b.id||'')))[0] || null;

async function authorize(base44:any, adminRequired=false) {
  const user = await base44.auth.me().catch(()=>null);
  if (!user?.email) return { error: Response.json({error:'Unauthorized'},{status:401}) };
  if (user.role === 'admin') return { user, admin:true };
  const rows = await base44.asServiceRole.entities.AuthorizedEmail.filter({email:user.email});
  const authorized = rows?.[0] || null;
  if (!authorized) return { error: Response.json({error:'This CCS account is not authorized for Fleet operations.'},{status:403}) };
  if (adminRequired && authorized.role !== 'admin') return { error: Response.json({error:'Fleet meter maintenance administration requires a CCS admin.'},{status:403}) };
  return { user, admin:authorized.role === 'admin' };
}

function safeRule(source:any) {
  const out:any = {};
  for (const key of ['equipment_id','maintenance_task_id','meter_type','trigger_mode','source','notes']) if (Object.prototype.hasOwnProperty.call(source||{},key)) out[key] = norm(source[key]);
  for (const key of ['interval_value','next_due_value','last_service_value','lead_value']) if (Object.prototype.hasOwnProperty.call(source||{},key)) out[key] = num(source[key]);
  if (Object.prototype.hasOwnProperty.call(source||{},'enabled')) out.enabled = source.enabled !== false;
  return out;
}

async function validateRule(base44:any, patch:any, existing:any=null) {
  const Equipment = base44.asServiceRole.entities.FleetEquipment;
  const Task = base44.asServiceRole.entities.FleetMaintenanceTask;
  const equipmentId = norm(patch.equipment_id || existing?.equipment_id);
  const taskId = norm(patch.maintenance_task_id || existing?.maintenance_task_id);
  const meterType = norm(patch.meter_type || existing?.meter_type);
  const source = norm(patch.source || existing?.source || 'manual');
  const mode = norm(patch.trigger_mode || existing?.trigger_mode || 'date_or_meter');
  const interval = num(Object.prototype.hasOwnProperty.call(patch,'interval_value') ? patch.interval_value : existing?.interval_value);
  const lead = num(Object.prototype.hasOwnProperty.call(patch,'lead_value') ? patch.lead_value : existing?.lead_value) ?? 0;
  if (!equipmentId || !taskId) throw new Error('Equipment and maintenance schedule are required.');
  if (!validMeterTypes.has(meterType)) throw new Error('Invalid Fleet meter type.');
  if (!validSources.has(source)) throw new Error('Invalid Fleet meter source.');
  if (!validModes.has(mode)) throw new Error('Invalid Fleet meter trigger mode.');
  if (!Number.isFinite(interval) || Number(interval) <= 0) throw new Error('Meter interval must be greater than zero.');
  if (!Number.isFinite(lead) || Number(lead) < 0) throw new Error('Meter lead value must be zero or greater.');
  if (source === 'bouncie' && meterType !== 'odometer_miles') throw new Error('Bouncie can only be used as the source for odometer-mile maintenance rules.');
  const [equipment, task] = await Promise.all([Equipment.get(equipmentId).catch(()=>null),Task.get(taskId).catch(()=>null)]);
  if (!equipment) throw new Error('Selected Fleet equipment was not found.');
  if (!task) throw new Error('Selected Fleet maintenance schedule was not found.');
  if (equipment.status === 'retired') throw new Error('Retired Fleet equipment cannot receive a new or changed meter maintenance rule.');
  if (task.equipment_id !== equipment.id) throw new Error('The selected maintenance schedule belongs to different Fleet equipment.');
  if (source === 'bouncie' && !['matched','manual'].includes(String(equipment.bouncie_link_status||''))) throw new Error('Bouncie meter rules require a definitive FleetEquipment ↔ Bouncie link.');
  return {equipment,task,meterType,source,mode,interval:Number(interval),lead:Number(lead)};
}

Deno.serve(async req => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(()=>({}));
    const action = norm(body?.action);
    const auth = await authorize(base44, ['create','update','delete'].includes(action));
    if (auth.error) return auth.error;
    const Rule = base44.asServiceRole.entities.FleetMaintenanceMeterRule;
    const Equipment = base44.asServiceRole.entities.FleetEquipment;
    const Task = base44.asServiceRole.entities.FleetMaintenanceTask;
    const Receipt = base44.asServiceRole.entities.FleetOperationReceipt;

    if (action === 'status') {
      const query:any = {};
      if (norm(body?.equipment_id)) query.equipment_id = norm(body.equipment_id);
      const rules = await loadAllEntityRows({entity:Rule,query,sort:'-created_date',label:'Fleet meter maintenance rules'});
      const rows:any[] = [];
      for (const rule of rules) {
        const [equipment,task] = await Promise.all([Equipment.get(rule.equipment_id).catch(()=>null),Task.get(rule.maintenance_task_id).catch(()=>null)]);
        const reading = equipment ? await resolveFleetMeterReading(base44,equipment,rule) : {available:false,value:null,unit:rule.meter_type==='engine_hours'?'hours':'miles',source:rule.source||'manual',recorded_at:'',reason:'equipment_missing'};
        rows.push({rule,reading,state:fleetMeterState(rule,reading),equipment_name:equipment?.name||'',task_title:task?.title||'',task_status:task?.status||'',task_start_date:task?.start_date||''});
      }
      return Response.json({success:true,rows});
    }

    if (action === 'create') {
      const creationKey = norm(body?.creation_key);
      if (!creationKey || creationKey.length < 12 || creationKey.length > 200 || /\s/.test(creationKey)) return Response.json({error:'Meter-rule create identity is missing or invalid.'},{status:409});
      const patch = safeRule(body?.rule || body);
      const validated = await validateRule(base44,patch);
      const byTask = await Rule.filter({maintenance_task_id:validated.task.id});
      if (byTask.length) return Response.json({error:'This maintenance schedule already has a meter rule. Edit the existing rule instead.'},{status:409});
      const existingRows = await Rule.filter({creation_key:creationKey});
      if (existingRows.length > 1) return Response.json({error:'Multiple Fleet meter rules share this create identity.'},{status:409});
      if (existingRows[0]) return Response.json({success:true,reused:true,rule:existingRows[0]});
      const reading = await resolveFleetMeterReading(base44,validated.equipment,{...patch,source:validated.source,meter_type:validated.meterType});
      let lastService = num(patch.last_service_value);
      let nextDue = num(patch.next_due_value);
      if (lastService == null && reading.available) lastService = reading.value;
      if (nextDue == null && lastService != null) nextDue = Number(lastService) + validated.interval;
      if (nextDue == null || !Number.isFinite(nextDue) || Number(nextDue) < 0) return Response.json({error:'Enter a next-due meter value, or provide a current/last-service meter reading so it can be calculated.'},{status:400});
      const created = await Rule.create({...patch,equipment_id:validated.equipment.id,maintenance_task_id:validated.task.id,meter_type:validated.meterType,source:validated.source,trigger_mode:validated.mode,interval_value:validated.interval,lead_value:validated.lead,last_service_value:lastService ?? 0,next_due_value:Number(nextDue),enabled:patch.enabled !== false,creation_key:creationKey});
      await new Promise(r=>setTimeout(r,75));
      const contenders = await Rule.filter({creation_key:creationKey});
      const winner = canonical(contenders) || created;
      for (const row of contenders) if (row.id !== winner.id) await Rule.delete(row.id).catch(()=>null);
      return Response.json({success:true,rule:winner,reading});
    }

    const id = norm(body?.id || body?.rule_id);
    if (!id) return Response.json({error:'Fleet meter rule id is required.'},{status:400});
    const existing = await Rule.get(id).catch(()=>null);
    if (!existing) return Response.json({error:'Fleet meter rule was not found.'},{status:404});

    if (action === 'update') {
      const expected = norm(body?.expected_updated_date);
      if (!expected) return Response.json({error:'Meter rule version is missing. Reload before saving.'},{status:409});
      const patch = safeRule(body?.rule || body);
      const validated = await validateRule(base44,patch,existing);
      if (patch.maintenance_task_id && patch.maintenance_task_id !== existing.maintenance_task_id) {
        const duplicates = (await Rule.filter({maintenance_task_id:patch.maintenance_task_id})).filter((row:any)=>row.id!==id);
        if (duplicates.length) return Response.json({error:'That maintenance schedule already has a meter rule.'},{status:409});
      }
      if (patch.next_due_value != null && (!Number.isFinite(patch.next_due_value) || patch.next_due_value < 0)) return Response.json({error:'Next-due meter value must be zero or greater.'},{status:400});
      if (patch.last_service_value != null && (!Number.isFinite(patch.last_service_value) || patch.last_service_value < 0)) return Response.json({error:'Last-service meter value must be zero or greater.'},{status:400});
      const updated = await updateFleetRecordIfCurrent({entity:Rule,id,expectedUpdatedAt:expected,patch:{...patch,meter_type:validated.meterType,source:validated.source,trigger_mode:validated.mode,interval_value:validated.interval,lead_value:validated.lead},label:'Fleet meter maintenance rule'});
      return Response.json({success:true,rule:updated});
    }

    if (action === 'delete') {
      const history = await Receipt.filter({operation_type:'meter_generation',target_id:id});
      if (history.length) return Response.json({error:'This meter rule has generation history and cannot be deleted. Disable it instead.'},{status:409});
      await Rule.delete(id);
      return Response.json({success:true,deleted:true});
    }

    return Response.json({error:'Unsupported Fleet meter maintenance action.'},{status:400});
  } catch (error:any) {
    console.error('fleetMeterMaintenanceAction error:',error);
    if (error?.code === 'FLEET_RECORD_CONFLICT') return Response.json({error:error.message},{status:409});
    return Response.json({error:error?.message || 'Fleet meter maintenance operation failed.'},{status:500});
  }
});

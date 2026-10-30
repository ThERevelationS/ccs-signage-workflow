import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { resolveFleetStaffUser } from '../../shared/fleetStaffSession.ts';
import { loadAllEntityRows } from '../../shared/pagedEntityRows.ts';
import { updateFleetRecordIfCurrent } from '../../shared/fleetRecordPersistence.ts';
import { resolveFleetMeterReading } from '../../shared/fleetMeterReading.ts';

const norm = (value: unknown) => String(value ?? '').trim();
const finite = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};
const nonNegativeOrNull = (value: unknown) => {
  if (value === '' || value === null || value === undefined) return null;
  const parsed = finite(value);
  return parsed == null || parsed < 0 ? null : parsed;
};
const todayEastern = () => new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const CATEGORIES = new Set(['vehicle','engine','transmission','battery','component','other']);
const STATUSES = new Set(['active','expired','claimed','void']);
const METER_UNITS = new Set(['miles','hours']);

async function authorize(base44:any, sessionToken) {
  const user = (await base44.auth.me().catch(() => null)) || await resolveFleetStaffUser(base44, sessionToken);
  if (!user?.email) return {error:Response.json({error:'Unauthorized'},{status:401})};
  if (user.role === 'admin') return {user,isAdmin:true};
  const rows = await base44.asServiceRole.entities.AuthorizedEmail.filter({email:user.email});
  if (!rows?.[0]) return {error:Response.json({error:'This CCS account is not authorized for Fleet operations.'},{status:403})};
  return {user,isAdmin:rows[0].role==='admin'};
}

function patchFrom(source:any) {
  const name = norm(source?.name);
  const category = norm(source?.category || 'other');
  const status = norm(source?.status || 'active');
  const meterUnit = norm(source?.meter_unit || 'miles');
  if (!name) throw new Error('Warranty name is required.');
  if (!CATEGORIES.has(category)) throw new Error('Invalid warranty category.');
  if (!STATUSES.has(status)) throw new Error('Invalid warranty status.');
  if (!METER_UNITS.has(meterUnit)) throw new Error('Invalid warranty meter unit.');
  const startMeter = nonNegativeOrNull(source?.start_meter);
  const endMeter = nonNegativeOrNull(source?.end_meter);
  if (startMeter != null && endMeter != null && endMeter < startMeter) throw new Error('Warranty end meter cannot be below the start meter.');
  const startDate = norm(source?.start_date);
  const endDate = norm(source?.end_date);
  if (startDate && !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) throw new Error('Warranty start date is invalid.');
  if (endDate && !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) throw new Error('Warranty end date is invalid.');
  if (startDate && endDate && endDate < startDate) throw new Error('Warranty end date cannot be before the start date.');
  return {
    equipment_id:norm(source?.equipment_id),
    name,
    category,
    provider:norm(source?.provider),
    reference_number:norm(source?.reference_number),
    start_date:startDate,
    end_date:endDate,
    ...(startMeter == null ? {} : {start_meter:startMeter}),
    ...(endMeter == null ? {} : {end_meter:endMeter}),
    meter_unit:meterUnit,
    status,
    coverage_description:norm(source?.coverage_description),
    contact:norm(source?.contact),
    document_url:norm(source?.document_url),
    notes:norm(source?.notes),
  };
}

function sameCreate(existing:any,patch:any) {
  for (const key of ['equipment_id','name','category','provider','reference_number','start_date','end_date','meter_unit','status','coverage_description','contact','document_url','notes']) {
    if (norm(existing?.[key]) !== norm(patch?.[key])) return false;
  }
  for (const key of ['start_meter','end_meter']) {
    const left = existing?.[key] == null || existing?.[key] === '' ? null : Number(existing[key]);
    const right = patch?.[key] == null || patch?.[key] === '' ? null : Number(patch[key]);
    if (left !== right) return false;
  }
  return true;
}

function daysUntil(dateText:string) {
  if (!dateText) return null;
  const due = Date.parse(`${dateText}T12:00:00`);
  const today = Date.parse(`${todayEastern()}T12:00:00`);
  if (!Number.isFinite(due) || !Number.isFinite(today)) return null;
  return Math.round((due-today)/86400000);
}

async function evaluate(base44:any,warranty:any,equipment:any) {
  const storedStatus = norm(warranty?.status || 'active');
  let meter:any = {available:false,value:null,unit:warranty?.meter_unit || 'miles',source:'manual',recorded_at:'',reason:'not_required'};
  if (warranty?.end_meter != null) {
    const trackedMiles = warranty.meter_unit === 'miles' && ['matched','manual'].includes(String(equipment?.bouncie_link_status || '')) && norm(equipment?.vin) && norm(equipment?.bouncie_imei);
    meter = await resolveFleetMeterReading(base44,equipment,{
      source:trackedMiles ? 'bouncie' : 'manual',
      meter_type:warranty.meter_unit === 'hours' ? 'engine_hours' : 'odometer_miles',
    });
  }
  const dateRemaining = daysUntil(norm(warranty?.end_date));
  const endMeter = nonNegativeOrNull(warranty?.end_meter);
  const startMeter = nonNegativeOrNull(warranty?.start_meter);
  const meterRemaining = meter.available && meter.value != null && endMeter != null ? endMeter-Number(meter.value) : null;
  let meterProgress:any = null;
  if (meter.available && meter.value != null && endMeter != null && endMeter > 0) {
    const denominator = startMeter != null && endMeter > startMeter ? endMeter-startMeter : endMeter;
    const numerator = startMeter != null && endMeter > startMeter ? Number(meter.value)-startMeter : Number(meter.value);
    meterProgress = denominator > 0 ? Math.round((numerator/denominator)*1000)/10 : null;
  }
  const reasons:string[] = [];
  let effective = storedStatus;
  let severity = 'neutral';
  if (storedStatus === 'claimed' || storedStatus === 'void') {
    effective = storedStatus;
  } else if (storedStatus === 'expired' || (dateRemaining !== null && dateRemaining < 0) || (meterRemaining !== null && meterRemaining <= 0)) {
    effective = 'expired'; severity = 'high';
    if (dateRemaining !== null && dateRemaining < 0) reasons.push(`Date limit passed ${Math.abs(dateRemaining)} day${Math.abs(dateRemaining)===1?'':'s'} ago`);
    if (meterRemaining !== null && meterRemaining <= 0) reasons.push(`Meter limit reached at ${Number(meter.value).toLocaleString()} ${meter.unit}`);
  } else {
    const dateSoon = dateRemaining !== null && dateRemaining <= 60;
    const meterSoon = meterProgress !== null && meterProgress >= 90;
    if (dateSoon || meterSoon) {
      effective = 'expiring_soon'; severity = 'medium';
      if (dateSoon) reasons.push(`${dateRemaining} day${dateRemaining===1?'':'s'} remaining`);
      if (meterSoon) reasons.push(`${Math.max(0,100-meterProgress).toFixed(1)}% of meter coverage remaining`);
    } else {
      effective = 'active'; severity = 'good';
    }
  }
  if (!reasons.length && effective === 'active') reasons.push('Coverage is within configured date/meter limits');
  return {warranty,equipment:{id:equipment?.id,name:equipment?.name,status:equipment?.status,type:equipment?.type,vin:equipment?.vin},effective_status:effective,severity,reasons,date_remaining_days:dateRemaining,meter_remaining:meterRemaining,meter_progress_percent:meterProgress,current_meter:meter};
}

Deno.serve(async req => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(()=>({}));
    const auth = await authorize(base44, body?.session_token);
    if (auth.error) return auth.error;

    const action = norm(body?.action);
    const Warranty = base44.asServiceRole.entities.FleetWarranty;
    const Equipment = base44.asServiceRole.entities.FleetEquipment;

    if (action === 'portfolio') {
      const equipmentId = norm(body?.equipment_id);
      const [warranties,equipmentRows] = await Promise.all([
        loadAllEntityRows({entity:Warranty,query:equipmentId?{equipment_id:equipmentId}:{},sort:'end_date',label:'Fleet warranty portfolio'}),
        loadAllEntityRows({entity:Equipment,sort:'name',label:'Fleet warranty equipment'}),
      ]);
      const equipmentById = new Map(equipmentRows.map((row:any)=>[row.id,row]));
      const rows:any[] = [];
      for (const warranty of warranties) {
        const equipment = equipmentById.get(warranty.equipment_id);
        if (!equipment) {
          rows.push({warranty,equipment:null,effective_status:'orphaned',severity:'high',reasons:['Linked Fleet equipment was not found'],date_remaining_days:daysUntil(norm(warranty.end_date)),meter_remaining:null,meter_progress_percent:null,current_meter:{available:false,value:null,unit:warranty.meter_unit||'miles',source:'manual',recorded_at:'',reason:'equipment_missing'}});
          continue;
        }
        rows.push(await evaluate(base44,warranty,equipment));
      }
      const rank:any = {expired:0,orphaned:0,expiring_soon:1,active:2,claimed:3,void:4};
      rows.sort((a,b)=>(rank[a.effective_status]??9)-(rank[b.effective_status]??9)||(a.date_remaining_days??999999)-(b.date_remaining_days??999999)||String(a.warranty?.name||'').localeCompare(String(b.warranty?.name||'')));
      return Response.json({success:true,rows,summary:{total:rows.length,active:rows.filter(row=>row.effective_status==='active').length,expiring_soon:rows.filter(row=>row.effective_status==='expiring_soon').length,expired:rows.filter(row=>['expired','orphaned'].includes(row.effective_status)).length,claimed:rows.filter(row=>row.effective_status==='claimed').length}});
    }

    if (!auth.isAdmin) return Response.json({error:'Only a CCS admin can manage Fleet warranty records.'},{status:403});

    if (action === 'create') {
      const creationKey = norm(body?.creation_key);
      if (!creationKey || creationKey.length < 12 || creationKey.length > 200 || /\s/.test(creationKey)) return Response.json({error:'Warranty create identity is missing or invalid.'},{status:409});
      const patch = patchFrom(body?.warranty || body);
      if (!patch.equipment_id) return Response.json({error:'Fleet equipment is required.'},{status:400});
      const equipment = await Equipment.get(patch.equipment_id).catch(()=>null);
      if (!equipment) return Response.json({error:'Selected Fleet equipment was not found.'},{status:404});
      const existing = await Warranty.filter({creation_key:creationKey});
      if (existing.length > 1) return Response.json({error:'Multiple warranties share this create identity. Review duplicates before retrying.'},{status:409});
      if (existing[0]) {
        if (!sameCreate(existing[0],patch)) return Response.json({error:'This warranty create identity already belongs to different details. Reopen the form before creating another warranty.'},{status:409});
        return Response.json({success:true,reused:true,...await evaluate(base44,existing[0],equipment)});
      }
      const created = await Warranty.create({...patch,creation_key:creationKey});
      await new Promise(resolve=>setTimeout(resolve,75));
      const contenders = await Warranty.filter({creation_key:creationKey});
      if (contenders.length > 1) {
        const winner = contenders.slice().sort((a:any,b:any)=>String(a.id).localeCompare(String(b.id)))[0];
        for (const row of contenders) if (row.id !== winner.id) await Warranty.delete(row.id).catch(()=>null);
        if (!sameCreate(winner,patch)) return Response.json({error:'A concurrent warranty won this create identity with different details.'},{status:409});
        return Response.json({success:true,reused:winner.id!==created.id,...await evaluate(base44,winner,equipment)});
      }
      return Response.json({success:true,...await evaluate(base44,created,equipment)});
    }

    const id = norm(body?.id);
    if (!id) return Response.json({error:'Fleet warranty id is required.'},{status:400});
    const existing = await Warranty.get(id).catch(()=>null);
    if (!existing) return Response.json({error:'Fleet warranty was not found.'},{status:404});

    if (action === 'update') {
      const patch = patchFrom({...existing,...(body?.warranty||{})});
      const equipment = await Equipment.get(patch.equipment_id).catch(()=>null);
      if (!equipment) return Response.json({error:'Selected Fleet equipment was not found.'},{status:404});
      const expected = norm(body?.expected_updated_date);
      if (!expected) return Response.json({error:'Warranty version is missing. Reload before saving.'},{status:409});
      const updated = await updateFleetRecordIfCurrent({entity:Warranty,id,expectedUpdatedAt:expected,patch,label:'Fleet warranty'});
      return Response.json({success:true,...await evaluate(base44,updated,equipment)});
    }

    if (action === 'delete') {
      const expected = norm(body?.expected_updated_date);
      if (!expected || expected !== norm(existing.updated_date)) return Response.json({error:'Warranty changed after it was opened. Reload before deleting.'},{status:409});
      await Warranty.delete(id);
      return Response.json({success:true,deleted:true});
    }

    return Response.json({error:'Unsupported Fleet warranty action.'},{status:400});
  } catch (error:any) {
    console.error('fleetWarrantyAction error:',error);
    if (Number(error?.status||error?.response?.status)===429||/rate limit|too many requests/i.test(String(error?.message||''))) return Response.json({error:'Fleet warranty operation is busy. Try again shortly.',retry_after_ms:3000},{status:429,headers:{'Retry-After':'3'}});
    if (error?.code==='FLEET_RECORD_CONFLICT') return Response.json({error:error.message},{status:409});
    return Response.json({error:error?.message || 'Fleet warranty operation failed.'},{status:500});
  }
});
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { loadAllEntityRows } from '../../shared/pagedEntityRows.ts';
import { updateFleetRecordIfCurrent } from '../../shared/fleetRecordPersistence.ts';

const norm = (value: unknown) => String(value ?? '').trim();
const num = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const nonNegative = (value: unknown, fallback = 0) => Math.max(0, num(value, fallback));
const todayEastern = () => new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const LIFECYCLE_STATUSES = new Set(['monitor','plan','replace_soon','approved','replaced']);

async function requireAdmin(base44:any) {
  const user = await base44.auth.me().catch(()=>null);
  if (!user?.email) return { error: Response.json({error:'Unauthorized'},{status:401}) };
  if (user.role === 'admin') return { user };
  const rows = await base44.asServiceRole.entities.AuthorizedEmail.filter({email:user.email});
  if (rows?.[0]?.role !== 'admin') return { error: Response.json({error:'Fleet lifecycle planning requires a CCS admin.'},{status:403}) };
  return { user };
}

function lineCost(rows:any) {
  return (Array.isArray(rows) ? rows : []).reduce((sum:number,row:any)=>sum + num(row?.cost,0),0);
}
function serviceCost(workOrder:any) {
  if (workOrder?.total_cost !== null && workOrder?.total_cost !== undefined && workOrder?.total_cost !== '' && Number.isFinite(Number(workOrder.total_cost))) return Number(workOrder.total_cost);
  return lineCost(workOrder?.parts_used) + lineCost(workOrder?.fluids_used);
}
function yearsBetween(startText:string, endText:string) {
  if (!startText || !endText) return null;
  const start = Date.parse(`${startText}T12:00:00`);
  const end = Date.parse(`${endText}T12:00:00`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  return Math.round(((end-start)/(365.25*86400000))*10)/10;
}
function daysUntil(dateText:string) {
  if (!dateText) return null;
  const due = Date.parse(`${dateText}T12:00:00`);
  const today = Date.parse(`${todayEastern()}T12:00:00`);
  if (!Number.isFinite(due) || !Number.isFinite(today)) return null;
  return Math.round((due-today)/86400000);
}

async function currentMeter(base44:any,equipment:any) {
  const manual = Number(equipment?.mileage_hours);
  const fallback = Number.isFinite(manual) ? {available:true,value:manual,unit:'mileage / hours',source:'fleet_manual',recorded_at:equipment?.updated_date||''} : {available:false,value:null,unit:'mileage / hours',source:'fleet_manual',recorded_at:'',reason:'manual_meter_unavailable'};
  if (equipment?.bouncie_link_status !== 'matched' || !norm(equipment?.vin) || !norm(equipment?.bouncie_imei)) return fallback;
  const rows = await base44.asServiceRole.entities.BouncieVehicleLiveState.filter({vehicle_vin:norm(equipment.vin)}).catch(()=>[]);
  const exact = (rows||[]).filter((row:any)=>norm(row.vehicle_vin).toUpperCase()===norm(equipment.vin).toUpperCase() && norm(row.vehicle_imei)===norm(equipment.bouncie_imei) && Number.isFinite(Number(row.odometer)))
    .sort((a:any,b:any)=>(Date.parse(b.last_seen_at||b.updated_date||'')||0)-(Date.parse(a.last_seen_at||a.updated_date||'')||0))[0];
  if (!exact) return {...fallback,reason:'bouncie_identity_or_odometer_unavailable'};
  return {available:true,value:Number(exact.odometer),unit:'miles',source:'bouncie',recorded_at:exact.last_seen_at||exact.updated_date||''};
}

async function lifecycleView(base44:any,equipment:any,profile:any) {
  const WorkOrder = base44.asServiceRole.entities.FleetMaintenanceWorkOrder;
  const workOrders = await loadAllEntityRows({entity:WorkOrder,query:{equipment_id:equipment.id},sort:'-created_date',label:`Lifecycle work orders for ${equipment.id}`});
  const completed = workOrders.filter((row:any)=>row.status==='completed');
  const maintenanceCost = completed.reduce((sum:number,row:any)=>sum+serviceCost(row),0);
  const meter = await currentMeter(base44,equipment);
  const acquisitionDate = norm(profile?.acquisition_date || equipment?.purchase_date);
  const ageYears = yearsBetween(acquisitionDate,todayEastern());
  const modelAgeYears = Number.isFinite(Number(equipment?.year)) ? Math.max(0,new Date().getFullYear()-Number(equipment.year)) : null;
  const acquisitionCost = nonNegative(profile?.acquisition_cost,0);
  const currentValue = nonNegative(profile?.current_value,0);
  const targetMeter = nonNegative(profile?.target_mileage_hours,0);
  const meterProgress = meter.available && meter.value != null && targetMeter > 0 ? Math.round((Number(meter.value)/targetMeter)*1000)/10 : null;
  const targetDateDays = daysUntil(norm(profile?.target_replacement_date));
  const costPerMeter = meter.available && meter.value != null && Number(meter.value)>0 ? maintenanceCost/Number(meter.value) : null;
  const maintenanceToAcquisition = acquisitionCost > 0 ? maintenanceCost/acquisitionCost : null;
  const valueRetained = acquisitionCost > 0 ? currentValue/acquisitionCost : null;
  const flags:any[] = [];
  if (targetDateDays !== null && targetDateDays < 0) flags.push({code:'replacement_date_passed',severity:'high',label:`Target replacement date passed ${Math.abs(targetDateDays)} day${Math.abs(targetDateDays)===1?'':'s'} ago.`});
  else if (targetDateDays !== null && targetDateDays <= 365) flags.push({code:'replacement_date_within_year',severity:'medium',label:`Target replacement date is ${targetDateDays} day${targetDateDays===1?'':'s'} away.`});
  if (meterProgress !== null && meterProgress >= 100) flags.push({code:'target_meter_reached',severity:'high',label:`Current meter has reached ${meterProgress.toFixed(1)}% of the planned replacement meter.`});
  else if (meterProgress !== null && meterProgress >= 90) flags.push({code:'target_meter_near',severity:'medium',label:`Current meter is ${meterProgress.toFixed(1)}% of the planned replacement meter.`});
  if (equipment.status==='retired') flags.push({code:'asset_retired',severity:'info',label:'This asset is retired; lifecycle information is retained for historical planning.'});
  return {equipment,profile:profile||null,metrics:{maintenance_cost:maintenanceCost,completed_work_orders:completed.length,current_meter:meter,age_years:ageYears,model_age_years:modelAgeYears,cost_per_meter:costPerMeter,maintenance_to_acquisition_ratio:maintenanceToAcquisition,value_retained_ratio:valueRetained,target_meter_progress_percent:meterProgress,target_replacement_days:targetDateDays},flags};
}

Deno.serve(async req => {
  try {
    const base44 = createClientFromRequest(req);
    const auth = await requireAdmin(base44);
    if (auth.error) return auth.error;
    const user = auth.user;
    const body = await req.json().catch(()=>({}));
    const action = norm(body?.action);
    const id = norm(body?.equipment_id);
    const Equipment = base44.asServiceRole.entities.FleetEquipment;
    const Profile = base44.asServiceRole.entities.FleetLifecycleProfile;
    if (!id) return Response.json({error:'Fleet equipment id is required.'},{status:400});
    const equipment = await Equipment.get(id).catch(()=>null);
    if (!equipment) return Response.json({error:'Fleet equipment was not found.'},{status:404});
    const rows = await Profile.filter({equipment_id:id});
    if ((rows||[]).length>1) return Response.json({error:'Multiple lifecycle profiles exist for this equipment. Resolve the duplicates before continuing.'},{status:409});
    let profile = rows?.[0] || null;

    if (action==='get') return Response.json({success:true,...await lifecycleView(base44,equipment,profile)});
    if (action==='save') {
      const source = body?.profile || {};
      const status = norm(source.replacement_status || profile?.replacement_status || 'monitor');
      if (!LIFECYCLE_STATUSES.has(status)) return Response.json({error:'Invalid Fleet replacement status.'},{status:400});
      const patch:any = {
        acquisition_cost:nonNegative(source.acquisition_cost,0),
        acquisition_date:norm(source.acquisition_date),
        current_value:nonNegative(source.current_value,0),
        target_replacement_date:norm(source.target_replacement_date),
        target_mileage_hours:nonNegative(source.target_mileage_hours,0),
        expected_residual_value:nonNegative(source.expected_residual_value,0),
        replacement_status:status,
        annual_budget:nonNegative(source.annual_budget,0),
        notes:norm(source.notes),
        updated_by_email:user.email||'',
      };
      if (!profile) {
        profile = await Profile.create({...patch,equipment_id:id,creation_key:`fleet-lifecycle:${id}`});
      } else {
        const expected = norm(body?.expected_updated_date);
        if (!expected) return Response.json({error:'Lifecycle profile version is missing. Reload before saving.'},{status:409});
        profile = await updateFleetRecordIfCurrent({entity:Profile,id:profile.id,expectedUpdatedAt:expected,patch,label:'Fleet lifecycle profile'});
      }
      return Response.json({success:true,...await lifecycleView(base44,equipment,profile)});
    }
    return Response.json({error:'Unsupported Fleet lifecycle action.'},{status:400});
  } catch (error:any) {
    console.error('fleetLifecycleAction error:',error);
    if (error?.code==='FLEET_RECORD_CONFLICT') return Response.json({error:error.message},{status:409});
    return Response.json({error:error?.message || 'Fleet lifecycle operation failed.'},{status:500});
  }
});

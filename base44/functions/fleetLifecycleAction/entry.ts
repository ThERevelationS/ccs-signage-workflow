import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { resolveFleetStaffUser } from '../../shared/fleetStaffSession.ts';
import { loadAllEntityRows } from '../../shared/pagedEntityRows.ts';
import { updateFleetRecordIfCurrent } from '../../shared/fleetRecordPersistence.ts';
import { resolveFleetMeterReading } from '../../shared/fleetMeterReading.ts';

const norm = (value: unknown) => String(value ?? '').trim();
const num = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const nonNegative = (value: unknown, fallback = 0) => Math.max(0, num(value, fallback));
const todayEastern = () => new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const LIFECYCLE_STATUSES = new Set(['monitor','plan','replace_soon','approved','replaced']);

async function requireAdmin(base44:any, sessionToken) {
  const user = (await base44.auth.me().catch(() => null)) || await resolveFleetStaffUser(base44, sessionToken);
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
  const definitiveBouncie = ['matched','manual'].includes(String(equipment?.bouncie_link_status || '')) && !!norm(equipment?.vin) && !!norm(equipment?.bouncie_imei);
  const reading = await resolveFleetMeterReading(base44,equipment,definitiveBouncie
    ? {source:'bouncie',meter_type:'odometer_miles'}
    : {source:'manual',meter_type:'manual'});
  return reading.source === 'manual' ? {...reading,unit:'mileage / hours'} : reading;
}

function serviceCycleDays(workOrder:any) {
  if (!workOrder?.started_date || !workOrder?.completed_date) return null;
  const start = Date.parse(`${workOrder.started_date}T12:00:00`);
  const end = Date.parse(`${workOrder.completed_date}T12:00:00`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  return Math.max(0,Math.round((end-start)/86400000));
}

function planningPriority(equipment:any,profile:any,metrics:any,flags:any[]) {
  if (equipment?.status === 'retired' || profile?.replacement_status === 'replaced') return {score:0,label:'Archived',signals:['Archived / replaced asset']};
  let score = ({monitor:0,plan:20,replace_soon:50,approved:65}[profile?.replacement_status] ?? 0);
  const signals:string[] = [];
  for (const flag of flags || []) {
    if (flag.severity === 'high') score += 25;
    else if (flag.severity === 'medium') score += 10;
    if (flag.severity === 'high' || flag.severity === 'medium') signals.push(flag.label);
  }
  if (equipment?.status === 'down') { score += 15; signals.push('Asset is currently down'); }
  else if (equipment?.status === 'maintenance') { score += 5; signals.push('Asset is currently in maintenance'); }
  if ((metrics?.recent_completed_work_orders || 0) >= 4) { score += 10; signals.push(`${metrics.recent_completed_work_orders} completed maintenance WOs in the past 12 months`); }
  score = Math.min(100,Math.max(0,Math.round(score)));
  const label = score >= 70 ? 'High' : score >= 40 ? 'Medium' : score >= 15 ? 'Watch' : 'Low';
  if (!signals.length) signals.push('No current replacement-planning exceptions');
  return {score,label,signals};
}

async function lifecycleView(base44:any,equipment:any,profile:any) {
  const WorkOrder = base44.asServiceRole.entities.FleetMaintenanceWorkOrder;
  const workOrders = await loadAllEntityRows({entity:WorkOrder,query:{equipment_id:equipment.id},sort:'-created_date',label:`Lifecycle work orders for ${equipment.id}`});
  const completed = workOrders.filter((row:any)=>row.status==='completed');
  const maintenanceCost = completed.reduce((sum:number,row:any)=>sum+serviceCost(row),0);
  const cutoff = Date.now() - (365*86400000);
  const recentCompleted = completed.filter((row:any)=>{
    const stamp = Date.parse(row.completed_date ? `${row.completed_date}T12:00:00` : row.updated_date || row.created_date || '');
    return Number.isFinite(stamp) && stamp >= cutoff;
  });
  const recentMaintenanceCost = recentCompleted.reduce((sum:number,row:any)=>sum+serviceCost(row),0);
  const cycleDays = completed.map(serviceCycleDays).filter((value:any)=>value !== null) as number[];
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
  if (maintenanceToAcquisition !== null && maintenanceToAcquisition >= 0.75) flags.push({code:'maintenance_cost_high_vs_acquisition',severity:'high',label:`Recorded maintenance cost is ${(maintenanceToAcquisition*100).toFixed(1)}% of acquisition cost.`});
  else if (maintenanceToAcquisition !== null && maintenanceToAcquisition >= 0.5) flags.push({code:'maintenance_cost_watch_vs_acquisition',severity:'medium',label:`Recorded maintenance cost is ${(maintenanceToAcquisition*100).toFixed(1)}% of acquisition cost.`});
  if (equipment.status==='retired') flags.push({code:'asset_retired',severity:'info',label:'This asset is retired; lifecycle information is retained for historical planning.'});
  const metrics:any = {maintenance_cost:maintenanceCost,recent_maintenance_cost:recentMaintenanceCost,completed_work_orders:completed.length,recent_completed_work_orders:recentCompleted.length,current_meter:meter,age_years:ageYears,model_age_years:modelAgeYears,cost_per_meter:costPerMeter,maintenance_to_acquisition_ratio:maintenanceToAcquisition,value_retained_ratio:valueRetained,target_meter_progress_percent:meterProgress,target_replacement_days:targetDateDays,average_service_cycle_days:cycleDays.length?Math.round((cycleDays.reduce((sum,value)=>sum+value,0)/cycleDays.length)*10)/10:null,longest_service_cycle_days:cycleDays.length?Math.max(...cycleDays):null};
  return {equipment,profile:profile||null,metrics,flags,priority:planningPriority(equipment,profile,metrics,flags)};
}

Deno.serve(async req => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(()=>({}));
    const auth = await requireAdmin(base44, body?.session_token);
    if (auth.error) return auth.error;
    const user = auth.user;

    const action = norm(body?.action);
    const id = norm(body?.equipment_id);
    const Equipment = base44.asServiceRole.entities.FleetEquipment;
    const Profile = base44.asServiceRole.entities.FleetLifecycleProfile;
    if (action==='portfolio') {
      const [equipmentRows,profileRows] = await Promise.all([
        loadAllEntityRows({entity:Equipment,sort:'name',label:'Fleet lifecycle portfolio equipment'}),
        loadAllEntityRows({entity:Profile,sort:'-updated_date',label:'Fleet lifecycle portfolio profiles'}),
      ]);
      const duplicateEquipmentIds = [...new Set((profileRows||[]).map((row:any)=>row.equipment_id).filter((equipmentId:string)=>equipmentId && (profileRows||[]).filter((candidate:any)=>candidate.equipment_id===equipmentId).length>1))];
      if (duplicateEquipmentIds.length) return Response.json({error:'Duplicate Fleet lifecycle profiles exist. Resolve them before portfolio planning can be calculated.',duplicate_equipment_ids:duplicateEquipmentIds},{status:409});
      const profileByEquipment = new Map((profileRows||[]).map((row:any)=>[row.equipment_id,row]));
      const rows:any[] = [];
      for (const equipment of equipmentRows||[]) rows.push(await lifecycleView(base44,equipment,profileByEquipment.get(equipment.id)||null));
      rows.sort((a,b)=>Number(b.priority?.score||0)-Number(a.priority?.score||0)||String(a.equipment?.name||'').localeCompare(String(b.equipment?.name||'')));
      return Response.json({success:true,rows,summary:{assets:rows.length,active:rows.filter(row=>row.equipment?.status!=='retired').length,high_priority:rows.filter(row=>row.equipment?.status!=='retired'&&row.priority?.label==='High').length,planned:rows.filter(row=>['plan','replace_soon','approved'].includes(row.profile?.replacement_status)).length,total_recorded_maintenance:rows.reduce((sum,row)=>sum+Number(row.metrics?.maintenance_cost||0),0)}});
    }
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
    if (Number(error?.status||error?.response?.status)===429||/rate limit|too many requests/i.test(String(error?.message||''))) return Response.json({error:'Fleet lifecycle operation is busy. Try again shortly.',retry_after_ms:3000},{status:429,headers:{'Retry-After':'3'}});
    if (error?.code==='FLEET_RECORD_CONFLICT') return Response.json({error:error.message},{status:409});
    return Response.json({error:error?.message || 'Fleet lifecycle operation failed.'},{status:500});
  }
});
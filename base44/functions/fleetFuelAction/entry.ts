import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { loadAllEntityRows } from '../../shared/pagedEntityRows.ts';
import { updateFleetRecordIfCurrent } from '../../shared/fleetRecordPersistence.ts';

const norm = (value: unknown) => String(value ?? '').trim();
const nowIso = () => new Date().toISOString();
const finite = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};
const nonNegative = (value: unknown, fallback: number | null = null) => {
  const parsed = finite(value);
  return parsed == null || parsed < 0 ? fallback : parsed;
};

async function authorize(base44:any) {
  const user = await base44.auth.me().catch(()=>null);
  if (!user?.email) return {error:Response.json({error:'Unauthorized'},{status:401})};
  if (user.role === 'admin') return {user,isAdmin:true};
  const rows = await base44.asServiceRole.entities.AuthorizedEmail.filter({email:user.email});
  if (!rows?.[0]) return {error:Response.json({error:'This CCS account is not authorized for Fleet operations.'},{status:403})};
  return {user,isAdmin:rows[0].role==='admin'};
}

function entryPatch(source:any,user:any) {
  const gallons = nonNegative(source?.gallons);
  const totalCost = nonNegative(source?.total_cost);
  const odometer = source?.odometer === '' || source?.odometer == null ? null : nonNegative(source?.odometer);
  if (gallons == null || gallons <= 0) throw new Error('Gallons must be greater than zero.');
  if (totalCost == null) throw new Error('Total fuel cost must be zero or greater.');
  const fueledAt = norm(source?.fueled_at);
  if (!fueledAt || !Number.isFinite(Date.parse(fueledAt))) throw new Error('A valid fuel date/time is required.');
  return {
    equipment_id:norm(source?.equipment_id),
    fueled_at:fueledAt,
    ...(odometer == null ? {} : {odometer}),
    gallons,
    total_cost:totalCost,
    price_per_gallon:gallons > 0 ? Math.round((totalCost/gallons)*10000)/10000 : 0,
    vendor:norm(source?.vendor),
    receipt_url:norm(source?.receipt_url),
    notes:norm(source?.notes),
    recorded_by_email:user?.email || '',
    source:source?.source === 'import' ? 'import' : 'manual',
  };
}

function sameCreate(a:any,b:any) {
  const textFields = ['equipment_id','fueled_at','vendor','receipt_url','notes','source'];
  if (textFields.some(key=>norm(a?.[key])!==norm(b?.[key]))) return false;
  const numberFields = ['odometer','gallons','total_cost'];
  return numberFields.every(key=>{
    const left = a?.[key] == null || a?.[key] === '' ? null : Number(a[key]);
    const right = b?.[key] == null || b?.[key] === '' ? null : Number(b[key]);
    return left === right;
  });
}

function serviceCost(workOrder:any) {
  if (workOrder?.total_cost !== null && workOrder?.total_cost !== undefined && workOrder?.total_cost !== '' && Number.isFinite(Number(workOrder.total_cost))) return Number(workOrder.total_cost);
  const lines = [...(Array.isArray(workOrder?.parts_used)?workOrder.parts_used:[]),...(Array.isArray(workOrder?.fluids_used)?workOrder.fluids_used:[])];
  return lines.reduce((sum:number,row:any)=>sum+(Number.isFinite(Number(row?.cost))?Number(row.cost):0),0);
}

function inRange(timestamp:string,start:string,end:string) {
  const value = Date.parse(timestamp || '');
  if (!Number.isFinite(value)) return false;
  if (start) {
    const min = Date.parse(`${start}T00:00:00`);
    if (Number.isFinite(min) && value < min) return false;
  }
  if (end) {
    const max = Date.parse(`${end}T23:59:59.999`);
    if (Number.isFinite(max) && value > max) return false;
  }
  return true;
}

function fuelMetrics(entries:any[]) {
  const sorted = (entries||[]).slice().sort((a,b)=>(Date.parse(a.fueled_at||'')||0)-(Date.parse(b.fueled_at||'')||0));
  const gallons = sorted.reduce((sum,row)=>sum+Number(row.gallons||0),0);
  const fuelCost = sorted.reduce((sum,row)=>sum+Number(row.total_cost||0),0);
  const pricePerGallon = gallons > 0 ? fuelCost/gallons : null;
  let distance = 0;
  let gallonsForMpg = 0;
  let measuredFuelCost = 0;
  let odometerSegments = 0;
  let prior:any = null;
  for (const row of sorted) {
    const odo = finite(row.odometer);
    if (odo == null) continue;
    if (prior) {
      const priorOdo = finite(prior.odometer);
      if (priorOdo != null && odo >= priorOdo) {
        const delta = odo-priorOdo;
        if (delta > 0) {
          distance += delta;
          gallonsForMpg += Number(row.gallons||0);
          measuredFuelCost += Number(row.total_cost||0);
          odometerSegments += 1;
        }
      }
    }
    prior = row;
  }
  const mpg = distance > 0 && gallonsForMpg > 0 ? distance/gallonsForMpg : null;
  const fuelCostPerMile = distance > 0 ? measuredFuelCost/distance : null;
  return {entries:sorted.length,gallons,fuel_cost:fuelCost,average_price_per_gallon:pricePerGallon,fill_to_fill_distance_miles:distance,fill_to_fill_gallons:gallonsForMpg,fill_to_fill_fuel_cost:measuredFuelCost,fill_to_fill_mpg:mpg,fuel_cost_per_mile:fuelCostPerMile,odometer_segments:odometerSegments};
}

Deno.serve(async req => {
  try {
    const base44 = createClientFromRequest(req);
    const auth = await authorize(base44);
    if (auth.error) return auth.error;
    const user = auth.user;
    const body = await req.json().catch(()=>({}));
    const action = norm(body?.action);
    const Fuel = base44.asServiceRole.entities.FleetFuelEntry;
    const Equipment = base44.asServiceRole.entities.FleetEquipment;

    if (action === 'create') {
      const creationKey = norm(body?.creation_key);
      if (!creationKey || creationKey.length < 12 || creationKey.length > 200 || /\s/.test(creationKey)) return Response.json({error:'Fuel-entry create identity is missing or invalid.'},{status:409});
      const patch = entryPatch(body?.entry || body,user);
      if (!patch.equipment_id) return Response.json({error:'Fleet equipment is required.'},{status:400});
      const equipment = await Equipment.get(patch.equipment_id).catch(()=>null);
      if (!equipment) return Response.json({error:'Selected Fleet equipment was not found.'},{status:404});
      if (equipment.status === 'retired') return Response.json({error:'Retired Fleet equipment cannot receive new fuel entries.'},{status:409});
      const existing = await Fuel.filter({creation_key:creationKey});
      if (existing.length > 1) return Response.json({error:'Multiple fuel entries share this create identity. Review duplicates before retrying.'},{status:409});
      if (existing[0]) {
        if (!sameCreate(existing[0],patch)) return Response.json({error:'This fuel-entry create identity already belongs to different details. Reopen the form before creating another entry.'},{status:409});
        return Response.json({success:true,reused:true,entry:existing[0]});
      }
      const created = await Fuel.create({...patch,creation_key:creationKey});
      await new Promise(resolve=>setTimeout(resolve,75));
      const contenders = await Fuel.filter({creation_key:creationKey});
      if (contenders.length > 1) {
        const winner = contenders.slice().sort((a:any,b:any)=>String(a.id).localeCompare(String(b.id)))[0];
        for (const row of contenders) if (row.id !== winner.id) await Fuel.delete(row.id).catch(()=>null);
        if (!sameCreate(winner,patch)) return Response.json({error:'A concurrent fuel entry won this create identity with different details.'},{status:409});
        return Response.json({success:true,reused:winner.id!==created.id,entry:winner});
      }
      return Response.json({success:true,entry:created});
    }

    if (action === 'import') {
      const rows = Array.isArray(body?.entries) ? body.entries : [];
      if (!rows.length || rows.length > 100) return Response.json({error:'Fuel import requires 1–100 rows per batch.'},{status:400});
      const results:any[] = [];
      for (let index=0; index<rows.length; index+=1) {
        const row = rows[index] || {};
        const creationKey = norm(row.creation_key);
        try {
          if (!creationKey || creationKey.length < 12 || creationKey.length > 200 || /\s/.test(creationKey)) throw new Error('Invalid creation key.');
          const patch = entryPatch({...row,source:'import'},user);
          if (!patch.equipment_id) throw new Error('Equipment is required.');
          const equipment = await Equipment.get(patch.equipment_id).catch(()=>null);
          if (!equipment) throw new Error('Equipment was not found.');
          if (equipment.status === 'retired') throw new Error('Retired equipment cannot receive new fuel entries.');
          const existing = await Fuel.filter({creation_key:creationKey});
          if (existing.length > 1) throw new Error('Duplicate create identity requires review.');
          if (existing[0]) {
            if (!sameCreate(existing[0],patch)) throw new Error('Create identity already belongs to different fuel details.');
            results.push({index,status:'reused',id:existing[0].id});
            continue;
          }
          const created = await Fuel.create({...patch,creation_key:creationKey});
          await new Promise(resolve=>setTimeout(resolve,50));
          const contenders = await Fuel.filter({creation_key:creationKey});
          if (contenders.length > 1) {
            const winner = contenders.slice().sort((a:any,b:any)=>String(a.id).localeCompare(String(b.id)))[0];
            for (const candidate of contenders) if (candidate.id !== winner.id) await Fuel.delete(candidate.id).catch(()=>null);
            if (!sameCreate(winner,patch)) throw new Error('A concurrent import won this create identity with different fuel details.');
            results.push({index,status:winner.id===created.id?'created':'reused',id:winner.id});
            continue;
          }
          results.push({index,status:'created',id:created.id});
        } catch (error:any) {
          results.push({index,status:'error',error:error?.message || String(error)});
        }
      }
      return Response.json({success:results.every(row=>row.status!=='error'),created:results.filter(row=>row.status==='created').length,reused:results.filter(row=>row.status==='reused').length,errors:results.filter(row=>row.status==='error').length,results});
    }

    if (action === 'summary') {
      const equipmentId = norm(body?.equipment_id);
      const startDate = norm(body?.start_date);
      const endDate = norm(body?.end_date);
      let entries = await loadAllEntityRows({entity:Fuel,query:equipmentId?{equipment_id:equipmentId}:{},sort:'fueled_at',label:'Fleet fuel analytics entries'});
      entries = entries.filter((row:any)=>inRange(row.fueled_at,startDate,endDate));
      const allEquipment = await loadAllEntityRows({entity:Equipment,sort:'name',label:'Fleet equipment for fuel analytics'});
      const allowedIds = new Set(allEquipment.filter((row:any)=>!equipmentId || row.id===equipmentId).map((row:any)=>row.id));
      entries = entries.filter((row:any)=>allowedIds.has(row.equipment_id));
      const equipmentById = new Map(allEquipment.map((row:any)=>[row.id,row]));
      const WorkOrder = base44.asServiceRole.entities.FleetMaintenanceWorkOrder;
      let workOrders = await loadAllEntityRows({entity:WorkOrder,query:equipmentId?{equipment_id:equipmentId,status:'completed'}:{status:'completed'},sort:'completed_date',label:'Fleet maintenance cost for fuel analytics'});
      workOrders = workOrders.filter((row:any)=>allowedIds.has(row.equipment_id) && inRange(row.completed_date ? `${row.completed_date}T12:00:00` : row.updated_date || row.created_date,startDate,endDate));
      const maintenanceCost = workOrders.reduce((sum:number,row:any)=>sum+serviceCost(row),0);
      const metrics = fuelMetrics(entries);
      const byEquipment:any[] = [];
      for (const equipmentIdValue of [...new Set(entries.map((row:any)=>row.equipment_id))]) {
        const eqEntries = entries.filter((row:any)=>row.equipment_id===equipmentIdValue);
        const eqWork = workOrders.filter((row:any)=>row.equipment_id===equipmentIdValue);
        const eqFuel = fuelMetrics(eqEntries);
        const eqMaintenance = eqWork.reduce((sum:number,row:any)=>sum+serviceCost(row),0);
        const operatingCost = eqFuel.fuel_cost + eqMaintenance;
        const measuredOperatingCost = eqFuel.fill_to_fill_fuel_cost + eqMaintenance;
        byEquipment.push({equipment_id:equipmentIdValue,equipment_name:equipmentById.get(equipmentIdValue)?.name || 'Unknown Fleet equipment',...eqFuel,maintenance_cost:eqMaintenance,total_operating_cost:operatingCost,maintenance_cost_per_mile:eqFuel.fill_to_fill_distance_miles>0?eqMaintenance/eqFuel.fill_to_fill_distance_miles:null,operating_cost_per_mile:eqFuel.fill_to_fill_distance_miles>0?measuredOperatingCost/eqFuel.fill_to_fill_distance_miles:null});
      }
      byEquipment.sort((a,b)=>b.total_operating_cost-a.total_operating_cost || String(a.equipment_name).localeCompare(String(b.equipment_name)));
      const totalOperating = metrics.fuel_cost + maintenanceCost;
      const measuredOperatingCost = metrics.fill_to_fill_fuel_cost + maintenanceCost;
      return Response.json({success:true,entries,metrics:{...metrics,maintenance_cost:maintenanceCost,total_operating_cost:totalOperating,maintenance_cost_per_mile:metrics.fill_to_fill_distance_miles>0?maintenanceCost/metrics.fill_to_fill_distance_miles:null,operating_cost_per_mile:metrics.fill_to_fill_distance_miles>0?measuredOperatingCost/metrics.fill_to_fill_distance_miles:null},by_equipment:byEquipment,methodology:'MPG and per-mile values are fill-to-fill estimates based only on consecutive non-decreasing fuel-entry odometer readings. The first odometer-bearing fill establishes the baseline and its gallons/cost are excluded from measured MPG and fuel-per-mile. Operating cost combines recorded fuel spend with completed Fleet work-order cost in the selected period; it is not total cost of ownership.'});
    }

    const id = norm(body?.id);
    if (!id) return Response.json({error:'Fleet fuel entry id is required.'},{status:400});
    const existing = await Fuel.get(id).catch(()=>null);
    if (!existing) return Response.json({error:'Fleet fuel entry was not found.'},{status:404});
    if (!auth.isAdmin) return Response.json({error:'Only a CCS admin can edit or delete an existing Fleet fuel entry.'},{status:403});

    if (action === 'update') {
      const patch = entryPatch({...existing,...(body?.entry||{})},user);
      const equipment = await Equipment.get(patch.equipment_id).catch(()=>null);
      if (!equipment) return Response.json({error:'Selected Fleet equipment was not found.'},{status:404});
      const expected = norm(body?.expected_updated_date);
      if (!expected) return Response.json({error:'Fuel-entry version is missing. Reload before saving.'},{status:409});
      const updated = await updateFleetRecordIfCurrent({entity:Fuel,id,expectedUpdatedAt:expected,patch,label:'Fleet fuel entry'});
      return Response.json({success:true,entry:updated});
    }
    if (action === 'delete') {
      const expected = norm(body?.expected_updated_date);
      if (!expected || expected !== norm(existing.updated_date)) return Response.json({error:'Fuel entry changed after it was opened. Reload before deleting.'},{status:409});
      await Fuel.delete(id);
      return Response.json({success:true,deleted:true});
    }
    return Response.json({error:'Unsupported Fleet fuel action.'},{status:400});
  } catch (error:any) {
    console.error('fleetFuelAction error:',error);
    if (error?.code === 'FLEET_RECORD_CONFLICT') return Response.json({error:error.message},{status:409});
    return Response.json({error:error?.message || 'Fleet fuel operation failed.'},{status:500});
  }
});
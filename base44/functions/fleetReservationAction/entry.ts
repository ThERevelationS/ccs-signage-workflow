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

async function authorize(base44:any, sessionToken) {
  const user = (await base44.auth.me().catch(() => null)) || await resolveFleetStaffUser(base44, sessionToken);
  if (!user?.email) return {error:Response.json({error:'Unauthorized'},{status:401})};
  if (user.role === 'admin') return {user,isAdmin:true};
  const rows = await base44.asServiceRole.entities.AuthorizedEmail.filter({email:user.email});
  if (!rows?.[0]) return {error:Response.json({error:'This CCS account is not authorized for Fleet operations.'},{status:403})};
  return {user,isAdmin:rows[0].role==='admin'};
}

function dates(source:any) {
  const start = norm(source?.start_at);
  const end = norm(source?.end_at);
  const startMs = Date.parse(start);
  const endMs = Date.parse(end);
  if (!start || !end || !Number.isFinite(startMs) || !Number.isFinite(endMs)) throw new Error('Valid reservation start and end times are required.');
  if (endMs <= startMs) throw new Error('Reservation end must be after the start time.');
  return {start,end,startMs,endMs};
}

function basePatch(source:any,user:any,isAdmin:boolean) {
  const {start,end} = dates(source);
  const requestedEmail = norm(source?.reserved_by_email);
  const reservedEmail = isAdmin && requestedEmail ? requestedEmail : norm(user?.email);
  const reservedName = norm(source?.reserved_by_name) || norm(user?.full_name || user?.name || user?.email);
  if (!reservedEmail) throw new Error('Reservation user email is required.');
  return {
    equipment_id:norm(source?.equipment_id),
    reserved_by_email:reservedEmail,
    reserved_by_name:reservedName,
    assignment_label:norm(source?.assignment_label),
    job_site:norm(source?.job_site),
    start_at:start,
    end_at:end,
    notes:norm(source?.notes),
  };
}

function sameCreate(existing:any,patch:any) {
  return ['equipment_id','reserved_by_email','reserved_by_name','assignment_label','job_site','start_at','end_at','notes'].every(key=>norm(existing?.[key])===norm(patch?.[key]));
}

function overlaps(aStart:string,aEnd:string,bStart:string,bEnd:string) {
  const a1=Date.parse(aStart||''),a2=Date.parse(aEnd||''),b1=Date.parse(bStart||''),b2=Date.parse(bEnd||'');
  return [a1,a2,b1,b2].every(Number.isFinite) && a1 < b2 && b1 < a2;
}

async function conflictingRows(base44:any,equipmentId:string,startAt:string,endAt:string,ignoreId='') {
  const Reservation=base44.asServiceRole.entities.FleetReservation;
  const rows=await loadAllEntityRows({entity:Reservation,query:{equipment_id:equipmentId},sort:'start_at',label:`Fleet reservation conflicts for ${equipmentId}`});
  return rows.filter((row:any)=>row.id!==ignoreId && ['reserved','checked_out'].includes(row.status) && (row.status==='checked_out' || overlaps(startAt,endAt,row.start_at,row.end_at)));
}

async function conflictFor(base44:any,equipmentId:string,startAt:string,endAt:string,ignoreId='') {
  return (await conflictingRows(base44,equipmentId,startAt,endAt,ignoreId))[0] || null;
}

async function currentMeter(base44:any,equipment:any) {
  const tracked=['matched','manual'].includes(String(equipment?.bouncie_link_status||'')) && norm(equipment?.vin) && norm(equipment?.bouncie_imei);
  return resolveFleetMeterReading(base44,equipment,tracked?{source:'bouncie',meter_type:'odometer_miles'}:{source:'manual',meter_type:'manual'});
}

Deno.serve(async req=>{
  try{
    const base44=createClientFromRequest(req);
    const body = await req.json().catch(()=>({}));
    const auth = await authorize(base44, body?.session_token);
    if(auth.error)return auth.error;
    const {user,isAdmin}=auth;

    const action=norm(body?.action);
    const Reservation=base44.asServiceRole.entities.FleetReservation;
    const Equipment=base44.asServiceRole.entities.FleetEquipment;

    if(action==='list'){
      const equipmentId=norm(body?.equipment_id);
      const rows=await loadAllEntityRows({entity:Reservation,query:equipmentId?{equipment_id:equipmentId}:{},sort:'start_at',label:'Fleet reservations'});
      const equipmentRows=await loadAllEntityRows({entity:Equipment,sort:'name',label:'Fleet reservation equipment'});
      const equipmentById=new Map(equipmentRows.map((row:any)=>[row.id,row]));
      const enriched=rows.map((row:any)=>({...row,equipment_name:equipmentById.get(row.equipment_id)?.name||'Unknown Fleet equipment',equipment_status:equipmentById.get(row.equipment_id)?.status||'unknown'}));
      return Response.json({success:true,reservations:enriched});
    }

    if(action==='availability'){
      const equipmentId=norm(body?.equipment_id);
      if(!equipmentId)return Response.json({error:'Fleet equipment is required.'},{status:400});
      const equipment=await Equipment.get(equipmentId).catch(()=>null);
      if(!equipment)return Response.json({error:'Fleet equipment was not found.'},{status:404});
      const meter=await currentMeter(base44,equipment);
      let conflict=null;
      if(body?.start_at&&body?.end_at){
        dates(body);
        conflict=await conflictFor(base44,equipmentId,norm(body.start_at),norm(body.end_at),norm(body.ignore_id));
      }
      return Response.json({success:true,equipment,meter,available:!conflict,conflict});
    }

    if(action==='create'){
      const creationKey=norm(body?.creation_key);
      if(!creationKey||creationKey.length<12||creationKey.length>200||/\s/.test(creationKey))return Response.json({error:'Reservation create identity is missing or invalid.'},{status:409});
      const patch=basePatch(body?.reservation||body,user,isAdmin);
      if(!patch.equipment_id)return Response.json({error:'Fleet equipment is required.'},{status:400});
      const equipment=await Equipment.get(patch.equipment_id).catch(()=>null);
      if(!equipment)return Response.json({error:'Selected Fleet equipment was not found.'},{status:404});
      if(equipment.status==='retired')return Response.json({error:'Retired Fleet equipment cannot be reserved.'},{status:409});
      if(equipment.status==='down')return Response.json({error:'Equipment marked down cannot be reserved until its Fleet status changes.'},{status:409});
      const conflict=await conflictFor(base44,patch.equipment_id,patch.start_at,patch.end_at);
      if(conflict)return Response.json({error:`${equipment.name} is already reserved or checked out for an overlapping time.`,conflict},{status:409});
      const existing=await Reservation.filter({creation_key:creationKey});
      if(existing.length>1)return Response.json({error:'Multiple reservations share this create identity. Review duplicates before retrying.'},{status:409});
      if(existing[0]){
        if(!sameCreate(existing[0],patch))return Response.json({error:'This reservation create identity already belongs to different details. Reopen before creating another reservation.'},{status:409});
        return Response.json({success:true,reused:true,reservation:existing[0]});
      }
      const created=await Reservation.create({...patch,status:'reserved',creation_key:creationKey});
      await new Promise(resolve=>setTimeout(resolve,75));
      const contenders=await Reservation.filter({creation_key:creationKey});
      if(contenders.length>1){
        const winner=contenders.slice().sort((a:any,b:any)=>String(a.id).localeCompare(String(b.id)))[0];
        for(const row of contenders)if(row.id!==winner.id)await Reservation.delete(row.id).catch(()=>null);
        if(!sameCreate(winner,patch))return Response.json({error:'A concurrent reservation won this create identity with different details.'},{status:409});
        if(winner.id!==created.id)return Response.json({success:true,reused:true,reservation:winner});
      }
      const overlapAfterCreate=await conflictingRows(base44,patch.equipment_id,patch.start_at,patch.end_at,created.id);
      if(overlapAfterCreate.length){
        const candidates=[created,...overlapAfterCreate].sort((a:any,b:any)=>(Date.parse(a.created_date||'')||0)-(Date.parse(b.created_date||'')||0)||String(a.id).localeCompare(String(b.id)));
        const winner=candidates[0];
        if(winner.id!==created.id){
          await Reservation.delete(created.id).catch(()=>null);
          return Response.json({error:`${equipment.name} was reserved by another user at the same time. Reload to see the winning reservation.`,conflict:winner},{status:409});
        }
      }
      return Response.json({success:true,reservation:created});
    }

    const id=norm(body?.id);
    if(!id)return Response.json({error:'Fleet reservation id is required.'},{status:400});
    const existing=await Reservation.get(id).catch(()=>null);
    if(!existing)return Response.json({error:'Fleet reservation was not found.'},{status:404});
    const owns=norm(existing.reserved_by_email).toLowerCase()===norm(user.email).toLowerCase();
    if(!isAdmin&&!owns)return Response.json({error:'You can only change your own Fleet reservations.'},{status:403});
    const expected=norm(body?.expected_updated_date);
    if(!expected)return Response.json({error:'Reservation version is missing. Reload before changing it.'},{status:409});

    if(action==='update'){
      if(existing.status!=='reserved')return Response.json({error:'Only a reserved booking can be edited. Checked-out, returned, or cancelled records stay historical.'},{status:409});
      const patch=basePatch({...existing,...(body?.reservation||{})},user,isAdmin);
      const equipment=await Equipment.get(patch.equipment_id).catch(()=>null);
      if(!equipment)return Response.json({error:'Selected Fleet equipment was not found.'},{status:404});
      if(equipment.status==='retired'||equipment.status==='down')return Response.json({error:'This Fleet asset is not currently reservable.'},{status:409});
      const conflict=await conflictFor(base44,patch.equipment_id,patch.start_at,patch.end_at,id);
      if(conflict)return Response.json({error:`${equipment.name} has an overlapping active reservation.`,conflict},{status:409});
      const updated=await updateFleetRecordIfCurrent({entity:Reservation,id,expectedUpdatedAt:expected,patch,label:'Fleet reservation'});
      return Response.json({success:true,reservation:updated});
    }

    if(action==='cancel'){
      if(existing.status!=='reserved')return Response.json({error:'Only a reserved booking can be cancelled. Checked-out equipment must be returned.'},{status:409});
      const updated=await updateFleetRecordIfCurrent({entity:Reservation,id,expectedUpdatedAt:expected,patch:{status:'cancelled'},label:'Fleet reservation'});
      return Response.json({success:true,reservation:updated});
    }

    if(action==='check_out'){
      if(existing.status!=='reserved')return Response.json({error:'Only a reserved booking can be checked out.'},{status:409});
      const equipment=await Equipment.get(existing.equipment_id).catch(()=>null);
      if(!equipment)return Response.json({error:'Fleet equipment was not found.'},{status:404});
      if(equipment.status!=='operational')return Response.json({error:'Only equipment currently marked operational can be checked out.'},{status:409});
      const conflict=await conflictFor(base44,existing.equipment_id,existing.start_at,existing.end_at,id);
      if(conflict)return Response.json({error:'Another active reservation or checkout now conflicts with this booking.',conflict},{status:409});
      const meter=nonNegativeOrNull(body?.pickup_meter);
      const updated=await updateFleetRecordIfCurrent({entity:Reservation,id,expectedUpdatedAt:expected,patch:{status:'checked_out',checked_out_at:new Date().toISOString(),...(meter==null?{}:{pickup_meter:meter})},label:'Fleet reservation'});
      return Response.json({success:true,reservation:updated});
    }

    if(action==='return'){
      if(existing.status!=='checked_out')return Response.json({error:'Only checked-out equipment can be returned.'},{status:409});
      const meter=nonNegativeOrNull(body?.return_meter);
      const pickup=nonNegativeOrNull(existing.pickup_meter);
      if(meter!=null&&pickup!=null&&meter<pickup)return Response.json({error:'Return meter cannot be below the pickup meter.'},{status:400});
      const updated=await updateFleetRecordIfCurrent({entity:Reservation,id,expectedUpdatedAt:expected,patch:{status:'returned',returned_at:new Date().toISOString(),...(meter==null?{}:{return_meter:meter})},label:'Fleet reservation'});
      return Response.json({success:true,reservation:updated});
    }

    if(action==='delete'){
      if(!isAdmin)return Response.json({error:'Only a CCS admin can delete a Fleet reservation record.'},{status:403});
      if(!['reserved','cancelled'].includes(existing.status))return Response.json({error:'Checked-out or returned reservations are preserved as Fleet history and cannot be deleted.'},{status:409});
      if(expected!==norm(existing.updated_date))return Response.json({error:'Reservation changed after it was opened. Reload before deleting.'},{status:409});
      await Reservation.delete(id);
      return Response.json({success:true,deleted:true});
    }

    return Response.json({error:'Unsupported Fleet reservation action.'},{status:400});
  }catch(error:any){
    console.error('fleetReservationAction error:',error);
    if(Number(error?.status||error?.response?.status)===429||/rate limit|too many requests/i.test(String(error?.message||'')))return Response.json({error:'Fleet reservation operation is busy. Try again shortly.',retry_after_ms:3000},{status:429,headers:{'Retry-After':'3'}});
    if(error?.code==='FLEET_RECORD_CONFLICT')return Response.json({error:error.message},{status:409});
    return Response.json({error:error?.message||'Fleet reservation operation failed.'},{status:500});
  }
});
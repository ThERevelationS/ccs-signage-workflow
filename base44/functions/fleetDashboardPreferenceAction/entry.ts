import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { resolveFleetStaffUser } from '../../shared/fleetStaffSession.ts';
import { updateFleetRecordIfCurrent } from '../../shared/fleetRecordPersistence.ts';

const DEFAULT_ORDER = ['summary','today','system_health','attention','operations'];
const ALLOWED_WIDGETS = new Set(DEFAULT_ORDER);
const norm = (value: unknown) => String(value ?? '').trim();

function normalizedPreference(source:any,userEmail:string){
  const suppliedOrder = Array.isArray(source?.widget_order) ? source.widget_order.map(norm).filter((id:string)=>ALLOWED_WIDGETS.has(id)) : [];
  const order = [...new Set(suppliedOrder)];
  for (const id of DEFAULT_ORDER) if (!order.includes(id)) order.push(id);
  const hidden = [...new Set((Array.isArray(source?.hidden_widgets) ? source.hidden_widgets : []).map(norm).filter((id:string)=>ALLOWED_WIDGETS.has(id)))];
  const density = source?.density === 'compact' ? 'compact' : 'comfortable';
  return {user_email:userEmail,widget_order:order,hidden_widgets:hidden,density,layout_version:1};
}

async function requireUser(base44:any, sessionToken){
  const user = (await base44.auth.me().catch(() => null)) || await resolveFleetStaffUser(base44, sessionToken);
  if(!user?.email) return {error:Response.json({error:'Unauthorized'},{status:401})};
  if(user.role === 'admin') return {user};
  const rows = await base44.asServiceRole.entities.AuthorizedEmail.filter({email:user.email});
  if(!rows?.[0]) return {error:Response.json({error:'This CCS account is not authorized for Fleet operations.'},{status:403})};
  return {user};
}

Deno.serve(async req=>{
  try{
    const base44=createClientFromRequest(req);
    const body = await req.json().catch(()=>({}));
    const auth = await requireUser(base44, body?.session_token);
    if(auth.error)return auth.error;
    const user=auth.user;

    const action=norm(body?.action || 'get');
    const Preference=base44.asServiceRole.entities.FleetDashboardPreference;
    const email=norm(user.email).toLowerCase();
    const rows=await Preference.filter({user_email:email});
    if(rows.length>1)return Response.json({error:'Multiple Fleet dashboard preference rows exist for this user. An administrator must resolve the duplicate records.'},{status:409});
    const existing=rows[0]||null;

    if(action==='get'){
      return Response.json({success:true,preference:normalizedPreference(existing||{},email),record:existing});
    }
    if(action==='reset'){
      const preference=normalizedPreference({},email);
      if(!existing){
        const created=await Preference.create({...preference,creation_key:`fleet-dashboard:${email}`});
        return Response.json({success:true,preference:normalizedPreference(created,email),record:created});
      }
      const expected=norm(body?.expected_updated_date || existing.updated_date);
      const updated=await updateFleetRecordIfCurrent({entity:Preference,id:existing.id,expectedUpdatedAt:expected,patch:preference,label:'Fleet dashboard preference'});
      return Response.json({success:true,preference:normalizedPreference(updated,email),record:updated});
    }
    if(action==='save'){
      const preference=normalizedPreference(body?.preference||{},email);
      if(!existing){
        const creationKey=`fleet-dashboard:${email}`;
        const prior=await Preference.filter({creation_key:creationKey});
        if(prior.length>1)return Response.json({error:'Duplicate Fleet dashboard preference identity exists. Resolve it before saving.'},{status:409});
        if(prior[0]){
          if(norm(prior[0].user_email).toLowerCase()!==email)return Response.json({error:'Dashboard preference identity belongs to another user.'},{status:409});
          return Response.json({success:true,preference:normalizedPreference(prior[0],email),record:prior[0],reused:true});
        }
        const created=await Preference.create({...preference,creation_key:creationKey});
        await new Promise(resolve=>setTimeout(resolve,50));
        const contenders=await Preference.filter({creation_key:creationKey});
        if(contenders.length>1){
          const winner=contenders.slice().sort((a:any,b:any)=>String(a.id).localeCompare(String(b.id)))[0];
          for(const row of contenders)if(row.id!==winner.id)await Preference.delete(row.id).catch(()=>null);
          return Response.json({success:true,preference:normalizedPreference(winner,email),record:winner,reused:winner.id!==created.id});
        }
        return Response.json({success:true,preference:normalizedPreference(created,email),record:created});
      }
      const expected=norm(body?.expected_updated_date);
      if(!expected)return Response.json({error:'Dashboard preference version is missing. Reload before saving.'},{status:409});
      const updated=await updateFleetRecordIfCurrent({entity:Preference,id:existing.id,expectedUpdatedAt:expected,patch:preference,label:'Fleet dashboard preference'});
      return Response.json({success:true,preference:normalizedPreference(updated,email),record:updated});
    }
    return Response.json({error:'Unsupported Fleet dashboard preference action.'},{status:400});
  }catch(error:any){
    console.error('fleetDashboardPreferenceAction error:',error);
    if(Number(error?.status||error?.response?.status)===429||/rate limit|too many requests/i.test(String(error?.message||'')))return Response.json({error:'Fleet dashboard preference operation is busy. Try again shortly.',retry_after_ms:3000},{status:429,headers:{'Retry-After':'3'}});
    if(error?.code==='FLEET_RECORD_CONFLICT')return Response.json({error:error.message},{status:409});
    return Response.json({error:error?.message||'Fleet dashboard preference operation failed.'},{status:500});
  }
});
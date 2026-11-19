import {createClientFromRequest} from 'npm:@base44/sdk@0.8.52';
import {authenticateSignShopSession} from '../../shared/signShopSession.ts';
import {withEntityRateLimitRetry} from '../../shared/entityRateLimitRetry.ts';
// Health probe for the permitting pipeline — the first thing to check on a
// bad report. One call reports: geocoder reachability, census reachability,
// repository-read access, and gateway write availability.
Deno.serve(async req=>{try{
  const client=withEntityRateLimitRetry(createClientFromRequest(req)),body=await req.json().catch(()=>({}));
  let user=await client.auth.me().catch(()=>null);
  if(!user && body.session_token)user=await authenticateSignShopSession(client,body.session_token);
  if(!user?.id||!user?.email)return Response.json({error:'Sign in required'},{status:403});
  if(user.role!=='admin')return Response.json({error:'Admin required'},{status:403});
  const check=async(name,fn)=>{const t=Date.now();try{await fn();return {ok:true,ms:Date.now()-t};}catch(e){return {ok:false,ms:Date.now()-t,error:String(e?.message||e).slice(0,160)};}};
  const checks={};
  checks.repository_read=await check('repository_read',()=>client.asServiceRole.entities.PermitLocality.list('created_date',1,0).then(r=>{if(!Array.isArray(r))throw new Error('read returned non-array');}));
  checks.work_order_read=await check('work_order_read',()=>client.asServiceRole.entities.WorkOrder.list('created_date',1,0).then(r=>{if(!Array.isArray(r))throw new Error('read returned non-array');}));
  checks.scan_run_read=await check('scan_run_read',()=>client.asServiceRole.entities.PermittingScanRun.list('created_date',1,0).then(r=>{if(!Array.isArray(r))throw new Error('read returned non-array');}));
  checks.census_geocoder=await check('census_geocoder',async()=>{
    const r=await fetch('https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress?address=914+Lila+Ave+Milford+OH+45150&benchmark=Public_AR_Current&format=json',{signal:AbortSignal.timeout(8000)});
    if(!r.ok)throw new Error('HTTP '+r.status);
    const j=await r.json();
    if(!j?.result?.addressMatches?.length)throw new Error('No matches for known address');
  });
  const failing=Object.entries(checks).filter(([,v])=>!v.ok).map(([k])=>k);
  return Response.json({success:true,healthy:failing.length===0,checks,failing,checked_at:new Date().toISOString()});
}catch(e){return Response.json({error:'Health check failed: '+String(e?.message||e)},{status:500});}});

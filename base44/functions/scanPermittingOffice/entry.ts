import {createClientFromRequest} from 'npm:@base44/sdk@0.8.52';
import {createScanReporter,silentScanReporter} from '../../shared/permittingScanReporter.mjs';
import {scanOfficialPermittingPages} from '../../shared/permittingDiscoveryScan.mjs';
import {authenticateSignShopSession} from '../../shared/signShopSession.ts';
import {safeExternalFetch} from '../../shared/safeExternalFetch.ts';
import {readPermittingResourceResponse} from '../../shared/permittingResourceResponse.mjs';
Deno.serve(async req=>{let reporter:any=silentScanReporter;try{
 const client=createClientFromRequest(req),body=await req.json();let user=await client.auth.me().catch(()=>null);if(!user&&body.session_token)user=await authenticateSignShopSession(client,body.session_token);if(user?.role!=='admin')return Response.json({error:'Admin access required'},{status:403});
 if(typeof body.locality_id!=='string'||!body.locality_id||typeof body.office_id!=='string'||!body.office_id)return Response.json({error:'Select a saved locality and office.'},{status:400});const locality=await client.asServiceRole.entities.PermitLocality.get(body.locality_id);
 const matches=(locality?.offices || []).filter(office=>office.id===body.office_id);if(matches.length!==1 || !matches[0].contact_website)return Response.json({error:'Select a saved office with a website. Save office edits before rescanning.'},{status:400});
 const office=matches[0],url=office.contact_website;
 reporter=await createScanReporter({entity:client.asServiceRole.entities.PermittingScanRun,token:body.action_token,user,targetId:locality.id,targetName:office.name || locality.name,kind:'office',label:`Rescan ${office.name || 'office'} — ${locality.name}`});
 const result=await scanOfficialPermittingPages({seedUrl:url,maxPages:3,onProgress:(event:any)=>reporter.emit(event,event.progress || {}),fetchPage:async source=>{const response=await safeExternalFetch(source,{signal:AbortSignal.timeout(12000)},5,candidate=>candidate.hostname.toLowerCase().replace(/^www\./,'')===new URL(url).hostname.toLowerCase().replace(/^www\./,''));return {...await readPermittingResourceResponse(response),finalUrl:response.url || source};}});
 return Response.json({success:true,discovery_scan:result,scan_run:await reporter.finish(result.gaps.length?'completed_with_errors':'complete'),limitations:'Findings are saved in scan activity for review; office identity, roles and applicability were not changed.'});
}catch(error){const run=await reporter.finish('failed',String(error?.message || error));return Response.json({error:'Office rescan could not complete safely',scan_run:run},{status:500});}});

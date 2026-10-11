import {createClientFromRequest} from 'npm:@base44/sdk@0.8.52';
import {authenticateSignShopSession} from '../../shared/signShopSession.ts';
import {continueOwnedAddressDiscovery} from '../../shared/permittingAddressDiscoveryContinuation.mjs';
import {createScanReporter,silentScanReporter} from '../../shared/permittingScanReporter.mjs';
import {safeExternalFetch} from '../../shared/safeExternalFetch.ts';
import {readPermittingResourceResponse} from '../../shared/permittingResourceResponse.mjs';
Deno.serve(async req=>{
 let reporter:any=silentScanReporter;
 try{
  const client=createClientFromRequest(req),body=await req.json(),actor=await authenticateSignShopSession(client,body.session_token);
  if(typeof body.collection_id!=='string'||!body.collection_id||body.collection_id.length>100||Object.keys(body).some(key=>!['collection_id','session_token','action_token'].includes(key)))return Response.json({error:'Select your saved research collection.'},{status:400});
  const entity=client.asServiceRole.entities.PermittingAddressArchive,row=await entity.get(body.collection_id);
  if(!row||row.owner_id!==actor.id||row.owner_email!==String(actor.email).toLowerCase()||row.reference_only!==true||row.authority_established!==false)return Response.json({error:'This research collection is not available to your account.'},{status:403});
  if(body.action_token)reporter=await createScanReporter({entity:client.asServiceRole.entities.PermittingScanRun,token:body.action_token,user:actor,targetId:row.id,targetName:row.name,kind:'address_discovery',label:'Continue address website scan — '+row.name});
  const result=await continueOwnedAddressDiscovery({entity,scanEntity:client.asServiceRole.entities.PermittingScanRun,collectionId:row.id,actor,
   fetchPage:async(url:string,host:string,port:string)=>readPermittingResourceResponse(await safeExternalFetch(url,{method:'GET',signal:AbortSignal.timeout(15000),headers:{'User-Agent':'CCS-Permitting-Address/1.0'}},3,candidate=>candidate.protocol==='https:'&&candidate.hostname.toLowerCase().replace(/^www\./,'')===host&&candidate.port===port)),
   onProgress:(event:any)=>reporter.emit(event,event.progress || {})});
  return Response.json({...result,scan_run:await reporter.finish(result.success===false?'completed_with_errors':result.pages?.some(page=>page.status==='failed')?'completed_with_errors':'complete',result.error || '')});
 }catch(error){const conflict=error?.code==='JURISDICTION_PERSISTENCE_CONFLICT';const status=conflict?409:[400,401,403,409,503].includes(Number(error?.status))?Number(error.status):500;return Response.json({error:status===500?'Research page could not be saved safely. Check saved research before retrying.':error.message,scan_run:await reporter.finish('failed','Research page could not be saved safely.')},{status});}
});

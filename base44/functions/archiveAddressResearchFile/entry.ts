import {createClientFromRequest} from 'npm:@base44/sdk@0.8.52';
import {authenticateSignShopSession} from '../../shared/signShopSession.ts';
import {archiveOwnedAddressResearchFile,archiveOwnedAddressResearchReferral} from '../../shared/permittingAddressArchive.mjs';
import {createScanReporter,silentScanReporter} from '../../shared/permittingScanReporter.mjs';
import {safeExternalFetch} from '../../shared/safeExternalFetch.ts';
Deno.serve(async req=>{
 let reporter:any=silentScanReporter;
 try{
  const client=createClientFromRequest(req),body=await req.json(),actor=await authenticateSignShopSession(client,body.session_token);
  const referral=typeof body.referral_url==='string'&&typeof body.source_page_url==='string'&&body.referral_url.length>0&&body.referral_url.length<=2000&&body.source_page_url.length>0&&body.source_page_url.length<=2000;
  if(typeof body.collection_id!=='string'||!body.collection_id||body.collection_id.length>100||(!referral&&(typeof body.document_id!=='string'||!body.document_id||body.document_id.length>100))||(referral&&body.document_id!==undefined))return Response.json({error:'Select a saved research file.'},{status:400});
  const entity=client.asServiceRole.entities.PermittingAddressArchive,collection=await entity.get(body.collection_id);
  if(collection?.owner_id!==actor.id||collection.owner_email!==String(actor.email).toLowerCase()||collection.reference_only!==true||collection.authority_established!==false)return Response.json({error:'This research collection is not available to your account.'},{status:403});
  if(body.action_token)reporter=await createScanReporter({entity:client.asServiceRole.entities.PermittingScanRun,token:body.action_token,user:actor,targetId:collection.id,targetName:collection.name,kind:'address_archive',label:'Save original research file — '+collection.name});
  const options={entity,collectionId:body.collection_id,documentId:body.document_id,actor,
   fetchSource:(url:string,init:any,host:string|null)=>safeExternalFetch(url,init,3,host?(candidate:any)=>candidate.hostname.toLowerCase().replace(/^www\./,'')===host:undefined),
   uploadFile:(data:any)=>client.asServiceRole.integrations.Core.UploadFile(data),
   onProgress:(event:any)=>reporter.emit(event,event.progress || {})};
  const result=referral?await archiveOwnedAddressResearchReferral({...options,selection:{url:body.referral_url,source_page_url:body.source_page_url}}):await archiveOwnedAddressResearchFile(options);
  const {jurisdiction,...safe}=result;
  return Response.json({...safe,scan_run:await reporter.finish(result.success===false?'completed_with_errors':'complete',result.error || '')});
 }catch(error){const status=[400,401,403,409,503].includes(Number(error?.status))?Number(error.status):500;return Response.json({error:status===500?'Research file could not be saved safely.':error.message,scan_run:await reporter.finish('failed','Research file could not be saved safely.')},{status});}
});

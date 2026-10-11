import {createClientFromRequest} from 'npm:@base44/sdk@0.8.52';
import {authenticateSignShopSession} from '../../shared/signShopSession.ts';
import {loadAllEntityRows} from '../../shared/pagedEntityRows.ts';
import {linkAddressDocument} from '../../shared/permittingAddressDocumentLink.mjs';
import {createScanReporter,silentScanReporter,scanToken} from '../../shared/permittingScanReporter.mjs';
Deno.serve(async req=>{
 let reporter=silentScanReporter;
 try{
  const client=createClientFromRequest(req),body=await req.json(),actor=await authenticateSignShopSession(client,body.session_token);
  if(actor.role!=='admin')return Response.json({error:'Administrator review is required.'},{status:403});
  if(body.dry_run!==true&&!scanToken(body.action_token))return Response.json({error:'A tracked action is required for document linking.'},{status:400});
  if(body.dry_run!==true)reporter=await createScanReporter({entity:client.asServiceRole.entities.PermittingScanRun,token:body.action_token,user:actor,targetId:body.collection_id,kind:'address_document_link',label:'Link reviewed original'});
  const entities=client.asServiceRole.entities;
  const result=await linkAddressDocument({collections:entities.PermittingAddressArchive,scans:entities.PermittingScanRun,profiles:entities.JurisdictionProfile,loadProfiles:()=>loadAllEntityRows({entity:entities.JurisdictionProfile,label:'Document link jurisdiction identities'}),actor,body,onProgress:async(stage,processed)=>reporter.emit({kind:'document_link',detail:stage},{stage,processed,total:3,indeterminate:false})});
  return Response.json({...result,scan_run:await reporter.finish('complete')});
 }catch(error){const status=[400,401,403,409,503].includes(Number(error?.status))?Number(error.status):500;return Response.json({error:error.message,scan_run:await reporter.finish('failed',error.message)},{status});}
});

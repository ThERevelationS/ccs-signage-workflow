import {createClientFromRequest} from 'npm:@base44/sdk@0.8.52';
import { withEntityRateLimitRetry } from '../../shared/entityRateLimitRetry.ts';
import {invalidateSourceRules} from '../../shared/permittingSourceRuleInvalidation.mjs';
Deno.serve(async req=>{
 try{
  const base44=withEntityRateLimitRetry(createClientFromRequest(req)),user=await base44.auth.me().catch(()=>null);
  if(!user || user.role!=='admin')return Response.json({error:'Admin access required'},{status:403});
  const body=await req.json().catch(()=>({})),entities=base44.asServiceRole.entities;
  return Response.json(await invalidateSourceRules({sourceEntity:entities.PermittingSourceDocument,ruleEntity:entities.PermittingRule,
   segmentEntity:entities.PermittingSourceTextSegment,profileEntity:entities.JurisdictionProfile,settingsEntity:entities.GlobalSettings,
   sourceDocumentId:String(body.source_document_id || ''),newHash:body.new_hash,cursor:String(body.cursor || '')}));
 }catch(error){
  return Response.json({success:false,error:error?.message || 'Rule invalidation could not finish safely.',...error?.progress,llm_calls:0},{status:error?.status || 500});
 }
});

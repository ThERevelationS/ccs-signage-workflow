import {createClientFromRequest} from 'npm:@base44/sdk@0.8.52';
import {invalidateSourceRules} from '../../shared/permittingSourceRuleInvalidation.mjs';
import {reviewSourceAuthority} from '../../shared/permittingSourceAuthorityReview.mjs';
Deno.serve(async req=>{
 try{
  const base44=createClientFromRequest(req),user=await base44.auth.me().catch(()=>null);
  if(!user || user.role!=='admin')return Response.json({error:'Admin access required'},{status:403});
  const body=await req.json().catch(()=>({})),entities=base44.asServiceRole.entities;
  if(body.action==='get_request'){
   const id=String(body.request_id || '');
   if(!/^[a-zA-Z0-9_-]{16,100}$/.test(id))return Response.json({error:'A stable review request id is required.'},{status:400});
   const rows=await entities.PermittingSourceAuthorityReview.filter({request_key:'source-authority-review:'+id},'created_date',2,0);
   if(rows.length>1)return Response.json({error:'Review request identity is ambiguous.'},{status:409});
   const audit=rows[0];
   const source=audit?await entities.PermittingSourceDocument.get(audit.source_document_id):null;
   return Response.json({success:true,audit:audit || null,review:source?.authority_review || null,
    receipt:source?.authority_review_state || null,llm_calls:0});
  }
  const revalidate=()=>invalidateSourceRules({sourceEntity:entities.PermittingSourceDocument,ruleEntity:entities.PermittingRule,
   segmentEntity:entities.PermittingSourceTextSegment,profileEntity:entities.JurisdictionProfile,settingsEntity:entities.GlobalSettings,
   sourceDocumentId:String(body.source_document_id || ''),cursor:String(body.cursor || '')});
  if(body.action==='revalidate')return Response.json(await revalidate());
  const result=await reviewSourceAuthority({sourceEntity:entities.PermittingSourceDocument,profileEntity:entities.JurisdictionProfile,
   segmentEntity:entities.PermittingSourceTextSegment,settingsEntity:entities.GlobalSettings,auditEntity:entities.PermittingSourceAuthorityReview,
   sourceDocumentId:String(body.source_document_id || ''),input:body.review || {},action:body.action==='preview'?'verify':body.action,
   requestId:String(body.request_id || ''),expectedUpdatedDate:body.expected_updated_date,dryRun:body.action==='preview',actor:user.email});
  if(result.success && !result.dry_run){
   try{return Response.json({...result,revalidation:await revalidate()});}
   catch(error){return Response.json({...result,revalidation:{success:false,error:error?.message,...error?.progress,llm_calls:0}});}
  }
  return Response.json(result);
 }catch(error){
  return Response.json({success:false,error:error?.message || 'Source scope review could not complete safely.',llm_calls:0},{status:error?.status || 500});
 }
});

import {createClientFromRequest} from 'npm:@base44/sdk@0.8.52';
import {reviewOfficeAuthority,listOfficeAuthorityReviews,getOfficeAuthorityRequest} from '../../shared/permittingOfficeAuthority.mjs';
Deno.serve(async req=>{
 try{
  const base44=createClientFromRequest(req),user=await base44.auth.me().catch(()=>null);
  if(!user || !['admin','user'].includes(user.role))return Response.json({error:'Authenticated staff access required'},{status:403});
  const body=await req.json().catch(()=>({})),action=String(body.action || '');
  if(!['list','context','get_request','preview','preview_revoke','verify','revoke'].includes(action))
   return Response.json({error:'Unknown office authority action.'},{status:400});
  if(!['list','context','get_request'].includes(action) && user.role!=='admin')
   return Response.json({error:'Admin access required for relationship review'},{status:403});
  const entities=base44.asServiceRole.entities,deps={profileEntity:entities.JurisdictionProfile,sourceEntity:entities.PermittingSourceDocument,
   settingsEntity:entities.GlobalSettings,segmentEntity:entities.PermittingSourceTextSegment,reviewEntity:entities.PermittingOfficeAuthorityReview};
  if(action==='context'){
   const source=await entities.PermittingSourceDocument.get(String(body.source_document_id || ''));
   const profile=await entities.JurisdictionProfile.get(source.jurisdiction_id);
   const settings=await entities.GlobalSettings.filter({setting_key:'permitOfficeCatalog'},'id',2,0);
   const catalog=settings.length===1?settings[0].setting_value?.items:null;
   if(!Array.isArray(catalog))throw Object.assign(Error('Office catalog missing or ambiguous.'),{status:409});
   const publisher=source.authority_review?.publisher_name;
   const offices=catalog.filter(o=>publisher && (o.government_office?.name || o.name)===publisher).map(o=>({
    id:o.government_office_id || o.id,catalog_id:o.id,name:o.government_office?.name || o.name,
    verification_status:o.government_office?.verification_status || 'needs_verification'}));
   const skip=Number(body.cursor || 0);
   if(!Number.isSafeInteger(skip) || skip<0)throw Object.assign(Error('Invalid jurisdiction cursor.'),{status:400});
   const areas=source.authority_review?.named_areas || [];
   const targets=areas.length?await entities.JurisdictionProfile.filter({state:profile.state,name:{$in:areas}},'id',21,skip,['id','name','state','type']):[];
   return Response.json({success:true,source_review:source.authority_review || null,offices,
    targets:[{id:profile.id,name:profile.name,state:profile.state,type:profile.type},...targets.slice(0,20).filter(p=>p.id!==profile.id)],
    has_more:targets.length>20,next_cursor:targets.length>20?String(skip+20):null,llm_calls:0});
  }
  const jurisdictionId=String(body.jurisdiction_id || '');
  if(!jurisdictionId)return Response.json({error:'Select a canonical jurisdiction.'},{status:400});
  if(action==='list')return Response.json(await listOfficeAuthorityReviews(deps,{jurisdictionId,cursor:body.cursor}));
  if(action==='get_request')return Response.json(await getOfficeAuthorityRequest(deps,{jurisdictionId,requestId:String(body.request_id || '')}));
  const result=await reviewOfficeAuthority(deps,{jurisdictionId,input:body.review || {},action:action==='preview'?'verify':action==='preview_revoke'?'revoke':action,
   dryRun:['preview','preview_revoke'].includes(action),requestId:String(body.request_id || ''),expectedUpdatedDate:body.expected_updated_date,actor:user.email});
  return Response.json(result);
 }catch(error){return Response.json({success:false,error:error.message || 'Office authority review could not complete safely.',llm_calls:0},{status:error.status || error.response?.status || 500});}
});
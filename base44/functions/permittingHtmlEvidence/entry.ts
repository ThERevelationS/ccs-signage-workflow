import {createClientFromRequest} from 'npm:@base44/sdk@0.8.52';
import {retainHtmlEvidence,getHtmlEvidenceRequest,fetchHtmlSnapshot,readHtmlEvidence,htmlEvidenceSummary,validateHtmlEvidence} from '../../shared/permittingHtmlEvidence.mjs';
Deno.serve(async req=>{
 try{
  const base44=createClientFromRequest(req),user=await base44.auth.me().catch(()=>null);
  if(!user || !['admin','user'].includes(user.role))return Response.json({error:'Authenticated staff access required'},{status:403});
  const body=await req.json().catch(()=>({})),action=String(body.action || '');
  if(!['context','list','read','cite','raw','preview','capture','get_request'].includes(action))
   return Response.json({error:'Unknown HTML evidence action.'},{status:400});
  if(['preview','capture','get_request'].includes(action) && user.role!=='admin')
   return Response.json({error:'Admin access required for manual HTML capture'},{status:403});
  // Read operations respect caller RLS; service role is used only for authenticated admin capture/receipts.
  const entities=['preview','capture','get_request'].includes(action)?base44.asServiceRole.entities:base44.entities;
  if(action==='context'){
   const name=String(body.jurisdiction_name || '').trim();
   if(!name || name.length>200)return Response.json({error:'Select a jurisdiction name.'},{status:400});
   const profiles=await entities.JurisdictionProfile.filter({name,state:{$in:['OH','KY']}},'id',21,0);
   return Response.json({success:true,profiles:profiles.slice(0,20).map(p=>({id:p.id,name:p.name,state:p.state,type:p.type,
    permitting_url:p.permitting_url,website_url:p.website_url,updated_date:p.updated_date})),has_more:profiles.length>20,llm_calls:0});
  }
  const deps={profileEntity:entities.JurisdictionProfile,htmlEntity:entities.PermittingHtmlEvidence};
  if(['read','cite','raw'].includes(action)){
   const row=await entities.PermittingHtmlEvidence.get(String(body.html_evidence_id || ''));
   if(action==='raw'){
    await validateHtmlEvidence(row);
    return Response.json({success:true,evidence:htmlEvidenceSummary(row),raw_html_base64:row.raw_html_base64,llm_calls:0});
   }
   return Response.json(await readHtmlEvidence(row,{startBlock:body.start_block ?? 1,blockCount:body.block_count ?? 5,
    ...(action==='cite'?{block:body.block,excerpt:body.excerpt}:{})}));
  }
  const jurisdictionId=String(body.jurisdiction_id || '');
  if(!jurisdictionId)return Response.json({error:'Select a canonical jurisdiction profile.'},{status:400});
  if(action==='get_request')return Response.json(await getHtmlEvidenceRequest(deps,{jurisdictionId,requestId:String(body.request_id || ''),actor:user.email}));
  const profile=await entities.JurisdictionProfile.get(jurisdictionId);
  if(profile.id!==jurisdictionId || !['OH','KY'].includes(profile.state))return Response.json({error:'Canonical Ohio/Kentucky profile required.'},{status:400});
  if(action==='list'){
   const cursor=String(body.cursor || '');
   if(cursor && !/^[a-zA-Z0-9_-]{1,100}$/.test(cursor))return Response.json({error:'Invalid HTML evidence cursor.'},{status:400});
   const rows=await entities.PermittingHtmlEvidence.filter({jurisdiction_id:jurisdictionId,...(cursor?{id:{$gt:cursor}}:{})},'id',6,0);
   return Response.json({success:true,items:rows.slice(0,5).map(htmlEvidenceSummary),has_more:rows.length>5,next_cursor:rows.length>5?rows[4].id:null,llm_calls:0});
  }
  if(action==='preview'){
   const snapshot=await fetchHtmlSnapshot({profile,officialUrl:String(body.official_url || '')});
   return Response.json({success:true,expected_updated_date:profile.updated_date,text_sha256:snapshot.text_sha256,
    file_hash_sha256:snapshot.file_hash_sha256,file_bytes:snapshot.file_bytes,official_url:snapshot.official_url,final_url:snapshot.final_url,
    blocks:snapshot.blocks,total_blocks:snapshot.blocks.length,limitations:snapshot.limitations,llm_calls:0});
  }
  return Response.json(await retainHtmlEvidence(deps,{jurisdictionId,officialUrl:String(body.official_url || ''),title:body.title,
   requestId:String(body.request_id || ''),expectedUpdatedDate:body.expected_updated_date,expectedTextSha256:body.expected_text_sha256,
   officialSourceConfirmed:body.official_source_confirmed,actor:user.email}));
 }catch(error){return Response.json({success:false,error:error?.message || 'HTML evidence could not complete safely.',llm_calls:0},{status:error?.status || 500});}
});
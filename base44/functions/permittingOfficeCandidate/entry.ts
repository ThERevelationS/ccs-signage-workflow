import {createClientFromRequest} from 'npm:@base44/sdk@0.8.52';
import {registerOfficeCandidate,getOfficeCandidate} from '../../shared/permittingOfficeCandidate.mjs';
Deno.serve(async req=>{
 try{
  const client=createClientFromRequest(req),user=await client.auth.me().catch(()=>null);
  if(user?.role!=='admin')return Response.json({error:'Admin access required for office candidate registration.'},{status:403});
  const body=await req.json().catch(()=>({}));
  if(!['preview','register','get_request'].includes(body.action))return Response.json({error:'Unknown office candidate action.'},{status:400});
  const entities=client.asServiceRole.entities,deps={sourceEntity:entities.PermittingSourceDocument,
   segmentEntity:entities.PermittingSourceTextSegment,profileEntity:entities.JurisdictionProfile,settingsEntity:entities.GlobalSettings};
  const result=body.action==='get_request'
   ?await getOfficeCandidate(deps,{officeId:String(body.office_id || ''),registrationKey:String(body.registration_key || '')})
   :await registerOfficeCandidate(deps,{input:body.candidate || {},dryRun:body.action==='preview',
    expectedCatalogVersion:body.expected_catalog_updated_date,expectedEvidenceDigest:body.expected_evidence_digest,actor:user.email});
  return Response.json(result);
 }catch(error){return Response.json({success:false,error:error.message || 'Office candidate registration could not complete safely.',llm_calls:0},
  {status:error.status || error.response?.status || 500});}
});

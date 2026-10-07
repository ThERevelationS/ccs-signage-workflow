import {buildIdentityTypeCorrection,applyIdentityTypeCorrection} from './jurisdictionIdentityCorrection.mjs';
import {ohioTypeCorrectionProposals} from './ohioIdentityTypeCorrectionProposals.mjs';
export async function handleIdentityCorrection(req,client) {
 try {
  if(req.method!=='POST')return Response.json({error:'POST required'},{status:405});
  const user=await client.auth.me().catch(()=>null);
  if(!user)return Response.json({error:'Authentication required'},{status:401});
  if(user.role!=='admin' || !user.email)return Response.json({error:'Admin access required'},{status:403});
  const body=await req.json(),id=body?.jurisdiction_id;
  const proposal=Object.hasOwn(ohioTypeCorrectionProposals,id || '')?ohioTypeCorrectionProposals[id]:null;
  if(!proposal)return Response.json({error:'No retained correction proposal for this profile.'},{status:400});
  if(!['preview','apply'].includes(body.action))return Response.json({error:'Explicit preview or apply action required.'},{status:400});
  const entity=client.asServiceRole.entities.JurisdictionProfile,profile=await entity.get(id);
  if(profile?.id!==id || profile.name!==proposal.name || profile.state!=='OH' || profile.type!==proposal.old_type ||
     profile.parent_county_name!==proposal.parent_county_name || profile.website_url!==proposal.website_url || profile.permitting_url!==proposal.permitting_url)
   return Response.json({error:'Profile differs from retained proposal. Reconcile identity before correction.'},{status:409});
  const input={profile,expected:body.expected,newType:proposal.new_type,evidence:proposal.evidence,
   actor:user.email,requestId:body.request_id,timestamp:new Date().toISOString()};
  const patch=buildIdentityTypeCorrection(input);
  if(body.action==='preview')return Response.json({success:true,preview:true,expected_updated_date:profile.updated_date,patch});
  const saved=await applyIdentityTypeCorrection({entity,...input});
  return Response.json({success:true,jurisdiction:saved,authority_verified:false});
 }catch(error){
  return Response.json({error:error?.message || 'Identity correction could not be verified. Reload before retrying.'},{status:409});
 }
}

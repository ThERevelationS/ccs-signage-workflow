import {addressResearchCollection} from '../../shared/permittingAddressDiscoveryContinuation.mjs';
import { withEntityRateLimitRetry } from '../../shared/entityRateLimitRetry.ts';
import {createClientFromRequest} from 'npm:@base44/sdk@0.8.52';
import {authenticateSignShopSession} from '../../shared/signShopSession.ts';
Deno.serve(async req=>{
 try{
  const client=withEntityRateLimitRetry(createClientFromRequest(req)),body=await req.json(),actor=await authenticateSignShopSession(client,body.session_token);
  const review=body.review===true;
  if(review&&actor.role!=='admin')return Response.json({error:'Administrator access is required to review employee research.'},{status:403});
  const inScope=row=>Boolean(row&&row.reference_only===true&&row.authority_established===false&&(review||(row.owner_id===actor.id&&row.owner_email===String(actor.email).toLowerCase())));
  const entity=client.asServiceRole.entities.PermittingAddressArchive,collections=[],actions=[];
  let ids=body.collection_ids,nextCursor=null;
  if(body.browse===true){
   if(body.collection_ids!==undefined||(body.cursor!==undefined&&(typeof body.cursor!=='string'||!body.cursor||body.cursor.length>100)))return Response.json({error:'Invalid saved research page.'},{status:400});
   const query={...(review?{}:{owner_id:actor.id,owner_email:String(actor.email).toLowerCase()}),reference_only:true,authority_established:false,...(body.cursor?{id:{$lt:body.cursor}}:{})};
   const rows=await entity.filter(query,'-id',11);
   if(rows.some(row=>!inScope(row)))return Response.json({error:'Saved research could not be listed safely.'},{status:403});
   ids=rows.slice(0,10).map(row=>row.id);
   nextCursor=rows.length>10?ids[ids.length-1]:null;
   if(!ids.length)return Response.json({collections:[],actions:[],next_cursor:null});
  }
  if(!Array.isArray(ids)||!ids.length||ids.length>10||new Set(ids).size!==ids.length||ids.some(id=>typeof id!=='string'||!id||id.length>100))return Response.json({error:'Select up to ten saved research collections.'},{status:400});
  for(const id of ids){
   const row=await entity.get(id);
   if(!inScope(row))return Response.json({error:'This research collection is not available to your account.'},{status:403});
   collections.push({...addressResearchCollection(row),...(review?{owner_email:row.owner_email,location_verified:row.location_verified===true,source_url:row.permitting_url,created_date:row.created_date}:{})});
   const runs=await client.asServiceRole.entities.PermittingScanRun.filter({target_id:id,owner_id:row.owner_id,owner_email:row.owner_email,action_kind:{$in:['address_archive','address_discovery']}},'-created_date',10);
   actions.push(...runs.filter(run=>run.owner_id===row.owner_id&&run.owner_email===row.owner_email&&run.target_id===id&&['address_archive','address_discovery'].includes(run.action_kind)));
  }
  return Response.json({collections,actions,next_cursor:nextCursor,review_mode:review});
 }catch(error){const status=[400,401,403,409,503].includes(Number(error?.status))?Number(error.status):500;return Response.json({error:status===500?'Saved research files could not be checked safely.':error.message},{status});}
});

import {createClientFromRequest} from 'npm:@base44/sdk@0.8.52';
import {authenticateSignShopSession} from '../../shared/signShopSession.ts';
Deno.serve(async req=>{
 try{
  const client=createClientFromRequest(req),body=await req.json(),actor=await authenticateSignShopSession(client,body.session_token);
  const entity=client.asServiceRole.entities.PermittingAddressArchive,collections=[],actions=[];
  let ids=body.collection_ids,nextCursor=null;
  if(body.browse===true){
   if(body.collection_ids!==undefined||(body.cursor!==undefined&&(typeof body.cursor!=='string'||!body.cursor||body.cursor.length>100)))return Response.json({error:'Invalid saved research page.'},{status:400});
   const query={owner_id:actor.id,owner_email:String(actor.email).toLowerCase(),reference_only:true,authority_established:false,...(body.cursor?{id:{$lt:body.cursor}}:{})};
   const rows=await entity.filter(query,'-id',11);
   if(rows.some(row=>row.owner_id!==actor.id||row.owner_email!==String(actor.email).toLowerCase()||row.reference_only!==true||row.authority_established!==false))return Response.json({error:'Saved research could not be listed safely.'},{status:403});
   ids=rows.slice(0,10).map(row=>row.id);
   nextCursor=rows.length>10?ids[ids.length-1]:null;
   if(!ids.length)return Response.json({collections:[],actions:[],next_cursor:null});
  }
  if(!Array.isArray(ids)||!ids.length||ids.length>10||new Set(ids).size!==ids.length||ids.some(id=>typeof id!=='string'||!id||id.length>100))return Response.json({error:'Select up to ten saved research collections.'},{status:400});
  for(const id of ids){
   const row=await entity.get(id);
   if(row?.owner_id!==actor.id||row.owner_email!==String(actor.email).toLowerCase()||row.reference_only!==true||row.authority_established!==false)return Response.json({error:'This research collection is not available to your account.'},{status:403});
   collections.push({id:row.id,target:row.location_target,name:row.name,documents:row.documents || [],auto_refresh:row.auto_refresh,reference_only:true,authority_established:false});
   const runs=await client.asServiceRole.entities.PermittingScanRun.filter({target_id:id,owner_id:actor.id,owner_email:String(actor.email).toLowerCase(),action_kind:'address_archive'},'-created_date',10);
   actions.push(...runs.filter(run=>run.owner_id===actor.id&&run.owner_email===String(actor.email).toLowerCase()&&run.target_id===id&&run.action_kind==='address_archive'));
  }
  return Response.json({collections,actions,next_cursor:nextCursor});
 }catch(error){const status=[400,401,403,409,503].includes(Number(error?.status))?Number(error.status):500;return Response.json({error:status===500?'Saved research files could not be checked safely.':error.message},{status});}
});

import {PERMITTING_RESEARCH_STATE_KEY} from './permittingResearchDispatchConfig.mjs';
const LEASE_MS=5*60_000;
export async function claimPermittingCollectionCycle({entity,record,now=new Date(),intervalMinutes=15,token=crypto.randomUUID()}){
 if(!record?.id || !record.updated_date)return {claimed:false,reason:'collection_state_not_initialized'};
 const prior=record.setting_value?.collection_cycle || {},time=now.getTime();
 if(Date.parse(prior.lease_expires_at || '')>time)return {claimed:false,reason:'collection_cycle_active'};
 if(time-Date.parse(prior.started_at || '')<intervalMinutes*60_000)return {claimed:false,reason:'collection_interval'};
 const cycle={token,status:'running',started_at:now.toISOString(),lease_expires_at:new Date(time+LEASE_MS).toISOString()};
 const patch={...record.setting_value,collection_cycle:cycle};
 let result;try{result=await entity.updateMany({id:record.id,updated_date:record.updated_date,setting_key:PERMITTING_RESEARCH_STATE_KEY},{$set:{setting_value:patch}});}catch(error){
  const recovered=await entity.get(record.id).catch(()=>null);
  if(recovered?.setting_value?.collection_cycle?.token!==token)throw error;
  return {claimed:true,token,record:recovered};
 }
 if(result?.updated!==1)return {claimed:false,reason:'collection_claim_conflict'};
 const saved=await entity.get(record.id);
 if(saved?.setting_value?.collection_cycle?.token!==token)throw Error('Collection claim could not be verified.');
 return {claimed:true,token,record:saved};
}
function summary(result){
 if(!result)return {status:'not_run'};
 return {success:result.success!==false,status:String(result.status || result.reason || (result.skipped?'skipped':'complete')).slice(0,100),
  archived:Number(result.archived)||0,attempted_pages:Number(result.attempted_pages)||0,
  ...(result.error?{error:String(result.error).slice(0,300)}:{})};
}
export async function finishPermittingCollectionCycle({entity,recordId,token,results,now=new Date()}){
 const current=await entity.get(recordId),prior=current?.setting_value?.collection_cycle;
 if(!current?.updated_date || prior?.token!==token)throw Error('Collection cycle ownership changed; receipt was not overwritten.');
 const stages=Object.fromEntries(Object.entries(results).map(([name,result])=>[name,summary(result)]));
 const cycle={...prior,status:Object.values(stages).some(s=>s.success===false)?'completed_with_errors':'complete',completed_at:now.toISOString(),lease_expires_at:'',stages};
 const next={...current.setting_value,collection_cycle:cycle};
 const result=await entity.updateMany({id:current.id,updated_date:current.updated_date,setting_key:PERMITTING_RESEARCH_STATE_KEY},{$set:{setting_value:next}});
 if(result?.updated!==1)throw Error('Collection receipt changed concurrently.');
 return await entity.get(current.id);
}

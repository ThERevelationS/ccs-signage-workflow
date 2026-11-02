export const scanToken=value=>typeof value==='string'&&/^[a-f0-9-]{36}$/i.test(value);
export const silentScanReporter={emit:async()=>{},finish:async()=>null,id:null};
export async function createScanReporter({entity,token,user,targetId,targetName,kind,label}){
 if(!token)return silentScanReporter;
 if(!scanToken(token)||!user?.id||!user?.email)throw Object.assign(Error('Invalid scan activity identity.'),{status:400});
 const existing=await entity.filter({action_token:token},'created_date',2);
 if(existing.length)throw Object.assign(Error('This scan action already exists. Check its saved activity instead of starting it again.'),{status:409});
 const stamp=new Date().toISOString();
 const row=await entity.create({action_token:token,owner_id:user.id,owner_email:String(user.email || '').toLowerCase(),target_id:targetId,target_name:targetName,action_kind:kind,label,status:'running',stage:'Starting',processed:0,total:0,indeterminate:true,started_at:stamp,last_event_at:stamp,events:[],omitted_events:0});
 return attachScanReporter(entity,row.id);
}
export function attachScanReporter(entity,id){
 // Batched writer: emit() buffers events locally and flushes to the row at most
 // every ~4s (or when 8+ events queue up / finish() forces it). Each flush is a
 // single entity.update against a locally-held snapshot — this reporter is the
 // row's only writer (action_token-unique), so per-event get+update round-trips
 // are pure waste. Cuts telemetry entity ops ~85% under bulk scans, which is
 // what keeps the shared entity budget (and the lookup itself) alive.
 let snapshot=null,trackingError='';
 let pending=[],patchQueue={},flushing=null,timer=null;
 const normalizeItem=(event)=>{const item={at:new Date().toISOString(),...event};
  if(item.resources){item.omitted_resources=Math.max(0,item.resources.length-100);item.resources=item.resources.slice(0,100).map(r=>({url:r.url,title:r.title,kind:r.referral_kind || r.doc_type}));}
  if(item.detail)item.detail=String(item.detail).slice(0,24000);return item;};
 async function flush(){
  if(!pending.length&&!Object.keys(patchQueue).length)return;
  if(flushing)return flushing;
  flushing=(async()=>{try{
   trackingError='';
   if(!snapshot)snapshot=await entity.get(id).catch(()=>null)||{events:[],omitted_events:0};
   const items=pending.splice(0);const patch=patchQueue;patchQueue={};
   const events=[...(snapshot.events||[]),...items],overflow=Math.max(0,events.length-200);
   snapshot={...snapshot,...patch,events:events.slice(-200),omitted_events:(snapshot.omitted_events||0)+overflow,last_event_at:(items.at(-1)||{}).at||new Date().toISOString()};
   await entity.update(id,{...patch,events:snapshot.events,omitted_events:snapshot.omitted_events,last_event_at:snapshot.last_event_at});
  }catch(error){trackingError=String(error.message||error);}finally{flushing=null;
   if(pending.length||Object.keys(patchQueue).length)schedule();}})();
  return flushing;
 }
 function schedule(){if(timer)return;timer=setTimeout(()=>{timer=null;flush();},4000);}
 function emit(event,patch={}){
  pending.push(normalizeItem(event));Object.assign(patchQueue,patch);
  if(pending.length>=8)flush();else schedule();
  return Promise.resolve();
 }
 async function finish(status='complete',error=''){
  const current=await entity.get(id).catch(()=>null);const completion=status==='complete'&&current?.total>0?{processed:current.total}:{};
  // Finish is terminal bookkeeping — a swallowed 429/5xx would leave the run
  // stuck 'running' forever even though the answer was already returned.
  // The buffered emit is flushed explicitly each attempt (queued events would
  // otherwise sit unwritten behind the 4s timer).
  for(let attempt=0;attempt<4;attempt++){
   emit({kind:'finished',detail:error || status},{...completion,status,stage:status,indeterminate:false,finished_at:new Date().toISOString(),error:String(error).slice(0,1000)});
   await flush();
   if(!trackingError)break;
   await new Promise(r=>setTimeout(r,1200*(attempt+1)));
  }
  return snapshot?{...snapshot,tracking_error:trackingError || null}:null;
 }
 return {id,emit,finish};
}

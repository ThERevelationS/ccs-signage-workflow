export const scanToken=value=>typeof value==='string'&&/^[a-f0-9-]{36}$/i.test(value);
export const silentScanReporter={emit:async()=>{},finish:async()=>null,id:null};
export async function createScanReporter({entity,token,user,targetId,targetName,kind,label}){
 if(!token)return silentScanReporter;
 if(!scanToken(token)||!user?.id)throw Object.assign(Error('Invalid scan activity identity.'),{status:400});
 const existing=await entity.filter({action_token:token},'created_date',2);
 if(existing.length)throw Object.assign(Error('This scan action already exists. Check its saved activity instead of starting it again.'),{status:409});
 const stamp=new Date().toISOString();
 const row=await entity.create({action_token:token,owner_id:user.id,owner_email:String(user.email || '').toLowerCase(),target_id:targetId,target_name:targetName,action_kind:kind,label,status:'running',stage:'Starting',processed:0,total:0,indeterminate:true,started_at:stamp,last_event_at:stamp,events:[],omitted_events:0});
 return attachScanReporter(entity,row.id);
}
export function attachScanReporter(entity,id){
 let snapshot=null,trackingError='';
 async function emit(event,patch={}){
  try{
   const current=await entity.get(id);if(current.status!=='running')return;
   const item={at:new Date().toISOString(),...event};
   if(item.resources)item.resources=item.resources.slice(0,100).map(r=>({url:r.url,title:r.title,kind:r.referral_kind || r.doc_type}));
   if(item.detail)item.detail=String(item.detail).slice(0,24000);
   const events=[...(current.events || []),item],overflow=Math.max(0,events.length-200);
   snapshot={...current,...patch,events:events.slice(-200),omitted_events:(current.omitted_events || 0)+overflow,last_event_at:item.at};
   await entity.update(id,{...patch,events:snapshot.events,omitted_events:snapshot.omitted_events,last_event_at:item.at});
  }catch(error){trackingError=String(error.message || error);}
 }
 async function finish(status='complete',error=''){
  await emit({kind:'finished',detail:error || status},{status,stage:status,indeterminate:false,finished_at:new Date().toISOString(),error:String(error).slice(0,1000)});
  return snapshot?{...snapshot,tracking_error:trackingError || null}:null;
 }
 return {id,emit,finish};
}

export const verifiedOriginal=doc=>doc?.archive_state?.status==='complete'&&Boolean(doc.file_url)&&/^[a-f0-9]{64}$/.test(doc.source_sha256 || '')&&doc.source_sha256===doc.stored_sha256&&Number.isInteger(doc.source_bytes)&&doc.source_bytes>0&&doc.source_bytes===doc.stored_bytes;

export function remainingOriginals(collection,now=Date.now()){
 const docs=collection.documents || [],seen=new Set();
 const files=docs.filter(doc=>{
  if(!doc.id||!doc.url||verifiedOriginal(doc)||doc.file_url||doc.source_sha256||doc.pinned||doc.archive_pinned||doc.source==='manual')return false;
  const state=doc.archive_state || {};
  if(['complete','uploading','upload_uncertain'].includes(state.status)||Date.parse(state.lease_expires_at || '')>now)return false;
  if(docs.filter(other=>other.id===doc.id||other.url===doc.url).length!==1)return false;
  seen.add(doc.url);return true;
 });
 for(const ref of collection.external_referrals || []){
  if(!ref.url||!ref.source_page_url||seen.has(ref.url)||docs.some(doc=>doc.url===ref.url))continue;
  seen.add(ref.url);files.push({...ref,id:'referral:'+ref.url,referral:true});
 }
 return files;
}

// A finite snapshot: each file gets one manual action, with no retry loop or overall cap.
export async function saveOriginalBatch({files,save,stopped,onProgress}){
 const result={total:files.length,checked:0,saved:0,needsReview:0,stopped:false};
 for(const file of files){
  if(stopped()){result.stopped=true;break;}
  onProgress({...result,current:file.title || file.url});
  const verified=await save(file); // Request errors halt the batch; no blind retry after lost acknowledgement.
  result.checked++;if(verified)result.saved++;else result.needsReview++;
  onProgress({...result,current:''});
 }
 result.stopped=stopped()&&result.checked<result.total;
 return result;
}

export function originalFileStatus(doc,now=Date.now()){
 if(verifiedOriginal(doc))return {kind:'saved',label:'Saved original — source and stored bytes verified.'};
 const state=doc.archive_state || {},active=Date.parse(state.lease_expires_at || '')>now;
 if(state.status==='upload_uncertain')return {kind:'review',label:'Upload outcome needs review; automatic re-upload blocked.'};
 if(active)return {kind:'active',label:state.status==='uploading'?'Saving file to storage.':state.file_url?'Checking saved file bytes.':'Downloading original file.'};
 if(state.status==='uploading')return {kind:'review',label:'Upload did not confirm; review is needed before another upload.'};
 if(state.status==='complete'||doc.file_url||doc.source_sha256)return {kind:'review',label:'Saved-file evidence is incomplete or inconsistent; review is needed.'};
 if(state.file_url)return {kind:'verify',label:'File uploaded; verification still needed.',retryAfter:validFuture(state.retry_after,now)};
 if(state.status==='blocked'||Number(state.attempts || 0)>=3)return {kind:'review',label:'Automatic download stopped after a problem; review the error before retrying.'};
 return {kind:'waiting',label:state.status==='downloading'?'Previous download stopped; original still needs downloading.':'Original still needs downloading.',retryAfter:validFuture(state.retry_after,now)};
}
function validFuture(value,now){return Date.parse(value || '')>now?new Date(value).toISOString():null;}
export function originalCollectionCounts(collection,now=Date.now()){
 const counts={saved:0,waiting:0,active:0,verify:0,review:0};
 for(const doc of collection.documents || [])counts[originalFileStatus(doc,now).kind]++;
 const seen=new Set((collection.documents || []).map(doc=>doc.url));
 for(const ref of collection.external_referrals || [])if(!seen.has(ref.url)){seen.add(ref.url);counts.waiting++;}
 return {...counts,total:Object.values(counts).reduce((a,b)=>a+b,0)};
}

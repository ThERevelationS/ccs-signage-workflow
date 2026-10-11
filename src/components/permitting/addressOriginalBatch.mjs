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

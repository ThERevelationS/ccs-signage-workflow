import {textSha256} from './jurisdictionSourcePdfText.mjs';
import {evidenceDigest,evidenceEqual,evidenceError} from './permittingRuleEvidence.mjs';
import {replaceJurisdictionFieldsIfUnchanged} from './jurisdictionPersistence.mjs';

export const HTML_EVIDENCE_METHOD='official-html-static-text-v1';
export const HTML_MAX_BYTES=512_000;
export const HTML_MAX_TEXT=80_000;
const profileIdentity=p=>Object.fromEntries(['id','name','state','type','website_url','permitting_url'].map(k=>[k,p[k] ?? null]));
const requestKey=(id,key)=>'html-evidence:'+id+':'+key;
const validRequest=id=>/^[a-zA-Z0-9_-]{16,100}$/.test(id || '');
const hashPattern=/^[a-f0-9]{64}$/;
const clean=(v,max)=>{if(typeof v!=='string' || !v.trim() || v.length>max)throw evidenceError('A bounded evidence field is required.',400);return v.trim();};
function publicUrl(value){
 try{
  const u=new URL(value);
  if(u.protocol!=='https:' || u.username || u.password || u.port && u.port!=='443' ||
   /[\u0000-\u001f\u007f]/.test(value) || !/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/i.test(u.hostname) ||
   !u.hostname.includes('.') || /^\d+(?:\.\d+)*$/.test(u.hostname) ||
   /(?:^|\.)(?:localhost|local|internal|test|invalid)$/.test(u.hostname))return null;
  u.hash='';return u;
 }catch{return null;}
}
export function authorizedHtmlUrl(profile,value){
 const url=publicUrl(clean(value,2000)),hosts=[profile.website_url,profile.permitting_url].map(publicUrl).filter(Boolean).map(u=>u.hostname.replace(/^www\./,''));
 if(!url || !hosts.includes(url.hostname.replace(/^www\./,'')))throw evidenceError('Use an HTTPS page on the canonical profile\'s official website or permitting host. Redirects to another host require separate review.',400);
 return url.href;
}
const encode64=bytes=>{let s='';for(let i=0;i<bytes.length;i+=8192)s+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(s);};
function decode64(value){
 if(typeof value!=='string' || value.length>Math.ceil(HTML_MAX_BYTES/3)*4 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value))throw evidenceError('Retained HTML bytes require review.');
 const binary=atob(value),bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));
 if(!bytes.length || bytes.length>HTML_MAX_BYTES)throw evidenceError('Retained HTML byte bounds require review.');
 return bytes;
}
const entities={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' ',ndash:'–',mdash:'—',lsquo:'‘',rsquo:'’',ldquo:'“',rdquo:'”',bull:'•',hellip:'…',copy:'©',reg:'®'};
function decodeText(text){
 return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]+);/gi,(all,key)=>{
  if(key[0]!=='#')return entities[key] ?? all;
  const n=key[1].toLowerCase()==='x'?parseInt(key.slice(2),16):parseInt(key.slice(1),10);
  return n>0 && n<=0x10ffff && !(n>=0xd800 && n<=0xdfff)?String.fromCodePoint(n):all;
 });
}
// Conservative static-text projection, never an HTML renderer or an adopted-code parser.
// Original response bytes remain intact. External CSS, JavaScript and linked files are not evaluated.
export function projectHtmlText(html){
 if(typeof html!=='string' || !/<(?:html|body)\b/i.test(html))throw evidenceError('The response is not a recognizable HTML document.',400);
 const tokens=html.replace(/<!--[\s\S]*?-->/g,'').match(/<(?:"[^"]*"|'[^']*'|[^'">])*?>|[^<]+|</g) || [];
 const stack=[],parts=[],excluded=new Set(['head','script','style','template','noscript','svg','math','nav','header','footer']);
 const breaks=new Set(['p','div','li','h1','h2','h3','h4','h5','h6','br','hr','tr','td','th','section','article','address','dt','dd']);
 const voids=new Set(['area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr']);
 for(const token of tokens){
  if(token.startsWith('<')){
   const match=token.match(/^<\s*(\/?)\s*([a-z][a-z0-9:-]*)\b/i);
   if(!match)continue;
   const closing=Boolean(match[1]),tag=match[2].toLowerCase(),suppressed=stack.some(s=>s.skip);
   if(closing){
    const i=stack.map(s=>s.tag).lastIndexOf(tag);
    if(i>=0)stack.splice(i);
    if(breaks.has(tag) && !stack.some(s=>s.skip))parts.push('\n');
   }else{
    if(breaks.has(tag) && !suppressed)parts.push('\n');
    const hidden=/\s(?:hidden(?:\s|=|\/?>)|aria-hidden\s*=\s*["']?true\b)/i.test(token) ||
     /style\s*=\s*["'][^"']*(?:display\s*:\s*none|visibility\s*:\s*hidden)/i.test(token);
    if(!voids.has(tag) && !/\/\s*>$/.test(token))stack.push({tag,skip:suppressed || excluded.has(tag) || hidden});
   }
  }else if(!stack.some(s=>s.skip))parts.push(decodeText(token).replace(/\s+/g,' '));
 }
 const lines=parts.join('').split('\n').map(s=>s.replace(/[\t \u00a0]+/g,' ').trim()).filter(Boolean);
 const text=lines.join('\n');
 if(!text || text.length>HTML_MAX_TEXT || lines.length>1000 || lines.some(s=>s.length>12_000))
  throw evidenceError('Static page text is empty or exceeds its bounded evidence projection. Original evidence must be retained by another route.',400);
 return {text,blocks:lines.map((text,i)=>({block:i+1,text})),limitations:['Static response text only; external CSS, scripts and linked content are not evaluated.','Navigation, headers, footers and explicit hidden/script content are excluded.','Retained text is unreviewed and does not establish office responsibility, coverage or adopted law.']};
}
export async function fetchHtmlSnapshot({profile,officialUrl,fetchImpl=fetch,now=()=>Date.now()}){
 const original=authorizedHtmlUrl(profile,officialUrl),controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12_000);
 try{
  let url=original,response;
  for(let hop=0;hop<4;hop++){
   response=await fetchImpl(url,{signal:controller.signal,redirect:'manual',headers:{Accept:'text/html, application/xhtml+xml'}});
   if([301,302,303,307,308].includes(response.status)){
    const location=response.headers.get('location');if(!location || hop===3)throw evidenceError('Official page redirect chain requires review.',400);
    url=authorizedHtmlUrl(profile,new URL(location,url).href);continue;
   }
   break;
  }
  if(!response?.ok)throw evidenceError('Official HTML page returned an unsuccessful response.',400);
  const contentType=response.headers.get('content-type') || '';
  if(!/^(?:text\/html|application\/xhtml\+xml)(?:\s*;|$)/i.test(contentType) || /charset\s*=\s*["']?(?!utf-8\b|utf8\b)[\w-]+/i.test(contentType))
   throw evidenceError('Only bounded UTF-8 official HTML responses are supported.',400);
  const length=Number(response.headers.get('content-length') || 0);
  if(length>HTML_MAX_BYTES)throw evidenceError('Official HTML response exceeds the byte limit.',400);
  if(!response.body)throw evidenceError('Official HTML response has no retained body.',400);
  const reader=response.body.getReader(),chunks=[];let size=0;
  try{while(true){const next=await reader.read();if(next.done)break;size+=next.value.byteLength;
   if(size>HTML_MAX_BYTES){await reader.cancel();throw evidenceError('Official HTML response exceeds the byte limit.',400);}chunks.push(next.value);}}
  finally{reader.releaseLock();}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  let html;try{html=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes);}catch{throw evidenceError('Official HTML response is not valid UTF-8.',400);}
  const projection=projectHtmlText(html);
  return{method:HTML_EVIDENCE_METHOD,official_url:original,final_url:url,raw_html_base64:encode64(bytes),file_bytes:size,
   file_hash_sha256:await textSha256(bytes),text_sha256:await textSha256(new TextEncoder().encode(projection.text)),
   content_type:contentType,retrieved_at:new Date(now()).toISOString(),...projection};
 }finally{clearTimeout(timer);}
}
export async function validateHtmlEvidence(row){
 if(row?.method!==HTML_EVIDENCE_METHOD || !hashPattern.test(row.file_hash_sha256 || '') || !hashPattern.test(row.text_sha256 || '') ||
  !row.jurisdiction_id || !row.profile_snapshot || row.profile_snapshot.id!==row.jurisdiction_id || !row.requested_by ||
  !Number.isFinite(Date.parse(row.retrieved_at)) || row.verification_status!=='retained_unreviewed')throw evidenceError('Retained HTML provenance requires review.');
 authorizedHtmlUrl(row.profile_snapshot,row.official_url);authorizedHtmlUrl(row.profile_snapshot,row.final_url);
 const bytes=decode64(row.raw_html_base64);
 if(bytes.length!==row.file_bytes || await textSha256(bytes)!==row.file_hash_sha256)throw evidenceError('Retained HTML byte hash or count changed.');
 let html;try{html=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes);}catch{throw evidenceError('Retained HTML encoding changed.');}
 const projection=projectHtmlText(html);
 if(!evidenceEqual(projection.blocks,row.blocks) || row.text!==projection.text ||
  await textSha256(new TextEncoder().encode(projection.text))!==row.text_sha256)throw evidenceError('Retained HTML text projection changed.');
 return row;
}
export function htmlEvidenceSummary(row){
 return Object.fromEntries(['id','jurisdiction_id','jurisdiction_name','title','official_url','final_url','method','file_hash_sha256','file_bytes',
  'text_sha256','retrieved_at','verification_status','requested_by'].map(k=>[k,row[k]]));
}
export async function readHtmlEvidence(row,{startBlock=1,blockCount=5,excerpt,block}={}){
 await validateHtmlEvidence(row);
 if(!Number.isInteger(startBlock) || startBlock<1 || !Number.isInteger(blockCount) || blockCount<1 || blockCount>5)
  throw evidenceError('Select one to five retained HTML text blocks.',400);
 let citation;
 if(excerpt!==undefined){
  if(!Number.isInteger(block) || block<1 || typeof excerpt!=='string' || excerpt.trim().length<10 || excerpt.length>1000)
   throw evidenceError('A native HTML block and literal quote of 10–1,000 characters are required.',400);
  const found=row.blocks.find(b=>b.block===block);
  if(!found || !found.text.includes(excerpt))throw evidenceError('The quote is not literal retained HTML block evidence.');
  citation={evidence_kind:'official_html',html_evidence_id:row.id,method:row.method,official_url:row.official_url,final_url:row.final_url,
   source_sha256:row.file_hash_sha256,text_sha256:row.text_sha256,block,block_text_sha256:await textSha256(new TextEncoder().encode(found.text)),
   excerpt,retrieved_at:row.retrieved_at,authority_established:false};
 }
 return{success:true,evidence:htmlEvidenceSummary(row),blocks:row.blocks.slice(startBlock-1,startBlock-1+blockCount),
  total_blocks:row.blocks.length,next_block:startBlock+blockCount<=row.blocks.length?startBlock+blockCount:null,
  limitations:projectHtmlText(new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(decode64(row.raw_html_base64))).limitations,
  ...(citation?{citation}:{}),llm_calls:0};
}
async function findEvidence(entity,key){
 const rows=await entity.filter({evidence_key:key},'created_date',2,0);
 if(!Array.isArray(rows) || rows.length>1)throw evidenceError('HTML evidence identity is ambiguous; preserve records for review.');
 return rows[0] || null;
}
async function writeReceipt(entity,profile,expected,next){
 try{return await replaceJurisdictionFieldsIfUnchanged({entity,jurisdiction:profile,nextFields:{html_evidence_state:next},
  guardFields:{...profileIdentity(profile),html_evidence_state:expected},maxAttempts:1,label:'Manual HTML evidence retention'});}
 catch(error){throw evidenceError(error.message);}
}
async function reconcile(deps,profile,state){
 const row=await findEvidence(deps.htmlEntity,state.evidence_key);
 if(!row)return{success:false,status:'save_uncertain',request_id:state.request_id,error:'No matching retained evidence is visible. This uncertain create is not repeated.',llm_calls:0};
 await validateHtmlEvidence(row);
 if(row.jurisdiction_id!==profile.id || !evidenceEqual(row.profile_snapshot,state.profile_snapshot) ||
  row.official_url!==state.official_url || row.file_hash_sha256!==state.file_hash_sha256 || row.text_sha256!==state.text_sha256 ||
  row.file_bytes!==state.file_bytes)throw evidenceError('HTML evidence receipt conflicts with the retained source version.');
 const complete={...state,status:'complete',html_evidence_id:row.id};
 await writeReceipt(deps.profileEntity,profile,state,complete);
 return{success:true,status:'retained',evidence:htmlEvidenceSummary(row),reconciled:true,llm_calls:0};
}
export async function retainHtmlEvidence(deps,{jurisdictionId,officialUrl,title,requestId,expectedUpdatedDate,expectedTextSha256,
 officialSourceConfirmed,actor,now=()=>Date.now()}){
 if(!actor || !validRequest(requestId) || officialSourceConfirmed!==true)throw evidenceError('Authenticated manual retention, a stable request id and official-source confirmation are required.',400);
 let profile=await deps.profileEntity.get(jurisdictionId);
 if(profile.id!==jurisdictionId || !['OH','KY'].includes(profile.state))throw evidenceError('Select the canonical Ohio/Kentucky profile.',400);
 const url=authorizedHtmlUrl(profile,officialUrl),label=clean(title,200),key=requestKey(profile.id,requestId);
 const payload=await evidenceDigest({jurisdiction_id:profile.id,official_url:url,title:label,expected_text_sha256:expectedTextSha256 || null});
 const old=profile.html_evidence_state || null;
 if(old?.request_key===key){
  if(old.payload_sha256!==payload || old.requested_by!==actor)throw evidenceError('Saved HTML request belongs to another decision or reviewer.');
  return reconcile(deps,profile,old);
 }
 if(['creating','uncertain'].includes(old?.status))throw evidenceError('Reconcile the existing uncertain HTML save before another capture.');
 const past=await deps.htmlEntity.filter({request_key:key},'created_date',2,0);
 if(past.length>1)throw evidenceError('HTML request identity is ambiguous.');
 if(past.length===1){
  const row=past[0];
  if(row.payload_sha256!==payload || row.requested_by!==actor || !evidenceEqual(row.profile_snapshot,profileIdentity(profile)))throw evidenceError('Saved HTML request identity changed.');
  await validateHtmlEvidence(row);
  return{success:true,status:'retained',evidence:htmlEvidenceSummary(row),replayed:true,llm_calls:0};
 }
 if(!expectedUpdatedDate || expectedUpdatedDate!==profile.updated_date)throw evidenceError('Profile changed; reload current evidence before capture.');
 const snapshot=await fetchHtmlSnapshot({profile,officialUrl:url,fetchImpl:deps.fetchImpl,now});
 if(expectedTextSha256 && snapshot.text_sha256!==expectedTextSha256)throw evidenceError('Official page text changed after preview; preview the current response before capture.');
 const evidenceKey=await evidenceDigest({jurisdiction_id:profile.id,official_url:url,final_url:snapshot.final_url,file_hash_sha256:snapshot.file_hash_sha256,method:HTML_EVIDENCE_METHOD});
 const state={request_key:key,request_id:requestId,payload_sha256:payload,requested_by:actor,status:'creating',evidence_key:evidenceKey,
  profile_snapshot:profileIdentity(profile),official_url:url,file_hash_sha256:snapshot.file_hash_sha256,text_sha256:snapshot.text_sha256,file_bytes:snapshot.file_bytes};
 profile=await writeReceipt(deps.profileEntity,profile,old,state);
 // Same-content captures reuse immutable evidence. A reservation always precedes create.
 const existing=await findEvidence(deps.htmlEntity,evidenceKey);
 if(!existing){
  const row={...snapshot,evidence_key:evidenceKey,request_key:key,payload_sha256:payload,profile_snapshot:state.profile_snapshot,
   jurisdiction_id:profile.id,jurisdiction_name:profile.name,title:label,requested_by:actor,verification_status:'retained_unreviewed'};
  try{await deps.htmlEntity.create(row);}catch{/* Read back once; never blindly repeat an uncertain create. */}
 }
 const result=await reconcile(deps,profile,state);
 if(!result.success){
  await writeReceipt(deps.profileEntity,profile,state,{...state,status:'uncertain'});
 }
 return result;
}
export async function getHtmlEvidenceRequest(deps,{jurisdictionId,requestId,actor}){
 if(!validRequest(requestId))throw evidenceError('Stable HTML request id required.',400);
 const profile=await deps.profileEntity.get(jurisdictionId),state=profile.html_evidence_state;
 if(state?.request_key===requestKey(jurisdictionId,requestId)){
  if(state.requested_by!==actor)throw evidenceError('This HTML save belongs to another reviewer.');
  const row=await findEvidence(deps.htmlEntity,state.evidence_key);
  if(row)await validateHtmlEvidence(row);
  return{success:true,receipt:state,evidence:row?htmlEvidenceSummary(row):null,committed:state.status==='complete' && row?.id===state.html_evidence_id,llm_calls:0};
 }
 const rows=await deps.htmlEntity.filter({request_key:requestKey(jurisdictionId,requestId)},'created_date',2,0);
 if(rows.length>1)throw evidenceError('HTML request identity is ambiguous.');
 const row=rows[0];
 if(row && row.requested_by!==actor)throw evidenceError('This HTML save belongs to another reviewer.');
 if(row)await validateHtmlEvidence(row);
 return{success:true,receipt:null,evidence:row?htmlEvidenceSummary(row):null,committed:Boolean(row),llm_calls:0};
}

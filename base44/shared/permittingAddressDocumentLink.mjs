const fail=message=>{throw Object.assign(Error(message),{status:409});};
const norm=value=>String(value || '').trim().toLowerCase().replace(/^(city|village|town) of\s+/,'').replace(/\s+(city|village|town|county|township)$/,'').replace(/\s+/g,' ');
const kind=value=>['city','village','municipality'].includes(value)?'municipality':value;
const https=value=>{try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password;}catch{return false;}};
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
async function digest(value){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value))))].map(b=>b.toString(16).padStart(2,'0')).join('');}
function sourceSnapshot(row,id){
 if(!row||row.reference_only!==true||row.authority_established!==false||row.location_verified!==true||!row.owner_id||!row.owner_email||!row.scan_run_id)fail('Collection location or provenance needs review before linking.');
 const matches=(row.documents || []).filter(d=>d.id===id);if(matches.length!==1)fail('Select one original.');const d=matches[0];
 if(d.archive_state?.status!=='complete'||!https(d.url)||!https(d.file_url)||!/^[a-f0-9]{64}$/.test(d.source_sha256 || '')||d.source_sha256!==d.stored_sha256||!Number.isSafeInteger(d.source_bytes)||d.source_bytes<1||d.source_bytes!==d.stored_bytes)fail('Original bytes must be verified before linking.');
 return {collection_id:row.id,owner_id:row.owner_id,owner_email:row.owner_email,scan_run_id:row.scan_run_id,target:row.location_target,source_url:row.permitting_url,document:d};
}
function identity(p){return {id:p.id,name:p.name,state:p.state,type:p.type,parent_county:p.parent_county?.name,geographic_identity:p.geographic_identity};}
function destination(rows,target){
 if(!target||!['OH','KY'].includes(target.state)||!norm(target.name)||!['county','township','municipality'].includes(kind(target.type)))fail('Collection jurisdiction identity is incomplete.');
 const matches=rows.filter(p=>p.state===target.state&&norm(p.name)===norm(target.name)&&kind(p.type)===kind(target.type)&&
  (p.geographic_identity?.geoid?p.geographic_identity.geoid===target.geoid:target.type==='county'||Boolean(norm(target.county))&&norm(p.parent_county?.name)===norm(target.county)));
 if(matches.length!==1)fail('No unique jurisdiction match. Resolve missing or duplicate identities first.');return matches[0];
}
export async function linkAddressDocument({collections,profiles,scans,loadProfiles,actor,body,onProgress=async()=>{},now=()=>new Date().toISOString()}){
 if(actor?.role!=='admin')throw Object.assign(Error('Administrator review is required.'),{status:403});
 for(const key of ['collection_id','document_id'])if(typeof body[key]!=='string'||!body[key]||body[key].length>100)throw Object.assign(Error('Select a saved original.'),{status:400});
 if(!/^[A-Za-z0-9_-]{1,100}$/.test(body.collection_id))throw Object.assign(Error('Select a saved original.'),{status:400});
 await onProgress('Checking saved original and jurisdiction identity',0);
 const snapshot=sourceSnapshot(await collections.get(body.collection_id),body.document_id),profile=destination(await loadProfiles(),snapshot.target);
 const origin=await scans.get(snapshot.scan_run_id);
 if(origin?.action_kind!=='address'||!['complete','completed_with_errors'].includes(origin.status)||origin.owner_id!==snapshot.owner_id||origin.owner_email!==snapshot.owner_email)fail('Originating address scan provenance changed or is incomplete.');
 const evidence=await digest({snapshot,destination:identity(profile)}),id='address-link-'+evidence;
 const old=profile.documents || [];if(!Array.isArray(old)||!profile.updated_date)fail('Jurisdiction document state is unavailable.');
 const existing=old.filter(d=>d.id===id);
 if(existing.length===1&&equal(existing[0].address_research_review?.snapshot,snapshot)&&existing[0].address_research_review?.evidence_digest===evidence&&existing[0].address_research_review?.authority_established===false&&existing[0].archive_pinned===true&&['url','file_url','source_sha256','stored_sha256','source_bytes','stored_bytes'].every(k=>existing[0][k]===snapshot.document[k]))return {success:true,status:'already_linked',jurisdiction_id:profile.id,document_id:id};
 if(existing.length||old.some(d=>d.url===snapshot.document.url||d.file_url===snapshot.document.file_url))fail('This source already has a repository entry. Review it instead of creating a duplicate.');
 const preview={success:true,dry_run:true,jurisdiction_id:profile.id,jurisdiction_name:profile.name,state:profile.state,document_title:snapshot.document.title,source_url:snapshot.document.url,file_url:snapshot.document.file_url,expected_evidence_digest:evidence,expected_updated_date:profile.updated_date};
 if(body.dry_run===true)return preview;
 if(body.confirmed!==true||body.expected_evidence_digest!==evidence||body.expected_updated_date!==profile.updated_date)fail('Evidence or jurisdiction changed. Preview again before linking.');
 const fresh=sourceSnapshot(await collections.get(body.collection_id),body.document_id);if(!equal(fresh,snapshot))fail('Original changed after preview.');
 const d=snapshot.document,copy={id,title:d.title || 'Reviewed original',url:d.url,file_url:d.file_url,doc_type:['sign_ordinance','permit_application','zoning_code','fee_schedule','checklist'].includes(d.doc_type)?d.doc_type:'other',source:'manual',archive_pinned:true,source_sha256:d.source_sha256,stored_sha256:d.stored_sha256,source_bytes:d.source_bytes,stored_bytes:d.stored_bytes,archive_state:{status:'complete'},address_research_review:{evidence_digest:evidence,reviewed_by:actor.email,reviewed_by_id:actor.id,reviewed_at:now(),snapshot,authority_established:false}};
 await onProgress('Linking reviewed snapshot without replacing existing documents',1);
 let error;try{const result=await profiles.updateMany({id:profile.id,updated_date:profile.updated_date},{$set:{documents:[...old,copy],_manual_documents:true}});if(result?.updated!==1)error=Error('Jurisdiction changed or link outcome is unknown.');}catch(e){error=e;}
 const saved=await profiles.get(profile.id).catch(()=>null),found=(saved?.documents || []).filter(d=>d.id===id);
 if(saved&&equal(identity(saved),identity(profile))&&found.length===1&&equal(found[0],copy)){await onProgress('Reviewed original link verified',2);return {success:true,status:'linked',jurisdiction_id:profile.id,document_id:id,reconciled:Boolean(error)};}
 throw error || Error('Link could not be verified. Preview the same original before retrying.');
}

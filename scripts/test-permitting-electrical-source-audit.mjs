import test from 'node:test';
import assert from 'node:assert/strict';
import {readElectricalEvidenceSourceMetadata as read, reconcileRecordedElectricalEvidence as audit}
  from '../src/components/permitting/permittingElectricalSourceAudit.mjs';
const H='a'.repeat(64),T='b'.repeat(64),OH='OH';
const source=(patch={})=>({id:'pdf',jurisdiction_id:'p',official_url:'https://gov.example/permit.pdf',
  archived_file_url:'https://files.example/retained.pdf',file_hash_sha256:H,file_bytes:150,
  content_status:'current',verification_status:'verified',authority_classification:'current_adopted',
  authority_review:{status:'active',review_id:'source-r',scope_kind:'named_jurisdiction',named_areas:['Example City']},...patch});
const profile=(patch={})=>({id:'p',state:OH,name:'Example City',type:'city',office_authority_review_state:{status:'complete',committed_sequence:1},...patch});
const review=(patch={})=>({id:'r',method:'office-authority-v1',jurisdiction_id:'p',sequence:1,
  relation_key:'r-key',role:'electrical_permit',action:'verify',source_document_id:'pdf',
  profile_snapshot:{id:'p',state:OH},office_snapshot:{government_office_id:'office'},
  coverage_area:'Example City',coverage_kind:'named_jurisdiction',coverage_basis:'same_profile_scope',source_review_id:'source-r',responsibility_confirmed:true,address_authority_resolved:false,
  source_snapshot:source(),role_proof:{physical_page:1,text_sha256:T,excerpt:'Electrical permits are issued here'},
  ...patch});
const run=(events=[review()],docs=[source()],profiles=[profile()])=>audit(profiles,events,docs);

test('exact retained PDF metadata and citation are historical references, not verification',()=>{
 const r=run();assert.equal(r.states.OH.electrical_permit.histories,1);
 assert.equal(r.states.OH.electrical_permit.recorded_source_reference,1);
 assert.equal(r.items.length,0);
 assert.equal(r.current_source_verified,false);assert.equal(r.authority_verified,false);
 assert.equal(r.states.OH.electrical_inspection.histories,0);
});
test('missing source metadata is a permission-scoped visibility flag, not deletion',()=>{
 const r=run(undefined,[]);assert.equal(r.items[0].status,'no_visible_source');
 assert.match(r.notice,/outside read permissions/);
});
test('source ID and claimed snapshot jurisdiction conflict are visible',()=>{
 const r=run(undefined,[source({jurisdiction_id:'other'})]);
 assert.equal(r.items[0].status,'source_identity_conflict');
});
test('changed source snapshot flags verification metadata, hash, or source-review changes',()=>{
 for(const patch of [{file_hash_sha256:'c'.repeat(64)},{verification_status:'needs_verification'},
  {authority_review:{review_id:'new'}},{official_url:'https://gov.example/new.pdf'}]){
  assert.equal(run(undefined,[source(patch)]).items[0].status,'source_snapshot_changed');
 }
});
test('PDF with no complete retained archive is never treated as backed by archived bytes',()=>{
 for(const patch of [{file_hash_sha256:null},{archived_file_url:''},{file_bytes:0}]){
  const r=run([review({source_snapshot:source(patch)})],[source(patch)]);
  assert.equal(r.items[0].status,'retained_archive_missing');
 }
});
test('missing PDF page, quote or text checksum stays unverified',()=>{
 for(const role_proof of [{physical_page:0,text_sha256:T,excerpt:'Electrical work'},
  {physical_page:2,text_sha256:'bad',excerpt:'Electrical work'},
  {physical_page:2,text_sha256:T,excerpt:''}]){
  const r=run([review({role_proof})]);
  assert.equal(r.items[0].status,'page_citation_incomplete');
 }
});
test('electrical inspection is separate from issuer even with identical source ID',()=>{
 const events=[review(),review({id:'i',sequence:2,role:'electrical_inspection',relation_key:'inspection-key'})];
 const r=run(events,undefined,[profile({office_authority_review_state:{status:'complete',committed_sequence:2}})]);
 assert.equal(r.states.OH.electrical_permit.recorded_source_reference,1);
 assert.equal(r.states.OH.electrical_inspection.recorded_source_reference,1);
});
test('official HTML delegated review cannot substitute for specific electrical quote',()=>{
 const r=run([review({evidence_kind:'official_html',html_evidence_id:'html-1',source_document_id:''})],[]);
 assert.equal(r.items[0].status,'unsupported_electrical_html');
});
test('legacy generic electrical, zoning and other roles are not counted as specific responsibilities',()=>{
 const r=run([review({role:'electrical'}),review({id:'z',role:'zoning'})]);
 assert.equal(r.states.OH.electrical_permit.histories,0);
 assert.equal(r.states.OH.electrical_inspection.histories,0);
});
test('revocations and earlier superseded verifications are not shown as missing sources',()=>{
 const r=run([review(),review({id:'r2',sequence:2,action:'revoke'})],[],
  [profile({office_authority_review_state:{status:'complete',committed_sequence:2}})]);
 assert.equal(r.states.OH.electrical_permit.revoked,1);
 assert.equal(r.states.OH.electrical_permit.no_visible_source,0);
 assert.deepEqual(r.items,[]);
});
test('outstanding uncommitted event or uncertain reservation takes precedence',()=>{
 for(const receipt of [{status:'creating',committed_sequence:1},{status:'uncertain',committed_sequence:1},
  {status:'complete',committed_sequence:0}]){
  assert.equal(run(undefined,undefined,[profile({office_authority_review_state:receipt})]).items[0].status,'uncommitted_or_uncertain');
 }
 const r=run([review(),review({id:'future',sequence:2,action:'revoke'})]);
 assert.equal(r.items[0].status,'uncommitted_or_uncertain');
});
test('ambiguous equal-sequence relationship actions do not promote either source',()=>{
 const r=run([review(),review({id:'duplicate',action:'revoke'})]);
 assert.equal(r.items[0].status,'ambiguous_history');
});
test('an official publisher name, type, or same county cannot substitute for exact source identity',()=>{
 const r=run([review({source_document_id:'another-source',source_snapshot:source({id:'another-source'})})],[source()]);
 assert.equal(r.items[0].status,'no_visible_source');
});
test('invalid event, profile and source identities fail closed without mutating input',()=>{
 assert.throws(()=>run([review(),review()]),/duplicate/);
 assert.throws(()=>run(undefined,[source(),source()]),/duplicate/);
 assert.throws(()=>run(undefined,undefined,[profile(),profile()]),/duplicate/);
 assert.throws(()=>run(null),/Invalid/);
 const p=[profile()],e=[review()],d=[source()],original=JSON.stringify([p,e,d]);
 audit(p,e,d);assert.equal(JSON.stringify([p,e,d]),original);
});
test('Ohio findings before Kentucky for specific roles',()=>{
 const p=[profile({id:'ky',state:'KY'}),profile()];
 const e=[review({id:'ky-e',jurisdiction_id:'ky',profile_snapshot:{id:'ky',state:'KY'},source_document_id:'missing'}),
  review({source_document_id:'also-missing'})];
 const r=audit(p,e,[]);
 assert.deepEqual(r.items.map(i=>i.state),['OH','KY']);
});
test('metadata loader requests only unique explicit PDF IDs, in chunks of 25, with projected fields',async()=>{
 const events=Array.from({length:58},(_,i)=>review({id:'event'+i,source_document_id:'pdf-'+i}));
 events.push(review({id:'duplicate-source',source_document_id:'pdf-1'}),review({id:'html',source_document_id:'',evidence_kind:'official_html'}));
 const calls=[],progress=[];
 const api={entities:{PermittingSourceDocument:{filter:async(query,opts)=>{
  const ids=query.id.$in;calls.push({ids,opts});
  return {items:ids.map(id=>({id})),has_more:false};
 }}}};
 const result=await read(api,events,{onProgress:v=>progress.push(v)});
 assert.equal(result.length,58);assert.equal(calls.length,3);
 assert.deepEqual(calls.map(c=>c.ids.length),[25,25,8]);
 assert.ok(calls.every(c=>c.opts.fields.includes('archived_file_url')&&!c.opts.fields.includes('extracted_pages')&&!c.opts.fields.includes('raw_html_base64')));
 assert.equal(progress.at(-1).found,58);
});
test('metadata loader rejects returned extraneous/repeated IDs, bad pages, nonadvance and read failures',async()=>{
 const eventList=[review()],api=filter=>({entities:{PermittingSourceDocument:{filter}}});
 await assert.rejects(read(api(async()=>({items:[{id:'other'}],has_more:false})),eventList),/outside requested/);
 await assert.rejects(read(api(async()=>({items:null,has_more:false})),eventList),/Invalid/);
 let count=0;
 await assert.rejects(read(api(async()=>({items:[],has_more:true,next_cursor:++count===1?'same':'same'})),eventList),/advance/);
 await assert.rejects(read(api(async()=>{throw Error('Read access denied')}),eventList),/Read access denied/);
});
test('metadata loader respects stale cancellation before and after remote reads',async()=>{
 const api={entities:{PermittingSourceDocument:{filter:async()=>({items:[],has_more:false})}}};
 await assert.rejects(read(api,[review()],{isCurrent:()=>false}),/superseded/);
 let current=true;
 const delayed={entities:{PermittingSourceDocument:{filter:async()=>{current=false;return {items:[],has_more:false};}}}};
 await assert.rejects(read(delayed,[review()],{isCurrent:()=>current}),/superseded/);
});
test('6,000 recorded electrical relationships are not capped, mutated or silently verified',()=>{
 const events=Array.from({length:6000},(_,i)=>review({id:'r'+i,relation_key:'relation'+i,sequence:i+1,source_document_id:'missing-'+i}));
 const p=[profile({office_authority_review_state:{status:'complete',committed_sequence:6000}})];
 const original=JSON.stringify(events);const result=run(events,[],p);
 assert.equal(result.states.OH.electrical_permit.histories,6000);
 assert.equal(result.states.OH.electrical_permit.no_visible_source,6000);
 assert.equal(result.items.length,6000);
 assert.equal(JSON.stringify(events),original);
});

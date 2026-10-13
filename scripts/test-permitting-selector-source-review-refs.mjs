import test from 'node:test';
import assert from 'node:assert/strict';
import {readSavedSourceOfficeReviewReferences as read} from '../src/components/permitting/selectorSourceOfficeReviewReferences.mjs';

const H='a'.repeat(64),T='b'.repeat(64);
const document=()=>({id:'local-doc',url:'https://gov.example/electrical.pdf',
 source_sha256:H,source_bytes:250,file_url:'https://saved.example/electrical.pdf',stored_sha256:H,stored_bytes:250});
const profile=()=>({id:'oh-profile',name:'Example City',state:'OH',type:'city',
 documents:[document()],office_authority_review_state:{status:'complete',committed_sequence:1}});
const source=()=>({id:'catalog-source',jurisdiction_id:'oh-profile',jurisdiction_profile_doc_id:'local-doc',
 official_url:'https://gov.example/electrical.pdf',archived_file_url:'https://saved.example/electrical.pdf',
 file_hash_sha256:H,file_bytes:250,content_status:'current',verification_status:'verified',
 authority_classification:'current_adopted',
 authority_review:{status:'active',review_id:'scope-1',scope_kind:'named_jurisdiction',named_areas:['Example City']}});
const event=(patch={})=>({id:'review-1',method:'office-authority-v1',jurisdiction_id:'oh-profile',
 sequence:1,relation_key:'rel-1',role:'electrical_permit',action:'verify',
 profile_snapshot:{id:'oh-profile',state:'OH'},office_snapshot:{government_office_id:'office-1',name:'Electrical Office'},
 source_document_id:'catalog-source',source_review_id:'scope-1',source_snapshot:source(),
 coverage_area:'Example City',coverage_kind:'named_jurisdiction',coverage_basis:'same_profile_scope',
 responsibility_confirmed:true,address_authority_resolved:false,
 role_proof:{physical_page:2,text_sha256:T,excerpt:'Electrical permits are issued here'},...patch});
function fixture({p=profile(),catalog=[source()],events=[event()]}={}){
 const calls=[];
 const api={entities:{
  JurisdictionProfile:{get:async id=>{calls.push({name:'profile',id});return structuredClone(p);}},
  PermittingSourceDocument:{filter:async(query,options)=>{calls.push({name:'catalog',query,options});
   return {items:structuredClone(catalog),has_more:false};}},
  PermittingOfficeAuthorityReview:{filter:async(query,options)=>{calls.push({name:'reviews',query,options});
   return {items:structuredClone(events),has_more:false};}}
 }};
 return {api,calls,p};
}
test('exact profile document ID maps to exactly one catalog source, then immutable issuer review ID',async()=>{
 const f=fixture();
 const result=await read(f.api,profile(),document());
 assert.equal(result.status,'recorded_history_read');
 assert.equal(result.source_id,'catalog-source');assert.equal(result.document_id,'local-doc');
 assert.equal(result.source_status_verified,false);
 assert.deepEqual(result.items.map(r=>[r.role,r.review_id,r.latest_review_id,r.status]),[
   ['electrical_permit','review-1','review-1','recorded_source_reference']]);
 assert.deepEqual(f.calls.map(c=>c.name),['profile','catalog','reviews']);
 assert.deepEqual(f.calls[1].query,{jurisdiction_id:'oh-profile',jurisdiction_profile_doc_id:'local-doc'});
 assert.deepEqual(f.calls[2].query,{jurisdiction_id:'oh-profile',method:'office-authority-v1'});
 assert.deepEqual(f.calls[1].options.fields.includes('jurisdiction_profile_doc_id'),true);
 assert.equal(f.calls[2].options.limit,50);
});
test('inspector history is distinct and never inferred from issuer source or role',async()=>{
 const f=fixture({events:[event(),event({id:'review-2',role:'electrical_inspection',relation_key:'rel-2',
  role_proof:{physical_page:3,text_sha256:T,excerpt:'Electrical inspections are performed here'}})],
  p:{...profile(),office_authority_review_state:{status:'complete',committed_sequence:1}}});
 const r=await read(f.api,profile(),document());
 assert.deepEqual(r.items.map(x=>x.role),['electrical_permit','electrical_inspection']);
 assert.deepEqual(r.items.map(x=>x.status),['recorded_source_reference','recorded_source_reference']);
});
test('missing or duplicated catalog lineage never borrows an office by URL or name',async()=>{
 for(const catalog of [[],[source(),{...source(),id:'catalog-two'}]]){
  const f=fixture({catalog});
  const r=await read(f.api,profile(),document());
  assert.equal(r.status,catalog.length?'ambiguous_catalog_link':'no_visible_catalog_link');
  assert.deepEqual(r.items,[]);
  assert.equal(f.calls.some(c=>c.name==='reviews'),false);
 }
});
test('catalog original URL mismatch does not silently reattach a same-name record',async()=>{
 const f=fixture({catalog:[{...source(),official_url:'https://gov.example/different.pdf'}]});
 const r=await read(f.api,profile(),document());
 assert.equal(r.status,'catalog_source_mismatch');assert.equal(f.calls.length,2);
});
test('saved document mutations or duplicate saved IDs require fresh review before catalog calls',async()=>{
 for(const p of [
  {...profile(),documents:[{...document(),url:'https://changed.example/form.pdf'}]},
  {...profile(),documents:[document(),document()]},
  {...profile(),state:'KY'}
 ]){
  const f=fixture({p});
  await assert.rejects(read(f.api,profile(),document()),/identity changed|source record changed/);
  assert.equal(f.calls.length,1);
 }
});
test('subsequent revoke retains exact older review and latest revoke IDs, no authority grant',async()=>{
 const p={...profile(),office_authority_review_state:{status:'complete',committed_sequence:2}};
 const f=fixture({p,events:[event(),event({id:'revoke-2',sequence:2,action:'revoke',source_document_id:''})]});
 const r=await read(f.api,profile(),document());
 assert.equal(r.items.length,1);
 assert.equal(r.items[0].review_id,'review-1');
 assert.equal(r.items[0].latest_review_id,'revoke-2');
 assert.equal(r.items[0].status,'revoked');
 assert.deepEqual(r.items[0].review_ids,['review-1','revoke-2']);
});
test('source replacement keeps original source-linked review and identifies changed latest source',async()=>{
 const p={...profile(),office_authority_review_state:{status:'complete',committed_sequence:2}};
 const f=fixture({p,events:[event(),event({id:'replacement',sequence:2,source_document_id:'different-catalog'})]});
 const r=await read(f.api,profile(),document());
 assert.equal(r.items[0].review_id,'review-1');
 assert.equal(r.items[0].latest_review_id,'replacement');
 assert.equal(r.items[0].latest_source_id,'different-catalog');
 assert.notEqual(r.items[0].status,'recorded_source_reference');
});
test('malformed relationship keys never associate by office names',async()=>{
 const f=fixture({events:[event({relation_key:''})]});
 const r=await read(f.api,profile(),document());
 assert.equal(r.items[0].status,'invalid_relation_key');
});
test('cross-role relationship key conflict or out-of-scope backend results reject rather than guess',async()=>{
 for(const events of [
  [event(),event({id:'inspection',role:'electrical_inspection',relation_key:'rel-1'})],
  [event(),event({id:'wrong',jurisdiction_id:'other'})],
  [event(),event({id:'unrelated',method:'another-method'})]
 ]){
  const f=fixture({events});
  await assert.rejects(read(f.api,profile(),document()),/Conflicting roles|escaped the selected jurisdiction/);
 }
});
test('a stale session, permission error or duplicate pagination refuses to report recorded authority',async()=>{
 const f=fixture();
 await assert.rejects(read(f.api,profile(),document(),()=>false),/superseded/);
 f.api.entities.JurisdictionProfile.get=async()=>{throw Error('Not permitted');};
 await assert.rejects(read(f.api,profile(),document()),/Not permitted/);
 const duplicate=fixture({catalog:[source(),source()]});
 await assert.rejects(read(duplicate.api,profile(),document()),/repeated during pagination/);
});
test('no matching electrical review events is an explicit no-visible-review result only',async()=>{
 const f=fixture({events:[event({id:'zoning',role:'zoning'})]});
 const r=await read(f.api,profile(),document());
 assert.deepEqual(r.items,[]);
 assert.equal(r.status,'recorded_history_read');
 assert.match(r.notice,/historical references only/);
});

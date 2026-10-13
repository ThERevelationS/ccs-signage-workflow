import test from 'node:test';
import assert from 'node:assert/strict';
import {readSavedSourceOfficeReviewReferences as read,describeSourceOfficeReview as describe} from '../src/components/permitting/selectorSourceOfficeReviewReferences.mjs';

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
 assert.deepEqual(f.calls.map(c=>c.name),['profile','catalog','reviews','catalog','profile']);
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

test('original source-linked review follows sequence rather than record ID order',async()=>{
 const p={...profile(),office_authority_review_state:{status:'complete',committed_sequence:2}};
 const f=fixture({p,events:[event({id:'a-later',sequence:2}),event({id:'z-original'})]});
 const r=await read(f.api,profile(),document());
 assert.equal(r.items[0].review_id,'z-original');
 assert.equal(r.items[0].latest_review_id,'a-later');
});
test('staff explanations preserve uncertainty and conflict ahead of source replacement',()=>{
 for(const status of ['uncommitted_or_uncertain','ambiguous_history','source_identity_conflict','malformed_review','invalid_relation_key']){
  assert.doesNotMatch(describe({status,source_replaced:true}).label,/superseded|recorded$/);
 }
 assert.match(describe({status:'revoked',source_replaced:true}).label,/revoked/);
 assert.match(describe({status:'no_visible_source',source_replaced:true}).label,/superseded/);
 assert.match(describe({status:'no_visible_source',source_replaced:true}).action,/not checked/);
 assert.match(describe({status:'covered_area_review'}).action,/service area/);
 assert.match(describe({status:'source_snapshot_changed'}).action,/Refresh/);
 assert.match(describe({status:'unknown'}).label,/cannot currently be established/);
 assert.match(describe({status:'recorded_source_reference'}).action,/current official evidence/);
});
test('replacement remains superseded and later pending event remains uncertain',async()=>{
 for(const committed_sequence of [1,2]){
  const f=fixture({p:{...profile(),office_authority_review_state:{status:'complete',committed_sequence}},
   events:[event(),event({id:'later',sequence:2,source_document_id:'replacement-source'})]});
  const r=await read(f.api,profile(),document());
  assert.match(describe(r.items[0]).label,committed_sequence===1?/cannot currently be established/:/superseded/);
 }
});

test('receipt advancement, document removal and manual overrides during history read refuse stale results',async()=>{
 for(const mutate of [
  p=>{p.office_authority_review_state.committed_sequence=2;},
  p=>{p.documents=[];},
  p=>{p.manual_office_override={office_id:'different-office'};},
  p=>{p.state='KY';}
 ]){
  const f=fixture();
  const original=f.api.entities.PermittingOfficeAuthorityReview.filter;
  f.api.entities.PermittingOfficeAuthorityReview.filter=async(...args)=>{
   const result=await original(...args);mutate(f.p);return result;
  };
  await assert.rejects(read(f.api,profile(),document()),/changed during lookup/);
  assert.deepEqual(f.calls.map(c=>c.name),['profile','catalog','reviews','catalog','profile']);
 }
});
test('final profile permission loss and cancellation never return partial history',async()=>{
 for(const cancelled of [false,true]){
  const f=fixture();let count=0,current=true;
  f.api.entities.JurisdictionProfile.get=async()=>{
   count++;
   if(count===2){
    if(cancelled)current=false;
    else throw Error('Read permission lost');
   }
   return structuredClone(f.p);
  };
  await assert.rejects(read(f.api,profile(),document(),()=>current),cancelled?/superseded/:/Read permission lost/);
 }
});
test('equivalent object property order does not invalidate profile consistency',async()=>{
 const f=fixture();let count=0;
 f.api.entities.JurisdictionProfile.get=async()=>{
  count++;return count===1?structuredClone(f.p):Object.fromEntries(Object.entries(structuredClone(f.p)).reverse());
 };
 const r=await read(f.api,profile(),document());
 assert.equal(r.items[0].status,'recorded_source_reference');
 assert.equal(count,2);
});

test('catalog changes, new duplicates and visibility loss during history traversal refuse results',async()=>{
 for(const mutate of [
  rows=>{rows[0].file_hash_sha256='c'.repeat(64);},
  rows=>{rows[0].jurisdiction_profile_doc_id='another-document';},
  rows=>{rows[0].authority_review.status='revoked';},
  rows=>{rows[0].authority_review_state={status:'uncertain'};},
  rows=>{rows[0].superseded_by='new-source';},
  rows=>{rows.push({...rows[0],id:'new-duplicate'});},
  rows=>{rows.splice(0);}
 ]){
  const catalog=[source()],f=fixture({catalog});
  const original=f.api.entities.PermittingOfficeAuthorityReview.filter;
  f.api.entities.PermittingOfficeAuthorityReview.filter=async(...args)=>{
   const result=await original(...args);mutate(catalog);return result;
  };
  await assert.rejects(read(f.api,profile(),document()),/catalog changed|uniquely visible/);
  assert.equal(f.calls.filter(c=>c.name==='catalog').length,2);
  assert.equal(f.calls.filter(c=>c.name==='profile').length,1);
 }
});
test('catalog recheck permission errors and stale requests never return historical results',async()=>{
 for(const cancelled of [false,true]){
  const f=fixture();let count=0,current=true;
  const original=f.api.entities.PermittingSourceDocument.filter;
  f.api.entities.PermittingSourceDocument.filter=async(...args)=>{
   count++;
   if(count===2){
    if(cancelled)current=false;
    else throw Error('Catalog read permission lost');
   }
   return original(...args);
  };
  await assert.rejects(read(f.api,profile(),document(),()=>current),cancelled?/superseded/:/Catalog read permission lost/);
  assert.equal(count,2);
 }
});
test('catalog recheck is exact, paginated and accepts equivalent property ordering',async()=>{
 const f=fixture();let count=0;
 const original=f.api.entities.PermittingSourceDocument.filter;
 f.api.entities.PermittingSourceDocument.filter=async(...args)=>{
  count++;
  const r=await original(...args);
  if(count===2)r.items=r.items.map(row=>Object.fromEntries(Object.entries(row).reverse()));
  return r;
 };
 const r=await read(f.api,profile(),document());
 assert.equal(r.items[0].status,'recorded_source_reference');
 const calls=f.calls.filter(c=>c.name==='catalog');
 assert.equal(calls.length,2);
 assert.deepEqual(calls[0].query,calls[1].query);
 assert.deepEqual(calls[0].options,calls[1].options);
 assert.ok(calls[0].options.fields.includes('superseded_by'));
});

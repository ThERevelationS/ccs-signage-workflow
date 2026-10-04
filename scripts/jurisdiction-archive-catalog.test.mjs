import test from 'node:test';
import assert from 'node:assert/strict';
import { registerJurisdictionArchive, continueJurisdictionCatalogBacklog, catalogSourcePayload, catalogSourceEligible, catalogBacklogQuery } from '../base44/shared/jurisdictionArchiveCatalog.mjs';
import { archiveKnownJurisdictionSource } from '../base44/shared/jurisdictionArchiveContinuation.mjs';

const hash = 'a'.repeat(64);
const doc = { id:'d', title:'Zoning Variance Application', doc_type:'permit_application', source:'ai_discovered',
  url:'https://gov.test/application.pdf', file_url:'https://storage.test/a.pdf', source_sha256:hash,
  stored_sha256:hash, source_bytes:20, stored_bytes:20, downloaded_at:'2026-10-04T08:00:00Z', archive_state:{status:'complete'} };
function fixture({rows=[],document=doc,createLost=false,writeLost=false,createNoReceipt=false}={}) {
  let version=1, record={id:'j',name:'County',state:'OH',updated_date:'v1',documents:[structuredClone(document)],notes:'keep',permit_requirements:{manual:true}};
  const calls={creates:0,filters:[],writes:0};
  const entity={
    get:async()=>structuredClone(record),
    filter:async(q,s,l)=>{calls.filters.push({q,s,l});return [structuredClone(record)];},
    updateMany:async(q,p)=>{if(q.updated_date!==record.updated_date)return{updated:0};record={...record,...p.$set,updated_date:'v'+(++version)};calls.writes++;if(writeLost){writeLost=false;throw Error('lost write acknowledgement');}return{updated:1};},
  };
  const catalogEntity={
    filter:async(q,s,l)=>{assert.equal(l,3);return structuredClone(rows);},
    create:async data=>{calls.creates++;if(createNoReceipt)throw Error('create outcome unknown');const row={...data,id:'s'};rows.push(row);if(createLost)throw Error('lost create acknowledgement');return structuredClone(row);},
  };
  return {api:{entity,catalogEntity,jurisdictionId:'j',now:()=>Date.parse('2026-10-04T09:00:00Z')},calls,rows,record:()=>record,
    patch:p=>{record={...record,...p,updated_date:'v'+(++version)};}};
}
test('registers one verified archive with unknown adoption and durable receipt; redelivery creates nothing',async()=>{
  const f=fixture();const result=await registerJurisdictionArchive(f.api);
  assert.equal(result.created,1);assert.equal(f.rows[0].content_status,'unknown');
  assert.equal(f.rows[0].authority_classification,'application_form');assert.equal(f.rows[0].verification_status,'needs_verification');
  assert.equal(f.rows[0].file_hash_sha256,hash);assert.equal(f.rows[0].jurisdiction_profile_doc_id,'d');
  assert.equal(f.rows[0].effective_or_adopted_date,undefined);assert.equal(f.rows[0].extracted_text,undefined);
  assert.equal((await registerJurisdictionArchive(f.api)).skipped,true);assert.equal(f.calls.creates,1);
  assert.equal(f.record().notes,'keep');assert.deepEqual(f.record().permit_requirements,{manual:true});
  assert.equal(f.record().documents[0].catalog_state.source_document_id,'s');
});
test('concurrent registration workers create at most one row',async()=>{
  const f=fixture();await Promise.allSettled([registerJurisdictionArchive({...f.api,token:'a'}),registerJurisdictionArchive({...f.api,token:'b'})]);
  assert.equal(f.calls.creates,1);
});
test('lost create acknowledgement reconciles existing row without repeating creation',async()=>{
  const f=fixture({createLost:true});assert.equal((await registerJurisdictionArchive(f.api)).status,'create_uncertain');
  assert.equal((await registerJurisdictionArchive(f.api)).source_document_id,'s');assert.equal(f.calls.creates,1);
});
test('unknown create with no row never repeats, even manually',async()=>{
  const f=fixture({createNoReceipt:true});await registerJurisdictionArchive(f.api);
  assert.equal((await registerJurisdictionArchive({...f.api,automatic:false})).status,'create_uncertain');assert.equal(f.calls.creates,1);
});
test('expired creating receipt only reconciles; does not repeat create',async()=>{
  const f=fixture({document:{...doc,catalog_state:{status:'creating',lease_expires_at:'2020-01-01T00:00:00Z'}}});
  assert.equal((await registerJurisdictionArchive(f.api)).status,'create_uncertain');assert.equal(f.calls.creates,0);
});
test('active registration lease prevents work',async()=>{
  const f=fixture({document:{...doc,catalog_state:{status:'creating',lease_expires_at:'2030-01-01T00:00:00Z'}}});
  assert.equal((await registerJurisdictionArchive(f.api)).reason,'registration_in_flight');assert.equal(f.calls.creates,0);
});
test('existing verified/manual catalog decisions remain byte-for-byte unchanged',async()=>{
  const row={id:'legacy',jurisdiction_id:'j',official_url:doc.url,file_hash_sha256:hash,authority_classification:'current_adopted',reviewer:'Staff',verification_status:'verified',notes_gaps:'manual scope'};
  const f=fixture({rows:[structuredClone(row)]});assert.equal((await registerJurisdictionArchive(f.api)).source_document_id,'legacy');
  assert.deepEqual(f.rows,[row]);assert.equal(f.calls.creates,0);
});
test('duplicate or mismatched existing catalog evidence is preserved and flagged',async()=>{
  for(const rows of [[{id:'a'},{id:'b'}],[{id:'a',file_hash_sha256:'b'.repeat(64)}],[{id:'a',official_url:'https://gov.test/other.pdf'}],[{id:'a',jurisdiction_id:'other'}]]){
    const f=fixture({rows:structuredClone(rows)});assert.equal((await registerJurisdictionArchive(f.api)).status,'conflict');
    assert.deepEqual(f.rows,rows);assert.equal(f.calls.creates,0);assert.equal(f.record().documents[0].catalog_state.status,'conflict');
  }
});
test('lost conditional write acknowledgement is verified and does not duplicate create',async()=>{
  const f=fixture({writeLost:true});assert.equal((await registerJurisdictionArchive(f.api)).created,1);assert.equal(f.calls.creates,1);
});
test('newer unrelated profile notes and source links are preserved by registration writes',async()=>{
  const f=fixture();const get=f.api.entity.get;let calls=0;
  f.api.entity.get=async()=>{if(++calls===2)f.patch({notes:'concurrent',documents:[doc,{id:'html',url:'https://gov.test/portal'}]});return get();};
  await registerJurisdictionArchive(f.api);assert.equal(f.record().notes,'concurrent');assert.equal(f.record().documents.length,2);
});
test('manual protection arriving after lookup prevents creation',async()=>{
  const f=fixture();const filter=f.api.catalogEntity.filter;
  f.api.catalogEntity.filter=async(...args)=>{f.patch({_manual_documents:true});return filter(...args);};
  await assert.rejects(registerJurisdictionArchive(f.api));assert.equal(f.calls.creates,0);
});
test('unverified receipts, portals, hashes, manual/pinned collections, and opt-out are skipped',async()=>{
  for(const patch of [{stored_sha256:'b'.repeat(64)},{stored_bytes:19},{source_sha256:'bad'},{archive_state:{status:'uploaded'}},{source:'manual'},{pinned:true},{archive_pinned:true}]){
    const f=fixture({document:{...doc,...patch}});assert.equal((await registerJurisdictionArchive(f.api)).skipped,true);assert.equal(f.calls.creates,0);
  }
  const f=fixture();f.patch({auto_refresh:false});assert.equal((await registerJurisdictionArchive(f.api)).skipped,true);
  assert.equal((await registerJurisdictionArchive({...f.api,automatic:false})).created,1);
});
test('duplicate retained source identities never register automatically',async()=>{
  const f=fixture();f.patch({documents:[doc,{...doc,id:'another'}]});assert.equal((await registerJurisdictionArchive(f.api)).skipped,true);assert.equal(f.calls.creates,0);
});
test('drafts, meeting minutes, and generic code titles cannot become adopted authority',()=>{
  const profile={id:'j',name:'County'};
  const payload=title=>catalogSourcePayload(profile,{...doc,title,doc_type:'zoning_code'},'key',Date.now());
  assert.equal(payload('Proposed Amended Zoning Code 2025').content_status,'proposed');
  assert.equal(payload('Draft Ordinance').authority_classification,'draft_proposed');
  assert.equal(payload('Commission Minutes - Article V Sign Regulations').authority_classification,'legislative_evidence');
  assert.equal(payload('Article 34 Adopted Sign Regulations').authority_classification,'unknown_review_required');
  assert.equal(payload('Zoning Ordinance').content_status,'unknown');
});
test('bounded automatic catalog scan registers one source without downloads or LLM calls',async()=>{
  const f=fixture();const result=await continueJurisdictionCatalogBacklog(f.api);assert.equal(result.created,1);
  assert.equal(f.calls.filters[0].l,20);assert.equal(f.calls.filters[0].s,'updated_date');
  assert.ok(catalogBacklogQuery().documents.$elemMatch['catalog_state.status'].$nin.includes('create_uncertain'));
  assert.equal(catalogSourceEligible(f.record(),f.record().documents[0]),false);
});
test('catalog failure after successful archive preserves complete bytes and prevents re-upload',async()=>{
  const fresh={id:'d',title:'Application',source:'ai_discovered',doc_type:'permit_application',url:'https://gov.test/application.pdf'};
  const f=fixture({document:fresh,createNoReceipt:true});let uploads=0;
  const r=await archiveKnownJurisdictionSource({...f.api,fetchSource:async()=>new Response('%PDF-1.7 sample'),uploadFile:async()=>{uploads++;return{file_url:doc.file_url};}});
  assert.equal(r.archived,1);assert.equal(r.catalog.status,'create_uncertain');assert.equal(f.record().documents[0].archive_state.status,'complete');
  assert.equal((await archiveKnownJurisdictionSource({...f.api,fetchSource:()=>{throw Error('Unexpected network');}})).skipped,true);assert.equal(uploads,1);
});

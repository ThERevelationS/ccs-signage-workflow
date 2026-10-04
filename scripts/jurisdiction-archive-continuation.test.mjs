import test from 'node:test';
import assert from 'node:assert/strict';
import { archiveKnownJurisdictionSource, archiveDocumentEligible, archiveBacklogQuery } from '../base44/shared/jurisdictionArchiveContinuation.mjs';

const pdf = '%PDF-1.7 sample';
const doc = { id: 'd1', title: 'Sign application', url: 'https://gov.test/sign.pdf', source: 'ai_discovered', doc_type: 'permit_application' };
function fixture({ documents = [doc, { id:'html', url:'https://gov.test/apply', title:'Apply online' }], failDownload = false, failUpload = false, failReadback = false, corrupt = false, lostWriteAck = false } = {}) {
  let version = 1;
  let record = { id:'j1', updated_date:'v1', name:'County', state:'OH', documents:structuredClone(documents), permit_requirements:{max_height_ft:10}, notes:'kept' };
  const calls = { uploads:0, sourceFetches:0, storedFetches:0 };
  const entity = {
    get: async () => structuredClone(record),
    updateMany: async (q, patch) => {
      if(q.updated_date !== record.updated_date) return {updated:0};
      record = {...record, ...patch.$set, updated_date:'v'+(++version)};
      if(lostWriteAck) { lostWriteAck=false; throw new Error('Lost acknowledgement'); }
      return {updated:1};
    },
  };
  const api = {
    entity, jurisdictionId:'j1',
    fetchSource: async url => {
      if(url.includes('storage.test')) { calls.storedFetches++; if(failReadback) throw new Error('Readback failed'); return new Response(pdf,{headers:{'content-type':'application/pdf'}}); }
      calls.sourceFetches++;
      if(failDownload) throw new Error('Download failed');
      return new Response(corrupt?'<html>missing</html>':pdf,{headers:{'content-type':'application/pdf'}});
    },
    uploadFile: async ({file}) => {
      assert.ok(file instanceof File); assert.equal(file.name,'sign.pdf');
      assert.equal(await file.text(),pdf);
      calls.uploads++;
      if(failUpload) throw new Error('Upload connection lost');
      return {file_url:'https://storage.test/archive.pdf'};
    },
  };
  return { api, calls, record:()=>record, patch:patch=>{record={...record,...patch,updated_date:'v'+(++version)};},
    recoverReadback:()=>{failReadback=false;} };
}
test('one known file is archived, read back, fingerprinted; HTML and other fields remain intact',async()=>{
  const f=fixture();
  const r=await archiveKnownJurisdictionSource(f.api);
  assert.equal(r.archived,1); assert.equal(f.calls.uploads,1);
  const d=f.record().documents[0];
  assert.match(d.source_sha256,/^[a-f0-9]{64}$/);
  assert.equal(d.source_sha256,d.stored_sha256); assert.equal(d.source_bytes,15);
  assert.equal(d.archive_state.status,'complete');
  assert.equal(f.record().documents[1].file_url,undefined);
  assert.deepEqual(f.record().permit_requirements,{max_height_ft:10});
  assert.equal(f.record().notes,'kept');
});
test('concurrent workers cannot upload the same source twice',async()=>{
  const f=fixture();
  const results=await Promise.allSettled([archiveKnownJurisdictionSource({...f.api,token:'a'}),archiveKnownJurisdictionSource({...f.api,token:'b'})]);
  assert.equal(f.calls.uploads,1);
  assert.equal(results.filter(r=>r.status==='fulfilled' && r.value.archived===1).length,1);
});
test('lost upload acknowledgement stops automatic and manual re-upload',async()=>{
  const f=fixture({failUpload:true});
  const r=await archiveKnownJurisdictionSource(f.api);
  assert.equal(r.status,'upload_uncertain');
  assert.equal((await archiveKnownJurisdictionSource({...f.api,manual:true})).skipped,true);
  assert.equal(f.calls.uploads,1);
  assert.equal(f.record().documents[0].url,doc.url);
});
test('readback recovery uses the durable same-file receipt without another upload',async()=>{
  const f=fixture({failReadback:true});
  assert.equal((await archiveKnownJurisdictionSource(f.api)).status,'uploaded');
  const d=f.record().documents[0]; assert.equal(d.file_url,undefined);
  assert.equal(d.archive_state.file_url,'https://storage.test/archive.pdf');
  f.recoverReadback();
  assert.equal((await archiveKnownJurisdictionSource({...f.api,manual:true})).archived,1);
  assert.equal(f.calls.uploads,1); assert.equal(f.calls.sourceFetches,1); assert.equal(f.calls.storedFetches,2);
});
test('expired uploading lease remains blocked for reconciliation',()=>{
  assert.equal(archiveDocumentEligible({...doc,archive_state:{status:'uploading',lease_expires_at:'2000-01-01'}},{manual:true}),false);
});
test('automatic failures stop after three attempts; explicit manual retry is not credit capped',async()=>{
  const f=fixture({failDownload:true});
  let time=Date.now();
  for(let i=0;i<3;i++){await archiveKnownJurisdictionSource({...f.api,now:()=>time}); time+=24*60*60_000;}
  assert.equal(f.record().documents[0].archive_state.status,'blocked');
  assert.equal((await archiveKnownJurisdictionSource({...f.api,now:()=>time})).skipped,true);
  await archiveKnownJurisdictionSource({...f.api,now:()=>time,manual:true});
  assert.equal(f.calls.sourceFetches,4); assert.equal(f.calls.uploads,0);
});
test('manual retry ignores known-download backoff while automatic retry waits',async()=>{
  const f=fixture({failDownload:true});
  await archiveKnownJurisdictionSource(f.api);
  assert.equal((await archiveKnownJurisdictionSource(f.api)).skipped,true);
  await archiveKnownJurisdictionSource({...f.api,manual:true});
  assert.equal(f.calls.sourceFetches,2);
});
test('concurrent unrelated additions and staff notes survive archival',async()=>{
  const f=fixture();const original=f.api.uploadFile;
  f.api.uploadFile=async args=>{f.patch({notes:'new staff note',documents:[...f.record().documents,{id:'new',url:'https://gov.test/new-code',source:'manual'}]});return original(args);};
  await archiveKnownJurisdictionSource(f.api);
  assert.equal(f.record().notes,'new staff note');
  assert.equal(f.record().documents.length,3);
  assert.equal(f.record().documents[2].source,'manual');
});
test('manual protection arriving during upload prevents later attachment',async()=>{
  const f=fixture();const original=f.api.uploadFile;
  f.api.uploadFile=async args=>{f.patch({_manual_documents:true});return original(args);};
  assert.equal((await archiveKnownJurisdictionSource(f.api)).status,'receipt_conflict');
  assert.equal(f.record().documents[0].file_url,undefined);
  assert.equal(f.record()._manual_documents,true);
});
test('duplicate identities, manual, pinned, hashed and archived evidence are skipped',async()=>{
  for(const extra of [{source:'manual'},{pinned:true},{archive_pinned:true},{source_sha256:'proof'},{file_url:'kept'}]){
    const f=fixture({documents:[{...doc,...extra}]});
    assert.equal((await archiveKnownJurisdictionSource(f.api)).skipped,true);assert.equal(f.calls.uploads,0);
  }
  const f=fixture({documents:[doc,{...doc,id:'duplicate'}]});
  assert.equal((await archiveKnownJurisdictionSource(f.api)).skipped,true);
});
test('conditional-write lost acknowledgement is recovered without duplicate network work',async()=>{
  const f=fixture({lostWriteAck:true});
  assert.equal((await archiveKnownJurisdictionSource(f.api)).archived,1);assert.equal(f.calls.uploads,1);
});
test('HTML mislabeled as PDF is retained as a failed source, never uploaded',async()=>{
  const f=fixture({corrupt:true});
  assert.equal((await archiveKnownJurisdictionSource(f.api)).status,'failed');
  assert.equal(f.calls.uploads,0);assert.equal(f.record().documents[0].url,doc.url);
});
test('manual same-document redelivery does not advance to another source',async()=>{
  const f=fixture({documents:[doc,{...doc,id:'d2',url:'https://gov.test/other.pdf'}]});
  await archiveKnownJurisdictionSource({...f.api,documentId:'d1'});
  assert.equal((await archiveKnownJurisdictionSource({...f.api,documentId:'d1'})).skipped,true);
  assert.equal(f.calls.uploads,1);
});
test('backlog query excludes uncertain uploads and protected files without shrinking total coverage',()=>{
  const q=archiveBacklogQuery();
  assert.deepEqual(q.documents.$elemMatch['archive_state.status'].$nin,['complete','uploading','upload_uncertain','blocked','verification_blocked']);
  assert.deepEqual(q.state.$in,['OH','KY']);
});

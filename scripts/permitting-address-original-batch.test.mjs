import test from 'node:test';
import assert from 'node:assert/strict';
import {remainingOriginals,saveOriginalBatch,originalFileStatus,originalCollectionCounts} from '../src/components/permitting/addressOriginalBatch.mjs';
const doc=(id,extra={})=>({id,url:'https://example.gov/'+id+'.pdf',...extra});
test('batch excludes saved, uncertain, active leases, protected and duplicate identities',()=>{
 const documents=[doc('pending'),doc('saved',{file_url:'https://stored.gov/a.pdf'}),doc('uncertain',{archive_state:{status:'upload_uncertain'}}),doc('uploading',{archive_state:{status:'uploading'}}),doc('leased',{archive_state:{lease_expires_at:'2099-01-01'}}),doc('pinned',{pinned:true}),doc('duplicate'),doc('duplicate')];
 assert.deepEqual(remainingOriginals({documents}).map(d=>d.id),['pending']);
});
test('retained referrals deduplicate URLs and do not restage existing documents',()=>{
 const collection={documents:[doc('a')],external_referrals:[{url:'https://example.gov/a.pdf',source_page_url:'https://example.gov/forms'},{url:'https://cdn.gov/b.pdf',source_page_url:'https://example.gov/forms'},{url:'https://cdn.gov/b.pdf',source_page_url:'https://example.gov/other'}]};
 assert.deepEqual(remainingOriginals(collection).map(d=>d.id),['a','referral:https://cdn.gov/b.pdf']);
});
test('manual batch has no overall cap and makes one sequential attempt per file',async()=>{
 let active=0,max=0;const calls=[],files=Array.from({length:105},(_,i)=>doc(String(i)));
 const result=await saveOriginalBatch({files,stopped:()=>false,onProgress:()=>{},save:async file=>{active++;max=Math.max(max,active);calls.push(file.id);await Promise.resolve();active--;return file.id!=='4';}});
 assert.equal(max,1);assert.equal(calls.length,105);assert.equal(result.saved,104);assert.equal(result.needsReview,1);assert.equal(result.checked,105);
});
test('stop allows current file to finish and prevents next file',async()=>{
 let stop=false;const calls=[];const result=await saveOriginalBatch({files:[doc('1'),doc('2')],stopped:()=>stop,onProgress:()=>{},save:async file=>{calls.push(file.id);stop=true;return true;}});
 assert.deepEqual(calls,['1']);assert.equal(result.checked,1);assert.equal(result.stopped,true);
});
test('lost acknowledgement halts without retry or starting another file',async()=>{
 const calls=[];await assert.rejects(saveOriginalBatch({files:[doc('1'),doc('2')],stopped:()=>false,onProgress:()=>{},save:async file=>{calls.push(file.id);throw Error('network');}}),/network/);assert.deepEqual(calls,['1']);
});

test('file status distinguishes verified originals from misleading complete receipts',()=>{
 const saved=doc('a',{file_url:'https://stored.gov/a.pdf',source_sha256:'a'.repeat(64),stored_sha256:'a'.repeat(64),source_bytes:15,stored_bytes:15,archive_state:{status:'complete'}});
 assert.equal(originalFileStatus(saved).kind,'saved');
 assert.equal(originalFileStatus({...saved,stored_sha256:'b'.repeat(64)}).kind,'review');
 assert.equal(originalFileStatus(doc('bad',{archive_state:{status:'complete'}})).kind,'review');
});
test('file status distinguishes active work, interrupted download and uncertain upload',()=>{
 const future='2099-01-01T00:00:00Z';
 assert.equal(originalFileStatus(doc('d',{archive_state:{status:'downloading',lease_expires_at:future}})).kind,'active');
 assert.equal(originalFileStatus(doc('u',{archive_state:{status:'uploading',lease_expires_at:future}})).kind,'active');
 assert.equal(originalFileStatus(doc('u',{archive_state:{status:'uploading'}})).kind,'review');
 assert.equal(originalFileStatus(doc('u',{archive_state:{status:'upload_uncertain',lease_expires_at:future}})).kind,'review');
 assert.match(originalFileStatus(doc('d',{archive_state:{status:'downloading'}})).label,/Previous download stopped/);
});
test('verification receipts retain future retry times without claiming a file is saved',()=>{
 const state={status:'uploaded',file_url:'https://stored.gov/file.pdf',retry_after:'2099-01-01T00:00:00Z'};
 const status=originalFileStatus(doc('v',{archive_state:state}));
 assert.equal(status.kind,'verify');assert.equal(status.retryAfter,new Date(state.retry_after).toISOString());
 assert.equal(originalFileStatus(doc('v',{archive_state:{...state,retry_after:'invalid'}})).retryAfter,null);
});
test('collection status counts outside originals once and never hides blocked files',()=>{
 const collection={documents:[doc('p'),doc('b',{archive_state:{status:'blocked'}}),doc('v',{archive_state:{status:'uploaded',file_url:'https://stored.gov/file.pdf'}})],external_referrals:[{url:'https://cdn.gov/a.pdf'},{url:'https://cdn.gov/a.pdf'},{url:'https://example.gov/p.pdf'}]};
 assert.deepEqual(originalCollectionCounts(collection),{saved:0,waiting:2,active:0,verify:1,review:1,total:4});
 assert.equal(originalFileStatus(doc('r',{archive_state:{attempts:3}})).kind,'review');
});

test('blocked verification never advertises an automatic retry',()=>{const status=originalFileStatus(doc('blocked',{archive_state:{status:'verification_blocked',file_url:'https://stored.gov/a.pdf',retry_after:'2099-01-01'}}));assert.equal(status.kind,'verify');assert.equal(status.retryAfter,undefined);assert.match(status.label,/automatic verification stopped/);});

import test from 'node:test';
import assert from 'node:assert/strict';
import {remainingOriginals,saveOriginalBatch} from '../src/components/permitting/addressOriginalBatch.mjs';
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

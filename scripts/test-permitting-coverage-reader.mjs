import assert from 'node:assert/strict';
import {readAllCoveragePages,reconcileRecordedCoverage} from '../src/components/permitting/permittingCoverageReader.mjs';
let calls=0;
const rows=await readAllCoveragePages(async cursor=>{calls++;const n=cursor?Number(cursor):0;return {items:Array.from({length:500},(_,i)=>({id:String(n*500+i)})),has_more:n<11,next_cursor:String(n+1)};});
assert.equal(rows.length,6000);assert.equal(calls,12);
await assert.rejects(readAllCoveragePages(async()=>({items:[],has_more:true,next_cursor:'same'})),/advance/);
await assert.rejects(readAllCoveragePages(async()=>({items:[{}],has_more:false})),/stable identity/);
let current=true;
await assert.rejects(readAllCoveragePages(async()=>{current=false;return {items:[],has_more:false};},{isCurrent:()=>current}),/superseded/);
const q={id:'q',state:'OH',jurisdiction_type:'city',jurisdiction_name:'Springfield',parent_county_name:'Clark County'};
const p={id:'p',state:'OH',type:'city',name:'Springfield',parent_county:{name:'Clark County'}};
assert.equal(reconcileRecordedCoverage([q],[p]).items[0].state,'single_profile_candidate');
assert.equal(reconcileRecordedCoverage([q],[p,{...p,id:'p2'}]).items[0].state,'ambiguous_profiles');
assert.equal(reconcileRecordedCoverage([q,{...q,id:'q2'}],[p]).items[0].state,'duplicate_queue_identity');
assert.equal(reconcileRecordedCoverage([q],[{...p,parent_county:{name:'Other County'}}]).items[0].state,'profile_missing');
assert.equal(reconcileRecordedCoverage([{...q,parent_county_name:''}],[p]).items[0].state,'identity_incomplete');
assert.equal(reconcileRecordedCoverage([q],[{...p,type:'municipality'}]).invalid_profile_ids.length,1);
assert.equal(reconcileRecordedCoverage([],[]).inventory_complete,false);
console.log('Coverage reader passed: 6000 rows without total cap, repeated cursor/malformed page rejection, stale read cancellation, ambiguous/duplicate/incomplete identities and county isolation. No live calls.');

// Repeated rows must not silently replace an earlier office review snapshot.
for (const changed of [false,true]) {
 let pages=0;
 const earlier={id:'locality',state:'OH',offices:[{authority_roles:['electrical_permit'],authority_verification_status:'needs_verification'}]};
 const later=changed?{...earlier,offices:[{authority_roles:['electrical_permit','electrical_inspection'],authority_verification_status:'staff_verified'}]}:{...earlier};
 await assert.rejects(readAllCoveragePages(async()=>++pages===1
  ? {items:[earlier],has_more:true,next_cursor:'second'}
  : {items:[later],has_more:false}),/repeated during pagination/);
 assert.equal(pages,2);
}
await assert.rejects(readAllCoveragePages(async()=>({items:[{id:'same'},{id:'same'}],has_more:false})),/repeated during pagination/);
console.log('Repeated identities rejected within a page and across pages, including changed electrical authority snapshots.');

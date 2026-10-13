import test from 'node:test';
import assert from 'node:assert/strict';
import { reconcileSavedLocalityProfileLinks as reconcile } from '../src/components/permitting/permittingCoverageReader.mjs';

const profile=(id,state='OH',name='Springfield')=>({id,state,name});
const locality=(id,link,state='OH',name='Springfield')=>({id,state,name,...(link===undefined?{}:{jurisdiction_profile_id:link})});

test('only an explicit exact saved ID is treated as linked; no name fallback',()=>{
 const r=reconcile([locality('legacy'),locality('linked','p')],[profile('p')]);
 assert.equal(r.states.OH.saved,2);
 assert.equal(r.states.OH.unlinked,1);
 assert.equal(r.states.OH.linked_reference_only,1);
 assert.equal(r.reviews.length,1);
 assert.deepEqual(r.reviews[0].flags,['unlinked']);
 assert.equal(r.identity_verified,false);assert.equal(r.authority_verified,false);assert.equal(r.inventory_complete,false);
});

test('targets absent from permission-scoped/non-atomic read remain explicit and not considered deleted',()=>{
 const r=reconcile([locality('id','missing')],[]);
 assert.deepEqual(r.reviews[0].flags,['missing_target']);
 assert.match(r.notice,/read permissions/);
});

test('shared saved profile ID is flagged for each locality without merging identity',()=>{
 const r=reconcile([locality('a','p'),locality('b','p')],[profile('p')]);
 assert.equal(r.states.OH.shared_link,2);assert.equal(r.states.OH.linked_reference_only,0);
 assert.deepEqual(r.reviews.map(x=>x.shared_locality_ids),[['b'],['a']]);
});

test('state discrepancy and different labels require review even with exact ID',()=>{
 const r=reconcile([locality('a','p','OH','Oakwood')],[profile('p','KY','Oak Wood')]);
 assert.deepEqual(r.reviews[0].flags,['state_review','name_review']);
 assert.equal(r.states.OH.state_review,1);assert.equal(r.states.OH.name_review,1);
 assert.equal(r.reviews[0].profile_state,'KY');
});

test('review flags overlap rather than hiding other issues',()=>{
 const r=reconcile([locality('a','p','OH','Oakwood'),locality('b','p','OH','Oakwood')],[profile('p','KY','Other')]);
 assert.equal(r.states.OH.shared_link,2);assert.equal(r.states.OH.state_review,2);
 assert.equal(r.states.OH.name_review,2);assert.equal(r.states.OH.linked_reference_only,0);
});

test('Ohio review is prioritized, unsupported states excluded but not treated as OH/KY',()=>{
 const r=reconcile([locality('ky',undefined,'KY'),locality('outside',undefined,'WV'),locality('oh',undefined,'OH')],[]);
 assert.deepEqual(r.reviews.map(x=>x.id),['oh','ky']);
 assert.deepEqual(r.excluded_record_ids,['outside']);
 assert.equal(r.states.OH.saved,1);assert.equal(r.states.KY.saved,1);
});

test('malformed links remain review items; never coerce or trim into a target',()=>{
 const r=reconcile([locality('a',' p '),locality('b',17),locality('c',' ')],[profile('p')]);
 assert.equal(r.states.OH.invalid_link,3);assert.equal(r.states.OH.linked_reference_only,0);
 for(const item of r.reviews)assert.deepEqual(item.flags,['invalid_link']);
});

test('large read-only locality inventory is uncapped',()=>{
 const rows=Array.from({length:6000},(_,i)=>locality('loc'+i,'profile'+i));
 const refs=Array.from({length:6000},(_,i)=>profile('profile'+i));
 const r=reconcile(rows,refs);
 assert.equal(r.states.OH.saved,6000);assert.equal(r.states.OH.linked_reference_only,6000);
 assert.equal(r.reviews.length,0);
});

test('missing or duplicate identities fail closed',()=>{
 assert.throws(()=>reconcile(null,[]),/Invalid/);
 assert.throws(()=>reconcile([locality('x'),locality('x')],[]),/repeated/);
 assert.throws(()=>reconcile([locality(' x ')],[]),/repeated/);
 assert.throws(()=>reconcile([],[profile('p'),profile('p')]),/repeated/);
 assert.throws(()=>reconcile([],[profile('')]),/Invalid/);
});

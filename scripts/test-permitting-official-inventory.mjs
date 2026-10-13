import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {reconcileOfficialInventory} from '../src/components/permitting/permittingCoverageReader.mjs';
const ref=JSON.parse(readFileSync('src/components/permitting/officialGeographicInventory.json'));
assert.equal(ref.rows.length,3647);
for(const s of ref.sources)assert.equal(createHash('sha256').update(readFileSync('docs/official-evidence/oh-ky-geography-2026/'+s.file)).digest('hex'),s.sha256);
const base={source_rows:3,source_vintage:'fixture',rows:[
{key:'a',state:'OH',name:'Miami',type:'township',county_name:'Hamilton',category:'candidate'},
{key:'b',state:'OH',name:'Miami',type:'township',county_name:'Montgomery',category:'candidate'},
{key:'c',state:'KY',name:'Miami',type:'city',category:'candidate'}]};
const p={id:'p',name:'Miami Township',state:'OH',type:'township',parent_county:{name:'Hamilton County'}};
let r=reconcileOfficialInventory([], [p],base);
assert.deepEqual(r.profiles.assessments[0].candidate_keys,['a']);
assert.deepEqual(r.profiles.missing.map(x=>x.key),['b','c']);
r=reconcileOfficialInventory([],[{...p,parent_county:null}],base);
assert.equal(r.profiles.assessments[0].state,'ambiguous');
assert.equal(r.profiles.identity_review[0].id,'p');
assert.equal(r.profiles.identity_review[0].name,'Miami Township');
assert.equal(r.profiles.identity_review[0].record_state,'OH');
assert.ok(r.profiles.assessments[0].review_flags.includes('parent_county_missing'));
r=reconcileOfficialInventory([],[{...p,type:'municipality'}],base);assert.equal(r.profiles.assessments[0].state,'unmatched');
assert.throws(()=>reconcileOfficialInventory([],[],{...base,rows:[base.rows[0],base.rows[0],base.rows[2]]}),/identity/);
r=reconcileOfficialInventory([],[],ref);
assert.deepEqual(r.candidate_counts,{OH:2318,KY:530});assert.equal(r.status_review_count,25);assert.equal(r.statistical_reference_count,774);
assert.equal(r.inventory_complete_for_permitting,false);assert.equal(r.authority_verified,false);
console.log('Official inventory tests passed.');

const single={source_rows:1,rows:[base.rows[0]]};
r=reconcileOfficialInventory([],[{...p,parent_county:null}],single);
assert.equal(r.profiles.assessments[0].state,'single_geographic_candidate');
assert.equal(r.profiles.identity_review.length,1);
r=reconcileOfficialInventory([],[p],single);assert.equal(r.profiles.identity_review.length,0);

r=reconcileOfficialInventory([],[p,{...p,id:'p2'}],base);
assert.deepEqual(r.profiles.identity_review.map(row=>row.id),['p','p2']);
assert.deepEqual(r.profiles.identity_review[0].overlapping_record_ids,['p2']);
assert.deepEqual(r.profiles.identity_review[1].overlapping_record_ids,['p']);
assert.equal(r.profiles.assessments[0].canonical_identity_verified,false);
r=reconcileOfficialInventory([],[p,{...p,id:'other-county',parent_county:{name:'Montgomery County'}},{...p,id:'other-state',state:'KY',type:'city'}],base);
assert.deepEqual(r.profiles.identity_review.map(row=>row.id),['other-state']);
assert.deepEqual(r.profiles.assessments.map(row=>row.overlapping_record_ids),[[],[],[]]);
r=reconcileOfficialInventory([],[p,{...p,id:'ambiguous',parent_county:null}],base);
assert.deepEqual(r.profiles.assessments[0].overlapping_record_ids,['ambiguous']);
const q={id:'queue-one',state:'OH',jurisdiction_name:'Miami Township',jurisdiction_type:'township',parent_county_name:'Hamilton County'};
r=reconcileOfficialInventory([q,{...q,id:'queue-two'}],[p],base);
assert.equal(r.queue.identity_review.length,2);assert.equal(r.profiles.identity_review.length,0);

for(const type of ['city','village']) {
 const municipal={source_rows:1,rows:[{key:'municipal',state:'OH',name:'Fixture',type,category:'candidate'}]};
 r=reconcileOfficialInventory([{id:'q-municipal',state:'OH',jurisdiction_name:'Fixture',jurisdiction_type:type,parent_county_name:'Recorded County'}],[{id:'p-municipal',state:'OH',name:'Fixture',type,parent_county:{name:'Recorded County'}}],municipal);
 for(const group of ['queue','profiles']){
  assert.equal(r[group].identity_review.length,1);
  assert.equal(r[group].identity_review[0].state,'single_geographic_candidate');
  assert.ok(r[group].identity_review[0].review_flags.includes('official_county_relationship_pending'));
  assert.equal(r[group].identity_review[0].canonical_identity_verified,false);
 }
 assert.equal(r.authority_verified,false);
}

r=reconcileOfficialInventory([],[{...p,parent_county:null}],base);
assert.deepEqual(r.profiles.identity_review[0].candidate_details,[
 {key:'a',state:'OH',type:'township',name:'Miami',county_name:'Hamilton'},
 {key:'b',state:'OH',type:'township',name:'Miami',county_name:'Montgomery'}]);
assert.deepEqual(r.profiles.identity_review[0].candidate_details.map(row=>row.key),r.profiles.identity_review[0].candidate_keys);
r=reconcileOfficialInventory([],[{...p,name:'Unmatched'}],base);assert.deepEqual(r.profiles.identity_review[0].candidate_details,[]);

const mixed=[{id:'ky',state:'KY',name:'A',type:'unsupported'},{id:'oh-z',state:'OH',name:'Z',type:'unsupported'},{id:'outside',state:'TN',name:'A',type:'unsupported'},{id:'oh-a2',state:'OH',name:'A',type:'unsupported'},{id:'oh-a1',state:'OH',name:'A',type:'unsupported'}];
const before=JSON.stringify(mixed);
r=reconcileOfficialInventory([],mixed,base);
assert.deepEqual(r.profiles.identity_review.map(row=>row.id),['oh-a1','oh-a2','oh-z','ky','outside']);
assert.deepEqual(r.profiles.assessments.map(row=>row.id),mixed.map(row=>row.id));
assert.equal(JSON.stringify(mixed),before);
const reversed={...base,rows:[base.rows[2],base.rows[1],base.rows[0]]};
const original=JSON.stringify(reversed);
r=reconcileOfficialInventory([],[],reversed);
assert.deepEqual(r.profiles.missing.map(row=>row.key),['a','b','c']);
assert.equal(JSON.stringify(reversed),original);
assert.equal(r.profiles.missing.length,3);

const referenceBefore=JSON.stringify(ref);
r=reconcileOfficialInventory([],[],ref);
assert.equal(r.status_review_items.length,25);
assert.deepEqual(new Set(r.status_review_items.map(row=>row.key)),new Set(ref.rows.filter(row=>row.category==='status_relationship_review').map(row=>row.key)));
assert.equal(r.status_review_items[0].state,'OH');
assert.ok(r.status_review_items.every(row=>row.category==='status_relationship_review'));
assert.ok(!r.profiles.missing.some(row=>r.status_review_items.some(item=>item.key===row.key)));
assert.equal(JSON.stringify(ref),referenceBefore);
assert.notEqual(r.status_review_items[0],ref.rows.find(row=>row.key===r.status_review_items[0].key));

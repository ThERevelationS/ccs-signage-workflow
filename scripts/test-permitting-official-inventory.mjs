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

for(const bad of [null,{...base.rows[0],key:'  a '},{...base.rows[0],key:42},{...base.rows[0],name:''},{...base.rows[0],name:'   '},{...base.rows[0],state:'TN'}])
 assert.throws(()=>reconcileOfficialInventory([],[],{source_rows:1,rows:[bad]}),/Invalid official inventory identity/);
for(const category of [undefined,'candidate_typo','',null])
 assert.throws(()=>reconcileOfficialInventory([],[],{source_rows:1,rows:[{...base.rows[0],category}]}),/Invalid official inventory category/);
assert.throws(()=>reconcileOfficialInventory([],[],{source_rows:1,rows:[{...base.rows[0],type:'invented'}]}),/candidate type/);
r=reconcileOfficialInventory([],[],ref);
assert.equal(r.candidate_counts.OH+r.candidate_counts.KY+r.status_review_count+r.statistical_reference_count,r.source_rows);

r=reconcileOfficialInventory([],[],ref);assert.deepEqual(r.source_references,ref.sources);assert.equal(r.source_references.length,8);
for(const bad of [{...ref.sources[0],url:'javascript:alert(1)'},{...ref.sources[0],url:'https://user:secret@tigerweb.geo.census.gov/source'},{...ref.sources[0],url:'https://example.com/source'},{...ref.sources[0],sha256:'missing'}])
 assert.throws(()=>reconcileOfficialInventory([],[],{...base,sources:[bad]}),/Invalid official inventory source/);

for(const sources of [null,{},'sources'])assert.throws(()=>reconcileOfficialInventory([],[],{...ref,sources}),/Invalid official inventory sources/);
assert.throws(()=>reconcileOfficialInventory([],[],{...ref,sources:[...ref.sources,ref.sources[0]]}),/Invalid official inventory source reference/);
assert.throws(()=>reconcileOfficialInventory([],[],{...ref,rows:ref.rows.map((row,index)=>index===0?{...row,source_file:'unknown.html'}:row)}),/no unique retained source reference/);
assert.throws(()=>reconcileOfficialInventory([],[],{...ref,sources:[]}),/no unique retained source reference/);
r=reconcileOfficialInventory([],[],ref);assert.equal(r.source_rows,3647);assert.equal(r.source_references.length,8);

r=reconcileOfficialInventory([],[],ref);
const sourceCounts=Object.values(r.source_row_counts);
assert.equal(sourceCounts.reduce((sum,row)=>sum+row.total,0),3647);
assert.equal(sourceCounts.reduce((sum,row)=>sum+row.candidates,0),2848);
assert.equal(sourceCounts.reduce((sum,row)=>sum+row.status_review,0),25);
assert.equal(sourceCounts.reduce((sum,row)=>sum+row.statistical,0),774);
for(const source of ref.sources){
 const counts=r.source_row_counts[source.file];
 assert.equal(counts.total,ref.rows.filter(row=>row.source_file===source.file).length);
 assert.equal(counts.total,counts.candidates+counts.status_review+counts.statistical);
}

r=reconcileOfficialInventory([{...q,parent_county_name:'Wrong County'}],[{...p,parent_county:{name:'Wrong County'}}],base);
for(const group of ['queue','profiles']){
 const row=r[group].identity_review[0];assert.equal(row.state,'unmatched');
 assert.equal(row.recorded_county,'Wrong County');assert.ok(row.review_flags.includes('parent_county_conflict'));
 assert.deepEqual(row.candidate_keys,[]);assert.deepEqual(row.candidate_details,[]);
}
r=reconcileOfficialInventory([],[{...p,name:'Absent Township',parent_county:{name:'Wrong County'}}],base);
assert.ok(!r.profiles.identity_review[0].review_flags.includes('parent_county_conflict'));
r=reconcileOfficialInventory([],[p],base);assert.ok(!r.profiles.assessments[0].review_flags.includes('parent_county_conflict'));

for(const [official,type,truncated] of [['Grove City','city','Grove'],['Bay Village','city','Bay'],['Beach City','village','Beach']]){
 const municipal={source_rows:1,rows:[{key:'name-fixture',state:'OH',name:official,type,category:'candidate'}]};
 for(const name of [official,`${type} of ${official}`])assert.equal(reconcileOfficialInventory([],[{id:'name-record',state:'OH',name,type}],municipal).profiles.assessments[0].state,'single_geographic_candidate');
 assert.equal(reconcileOfficialInventory([],[{id:'short-record',state:'OH',name:truncated,type}],municipal).profiles.assessments[0].state,'unmatched');
}
assert.deepEqual(reconcileOfficialInventory([],[p],base).profiles.assessments[0].candidate_keys,['a']);
const countyRef={source_rows:1,rows:[{key:'county-fixture',state:'OH',name:'Hamilton',type:'county',category:'candidate'}]};
assert.equal(reconcileOfficialInventory([],[{id:'county',state:'OH',name:'Hamilton County',type:'county'}],countyRef).profiles.assessments[0].state,'single_geographic_candidate');

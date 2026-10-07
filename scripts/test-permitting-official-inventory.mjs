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
assert.ok(r.profiles.assessments[0].review_flags.includes('parent_county_missing'));
r=reconcileOfficialInventory([],[{...p,type:'municipality'}],base);assert.equal(r.profiles.assessments[0].state,'unmatched');
assert.throws(()=>reconcileOfficialInventory([],[],{...base,rows:[base.rows[0],base.rows[0],base.rows[2]]}),/identity/);
r=reconcileOfficialInventory([],[],ref);
assert.deepEqual(r.candidate_counts,{OH:2318,KY:530});assert.equal(r.status_review_count,25);assert.equal(r.statistical_reference_count,774);
assert.equal(r.inventory_complete_for_permitting,false);assert.equal(r.authority_verified,false);
console.log('Official inventory tests passed.');

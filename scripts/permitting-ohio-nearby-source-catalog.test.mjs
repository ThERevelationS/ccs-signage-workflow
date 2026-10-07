import test from 'node:test';
import assert from 'node:assert/strict';
import {reconcileRetainedSource as check} from './reconcile-ohio-nearby-source-catalog.mjs';
const source={city:'Norwood',file:'a.pdf',official_url:'https://city.gov/a',final_url:'https://city.gov/a.pdf',sha256:'a'.repeat(64),bytes:10};
const profile={id:'n',name:'Norwood',state:'OH',type:'city',documents:[]};
const row={id:'r',jurisdiction_id:'n',official_url:source.official_url,file_hash_sha256:source.sha256,file_bytes:10,archived_file_url:'https://storage/a'};
test('absence records gap without authorizing creation',()=>{const r=check(source,profile,[]);assert.equal(r.status,'not_registered');assert.equal(r.registration_allowed,false);assert.equal(r.storage_verified,false);});
test('exact archive identity preserves existing catalog record',()=>{const r=check(source,profile,[row]);assert.equal(r.status,'existing_exact_catalog_identity');assert.deepEqual(r.catalog_candidate_ids,['r']);assert.equal(r.storage_verified,true);assert.equal(r.authority_approved,false);});
test('changed bytes, other locality, legacy name-only rows and duplicates block linking',()=>{
 for(const change of [{file_bytes:11},{file_hash_sha256:'b'.repeat(64)},{jurisdiction_id:'other'},{jurisdiction_id:'',jurisdiction_name:'Norwood'}])assert.equal(check(source,profile,[{...row,...change}]).status,'catalog_identity_conflict');
 assert.equal(check(source,profile,[row,{...row,id:'r2'}]).status,'duplicate_or_conflicting_catalog_rows');
});
test('uncertain upload or catalog receipt takes priority over a matching row',()=>{
 for(const state of [{catalog_state:{status:'create_uncertain'}},{archive_state:{status:'upload_uncertain'}}])assert.equal(check(source,{...profile,documents:[{id:'d',url:source.official_url,...state}]},[row]).status,'receipt_reconciliation_required');
});
test('exact retained redirect can find record; unrelated same-name jurisdiction cannot',()=>{
 assert.equal(check(source,profile,[{...row,official_url:source.final_url}]).status,'existing_exact_catalog_identity');
 assert.equal(check(source,profile,[{...row,jurisdiction_id:'other',file_hash_sha256:'b'.repeat(64)}]).status,'not_registered');
 assert.throws(()=>check(source,{...profile,state:'KY'},[]),/identity/);
});

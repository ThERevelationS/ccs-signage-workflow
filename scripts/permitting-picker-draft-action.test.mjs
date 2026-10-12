import test from 'node:test';
import assert from 'node:assert/strict';
import {requireReviewedRepositoryProfile as validate,runPickerDraftAction as run} from '../src/components/permitting/pickerDraftAction.mjs';
test('duplicate confirmations share one creation and apply one confirmed record',async()=>{
 const pending={current:null},applied=[];let release,calls=0;
 const options={pending,isCurrent:()=>true,create:()=>{calls++;return new Promise(resolve=>release=resolve);},apply:row=>applied.push(row)};
 const first=run(options);assert.equal((await run(options)).status,'skipped');assert.equal(calls,1);
 release({record:{id:'draft'}});assert.equal((await first).status,'applied');assert.deepEqual(applied,[{id:'draft'}]);assert.equal(pending.current,null);
});
test('late confirmed creation after account, address or closed-view invalidation cannot apply',async()=>{
 for(const reason of ['account','address','closed']){
  const pending={current:null},applied=[];let current=true,release;
  const action=run({pending,isCurrent:()=>current,create:()=>new Promise(resolve=>release=resolve),apply:row=>applied.push(row)});
  current=false;release({record:{id:reason}});assert.equal((await action).status,'stale');assert.deepEqual(applied,[]);assert.equal(pending.current,null);
 }
});
test('failed or unconfirmed creation cannot apply and releases the click guard',async()=>{
 for(const create of [async()=>{throw Error('rejected');},async()=>({record:{}})]){
  const pending={current:null},applied=[];await assert.rejects(run({pending,isCurrent:()=>true,create,apply:row=>applied.push(row)}));assert.deepEqual(applied,[]);assert.equal(pending.current,null);
 }
});

test('source refresh holds duplicate guard and invalidated refresh cannot create',async()=>{
 const pending={current:null};let release,current=true,calls=0;
 const options={pending,isCurrent:()=>current,prepare:()=>new Promise(resolve=>release=resolve),create:async()=>{calls++;return {record:{id:'draft'}};},apply:()=>assert.fail('stale apply')};
 const first=run(options);assert.equal((await run(options)).status,'skipped');current=false;release({});assert.equal((await first).status,'stale');assert.equal(calls,0);assert.equal(pending.current,null);
});
test('reviewed source rejects deletion, duplicate IDs, duplicate identity and changed source before creation',()=>{
 const reviewed={id:'oh',name:'Fixture',state:'OH',type:'city',parent_county:'A',contact:'old'};
 const options={reviewed,hasDuplicate:rows=>rows.some(row=>row.id==='duplicate'),toDraft:row=>({name:row.name,contact:row.contact})};
 assert.deepEqual(validate({...options,rows:[{...reviewed}]}),{name:'Fixture',contact:'old'});
 for(const rows of [[],[reviewed,reviewed],[reviewed,{...reviewed,id:'duplicate'}],...['name','state','type','parent_county','contact'].map(key=>[{...reviewed,[key]:'changed'}])])assert.throws(()=>validate({...options,rows}),/review it again/);
});
test('failed source refresh cannot create and releases the guard for retry',async()=>{
 const pending={current:null};let calls=0;
 await assert.rejects(run({pending,isCurrent:()=>true,prepare:async()=>{throw Error('read failed');},create:()=>{calls++;},apply:()=>{}}),/read failed/);
 assert.equal(calls,0);assert.equal(pending.current,null);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {runPickerDraftAction as run} from '../src/components/permitting/pickerDraftAction.mjs';
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

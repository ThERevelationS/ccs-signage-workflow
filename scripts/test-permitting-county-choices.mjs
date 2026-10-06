import assert from 'node:assert/strict';
import {readAllCountyChoices} from '../src/components/permitting/permittingCountyChoices.mjs';
let calls=0;
const values=await readAllCountyChoices(async cursor=>{calls++;const n=Number(cursor||0);return {items:Array.from({length:500},(_,i)=>`County ${n*500+i}`),has_more:n<2,next_cursor:String(n+1)};});
assert.equal(values.length,1500);assert.equal(calls,3);
assert.deepEqual(await readAllCountyChoices(async()=>({items:[' B ','A','A',''],has_more:false})),['A','B']);
await assert.rejects(readAllCountyChoices(async()=>({items:[],has_more:true,next_cursor:'same'})),/advance/);
let current=true;await assert.rejects(readAllCountyChoices(async()=>{current=false;return {items:[],has_more:false};},()=>current),/superseded/);
console.log('County choices passed: 1500 values without cap, dedupe/blanks, stuck-cursor rejection and stale-read cancellation. No live calls.');

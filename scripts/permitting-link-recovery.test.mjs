import test from 'node:test';
import assert from 'node:assert/strict';
import {scanOfficialPermittingPages} from '../base44/shared/permittingDiscoveryScan.mjs';
const seed='https://county.gov/forms/';
const index='https://county.gov/forms/index/';
const cursor=()=>({method:'official-page-frontier-v1',seed_url:seed,max_depth:2,visited_urls:[seed,index],pending_pages:[{url:'https://county.gov/fees/',depth:1}],gaps:[{url:index,reason:'page_link_limit',depth:1,requires_review:true}],attempted_pages_total:2});
const html=Array.from({length:240},(_,i)=>`<a href="/forms/application-${i}/">Application ${i}</a>`).join('')+'<a href="/forms/sign/">Sign Application</a>';
test('legacy capped index drains across requests without resetting unrelated progress',async()=>{
 let state=cursor(); const urls=new Set();
 for(let i=0;i<3;i++){
  const r=await scanOfficialPermittingPages({seedUrl:seed,resume:state,maxPages:1,recoverLinkLimits:true,fetchPage:async url=>{assert.equal(url,index);return {html,finalUrl:index};}});
  r.documents.forEach(d=>urls.add(d.url));state=r.continuation_state;
  assert.ok(state.visited_urls.includes(seed));assert.ok(state.pending_pages.some(p=>p.url==='https://county.gov/fees/'));
 }
 assert.equal(urls.size,242); // index + 240 applications + sign
 assert.equal(state.gaps.filter(g=>g.reason==='page_link_limit').length,0);
 assert.equal(state.attempted_pages_total,5);
});
test('failure preserves offset and does not consume pending work',async()=>{
 const before=cursor();before.gaps[0].link_offset=100;
 const r=await scanOfficialPermittingPages({seedUrl:seed,resume:before,maxPages:3,recoverLinkLimits:true,fetchPage:async()=>{throw Error('temporary failure');}});
 assert.deepEqual(r.continuation_state.gaps,before.gaps);assert.deepEqual(r.pending_pages,before.pending_pages);
 assert.equal(r.attempted_pages,1);
});
test('invalid offset fails before network and completed recovery is a no-op',async()=>{
 let reads=0;const c=cursor();c.gaps[0].link_offset=-1;
 await assert.rejects(scanOfficialPermittingPages({seedUrl:seed,resume:c,recoverLinkLimits:true,fetchPage:async()=>{reads++;}}));assert.equal(reads,0);
 c.gaps=[];const r=await scanOfficialPermittingPages({seedUrl:seed,resume:c,recoverLinkLimits:true,fetchPage:async()=>{reads++;}});assert.equal(reads,0);assert.deepEqual(r.pending_pages,c.pending_pages);
});

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
 const before=cursor();before.gaps[0].link_offset=100;before.gaps[0].link_hash_method='ordered-resource-list-v1';
 const r=await scanOfficialPermittingPages({seedUrl:seed,resume:before,maxPages:3,recoverLinkLimits:true,fetchPage:async()=>{throw Error('temporary failure');}});
 assert.deepEqual(r.continuation_state.gaps,before.gaps);assert.deepEqual(r.pending_pages,before.pending_pages);
 assert.equal(r.attempted_pages,1);
});
test('invalid offset fails before network and completed recovery is a no-op',async()=>{
 let reads=0;const c=cursor();c.gaps[0].link_offset=-1;c.gaps[0].link_hash_method='ordered-resource-list-v1';
 await assert.rejects(scanOfficialPermittingPages({seedUrl:seed,resume:c,recoverLinkLimits:true,fetchPage:async()=>{reads++;}}));assert.equal(reads,0);
 c.gaps=[];const r=await scanOfficialPermittingPages({seedUrl:seed,resume:c,recoverLinkLimits:true,fetchPage:async()=>{reads++;}});assert.equal(reads,0);assert.deepEqual(r.pending_pages,c.pending_pages);
});


test('changed page cannot silently skip links using an old offset',async()=>{
 const first=await scanOfficialPermittingPages({seedUrl:seed,resume:cursor(),maxPages:1,recoverLinkLimits:true,fetchPage:async()=>({html,finalUrl:index})});
 const second=await scanOfficialPermittingPages({seedUrl:seed,resume:first.continuation_state,maxPages:1,recoverLinkLimits:true,fetchPage:async()=>({html:html+'<a href="/sign-new/">Sign new</a>',finalUrl:index})});
 assert.deepEqual(second.gaps,first.gaps);assert.equal(second.documents.length,0);assert.equal(second.pages[0].status,'failed');
});

test('changing unrelated page markup does not block resource pagination',async()=>{
 const first=await scanOfficialPermittingPages({seedUrl:seed,resume:cursor(),maxPages:1,recoverLinkLimits:true,fetchPage:async()=>({html,finalUrl:index})});
 const second=await scanOfficialPermittingPages({seedUrl:seed,resume:first.continuation_state,maxPages:1,recoverLinkLimits:true,fetchPage:async()=>({html:html+'<p>dynamic nonce</p>',finalUrl:index})});
 assert.equal(second.pages[0].status,'scanned');assert.equal(second.gaps.find(g=>g.reason==='page_link_limit').link_offset,200);
});


test('failed-page recovery preserves unrelated pending work and clears only successful gap', async()=>{
 const c=cursor();c.gaps=[{url:index,reason:'page_fetch_failed',depth:1,detail:'timeout',requires_review:true}];
 const r=await scanOfficialPermittingPages({seedUrl:seed,resume:c,maxPages:1,recoverFetchFailures:true,fetchPage:async url=>{assert.equal(url,index);return {html:'<a href="/sign/form/">Sign form</a>',finalUrl:index};}});
 assert.equal(r.gaps.length,0);assert.ok(r.pending_pages.some(p=>p.url===c.pending_pages[0].url));
 assert.ok(r.pending_pages.some(p=>p.url==='https://county.gov/sign/form/'&&p.depth===2));
 assert.equal(r.llm_calls,0);assert.equal(r.continuation_state.attempted_pages_total,3);
});

test('failed retry retains gap and attempts once without consuming pending work',async()=>{
 const c=cursor();c.gaps=[{url:index,reason:'page_fetch_failed',depth:1,requires_review:true}];
 const r=await scanOfficialPermittingPages({seedUrl:seed,resume:c,recoverFetchFailures:true,fetchPage:async()=>{throw Error('timeout');}});
 assert.deepEqual(r.gaps,c.gaps);assert.deepEqual(r.pending_pages,c.pending_pages);assert.equal(r.attempted_pages,1);
});

test('PDF recovery clears fetch gap while legacy unknown depth stays conservative',async()=>{
 const c=cursor();c.gaps=[{url:index,reason:'page_fetch_failed',requires_review:true}];
 const r=await scanOfficialPermittingPages({seedUrl:seed,resume:c,recoverFetchFailures:true,fetchPage:async()=>({resource_kind:'pdf',classification_method:'http-mime-signature-v1',finalUrl:index})});
 assert.equal(r.gaps.length,0);assert.equal(r.pages[0].depth,2);assert.equal(r.pages[0].status,'classified_pdf');
});

test('recovery modes cannot combine or run without saved state',async()=>{
 let reads=0;const fetchPage=async()=>{reads++;};
 await assert.rejects(scanOfficialPermittingPages({seedUrl:seed,resume:cursor(),recoverFetchFailures:true,recoverLinkLimits:true,fetchPage}));
 await assert.rejects(scanOfficialPermittingPages({seedUrl:seed,recoverFetchFailures:true,fetchPage}));assert.equal(reads,0);
});


test('selected depth recovery fetches one saved gap and leaves children as gaps without consuming pending work',async()=>{
 const c=cursor();c.gaps=[{url:index,reason:'depth_frontier',requires_review:true},{url:'https://county.gov/other/',reason:'depth_frontier',requires_review:true}];
 const r=await scanOfficialPermittingPages({seedUrl:seed,resume:c,recoverDepthUrl:index,fetchPage:async url=>{assert.equal(url,index);return {html:'<a href="/sign.pdf">Sign Application</a><a href="/sign/detail/">Sign details</a>',finalUrl:index};}});
 assert.equal(r.attempted_pages,1);assert.equal(r.pages[0].depth,2);assert.deepEqual(r.pending_pages,c.pending_pages);
 assert.ok(!r.gaps.some(g=>g.url===index));assert.ok(r.gaps.some(g=>g.url==='https://county.gov/other/'));
 assert.ok(r.gaps.some(g=>g.url==='https://county.gov/sign/detail/'&&g.reason==='depth_frontier'));assert.equal(r.llm_calls,0);
 assert.ok(r.documents.some(d=>d.url==='https://county.gov/sign.pdf'));
});

test('selected depth failure preserves its gap and foreign or unsaved selections never fetch',async()=>{
 const c=cursor();c.gaps=[{url:index,reason:'depth_frontier',requires_review:true}];let reads=0;
 const fetchPage=async()=>{reads++;throw Error('timeout');};
 for(const url of ['https://foreign.gov/form/','https://county.gov/unsaved/']) await assert.rejects(scanOfficialPermittingPages({seedUrl:seed,resume:c,recoverDepthUrl:url,fetchPage}));
 assert.equal(reads,0);
 const r=await scanOfficialPermittingPages({seedUrl:seed,resume:c,recoverDepthUrl:index,fetchPage});assert.deepEqual(r.gaps,c.gaps);assert.equal(reads,1);
});

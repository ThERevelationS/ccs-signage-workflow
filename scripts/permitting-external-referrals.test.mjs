import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {discoverOfficialPermittingReferrals,discoverOfficialPermittingResources} from '../base44/shared/jurisdictionPermittingLinkDiscovery.mjs';
import {scanOfficialPermittingPages} from '../base44/shared/permittingDiscoveryScan.mjs';
import {continueKnownDiscovery} from '../base44/shared/permittingDiscoveryContinuation.mjs';
const seed='https://city.gov/forms';
const html='<a href="https://cdn.example/files/sign-form.pdf">Sign Application</a>'+
 '<a href="https://codelibrary.amlegal.com/codes/woodlawn/latest/overview">Woodlawn Zoning Code</a>'+
 '<a href="https://eztrak.cagis.org/CitizenAccess/Default.aspx">Apply Using CAGIS EZtrak</a>'+
 '<a href="https://provider.example/inspection">Electrical inspections</a>'+
 '<a href="/sign.pdf">Local Sign Application</a>';
const sha=text=>createHash('sha256').update(text).digest('hex');
test('documents, publishers, portals and departments have exact source-page provenance',()=>{
 const rows=discoverOfficialPermittingReferrals(html,seed);assert.equal(rows.length,4);
 assert.deepEqual(new Set(rows.map(r=>r.referral_kind)),new Set(['downloadable_document','code_publisher','online_form','department_reference']));
 for(const row of rows){assert.equal(row.source_page_url,seed);assert.equal(row.fetch_scope_approved,false);assert.equal(row.authority_established,false);assert.equal(row.verification_status,'needs_verification');assert.equal(row.provenance_method,'official-page-external-link-v1');}
 assert(discoverOfficialPermittingResources(html,seed).every(row=>row.url.startsWith('https://city.gov/')));
});
test('external base injection, private destinations, credentials, scripts and unrelated links are excluded',()=>{
 const markup='<base href="https://evil.example/"><a href="https://user:secret@cdn.example/sign.pdf">Sign</a>'+
 '<a href="https://127.0.0.1/sign.pdf">Sign</a><a href="https://[::1]/sign.pdf">Sign</a>'+
 '<a href="https://intranet.local/sign.pdf">Sign</a><a href="https://cdn.example:8443/sign.pdf">Sign</a>'+
 '<a href="javascript:alert(1)">Sign Form</a><a href="https://social.example">Follow us</a>'+
 '<script><a href="https://fake.example/sign.pdf">Sign</a></script>'+
 '<a href="https://cdn.example/signup">Sign Up</a><a href="/relative/sign.pdf">Sign</a>';
 assert.deepEqual(discoverOfficialPermittingReferrals(markup,seed),[]);
});
test('cross-host embedded document and online form references are inventoried without fetching',()=>{
 const rows=discoverOfficialPermittingReferrals('<object data="https://cdn.example/sign.pdf" title="Sign form"></object>'+
 '<embed src="https://cdn.example/sign.pdf#page=2" title="Sign form">'+
 '<iframe src="https://portal.example/apply" title="Online permit form"></iframe>'+
 '<a href="https://portal.example/apply">Online permit form</a>',seed);
 assert.equal(rows.length,2);assert.equal(rows[0].discovery_element,'object');
 assert.equal(rows.find(r=>r.referral_kind==='online_form').discovery_element,'anchor');
 const iframe=discoverOfficialPermittingReferrals('<iframe src="https://portal.example/apply" title="Online permit form"></iframe>',seed);
 assert.equal(iframe[0].discovery_element,'iframe');
});
test('scanner saves referrals atomically with frontier but never puts them in download candidates',async()=>{
 const fetched=[];const scan=await scanOfficialPermittingPages({seedUrl:seed,maxPages:1,fetchPage:async url=>{fetched.push(url);return{html,finalUrl:url};}});
 assert.deepEqual(fetched,[seed]);assert.equal(scan.external_requests_scheduled,0);assert.equal(scan.external_referrals.length,4);
 assert(scan.documents.every(d=>d.url.startsWith('https://city.gov/')));
 assert(scan.pending_pages.every(p=>p.url.startsWith('https://city.gov/')));
 assert.equal(scan.external_referrals_require_review,true);assert.equal(scan.jurisdiction_coverage_complete,false);
 assert.equal(scan.external_referrals[0].source_page_sha256,sha(html));
 assert.deepEqual(scan.continuation_state.external_referrals,scan.external_referrals);
});
test('resume keeps separate official-page provenance for duplicate destinations',async()=>{
 const first=await scanOfficialPermittingPages({seedUrl:seed,maxPages:1,fetchPage:async url=>({html:html+'<a href="/electrical">Electrical</a>',finalUrl:url})});
 const next=await scanOfficialPermittingPages({seedUrl:seed,resume:first.continuation_state,maxPages:1,fetchPage:async url=>({html:'<a href="https://provider.example/inspection">Electrical inspections</a>',finalUrl:url})});
 assert.equal(next.external_referrals.length,5);
 assert.equal(next.external_referrals.filter(r=>r.url==='https://provider.example/inspection').length,2);
 assert.equal(first.continuation_state.external_referrals.length,4);
});
test('legacy cursors continue without inventing referrals and changed official source fails closed',async()=>{
 const first=await scanOfficialPermittingPages({seedUrl:seed,maxPages:1,fetchPage:async url=>({html:'<a href="/electrical">Electrical</a>',finalUrl:url})});
 delete first.continuation_state.external_referrals;
 const next=await scanOfficialPermittingPages({seedUrl:seed,resume:first.continuation_state,fetchPage:async url=>({html,finalUrl:url})});
 assert.equal(next.external_referrals.length,4);
 await assert.rejects(scanOfficialPermittingPages({seedUrl:'https://other.gov/forms',resume:next.continuation_state,fetchPage:async()=>{throw Error('Unexpected fetch');}}),/frontier requires review/);
});
test('tampered referral identities and authority flags stop resume before network work',async()=>{
 const first=await scanOfficialPermittingPages({seedUrl:seed,maxPages:1,fetchPage:async url=>({html:html+'<a href="/electrical">Electrical</a>',finalUrl:url})});
 for(const patch of [{source_page_url:'https://other.gov/forms'},{url:'https://changed.example/sign.pdf'},{fetch_scope_approved:true},{source_page_sha256:'bad'},{referral_kind:'approved_provider'}]){
  const cursor=structuredClone(first.continuation_state);Object.assign(cursor.external_referrals[0],patch);
  let calls=0;await assert.rejects(scanOfficialPermittingPages({seedUrl:seed,resume:cursor,fetchPage:async()=>{calls++;return{html};}}),/review|another official source/);assert.equal(calls,0);
 }
});
test('failed source read preserves earlier referrals and their fingerprints',async()=>{
 const first=await scanOfficialPermittingPages({seedUrl:seed,maxPages:1,fetchPage:async url=>({html:html+'<a href="/electrical">Electrical</a>',finalUrl:url})});
 const next=await scanOfficialPermittingPages({seedUrl:seed,resume:first.continuation_state,fetchPage:async()=>{throw Error('Unavailable');}});
 assert.deepEqual(next.external_referrals,first.external_referrals);assert.equal(next.gaps.length,1);
});
test('guarded continuation persists referrals without editing unrelated documents or requirements',async()=>{
 const first=await scanOfficialPermittingPages({seedUrl:seed,maxPages:1,fetchPage:async url=>({html:'<a href="/electrical">Electrical</a>',finalUrl:url})});
 let row={id:'fixture',state:'OH',permitting_url:seed,website_url:'https://city.gov',updated_date:'v1',documents:[],permit_requirements:{keep:true},discovery_scan_state:first.continuation_state},writes=0;
 const entity={get:async()=>structuredClone(row),updateMany:async(q,p)=>{assert.equal(q.updated_date,'v1');writes++;row={...row,...p.$set,updated_date:'v2'};return{updated:1};}};
 const result=await continueKnownDiscovery({entity,jurisdictionId:'fixture',invalidateProfile:(p,next)=>next,fetchPage:async url=>({html,finalUrl:url})});
 assert.equal(writes,1);assert.equal(result.external_referrals,4);assert.equal(result.external_requests_scheduled,0);
 assert.equal(row.discovery_scan_state.external_referrals.length,4);assert.deepEqual(row.permit_requirements,{keep:true});
 assert(row.documents.every(d=>d.url.startsWith('https://city.gov/')));
});
test('retained Ohio official pages replay through the shared referral scanner',async()=>{
 const sources=[
 ['docs/official-evidence/ohio-sharonville-2026-10-07/building-zoning.html','https://www.sharonville.org/123/Building-Zoning-and-Planning'],
 ['docs/official-evidence/ohio-harrison-symmes-townships-2026-10-07/symmes-zoning.html','https://symmestownship.org/243/Zoning-Resolution'],
 ['docs/official-evidence/ohio-electrical-discovery-2026-10-06/publisher-review/permit-center.html','https://www.cincinnati-oh.gov/buildings/about-buildings-inspections/permit-center/']
 ];
 let total=0;
 for(const [path,url] of sources){
  const markup=readFileSync(path,'utf8'),scan=await scanOfficialPermittingPages({seedUrl:url,maxPages:1,fetchPage:async link=>{assert.equal(link,url);return{html:markup,finalUrl:link};}});
  assert.equal(scan.external_requests_scheduled,0);assert.equal(scan.authority_established,false);
  for(const row of scan.external_referrals){assert.equal(row.source_page_sha256,sha(markup));assert.equal(row.source_page_url,url);assert.equal(row.fetch_scope_approved,false);}
  total+=scan.external_referrals.length;
 }
 assert(total>0);
});

test('reread page replaces removed referrals while preserving unchanged link recovery offsets',async()=>{
 const links=Array.from({length:105},(_,i)=>'<a href="/application-'+i+'">Building Application '+i+'</a>').join('');
 const first=await scanOfficialPermittingPages({seedUrl:seed,maxPages:1,fetchPage:async url=>({html:links+'<a href="https://old.example/sign.pdf">Sign form</a>',finalUrl:url})});
 assert(first.gaps.some(g=>g.reason==='page_link_limit'));
 const next=await scanOfficialPermittingPages({seedUrl:seed,resume:first.continuation_state,recoverLinkLimits:true,maxPages:1,fetchPage:async url=>({html:links+'<a href="https://new.example/sign.pdf">Sign form</a>',finalUrl:url})});
 assert.equal(next.external_referrals.length,1);assert.equal(next.external_referrals[0].url,'https://new.example/sign.pdf');
 assert.equal(next.pages[0].recovered_link_offset,100);
});
test('oversized referral inventory raises review rather than silently dropping external links',async()=>{
 const markup=Array.from({length:5001},(_,i)=>'<a href="https://cdn.example/sign-'+i+'.pdf">Sign application</a>').join('');
 let calls=0;await assert.rejects(scanOfficialPermittingPages({seedUrl:seed,fetchPage:async()=>{calls++;return{html:markup,finalUrl:seed};}}),error=>error.frontier_review_required===true && /storage bounds/.test(error.message));
 assert.equal(calls,1);
});

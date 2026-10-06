import test from 'node:test';
import assert from 'node:assert/strict';
import { scanOfficialPermittingPages, combineResearchAndDiscoveredDocuments } from '../base44/shared/permittingDiscoveryScan.mjs';
const scan = (map, options = {}) => scanOfficialPermittingPages({ seedUrl: 'https://county.gov/permits', fetchPage: async url => {
  if (!(url in map)) throw Error('missing page'); return { html: map[url], finalUrl: url };
}, ...options });

test('linked city department pages produce missing forms and fees; cycles never refetch', async () => {
  const r = await scan({
    'https://county.gov/permits': '<a href="/building/forms">Building Forms</a>',
    'https://county.gov/building/forms': '<a href="/sign.pdf">Sign Application</a><a href="/fees">Fee Schedule</a><a href="/permits">Permits</a>',
    'https://county.gov/fees': '<a href="/fees.pdf">Permit Fees</a>',
  });
  assert.equal(r.attempted_pages, 3);
  assert(r.documents.some(d => d.url.endsWith('/sign.pdf') && d.discovery_page_url.endsWith('/building/forms')));
  assert(r.documents.some(d => d.url.endsWith('/fees.pdf')));
  assert.equal(r.traversal_complete, true); assert.equal(r.jurisdiction_coverage_complete, false);
  assert.equal(r.authority_established, false); assert.equal(r.llm_calls, 0);
});
test('request budget returns continuation pages instead of claiming full traversal', async () => {
  const r = await scan({ 'https://county.gov/permits': '<a href="/forms">Permit Forms</a>' }, { maxPages: 1 });
  assert.deepEqual(r.pending_pages, [{url:'https://county.gov/forms',depth:1}]);
  assert.equal(r.traversal_complete, false);
});
test('county Revize base URL and file links are discovered without fetching files', async () => {
  const r = await scan({ 'https://county.gov/permits': '<base href="https://county.gov/"><a href="Zoning/sign_application.pdf">Sign Application</a>' });
  assert(r.documents.some(d=>d.url==='https://county.gov/Zoning/sign_application.pdf'));
  assert.equal(r.attempted_pages, 1);
});
test('online forms stay linked; failure on linked page does not discard discoveries', async () => {
  const r = await scan({ 'https://county.gov/permits': '<a href="/apply?permit=sign">Apply for Sign Permit</a><a href="/sign.pdf">Sign Form</a>' });
  assert.equal(r.success,true); assert.equal(r.traversal_complete,false);
  assert(r.documents.some(d=>d.url.includes('/apply?')));
  assert(r.gaps.some(g=>g.reason==='page_fetch_failed'));
});
test('external and credential links are excluded; off-host redirects cannot contribute forms', async () => {
  const r = await scanOfficialPermittingPages({seedUrl:'https://county.gov/permits',fetchPage:async()=>({html:'<a href="/sign.pdf">Sign Form</a>',finalUrl:'https://evil.test/forms'})});
  assert.equal(r.success,false); assert.equal(r.documents.length,0); assert.equal(r.gaps.length,1);
});
test('depth frontier is reported; aliases and fragments dedupe resources', async () => {
  const r = await scan({'https://county.gov/permits':'<a href="https://www.county.gov/forms#one">Forms</a><a href="/forms#two">Forms</a>'},{maxDepth:0});
  assert.equal(r.gaps.length,1); assert.equal(r.gaps[0].reason,'depth_frontier'); assert.equal(r.documents.length,2);
});
test('partial AI list cannot suppress harvested forms and its metadata survives duplicates', () => {
  const ai={url:'https://county.gov/sign.pdf',title:'AI title',ai_summary:'retained suggestion'};
  const rows=combineResearchAndDiscoveredDocuments([ai],[{url:'https://www.county.gov/sign.pdf#p1',title:'Duplicate'},{url:'https://county.gov/fees.pdf',source:'official_page_harvest'}]);
  assert.equal(rows.length,2); assert.equal(rows[0],ai); assert.equal(rows[1].source,'official_page_harvest');
});
test('oversized per-page discovery and invalid request sizes cannot imply complete coverage', async () => {
  const html=Array.from({length:105},(_,i)=>`<a href="/sign-${i}.pdf">Sign Form ${i}</a>`).join('');
  const r=await scan({'https://county.gov/permits':html});
  assert(r.gaps.some(g=>g.reason==='page_link_limit'));assert.equal(r.traversal_complete,false);
  await assert.rejects(scan({}, {maxPages:0}),/request size/);
});

test('sign application pages are followed before generic department navigation', async () => {
  const fetched=[];
  const r=await scanOfficialPermittingPages({seedUrl:'https://county.gov/permits',maxPages:2,fetchPage:async url=>{
    fetched.push(url);return {html:url.endsWith('/permits')?'<a href="/building">Building Department</a><a href="/sign-forms">Sign Forms</a>':'<a href="/sign.pdf">Sign Application</a>',finalUrl:url};
  }});
  assert.deepEqual(fetched,['https://county.gov/permits','https://county.gov/sign-forms']);
  assert(r.documents.some(d=>d.url.endsWith('/sign.pdf')));assert.equal(r.traversal_complete,false);
});

test('saved frontier ranks destination labels without inherited forms-directory bias', async () => {
  const seed = 'https://county.gov/forms/';
  const generic = 'https://county.gov/forms/department-information/';
  const fee = 'https://county.gov/forms/permit-costs/';
  const sign = 'https://county.gov/forms/sign/';
  const seen = [];
  const result = await scanOfficialPermittingPages({seedUrl:seed,maxPages:2,
    resume:{method:'official-page-frontier-v1',seed_url:seed,max_depth:2,visited_urls:[seed],
      pending_pages:[{url:generic,depth:1},{url:fee,depth:1},{url:sign,depth:1}],gaps:[],attempted_pages_total:1},
    existingDocuments:[{url:generic,title:'Department information'},{url:fee,title:'Permit costs'},{url:sign,title:'Sign application'}],
    fetchPage:async url => {seen.push(url);return {html:'<p>Official resource</p>',finalUrl:url};}});
  assert.deepEqual(seen,[sign,fee]);
  assert.deepEqual(result.pending_pages,[{url:generic,depth:1}]);
  assert.equal(result.continuation_state.attempted_pages_total,3);
});

test('electrical-only department link is followed to inspection checklist without AI or authority promotion', async () => {
 const r=await scan({'https://county.gov/permits':'<a href="/trade">Electrical</a>',
  'https://county.gov/trade':'<a href="/booking">Inspections</a>',
  'https://county.gov/booking':'<a href="/rough.pdf">Electrical inspection checklist</a>'});
 assert.equal(r.attempted_pages,3);assert(r.documents.some(d=>d.url==='https://county.gov/rough.pdf'));
 assert.equal(r.authority_established,false);assert.equal(r.jurisdiction_coverage_complete,false);assert.equal(r.llm_calls,0);
});

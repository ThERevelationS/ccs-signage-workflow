import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import ts from 'typescript';
import { assessOfficialQueueIdentity, assertOfficialProfileResearchIdentity,
  assertResearchSourceIdentity, assertPageSourceIdentity } from '../base44/shared/permittingSourceIdentity.mjs';
import { geographicCandidates, geographicCandidateMetadata } from '../base44/shared/permittingGeographicCandidates.mjs';
import { classifyBacklogRows } from '../base44/shared/permittingResearchBacklog.mjs';
import { scanOfficialPermittingPages } from '../base44/shared/permittingDiscoveryScan.mjs';
import { continueKnownDiscovery } from '../base44/shared/permittingDiscoveryContinuation.mjs';

test('backend candidate data exactly matches retained official inventory and source bytes', () => {
  const bytes = fs.readFileSync('src/components/permitting/officialGeographicInventory.json');
  const reference = JSON.parse(bytes);
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), geographicCandidateMetadata.source_inventory_sha256);
  assert.deepEqual(geographicCandidates, reference.rows.filter(r => r.category === 'candidate')
    .map(r => [r.state, r.type, r.name, r.county_name || '', r.key]));
  assert.equal(geographicCandidates.length, 2848);
});
test('Portland OH village cannot dispatch or reconcile even with matching contaminated research', () => {
  const row = { id:'q', state:'OH', jurisdiction_type:'village', jurisdiction_name:'Portland', parent_county_name:'Meigs County' };
  const profile = { id:'p', name:'Portland', state:'OH', type:'village', parent_county:{name:'Meigs County'}, website_url:'https://www.portland.gov' };
  const r = classifyBacklogRows({queueRows:[row], profiles:[profile], geographicGate:assessOfficialQueueIdentity});
  assert.equal(r.dispatch.length, 0);
  assert.equal(r.reconcile.length, 0);
  assert.equal(r.identity_review.length, 1);
  assert.equal(r.identity_review[0].authority_verified, false);
});
test('official township identity requires its county; Lebanon city is not the township', () => {
  const row = {state:'OH', jurisdiction_type:'township', jurisdiction_name:'Lebanon Township', parent_county_name:'Meigs County'};
  const r = assessOfficialQueueIdentity(row);
  assert.deepEqual(r.candidate_keys, ['OH:county_subdivision:3910542336']);
  assert(r.eligible);
  assert(!assessOfficialQueueIdentity({...row,parent_county_name:'Warren County'}).eligible);
  assert(!assessOfficialQueueIdentity({...row,parent_county_name:''}).eligible);
  const city = assessOfficialQueueIdentity({...row,jurisdiction_type:'city',jurisdiction_name:'Lebanon',parent_county_name:'Warren County'});
  assert(city.eligible);
  assert.equal(city.county_relationship_verified, false);
  assert.notDeepEqual(city.candidate_keys, r.candidate_keys);
});
test('unsupported, fictional and malformed identities are held without throwing or guessing', () => {
  for (const row of [
    {state:'OH',jurisdiction_type:'village',jurisdiction_name:'Imaginary Place'},
    {state:'OR',jurisdiction_type:'city',jurisdiction_name:'Portland'},
    {state:'OH',jurisdiction_type:'[',jurisdiction_name:'Cincinnati'},
    {state:'OH',jurisdiction_type:'planning_unit',jurisdiction_name:'Cincinnati'},
  ]) assert.equal(assessOfficialQueueIdentity(row).eligible, false);
  assert.throws(()=>assertOfficialProfileResearchIdentity({name:'Portland',state:'OH',type:'village'}), {code:'JURISDICTION_IDENTITY_REVIEW_REQUIRED'});
  assert.doesNotThrow(()=>assertOfficialProfileResearchIdentity({name:'Example',state:'NC',type:'city'}));
});
test('official research gate preserves Ohio-first order and does not mutate rows', () => {
  const rows = [
    {id:'ky',state:'KY',jurisdiction_type:'city',jurisdiction_name:'Florence'},
    {id:'oh',state:'OH',jurisdiction_type:'city',jurisdiction_name:'Cincinnati'},
  ];
  const before = JSON.stringify(rows);
  const result = classifyBacklogRows({queueRows:rows,geographicGate:assessOfficialQueueIdentity});
  assert.deepEqual(result.dispatch.map(row=>row.id), ['oh','ky']);
  assert.equal(JSON.stringify(rows), before);
});
test('explicit same-name foreign-state AI summary fails closed before retention', () => {
  for (const [name, summary] of [
    ['Portland','The City of Portland, Oregon, requires sign permits.'],
    ['Springfield','Springfield, Massachusetts requires a permit.'],
    ['Meigs County','Meigs County, Tennessee publishes these forms.'],
  ]) assert.throws(()=>assertResearchSourceIdentity({name,state:'OH'},{ai_summary:summary}),
    {code:'SOURCE_IDENTITY_REVIEW_REQUIRED',status:409,frontier_review_required:true});
  assert.doesNotThrow(()=>assertResearchSourceIdentity({name:'Springfield',state:'OH'},{ai_summary:'The City of Springfield, Ohio, publishes forms.'}));
});
test('body citations, provider contacts and ambiguous text are not authority/identity conclusions', () => {
  const profile = {name:'Springfield',state:'OH'};
  assert.doesNotThrow(()=>assertPageSourceIdentity(profile,
    '<title>Sign forms</title><p>Compare the City of Springfield, Massachusetts.</p>'));
  assert.doesNotThrow(()=>assertResearchSourceIdentity(profile,
    {ai_summary:'Research remains incomplete.',contact_info:{address:'Springfield, Massachusetts'}}));
  assert.doesNotThrow(()=>assertPageSourceIdentity(profile,'<h1>Springfield forms</h1>'));
});
test('title, heading and footer branding detect a full-state conflict despite HTML formatting', () => {
  for (const html of [
    '<title>The City of Springfield, Massachusetts - Official</title>',
    '<h1>Springfield, Massachusetts</h1>',
    '<footer>Copyright <span>City of Springfield</span>&#44; Massachusetts</footer>',
  ]) assert.throws(()=>assertPageSourceIdentity({name:'Springfield',state:'OH'},html),
    {code:'SOURCE_IDENTITY_REVIEW_REQUIRED'});
});
test('scanner rethrows identity review rather than swallowing it as a retryable fetch gap', async () => {
  await assert.rejects(scanOfficialPermittingPages({
    jurisdiction:{name:'Springfield',state:'OH'},seedUrl:'https://city.example/forms',
    fetchPage:async()=>({html:'<footer>City of Springfield, Massachusetts</footer><a href="/bad.pdf">Form</a>'}),
  }), {code:'SOURCE_IDENTITY_REVIEW_REQUIRED'});
});
async function continuationFixture(summary = '') {
  const seed = 'https://city.example/forms';
  const scan = await scanOfficialPermittingPages({seedUrl:seed,maxPages:1,
    fetchPage:async()=>({html:'<a href="/signs">Sign forms</a>'})});
  let row = {id:'p',name:'Springfield',state:'OH',type:'city',auto_refresh:true,
    permitting_url:seed,updated_date:'v1',ai_summary:summary,
    documents:[{id:'manual',url:'https://city.example/manual.pdf',source:'manual',last_fetched:'2020'}],
    discovery_scan_state:scan.continuation_state};
  let fetches=0;
  const original=structuredClone(row);
  const entity={get:async()=>structuredClone(row),updateMany:async(q,p)=>{
    assert.equal(q.updated_date,row.updated_date);
    row={...row,...p.$set,updated_date:'v2'};return{updated:1};
  }};
  const run=()=>continueKnownDiscovery({entity,jurisdictionId:'p',invalidateProfile:()=>{throw Error('No document write allowed');},
    fetchPage:async()=>{fetches++;return{html:'<footer>City of Springfield, Massachusetts</footer>'};}});
  return{original,run,row:()=>row,fetches:()=>fetches};
}
test('continuation quarantines branding conflict while preserving documents and saved frontier', async () => {
  const f=await continuationFixture();const r=await f.run();
  assert.equal(r.status,'frontier_review_required');
  assert.equal(f.fetches(),1);
  assert.equal(f.row().discovery_scan_state.blocked,true);
  assert.deepEqual(f.row().documents,f.original.documents);
  assert.deepEqual(f.row().discovery_scan_state.pending_pages,f.original.discovery_scan_state.pending_pages);
  assert.equal(f.row().permitting_url,f.original.permitting_url);
});
test('saved contradictory research blocks continuation before any network request', async () => {
  const f=await continuationFixture('The City of Springfield, Massachusetts requires permits.');
  assert.equal((await f.run()).status,'frontier_review_required');
  assert.equal(f.fetches(),0);
  assert.deepEqual(f.row().documents,f.original.documents);
});
test('research agent rejects synthetic wrong-state result rather than returning source candidates', async () => {
  const source=fs.readFileSync('base44/functions/jurisdictionResearchAgent/entry.ts','utf8')
    .replace(/^import .*;\r?\n/gm,'');
  const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
  let handler;
  const sdk={auth:{me:async()=>({role:'admin'})},asServiceRole:{integrations:{Core:{
    InvokeLLM:async()=>({ai_summary:'The City of Springfield, Massachusetts requires permits.',documents:[{url:'https://wrong.example/form.pdf'}]}),
  }}}};
  new Function('Deno','createClientFromRequest','normalizePermittingResearchInput','sanitizeJurisdictionResearch',
    'officeResearchPrompt','officeResearchResponseSchema','normalizeOfficeResearch','attachScanReporter','assertResearchSourceIdentity','hasInternalFunctionCapability',compiled)(
    {serve:fn=>{handler=fn;}},()=>sdk,body=>body,x=>x,()=>'',{},x=>x,()=>{},assertResearchSourceIdentity,()=>false);
  const response=await handler(new Request('https://synthetic.test',{method:'POST',body:JSON.stringify({
    jurisdictionName:'Springfield',jurisdictionState:'OH',jurisdictionType:'city',includeParentCounty:false,
  })}));
  assert.equal(response.status,409);
  const result=await response.json();
  assert.equal(result.code,'SOURCE_IDENTITY_REVIEW_REQUIRED');
  assert.equal(result.data,undefined);
});
test('production entry points wire geographic gate and retain fail-closed source errors', () => {
  const dispatcher=fs.readFileSync('base44/functions/permittingResearchBacklogDispatch/entry.ts','utf8');
  assert.match(dispatcher,/geographicGate: assessOfficialQueueIdentity/);
  assert.match(dispatcher,/sourceIdentityReviews\.push/);
  assert.match(dispatcher,/identity_review_count: identityReviews\.length/);
  const refresh=fs.readFileSync('base44/functions/refreshJurisdiction/entry.ts','utf8');
  assert.match(refresh,/if \(automatic\) assertOfficialProfileResearchIdentity\(jurisdiction\)/);
  assert.match(refresh,/discoveryOnly \|\| error\?\.code === 'SOURCE_IDENTITY_REVIEW_REQUIRED'/);
  assert(refresh.indexOf('assertResearchSourceIdentity(jurisdiction,researchData)') <
    refresh.indexOf("detail:'AI returned source candidates"));
});

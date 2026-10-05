import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {build} from 'esbuild';
import {fetchHtmlSnapshot,projectHtmlText} from '../base44/shared/permittingHtmlEvidence.mjs';
import {reviewOfficeAuthority,assessOfficeAuthorityReview,listOfficeAuthorityReviews,getOfficeAuthorityRequest} from '../base44/shared/permittingOfficeAuthority.mjs';
import {htmlOfficeDelegationContext} from '../base44/shared/permittingHtmlOfficeDelegation.mjs';
const clone=v=>structuredClone(v);
const officeUrl='https://county.example/department?structureid=37',alias='County Planning, Zoning & Building Department';
const html='<html><body><nav><a href="'+officeUrl+'">Navigation</a></nav><main><h1>Zoning Department</h1><p>The City of Town Zoning Department is now being managed and reviewed by County Planning, Zoning &amp; Building Department. Please click <a href="'+officeUrl+'">here</a> to be directed to their website.</p></main></body></html>';
function match(row,q){return Object.entries(q).every(([k,v])=>v && typeof v==='object'?
 (!Object.hasOwn(v,'$lte') || row[k]<=v.$lte) && (!Object.hasOwn(v,'$lt') || row[k]<v.$lt):row[k]===v);}
async function setup({createMode='ok',retained=html}={}){
 const profile={id:'town',name:'Town',state:'KY',type:'city',website_url:'https://city.example/',permitting_url:'https://city.example/zoning',
  updated_date:'p1',documents:[{id:'manual',archive_pinned:true}],notes:'Preserve staff notes'};
 const office={id:'catalog',government_office_id:'office',government_office:{name:'County Planning, Zoning and Building Inspection',state:'KY',
  verification_status:'staff_verified',verified_by:'Reviewer',verified_at:'2026-10-04T18:00:00Z',source_url:officeUrl}};
 const counts={fetch:0,creates:0,writes:0},events=[];let current=retained,failFetch=false,version=1,beforeWrite,late;
 const fetchImpl=async()=>{counts.fetch++;if(failFetch)throw Error('Official source unavailable');return new Response(current,{headers:{'content-type':'text/html; charset=utf-8'}});};
 const snapshot=await fetchHtmlSnapshot({profile,officialUrl:profile.permitting_url,fetchImpl});counts.fetch=0;
 const row={...snapshot,id:'html',jurisdiction_id:profile.id,jurisdiction_name:profile.name,profile_snapshot:Object.fromEntries(
  ['id','name','state','type','website_url','permitting_url'].map(k=>[k,profile[k]])),title:'Official city zoning page',requested_by:'Admin',
  verification_status:'retained_unreviewed'};
 const profileEntity={get:async id=>{assert.equal(id,profile.id);return clone(profile);},updateMany:async(q,p)=>{
  if(beforeWrite){const fn=beforeWrite;beforeWrite=null;await fn();}
  if(q.updated_date!==profile.updated_date)return{updated:0};
  Object.assign(profile,clone(p.$set),{updated_date:'p'+(++version)});counts.writes++;return{updated:1};}};
 const htmlEntity={get:async id=>{assert.equal(id,row.id);return clone(row);}};
 const settingsEntity={filter:async()=>[{setting_value:{items:[clone(office)]}}]};
 const reviewEntity={get:async id=>clone(events.find(e=>e.id===id)),filter:async(q,sort,limit,skip=0)=>{
  assert.equal(typeof sort,'string');assert.equal(Number.isInteger(limit),true);const rows=events.filter(e=>match(e,q));
  if(sort==='-sequence')rows.sort((a,b)=>b.sequence-a.sequence);return clone(rows.slice(skip,skip+limit));},
  create:async e=>{counts.creates++;late=clone(e);if(createMode==='missing')throw Error('Unknown create');
   const saved={...clone(e),id:'review'+events.length};events.push(saved);if(createMode==='lost')throw Error('Lost acknowledgement');return clone(saved);}};
 const deps={profileEntity,htmlEntity,settingsEntity,reviewEntity,fetchImpl};
 const input={evidence_kind:'official_html',html_evidence_id:'html',government_office_id:'office',office_alias:alias,role:'zoning',
  coverage_area:'Town',responsibility_confirmed:true,role_proof:{block:2,excerpt:row.blocks[1].text},review_notes:'Confirmed the explicit city zoning management delegation and direct verified office link.'};
 const args={jurisdictionId:profile.id,input,requestId:'office-html-review-00001',expectedUpdatedDate:profile.updated_date,actor:'Admin'};
 return{profile,office,row,counts,events,deps,input,args,review:extra=>reviewOfficeAuthority(deps,{...args,...extra}),
  setCurrent:value=>{current=value;},failFetch:()=>{failFetch=true;},beforeWrite:fn=>{beforeWrite=fn;},lateCreate:()=>events.push({...clone(late),id:'late'})};
}
test('native preview separates publishing city from delegated office and preserves immutable source without writes',async()=>{
 const f=await setup(),r=await f.review({dryRun:true});assert.equal(r.proposal.publisher_snapshot.name,'Town');
 assert.equal(r.proposal.office_snapshot.name,f.office.government_office.name);assert.equal(r.proposal.office_link_proof.url,officeUrl);
 assert.equal(r.proposal.role_proof.block,2);assert.equal(r.proposal.role_proof.physical_page,undefined);
 assert.equal(r.proposal.regulatory_authority_established,false);assert.equal(r.proposal.address_authority_resolved,false);
 assert.equal(f.counts.creates,0);assert.equal(f.counts.writes,0);assert.equal(f.counts.fetch,1);assert.equal(f.row.verification_status,'retained_unreviewed');
});
test('save uses the existing committed immutable review ledger, assessment and read-only request lookup',async()=>{
 const f=await setup(),before=clone(f.profile.documents),r=await f.review();assert.equal(r.status,'recorded');assert.equal(f.events.length,1);
 assert.equal(f.profile.office_authority_review_state.committed_sequence,1);assert.deepEqual(f.profile.documents,before);
 assert.equal(f.profile.notes,'Preserve staff notes');assert.equal((await listOfficeAuthorityReviews(f.deps,{jurisdictionId:'town'})).items[0].verified,true);
 assert.equal((await getOfficeAuthorityRequest(f.deps,{jurisdictionId:'town',requestId:f.args.requestId})).committed,true);
});
test('department-name keywords cannot expand zoning delegation to other roles, counties, cities or PDF proof',async()=>{
 for(const patch of [{role:'building'},{role:'electrical'},{coverage_area:'Other Town'},{source_document_id:'pdf'},
  {role_proof:{block:2,physical_page:1,excerpt:'Invented'}},{responsibility_confirmed:false},{office_alias:'Invented Office'},{evidence_kind:'invented'}]){
  const f=await setup();await assert.rejects(f.review({dryRun:true,input:{...f.input,...patch}}));assert.equal(f.counts.creates,0);
 }
 for(const patch of [{type:'county'},{name:'Other Town'},{state:'OH'},{website_url:'https://other.example'}]){
  const f=await setup();Object.assign(f.profile,patch);await assert.rejects(f.review({dryRun:true}));assert.equal(f.counts.creates,0);
 }
});
test('literal quotes and correct native blocks are required, including the direct-link text',async()=>{
 for(const proof of [{block:1,excerpt:'Zoning Department manages permits'},{block:2,excerpt:'Town zoning is run by the county department.'},
  {block:2,excerpt:'The City of Town Zoning Department is now being managed and reviewed by '+alias+'.'}]){
  const f=await setup();await assert.rejects(f.review({dryRun:true,input:{...f.input,role_proof:proof}}));assert.equal(f.counts.fetch,0);
 }
});
test('an unrelated, hidden, relative, ambiguous or separately quoted link cannot identify the responsible office',async()=>{
 for(const retained of [html.replace('href="'+officeUrl+'">here','href="https://other.example/">here'),
  html.replace('href="'+officeUrl+'">here','hidden href="'+officeUrl+'">here'),
  html.replace('href="'+officeUrl+'">here','href="/department">here'),
  html.replace('</a> to','</a><a href="'+officeUrl+'">here</a> to'),
  html.replace('Please click <a href="'+officeUrl+'">here</a> to be directed to their website.','Please click here to be directed to their website.</p><p><a href="'+officeUrl+'">here</a>')]){
  const f=await setup({retained});await assert.rejects(f.review({dryRun:true}));assert.equal(f.counts.fetch,0);
 }
});
test('changed current text or office href removes verification while retaining source and review history',async()=>{
 for(const update of [html.replace('managed and reviewed','historically managed and reviewed'),html.replace('href="'+officeUrl+'">here','href="https://other.example/">here')]){
  const f=await setup();const r=await f.review(),event=clone(r.review),source=clone(f.row);f.setCurrent(update);
  const a=await assessOfficeAuthorityReview(f.deps,r.review,f.profile);assert.equal(a.verified,false);assert.equal(a.state,'needs_review');
  assert.deepEqual(f.events[0],event);assert.deepEqual(f.row,source);
 }
});
test('network failure removes current verification as unavailable rather than retaining success',async()=>{
 const f=await setup(),r=await f.review();f.failFetch();const a=await assessOfficeAuthorityReview(f.deps,r.review,f.profile);
 assert.equal(a.verified,false);assert.equal(a.state,'verification_unavailable');
});
test('volatile raw markup with identical projected text and identity link does not masquerade as changed responsibility',async()=>{
 const f=await setup(),r=await f.review();f.setCurrent(html.replace('<body>','<body data-request="new-nonce">'));
 assert.equal((await assessOfficeAuthorityReview(f.deps,r.review,f.profile)).verified,true);
});
test('new or uncertain retained version and altered office identity withdraw verification',async()=>{
 for(const change of [f=>{f.profile.html_evidence_state={official_url:f.row.official_url,status:'complete',html_evidence_id:'new-version'};},
  f=>{f.profile.html_evidence_state={official_url:f.row.official_url,status:'uncertain',html_evidence_id:'html'};},
  f=>{f.office.government_office.verification_status='needs_verification';},f=>{f.office.government_office.state='OH';},
  f=>{f.row.raw_html_base64=Buffer.from(html+'changed').toString('base64');}]){
  const f=await setup(),r=await f.review();change(f);assert.equal((await assessOfficeAuthorityReview(f.deps,r.review,f.profile)).verified,false);
 }
});
test('changed source before reservation has a known no-create outcome and is safe to preview again',async()=>{
 const f=await setup();f.setCurrent(html.replace('managed','previously managed'));const r=await f.review();
 assert.equal(r.status,'not_recorded');assert.equal(r.retry_safe,true);assert.equal(f.counts.creates,0);assert.equal(f.counts.writes,0);
});
test('source change after reservation releases only this reservation without creating an event',async()=>{
 const f=await setup();f.beforeWrite(()=>f.setCurrent(html.replace('managed','previously managed')));const r=await f.review();
 assert.equal(r.status,'not_recorded');assert.equal(r.retry_safe,true);assert.equal(f.counts.creates,0);
 assert.equal(f.profile.office_authority_review_state.status,'not_recorded');
});
test('stale review preserves concurrent profile edits and does not create or fetch',async()=>{
 const f=await setup();f.profile.updated_date='concurrent';f.profile.notes='Concurrent staff note';
 await assert.rejects(f.review(),/changed/);assert.equal(f.counts.creates,0);assert.equal(f.counts.fetch,0);assert.equal(f.profile.notes,'Concurrent staff note');
});
test('lost acknowledgements and same-request replay converge without repeated create or fetch',async()=>{
 const f=await setup({createMode:'lost'});const r=await f.review(),fetches=f.counts.fetch;assert.equal(r.status,'recorded');
 assert.equal((await f.review()).replayed,true);assert.equal(f.counts.creates,1);assert.equal(f.counts.fetch,fetches);
});
test('unknown creates are never repeated; delayed persistence reconciles the original event only',async()=>{
 const f=await setup({createMode:'missing'});assert.equal((await f.review()).status,'review_uncertain');
 assert.equal((await f.review()).status,'review_uncertain');assert.equal(f.counts.creates,1);
 f.lateCreate();assert.equal((await f.review()).status,'recorded');assert.equal(f.counts.creates,1);
});
test('revocation appends immutable history and does not fetch or alter the retained source',async()=>{
 const f=await setup(),r=await f.review(),before=clone(r.review),source=clone(f.row),fetches=f.counts.fetch;
 const revoke=await f.review({action:'revoke',requestId:'office-html-revoke-00001',expectedUpdatedDate:f.profile.updated_date,
  input:{revoke_review_id:r.review.id,review_notes:'Staff withdrew this delegation pending confirmation.'}});
 assert.equal(revoke.status,'recorded');assert.equal(f.events.length,2);assert.deepEqual(f.events[0],before);assert.deepEqual(f.row,source);
 assert.equal(f.counts.fetch,fetches);const list=await listOfficeAuthorityReviews(f.deps,{jurisdictionId:'town'});
 assert.equal(list.items[0].state,'revoked');assert.equal(list.items[1].state,'historical');
});
test('tampered stored role, publisher or link proof cannot be treated as a verified relationship',async()=>{
 const f=await setup(),r=await f.review();
 for(const patch of [{role:'building'},{publisher_snapshot:{name:'Other'}},{office_link_proof:{url:'https://other.example'}}])
  assert.equal((await assessOfficeAuthorityReview(f.deps,{...clone(r.review),...patch},f.profile)).verified,false);
});
test('HTML context exposes only the publishing canonical target and verified same-state office options',async()=>{
 const f=await setup();const c=await htmlOfficeDelegationContext(f.deps,'html');assert.equal(c.targets.length,1);assert.equal(c.targets[0].id,'town');
 assert.equal(c.offices[0].id,'office');assert.equal(c.publisher.name,'Town');assert.equal(f.counts.fetch,0);assert.equal(f.counts.writes,0);
});
test('retained Alexandria fixture has one native delegation link in block 7 without changing existing text projection',async()=>{
 const html=await readFile('docs/official-evidence/alexandria-zoning-2026-10-04.html','utf8');
 const old=projectHtmlText(html),p=projectHtmlText(html,{includeLinks:true});assert.deepEqual(p.blocks,old.blocks);assert.equal(p.text,old.text);
 assert.deepEqual(p.links.filter(l=>l.block===7),[{block:7,text:'here',url:'https://campbellcountyky.gov/department/index.php?structureid=37'}]);
});
test('schema retains immutable review RLS while adding native HTML evidence fields',async()=>{
 const s=JSON.parse(await readFile('base44/entities/PermittingOfficeAuthorityReview.jsonc','utf8'));
 assert.equal(s.rls.update,false);assert.equal(s.rls.delete,false);assert.equal(s.rls.create.user_condition.role,'admin');
 assert.equal(s.properties.html_evidence_id.type,'string');assert.equal(s.properties.publisher_snapshot.type,'object');
});
let handler;
const bundled=await build({entryPoints:['base44/functions/permittingOfficeAuthorityReview/entry.ts'],write:false,bundle:true,format:'esm',platform:'neutral',
 plugins:[{name:'mock-sdk',setup(b){b.onResolve({filter:/^npm:@base44\/sdk/},()=>({path:'sdk',namespace:'mock'}));
 b.onLoad({filter:/.*/,namespace:'mock'},()=>({contents:'export const createClientFromRequest=()=>globalThis.htmlOfficeWorker;',loader:'js'}));}}]});
globalThis.Deno={serve:fn=>{handler=fn;}};
await import('data:text/javascript;base64,'+Buffer.from(bundled.outputFiles[0].text).toString('base64'));
test('compiled HTML review handler authorizes writes before service access and reads context without fetch/write',async()=>{
 for(const role of [null,'user']){
  let service=0;globalThis.htmlOfficeWorker={auth:{me:async()=>role?{role,email:'Admin'}:null},get asServiceRole(){service++;throw Error('Unexpected service access');}};
  const r=await handler(new Request('https://app.example',{method:'POST',body:JSON.stringify({action:'verify',review:{evidence_kind:'official_html'}})}));
  assert.equal(r.status,403);assert.equal(service,0);
 }
 const f=await setup();globalThis.htmlOfficeWorker={auth:{me:async()=>({role:'user',email:'Admin'})},
  asServiceRole:{entities:{JurisdictionProfile:f.deps.profileEntity,GlobalSettings:f.deps.settingsEntity,PermittingHtmlEvidence:f.deps.htmlEntity}}};
 const r=await handler(new Request('https://app.example',{method:'POST',body:JSON.stringify({action:'context',evidence_kind:'official_html',html_evidence_id:'html'})}));
 assert.equal(r.status,200);assert.equal((await r.json()).publisher.id,'town');assert.equal(f.counts.fetch,0);assert.equal(f.counts.writes,0);
});

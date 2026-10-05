import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {build} from 'esbuild';
import {projectHtmlText,fetchHtmlSnapshot,retainHtmlEvidence,validateHtmlEvidence,readHtmlEvidence,getHtmlEvidenceRequest,HTML_MAX_BYTES,authorizedHtmlUrl} from '../base44/shared/permittingHtmlEvidence.mjs';
import {evidenceEqual} from '../base44/shared/permittingRuleEvidence.mjs';
const clone=v=>structuredClone(v);
const html='<!doctype html><html><head><title>Ignore title</title><style>.hide{display:none}</style></head><body><nav>Navigation</nav><main><h1>Pilot Zoning Department</h1><p>Serving Town &amp; unincorporated Pilot.</p><p>Applications are reviewed by Pilot Planning Department.</p><script>Invented sign laws</script><div hidden>Hidden law</div><p aria-hidden="true">Hidden role</p><p style="display:none">Hidden fee</p><div><p>Nested visible content.</p></div></main></body></html>';
function matches(row,q){return Object.entries(q).every(([k,v])=>v && typeof v==='object'?(v.$gt?row[k]>v.$gt:v.$in?.includes(row[k])):row[k]===v);}
function setup({createMode='ok',role='admin'}={}){
 const profile={id:'profile',name:'Town',state:'KY',type:'city',website_url:'https://gov.example',permitting_url:'https://gov.example/zoning',
  updated_date:'p1',documents:[{id:'keep',source:'manual',archive_pinned:true}],office_authority_review_state:{status:'complete',review_id:'keep-authority'}};
 const rows=[],calls={fetch:0,create:0,writes:0,service:0},other={};let version=1,lostReceipt=false,afterFetch,beforeWrite,late,fetchFailure;
 const profileEntity={get:async id=>{assert.equal(id,profile.id);return clone(profile);},
  filter:async()=>[clone(profile)],updateMany:async(q,patch)=>{
   if(beforeWrite){const fn=beforeWrite;beforeWrite=null;await fn();}
   if(profile.updated_date!==q.updated_date)return{updated:0};
   Object.assign(profile,clone(patch.$set),{updated_date:'p'+(++version)});calls.writes++;
   if(lostReceipt){lostReceipt=false;throw Error('Lost receipt acknowledgement');}return{updated:1};
  }};
 const htmlEntity={get:async id=>clone(rows.find(r=>r.id===id)),filter:async(q,sort,limit,skip=0)=>clone(rows.filter(r=>matches(r,q)).sort((a,b)=>a.id.localeCompare(b.id)).slice(skip,skip+limit)),
  create:async row=>{calls.create++;late=clone(row);if(createMode==='missing')throw Error('Uncertain create');
   const saved={...clone(row),id:'html'+rows.length};rows.push(saved);if(createMode==='lost')throw Error('Lost create acknowledgement');return clone(saved);}};
 const fetchImpl=async()=>{calls.fetch++;if(fetchFailure)throw Error('Network unavailable');if(afterFetch){const fn=afterFetch;afterFetch=null;await fn();}
  return new Response(html,{headers:{'content-type':'text/html; charset=utf-8'}});};
 const deps={profileEntity,htmlEntity,fetchImpl};
 const args={jurisdictionId:'profile',officialUrl:'https://gov.example/zoning',title:'Official department service page',
  requestId:'html-capture-request-00001',expectedUpdatedDate:'p1',officialSourceConfirmed:true,actor:'admin@example.test'};
 return{profile,rows,calls,other,deps,args,retain:extra=>retainHtmlEvidence(deps,{...args,...extra}),
  loseReceipt:()=>{lostReceipt=true;},afterFetch:fn=>{afterFetch=fn;},beforeWrite:fn=>{beforeWrite=fn;},
  lateCreate:()=>rows.push({...clone(late),id:'late'}),failFetch:()=>{fetchFailure=true;}};
}
let handler;
const built=await build({entryPoints:['base44/functions/permittingHtmlEvidence/entry.ts'],bundle:true,write:false,format:'esm',platform:'neutral',
 plugins:[{name:'mock-sdk',setup(b){b.onResolve({filter:/^npm:@base44\/sdk/},()=>({path:'sdk',namespace:'mock'}));
 b.onLoad({filter:/.*/,namespace:'mock'},()=>({contents:'export const createClientFromRequest=()=>globalThis.htmlEvidenceFixture;',loader:'js'}));}}]});
globalThis.Deno={serve:fn=>{handler=fn;}};
await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text).toString('base64'));
function routeFixture(role='admin'){
 const f=setup({role}),entities={JurisdictionProfile:f.deps.profileEntity,PermittingHtmlEvidence:f.deps.htmlEntity};
 globalThis.htmlEvidenceFixture={auth:{me:async()=>role===null?null:{role,email:f.args.actor}},entities,
  get asServiceRole(){f.calls.service++;return{entities};}};
 const call=async body=>{const response=await handler(new Request('https://app.example',{method:'POST',body:JSON.stringify(body)}));
  return{status:response.status,data:await response.json()};};
 return{...f,call};
}
test('static HTML projection preserves literal entities and excludes scripts, navigation and explicit hidden text',()=>{
 const p=projectHtmlText(html);assert.equal(p.text,'Pilot Zoning Department\nServing Town & unincorporated Pilot.\nApplications are reviewed by Pilot Planning Department.\nNested visible content.');
 assert.equal(p.blocks.length,4);assert.equal(p.text.includes('law'),false);
 assert.equal(projectHtmlText('<html><body><p>Town &#65; &#x42; &unknown; <span title="x > y">C</span></p></body></html>').text,'Town A B &unknown; C');
});
test('script strings and excluded template markup cannot inject projected office claims',()=>{
 const p=projectHtmlText('<html><body><main><script>const x="</main><p>Invented responsible office</p>";</script><template></main><p>Invented coverage</p></template><p>Actual office evidence.</p></main></body></html>');
 assert.equal(p.text,'Actual office evidence.');
 assert.throws(()=>projectHtmlText('<html><body>'+ '<div>'.repeat(201)+'Office'+ '</div>'.repeat(201)+'</body></html>'),/nesting/);
});
test('capture retains all original response bytes including excluded content',async()=>{
 const f=setup();const r=await f.retain();assert.equal(r.status,'retained');const row=f.rows[0];
 assert.equal(Buffer.from(row.raw_html_base64,'base64').toString(),html);assert.equal(row.file_bytes,Buffer.byteLength(html));
 assert.equal(row.verification_status,'retained_unreviewed');assert.equal(row.authority_classification,undefined);
 assert.equal(row.physical_page,undefined);assert.equal(await validateHtmlEvidence(row),row);
});
test('literal HTML citations use native blocks and byte/text hashes; paraphrases fail',async()=>{
 const f=setup();await f.retain();const r=await readHtmlEvidence(f.rows[0],{block:2,excerpt:'Serving Town & unincorporated Pilot.'});
 assert.equal(r.citation.evidence_kind,'official_html');assert.equal(r.citation.physical_page,undefined);
 assert.equal(r.citation.authority_established,false);assert.equal(r.citation.source_sha256,f.rows[0].file_hash_sha256);
 await assert.rejects(readHtmlEvidence(f.rows[0],{block:2,excerpt:'This office serves all cities.'}),/not literal/);
});
test('retained raw bytes, count, static projection, text hash and provenance tampering are rejected',async()=>{
 const f=setup();await f.retain();
 for(const patch of [{raw_html_base64:Buffer.from(html+'changed').toString('base64')},{file_bytes:1},{text:'Changed'},
  {text_sha256:'a'.repeat(64)},{blocks:[{block:1,text:'Invented'}]},{verification_status:'verified'},{requested_by:''},{method:'pdf-page'}]){
  await assert.rejects(validateHtmlEvidence({...clone(f.rows[0]),...patch}));
 }
});
test('same saved request replays without another fetch/create and same-content captures deduplicate',async()=>{
 const f=setup();await f.retain();await f.retain();assert.equal(f.calls.fetch,1);assert.equal(f.calls.create,1);
 await f.retain({requestId:'html-capture-request-00002',expectedUpdatedDate:f.profile.updated_date});
 assert.equal(f.calls.create,1);assert.equal(f.rows.length,1);assert.equal(f.profile.html_evidence_state.html_evidence_id,f.rows[0].id);
});
test('lost create acknowledgement reconciles only the matching immutable evidence',async()=>{
 const f=setup({createMode:'lost'});const r=await f.retain();assert.equal(r.success,true);assert.equal(f.calls.create,1);
 await f.retain();assert.equal(f.calls.create,1);
});
test('missing create acknowledgement blocks all duplicate creates and late persistence resumes safely',async()=>{
 const f=setup({createMode:'missing'});const first=await f.retain();assert.equal(first.status,'save_uncertain');
 assert.equal(f.profile.html_evidence_state.status,'uncertain');
 assert.equal((await f.retain()).status,'save_uncertain');assert.equal(f.calls.fetch,1);assert.equal(f.calls.create,1);
 await assert.rejects(f.retain({requestId:'html-capture-request-00002',expectedUpdatedDate:f.profile.updated_date}),/Reconcile/);
 f.lateCreate();assert.equal((await f.retain()).success,true);assert.equal(f.calls.create,1);
});
test('lost profile receipt acknowledgement is verified without another create',async()=>{
 const f=setup();f.loseReceipt();assert.equal((await f.retain()).success,true);assert.equal(f.calls.create,1);
});
test('two simultaneous captures cannot both create and newer unrelated profile work is preserved',async()=>{
 const f=setup();const docs=clone(f.profile.documents),authority=clone(f.profile.office_authority_review_state);
 const results=await Promise.allSettled([f.retain(),f.retain()]);
 assert.equal(results.filter(r=>r.status==='fulfilled' && r.value.success).length,1);assert.equal(f.calls.create,1);
 assert.deepEqual(f.profile.documents,docs);assert.deepEqual(f.profile.office_authority_review_state,authority);
 const g=setup();g.afterFetch(()=>{g.profile.notes='Concurrent manual note';g.profile.documents.push({id:'concurrent'});g.profile.updated_date='new';});
 await g.retain();assert.equal(g.profile.notes,'Concurrent manual note');assert.equal(g.profile.documents.length,2);
});
test('profile host/identity edits during capture preserve concurrent work and block the create',async()=>{
 const f=setup();f.afterFetch(()=>{f.profile.website_url='https://other.example';f.profile.updated_date='new';});
 await assert.rejects(f.retain());assert.equal(f.calls.create,0);assert.equal(f.profile.website_url,'https://other.example');
});
test('request reuse with another payload or reviewer is rejected',async()=>{
 const f=setup();await f.retain();
 await assert.rejects(f.retain({title:'Different decision'}),/another decision/);
 await assert.rejects(f.retain({actor:'other@example.test'}),/another decision/);
});
test('canonical HTTPS host restriction rejects credentials, private literal hosts, ports and external redirect targets',()=>{
 const f=setup();
 for(const u of ['http://gov.example/zoning','https://gov.example@evil.example/','https://gov.example:444/','https://127.0.0.1/','https://[::1]/','https://localhost/','https://evil.example/']){
  assert.throws(()=>authorizedHtmlUrl(f.profile,u));
 }
 assert.equal(authorizedHtmlUrl(f.profile,'https://www.gov.example/zoning#part'),'https://www.gov.example/zoning');
});
test('fetch rejects PDFs, unsupported encodings, oversized streaming bodies and failed responses',async()=>{
 const f=setup();
 for(const response of [
  new Response('pdf',{headers:{'content-type':'application/pdf'}}),
  new Response(html,{headers:{'content-type':'text/html; charset=iso-8859-1'}}),
  new Response(new Uint8Array(HTML_MAX_BYTES+1),{headers:{'content-type':'text/html'}}),
  new Response('missing',{status:404}),
  new Response(new Uint8Array([0xff]),{headers:{'content-type':'text/html'}})]){
  await assert.rejects(fetchHtmlSnapshot({profile:f.profile,officialUrl:f.args.officialUrl,fetchImpl:async()=>response}));
 }
 assert.equal(f.calls.create,0);
});
test('redirects remain bounded and cannot leave configured official hosts',async()=>{
 const f=setup();let calls=0;
 await assert.rejects(fetchHtmlSnapshot({profile:f.profile,officialUrl:f.args.officialUrl,fetchImpl:async()=>{calls++;return new Response(null,{status:302,headers:{location:'https://evil.example/'}});}}),/official website/);
 assert.equal(calls,1);calls=0;
 await assert.rejects(fetchHtmlSnapshot({profile:f.profile,officialUrl:f.args.officialUrl,fetchImpl:async()=>{calls++;return new Response(null,{status:302,headers:{location:'/loop'}});}}),/redirect chain/);
 assert.equal(calls,4);
});
test('preview hash mismatch and stale target versions produce no save or create',async()=>{
 const f=setup();await assert.rejects(f.retain({expectedTextSha256:'0'.repeat(64)}),/text changed/);
 assert.equal(f.calls.writes,0);assert.equal(f.calls.create,0);
 await assert.rejects(f.retain({expectedUpdatedDate:'stale'}),/Profile changed/);assert.equal(f.calls.create,0);
});
test('native HTML citations remain outside existing PDF authority/rule extraction routes',async()=>{
 const f=setup();await f.retain();
 const {readSourceEvidencePages}=await import('../base44/shared/jurisdictionSourceTextSegments.mjs');
 const {reviewedAdministrativeSource,sourceSupportsRule}=await import('../base44/shared/permittingSourceAuthorityPolicy.mjs');
 await assert.rejects(readSourceEvidencePages({source:f.rows[0]}),/Source text identity/);
 assert.equal(reviewedAdministrativeSource(f.rows[0]),false);assert.equal(sourceSupportsRule(f.rows[0],{}),false);
});
test('handlers reject anonymous and non-admin capture before service-role or network access',async()=>{
 for(const role of [null,'user']){
  const f=routeFixture(role);
  for(const action of ['preview','capture','get_request'])assert.equal((await f.call({action})).status,403);
  assert.equal(f.calls.service,0);assert.equal(f.calls.fetch,0);assert.equal(f.calls.create,0);
 }
});
test('staff read/list/cite/raw handlers respect caller entities and perform no writes/service access',async()=>{
 const f=routeFixture('user');await f.retain();
 for(const action of ['read','cite','raw']){
  const r=await f.call({action,html_evidence_id:f.rows[0].id,block:2,excerpt:'Serving Town & unincorporated Pilot.'});
  assert.equal(r.status,200);assert.equal(r.data.llm_calls,0);
 }
 assert.equal((await f.call({action:'list',jurisdiction_id:'profile'})).status,200);
 assert.equal((await f.call({action:'context',jurisdiction_name:'Town'})).status,200);
 assert.equal(f.calls.service,0);assert.equal(f.calls.create,1);
});
test('handler and receipt read support recorded capture without AI/queue dependencies',async()=>{
 const f=routeFixture();await f.retain();const r=await f.call({action:'get_request',jurisdiction_id:'profile',request_id:f.args.requestId});
 assert.equal(r.data.committed,true);assert.equal(r.data.llm_calls,0);
 const q=await getHtmlEvidenceRequest(f.deps,{jurisdictionId:'profile',requestId:f.args.requestId,actor:f.args.actor});
 assert.equal(q.evidence.id,f.rows[0].id);assert.equal(f.calls.create,1);
});
test('retained Alexandria HTML fixture projects explicit service text without fabricated PDF pages',async()=>{
 const bytes=await readFile('docs/official-evidence/alexandria-zoning-2026-10-04.html'),p=projectHtmlText(new TextDecoder().decode(bytes));
 assert.ok(p.text.includes('The City of Alexandria Zoning Department is now being managed and reviewed by Campbell County Planning, Zoning & Building Department.'));
 assert.ok(p.blocks.some(b=>b.text.includes('The City of Alexandria')));
 assert.ok(p.blocks.every(b=>Number.isInteger(b.block) && !Object.hasOwn(b,'physical_page')));
});

test('missing optional website metadata is preserved and does not break the first capture',async()=>{
 const f=setup();delete f.profile.website_url;await f.retain();assert.equal(f.calls.create,1);assert.equal(f.profile.website_url,undefined);
});
test('a failed fetch before any write is explicitly safe to preview again',async()=>{
 const f=setup();f.failFetch();await assert.rejects(f.retain(),e=>e.retry_safe===true);assert.equal(f.calls.create,0);assert.equal(f.calls.writes,0);
});
test('changed canonical identity blocks uncertain-save reconciliation and preserves the prior reservation',async()=>{
 const f=setup({createMode:'missing'});await f.retain();f.lateCreate();f.profile.name='Changed Town';
 await assert.rejects(f.retain(),/identity changed/);assert.equal(f.calls.create,1);assert.equal(f.profile.html_evidence_state.status,'uncertain');
});
test('retention after a canonical identity edit preserves the old immutable version and creates distinct provenance',async()=>{
 const f=setup();await f.retain();const original=clone(f.rows[0]);f.profile.name='New Town';f.profile.updated_date='new';
 await f.retain({requestId:'html-capture-request-00002',expectedUpdatedDate:'new'});assert.equal(f.rows.length,2);assert.deepEqual(f.rows[0],original);
});
test('the capture handler reports stale preview as not-recorded rather than uncertain',async()=>{
 const f=routeFixture();const r=await f.call({action:'capture',jurisdiction_id:'profile',official_url:f.args.officialUrl,title:f.args.title,
  request_id:f.args.requestId,expected_updated_date:'stale',official_source_confirmed:true});
 assert.equal(r.status,409);assert.equal(r.data.status,'not_recorded');assert.equal(r.data.retry_safe,true);assert.equal(f.calls.create,0);assert.equal(f.calls.writes,0);
});

test('schema preserves immutable evidence RLS and adds only an isolated profile receipt',async()=>{
 const schema=JSON.parse(await readFile('base44/entities/PermittingHtmlEvidence.jsonc','utf8'));
 assert.equal(schema.rls.update,false);assert.equal(schema.rls.delete,false);assert.equal(schema.rls.create.user_condition.role,'admin');
 const profile=JSON.parse(await readFile('base44/entities/JurisdictionProfile.jsonc','utf8'));assert.equal(profile.properties.html_evidence_state.type,'object');
 assert.equal(evidenceEqual(schema.rls.read,{$or:[{user_condition:{role:'admin'}},{user_condition:{role:'user'}}]}),true);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {scanOfficialPermittingPages} from '../base44/shared/permittingDiscoveryScan.mjs';
import {continueOwnedAddressDiscovery,addressResearchCollection} from '../base44/shared/permittingAddressDiscoveryContinuation.mjs';
import {runAddressPageScan} from '../src/components/permitting/addressPageScan.mjs';
const actor={id:'employee',email:'employee@example.com'},seed='https://example.gov/forms';
async function fixture(){
 const first=await scanOfficialPermittingPages({seedUrl:seed,maxPages:1,fetchPage:async()=>({html:'<a href="/permits">Sign permit department</a>',finalUrl:seed})});
 assert.equal(first.pending_pages.length,1);
 let row={id:'c',updated_date:'v1',collection_key:'origin:0',owner_id:actor.id,owner_email:actor.email,reference_only:true,authority_established:false,scan_run_id:'origin',name:'Example',state:'OH',type:'municipality',permitting_url:seed,website_url:seed,auto_refresh:true,location_verified:false,documents:[{id:'old',url:'https://example.gov/old.pdf',file_url:'https://stored.gov/old.pdf',archive_state:{status:'upload_uncertain'}}],discovery_scan_state:first.continuation_state};
 let version=1,calls=0;const origin={id:'origin',owner_id:actor.id,owner_email:actor.email,action_kind:'address',status:'complete'},events=[];
 const patch=data=>{row={...row,...structuredClone(data),updated_date:'v'+(++version)};};
 const entity={get:async()=>structuredClone(row),filter:async()=>[structuredClone(row)],updateMany:async(query,data)=>{assert.equal(query.owner_id,actor.id);assert.equal(query.reference_only,true);assert.equal(query.authority_established,false);if(!Object.entries(query).every(([key,value])=>row[key]===value))return {updated:0};patch(data.$set);return {updated:1};}};
 const options={entity,scanEntity:{get:async()=>structuredClone(origin)},collectionId:'c',actor,onProgress:async event=>events.push(event),fetchPage:async(url,host,port)=>{calls++;assert.equal(url,'https://example.gov/permits');assert.equal(host,'example.gov');assert.equal(port,'');return {html:'<a href="/sign.pdf">Sign permit form</a><a href="https://portal.gov/apply">Apply online for sign permit</a>',finalUrl:url};}};
 return {options,row:()=>row,patch,origin,events,calls:()=>calls};
}
test('one owned page advances durable progress, retains old receipts and adds pending originals',async()=>{
 const f=await fixture(),old=f.row().documents[0],result=await continueOwnedAddressDiscovery(f.options);
 assert.equal(f.calls(),1);assert.equal(result.attempted_pages,1);assert.equal(result.pending_pages,0);assert.equal(result.uploads,0);assert.equal(result.llm_calls,0);assert.equal(result.authority_established,false);
 assert.deepEqual(f.row().documents[0],old);assert.equal(f.row().documents.length,2);assert.equal(f.row().documents[1].url,'https://example.gov/sign.pdf');
 assert.equal(result.collection.discovery.last_pages[0].status,'scanned');assert(f.events.some(event=>event.kind==='page_start'&&event.url==='https://example.gov/permits'));assert(f.events.some(event=>event.kind==='found'));assert.equal(f.row().location_verified,false);
});
test('foreign owner, completed-origin owner mismatch and duplicate collection prevent network requests',async()=>{
 for(const mode of ['owner','origin','duplicate','running']){
  const f=await fixture();if(mode==='owner')f.patch({owner_id:'foreign'});if(mode==='origin')f.origin.owner_id='foreign';if(mode==='running')f.origin.status='running';if(mode==='duplicate')f.options.entity.filter=async()=>[f.row(),{...f.row(),id:'duplicate'}];
  await assert.rejects(continueOwnedAddressDiscovery(f.options));assert.equal(f.calls(),0);
 }
});
test('tampered cursor blocks progress for review before fetching, preserving receipts',async()=>{
 const f=await fixture(),old=structuredClone(f.row().documents);f.patch({discovery_scan_state:{...f.row().discovery_scan_state,pending_pages:[{url:'https://outside.gov/permits',depth:1}]}});
 const result=await continueOwnedAddressDiscovery(f.options);assert.equal(result.success,false);assert.equal(f.calls(),0);assert.equal(f.row().discovery_scan_state.blocked,true);assert.deepEqual(f.row().documents,old);
});
test('failed page is retained as a review gap and does not pretend full coverage',async()=>{
 const f=await fixture();f.options.fetchPage=async()=>{throw Error('HTTP 503');};
 const result=await continueOwnedAddressDiscovery(f.options);assert.equal(result.success,true);assert.equal(result.pages[0].status,'failed');assert.equal(result.collection.discovery.gaps[0].reason,'page_fetch_failed');assert.equal(result.collection.discovery.pending_pages.length,0);assert.equal(result.jurisdiction_coverage_complete,false);
});
test('concurrent file archival cannot be overwritten by page scan persistence',async()=>{
 const f=await fixture(),fetch=f.options.fetchPage;f.options.fetchPage=async(...args)=>{const response=await fetch(...args);f.patch({documents:[{...f.row().documents[0],archive_state:{status:'uploaded',file_url:'https://stored.gov/old.pdf'}}]});return response;};
 await assert.rejects(continueOwnedAddressDiscovery(f.options),/another session/);assert.equal(f.row().documents[0].archive_state.status,'uploaded');assert.equal(f.row().discovery_scan_state.pending_pages.length,1);
});
test('owner or origin changes during page fetch prevent saving and result disclosure',async()=>{
 for(const mode of ['owner','origin']){
  const f=await fixture(),fetch=f.options.fetchPage;f.options.fetchPage=async(...args)=>{const result=await fetch(...args);if(mode==='owner')f.patch({owner_id:'foreign'});else f.origin.owner_id='foreign';return result;};
  await assert.rejects(continueOwnedAddressDiscovery(f.options));assert.equal(f.row().documents.length,1);assert.equal(f.row().discovery_scan_state.pending_pages.length,1);
 }
});
test('lost save acknowledgement reconciles exact durable progress without another page fetch',async()=>{
 const f=await fixture(),write=f.options.entity.updateMany;let writes=0;f.options.entity.updateMany=async(...args)=>{writes++;await write(...args);throw Error('ack lost');};
 const result=await continueOwnedAddressDiscovery(f.options);assert.equal(result.attempted_pages,1);assert.equal(writes,1);assert.equal(f.calls(),1);
});
test('manual continuation works for paused collections and repeated completion does not rescan',async()=>{
 const f=await fixture();f.patch({auto_refresh:false});const result=await continueOwnedAddressDiscovery(f.options);assert.equal(result.attempted_pages,1);assert.equal(result.collection.auto_refresh,false);
 const replay=await continueOwnedAddressDiscovery(f.options);assert.equal(replay.skipped,true);assert.equal(f.calls(),1);
});
test('collection serializer keeps portals out of Save linked original inventory',async()=>{
 const f=await fixture();await continueOwnedAddressDiscovery(f.options);const collection=addressResearchCollection(f.row());assert.equal(collection.external_referrals.length,0);assert.equal(collection.discovery.outside_links.length,1);assert.equal(collection.discovery.outside_links[0].url,'https://portal.gov/apply');
});
test('manual page pass has no overall cap and finishes each page before starting another',async()=>{
 let active=0,max=0;const calls=[],collection={id:'c',discovery:{pending_pages:[{url:'page-0'}]}};let index=0;
 const result=await runAddressPageScan({collection,stopped:()=>false,onProgress:()=>{},scanPage:async()=>{active++;max=Math.max(max,active);calls.push(index++);await Promise.resolve();active--;return {attempted_pages:1,pages:[],collection:{id:'c',discovery:{pending_pages:index<105?[{url:'page-'+index}]:[]}}};}});
 assert.equal(result.checked,105);assert.equal(max,1);assert.equal(calls.length,105);
});
test('stop and lost response never start another manual page request',async()=>{
 let stop=false,calls=0;const collection={id:'c',discovery:{pending_pages:[{url:'page'}]}};
 const result=await runAddressPageScan({collection,stopped:()=>stop,onProgress:()=>{},scanPage:async()=>{calls++;stop=true;return {attempted_pages:1,pages:[],collection};}});
 assert.equal(result.stopped,true);assert.equal(calls,1);
 calls=0;await assert.rejects(runAddressPageScan({collection,stopped:()=>false,onProgress:()=>{},scanPage:async()=>{calls++;throw Error('ack lost');}}),/ack lost/);assert.equal(calls,1);
});

test('collection key changes during fetch cannot reparent discovery progress',async()=>{
 const f=await fixture(),fetch=f.options.fetchPage;f.options.fetchPage=async(...args)=>{const result=await fetch(...args);f.patch({collection_key:'changed-origin:0'});return result;};
 await assert.rejects(continueOwnedAddressDiscovery(f.options),/not available/);assert.equal(f.row().documents.length,1);assert.equal(f.row().discovery_scan_state.pending_pages.length,1);
});

test('new HTTP direct referrals remain outside links rather than queued originals',async()=>{
 const f=await fixture();f.options.fetchPage=async url=>({html:'<a href="http://cdn.gov/sign.pdf">Sign permit application</a>',finalUrl:url});
 const result=await continueOwnedAddressDiscovery(f.options);assert.equal(result.collection.external_referrals.length,0);assert.equal(result.collection.discovery.outside_links.length,1);assert.equal(result.collection.discovery.outside_links[0].url,'http://cdn.gov/sign.pdf');
 assert.equal(f.row().discovery_scan_state.external_referrals[0].referral_kind,'downloadable_document');assert.equal(f.row().discovery_scan_state.external_initial_collection_drained,true);
});

async function failedFixture(){
 const f=await fixture();f.options.fetchPage=async()=>{throw Error('HTTP 503');};await continueOwnedAddressDiscovery(f.options);
 const cursor=f.row().discovery_scan_state;
 f.patch({discovery_scan_state:{...cursor,pending_pages:[{url:'https://example.gov/other',depth:1}]}});
 f.options.retryPageUrl='https://example.gov/permits';return f;
}
test('selected failed-page retry preserves depth, pending frontier and originals',async()=>{
 const f=await failedFixture(),old=structuredClone(f.row().documents),pending=structuredClone(f.row().discovery_scan_state.pending_pages);let calls=0;
 f.options.fetchPage=async url=>{calls++;assert.equal(url,f.options.retryPageUrl);return {html:'<a href="/new-page">Sign permit information</a><a href="/new.pdf">Sign permit form</a>',finalUrl:url};};
 const result=await continueOwnedAddressDiscovery(f.options);assert.equal(calls,1);assert.equal(result.pages[0].depth,1);assert.equal(result.attempted_pages,1);assert.equal(result.collection.discovery.gaps.filter(g=>g.reason==='page_fetch_failed').length,0);
 assert.deepEqual(f.row().documents[0],old[0]);assert.deepEqual(f.row().discovery_scan_state.pending_pages[0],pending[0]);assert.equal(f.row().discovery_scan_state.pending_pages.find(p=>p.url.endsWith('/new-page')).depth,2);
 await assert.rejects(continueOwnedAddressDiscovery(f.options),/changed/);assert.equal(calls,1);
});
test('failed retry keeps selected gap and does not consume pending pages',async()=>{
 const f=await failedFixture(),pending=structuredClone(f.row().discovery_scan_state.pending_pages);const result=await continueOwnedAddressDiscovery(f.options);
 assert.equal(result.pages[0].status,'failed');assert.equal(result.attempted_pages,1);assert.equal(result.collection.discovery.gaps.filter(g=>g.reason==='page_fetch_failed').length,1);assert.deepEqual(f.row().discovery_scan_state.pending_pages,pending);
});
test('retry rejects arbitrary, stale, duplicate and malformed selections without fetching',async()=>{
 for(const mode of ['outside','stale','duplicate','malformed','owner']){
  const f=await failedFixture();let calls=0;f.options.fetchPage=async()=>{calls++;return {html:'',finalUrl:f.options.retryPageUrl};};
  if(mode==='outside')f.options.retryPageUrl='https://outside.gov/permits';
  if(mode==='stale')f.patch({discovery_scan_state:{...f.row().discovery_scan_state,gaps:[]}});
  if(mode==='duplicate')f.patch({discovery_scan_state:{...f.row().discovery_scan_state,gaps:[...f.row().discovery_scan_state.gaps,...f.row().discovery_scan_state.gaps]}});
  if(mode==='malformed')f.options.retryPageUrl={url:'x'};
  if(mode==='owner')f.patch({owner_id:'foreign'});
  await assert.rejects(continueOwnedAddressDiscovery(f.options));assert.equal(calls,0);
 }
});
test('retry cannot overwrite a concurrently saved original receipt',async()=>{
 const f=await failedFixture();f.options.fetchPage=async url=>{f.patch({documents:[{...f.row().documents[0],archive_state:{status:'uploaded'}}]});return {html:'',finalUrl:url};};
 await assert.rejects(continueOwnedAddressDiscovery(f.options),/another session/);assert.equal(f.row().documents[0].archive_state.status,'uploaded');assert.equal(f.row().discovery_scan_state.gaps[0].reason,'page_fetch_failed');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { assessOfficialQueueIdentity } from '../base44/shared/permittingSourceIdentity.mjs';
import { classifyBacklogRows } from '../base44/shared/permittingResearchBacklog.mjs';
import { continueKnownDiscovery } from '../base44/shared/permittingDiscoveryContinuation.mjs';

test('official geographic match does not re-enable or reconcile a held profile', () => {
  const row={id:'q',jurisdiction_name:'Cincinnati',state:'OH',jurisdiction_type:'city',parent_county_name:'Hamilton County'};
  for(const hold of [{auto_refresh:false},{discovery_scan_state:{blocked:true}}]){
    const profile={id:'p',name:'Cincinnati',state:'OH',type:'city',website_url:'https://city.example',...hold};
    const result=classifyBacklogRows({queueRows:[row],profiles:[profile],geographicGate:assessOfficialQueueIdentity});
    assert.equal(result.dispatch.length,0);assert.equal(result.reconcile.length,0);
    assert.equal(result.identity_review[0].reason,'automatic_profile_held_for_review');
  }
});
test('automatic source-identity quarantine also opts out of ordinary archive selection', async () => {
  let row={id:'p',updated_date:'v1',name:'Springfield',state:'OH',type:'city',auto_refresh:true,
    ai_summary:'The City of Springfield, Massachusetts publishes these permits.',
    permitting_url:'https://city.example/forms',documents:[{id:'retained',source:'manual'}],
    discovery_scan_state:{method:'official-page-frontier-v1',pending_pages:[{url:'https://city.example/forms',depth:0}]}};
  const original=structuredClone(row);
  const entity={get:async()=>structuredClone(row),updateMany:async(q,p)=>{
    assert.equal(q.updated_date,'v1');row={...row,...p.$set,updated_date:'v2'};return{updated:1};
  }};
  await continueKnownDiscovery({entity,jurisdictionId:'p',
    fetchPage:()=>{throw Error('No network allowed');},invalidateProfile:()=>{throw Error('No document mutation allowed');}});
  assert.equal(row.auto_refresh,false);
  assert.equal(row.discovery_scan_state.blocked,true);
  assert.equal(row.discovery_scan_state.block_code,'SOURCE_IDENTITY_REVIEW_REQUIRED');
  assert.deepEqual(row.documents,original.documents);
  assert.deepEqual(row.discovery_scan_state.pending_pages,original.discovery_scan_state.pending_pages);
});
test('dispatcher explicitly requests the stricter automatic refresh path', () => {
  const dispatcher=fs.readFileSync('base44/functions/permittingResearchBacklogDispatch/entry.ts','utf8');
  const refresh=fs.readFileSync('base44/functions/refreshJurisdiction/entry.ts','utf8');
  assert.match(dispatcher,/automatic_research: true/);
  assert.match(refresh,/isTargetedAutomation \|\| body\.automatic_research === true/);
  assert.match(refresh,/automatic && \(jurisdiction\.auto_refresh === false \|\| jurisdiction\.discovery_scan_state\?\.blocked\)/);
});

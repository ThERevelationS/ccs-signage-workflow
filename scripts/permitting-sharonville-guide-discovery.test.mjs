import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {discoverOfficialPermittingResources} from '../base44/shared/jurisdictionPermittingLinkDiscovery.mjs';
const page='https://www.sharonville.org/123/Building-Zoning-and-Planning';
const guide='https://www.sharonville.org/DocumentCenter/View/4576/Residential-Permitting-Guide-2026';
test('retained Sharonville department discovers exact permitting guide without authority',()=>{
 const html=readFileSync('docs/official-evidence/ohio-sharonville-2026-10-07/building-zoning.html','utf8');
 const rows=discoverOfficialPermittingResources(html,page).filter(r=>r.url===guide);
 assert.equal(rows.length,1);assert.equal(rows[0].title,'Residential Permitting Guide');
 assert.equal(rows[0].source,'official_page_harvest');assert.equal(rows[0].doc_type,'other');
 assert.equal(rows[0].file_url,undefined);assert.equal(rows[0].authority_verified,undefined);
});
test('permitting wording retains same-host and unsafe URL gates',()=>{
 const html='<a href="/guide">Permitting Guide</a><a href="https://external.example/guide">Permitting Guide</a><a href="javascript:alert(1)">Permitting Guide</a><a href="/unrelated">Picnic Guide</a>';
 const rows=discoverOfficialPermittingResources(html,page);
 assert.deepEqual(rows.map(r=>r.url),['https://www.sharonville.org/guide']);
});

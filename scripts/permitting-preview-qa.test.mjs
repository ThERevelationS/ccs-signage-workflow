import test from 'node:test';
import assert from 'node:assert/strict';
import {isPermittingPreviewHost} from '../src/components/admin/permittingPreviewQa.js';
test('QA fixture available only on development or explicit Base44 preview host',()=>{
 assert.equal(isPermittingPreviewHost('localhost',true),true);
 for(const host of ['preview--clay-flow-signage-suite-387da97c.base44.app','preview-sandbox--68dfcc5e57bbbc35387da97c.base44.app'])
  assert.equal(isPermittingPreviewHost(host),true);
});
test('ordinary production and lookalike domains do not expose QA entry',()=>{
 for(const host of ['clay-flow-signage-suite-387da97c.base44.app','cincisigns.com','localhost','preview--x.base44.app.example.com','example.com','preview--x.base44Xapp'])
  assert.equal(isPermittingPreviewHost(host),false);
});

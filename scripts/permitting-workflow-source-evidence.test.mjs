import test from 'node:test';
import assert from 'node:assert/strict';
import {captureWorkflowSources, matchWorkflowSource, citationSourceId} from '../src/components/permitting/workflowSourceEvidence.mjs';
const hashA='a'.repeat(64), hashB='b'.repeat(64);
const citation={source_document_id:'source',source_sha256:hashA,archived_file_url:'https://example.gov/old.pdf'};
const source={id:'source',jurisdiction_id:'oh',file_hash_sha256:hashA,archived_file_url:citation.archived_file_url,title:'Recorded source'};
test('capture keeps only exactly cited canonical metadata and detaches it from loaded records',()=>{
 const steps=[{citations:[citation,{source_document_id:'other'}]}];
 const captured=captureWorkflowSources(steps,[source,{id:'foreign',jurisdiction_id:'ky'},{id:'other',jurisdiction_id:'ky'}, {...source,id:'unused'}],'oh');
 assert.deepEqual(Object.keys(captured),['source']);assert.deepEqual(captured.source,source);
 source.title='Changed after capture';assert.equal(captured.source.title,'Recorded source');
 assert.deepEqual(captureWorkflowSources(steps,[source,source],'oh'),{});
 assert.deepEqual(captureWorkflowSources(steps,[source],''),{});
 assert.equal(citationSourceId({source_document_id:' source '}),'source');
 assert.equal(citationSourceId({source_document_id:42}),'');
});
test('fingerprints, changed archives and legacy snapshots are distinguished without matching by title',()=>{
 assert.equal(matchWorkflowSource(citation,null,source,'oh').state,'matching');
 assert.equal(matchWorkflowSource(citation,null,{...source,file_hash_sha256:hashB},'oh').state,'different');
 assert.equal(matchWorkflowSource(citation,null,{...source,archived_file_url:'https://example.gov/new.pdf'},'oh').state,'different');
 assert.equal(matchWorkflowSource({source_document_id:'source'},null,source,'oh').state,'unknown');
 assert.equal(matchWorkflowSource({source_document_id:'source'},source,source,'oh').state,'matching');
 assert.equal(matchWorkflowSource({...citation,source_sha256:'bad'},null,source,'oh').state,'different');
 for(const bad of [{...source,id:'other'},{...source,jurisdiction_id:'ky'},null]) assert.throws(()=>matchWorkflowSource(citation,source,bad,'oh'));
 assert.throws(()=>matchWorkflowSource(citation,source,source,''));
 assert.equal(matchWorkflowSource({source_document_id:'source'},{...source,jurisdiction_id:'ky'},source,'oh').state,'unknown');
});


test('citation and captured metadata conflicts stay visible even if one fingerprint matches',()=>{
 const conflicting={...source,file_hash_sha256:hashB,content_status:'current',verification_status:'verified'};
 const result=matchWorkflowSource(citation,conflicting,{...source,content_status:'historical',verification_status:'needs_verification'},'oh');
 assert.equal(result.state,'different');
 assert.deepEqual(result.metadataChanges.map(item=>item.field),['content_status','verification_status']);
 assert.ok(result.changes.some(message=>message.includes('source metadata captured with this draft')));
 assert.equal(matchWorkflowSource(citation,{...source,content_status:'current'},{...source,content_status:'historical'},'oh').state,'matching');
});

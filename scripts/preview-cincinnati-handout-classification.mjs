import {readFileSync,writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
export function previewHandoutClassification(source,manifest){
 const row=manifest.sources.find(s=>s.source_url===source.official_url);
 if(source.id!=='6ac39c0e6657049fb11cd757' || source.jurisdiction_id!=='6ac1a123edda6d8dd942690b' ||
  !source.updated_date || source.authority_classification!=='unknown_review_required' ||
  source.verification_status!=='needs_verification' || source.content_status!=='unknown' ||
  source.authority_review || source.authority_review_state || source.rule_import_state ||
  ![undefined,null,'complete'].includes(source.rule_extraction_state?.status) ||
  !source.title.includes('Signs Informational Handout') ||
  source.file_hash_sha256!=='a535c6728b536e98d2a5cf36e3611fd977da18dd53cebb842b78667c940615fb' ||
  row?.matches_retained_archive!==true || row.sha256!==source.file_hash_sha256 || row.bytes!==282256)
  throw Error('Exact unreviewed source, idle analysis and fresh byte-identical official response are required.');
 return {method:'retained-cincinnati-handout-classification-v1',query:{id:source.id,updated_date:source.updated_date,
   authority_classification:source.authority_classification,file_hash_sha256:source.file_hash_sha256},
  fields:{authority_classification:'administrative_guidance',
   matched_signals:[...new Set([...(source.matched_signals||[]),'retained official signs informational handout; procedural guidance, not adopted code'])],
   classified_at:new Date().toISOString()},
  verification_status_unchanged:'needs_verification',content_status_unchanged:'unknown',authority_verified:false,
  currentness_verified:false,reason:'Retained municipal sign permit/inspection instructions. Current index still links byte-identical May 2017 handout; that does not prove current legal applicability.'};
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href){
 const root='docs/official-evidence/ohio-electrical-discovery-2026-10-06/publisher-review/';
 const proposal=previewHandoutClassification(JSON.parse(readFileSync(root+'source-classification-before.json','utf8')),
  JSON.parse(readFileSync(root+'manifest.json','utf8')));
 writeFileSync(root+'source-classification-proposal.json',JSON.stringify(proposal,null,2)+'\n');
 console.log('Guarded guidance classification prepared; currentness and authority remain unreviewed.');
}

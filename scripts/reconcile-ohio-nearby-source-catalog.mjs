import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
const root='docs/official-evidence/ohio-nearby-offices-2026-10-07/';
export function reconcileRetainedSource(source,profile,catalog){
 if(!profile?.id || profile.name!==source.city || profile.state!=='OH' || profile.type!=='city')throw Error('Locality identity mismatch');
 const urls=new Set([source.official_url,source.request_url,source.final_url].filter(Boolean));
 const rows=catalog.filter(row=>((row.jurisdiction_id===profile.id || (!row.jurisdiction_id && row.jurisdiction_name===profile.name)) && urls.has(row.official_url)) || row.file_hash_sha256===source.sha256);
 const matches=rows.filter(row=>row.jurisdiction_id===profile.id && urls.has(row.official_url) && row.file_hash_sha256===source.sha256 && row.file_bytes===source.bytes);
 const docs=profile.documents.filter(doc=>urls.has(doc.url));
 const uncertain=docs.some(doc=>['creating','create_uncertain'].includes(doc.catalog_state?.status) || ['uploading','upload_uncertain'].includes(doc.archive_state?.status));
 const status=uncertain?'receipt_reconciliation_required':rows.length>1?'duplicate_or_conflicting_catalog_rows':rows.length===1?(matches.length===1?'existing_exact_catalog_identity':'catalog_identity_conflict'):'not_registered';
 return {file:source.file,jurisdiction_id:profile.id,official_url:source.official_url,sha256:source.sha256,bytes:source.bytes,
 status,catalog_candidate_ids:rows.map(row=>row.id),profile_document_ids:docs.map(doc=>doc.id),
 storage_verified:matches.length===1 && Boolean(matches[0].archived_file_url),
 registration_allowed:false,
 next_action:status==='not_registered'?'Verify app-storage archive through existing registration process; fresh identity lookup before create.':status==='existing_exact_catalog_identity'?'Preserve existing record; recheck archive and receipt before linking.':'Reconcile conflict or uncertain receipt; do not repeat upload/create.',
 authority_approved:false};
}
if(process.argv[1]?.endsWith('reconcile-ohio-nearby-source-catalog.mjs')){
 const manifest=JSON.parse(readFileSync(root+'manifest.json'));
 const snapshot=JSON.parse(readFileSync(root+'source-catalog-readback.json'));
 const sources=manifest.sources.filter(s=>!s.file.endsWith('.html'));
 const results=sources.map(source=>{
 const bytes=readFileSync(source.retained_path);
 if(bytes.length!==source.bytes || createHash('sha256').update(bytes).digest('hex')!==source.sha256)throw Error('Archive changed: '+source.file);
 const publicBytes=readFileSync('public/permitting-evidence/ohio-nearby/'+source.file);
 if(!bytes.equals(publicBytes))throw Error('Public archive differs: '+source.file);
 return reconcileRetainedSource(source,snapshot.profiles.find(p=>p.name===source.city),snapshot.catalog);
 });
 const report={observed_at:snapshot.observed_at,read_only:true,live_catalog_records_changed:0,uploads_created:0,
 snapshot_is_not_live_creation_authorization:true,results,
 legacy_catalog_preserved:snapshot.catalog.map(row=>({id:row.id,jurisdiction_id:row.jurisdiction_id,official_url:row.official_url})),
 gaps:['Repository retention is distinct from verified app-storage registration.','Legacy domain, scope and currentness require separate review.','Original DOC/DOCX formats are preserved; PDF-only extraction must not be used for them.']};
 writeFileSync(root+'source-catalog-reconciliation.json',JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({retained_documents:results.length,not_registered:results.filter(r=>r.status==='not_registered').length,legacy_catalog_records_preserved:snapshot.catalog.length,live_writes:0}));
}

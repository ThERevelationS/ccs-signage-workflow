export function previewSharonvilleGuideClassification(source,profile,pages){
 const fail=()=>{throw Error('Exact unreviewed Sharonville guide archive, retained purpose evidence and idle review state are required.');};
 const sha='4086899c8a7bceb4ebc12bc891bc2107729d17616503e4941c60390ed62104d9';
 if(source.id!=='6aced7f49bda8d3e61944a9d'||profile.id!=='6ac19f0e23bd8a65822f6d51'||
 profile.name!=='Sharonville'||profile.state!=='OH'||profile.type!=='city'||profile._manual_documents||
 source.jurisdiction_id!==profile.id||source.jurisdiction_name!==profile.name||!source.updated_date||
 source.authority_classification!=='unknown_review_required'||source.verification_status!=='needs_verification'||
 source.content_status!=='unknown'||source.authority_confidence!=='unverified'||source.authority_review||
 source.authority_review_state||source.rule_import_state||source.rule_extraction_state||source.text_extraction_pinned||
 source.text_extraction_state?.status!=='partial'||source.text_extraction_state.pending_segment||
 source.file_hash_sha256!==sha||source.file_bytes!==11002258)fail();
 const docs=(profile.documents||[]).filter(d=>d.id===source.jurisdiction_profile_doc_id);
 const doc=docs[0];
 if(docs.length!==1||doc.id!=='19bc3643-d404-4bcf-8cde-92c91897fd21'||doc.source==='manual'||doc.pinned||doc.archive_pinned||
 doc.file_url!==source.archived_file_url||doc.url!==source.official_url||
 doc.source_sha256!==sha||doc.stored_sha256!==sha||doc.source_bytes!==11002258||doc.stored_bytes!==11002258||
 doc.archive_state?.status!=='complete'||doc.catalog_state?.source_document_id!==source.id)fail();
 const p1=pages.find(p=>p.page===1),p3=pages.find(p=>p.page===3),p7=pages.find(p=>p.page===7);
 if(!p1||!p3||!p7||pages.some(p=>p.source_document_id!==source.id||p.source_sha256!==sha||p.truncated||p.needs_ocr_review)||
 !p1.text.includes('RESIDENTIAL')||!p1.text.includes('PERMITTING')||!p1.text.includes('GUIDE')||
 !p3.text.includes('Guide to Residential Permitting in Sharonville')||
 !p7.text.includes('City of Sharonville Community Development Department Office')||
 p7.text_sha256!=='cc95889e7d21c9fadb22e381711193952bd5c8888c6e782e6720cf4761481141')fail();
 return {method:'retained-sharonville-guide-purpose-v1',
 query:{id:source.id,updated_date:source.updated_date,authority_classification:source.authority_classification,file_hash_sha256:sha},
 fields:{authority_classification:'administrative_guidance',
 matched_signals:[...new Set([...(source.matched_signals||[]),'retained residential permitting guide; administrative instructions, not adopted code'])],
 classified_at:new Date().toISOString(),
 notes_gaps:source.notes_gaps+' Classification describes residential administrative guidance only; reproduced zoning/code summaries do not establish adoption or current law. Commercial-sign applicability, currentness, publisher identity and electrical delegation require separate review.'},
 purpose_pages:pages.map(p=>({page:p.page,text_sha256:p.text_sha256})),
 currentness_verified:false,authority_verified:false,commercial_sign_applicability_verified:false};
}

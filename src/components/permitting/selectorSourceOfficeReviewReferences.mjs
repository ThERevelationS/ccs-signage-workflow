import {readAllCoveragePages} from './permittingCoverageReader.mjs';
import {reconcileRecordedElectricalEvidence} from './permittingElectricalSourceAudit.mjs';

const valid=value=>typeof value==='string'&&value.trim()===value&&value.length>0;
const sourceFields=['id','jurisdiction_id','jurisdiction_profile_doc_id','official_url',
  'archived_file_url','file_hash_sha256','file_bytes','content_status','verification_status',
  'authority_classification','authority_review','authority_review_state','supersedes','superseded_by'];
const eventFields=['id','method','jurisdiction_id','sequence','relation_key','role','action','office_snapshot',
  'profile_snapshot','source_document_id','source_review_id','evidence_kind','html_evidence_id',
  'coverage_area','coverage_kind','coverage_basis','source_profile_id','role_proof',
  'source_snapshot','responsibility_confirmed','address_authority_resolved'];
const ROLES=['electrical_permit','electrical_inspection'];

/** Presentation only: never reads more records or upgrades recorded evidence. */
export function describeSourceOfficeReview(row){
 const uncertain={label:'Relationship cannot currently be established',
   action:'Ask authorized staff to inspect the latest immutable events and committed review receipt before relying on this office.'};
 if(row.status==='uncommitted_or_uncertain')return uncertain;
 if(['ambiguous_history','source_identity_conflict','invalid_relation_key','malformed_review'].includes(row.status))
   return {label:'Conflicting or incomplete review identity',
     action:'Ask authorized staff to resolve duplicate source or office IDs and inspect the exact relationship events. Do not select an office by its name.'};
 if(row.status==='revoked')return {label:'Historical relationship revoked',
   action:'Inspect the later revocation event. Request authorized review with fresh official evidence before relying on this office for this role.'};
 if(row.source_replaced)return {label:'Original source relationship superseded',
   action:'Inspect the latest event and its different source ID. Its evidence was not checked by this saved-document lookup; request authorized review of that source and service area.'};
 const messages={
  recorded_source_reference:['Historical relationship recorded','Verify current official evidence, the quoted role and exact service area for the job address with authorized staff.'],
  source_snapshot_changed:['Source changed since the recorded review','Refresh official evidence and request authorized review of the changed source. Preserve the original review.'],
  no_visible_source:['Latest source evidence unavailable','Ask authorized staff to check the exact source ID and read permissions; missing evidence does not mean no requirements.'],
  covered_area_review:['Recorded service area needs review','Verify the exact service area and jurisdiction boundary with authorized staff before using this office.'],
  scope_receipt_review:['Source scope review needs reconciliation','Ask authorized staff to inspect the source review receipt and current covered-area evidence.'],
  retained_archive_missing:['Retained PDF evidence incomplete','Ask authorized staff to refresh or restore retained source evidence before reviewing this role.'],
  page_citation_incomplete:['Recorded PDF citation incomplete','Request authorized review with a retained page and an exact quotation for this role.'],
  delegation_statement_review:['Delegation evidence needs review','Request authorized review of the official delegation quotation and exact service area.'],
  role_statement_review:['Electrical role quotation needs review','Request authorized review of a quotation specifically identifying permit issuance or inspection performance.'],
  unsupported_electrical_html:['Electrical evidence needs separate review','Ask authorized staff to inspect the retained official HTML evidence; this PDF lookup cannot establish that relationship.']
 };
 const message=messages[row.status];
 return message?{label:message[0],action:message[1]}:uncertain;
}
const alive=isCurrent=>{if(!isCurrent())throw Error('Saved-source relationship lookup superseded');};
const ordered=value=>Array.isArray(value)?value.map(ordered):value&&typeof value==='object'?
 Object.fromEntries(Object.keys(value).sort().map(key=>[key,ordered(value[key])])):value;
const snapshot=value=>JSON.stringify(ordered(value));

/** Manual read-only navigation across the canonical catalog bridge. No names,
 * URLs, PDF filenames or office descriptions are treated as record identities.
 * Full scoped history includes later revocations and source replacements.
 */
export async function readSavedSourceOfficeReviewReferences(api,profile,document,isCurrent=()=>true){
 if(!valid(profile?.id)||!['OH','KY'].includes(profile.state)||!valid(document?.id)||!valid(document?.url))
   throw Error('A saved jurisdiction, original document ID and source URL are required');
 alive(isCurrent);
 const fresh=await api.entities.JurisdictionProfile.get(profile.id);
 alive(isCurrent);
 if(fresh?.id!==profile.id||fresh.state!==profile.state||
   !Array.isArray(fresh.documents)||fresh.documents.filter(d=>d?.id===document.id).length!==1)
   throw Error('Saved jurisdiction or source document identity changed; refresh before reviewing');
 const saved=fresh.documents.find(d=>d.id===document.id);
 for(const key of ['url','file_url','source_sha256','source_bytes','stored_sha256','stored_bytes'])
   if((saved[key]??null)!==(document[key]??null))
     throw Error('Saved source record changed; reload jurisdiction documents before checking historical reviews');
 const catalog=await readAllCoveragePages(cursor=>api.entities.PermittingSourceDocument.filter(
   {jurisdiction_id:fresh.id,jurisdiction_profile_doc_id:saved.id},
   {sort:'id',limit:50,fields:sourceFields,...(cursor?{cursor}:{})}
 ),{isCurrent});
 alive(isCurrent);
 if(catalog.some(c=>c.jurisdiction_id!==fresh.id||c.jurisdiction_profile_doc_id!==saved.id))
   throw Error('Catalog returned a conflicting source lineage');
 if(catalog.length!==1)return {status:catalog.length?'ambiguous_catalog_link':'no_visible_catalog_link',
   profile_id:fresh.id,document_id:saved.id,source_id:'',items:[],source_status_verified:false,
   notice:catalog.length?'Multiple catalog records carry this exact saved document ID. Resolve duplicates before reviewing office relationships.':
     'No single catalog source was visible for this exact saved document ID. This may reflect incomplete catalog registration or read permissions, not absence of official requirements.'};
 const source=catalog[0];
 if(!valid(source.id)||source.official_url!==saved.url)
   return {status:'catalog_source_mismatch',profile_id:fresh.id,document_id:saved.id,
     source_id:valid(source.id)?source.id:'',items:[],source_status_verified:false,
     notice:'The catalog source original URL or stable ID differs from the saved document. Staff must reconcile source lineage before using relationship history.'};
 const events=await readAllCoveragePages(cursor=>api.entities.PermittingOfficeAuthorityReview.filter(
   {jurisdiction_id:fresh.id,method:'office-authority-v1'},
   {sort:'id',limit:50,fields:eventFields,...(cursor?{cursor}:{})}
 ),{isCurrent});
 alive(isCurrent);
 if(events.some(e=>e.method!=='office-authority-v1'||e.jurisdiction_id!==fresh.id))
   throw Error('Relationship history escaped the selected jurisdiction scope');
 // Recheck the same exact bridge after history traversal, including duplicates
 // newly registered during the read. No name/URL fallback or automatic retry.
 const catalogAfter=await readAllCoveragePages(cursor=>api.entities.PermittingSourceDocument.filter(
   {jurisdiction_id:fresh.id,jurisdiction_profile_doc_id:saved.id},
   {sort:'id',limit:50,fields:sourceFields,...(cursor?{cursor}:{})}
 ),{isCurrent});
 alive(isCurrent);
 if(catalogAfter.length!==1||snapshot(catalogAfter[0])!==snapshot(source))
   throw Error('Saved source catalog changed or is no longer uniquely visible during lookup. Refresh evidence, resolve source IDs or read permissions, and explicitly check again.');
 // The explicit lookup also rereads the profile once after history traversal.
 // Any concurrent profile/receipt/manual override change invalidates this result.
 // This is a consistency fence, not an atomic datastore snapshot or source check.
 const after=await api.entities.JurisdictionProfile.get(profile.id);
 alive(isCurrent);
 if(!after||snapshot(after)!==snapshot(fresh))
   throw Error('Jurisdiction or review receipt changed during lookup. Refresh saved evidence and explicitly check again; no historical result was established.');
 const selected=events.filter(e=>e.source_document_id===source.id&&ROLES.includes(e.role));
 const keys=new Set(selected.map(e=>e.relation_key).filter(valid));
 const related=events.filter(e=>keys.has(e.relation_key));
 // A missing relation key must never be resolved by office name or source URL.
 const malformed=selected.filter(e=>!valid(e.relation_key)).map(e=>({
   role:e.role,review_id:e.id,latest_review_id:'',office_id:e.office_snapshot?.government_office_id||'',
   status:'invalid_relation_key',physical_page:e.role_proof?.physical_page||null,
   latest_source_id:e.source_document_id,review_ids:[e.id]}));
 if(related.some(e=>!ROLES.includes(e.role))||
   [...keys].some(key=>new Set(related.filter(e=>e.relation_key===key).map(e=>e.role)).size!==1))
   throw Error('Conflicting roles share a historical relationship key. Resolve identity before reviewing');
 for(const key of keys){
   const history=related.filter(e=>e.relation_key===key);
   const areas=history.map(e=>e.coverage_area);
   if(areas.some(area=>!valid(area))||new Set(areas).size!==1)
     throw Error('Conflicting or missing recorded service areas share a historical relationship key. Ask authorized staff to inspect exact review event IDs: '+history.map(e=>e.id).join(' · ')+'. Verify the service area and jurisdiction boundary; do not infer coverage from an office name, ZIP code or parent county.');
   const officeIds=history.map(e=>e.office_snapshot?.government_office_id);
   if(officeIds.some(id=>!valid(id))||new Set(officeIds).size!==1)
     throw Error('Conflicting or missing canonical office IDs share a historical relationship key. Ask authorized staff to resolve source/office identity and inspect exact review event IDs: '+history.map(e=>e.id).join(' · ')+'. Do not select an office by its name.');
 }
 const audit=reconcileRecordedElectricalEvidence([fresh],related,[source]);
 const items=[...malformed];
 for(const key of [...keys].sort()){
   const history=related.filter(e=>e.relation_key===key);
   const first=history.filter(e=>e.source_document_id===source.id).sort((a,b)=>
     (Number.isSafeInteger(a.sequence)?a.sequence:Infinity)-(Number.isSafeInteger(b.sequence)?b.sequence:Infinity)
     ||a.id.localeCompare(b.id))[0];
   const role=first.role;
   const seq=fresh.office_authority_review_state?.committed_sequence;
   const committed=history.filter(e=>Number.isSafeInteger(e.sequence)&&e.sequence>0&&e.sequence<=seq);
   const max=Math.max(0,...committed.map(e=>e.sequence));
   const heads=committed.filter(e=>e.sequence===max);
   const latest=heads.length===1?heads[0]:null;
   const discrepancy=audit.items.find(row=>history.some(e=>e.id===row.review_id));
   const reference=audit.retained_page_candidates.find(row=>history.some(e=>e.id===row.review_id));
   const status=discrepancy?.status|| (reference?'recorded_source_reference':latest?.action==='revoke'?'revoked':'history_review_required');
   items.push({role,review_id:first.id,latest_review_id:latest?.id||'',
     office_id:latest?.office_snapshot?.government_office_id||first.office_snapshot?.government_office_id||'',
     status,coverage_area:first.coverage_area,
     source_replaced:Boolean(latest&&latest.source_document_id&&latest.source_document_id!==source.id),
     physical_page:first.role_proof?.physical_page||null,
     latest_source_id:latest?.source_document_id||'',review_ids:history.map(e=>e.id)});
 }
 items.sort((x,y)=>ROLES.indexOf(x.role)-ROLES.indexOf(y.role)||x.review_id.localeCompare(y.review_id));
 return {status:'recorded_history_read',profile_id:fresh.id,document_id:saved.id,
   source_id:source.id,items,source_status_verified:false,
   notice:'Immutable relationship IDs are historical references only. Current official evidence, exact electrical issuer or inspection responsibility, county overlays and job-address applicability are not confirmed. Revocations, pending receipts and source changes require review.'};
}

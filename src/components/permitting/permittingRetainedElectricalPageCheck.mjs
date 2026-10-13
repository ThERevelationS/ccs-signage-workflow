import {readSourceEvidencePages} from '../../../base44/shared/jurisdictionSourceTextSegments.mjs';
import {reconcileRecordedElectricalEvidence} from './permittingElectricalSourceAudit.mjs';
import {readAllCoveragePages} from './permittingCoverageReader.mjs';

const validId=value=>typeof value==='string'&&value.trim().length>0&&value.trim()===value;
const currentOrThrow=isCurrent=>{if(!isCurrent())throw Error('Retained page check superseded by a newer session');};

/** Manually check ONE immutable OH/KY electrical review against ONE retained PDF page.
 * Read-only. Does not re-fetch a government URL or establish current office authority.
 * Fetch current profile and full relationship history before using the retained source.
 */
export async function checkRetainedElectricalPage(api, candidate, isCurrent=()=>true) {
  if (!validId(candidate?.review_id)||!['electrical_permit','electrical_inspection'].includes(candidate?.role) ||
      !['OH','KY'].includes(candidate?.state)||!validId(candidate?.jurisdiction_profile_id) ||
      !validId(candidate?.relation_key)||!validId(candidate?.source_document_id) ||
      !Number.isSafeInteger(candidate?.physical_page)||candidate.physical_page<1)
    throw Error('Select one fully identified electrical review with a physical PDF page');
  currentOrThrow(isCurrent);
  const events=await readAllCoveragePages(cursor=>api.entities.PermittingOfficeAuthorityReview.filter(
    {jurisdiction_id:candidate.jurisdiction_profile_id,relation_key:candidate.relation_key,method:'office-authority-v1'},
    {sort:'id',limit:50,fields:['id','method','jurisdiction_id','sequence','relation_key','role','action','office_snapshot',
      'profile_snapshot','source_document_id','source_review_id','evidence_kind','html_evidence_id','coverage_area',
      'coverage_kind','coverage_basis','source_profile_id','role_proof','source_snapshot',
      'responsibility_confirmed','address_authority_resolved'],...(cursor?{cursor}:{})}
  ),{isCurrent});
  currentOrThrow(isCurrent);
  if (!events.length||events.some(e=>e.role!==candidate.role||e.jurisdiction_id!==candidate.jurisdiction_profile_id||
        e.relation_key!==candidate.relation_key))
    throw Error('Recorded relationship identity changed or is not readable; refresh the coverage audit');
  const profile=await api.entities.JurisdictionProfile.get(candidate.jurisdiction_profile_id);
  currentOrThrow(isCurrent);
  if (profile?.id!==candidate.jurisdiction_profile_id||profile.state!==candidate.state)
    throw Error('Exact jurisdiction profile identity is unavailable or changed');
  const source=await api.entities.PermittingSourceDocument.get(candidate.source_document_id);
  currentOrThrow(isCurrent);
  if(source?.id!==candidate.source_document_id)throw Error('Exact retained source document ID is unavailable');
  const reconciliation=reconcileRecordedElectricalEvidence([profile],events,[source]);
  const latest=events.find(e=>e.id===candidate.review_id);
  if(!latest||latest.action!=='verify'||latest.role_proof?.physical_page!==candidate.physical_page||
      latest.source_document_id!==source.id||
      reconciliation.states[candidate.state][candidate.role].recorded_source_reference!==1||
      reconciliation.states[candidate.state][candidate.role].histories!==1||
      reconciliation.items.length)
    throw Error('Current recorded relationship, scope receipt or source snapshot requires review before page checking');
  // This adapter preserves the shared validator's six-row bound; it may read
  // one targeted immutable segment containing the physical page, not an archive.
  const segmentEntity={filter:async(query,sort,limit,skip)=>{
    currentOrThrow(isCurrent);
    const response=await api.entities.PermittingSourceTextSegment.filter(query,{sort,limit,skip,
      fields:['id','registration_key','source_document_id','source_sha256','archived_file_url','file_bytes',
        'method','page_start','page_end','total_pages','payload_sha256','pages']});
    currentOrThrow(isCurrent);
    if(!response||!Array.isArray(response.items)||response.has_more!==false)
      throw Error('Retained page segment read is incomplete or ambiguous');
    return response.items;
  }};
  const pages=await readSourceEvidencePages({source,segmentEntity,startPage:candidate.physical_page,pageCount:1});
  currentOrThrow(isCurrent);
  const page=pages.pages[0],proof=latest.role_proof;
  if(!page)throw Error('Cited physical PDF page is not present in committed retained text');
  if(page.truncated||page.needs_ocr_review)throw Error('Cited retained PDF page requires OCR or truncation review');
  if(page.text_sha256!==proof.text_sha256||!page.text.includes(proof.excerpt))
    throw Error('Recorded electrical responsibility quote or page text hash differs from retained evidence');
  return {
    status:'retained_quote_matches',review_id:latest.id,profile_id:profile.id,source_document_id:source.id,
    role:latest.role,physical_page:page.page,text_sha256:page.text_sha256,
    profile_name:profile.name,profile_state:profile.state,profile_type:profile.type,
    recorded_office_name:latest.office_snapshot?.name || '',
    canonical_office_id:latest.office_snapshot?.government_office_id || '',
    recorded_coverage_area:latest.coverage_area,recorded_coverage_kind:latest.coverage_kind,
    recorded_coverage_basis:latest.coverage_basis,source_review_id:latest.source_review_id,
    recorded_quote:proof.excerpt,
    address_authority_verified:false,current_official_source_verified:false,
    notice:'The exact recorded role quote was found on one cryptographically validated, committed retained PDF text page. This only cross-checks stored evidence; it does not verify the current government website, adopted law, jurisdiction boundaries, issuing office, or inspection responsibility.'
  };
}

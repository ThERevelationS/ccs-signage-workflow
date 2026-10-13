import { useEffect, useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { readAllCoveragePages, reconcileRecordedCoverage, reconcileOfficialInventory, reconcileElectricalOfficeCoverage, reconcileSavedLocalityProfileLinks } from './permittingCoverageReader.mjs';
import { reconcileSavedOfficeEvidence } from './permittingOfficeEvidenceReader.mjs';
import { reconcileRecordedAuthorityReviewEvents } from './permittingReviewEventReconciliation.mjs';
import { reconcileReviewedOfficesWithoutSavedCopies } from './permittingReviewedOfficeMirror.mjs';
import { readElectricalEvidenceSourceMetadata, reconcileRecordedElectricalEvidence } from './permittingElectricalSourceAudit.mjs';
import PermittingRetainedPageReview from './PermittingRetainedPageReview';

import officialInventory from './officialGeographicInventory.json';
import PermitSettingsDialog from './PermitSettingsDialog';
import useLocalityOfficeGapReview from './useLocalityOfficeGapReview';
import { useAuth } from '@/components/auth/EmailGate';

export async function readRecordedCoverage(isCurrent, onProgress, api = base44) {
  const queue = await readAllCoveragePages(cursor => api.entities.SourceCollectionQueue.filter(
    { state: { $in: ['OH', 'KY'] } }, { sort: 'id', limit: 500, fields: ['id','state','jurisdiction_name','jurisdiction_type','parent_county_name'], ...(cursor ? { cursor } : {}) }
  ), { isCurrent, onProgress: count => onProgress(`Read ${count} queue records`) });
  const profiles = await readAllCoveragePages(cursor => api.entities.JurisdictionProfile.filter(
    { state: { $in: ['OH', 'KY'] } }, { sort: 'id', limit: 500, fields: ['id','state','name','type','parent_county','office_authority_review_state'], ...(cursor ? { cursor } : {}) }
  ), { isCurrent, onProgress: count => onProgress(`Read ${count} profile records`) });
  const localities = await readAllCoveragePages(cursor => api.entities.PermitLocality.filter(
    { state: { $in: ['OH', 'KY'] } }, { sort: 'id', limit: 500, fields: ['id','state','name','jurisdiction_profile_id','offices'], ...(cursor ? { cursor } : {}) }
  ), { isCurrent, onProgress: count => onProgress(`Read ${count} saved locality office setups`) });
  const reviewEvents = await readAllCoveragePages(cursor => api.entities.PermittingOfficeAuthorityReview.filter(
    { method: 'office-authority-v1' }, { sort: 'id', limit: 500, fields: ['id','method','jurisdiction_id','sequence','relation_key','role','action','office_snapshot','profile_snapshot','source_document_id','html_evidence_id','source_review_id','evidence_kind','coverage_area','requested_by','responsibility_confirmed','address_authority_resolved','source_snapshot','role_proof'], ...(cursor ? { cursor } : {}) }
  ), { isCurrent, onProgress: count => onProgress(`Read ${count} recorded office authority events`) });
  const electricalSources = await readElectricalEvidenceSourceMetadata(api, reviewEvents, {isCurrent,
    onProgress: counts => onProgress(`Checked ${counts.requested} referenced electrical source IDs; ${counts.found} visible source records`)});
  if (!isCurrent()) throw Error('Electrical evidence read superseded');
  const saved_profile_links = reconcileSavedLocalityProfileLinks(localities, profiles);
  return { electrical_offices: reconcileElectricalOfficeCoverage(localities), saved_profile_links,
    office_evidence: reconcileSavedOfficeEvidence(localities, saved_profile_links),
    authority_events: reconcileRecordedAuthorityReviewEvents(localities, profiles, reviewEvents),
    unmirrored_authority_reviews: reconcileReviewedOfficesWithoutSavedCopies(localities, profiles, reviewEvents),
    electrical_source_evidence: reconcileRecordedElectricalEvidence(profiles, reviewEvents, electricalSources),
    ...reconcileRecordedCoverage(queue, profiles), official: reconcileOfficialInventory(queue, profiles, officialInventory), checked_at: new Date().toISOString() };
}
const labels = { single_profile_candidate: 'Single profile candidates — identity requires confirmation', profile_missing: 'Queue rows without a profile candidate', ambiguous_profiles: 'Queue rows with multiple profile candidates', duplicate_queue_identity: 'Duplicate queue identities', identity_incomplete: 'Queue rows with incomplete identities' };
export default function PermittingRecordedCoverage({ readCoverage = readRecordedCoverage }) {
  const {currentUser,isRegistered,sessionToken}=useAuth();
  const authorized=Boolean(isRegistered && (currentUser?.id || currentUser?.email));
  // Remount clears visible results immediately and cancels all previous read generations.
  const scope=JSON.stringify(authorized ? [currentUser.id || '',currentUser.email || '',currentUser.role || '',sessionToken || ''] : ['signed-out']);
  return <RecordedCoverageSession key={scope} readCoverage={readCoverage} authorized={authorized} />;
}
function RecordedCoverageSession({readCoverage,authorized}) {
  const officeReview=useLocalityOfficeGapReview();
  const reviewRecordRef=useRef(null);
  reviewRecordRef.current=officeReview.record;
  const [result, setResult] = useState(null), [busy, setBusy] = useState(false), [error, setError] = useState(''), [progress, setProgress] = useState('');
  const generation = useRef(0), inFlight = useRef(false);
  useEffect(() => () => { generation.current++; reviewRecordRef.current=null; }, []);
  async function load(afterSavedReview = false) {
    if (!authorized || (inFlight.current && afterSavedReview !== true)) return;
    inFlight.current = true; const request = ++generation.current;
    const current = () => generation.current === request;
    setBusy(true); setResult(null); setError(''); setProgress('Reading recorded inventory…');
    try {
      const data = await readCoverage(current, value => { if (current()) setProgress(value); });
      if (current()) setResult(data);
    } catch (e) { if (current()) { setResult(null); setError(e.message || 'Coverage read failed'); } }
    finally { if (current()) { inFlight.current = false; setBusy(false); setProgress(''); } }
  }
  return <section aria-label="Recorded OH/KY coverage" className="clay-card space-y-3 p-4">
    <h3 className="font-semibold">Recorded Ohio/Kentucky identity coverage</h3>
    <p className="text-sm">Compares all recorded queue and profile pages. This is a sequence of reads, not an atomic snapshot. It does not establish statewide inventory, office authority, current documents or approved requirements.</p>
    <Button className="min-h-11 h-auto whitespace-normal" disabled={busy || !authorized} onClick={load}>{busy ? 'Reading coverage…' : result ? 'Refresh recorded coverage' : 'Read recorded coverage'}</Button>
    {progress && <p role="status">{progress}</p>}{error && <p role="alert" className="text-red-700">{error}</p>}
    {officeReview.error && <p role="alert" className="text-red-700">{officeReview.error}</p>}
    {result && <><p className="text-xs">Read completed {result.checked_at}. Refresh after inventory changes.</p>
      <dl className="space-y-2">{Object.entries(labels).map(([state, label]) => <div key={state} className="flex justify-between gap-3"><dt>{label}</dt><dd>{result.items.filter(row => row.state === state).length}</dd></div>)}
        <div>Profiles with incomplete/unsupported identities: {result.invalid_profile_ids.length}</div>
        <div>Profiles without a recorded queue identity: {result.unmatched_profile_ids.length}</div>
      </dl><p className="text-amber-800 text-sm">Recorded identity matches do not establish official county relationships or permitting completeness. No completeness percentage is asserted.</p>
      {result.official && <div className="space-y-2 border-t pt-3">
        <h4 className="font-semibold">Official geographic inventory — {result.official.source_vintage}</h4>
        <p className="text-sm">All {result.official.source_rows} saved source rows accounted for: Ohio {result.official.candidate_counts.OH} and Kentucky {result.official.candidate_counts.KY} research candidates, {result.official.status_review_count} status/relationship reviews, and {result.official.statistical_reference_count} statistical/hierarchy references.</p>
        {!!result.official.source_references?.length && <details>
          <summary className="cursor-pointer min-h-11">View retained official geographic sources ({result.official.source_references.length})</summary>
          <p className="text-sm">These links identify the geographic reference sources. Live pages may change; hashes identify the retained files used for this inventory. They do not establish permitting authority.</p>
          <ul className="space-y-2 text-sm break-words">{result.official.source_references.map(source=><li key={source.file}>
            <a className="inline-flex min-h-11 items-center underline" href={source.url} target="_blank" rel="noopener noreferrer">{source.file}</a>
            <div>Retained file SHA-256: {source.sha256}</div>
            {result.official.source_row_counts?.[source.file] && <p>Retained rows: {result.official.source_row_counts[source.file].total}; research candidates: {result.official.source_row_counts[source.file].candidates}; status/relationship review: {result.official.source_row_counts[source.file].status_review}; statistical references: {result.official.source_row_counts[source.file].statistical}.</p>}
          </li>)}</ul>
        </details>}
        <p className="text-sm">Queue candidates missing: {result.official.queue.missing.length}. Profile candidates missing: {result.official.profiles.missing.length}. These counts describe geographic name/type candidates within your read permissions.</p>
        {!!result.official.status_review_items?.length && <details>
          <summary className="cursor-pointer min-h-11">View official status and relationship review entities ({result.official.status_review_items.length})</summary>
          <p className="text-sm">These source records need government-status or relationship review. They are kept separate from ordinary locality candidates and do not establish an active permitting authority.</p>
          <ul className="space-y-2 text-sm break-words">{result.official.status_review_items.map(row=><li key={row.key}>
            <strong>{row.state} {row.name}</strong> — {row.type || 'Government type requires review'}. Source key: {row.key}; source file: {row.source_file}.
          </li>)}</ul>
        </details>}
        {['queue','profiles'].map(group => <details key={group}><summary className="cursor-pointer min-h-11">View missing {group} geographic candidates</summary>
          <p className="text-sm break-words">{result.official[group].missing.map(r => r.state + ' ' + r.type + ' ' + r.name + (r.county_name ? ' (' + r.county_name + ' County)' : '')).join('; ') || 'No missing name/type candidates in this read.'}</p></details>)}
        {['queue','profiles'].map(group => <details key={'identity-review-'+group}>
          <summary className="cursor-pointer min-h-11">View {group} geographic identity review items ({result.official[group].identity_review?.length || 0})</summary>
          <p className="text-sm">Ambiguous or incomplete records can have name candidates and still require identity review. Candidate counts do not resolve these items. Ohio review items appear before Kentucky.</p>
          <ul className="space-y-2 text-sm">{(result.official[group].identity_review || []).map(row => <li key={row.id}>
            <strong>{row.record_state} {row.name}</strong> — Record ID: {row.id}. {row.state==='ambiguous'?'Multiple geographic candidates':row.state==='unmatched'?'No geographic candidate':'Single candidate requires identity review'}. {row.candidate_keys.length} candidate(s).
            {!!row.candidate_details?.length && <details className="mt-1">
              <summary className="min-h-11 cursor-pointer">View geographic candidates for {row.name}</summary>
              <p>Reference candidates only; review location and authority separately.</p>
              <ul className="space-y-1 break-words">{row.candidate_details.map(candidate=><li key={candidate.key}>
                {candidate.state} {candidate.type} {candidate.name}{candidate.county_name ? ` (${candidate.county_name} County)` : ''} — Source key: {candidate.key}
              </li>)}</ul>
            </details>}
            {row.recorded_county && <span> Recorded parent county: {row.recorded_county}.</span>}
            {row.review_flags.includes('parent_county_missing') && ' Parent county is missing.'}
            {row.review_flags.includes('parent_county_conflict') && ' Township name candidates exist in this state, but none match the recorded county. Review the county relationship; no alternative county was selected.'}
            {row.review_flags.includes('official_county_relationship_pending') && ' Official city or village county relationship still needs confirmation; a name match does not establish county office authority.'}
            {row.review_flags.includes('unsupported_type') && ' Government type needs review.'}
            {row.review_flags.includes('unsupported_state') && ' State is missing or outside the Ohio/Kentucky reference scope.'}
            {row.review_flags.includes('jurisdiction_name_missing') && ' Jurisdiction name is missing.'}
            {!!row.overlapping_record_ids?.length && <span> Shares geographic candidates with record IDs: {row.overlapping_record_ids.join(', ')}. Review separately; this does not prove duplicate authority.</span>}
          </li>)}</ul>
        </details>)}
        <p className="text-amber-800 text-sm">{result.official.notice} County relationships, consolidated entities, forms, archives, separate electrical offices and approvals remain review gaps. This is not permitting completeness.</p>
      </div>}

      {result.saved_profile_links && <section aria-label="Saved locality profile link review" className="space-y-2 border-t pt-3">
        <h4 className="font-semibold">Saved locality → jurisdiction profile link review</h4>
        <p className="text-sm">{result.saved_profile_links.notice}</p>
        <div className="overflow-x-auto"><table className="w-full min-w-[580px] text-left text-sm" aria-label="Saved locality profile link counts">
          <thead><tr><th scope="col">State</th><th scope="col">Saved</th><th scope="col">Unlinked</th><th scope="col">Target unavailable</th><th scope="col">Shared link</th><th scope="col">State review</th><th scope="col">Name review</th><th scope="col">Reference only</th><th scope="col">Malformed link</th></tr></thead>
          <tbody>{['OH','KY'].map(state=>{const counts=result.saved_profile_links.states[state];return <tr key={state}><th scope="row" className="py-2 pr-2">{state==='OH'?'Ohio':'Kentucky'}</th>{['saved','unlinked','missing_target','shared_link','state_review','name_review','linked_reference_only','invalid_link'].map(key=><td className="pr-2" key={key}>{counts[key]}</td>)}</tr>;})}</tbody>
        </table></div>
        <p className="text-xs">Categories may overlap: a locality can have a shared link and differing names. Recorded links never certify jurisdiction boundaries or the office responsible for a permit.</p>
        <details><summary className="cursor-pointer min-h-11">Review saved locality profile links ({result.saved_profile_links.reviews.length})</summary>
          <ul className="space-y-2 text-sm break-words">{result.saved_profile_links.reviews.map(row=><li key={row.id}>
            <strong>{row.state} {row.name}</strong> — Locality ID: {row.id}; linked profile ID: {row.profile_id || 'Not recorded'}.
            {row.profile_name && <span> Readable profile: {row.profile_name} ({row.profile_state || 'state missing'}).</span>}
            {row.flags.includes('unlinked') && ' No explicit profile ID was recorded; no name-based link was inferred.'}
            {row.flags.includes('invalid_link') && ' Saved profile ID is malformed; manual identity review required.'}
            {row.flags.includes('missing_target') && ' Linked profile was not visible in this read; this does not prove deletion.'}
            {row.flags.includes('shared_link') && <span> Other saved localities reference this profile: {row.shared_locality_ids.join(', ')}.</span>}
            {row.flags.includes('state_review') && ' Saved locality and profile states disagree.'}
            {row.flags.includes('name_review') && ' Recorded names differ; they may be aliases. Confirm manually.'}
          </li>)}</ul>
          {!result.saved_profile_links.reviews.length && <p className="text-sm">No link review flags in this permission-scoped read; geographic and authority verification remain open.</p>}
        </details>
        {!!result.saved_profile_links.excluded_record_ids.length && <p role="alert">Unsupported state records excluded from link totals: {result.saved_profile_links.excluded_record_ids.length}.</p>}
      </section>}

      {result.office_evidence && <section aria-label="Saved office relationship evidence review" className="space-y-2 border-t pt-3">
        <h4 className="font-semibold">Saved office relationship evidence review</h4>
        <p className="text-sm">{result.office_evidence.notice}</p>
        <div className="overflow-x-auto"><table aria-label="Saved office evidence review counts" className="w-full min-w-[900px] text-left text-sm">
          <thead><tr><th scope="col">State</th><th scope="col">Office copies</th><th scope="col">Marked staff verified</th><th scope="col">Office identity review</th><th scope="col">Locality profile link review</th><th scope="col">Canonical office ID missing</th><th scope="col">Verification provenance review</th><th scope="col">Role review</th><th scope="col">Issuer assignments</th><th scope="col">Inspection assignments</th></tr></thead>
          <tbody>{['OH','KY'].map(state=>{const counts=result.office_evidence.states[state];return <tr key={state}><th scope="row" className="pr-3 py-2">{state==='OH'?'Ohio':'Kentucky'}</th>{['office_count','recorded_staff_verified_offices','office_identity_review','profile_link_review','canonical_office_identity_missing','verification_provenance_review','authority_roles_review','electrical_issuer_assignments','electrical_inspection_assignments'].map(key=><td key={key} className="pr-3">{counts[key]}</td>)}</tr>;})}</tbody>
        </table></div>
        <p className="text-xs">These are counts of saved office copies or assignments, not distinct government offices or completed service areas. Review categories may overlap. Issuer and inspection assignments are counted independently and do not prove applicability.</p>
        <details><summary className="min-h-11 cursor-pointer">Review office identity and evidence gaps ({result.office_evidence.reviews.length})</summary>
          <ul className="space-y-3 text-sm break-words">{result.office_evidence.reviews.map(row=><li key={row.locality_id+'-'+row.office_index} className="border-b pb-2">
            <strong>{row.state} {row.locality_name} — {row.office_name}</strong>. Locality ID: {row.locality_id}; office ID: {row.office_id || 'Not recorded'}.
            {row.recorded_staff_verified && ' Staff-verified flag recorded; supporting evidence still requires independent review.'}
            {row.missing_or_malformed_local_office_id && ' Missing or malformed locality-scoped office ID.'}
            {row.duplicate_local_office_id && ' This locality has duplicate office IDs.'}
            {row.missing_office_name && ' Office name is missing.'}
            {row.flags.includes('profile_link_review') && <span> Linked jurisdiction profile needs review ({row.link_flags.join(', ')}); do not infer service area.</span>}
            {row.flags.includes('canonical_office_identity_missing') && ' Canonical government office ID is not recorded.'}
            {row.missing_reviewer && ' Authority reviewer is missing.'}
            {row.missing_or_invalid_date && ' Authority review date is missing or invalid.'}
            {row.missing_notes && ' Authority evidence notes are missing.'}
            {row.flags.includes('authority_roles_review') && ' Marked reviewed with missing or unsupported authority roles.'}
            {!!row.authority_roles.length && <span> Recorded roles: {row.authority_roles.join(', ')}.</span>}
            {officeReview.canReview && <Button type="button" variant="outline" aria-label={'Review saved office evidence for '+row.locality_id+' office '+row.office_index} className="mt-2 min-h-11 h-auto whitespace-normal" disabled={Boolean(officeReview.openingId||officeReview.record)} onClick={()=>officeReview.open(row.locality_id)}>{officeReview.openingId===row.locality_id?'Opening saved locality…':'Review saved office setup'}</Button>}
          </li>)}</ul>
          {!result.office_evidence.reviews.length && <p className="text-sm">No recorded office metadata gaps found in the readable records; this does not establish authority, source validity or statewide completion.</p>}
        </details>
      </section>}

      {result.authority_events && <section aria-label="Recorded immutable authority review reconciliation" className="space-y-2 border-t pt-3">
        <h4 className="font-semibold">Recorded authority-review event cross-check</h4>
        <p className="text-sm">{result.authority_events.notice}</p>
        <div className="overflow-x-auto"><table aria-label="Authority event cross-check counts" className="w-full min-w-[950px] text-left text-sm">
          <thead><tr><th scope="col">State</th><th scope="col">Staff-marked role assignments</th><th scope="col">Recorded event references</th><th scope="col">No exact review</th><th scope="col">Unresolved IDs</th><th scope="col">Revoked</th><th scope="col">Uncommitted</th><th scope="col">Ambiguous</th><th scope="col">Record conflict</th><th scope="col">Uncertain receipt</th></tr></thead>
          <tbody>{['OH','KY'].map(state=>{const s=result.authority_events.states[state];return <tr key={state}><th scope="row" className="py-2 pr-3">{state==='OH'?'Ohio':'Kentucky'}</th>{['saved_verified_role_assignments','recorded_event_reference','no_exact_review','unresolved_link_or_office','review_revoked','event_uncommitted','event_ambiguous','review_record_conflict','pending_receipt'].map(key=><td key={key} className="pr-3">{s[key]}</td>)}</tr>;})}</tbody>
        </table></div>
        <p className="text-xs">An event reference is not a fresh authority finding. Legacy generic electrical roles are excluded from specific issuer/inspection matches. Missing records can reflect read permissions.</p>
        <details><summary className="min-h-11 cursor-pointer">Review event reconciliation gaps ({result.authority_events.items.length})</summary>
          <ul className="space-y-2 text-sm break-words">{result.authority_events.items.map(row=><li key={row.locality_id+'-'+row.office_index+'-'+row.role}>
            <strong>{row.state} {row.locality_name} — {row.office_name}</strong> ({row.role}). Locality ID: {row.locality_id}; linked profile: {row.jurisdiction_profile_id||'not recorded'}; canonical office: {row.government_office_id||'not recorded'}.
            {' '+({no_exact_review:'No corresponding exact review record in the readable inventory.',unresolved_link_or_office:'Exact linked profile or canonical office identity is unresolved.',review_revoked:'Latest recorded relationship action is revocation.',event_uncommitted:'An uncommitted or malformed event sequence requires reconciliation.',event_ambiguous:'Multiple current review relationships or equal-sequence records require review.',review_record_conflict:'Recorded event identity, role, or supporting fields conflict.',pending_receipt:'Profile receipt is incomplete or uncertain.'}[row.status]||'Review required.')}
            {row.review_id && <span> Review event: {row.review_id}; sequence: {row.sequence}.</span>}
          </li>)}</ul>
          {!result.authority_events.items.length && <p className="text-sm">No cross-reference gaps in the read scope. Fresh source verification, exact boundaries and statewide completeness remain pending.</p>}
        </details>
      </section>}

      {result.unmirrored_authority_reviews && <section aria-label="Historical office reviews without saved tracker relationships" className="space-y-2 border-t pt-3">
        <h4 className="font-semibold">Reviewed office relationships not reflected in saved tracker setups</h4>
        <p className="text-sm">{result.unmirrored_authority_reviews.notice}</p>
        <div className="overflow-x-auto"><table className="min-w-[940px] w-full text-left text-sm" aria-label="Historical review and saved office reconciliation">
          <thead><tr><th scope="col">State</th><th scope="col">Review histories</th><th scope="col">Saved role references</th><th scope="col">No locality copy</th><th scope="col">No office copy</th><th scope="col">Role not assigned</th><th scope="col">Office needs review</th><th scope="col">Shared locality ID</th><th scope="col">State conflict</th><th scope="col">Revoked</th><th scope="col">Uncommitted</th><th scope="col">Ambiguous/invalid</th><th scope="col">Profile unavailable</th></tr></thead>
          <tbody>{['OH','KY'].map(state=>{const count=result.unmirrored_authority_reviews.states[state];return <tr key={state}><th scope="row" className="py-2 pr-3">{state==='OH'?'Ohio':'Kentucky'}</th>{['relation_histories','saved_copy_reference_only','no_saved_locality','no_saved_office','role_not_assigned','office_needs_review','shared_locality_reference','locality_state_conflict','revoked','uncommitted_or_uncertain'].map(key=><td key={key} className="pr-3">{count[key]}</td>)}<td className="pr-3">{count.ambiguous_history+count.invalid_review_identity+count.ambiguous_office_copy}</td><td>{count.target_profile_unavailable}</td></tr>;})}</tbody>
        </table></div>
        <p className="text-xs">One row per historical profile/office/role/covered-area relationship. This does not establish current permitting authority or automatically create an office. A revoked relationship is counted but is not a missing-copy task.</p>
        <details><summary className="min-h-11 cursor-pointer">Review unmirrored and uncertain authority histories ({result.unmirrored_authority_reviews.items.length})</summary>
          <ul className="space-y-2 text-sm break-words">{result.unmirrored_authority_reviews.items.map(row=><li key={row.profile_id+'-'+row.review_id+'-'+row.role}>
            <strong>{row.state} {row.profile_name}</strong> — {row.canonical_office_name || 'Office name unavailable'} ({row.role || 'role unavailable'}). Profile ID: {row.profile_id || 'not readable'}; canonical office ID: {row.canonical_office_id || 'not recorded'}; review event ID: {row.review_id}; covered-area text: {row.coverage_area || 'not recorded'}.
            {' '+({no_saved_locality:'No tracker locality explicitly links to this profile.',no_saved_office:'Tracker locality exists but this canonical office ID is not copied there.',ambiguous_office_copy:'Multiple copied offices share this canonical office ID; no unique office mapping inferred.',role_not_assigned:'Canonical office copy exists, but the reviewed role is not assigned on the tracker copy.',office_needs_review:'Tracker office has the role but its local staff-review flag is not confirmed.',shared_locality_reference:'Multiple tracker localities reference this profile; no single tracker office relationship inferred.',locality_state_conflict:'A linked tracker locality has a conflicting state.',uncommitted_or_uncertain:'Uncommitted event or uncertain profile receipt; historical authority cannot be inferred.',ambiguous_history:'Multiple current review events share the same sequence.',invalid_review_identity:'Historical review identity, role or evidence fields need manual review.',target_profile_unavailable:'Referenced profile was not readable in this permission-scoped snapshot.'}[row.status] || 'Review required.')}
            {!!row.saved_locality_ids.length && <span> Linked saved locality IDs: {row.saved_locality_ids.join(', ')}.</span>}
          </li>)}</ul>
          {!result.unmirrored_authority_reviews.items.length && <p className="text-sm">No unmirrored or uncertain relationships in this permission-scoped read. This does not certify complete office coverage.</p>}
        </details>
        {!!result.unmirrored_authority_reviews.excluded_event_ids.length && <p role="note" className="text-xs">Events outside readable Ohio/Kentucky profile scope: {result.unmirrored_authority_reviews.excluded_event_ids.length}. No authorities were inferred from them.</p>}
      </section>}

      {result.electrical_source_evidence && <section aria-label="Recorded electrical source evidence review" className="space-y-2 border-t pt-3">
        <h4 className="font-semibold">Electrical issuer and inspection source-evidence reconciliation</h4>
        <p className="text-sm">{result.electrical_source_evidence.notice}</p>
        <div className="overflow-x-auto"><table className="min-w-[960px] w-full text-left text-sm" aria-label="Electrical source evidence by role">
          <thead><tr><th scope="col">State / responsibility</th><th scope="col">Histories</th><th scope="col">Recorded reference</th><th scope="col">Source not visible</th><th scope="col">Source changed</th><th scope="col">Source identity conflict</th><th scope="col">Archive incomplete</th><th scope="col">Citation incomplete</th><th scope="col">Role/area evidence review</th><th scope="col">Unsupported HTML</th><th scope="col">Uncommitted</th><th scope="col">Ambiguous</th><th scope="col">Other invalid</th><th scope="col">Revoked</th></tr></thead>
          <tbody>{['OH','KY'].flatMap(state=>[['electrical_permit','Permit issuer'],['electrical_inspection','Inspection provider']].map(([role,label])=>{const count=result.electrical_source_evidence.states[state][role];return <tr key={state+role}><th scope="row" className="py-2 pr-3 font-normal">{state==='OH'?'Ohio':'Kentucky'} — {label}</th>{['histories','recorded_source_reference','no_visible_source','source_snapshot_changed','source_identity_conflict','retained_archive_missing','page_citation_incomplete'].map(key=><td key={key} className="pr-3">{count[key]}</td>)}<td className="pr-3">{count.scope_receipt_review+count.covered_area_review+count.role_statement_review+count.delegation_statement_review}</td>{['unsupported_electrical_html','uncommitted_or_uncertain','ambiguous_history','malformed_review','revoked'].map(key=><td key={key} className="pr-3">{count[key]}</td>)}</tr>}))}</tbody>
        </table></div>
        <p className="text-xs">Counters describe immutable review histories visible to the current user, not current legal authority. A missing archive or citation requires staff review, not automatic assignment. Electrical responsibility and covered-area statements are checked conservatively against recorded review metadata, not reverified PDF pages. Current electrical review paths require quoted PDF-page evidence; the native official-HTML delegation path is zoning-only.</p>
        <details><summary className="min-h-11 cursor-pointer">Review source evidence discrepancies ({result.electrical_source_evidence.items.length})</summary>
          <ul className="space-y-2 text-sm break-words">{result.electrical_source_evidence.items.map(row=><li key={row.review_id+'-'+row.role}>
            <strong>{row.state} {row.profile_name}</strong> — {row.role==='electrical_permit'?'Electrical permit issuer':'Electrical inspection provider'}. Profile ID: {row.profile_id}; canonical office ID: {row.office_id||'not recorded'}; immutable review ID: {row.review_id}; {row.source_document_id?'PDF source record ID: '+row.source_document_id:row.html_evidence_id?'HTML evidence ID: '+row.html_evidence_id:'No source record ID'}.
            {' '+({no_visible_source:'The referenced source record was not visible in the permission-scoped metadata read; deletion is not established.',source_identity_conflict:'The referenced source has conflicting identity fields.',source_snapshot_changed:'The saved review snapshot differs from currently readable source metadata; perform fresh evidence review.',retained_archive_missing:'PDF source lacks a complete retained archive reference, checksum, or byte count.',page_citation_incomplete:'The immutable review lacks a complete recorded PDF-page citation.',scope_receipt_review:'The source scope review receipt is missing, revoked, or does not match the recorded source review ID.',covered_area_review:'The saved covered-area text or scope classification does not exactly match the reviewed locality and named source service area.',role_statement_review:'The retained review quote does not clearly describe this specific electrical issuance or inspection responsibility.',delegation_statement_review:'The municipal PDF delegation quote does not name the exact responsible office performing this electrical role.',unsupported_electrical_html:'An official-HTML source is recorded for an electrical role, but the current HTML delegation verifier only supports zoning.',uncommitted_or_uncertain:'The review history or profile receipt is uncommitted or uncertain.',ambiguous_history:'Multiple same-sequence review decisions require reconciliation.',malformed_review:'The immutable review identity or responsibility evidence fields are incomplete.'}[row.status]||'Manual evidence review required.')}
          </li>)}</ul>
          {!result.electrical_source_evidence.items.length && <p className="text-sm">No recorded source-reference discrepancies in this read; live source validity, electrical authority and statewide completeness remain unverified.</p>}
        </details>
        <PermittingRetainedPageReview key={result.checked_at} candidates={result.electrical_source_evidence.retained_page_candidates||[]} />
      </section>}

      {result.electrical_offices && <section aria-label="Recorded electrical office review gaps" className="space-y-2 border-t pt-3">
        <h4 className="font-semibold">Recorded electrical office review gaps</h4>
        <p className="text-sm">{result.electrical_offices.notice}</p>
        <p className="text-sm">Ohio: {result.electrical_offices.states.OH.locality_count} saved localities. Kentucky: {result.electrical_offices.states.KY.locality_count} saved localities. Offices outside these saved setups are not counted.</p>
        <div className="overflow-x-auto"><table aria-label="Recorded electrical office roles" className="w-full min-w-[520px] text-left text-sm">
          <thead><tr><th scope="col">State / role</th><th scope="col">Staff-review flag recorded</th><th scope="col">Assigned role needs review</th><th scope="col">No separate role assigned</th></tr></thead>
          <tbody>{['OH','KY'].flatMap(state => [['electrical_permit','Permit issuer'],['electrical_inspection','Inspection provider']].map(([role,label]) => {
            const counts=result.electrical_offices.states[state].roles[role];
            return <tr key={state+role}><th scope="row" className="py-2 pr-3 font-normal">{state==='OH'?'Ohio':'Kentucky'} — {label}</th><td>{counts.staff_verified}</td><td>{counts.needs_review}</td><td>{counts.missing}</td></tr>;
          }))}</tbody>
        </table></div>
        <p className="text-sm text-amber-800">These counts describe historical flags on saved locality setups. A recorded staff-review flag can coexist with missing or duplicated office IDs, unresolved profile links, missing review provenance or revoked/uncertain authority events. Check “Saved office relationship evidence review” and “Recorded authority-review event cross-check” before relying on either role. Neither count verifies current authority or the job address.</p>
        <p className="text-sm">No separate role assigned means this saved setup has no explicit issuer or inspector assignment; it does not prove that no provider exists. A generic electrical label does not establish either role. Both roles still need exact service-area and project-specific applicability review.</p>
        <details><summary className="min-h-11 cursor-pointer">View saved locality electrical role gaps ({result.electrical_offices.gaps.length})</summary>
          <ul className="space-y-2 text-sm">{result.electrical_offices.gaps.map(row => <li key={row.id}>
            <strong>{row.state} {row.name}</strong>: {row.roles.electrical_permit==='staff_verified'?'Permit issuer staff-review flag recorded':row.roles.electrical_permit==='needs_review'?'Permit issuer needs review':'Permit issuer role not assigned'}; {row.roles.electrical_inspection==='staff_verified'?'Inspection provider staff-review flag recorded':row.roles.electrical_inspection==='needs_review'?'Inspection provider needs review':'Inspection provider role not assigned'}.
            {row.legacy_broad_role_present && ' Broad electrical role recorded; separate responsibilities remain unresolved.'}
            {officeReview.canReview && <Button type="button" variant="outline" aria-label={'Review office setup for '+row.name} className="mt-2 min-h-11 h-auto whitespace-normal" disabled={Boolean(officeReview.openingId||officeReview.record)} onClick={()=>officeReview.open(row.id)}>{officeReview.openingId===row.id?'Opening saved locality…':'Review office setup'}</Button>}
          </li>)}</ul>
          {!result.electrical_offices.gaps.length && <p className="text-sm">No missing or pending separate role flags in these saved setups. Office identity, profile links, review evidence and historical authority-event gaps may still remain; check their separate review sections. Current authority, job-address applicability and statewide completeness remain unverified.</p>}
        </details>
        {!!result.electrical_offices.excluded_record_ids.length && <p role="alert">Unsupported-state records excluded: {result.electrical_offices.excluded_record_ids.length}.</p>}
      </section>}

</>}
    {officeReview.record && <PermitSettingsDialog key={officeReview.record.id} isOpen={true} onClose={officeReview.close} onLocalitySaved={() => { if (reviewRecordRef.current === officeReview.record) void load(true); }} onLocalityDeleted={() => { if (reviewRecordRef.current === officeReview.record) { reviewRecordRef.current=null; officeReview.close(); void load(true); } }} localities={[officeReview.record]} initialSelectedLocalityId={officeReview.record.id} />}
  </section>;
}

import { useEffect, useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { readAllCoveragePages, reconcileRecordedCoverage, reconcileOfficialInventory, reconcileElectricalOfficeCoverage } from './permittingCoverageReader.mjs';

import officialInventory from './officialGeographicInventory.json';
import PermitSettingsDialog from './PermitSettingsDialog';
import useLocalityOfficeGapReview from './useLocalityOfficeGapReview';
import { useAuth } from '@/components/auth/EmailGate';

export async function readRecordedCoverage(isCurrent, onProgress, api = base44) {
  const queue = await readAllCoveragePages(cursor => api.entities.SourceCollectionQueue.filter(
    { state: { $in: ['OH', 'KY'] } }, { sort: 'id', limit: 500, fields: ['id','state','jurisdiction_name','jurisdiction_type','parent_county_name'], ...(cursor ? { cursor } : {}) }
  ), { isCurrent, onProgress: count => onProgress(`Read ${count} queue records`) });
  const profiles = await readAllCoveragePages(cursor => api.entities.JurisdictionProfile.filter(
    { state: { $in: ['OH', 'KY'] } }, { sort: 'id', limit: 500, fields: ['id','state','name','type','parent_county'], ...(cursor ? { cursor } : {}) }
  ), { isCurrent, onProgress: count => onProgress(`Read ${count} profile records`) });
  const localities = await readAllCoveragePages(cursor => api.entities.PermitLocality.filter(
    { state: { $in: ['OH', 'KY'] } }, { sort: 'id', limit: 500, fields: ['id','state','name','offices'], ...(cursor ? { cursor } : {}) }
  ), { isCurrent, onProgress: count => onProgress(`Read ${count} saved locality office setups`) });
  return { electrical_offices: reconcileElectricalOfficeCoverage(localities), ...reconcileRecordedCoverage(queue, profiles), official: reconcileOfficialInventory(queue, profiles, officialInventory), checked_at: new Date().toISOString() };
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

      {result.electrical_offices && <section aria-label="Recorded electrical office review gaps" className="space-y-2 border-t pt-3">
        <h4 className="font-semibold">Recorded electrical office review gaps</h4>
        <p className="text-sm">{result.electrical_offices.notice}</p>
        <p className="text-sm">Ohio: {result.electrical_offices.states.OH.locality_count} saved localities. Kentucky: {result.electrical_offices.states.KY.locality_count} saved localities. Offices outside these saved setups are not counted.</p>
        <div className="overflow-x-auto"><table aria-label="Recorded electrical office roles" className="w-full min-w-[520px] text-left text-sm">
          <thead><tr><th scope="col">State / role</th><th scope="col">Staff reviewed</th><th scope="col">Needs review</th><th scope="col">Not established</th></tr></thead>
          <tbody>{['OH','KY'].flatMap(state => [['electrical_permit','Permit issuer'],['electrical_inspection','Inspection provider']].map(([role,label]) => {
            const counts=result.electrical_offices.states[state].roles[role];
            return <tr key={state+role}><th scope="row" className="py-2 pr-3 font-normal">{state==='OH'?'Ohio':'Kentucky'} — {label}</th><td>{counts.staff_verified}</td><td>{counts.needs_review}</td><td>{counts.missing}</td></tr>;
          }))}</tbody>
        </table></div>
        <p className="text-sm text-amber-800">A generic electrical label does not establish either role. Both roles still need project-specific applicability review.</p>
        <details><summary className="min-h-11 cursor-pointer">View saved locality electrical role gaps ({result.electrical_offices.gaps.length})</summary>
          <ul className="space-y-2 text-sm">{result.electrical_offices.gaps.map(row => <li key={row.id}>
            <strong>{row.state} {row.name}</strong>: {row.roles.electrical_permit==='staff_verified'?'Permit issuer staff reviewed':row.roles.electrical_permit==='needs_review'?'Permit issuer needs review':'Permit issuer not established'}; {row.roles.electrical_inspection==='staff_verified'?'Inspection provider staff reviewed':row.roles.electrical_inspection==='needs_review'?'Inspection provider needs review':'Inspection provider not established'}.
            {row.legacy_broad_role_present && ' Broad electrical role recorded; separate responsibilities remain unresolved.'}
            {officeReview.canReview && <Button type="button" variant="outline" aria-label={'Review office setup for '+row.name} className="mt-2 min-h-11 h-auto whitespace-normal" disabled={Boolean(officeReview.openingId||officeReview.record)} onClick={()=>officeReview.open(row.id)}>{officeReview.openingId===row.id?'Opening saved locality…':'Review office setup'}</Button>}
          </li>)}</ul>
          {!result.electrical_offices.gaps.length && <p className="text-sm">No gaps found in these saved role relationships. This does not establish statewide completeness.</p>}
        </details>
        {!!result.electrical_offices.excluded_record_ids.length && <p role="alert">Unsupported-state records excluded: {result.electrical_offices.excluded_record_ids.length}.</p>}
      </section>}

</>}
    {officeReview.record && <PermitSettingsDialog key={officeReview.record.id} isOpen={true} onClose={officeReview.close} onLocalitySaved={() => { if (reviewRecordRef.current === officeReview.record) void load(true); }} onLocalityDeleted={() => { if (reviewRecordRef.current === officeReview.record) { reviewRecordRef.current=null; officeReview.close(); void load(true); } }} localities={[officeReview.record]} initialSelectedLocalityId={officeReview.record.id} />}
  </section>;
}

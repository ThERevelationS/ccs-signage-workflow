import { useEffect, useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { readAllCoveragePages, reconcileRecordedCoverage, reconcileOfficialInventory, reconcileElectricalOfficeCoverage } from './permittingCoverageReader.mjs';

import officialInventory from './officialGeographicInventory.json';

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
  const [result, setResult] = useState(null), [busy, setBusy] = useState(false), [error, setError] = useState(''), [progress, setProgress] = useState('');
  const generation = useRef(0), inFlight = useRef(false);
  useEffect(() => () => { generation.current++; }, []);
  async function load() {
    if (inFlight.current) return;
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
    <Button className="min-h-11 h-auto whitespace-normal" disabled={busy} onClick={load}>{busy ? 'Reading coverage…' : result ? 'Refresh recorded coverage' : 'Read recorded coverage'}</Button>
    {progress && <p role="status">{progress}</p>}{error && <p role="alert" className="text-red-700">{error}</p>}
    {result && <><p className="text-xs">Read completed {result.checked_at}. Refresh after inventory changes.</p>
      <dl className="space-y-2">{Object.entries(labels).map(([state, label]) => <div key={state} className="flex justify-between gap-3"><dt>{label}</dt><dd>{result.items.filter(row => row.state === state).length}</dd></div>)}
        <div>Profiles with incomplete/unsupported identities: {result.invalid_profile_ids.length}</div>
        <div>Profiles without a recorded queue identity: {result.unmatched_profile_ids.length}</div>
      </dl><p className="text-amber-800 text-sm">Recorded identity matches do not establish official county relationships or permitting completeness. No completeness percentage is asserted.</p>
      {result.official && <div className="space-y-2 border-t pt-3">
        <h4 className="font-semibold">Official geographic inventory — {result.official.source_vintage}</h4>
        <p className="text-sm">All {result.official.source_rows} saved source rows accounted for: Ohio {result.official.candidate_counts.OH} and Kentucky {result.official.candidate_counts.KY} research candidates, {result.official.status_review_count} status/relationship reviews, and {result.official.statistical_reference_count} statistical/hierarchy references.</p>
        <p className="text-sm">Queue candidates missing: {result.official.queue.missing.length}. Profile candidates missing: {result.official.profiles.missing.length}. These counts describe geographic name/type candidates within your read permissions.</p>
        {['queue','profiles'].map(group => <details key={group}><summary className="cursor-pointer min-h-11">View missing {group} geographic candidates</summary>
          <p className="text-sm break-words">{result.official[group].missing.map(r => r.state + ' ' + r.type + ' ' + r.name + (r.county_name ? ' (' + r.county_name + ' County)' : '')).join('; ') || 'No missing name/type candidates in this read.'}</p></details>)}
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
          </li>)}</ul>
          {!result.electrical_offices.gaps.length && <p className="text-sm">No gaps found in these saved role relationships. This does not establish statewide completeness.</p>}
        </details>
        {!!result.electrical_offices.excluded_record_ids.length && <p role="alert">Unsupported-state records excluded: {result.electrical_offices.excluded_record_ids.length}.</p>}
      </section>}

</>}
  </section>;
}

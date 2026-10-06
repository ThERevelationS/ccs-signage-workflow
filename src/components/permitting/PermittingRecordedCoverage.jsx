import { useEffect, useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { readAllCoveragePages, reconcileRecordedCoverage } from './permittingCoverageReader.mjs';

async function readRecordedCoverage(isCurrent, onProgress) {
  const queue = await readAllCoveragePages(cursor => base44.entities.SourceCollectionQueue.filter(
    { state: { $in: ['OH', 'KY'] } }, { sort: 'id', limit: 500, ...(cursor ? { cursor } : {}) }
  ), { isCurrent, onProgress: count => onProgress(`Read ${count} queue records`) });
  const profiles = await readAllCoveragePages(cursor => base44.entities.JurisdictionProfile.filter(
    { state: { $in: ['OH', 'KY'] } }, { sort: 'id', limit: 500, ...(cursor ? { cursor } : {}) }
  ), { isCurrent, onProgress: count => onProgress(`Read ${count} profile records`) });
  return { ...reconcileRecordedCoverage(queue, profiles), checked_at: new Date().toISOString() };
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
      </dl><p className="text-amber-800 text-sm">Official inventory denominator not reconciled. Ohio townships and missing incorporated places require independent inventory verification. No completeness percentage is asserted.</p></>}
  </section>;
}

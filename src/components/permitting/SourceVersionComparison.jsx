import { useState } from 'react';
import { Button } from '@/components/ui/button';
import SourceTextEvidenceBrowser from './SourceTextEvidenceBrowser';

const metadata = [
  ['id', 'Exact source ID'], ['jurisdiction_id', 'Canonical jurisdiction ID'],
  ['archived_file_url', 'Recorded archive URL'], ['file_hash_sha256', 'Recorded SHA-256'],
  ['retrieval_timestamp', 'Retrieval timestamp'], ['document_revision_date', 'Document revision date'],
  ['effective_or_adopted_date', 'Effective / adopted date'], ['authority_classification', 'Saved classification'],
  ['content_status', 'Saved currentness'], ['verification_status', 'Saved review status'],
  ['reviewer', 'Reviewer'], ['issuing_office', 'Issuing office'], ['jurisdiction_scope', 'Geographic scope'],
  ['supersedes', 'Recorded supersedes source ID'], ['superseded_by', 'Recorded superseded by source ID'],
];
const hash = value => typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value) ? value.toLowerCase() : '';
const recorded = value => typeof value === 'string' && value.trim() ? value : 'Not recorded';

export default function SourceVersionComparison({ jurisdictionId, rows = [], onOpenSource, regionRef }) {
  const [ids, setIds] = useState(['', '']);
  // Explicit IDs only: never pair records by title, URL, dates or fingerprints.
  const eligible = rows.filter(row => row.id && row.jurisdiction_id === jurisdictionId);
  const pair = ids.map(id => eligible.find(row => row.id === id));
  const ready = Boolean(jurisdictionId && pair[0] && pair[1] && ids[0] !== ids[1]);
  const hashes = pair.map(row => hash(row?.file_hash_sha256));
  const fingerprint = !hashes[0] || !hashes[1]
    ? 'Hash comparison unavailable: one or both recorded SHA-256 values are missing or invalid.'
    : hashes[0] === hashes[1] ? 'Identical recorded SHA-256 hashes.' : 'Different recorded SHA-256 hashes.';
  return <section ref={regionRef} tabIndex={-1} aria-label="Compare saved source versions" className="min-w-0 space-y-3 rounded-lg border border-blue-200 p-3 [overflow-wrap:anywhere]">
    <h4 className="text-sm font-semibold">Compare saved source versions</h4>
    <p className="text-xs text-gray-600">Choose two distinct exact records from this jurisdiction’s latest 200 loaded canonical sources. Collected links and separately loaded citation records outside that catalog are excluded. No automatic version matching.</p>
    <div className="grid min-w-0 gap-3 sm:grid-cols-2">
      {[0, 1].map(index => <label key={index} className="min-w-0 text-sm">Source {index + 1}
        <select aria-label={'Comparison source ' + (index + 1)} value={eligible.some(row => row.id === ids[index]) ? ids[index] : ''} className="mt-1 min-h-11 w-full min-w-0 rounded border bg-white px-2" onChange={event => setIds(previous => previous.map((id, slot) => slot === index ? event.target.value : id))}>
          <option value="">Select an exact saved source</option>
          {eligible.map(row => <option key={row.id} value={row.id} disabled={row.id === ids[1 - index]}>{row.title || 'Untitled document'} · {row.id}</option>)}
        </select>
      </label>)}
    </div>
    <Button variant="outline" className="min-h-11" disabled={!ids.some(Boolean)} onClick={() => setIds(['', ''])}>Clear comparison</Button>
    {!ready ? <p role="status" className="text-sm">Select two distinct saved sources to compare metadata.</p> : <>
      <p role="status" className="rounded bg-blue-50 p-2 text-sm">{fingerprint}</p>
      <p className="text-xs">Recorded metadata only. Hash, date and title differences do not establish legal changes, adopted authority, currentness or supersession. Matching hashes do not verify retained bytes or access. Supersession references below are saved relationships, not conclusions from this comparison.</p>
      <p className="text-xs text-gray-600">Each panel can inspect saved physical-page text for that exact record. Open both viewers to review the extracted text side by side; each read is limited to five pages and may be partial or need OCR review.</p>
      <div className="grid min-w-0 gap-3 sm:grid-cols-2">
        {pair.map((row, index) => <article key={row.id} aria-label={'Compared source ' + (index + 1)} className="min-w-0 rounded border bg-gray-50 p-3">
          <h5 className="font-semibold">Source {index + 1}: {row.title || 'Untitled document'}</h5>
          <SourceTextEvidenceBrowser key={['comparison', row.id, row.file_hash_sha256, row.archived_file_url, row.text_extraction_state?.pages_extracted].join(':')} source={row} />
          {onOpenSource && <Button variant="outline" className="my-2 min-h-11 h-auto w-full whitespace-normal" onClick={event => onOpenSource(row.id, event.currentTarget)}>Open source {index + 1} catalog details</Button>}
          <dl className="space-y-2 text-sm">{metadata.map(([field, title]) => <div key={field}><dt className="font-medium">{title}</dt><dd className="whitespace-pre-wrap">{recorded(row[field])}</dd></div>)}</dl>
        </article>)}
      </div>
    </>}
  </section>;
}

import { Button } from '@/components/ui/button';
import { safeGovernmentOfficeSourceUrl } from './governmentOfficeCatalog';
import { savedOfficeIdentityComparisons } from './officeResearchIdentityComparison.mjs';

const text = value => typeof value === 'string' && value.trim() ? value : 'Not recorded';
export default function OfficeResearchIdentityComparison({ research, onInspect }) {
  const comparisons = savedOfficeIdentityComparisons(research);
  if (!comparisons.length) return null;
  return <section aria-label="Saved electrical office identity comparisons" className="min-w-0 space-y-3 rounded border bg-white p-3 text-xs [overflow-wrap:anywhere]">
    <h5 className="text-sm font-semibold">Review office identities</h5>
    <p>These saved catalog references are clues for staff review. They do not assign an office or confirm that two names represent the same office. Catalog details are recorded snapshots; current details have not been rechecked.</p>
    <div className="grid min-w-0 gap-3 lg:grid-cols-2">
      {comparisons.map(({entry,current,finding_index,review},number) => {
        const source = review.source_snapshot || {}, reference = entry.catalog_reference || {};
        const page = entry.proof?.physical_page;
        const url = safeGovernmentOfficeSourceUrl(source.archived_file_url);
        const pageUrl = url && Number.isSafeInteger(page) && page > 0 ? url.split('#')[0] + '#page=' + page : '';
        return <article key={number} aria-label={'Identity comparison: ' + entry.role} className="min-w-0 space-y-2 rounded border bg-gray-50 p-3">
          <h6 className="font-semibold">{entry.role === 'electrical_permit' ? 'Permit issuer identity' : 'Inspection provider identity'}</h6>
          <p role="status" className="rounded border border-amber-200 bg-amber-50 p-2">
            {current ? 'Identity review pending' : 'Finding changed since this comparison. Reconcile again before using this reference.'}
          </p>
          <dl className="space-y-2">
            <div><dt className="font-semibold">Name in the recorded finding</dt><dd>{text(entry.recorded_basis?.office_name)}</dd></div>
            <div><dt className="font-semibold">Possible catalog reference</dt><dd>{text(reference.name)}</dd></div>
            <div><dt className="font-semibold">Recorded identity status</dt><dd>{reference.identity_status === 'legacy_metadata_missing'
              ? 'Legacy entry · identity metadata missing'
              : 'Unverified reference · confirm the exact office'}</dd></div>
            <div><dt className="font-semibold">Why review it</dt><dd>{text(entry.reason)}</dd></div>
          </dl>
          <p>Recorded catalog phone: {text(reference.recorded_phone)}. Confirm the contact and purpose before using it.</p>
          <blockquote className="whitespace-pre-wrap rounded border-l-2 border-gray-300 pl-2">{text(entry.proof?.quote)}</blockquote>
          {pageUrl ? <a href={pageUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center text-blue-700 underline">
            Open retained guide · PDF page {page}
          </a> : <p>Retained guide link unavailable.</p>}
          <p>Current identity, delegation, service area, commercial-sign applicability and exact-site authority remain unverified.</p>
          <details className="min-w-0 rounded border bg-white p-2">
            <summary className="flex min-h-11 cursor-pointer items-center">Recorded source and catalog references</summary>
            <dl className="space-y-2">
              <div><dt className="font-semibold">Snapshot recorded</dt><dd>{text(review.observed_at)}</dd></div>
              <div><dt className="font-semibold">Catalog record ID</dt><dd>{text(reference.id)}</dd></div>
              <div><dt className="font-semibold">Canonical ID recorded on reference</dt><dd>{text(reference.recorded_government_office_id)} · identity unconfirmed</dd></div>
              <div><dt className="font-semibold">Source document ID</dt><dd>{text(source.source_document_id)}</dd></div>
              <div><dt className="font-semibold">Archive SHA-256</dt><dd>{text(source.source_sha256)}</dd></div>
              <div><dt className="font-semibold">Physical page text SHA-256</dt><dd>{text(entry.proof?.text_sha256)}</dd></div>
            </dl>
          </details>
          {finding_index !== null && <Button variant="outline" className="min-h-11 h-auto w-full whitespace-normal text-xs"
            onClick={() => onInspect?.(finding_index)}>Inspect current {entry.role === 'electrical_permit' ? 'permit' : 'inspection'} finding</Button>}
        </article>;
      })}
    </div>
  </section>;
}

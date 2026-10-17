import { useEffect, useRef, useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Dialog, DialogOverlay, DialogPortal, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { base44 } from '@/api/base44Client';
import { safeExternalHttpUrl } from '@/utils/safeExternalUrl';
import { citationSourceId, matchWorkflowSource, WORKFLOW_SOURCE_FIELDS } from './workflowSourceEvidence.mjs';
import SourceTextEvidenceBrowser from './SourceTextEvidenceBrowser';
import PDFViewer from './PDFViewer';

const recorded = value => value === undefined || value === null || value === '' ? 'Not recorded' : String(value);
const metadata = [
  ['id', 'Exact source ID'], ['jurisdiction_id', 'Canonical jurisdiction ID'],
  ['file_hash_sha256', 'Archive SHA-256'], ['archived_file_url', 'Recorded archive URL'],
  ['retrieval_timestamp', 'Retrieved'], ['document_revision_date', 'Document revision'],
  ['effective_or_adopted_date', 'Effective / adopted date'], ['content_status', 'Recorded currentness'],
  ['authority_classification', 'Recorded classification'], ['verification_status', 'Recorded review status'],
  ['reviewer', 'Reviewer'], ['issuing_office', 'Issuing office'], ['jurisdiction_scope', 'Geographic scope'],
  ['supersedes', 'Supersedes source ID'], ['superseded_by', 'Superseded by source ID'], ['notes_gaps', 'Notes / gaps'],
];
function SourceMetadata({ source }) {
  return <dl className="space-y-2 text-xs">{metadata.map(([key, title]) => <div key={key}><dt className="font-semibold">{title}</dt><dd className="whitespace-pre-wrap">{recorded(source[key])}</dd></div>)}</dl>;
}
function EvidenceLink({ url, children }) {
  const safe = safeExternalHttpUrl(url);
  return safe ? <a href={safe} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center rounded border bg-white px-3 text-sm text-blue-700 underline">{children}</a> : null;
}
export default function WorkflowSourceEvidenceDialog({ citation, draftRow, trigger, onClose }) {
  const sourceId = citationSourceId(citation);
  const jurisdictionId = draftRow.snapshot?.jurisdiction?.jurisdiction_id || '';
  const captured = draftRow.snapshot?.source_evidence?.[sourceId];
  const [retry, setRetry] = useState(0);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(Boolean(sourceId && jurisdictionId));
  const [error, setError] = useState('');
  const [preview, setPreview] = useState(false);
  const heading = useRef(null), previewButton = useRef(null);
  useEffect(() => {
    if (!sourceId || !jurisdictionId) return;
    let active = true;
    setLoading(true); setResult(null); setError(''); setPreview(false);
    base44.entities.PermittingSourceDocument.filter({ id: sourceId, jurisdiction_id: jurisdictionId }, { limit: 1, fields: WORKFLOW_SOURCE_FIELDS })
      .then(response => {
        const rows = Array.isArray(response) ? response : response?.items;
        if (!Array.isArray(rows) || rows.length !== 1) throw new Error('Missing or ambiguous exact source');
        const source = rows[0];
        const match = matchWorkflowSource(citation, captured, source, jurisdictionId);
        if (active) setResult({ source, match });
      }).catch(() => { if (active) setError('The exact source record is missing, inaccessible or does not match this draft’s jurisdiction. Retry checks the same source; no other record is substituted.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [sourceId, jurisdictionId, citation, captured, retry]);
  const source = result?.source, match = result?.match;
  const pdfUrl = source && safeExternalHttpUrl(source.archived_file_url);
  const canPreview = pdfUrl && (/\.pdf(?:[?#]|$)/i.test(source.archived_file_url || '') || /\.pdf(?:[?#]|$)/i.test(source.official_url || '')) && Number(source.file_bytes || 0) <= 12 * 1024 * 1024;
  const closePreview = () => { setPreview(false); requestAnimationFrame(() => previewButton.current?.focus({ preventScroll: true })); };
  const contextOnly = source && (['draft','proposed','historical','superseded'].includes(source.content_status) || ['draft_proposed','comprehensive_rewrite','historical','superseded'].includes(source.authority_classification) || source.superseded_by);
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
    <DialogPortal>
      <DialogOverlay className="z-[200]" />
      <DialogPrimitive.Content onOpenAutoFocus={event => { event.preventDefault(); heading.current?.focus(); }} onCloseAutoFocus={event => { event.preventDefault(); if (trigger?.isConnected) trigger.focus({ preventScroll: true }); }} className="fixed left-1/2 top-1/2 z-[201] flex max-h-[94dvh] w-[calc(100%-1rem)] max-w-4xl -translate-x-1/2 -translate-y-1/2 flex-col rounded-xl border bg-white shadow-xl">
        <header className="flex shrink-0 flex-wrap items-start justify-between gap-2 border-b p-3">
          <div className="min-w-0 flex-1"><DialogTitle ref={heading} tabIndex={-1} className="font-semibold focus-visible:outline">Saved citation evidence</DialogTitle><DialogDescription className="mt-1 text-xs">From {draftRow.title || 'Workflow preview'}{draftRow.id ? ' · draft ' + draftRow.id : ''}. Read-only evidence review; closing returns to your draft.</DialogDescription></div>
          <Button type="button" variant="outline" className="min-h-11" onClick={onClose}>Return to draft</Button>
        </header>
        <div className="min-h-0 space-y-4 overflow-y-auto p-3 [overflow-wrap:anywhere]">
          <section aria-label="Citation retained in draft" className="space-y-2 rounded border border-purple-200 bg-purple-50 p-3 text-sm">
            <h3 className="font-semibold">Citation retained in this snapshot</h3>
            <p>Source ID: {sourceId || 'Not linked'} · Rule ID: {recorded(citation.rule_id)}</p>
            <p>Section / page: {recorded(citation.section_or_page)} · Physical PDF page: {recorded(citation.physical_page)}</p>
            <blockquote className="whitespace-pre-wrap border-l-2 border-purple-300 pl-3">{recorded(citation.excerpt)}</blockquote>
            <p className="text-xs">Citation archive SHA-256: {recorded(citation.source_sha256)}<br/>Citation text SHA-256: {recorded(citation.text_sha256)}<br/>Citation review state: {recorded(citation.verification_status)}</p>
            <div className="flex flex-wrap gap-2"><EvidenceLink url={citation.archived_file_url}>Open citation’s recorded archive</EvidenceLink><EvidenceLink url={citation.official_url}>Open citation’s official link</EvidenceLink></div>
            {!sourceId && <p role="status">No saved source record is linked to this citation.</p>}
            {!jurisdictionId && <p role="status">This snapshot has no canonical jurisdiction ID. Source lookup is unavailable until the draft’s location is resolved.</p>}
          </section>
          {loading && <p role="status">Loading this exact saved source record…</p>}
          {error && <div role="alert" className="space-y-2 rounded bg-red-50 p-3 text-sm text-red-800"><p>{error}</p><Button type="button" variant="outline" className="min-h-11" onClick={() => setRetry(value => value + 1)}>Retry exact source</Button></div>}
          {source && <>
            <section aria-label="Source version relationship" className="space-y-2 rounded border border-amber-300 bg-amber-50 p-3 text-sm">
              <h3 className="font-semibold">{match.state === 'matching' ? 'Recorded archive fingerprint matches' : match.state === 'different' ? 'Source metadata differs or cannot match' : 'Exact cited version is unverified'}</h3>
              <p>Compared against {match.basis}. {match.state === 'unknown' ? 'This snapshot did not retain a usable archive fingerprint. An identical source ID, title or URL does not confirm the cited version.' : match.state === 'matching' ? 'The recorded fingerprint matches; file access, file bytes, quotation accuracy and current adopted authority have not been verified by this view.' : 'The loaded source record must not be treated as the original cited version.'}</p>
              {match.changes.map(message => <p key={message}>{message}</p>)}
              {match.metadataChanges.length > 0 && <div className="space-y-1 border-t border-amber-300 pt-2"><p className="font-semibold">Source review metadata changed since this draft</p>{match.metadataChanges.map(change => <p key={change.field}>{change.field.replaceAll('_', ' ')}: {recorded(change.before)} → {recorded(change.after)}</p>)}</div>}
              <p>Source details and page text below belong to the record loaded now. Your saved citation and draft remain unchanged.</p>
            </section>
            {match.captured && <details className="rounded border p-3"><summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold">Source metadata captured with this draft</summary><SourceMetadata source={match.captured} /></details>}
            <section aria-label="Loaded exact source details" className="min-w-0 space-y-3 rounded border p-3">
              <h3 className="font-semibold">{source.title || 'Untitled source record'}</h3>
              {contextOnly && <p className="rounded bg-amber-50 p-2 text-sm text-amber-900">Draft, historical or superseded context. Confirm current adopted authority before relying on this material.</p>}
              <SourceMetadata source={source} />
              <div className="flex flex-wrap gap-2"><EvidenceLink url={source.official_url}>Open loaded record’s official link</EvidenceLink><EvidenceLink url={source.online_form_url}>Open loaded record’s application portal</EvidenceLink><EvidenceLink url={source.archived_file_url}>Open loaded record’s retained copy</EvidenceLink></div>
              {!pdfUrl && <p className="text-xs">No usable retained-copy URL is recorded for this source.</p>}
              {pdfUrl && Number(source.file_bytes) > 12 * 1024 * 1024 && <p className="text-xs">Recorded file size exceeds the 12 MiB preview limit. Use the retained-copy link.</p>}
              {canPreview && <Button ref={previewButton} type="button" variant="outline" className="min-h-11" onClick={() => setPreview(value => !value)}>{preview ? 'Hide loaded PDF preview' : 'Preview loaded retained PDF'}</Button>}
              {preview && canPreview && <section aria-label="Loaded record PDF preview" className="h-[65vh] min-h-[420px] min-w-0 overflow-hidden rounded border"><PDFViewer fileUrl={pdfUrl} fileName={source.title || 'Loaded source record'} onBack={closePreview} renderMode="canvas" /></section>}
              <h4 className="text-sm font-semibold">Saved page text for the loaded record</h4>
              <SourceTextEvidenceBrowser key={[source.id, source.file_hash_sha256, source.archived_file_url].join(':')} source={source} />
            </section>
          </>}
        </div>
      </DialogPrimitive.Content>
    </DialogPortal>
  </Dialog>;
}


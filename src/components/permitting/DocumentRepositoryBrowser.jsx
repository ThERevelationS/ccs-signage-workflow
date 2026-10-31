import { useEffect, useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import PDFViewer from './PDFViewer';
import SourceVersionComparison from './SourceVersionComparison';
import SourceTextEvidenceBrowser, { hasSavedPhysicalPageText } from './SourceTextEvidenceBrowser';
import { staffEntities } from "@/components/staff/staffEntities";

const types = { sign_ordinance: 'Sign ordinance', permit_application: 'Application', zoning_code: 'Zoning code', fee_schedule: 'Fees', checklist: 'Checklist', legislative_record: 'Legislative record', gis_resource: 'Map / GIS', portal_instruction: 'Portal instructions', other: 'Other' };
const label = value => String(value || 'Unknown').replaceAll('_', ' ');
const dateLabel = value => { const date = new Date(value); return value && Number.isFinite(date.getTime()) ? date.toLocaleDateString() : 'Not recorded'; };
const link = value => { try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? url.href : ''; } catch { return ''; } };
const pdfLink = row => Boolean(link(row.archived_file_url)) && /\.pdf(?:[?#]|$)/i.test(row.archived_file_url || row.official_url || '') ||
  Boolean(link(row.archived_file_url)) && /\.pdf(?:[?#]|$)/i.test(row.official_url || '');
const previewTooLarge = row => Number(row.file_bytes) > 12 * 1024 * 1024;
const fields = ['id','jurisdiction_id','jurisdiction_profile_doc_id','title','source_type','category','official_url','online_form_url','archived_file_url','archived_file_path','file_hash_sha256','file_bytes','retrieval_timestamp','document_revision_date','effective_or_adopted_date','content_status','authority_classification','verification_status','reviewer','issuing_office','jurisdiction_scope','notes_gaps','last_checked','last_changed','supersedes','superseded_by','text_extraction_state'];

function sameCollectedVersion(source, doc) {
  if (!doc || !source.jurisdiction_profile_doc_id || source.jurisdiction_profile_doc_id !== doc.id) return false;
  if (source.archived_file_url || doc.file_url) return Boolean(link(source.archived_file_url)) && source.archived_file_url === doc.file_url;
  return Boolean(link(source.official_url)) && source.official_url === doc.url;
}
function contextOnly(row) {
  return ['draft','proposed','historical','superseded'].includes(row.content_status) ||
    ['draft_proposed','comprehensive_rewrite','historical','superseded'].includes(row.authority_classification) || Boolean(row.superseded_by);
}
function statusGroup(row) {
  return contextOnly(row) ? 'context' : row.content_status === 'current' ? 'current' : 'review';
}
const availabilityFilters = { all: 'All document availability', text: 'Saved physical-page text', retained: 'Retained copy available', missing: 'No retained copy URL', ocr: 'Recorded OCR review needed' };
function matchesAvailability(row, filter) {
  if (filter === 'text') return row.saved && hasSavedPhysicalPageText(row);
  if (filter === 'retained') return Boolean(link(row.archived_file_url));
  if (filter === 'missing') return !link(row.archived_file_url);
  if (filter === 'ocr') return row.saved && (row.text_extraction_state?.needs_ocr_page_count > 0 || row.text_extraction_state?.status === 'needs_ocr');
  return true;
}
const groups = { all: 'All evidence', review: 'Currentness unknown', current: 'Recorded current', context: 'Draft / historical context' };

export default function DocumentRepositoryBrowser({ jurisdictionId, documents = [], onOpenCollected, onNavigate, sourceRequest }) {
  const [state, setState] = useState({ jurisdictionId: null, rows: [], loading: true, error: '' });
  const [refresh, setRefresh] = useState(0);
  const [viewingPDF, setViewingPDF] = useState(null), [previewNotice, setPreviewNotice] = useState('');
  const previewRegion = useRef(null), previewReturn = useRef(null), refreshButton = useRef(null);
  useEffect(() => {
    setViewingPDF(null); setPreviewNotice(''); previewReturn.current = null;
  }, [jurisdictionId, sourceRequest?.token, sourceRequest?.jurisdictionId]);
  const [selectedState, setSelectedState] = useState(null), [sourceRetry, setSourceRetry] = useState(0);
  const [query, setQuery] = useState(''), [type, setType] = useState('all'), [group, setGroup] = useState('all');
  const [availability, setAvailability] = useState('all');
  const [comparisonTarget, setComparisonTarget] = useState(null);
  const [comparisonOrigin, setComparisonOrigin] = useState(null);
  const comparisonRegion = useRef(null);
  useEffect(() => { setComparisonOrigin(null); }, [jurisdictionId, refresh, sourceRequest?.token, sourceRequest?.jurisdictionId]);
  const returnToComparison = () => {
    if (!comparisonOrigin || comparisonOrigin.jurisdictionId !== jurisdictionId || comparisonOrigin.refresh !== refresh) return;
    const destination = comparisonOrigin.button?.isConnected ? comparisonOrigin.button : comparisonRegion.current;
    destination?.focus({ preventScroll: true });
    destination?.scrollIntoView({ block: 'center', behavior: 'auto' });
    setComparisonOrigin(null);
  };
  const sourceNodes = useRef(new Map()), focusedSourceRequest = useRef(null);
  const selection = sourceRequest?.jurisdictionId === jurisdictionId ? sourceRequest : null;
  const selectedId = selection?.sourceId, selectedToken = selection?.token;
  useEffect(() => {
    let active = true;
    if (!selectedId) { focusedSourceRequest.current = null; setSelectedState(null); return () => { active = false; }; }
    setQuery(''); setType('all'); setGroup('all'); setAvailability('all');
    const identity = { jurisdictionId, sourceId: selectedId, token: selectedToken };
    setSelectedState({ ...identity, row: null, loading: true, error: '' });
    staffEntities.PermittingSourceDocument.filter({ id: selectedId, jurisdiction_id: jurisdictionId }, { limit: 1, fields }).then(result => {
      const row = (Array.isArray(result) ? result : result.items || []).find(item => item.id === selectedId && item.jurisdiction_id === jurisdictionId) || null;
      if (active) setSelectedState({ ...identity, row, loading: false, error: '' });
    }).catch(() => {
      if (active) setSelectedState({ ...identity, row: null, loading: false, error: 'The linked saved source could not be loaded. Retry this source or browse the catalog.' });
    });
    return () => { active = false; };
  }, [jurisdictionId, selectedId, selectedToken, sourceRetry]);
  const selected = selectedId && selectedState?.jurisdictionId === jurisdictionId && selectedState.sourceId === selectedId && selectedState.token === selectedToken
    ? selectedState : selectedId ? { row: null, loading: true, error: '' } : null;
  useEffect(() => {
    if (!selected?.row) return;
    const requestKey = [jurisdictionId, selectedId, selectedToken, sourceRetry].join(':');
    if (focusedSourceRequest.current === requestKey) return;
    const node = sourceNodes.current.get('source-' + selected.row.id);
    if (!node) return;
    // Filter reset and the source response may commit separately. Wait for the card.
    focusedSourceRequest.current = requestKey;
    node.open = true;
    const summary = node.querySelector('summary');
    summary?.focus({ preventScroll: true });
    node.scrollIntoView({ block: 'start', behavior: 'auto' });
  }, [selected?.row, selectedToken, selectedId, jurisdictionId, sourceRetry, query, type, group]);
  useEffect(() => {
    let active = true;
    setState({ jurisdictionId, rows: [], loading: true, error: '' });
    setQuery(''); setType('all'); setGroup('all'); setAvailability('all');
    if (!jurisdictionId) {
      setState({ jurisdictionId, rows: [], loading: false, error: 'Select a canonical jurisdiction to load saved source records.' });
      return () => { active = false; };
    }
    staffEntities.PermittingSourceDocument.filter({ jurisdiction_id: jurisdictionId }, { sort: '-retrieval_timestamp', limit: 200, fields }).then(result => {
      if (active) setState({ jurisdictionId, rows: Array.isArray(result) ? result : result.items || [], loading: false, error: '' });
    }).catch(() => {
      if (active) setState({ jurisdictionId, rows: [], loading: false, error: 'Saved source records could not be loaded. Collected links below remain available; classification is unavailable until retry succeeds.' });
    });
    return () => { active = false; };
  }, [jurisdictionId, refresh]);
  const currentState = state.jurisdictionId === jurisdictionId ? state : { rows: [], loading: true, error: '' };
  const loaded = currentState.rows.filter(row => row.jurisdiction_id === jurisdictionId);
  const openComparedSource = (sourceId, button) => {
    if (currentState.loading || currentState.error || !loaded.some(row => row.id === sourceId)) return;
    setQuery(''); setType('all'); setGroup('all'); setAvailability('all');
    setComparisonOrigin({ jurisdictionId, refresh, sourceId, button });
    setComparisonTarget({ jurisdictionId, refresh, sourceId });
  };
  useEffect(() => {
    if (!comparisonTarget) return;
    if (comparisonTarget.jurisdictionId === jurisdictionId && comparisonTarget.refresh === refresh &&
        !currentState.loading && !currentState.error && loaded.some(row => row.id === comparisonTarget.sourceId)) {
      const node = sourceNodes.current.get('source-' + comparisonTarget.sourceId);
      if (node) {
        node.open = true;
        node.querySelector('summary')?.focus({ preventScroll: true });
        node.scrollIntoView({ block: 'start', behavior: 'auto' });
      }
    }
    setComparisonTarget(null);
  }, [comparisonTarget, jurisdictionId, refresh, currentState.loading, currentState.error, loaded]);
  const saved = selected?.row ? [selected.row, ...loaded.filter(row => row.id !== selected.row.id)] : loaded;
  // Keep separate source versions. Never merge classifications by title or locality name.
  const rows = [
    ...saved.map(row => ({ ...row, key: 'source-' + row.id, collected: documents.find(doc => sameCollectedVersion(row, doc)), saved: true })),
    ...documents.filter(doc => !saved.some(row => sameCollectedVersion(row, doc))).map((doc, index) => ({
      key: 'collected-' + (doc.id || index), title: doc.title, source_type: doc.doc_type || 'other',
      official_url: doc.url, archived_file_url: doc.file_url, retrieval_timestamp: doc.last_fetched, file_bytes: doc.stored_bytes ?? doc.source_bytes,
      collected: doc, saved: false, content_status: 'unknown',
    })),
  ];
  const visible = rows.filter(row => matchesAvailability(row, availability) && (type === 'all' || row.source_type === type) && (group === 'all' || statusGroup(row) === group) &&
    [row.title, row.source_type, types[row.source_type], row.category, row.issuing_office, row.jurisdiction_scope, row.notes_gaps].some(value => String(value || '').toLowerCase().includes(query.trim().toLowerCase())));
  const scopedPreview = viewingPDF?.jurisdictionId === jurisdictionId && viewingPDF.requestToken === selectedToken ? viewingPDF : null;
  const livePreviewRow = scopedPreview && rows.find(row => row.key === scopedPreview.key && link(row.archived_file_url) === scopedPreview.url && !previewTooLarge(row));
  useEffect(() => {
    if (!scopedPreview || currentState.loading || currentState.error || livePreviewRow) return;
    setPreviewNotice('The retained copy is no longer available at the selected URL, or its recorded size now exceeds the preview limit. Review the source details before reopening.');
    previewReturn.current = { jurisdictionId, key: scopedPreview.key };
    setViewingPDF(null);
  }, [scopedPreview, currentState.loading, currentState.error, livePreviewRow, jurisdictionId]);
  useEffect(() => {
    if (scopedPreview) previewRegion.current?.scrollIntoView({ block: 'start', behavior: 'auto' });
  }, [scopedPreview]);
  useEffect(() => {
    const destination = previewReturn.current;
    if (!destination || viewingPDF || destination.jurisdictionId !== jurisdictionId || currentState.loading) return;
    const node = sourceNodes.current.get(destination.key);
    if (node) node.open = true;
    (node?.querySelector('summary') || refreshButton.current)?.focus({ preventScroll: true });
    node?.scrollIntoView({ block: 'start', behavior: 'auto' });
    previewReturn.current = null;
  }, [viewingPDF, jurisdictionId, currentState.loading, query, type, group]);
  const openPreview = row => {
    setPreviewNotice('');
    setViewingPDF({ jurisdictionId, requestToken: selectedToken, key: row.key, url: link(row.archived_file_url), title: row.title, status: row.content_status, classification: row.authority_classification });
  };
  const closePreview = () => {
    if (viewingPDF) previewReturn.current = { jurisdictionId, key: viewingPDF.key };
    setQuery(''); setType('all'); setGroup('all'); setAvailability('all'); setViewingPDF(null);
  };
  return <section aria-label="Document repository catalog" className="mb-4 space-y-3 rounded-lg border border-green-200 bg-white p-3">
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-semibold">Documents & source details</h3><Button ref={refreshButton} variant="outline" className="min-h-11" disabled={currentState.loading} onClick={() => setRefresh(v => v + 1)}>Refresh</Button></div>
    <p className="text-xs text-gray-600">Labels describe what was saved. Collecting, extracting, and AI research don't approve a rule or prove it applies to your job.</p>
    {previewNotice && <p role="status" className="rounded bg-amber-50 p-3 text-sm">{previewNotice}</p>}
    {scopedPreview && <div ref={previewRegion} role="region" aria-label="Retained PDF preview" className="scroll-mt-3 min-w-0 overflow-hidden rounded-lg border border-blue-300">
      <p className="bg-blue-50 p-3 text-xs [overflow-wrap:anywhere]">Retained copy · saved currentness: {label(scopedPreview.status)} · classification: {label(scopedPreview.classification)}. Viewing does not approve authority or verify the cited version.</p>
      <div className="h-[70vh] min-h-[420px] min-w-0"><PDFViewer key={scopedPreview.key + ':' + scopedPreview.url} fileUrl={scopedPreview.url} fileName={scopedPreview.title || 'Retained document'} onBack={closePreview} renderMode="canvas" /></div>
    </div>}
    {selected && <div className="space-y-2 rounded border border-blue-200 bg-blue-50 p-3 text-sm [overflow-wrap:anywhere]">
      <p className="font-semibold">Linked source record: {selectedId}</p>
      <p className="text-xs">Check the saved version against its sources. Opening it doesn't make it official or clear alerts.</p>
      {selected.loading ? <p role="status">Loading the saved source…</p> : selected.error ? <p role="alert" className="text-red-700">{selected.error}</p> : !selected.row ? <p role="alert">No linked source found for this office — it may be missing or unlinked. Nothing was guessed.</p> : <p role="status">Picked source: {selected.row.title || 'Document with no name'}</p>}
      {!selected.loading && (!selected.row || selected.error) && <Button variant="outline" className="min-h-11" onClick={() => setSourceRetry(value => value + 1)}>Retry linked source</Button>}
      {onNavigate && <Button variant="outline" className="min-h-11" onClick={() => onNavigate('documents')}>Clear source selection</Button>}
    </div>}
    <SourceVersionComparison key={String(jurisdictionId) + ':' + refresh} jurisdictionId={jurisdictionId} rows={currentState.loading || currentState.error ? [] : loaded} onOpenSource={openComparedSource} regionRef={comparisonRegion} />
    <Input aria-label="Search document catalog" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search title, type, office, scope or gaps" className="min-h-11" />
    <div className="flex flex-col gap-2 sm:flex-row">
      <select aria-label="Document type" className="min-h-11 min-w-0 w-full rounded-md border px-2 text-sm sm:flex-1" value={type} onChange={e => setType(e.target.value)}><option value="all">All document types ({rows.length})</option>{[...new Set(rows.map(row => row.source_type).filter(Boolean))].sort().map(value => <option key={value} value={value}>{types[value] || label(value)} ({rows.filter(row => row.source_type === value).length})</option>)}</select>
      <select aria-label="Source currentness filter" className="min-h-11 min-w-0 w-full rounded-md border px-2 text-sm sm:flex-1" value={group} onChange={e => setGroup(e.target.value)}>{Object.entries(groups).map(([value,title]) => <option key={value} value={value}>{title} ({rows.filter(row => value === 'all' || statusGroup(row) === value).length})</option>)}</select>
    </div>
    <select aria-label="Document availability" className="min-h-11 min-w-0 w-full rounded-md border px-2 text-sm" value={availability} onChange={e => setAvailability(e.target.value)}>{Object.entries(availabilityFilters).map(([value, title]) => <option key={value} value={value}>{title} ({rows.filter(row => matchesAvailability(row, value)).length})</option>)}</select>
    <p className="text-xs text-gray-600">Availability counts cover loaded entries only. Saved text may be partial or inaccessible; a retained URL does not confirm the file can be fetched. OCR flags describe saved processing evidence.</p>
    {currentState.loading && <p role="status" className="text-sm">Loading saved source catalog…</p>}
    {currentState.error && <p role="alert" className="text-sm text-red-700">{currentState.error}</p>}
    <p role="status" className="text-xs text-gray-600">{visible.length} shown from {rows.length} loaded entries. Saved sources are limited to the latest 200 canonical records; collected links are included{selected?.row ? ", plus the selected source record if outside that list" : ""}. Separate retained versions stay separate.</p>
    {!currentState.loading && !currentState.error && rows.length === 0 && <p className="text-sm">No saved sources or collected links found. Missing documents do not mean no permit is required.</p>}
    {rows.length > 0 && visible.length === 0 && <p className="text-sm">No documents match these filters.</p>}
    {visible.map(row => <details key={row.key} ref={node => { if (node) sourceNodes.current.set(row.key, node); else sourceNodes.current.delete(row.key); }} className={`min-w-0 scroll-mt-3 rounded-lg border p-3 [overflow-wrap:anywhere] ${selected?.row?.id === row.id && row.saved ? 'border-blue-400 bg-blue-50' : 'bg-gray-50'}`}>
      <summary tabIndex={0} className="min-h-11 cursor-pointer text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600"><span className="block font-semibold">{row.title || 'Untitled document'}</span><span className="mt-1 flex flex-wrap gap-1"><Badge variant="outline">{types[row.source_type] || label(row.source_type)}</Badge><Badge variant="outline">{contextOnly(row) ? 'Context only · confirm before use' : row.content_status === 'current' ? 'Recorded current · confirm before use' : 'Currentness unknown'}</Badge>{!row.saved && <Badge variant="outline">Collected link</Badge>}</span></summary>
      <div className="space-y-3 border-t pt-3 text-sm">
        {row.saved && comparisonOrigin && comparisonOrigin.jurisdictionId === jurisdictionId && comparisonOrigin.refresh === refresh && comparisonOrigin.sourceId === row.id && <Button variant="outline" className="min-h-11 h-auto w-full whitespace-normal sm:w-auto" onClick={returnToComparison}>Return to source comparison</Button>}
        {row.saved ? <>
          <p>Saved classification: {label(row.authority_classification)}<br/>Saved currentness: {label(row.content_status)}<br/>Saved review status: {label(row.verification_status)}</p>
          {contextOnly(row) && <p className="rounded bg-amber-50 p-2 text-amber-900">Draft, historical or superseded context. Do not use this record as current permitting authority.</p>}
          <p>Issuing office: {row.issuing_office || 'Not recorded'}<br/>Geographic scope: {row.jurisdiction_scope || 'Not recorded'}<br/>Reviewer: {row.reviewer || 'Not recorded'}</p>
          <p>Effective / adopted date: {row.effective_or_adopted_date || 'Not recorded'}<br/>Document revision: {row.document_revision_date || 'Not recorded'}</p>
          {row.notes_gaps && <p className="whitespace-pre-wrap">Notes / gaps: {row.notes_gaps}</p>}
          {row.superseded_by && <p>Superseded by source: {row.superseded_by}</p>}
        </> : <p>{currentState.loading || currentState.error ? 'Source classification is unavailable while the saved catalog is loading or failed.' : 'No matching saved classification for this collected version. Do not infer authority from its title, AI discovery or archive.'}</p>}
        <p>Collected / retrieved: {dateLabel(row.retrieval_timestamp)}{row.saved && <><br/>Last source check: {dateLabel(row.last_checked)}<br/>Last detected change: {dateLabel(row.last_changed)}</>}</p>
        {row.saved && <p>Text extraction: {row.text_extraction_state?.status ? label(row.text_extraction_state.status) + ' (saved processing status)' : 'Not recorded'}. Extracted text may be partial; extraction does not verify authority.</p>}
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          {link(row.official_url) && <a className="inline-flex min-h-11 items-center rounded border bg-white px-3 text-blue-700" href={link(row.official_url)} target="_blank" rel="noopener noreferrer">Open official source link</a>}
          {link(row.online_form_url) && row.online_form_url !== row.official_url && <a className="inline-flex min-h-11 items-center rounded border bg-white px-3 text-blue-700" href={link(row.online_form_url)} target="_blank" rel="noopener noreferrer">Open application / portal</a>}
          {link(row.archived_file_url) && <a className="inline-flex min-h-11 items-center rounded border bg-white px-3 text-blue-700" href={link(row.archived_file_url)} target="_blank" rel="noopener noreferrer">Open retained copy</a>}
          {pdfLink(row) && !previewTooLarge(row) && <Button variant="outline" className="min-h-11 h-auto whitespace-normal" onClick={() => openPreview(row)}>Preview retained PDF</Button>}
          {row.collected?.id && onOpenCollected && <Button variant="outline" className="min-h-11 h-auto whitespace-normal" onClick={() => onOpenCollected(row.collected.id)}>Open collected search / PDF tools</Button>}
        </div>
        {pdfLink(row) && previewTooLarge(row) && <p className="text-xs">Recorded file size exceeds the 12 MiB inline preview limit. Use Open retained copy to inspect it externally.</p>}
        {!link(row.official_url) && <p>Official source link missing or unavailable.</p>}
        {!link(row.archived_file_url) && <p>{row.archived_file_path ? 'Retained repository path recorded; no downloadable copy URL available.' : 'No downloadable retained copy. This may be an online source or an archive gap.'}</p>}
        {row.saved && <SourceTextEvidenceBrowser key={[jurisdictionId, selectedToken, row.id, row.file_hash_sha256, row.archived_file_url, row.text_extraction_state?.pages_extracted].join(':')} source={row} />}
        {row.saved && !row.collected && <p className="text-xs">Collected search / PDF tools are not linked to this saved version. Open its retained copy or official link above.</p>}
        {row.saved && <details><summary className="min-h-11 cursor-pointer py-2">Retained version details</summary><p>Source record: {row.id}</p><p>Saved archive fingerprint: {row.file_hash_sha256 || 'Not recorded'}</p><p>Saved archive size: {row.file_bytes != null ? row.file_bytes + ' bytes' : 'Not recorded'}</p><p className="text-xs">Saved metadata identifies a retained version; this view does not verify its bytes or current adoption.</p></details>}
        {onNavigate && <div className="flex flex-wrap gap-2"><Button variant="outline" className="min-h-11 h-auto w-full whitespace-normal sm:w-auto" onClick={() => onNavigate('requirements')}>Review saved requirements</Button><Button variant="outline" className="min-h-11 h-auto w-full whitespace-normal sm:w-auto" onClick={() => onNavigate('monitoring')}>Inspect source monitoring</Button></div>}
      </div>
    </details>)}
  </section>;
}

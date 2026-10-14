import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

const types = { sign_ordinance: 'Sign ordinance', permit_application: 'Application', zoning_code: 'Zoning code', fee_schedule: 'Fees', checklist: 'Checklist', legislative_record: 'Legislative record', gis_resource: 'Map / GIS', portal_instruction: 'Portal instructions', other: 'Other' };
const label = value => String(value || 'Unknown').replaceAll('_', ' ');
const dateLabel = value => { const date = new Date(value); return value && Number.isFinite(date.getTime()) ? date.toLocaleDateString() : 'Not recorded'; };
const link = value => { try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? url.href : ''; } catch { return ''; } };
const fields = ['id','jurisdiction_id','jurisdiction_profile_doc_id','title','source_type','category','official_url','online_form_url','archived_file_url','archived_file_path','file_hash_sha256','file_bytes','retrieval_timestamp','document_revision_date','effective_or_adopted_date','content_status','authority_classification','verification_status','reviewer','issuing_office','jurisdiction_scope','notes_gaps','last_checked','last_changed','superseded_by','text_extraction_state'];

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
const groups = { all: 'All evidence', review: 'Currentness unknown', current: 'Recorded current', context: 'Draft / historical context' };

export default function DocumentRepositoryBrowser({ jurisdictionId, documents = [], onOpenCollected, onNavigate }) {
  const [state, setState] = useState({ jurisdictionId: null, rows: [], loading: true, error: '' });
  const [refresh, setRefresh] = useState(0);
  const [query, setQuery] = useState(''), [type, setType] = useState('all'), [group, setGroup] = useState('all');
  useEffect(() => {
    let active = true;
    setState({ jurisdictionId, rows: [], loading: true, error: '' });
    setQuery(''); setType('all'); setGroup('all');
    if (!jurisdictionId) {
      setState({ jurisdictionId, rows: [], loading: false, error: 'Select a canonical jurisdiction to load saved source records.' });
      return () => { active = false; };
    }
    base44.entities.PermittingSourceDocument.filter({ jurisdiction_id: jurisdictionId }, { sort: '-retrieval_timestamp', limit: 200, fields }).then(result => {
      if (active) setState({ jurisdictionId, rows: Array.isArray(result) ? result : result.items || [], loading: false, error: '' });
    }).catch(() => {
      if (active) setState({ jurisdictionId, rows: [], loading: false, error: 'Saved source records could not be loaded. Collected links below remain available; classification is unavailable until retry succeeds.' });
    });
    return () => { active = false; };
  }, [jurisdictionId, refresh]);
  const currentState = state.jurisdictionId === jurisdictionId ? state : { rows: [], loading: true, error: '' };
  const saved = currentState.rows.filter(row => row.jurisdiction_id === jurisdictionId);
  // Keep separate source versions. Never merge classifications by title or locality name.
  const rows = [
    ...saved.map(row => ({ ...row, key: 'source-' + row.id, collected: documents.find(doc => sameCollectedVersion(row, doc)), saved: true })),
    ...documents.filter(doc => !saved.some(row => sameCollectedVersion(row, doc))).map((doc, index) => ({
      key: 'collected-' + (doc.id || index), title: doc.title, source_type: doc.doc_type || 'other',
      official_url: doc.url, archived_file_url: doc.file_url, retrieval_timestamp: doc.last_fetched,
      collected: doc, saved: false, content_status: 'unknown',
    })),
  ];
  const visible = rows.filter(row => (type === 'all' || row.source_type === type) && (group === 'all' || statusGroup(row) === group) &&
    [row.title, row.source_type, types[row.source_type], row.category, row.issuing_office, row.jurisdiction_scope, row.notes_gaps].some(value => String(value || '').toLowerCase().includes(query.trim().toLowerCase())));
  return <section aria-label="Document repository catalog" className="mb-4 space-y-3 rounded-lg border border-green-200 bg-white p-3">
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-semibold">Browse documents & source details</h3><Button variant="outline" className="min-h-11" disabled={currentState.loading} onClick={() => setRefresh(v => v + 1)}>Refresh source catalog</Button></div>
    <p className="text-xs text-gray-600">Saved classifications and currentness describe retained records. Collection, extraction and AI research do not approve a requirement or confirm applicability to a project.</p>
    <Input aria-label="Search document catalog" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search title, type, office, scope or gaps" className="min-h-11" />
    <div className="flex flex-col gap-2 sm:flex-row">
      <select aria-label="Document type" className="min-h-11 min-w-0 w-full rounded-md border px-2 text-sm sm:flex-1" value={type} onChange={e => setType(e.target.value)}><option value="all">All document types ({rows.length})</option>{[...new Set(rows.map(row => row.source_type).filter(Boolean))].sort().map(value => <option key={value} value={value}>{types[value] || label(value)} ({rows.filter(row => row.source_type === value).length})</option>)}</select>
      <select aria-label="Source currentness filter" className="min-h-11 min-w-0 w-full rounded-md border px-2 text-sm sm:flex-1" value={group} onChange={e => setGroup(e.target.value)}>{Object.entries(groups).map(([value,title]) => <option key={value} value={value}>{title} ({rows.filter(row => value === 'all' || statusGroup(row) === value).length})</option>)}</select>
    </div>
    {currentState.loading && <p role="status" className="text-sm">Loading saved source catalog…</p>}
    {currentState.error && <p role="alert" className="text-sm text-red-700">{currentState.error}</p>}
    <p role="status" className="text-xs text-gray-600">{visible.length} shown from {rows.length} loaded entries. Saved sources are limited to the latest 200 canonical records; collected links are included. Separate retained versions stay separate.</p>
    {!currentState.loading && !currentState.error && rows.length === 0 && <p className="text-sm">No saved sources or collected links found. Missing documents do not mean no permit is required.</p>}
    {rows.length > 0 && visible.length === 0 && <p className="text-sm">No documents match these filters.</p>}
    {visible.map(row => <details key={row.key} className="min-w-0 rounded-lg border bg-gray-50 p-3 [overflow-wrap:anywhere]">
      <summary className="min-h-11 cursor-pointer text-sm"><span className="block font-semibold">{row.title || 'Untitled document'}</span><span className="mt-1 flex flex-wrap gap-1"><Badge variant="outline">{types[row.source_type] || label(row.source_type)}</Badge><Badge variant="outline">{contextOnly(row) ? 'Context only · confirm before use' : row.content_status === 'current' ? 'Recorded current · confirm before use' : 'Currentness unknown'}</Badge>{!row.saved && <Badge variant="outline">Collected link</Badge>}</span></summary>
      <div className="space-y-3 border-t pt-3 text-sm">
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
          {row.collected?.id && onOpenCollected && <Button variant="outline" className="min-h-11 h-auto whitespace-normal" onClick={() => onOpenCollected(row.collected.id)}>Open collected search / PDF tools</Button>}
        </div>
        {!link(row.official_url) && <p>Official source link missing or unavailable.</p>}
        {!link(row.archived_file_url) && <p>{row.archived_file_path ? 'Retained repository path recorded; no downloadable copy URL available.' : 'No downloadable retained copy. This may be an online source or an archive gap.'}</p>}
        {row.saved && !row.collected && <p className="text-xs">Collected search / PDF tools are not linked to this saved version. Open its retained copy or official link above.</p>}
        {row.saved && <details><summary className="min-h-11 cursor-pointer py-2">Retained version details</summary><p>Source record: {row.id}</p><p>Saved archive fingerprint: {row.file_hash_sha256 || 'Not recorded'}</p><p>Saved archive size: {row.file_bytes != null ? row.file_bytes + ' bytes' : 'Not recorded'}</p><p className="text-xs">Saved metadata identifies a retained version; this view does not verify its bytes or current adoption.</p></details>}
        {onNavigate && <div className="flex flex-wrap gap-2"><Button variant="outline" className="min-h-11" onClick={() => onNavigate('requirements')}>Review saved requirements</Button><Button variant="outline" className="min-h-11" onClick={() => onNavigate('monitoring')}>Inspect source monitoring</Button></div>}
      </div>
    </details>)}
  </section>;
}

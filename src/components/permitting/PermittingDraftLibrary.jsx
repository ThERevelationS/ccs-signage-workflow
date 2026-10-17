import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import PermitWorkflowDesigner from './PermitWorkflowDesigner';

export default function PermittingDraftLibrary({ onClose }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [state, setState] = useState('all');
  const [selected, setSelected] = useState(null);
  const [request, setRequest] = useState({ cursor: null, revision: 0 });
  const [nextCursor, setNextCursor] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [olderError, setOlderError] = useState('');
  const refreshDrafts = () => setRequest(previous => ({ cursor: null, revision: previous.revision + 1 }));
  useEffect(() => {
    let active = true;
    const append = Boolean(request.cursor);
    setLoading(!append); setLoadingMore(append); setError(''); setOlderError('');
    if (!append) { setRows([]); setHasMore(false); setNextCursor(null); }
    const options = append ? { cursor: request.cursor, limit: 100 } : { sort: '-created_date', limit: 100 };
    base44.entities.PermittingWorkflowDraft.filter({}, options).then(page => {
      if (!active) return;
      if (!Array.isArray(page?.items) || typeof page.has_more !== 'boolean' ||
        page.items.some(row => !row?.id) || (page.has_more &&
          (typeof page.next_cursor !== 'string' || !page.next_cursor || page.next_cursor === request.cursor))) {
        throw new Error('Invalid draft continuation');
      }
      setRows(previous => append ? [...new Map([...previous, ...page.items].map(row => [row.id, row])).values()] : page.items);
      setHasMore(page.has_more); setNextCursor(page.has_more ? page.next_cursor : null);
    }).catch(() => {
      if (!active) return;
      if (append) setOlderError('Older drafts could not be loaded. Your loaded drafts are still available. Retry or refresh the library.');
      else setError('Drafts could not be loaded. Retry to check the saved library.');
    }).finally(() => { if (active) { setLoading(false); setLoadingMore(false); } });
    return () => { active = false; };
  }, [request]);
  const visible = rows.filter(row => (state === 'all' || row.state === state) &&
    [row.title, row.jurisdiction_name, row.state, row.project_inputs?.signTypes, row.review_notes].some(value => String(value || '').toLowerCase().includes(query.trim().toLowerCase())));
  return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-2 sm:p-4">
    <section role="dialog" aria-modal="true" aria-labelledby="draft-library-title" className="flex max-h-[95dvh] w-full min-w-0 max-w-4xl flex-col rounded-2xl bg-white shadow-xl">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b p-3 sm:p-4">
        <div><h2 id="draft-library-title" className="text-lg font-bold">Permitting workflow drafts</h2><p className="text-sm text-gray-600">Saved proposals · not approved requirements or active job work</p></div>
        <Button variant="outline" className="min-h-11" onClick={onClose}>Close library</Button>
      </header>
      <div className="min-h-0 overflow-y-auto p-3 sm:p-4 space-y-3">
        <div className="flex flex-wrap gap-2">
          <Input aria-label="Search workflow drafts" placeholder="Search draft, jurisdiction, sign or notes" value={query} onChange={e => setQuery(e.target.value)} className="min-h-11 min-w-0 flex-1" />
          <select aria-label="Filter draft state" value={state} onChange={e => setState(e.target.value)} className="min-h-11 rounded-md border px-3"><option value="all">All states</option><option>OH</option><option>KY</option></select>
          <Button variant="outline" disabled={loading || loadingMore} onClick={refreshDrafts} className="min-h-11">Refresh drafts</Button>
        </div>
        {loading ? <p role="status">Loading saved drafts…</p> : error ? <div role="alert" className="rounded-lg bg-red-50 p-3 text-red-800">{error}</div> : <>
          <p className="text-xs text-gray-600">{visible.length} shown from {rows.length} loaded drafts. Search and state filters cover loaded drafts only.</p>
          {rows.length === 0 ? <div className="rounded-lg border p-5"><h3 className="font-semibold">No saved workflows yet</h3><p className="text-sm text-gray-600">Open a jurisdiction, choose the AI workflow designer, review the proposal and save a permitting draft.</p></div> : visible.length === 0 ? <p>No drafts match these filters.</p> : visible.map(row => {
            const valid = row.snapshot && Array.isArray(row.snapshot.steps) && row.snapshot.jurisdiction;
            const gaps = (row.snapshot?.gaps?.length || 0) + (row.snapshot?.steps || []).filter(s => s.basis !== 'approved_rule').length;
            return <article key={row.id} className="min-w-0 rounded-lg border p-3 break-words">
              <div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0 flex-1"><h3 className="font-semibold">{row.title || 'Untitled draft'}</h3><p className="text-sm text-gray-600">{row.jurisdiction_name || 'Jurisdiction unresolved'}{row.state ? `, ${row.state}` : ''}</p></div><span className="rounded bg-purple-100 px-2 py-1 text-xs text-purple-800">Draft · unapproved</span></div>
              <p className="mt-2 text-sm">{row.snapshot?.steps?.length || 0} proposed steps · {gaps} review items</p>
              {row.snapshot?.draft_revision && <p className="mt-1 text-xs text-amber-800">Revision {row.snapshot.draft_revision.revision_number} · based on {row.snapshot.draft_revision.parent_title || row.snapshot.draft_revision.parent_draft_id}</p>}
              {row.review_notes && <p className="mt-1 text-sm text-gray-600">Review notes: {row.review_notes}</p>}
              {!valid && <p className="text-sm text-amber-800">This draft is incomplete and cannot be opened.</p>}
              <Button className="mt-2 min-h-11" variant="outline" disabled={!valid} onClick={() => setSelected(row)}>Review draft</Button>
            </article>;
          })}
          {olderError && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{olderError}</p>}
          {hasMore ? <div className="space-y-2 border-t pt-3">
            <p className="text-sm text-gray-600">Older drafts are available. Load them to expand your search.</p>
            <Button variant="outline" className="min-h-11" disabled={loadingMore} onClick={() => setRequest(previous => ({ cursor: nextCursor, revision: previous.revision + 1 }))}>{loadingMore ? 'Loading older drafts…' : olderError ? 'Retry older drafts' : 'Load older drafts'}</Button>
            {loadingMore && <p role="status" className="text-sm">Loading older drafts. Loaded drafts remain available.</p>}
          </div> : rows.length > 0 && <p className="text-xs text-gray-600">Reached the end of this browse. Refresh to include newly saved drafts.</p>}
        </>}
      </div>
    </section>
    {selected && <PermitWorkflowDesigner key={selected.id} isOpen initialSavedDraft={selected} preselectedJurisdiction={selected.snapshot.jurisdiction} onClose={() => setSelected(null)} onDraftSaved={refreshDrafts} />}
  </div>;
}

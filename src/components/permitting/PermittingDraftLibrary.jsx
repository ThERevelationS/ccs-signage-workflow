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
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true); setError('');
    base44.entities.PermittingWorkflowDraft.filter({}, { sort: '-created_date', limit: 100 }).then(result => {
      if (active) setRows(Array.isArray(result) ? result : result.items || []);
    }).catch(() => { if (active) setError('Drafts could not be loaded. Retry to check the saved library.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [refresh]);
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
          <Button variant="outline" disabled={loading} onClick={() => setRefresh(v => v + 1)} className="min-h-11">Refresh drafts</Button>
        </div>
        {loading ? <p role="status">Loading saved drafts…</p> : error ? <div role="alert" className="rounded-lg bg-red-50 p-3 text-red-800">{error}</div> : <>
          <p className="text-xs text-gray-600">{visible.length} shown from {rows.length} loaded drafts. Most recent 100 drafts; this list is not a complete archive.</p>
          {rows.length === 0 ? <div className="rounded-lg border p-5"><h3 className="font-semibold">No saved workflows yet</h3><p className="text-sm text-gray-600">Open a jurisdiction, choose the AI workflow designer, review the proposal and save a permitting draft.</p></div> : visible.length === 0 ? <p>No drafts match these filters.</p> : visible.map(row => {
            const valid = row.snapshot && Array.isArray(row.snapshot.steps) && row.snapshot.jurisdiction;
            const gaps = (row.snapshot?.gaps?.length || 0) + (row.snapshot?.steps || []).filter(s => s.basis !== 'approved_rule').length;
            return <article key={row.id} className="min-w-0 rounded-lg border p-3 break-words">
              <div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0 flex-1"><h3 className="font-semibold">{row.title || 'Untitled draft'}</h3><p className="text-sm text-gray-600">{row.jurisdiction_name || 'Jurisdiction unresolved'}{row.state ? `, ${row.state}` : ''}</p></div><span className="rounded bg-purple-100 px-2 py-1 text-xs text-purple-800">Draft · unapproved</span></div>
              <p className="mt-2 text-sm">{row.snapshot?.steps?.length || 0} proposed steps · {gaps} review items</p>
              {row.review_notes && <p className="mt-1 text-sm text-gray-600">Review notes: {row.review_notes}</p>}
              {!valid && <p className="text-sm text-amber-800">This draft is incomplete and cannot be opened.</p>}
              <Button className="mt-2 min-h-11" variant="outline" disabled={!valid} onClick={() => setSelected(row)}>Review draft</Button>
            </article>;
          })}
        </>}
      </div>
    </section>
    {selected && <PermitWorkflowDesigner key={selected.id} isOpen initialSavedDraft={selected} preselectedJurisdiction={selected.snapshot.jurisdiction} onClose={() => setSelected(null)} />}
  </div>;
}

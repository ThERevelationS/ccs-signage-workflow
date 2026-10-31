import { useEffect, useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { compareSavedDrafts, draftFieldLabel, validateDraftAncestor } from './permitDraftComparison.mjs';
import { citationSourceId } from './workflowSourceEvidence.mjs';
import { staffEntities } from "@/components/staff/staffEntities";

function SavedValue({ value }) {
  if (value === undefined || value === null || value === '') return <span className="text-gray-500">Not recorded</span>;
  if (typeof value === 'boolean') return <span>{value ? 'Yes' : 'No'}</span>;
  if (Array.isArray(value)) return value.length ? <ol className="list-inside list-decimal space-y-2">{value.map((item, index) => <li key={index}><SavedValue value={item} /></li>)}</ol> : <span className="text-gray-500">None recorded</span>;
  if (typeof value === 'object') return <dl className="space-y-1">{Object.entries(value).map(([key, item]) => <div key={key}><dt className="font-medium">{draftFieldLabel(key)}</dt><dd className="pl-2"><SavedValue value={item} /></dd></div>)}</dl>;
  return <span className="whitespace-pre-wrap">{String(value)}</span>;
}
function revisionLabel(row) {
  return row.snapshot?.draft_revision?.revision_number ? 'Copy ' + row.snapshot.draft_revision.revision_number : 'First saved copy';
}

function CitationSourceActions({ citations, draftRow, side, onOpenCitation }) {
  if (!Array.isArray(citations) || !onOpenCitation) return null;
  return <div className="mt-2 space-y-2">{citations.map((citation, index) => citation && typeof citation === 'object' && <div key={index}>
    <Button type="button" variant="outline" className="min-h-11 h-auto w-full whitespace-normal text-xs" onClick={event => onOpenCitation(citation, draftRow, event.currentTarget)}>Open source {index + 1} ({side === 'earlier' ? 'older copy' : 'this copy'})</Button>
    {!citationSourceId(citation) && <p>No saved source on file — you can still read what was saved.</p>}
  </div>)}</div>;
}
export default function PermittingDraftHistory({ current, onOpenCitation }) {
  const [open, setOpen] = useState(false);
  const [ancestors, setAncestors] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showUnchanged, setShowUnchanged] = useState(false);
  const pending = useRef(false);
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const oldest = ancestors[ancestors.length - 1] || current;
  const parentId = oldest.snapshot?.draft_revision?.parent_draft_id;
  const selected = ancestors.find(row => row.id === selectedId);
  const comparison = selected ? compareSavedDrafts(selected, current) : [];
  const changed = comparison.filter(row => row.changed).length;
  const visible = comparison.filter(row => row.changed || row.always || showUnchanged);
  const groups = [...new Set(visible.map(row => row.group))];
  const loadPrevious = async () => {
    if (pending.current || !parentId) return;
    pending.current = true; setLoading(true); setError('');
    try {
      if ([current, ...ancestors].some(row => row.id === parentId)) throw new Error('Revision link cycle');
      const row = validateDraftAncestor(await staffEntities.PermittingWorkflowDraft.get(parentId), parentId, current, [current, ...ancestors]);
      if (!active.current) return;
      setAncestors(previous => [...previous, row]); setSelectedId(row.id);
    } catch {
      if (active.current) setError("Couldn't load the older copy. You can still compare what's already shown — try again for more.");
    } finally {
      pending.current = false;
      if (active.current) setLoading(false);
    }
  };
  return <section aria-label="Older saved copies" className="min-w-0 space-y-3 rounded-lg border border-purple-200 p-3 [overflow-wrap:anywhere]">
    <Button type="button" variant="outline" aria-expanded={open} className="min-h-11 h-auto whitespace-normal" onClick={() => setOpen(value => !value)}>{open ? 'Hide older copies' : 'See older copies & what changed'}</Button>
    {open && <>
      <h3 className="font-semibold">Older saved copies</h3>
      <p className="text-sm text-gray-600">Saved copies you can look at but not change. Older copies load one at a time. This only shows this plan and the copies it came from — nothing here changes the job.</p>
      <p className="text-sm"><strong>This copy:</strong> {revisionLabel(current)} · {current.title} · Saved {current.created_date || current.reviewed_at || 'date not recorded'}</p>
      <div className="flex flex-wrap gap-2">
        {ancestors.map(row => <Button key={row.id} type="button" variant={selectedId === row.id ? 'default' : 'outline'} aria-pressed={selectedId === row.id} className="min-h-11 h-auto max-w-full whitespace-normal text-left" onClick={() => setSelectedId(row.id)}>Compare with {revisionLabel(row)} · {row.title || 'Untitled plan'}</Button>)}
      </div>
      {parentId ? <Button type="button" variant="outline" className="min-h-11" disabled={loading} onClick={loadPrevious}>{loading ? 'Loading the older copy…' : error ? 'Try again' : 'Load the older copy'}</Button>
        : <p className="text-sm text-gray-600">{ancestors.length ? "That's the oldest saved copy." : 'No older copies were saved before this one.'}</p>}
      {loading && <p role="status" className="text-sm">Loading the older copy…</p>}
      {error && <p role="alert" className="rounded bg-red-50 p-2 text-sm text-red-800">{error}</p>}
      {selected && <section aria-label="What changed between copies" className="min-w-0 space-y-3">
        <h4 className="font-semibold">{changed} things changed · {revisionLabel(selected)} → {revisionLabel(current)}</h4>
        <p className="text-xs text-gray-600">Older: {selected.title} · Saved {selected.created_date || selected.reviewed_at || 'date not recorded'}. Steps are compared in the order they were saved. Sources show exactly as saved — nobody re-checked them.</p>
        <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={showUnchanged} onChange={event => setShowUnchanged(event.target.checked)} />Show what stayed the same</label>
        <p className="text-xs text-gray-600">Sources, open questions, and notes always show.</p>
        {groups.map(group => <section key={group} aria-label={group + ' changes'} className="min-w-0 space-y-2">
          <h5 className="font-semibold text-purple-900">{group}</h5>
          {visible.filter(row => row.group === group).map(row => <article key={row.label} className="min-w-0 rounded border p-2 text-xs">
            <h6 className="font-semibold">{row.label} · {row.changed ? 'Changed' : 'Same'}</h6>
            <div className="mt-2 grid min-w-0 gap-3 sm:grid-cols-2">
              <div className="min-w-0 rounded bg-gray-50 p-2"><p className="mb-1 font-semibold">Older copy</p><SavedValue value={row.before} />{group === 'Sources' && <CitationSourceActions citations={row.before} draftRow={selected} side="earlier" onOpenCitation={onOpenCitation} />}</div>
              <div className="min-w-0 rounded bg-purple-50 p-2"><p className="mb-1 font-semibold">This copy</p><SavedValue value={row.after} />{group === 'Sources' && <CitationSourceActions citations={row.after} draftRow={current} side="opened" onOpenCitation={onOpenCitation} />}</div>
            </div>
          </article>)}
        </section>)}
      </section>}
    </>}
  </section>;
}


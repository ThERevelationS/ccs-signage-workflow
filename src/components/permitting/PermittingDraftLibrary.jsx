import { useEffect, useState, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import PermitWorkflowDesigner from './PermitWorkflowDesigner';
import { PLANNING_REVIEW_DECISIONS, PLANNING_FOLLOW_UP_AREAS, planningReviewDecisionLabel } from './workflowPlanningReview.mjs';
import { savedDraftReviewView } from './savedDraftReviewFilters.mjs';
import { staffEntities } from "@/components/staff/staffEntities";

export default function PermittingDraftLibrary({ onClose }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [state, setState] = useState('all');
  const [selected, setSelected] = useState(null);
  const [selectedStep, setSelectedStep] = useState(null);
  const [decision, setDecision] = useState('all');
  const [area, setArea] = useState('all');
  const returnTarget = useRef(null), heading = useRef(null);
  const openDraft = (row, stepIndex, trigger) => { returnTarget.current = trigger; setSelectedStep(stepIndex); setSelected(row); };
  const closeDraft = () => { setSelected(null); requestAnimationFrame(() => { const target = returnTarget.current?.isConnected ? returnTarget.current : heading.current; target?.focus({ preventScroll: true }); }); };
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
    staffEntities.PermittingWorkflowDraft.filter({}, options).then(page => {
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
  const visible = rows.map(row => savedDraftReviewView(row, { query, state, decision, area })).filter(view => view.matches);
  return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-2 sm:p-4">
    <section role="dialog" aria-modal="true" aria-labelledby="draft-library-title" className="flex max-h-[95dvh] w-full min-w-0 max-w-4xl flex-col rounded-2xl bg-white shadow-xl">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b p-3 sm:p-4">
        <div><h2 id="draft-library-title" ref={heading} tabIndex={-1} className="text-lg font-bold">Permitting workflow drafts</h2><p className="text-sm text-gray-600">Saved drafts — nothing here is final or filed yet</p></div>
        <Button variant="outline" className="min-h-11" onClick={onClose}>Close library</Button>
      </header>
      <div className="min-h-0 overflow-y-auto p-3 sm:p-4 space-y-3">
        <div className="flex flex-wrap gap-2">
          <Input aria-label="Search workflow drafts" placeholder="Search draft, jurisdiction, sign or review notes" value={query} onChange={e => setQuery(e.target.value)} className="min-h-11 min-w-0 flex-1" />
          <select aria-label="Filter draft state" value={state} onChange={e => setState(e.target.value)} className="min-h-11 rounded-md border px-3"><option value="all">All states</option><option>OH</option><option>KY</option></select>
          <Button variant="outline" disabled={loading || loadingMore} onClick={refreshDrafts} className="min-h-11">Refresh drafts</Button>
        </div>
        <div className="grid min-w-0 gap-2 sm:grid-cols-2">
          <label className="min-w-0 text-sm"><span className="mb-1 block font-medium">Planning review decision</span><select aria-label="Filter planning review decision" value={decision} onChange={event => setDecision(event.target.value)} className="min-h-11 w-full min-w-0 rounded-md border bg-white px-3"><option value="all">All planning decisions</option>{PLANNING_REVIEW_DECISIONS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}<option value="unrecognized">Unrecognized saved decision</option></select></label>
          <label className="min-w-0 text-sm"><span className="mb-1 block font-medium">Open follow-up area</span><select aria-label="Filter open follow-up area" value={area} onChange={event => setArea(event.target.value)} className="min-h-11 w-full min-w-0 rounded-md border bg-white px-3"><option value="all">All follow-up areas</option><option value="any">Any recorded open area</option>{PLANNING_FOLLOW_UP_AREAS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        </div>
        <p className="text-xs text-gray-600">Filters only cover the drafts loaded below — load more to search older ones.</p>
        {loading ? <p role="status">Loading saved drafts…</p> : error ? <div role="alert" className="rounded-lg bg-red-50 p-3 text-red-800">{error}</div> : <>
          <p className="text-xs text-gray-600">Showing {visible.length} of {rows.length} loaded drafts{visible.length !== rows.length ? " — search and filters only cover what's loaded" : ""}.</p>
          {rows.length === 0 ? <div className="rounded-lg border p-5"><h3 className="font-semibold">No saved workflows yet</h3><p className="text-sm text-gray-600">Open a jurisdiction, choose the AI workflow designer, review the proposal and save a permitting draft.</p></div> : visible.length === 0 ? <p>No drafts match these filters.</p> : visible.map(({ row, steps, summary, matchingSteps }) => {
            const valid = row.snapshot && Array.isArray(row.snapshot.steps) && row.snapshot.jurisdiction;
            const gaps = (row.snapshot?.gaps?.length || 0) + steps.filter(s => s.basis !== 'approved_rule').length;
            return <article key={row.id} className="min-w-0 rounded-lg border p-3 break-words">
              <div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0 flex-1"><h3 className="font-semibold">{row.title || 'Untitled draft'}</h3><p className="text-sm text-gray-600">{row.jurisdiction_name || 'Jurisdiction unresolved'}{row.state ? `, ${row.state}` : ''}</p></div><span className="rounded bg-purple-100 px-2 py-1 text-xs text-purple-800">Draft · unapproved</span></div>
              <p className="mt-2 text-sm">{row.snapshot?.steps?.length || 0} proposed steps · {gaps} evidence / confirmation items</p>
              {row.snapshot?.draft_revision && <p className="mt-1 text-xs text-amber-800">Revision {row.snapshot.draft_revision.revision_number} · based on {row.snapshot.draft_revision.parent_title || row.snapshot.draft_revision.parent_draft_id}</p>}
              <p className="mt-1 text-xs text-gray-600 [overflow-wrap:anywhere]">Draft ID: {row.id} · Saved {row.created_date || row.reviewed_at || 'date not recorded'}{row.snapshot?.draft_revision?.root_draft_id ? ' · Recorded revision root: ' + row.snapshot.draft_revision.root_draft_id : ' · No revision root recorded'}</p>
              <section aria-label="Snapshot planning review summary" className="mt-3 space-y-2 rounded border border-purple-200 bg-purple-50 p-3 text-xs">
                <p>Reviewed for planning: {summary.reviewed_for_planning} / {steps.length} · Needs follow-up: {summary.needs_follow_up} · Proposed not applicable: {summary.not_applicable_proposal} · Not reviewed: {summary.not_reviewed}{summary.unrecognized > 0 ? ' · Unrecognized saved decision: ' + summary.unrecognized : ''}</p>
                <p>{summary.open_follow_up} step(s) with recorded open follow-up areas. {summary.missing_review > 0 ? summary.missing_review + ' step(s) have no saved review checklist.' : steps.length === 0 ? 'No proposed steps or review checklist recorded.' : 'Planning review does not approve requirements or authorize job work.'}</p>
                {matchingSteps.length > 0 && <details open={decision !== 'all' || area !== 'all'}>
                  <summary className="min-h-11 cursor-pointer py-3 font-semibold">Review steps · {matchingSteps.length} matching of {steps.length}</summary>
                  <ol className="space-y-3">
                    {matchingSteps.map(({index, step, areas}) => <li key={index} className="min-w-0 rounded border bg-white p-3 [overflow-wrap:anywhere]">
                      <h4 className="font-semibold">Step {index + 1} · {step.permit_type || 'Untitled proposed step'}</h4>
                      <p>{step.office || 'Office not recorded'}</p>
                      <p>{planningReviewDecisionLabel(step.staff_review?.decision)}{!step.staff_review ? ' · No saved review checklist' : ''}</p>
                      <p>Open follow-up: {areas.join('; ') || 'None recorded · not a completeness claim'}</p>
                      {step.staff_review?.reason && <p>Reason: {String(step.staff_review.reason).slice(0, 180)}{String(step.staff_review.reason).length > 180 ? '…' : ''}</p>}
                      {step.staff_review?.notes && <p>Review notes: {String(step.staff_review.notes).slice(0, 180)}{String(step.staff_review.notes).length > 180 ? '…' : ''}</p>}
                      <Button type="button" variant="outline" disabled={!valid} className="mt-2 min-h-11 h-auto whitespace-normal" onClick={event => openDraft(row, index, event.currentTarget)}>Open step {index + 1} review</Button>
                    </li>)}
                  </ol>
                </details>}
              </section>

              {row.review_notes && <p className="mt-1 text-sm text-gray-600">Review notes: {row.review_notes}</p>}
              {!valid && <p className="text-sm text-amber-800">This draft is incomplete and cannot be opened.</p>}
              <Button className="mt-2 min-h-11" variant="outline" disabled={!valid} onClick={event => openDraft(row, null, event.currentTarget)}>Review draft</Button>
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
    {selected && <PermitWorkflowDesigner key={selected.id} isOpen initialSavedDraft={selected} initialStepIndex={selectedStep} preselectedJurisdiction={selected.snapshot.jurisdiction} onClose={closeDraft} onDraftSaved={refreshDrafts} />}
  </div>;
}

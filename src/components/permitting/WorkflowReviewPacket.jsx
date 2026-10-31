import { useRef, useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Dialog, DialogOverlay, DialogPortal, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { safeExternalHttpUrl } from '@/utils/safeExternalUrl';
import { planningReviewDecisionLabel } from './workflowPlanningReview.mjs';
import { draftFieldLabel } from './permitDraftComparison.mjs';
import './workflowReviewPacket.css';
import ElectricalOfficeResponseContext from './ElectricalOfficeResponseContext';

const empty = value => value === undefined || value === null || value === '';
const labels = {
  staff_review: 'Staff check (not an office approval)', follow_up: 'Still open',
  basis: 'What it was based on', staff_override: 'Staff changes — need a check',
  source_evidence: 'Saved source details', required_documents: 'Papers / forms needed',
  target_days_from_start: 'Do it by day', followup_interval_days: 'Check back every (days)',
  inspection_needed: 'Inspection planned — check who does it and when',
};
function RecordedValue({ value, field = '' }) {
  if (empty(value)) return <span>Not saved</span>;
  if (field === 'decision') return <span>{planningReviewDecisionLabel(value)}</span>;
  if (typeof value === 'boolean') return <span>{value ? 'Yes' : 'No'}</span>;
  if (Array.isArray(value)) return value.length ? <ol>{value.map((item, index) => <li key={index}><RecordedValue value={item} /></li>)}</ol> : <span>None saved</span>;
  if (typeof value === 'object') return <dl>{Object.entries(value).map(([key, item]) => <div className="packet-field" key={key}><dt>{labels[key] || draftFieldLabel(key)}</dt><dd><RecordedValue value={item} field={key} /></dd></div>)}</dl>;
  if (/(?:url|link)$/i.test(field)) {
    const safe = safeExternalHttpUrl(value);
    return safe ? <a href={safe} target="_blank" rel="noopener noreferrer">{safe}</a> : <span>Link not usable</span>;
  }
  return <span className="packet-value">{String(value)}</span>;
}
function PacketSection({ title, children }) {
  return <section className="packet-section" aria-label={title}><h3>{title}</h3>{children}</section>;
}
export default function WorkflowReviewPacket({ draftRow, trigger, onClose }) {
  const heading = useRef(null);
  const [printError, setPrintError] = useState('');
  const snapshot = draftRow.snapshot || {};
  const steps = Array.isArray(snapshot.steps) ? snapshot.steps : [];
  const revision = snapshot.draft_revision;
  const print = () => {
    try {
      if (typeof window.print !== 'function') throw new Error('Print unavailable');
      setPrintError('');
      window.print();
    } catch {
      setPrintError("This browser can't print. Open the plan in one that can, then choose Print or Save as PDF.");
    }
  };
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
    <DialogPortal>
      <DialogOverlay className="z-[210]" />
      <DialogPrimitive.Content data-permitting-review-packet="" className="workflow-review-packet"
        onOpenAutoFocus={event => { event.preventDefault(); heading.current?.focus(); }}
        onCloseAutoFocus={event => { event.preventDefault(); if (trigger?.isConnected) trigger.focus({ preventScroll: true }); }}>
        <style>{'@media print { @page { margin: 16mm; } }'}</style>
        <header className="packet-toolbar">
          <div><DialogTitle ref={heading} tabIndex={-1}>Saved plan check sheet</DialogTitle>
            <DialogDescription>A saved copy you can look at. Use Print or Save as PDF in your browser.</DialogDescription></div>
          <div className="packet-controls"><Button type="button" variant="outline" onClick={onClose}>Back to the plan</Button><Button type="button" onClick={print}>Print / Save as PDF</Button></div>
          {printError && <p role="alert">{printError}</p>}
        </header>
        <div className="packet-scroll">
          <article className="packet-document">
            <header><p className="packet-eyebrow">CCS · Permit plan</p><h2>{draftRow.title || 'Plan with no name'}</h2>
              <p className="packet-warning"><strong>NOT APPROVED — STAFF NEED TO CHECK IT</strong><br/>Saving or printing this does not approve anything, decide which office is in charge, pick who does the work, or start the job. Check with the real offices before using it.</p>
              <p>This sheet only shows what was saved. New edits and re-checks are not in it. Saved info may be stale — links and files can change and were not re-verified here.</p>
            </header>
            <PacketSection title="Plan name and dates"><RecordedValue value={{
              draft_id: draftRow.id, saved_status: draftRow.status,
              revision: revision?.revision_number ?? 'Copy number not saved (first or old copy)',
              saved_at: draftRow.created_date, reviewed_at: draftRow.reviewed_at,
              recorded_revision_details: revision,
              revision_created_at: revision?.created_at, parent_draft_id: revision?.parent_draft_id,
              parent_title: revision?.parent_title, root_draft_id: revision?.root_draft_id, root_title: revision?.root_title,
            }} /></PacketSection>
            <PacketSection title="Job details"><RecordedValue value={draftRow.project_inputs} /></PacketSection>
            <PacketSection title="Office and who is in charge"><RecordedValue value={snapshot.jurisdiction} /><p><strong>No office picked:</strong> <RecordedValue value={snapshot.jurisdiction_unresolved} /></p><p>The saved office info was not re-checked.</p></PacketSection>
            <PacketSection title="Offices and the electrical split">
              <p>The office that gives the permit and the one that inspects are different jobs. A blank or generic contact does not settle either one — check who covers the address and who inspects.</p>
              <RecordedValue value={snapshot.electrical_planning_handoff && Object.fromEntries(Object.entries(snapshot.electrical_planning_handoff).filter(([key]) => key !== "office_responses"))} />
              <ElectricalOfficeResponseContext context={snapshot.electrical_planning_handoff?.office_responses} />
              {!snapshot.electrical_planning_handoff && <p>No electrical permit or inspection plan was saved — who handles them is not settled.</p>}
              {Object.keys(snapshot).filter(key => /office/i.test(key)).map(key => <div key={key}><h4>{draftFieldLabel(key)}</h4><RecordedValue value={snapshot[key]} /></div>)}
              <p>Other saved offices show up in each step below.</p>
            </PacketSection>
            <PacketSection title="Plan summary"><RecordedValue value={snapshot.summary} /></PacketSection>
            <PacketSection title="Planned steps, papers, and proof">
              {!steps.length && <p>No steps saved.</p>}
              {steps.map((step, index) => <section key={index} className="packet-step" aria-label={'Step ' + (index + 1)}>
                <h4>Step {index + 1}{step.permit_type ? ' · ' + step.permit_type : ''}</h4>
                <RecordedValue value={Object.fromEntries(Object.entries(step).filter(([key]) => !['step_index', 'citations', 'dependencies'].includes(key)))} />
                <p><strong>Must come after:</strong> {Array.isArray(step.dependencies) && step.dependencies.length
                  ? step.dependencies.map(value => Number.isInteger(value) && value >= 0 && value < steps.length ? 'Step ' + (value + 1) : 'Saved step link not found: ' + String(value)).join('; ')
                  : 'None saved — check the order'}</p>
                <p>Days are counted from the plan start — they are not official deadlines. What steps are based on and staff changes still need a check.</p>
                <h5>Saved sources</h5>
                {!step.citations?.length && <p>No sources saved — check the proof for this step.</p>}
                {(Array.isArray(step.citations) ? step.citations : []).map((citation, citationIndex) => <section className="packet-citation" key={citationIndex}>
                  <h6>Step {index + 1} · Source {citationIndex + 1}</h6>
                  <RecordedValue value={citation} />
                  {!snapshot.source_evidence?.[citation?.source_document_id] && <p className="packet-warning">No source details were saved for this. The exact version used is unverified — nothing newer was swapped in.</p>}
                </section>)}
              </section>)}
            </PacketSection>
            <PacketSection title="Saved source details">
              <p>These details were saved with the plan or an older copy. They do not prove quotes are right, files match, or that a rule is current or approved. Anything draft, old, replaced, or unchecked still needs confirming.</p>
              {snapshot.source_evidence && Object.keys(snapshot.source_evidence).length ? Object.entries(snapshot.source_evidence).map(([id, source]) => <section className="packet-source" key={id}><h4>Source {id}</h4><RecordedValue value={source} /></section>)
                : <p>No source details were saved. Older copies were not filled in — versions and freshness are unverified.</p>}
            </PacketSection>
            <PacketSection title="Open questions"><RecordedValue value={snapshot.gaps} /></PacketSection>
            <PacketSection title="Saved notes"><RecordedValue value={draftRow.review_notes} /></PacketSection>
            <PacketSection title="Other saved details"><RecordedValue value={Object.fromEntries(Object.entries(snapshot).filter(([key]) => !['jurisdiction', 'jurisdiction_unresolved', 'electrical_planning_handoff', 'summary', 'steps', 'source_evidence', 'gaps', 'draft_revision'].includes(key) && !/office/i.test(key)))} /></PacketSection>
            <footer><strong>Not approved</strong> · Plan {draftRow.id || 'ID not saved'} · Check the open questions, offices, and current rules before using this.</footer>
          </article>
        </div>
      </DialogPrimitive.Content>
    </DialogPortal>
  </Dialog>;
}

import { useRef, useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Dialog, DialogOverlay, DialogPortal, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { safeExternalHttpUrl } from '@/utils/safeExternalUrl';
import { planningReviewDecisionLabel } from './workflowPlanningReview.mjs';
import { draftFieldLabel } from './permitDraftComparison.mjs';
import './workflowReviewPacket.css';

const empty = value => value === undefined || value === null || value === '';
const labels = {
  staff_review: 'Staff planning review (not authority approval)', follow_up: 'Open follow-up areas',
  basis: 'Saved evidence basis', staff_override: 'Staff edits requiring confirmation',
  source_evidence: 'Captured source metadata', required_documents: 'Required documents / forms',
  target_days_from_start: 'Proposed target day from start', followup_interval_days: 'Proposed follow-up interval (days)',
  inspection_needed: 'Inspection planned (confirm provider and stages)',
};
function RecordedValue({ value, field = '' }) {
  if (empty(value)) return <span>Not recorded</span>;
  if (field === 'decision') return <span>{planningReviewDecisionLabel(value)}</span>;
  if (typeof value === 'boolean') return <span>{value ? 'Yes' : 'No'}</span>;
  if (Array.isArray(value)) return value.length ? <ol>{value.map((item, index) => <li key={index}><RecordedValue value={item} /></li>)}</ol> : <span>None recorded</span>;
  if (typeof value === 'object') return <dl>{Object.entries(value).map(([key, item]) => <div className="packet-field" key={key}><dt>{labels[key] || draftFieldLabel(key)}</dt><dd><RecordedValue value={item} field={key} /></dd></div>)}</dl>;
  if (/(?:url|link)$/i.test(field)) {
    const safe = safeExternalHttpUrl(value);
    return safe ? <a href={safe} target="_blank" rel="noopener noreferrer">{safe}</a> : <span>Unusable recorded link</span>;
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
      setPrintError('Printing is unavailable in this browser. Open this saved draft in a browser that supports Print or Save as PDF.');
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
          <div><DialogTitle ref={heading} tabIndex={-1}>Saved workflow review packet</DialogTitle>
            <DialogDescription>Read-only saved snapshot. Print or choose Save as PDF in your browser where supported.</DialogDescription></div>
          <div className="packet-controls"><Button type="button" variant="outline" onClick={onClose}>Return to saved draft</Button><Button type="button" onClick={print}>Print / Save as PDF</Button></div>
          {printError && <p role="alert">{printError}</p>}
        </header>
        <div className="packet-scroll">
          <article className="packet-document">
            <header><p className="packet-eyebrow">CCS · Permitting Intelligence</p><h2>{draftRow.title || 'Untitled saved workflow'}</h2>
              <p className="packet-warning"><strong>UNAPPROVED PROPOSAL — STAFF REVIEW REQUIRED</strong><br/>Saving or printing does not approve requirements, establish jurisdiction authority, select an office or provider, or start job work. Confirm applicability and current adopted requirements with the responsible authorities before use.</p>
              <p>This packet uses only the opened saved snapshot. No unsaved edits, newly loaded evidence or refreshed sources are included. Saved currentness, classifications and review states may be outdated. Recorded links can change; their content and file bytes have not been verified by this packet.</p>
            </header>
            <PacketSection title="Saved draft identity and dates"><RecordedValue value={{
              draft_id: draftRow.id, saved_status: draftRow.status,
              revision: revision?.revision_number ?? 'Revision number not recorded (original or legacy snapshot)',
              saved_at: draftRow.created_date, reviewed_at: draftRow.reviewed_at,
              recorded_revision_details: revision,
              revision_created_at: revision?.created_at, parent_draft_id: revision?.parent_draft_id,
              parent_title: revision?.parent_title, root_draft_id: revision?.root_draft_id, root_title: revision?.root_title,
            }} /></PacketSection>
            <PacketSection title="Project inputs"><RecordedValue value={draftRow.project_inputs} /></PacketSection>
            <PacketSection title="Jurisdiction and authority uncertainty"><RecordedValue value={snapshot.jurisdiction} /><p><strong>Jurisdiction unresolved:</strong> <RecordedValue value={snapshot.jurisdiction_unresolved} /></p><p>Recorded identity is not a new location or authority verification.</p></PacketSection>
            <PacketSection title="Offices and separate electrical planning">
              <p>Permit issuer and inspection provider are separate responsibilities. A missing role or generic contact does not establish either responsibility. Confirm applicability, service area, delegation and inspection stages.</p>
              <RecordedValue value={snapshot.electrical_planning_handoff} />
              {!snapshot.electrical_planning_handoff && <p>Separate electrical permit issuer and inspection provider planning was not recorded. Responsibility remains unresolved.</p>}
              {Object.keys(snapshot).filter(key => /office/i.test(key)).map(key => <div key={key}><h4>{draftFieldLabel(key)}</h4><RecordedValue value={snapshot[key]} /></div>)}
              <p>Other recorded offices appear in each proposed action below.</p>
            </PacketSection>
            <PacketSection title="Saved workflow summary"><RecordedValue value={snapshot.summary} /></PacketSection>
            <PacketSection title="Proposed actions, documents and evidence">
              {!steps.length && <p>No proposed steps recorded.</p>}
              {steps.map((step, index) => <section key={index} className="packet-step" aria-label={'Proposed step ' + (index + 1)}>
                <h4>Step {index + 1}{step.permit_type ? ' · ' + step.permit_type : ''}</h4>
                <RecordedValue value={Object.fromEntries(Object.entries(step).filter(([key]) => !['step_index', 'citations', 'dependencies'].includes(key)))} />
                <p><strong>Dependencies (saved step positions):</strong> {Array.isArray(step.dependencies) && step.dependencies.length
                  ? step.dependencies.map(value => Number.isInteger(value) && value >= 0 && value < steps.length ? 'Step ' + (value + 1) : 'Unresolved saved reference: ' + String(value)).join('; ')
                  : 'None recorded — confirm sequencing'}</p>
                <p>Timing is proposed relative to the workflow start; it is not a verified statutory deadline. Evidence basis and staff edits remain subject to review.</p>
                <h5>Full saved citations</h5>
                {!step.citations?.length && <p>No citations recorded. Confirm the evidence for this action.</p>}
                {(Array.isArray(step.citations) ? step.citations : []).map((citation, citationIndex) => <section className="packet-citation" key={citationIndex}>
                  <h6>Step {index + 1} · Citation {citationIndex + 1}</h6>
                  <RecordedValue value={citation} />
                  {!snapshot.source_evidence?.[citation?.source_document_id] && <p className="packet-warning">Captured source metadata was not recorded for this citation. The exact cited version remains unverified; no current record has been substituted.</p>}
                </section>)}
              </section>)}
            </PacketSection>
            <PacketSection title="Captured source metadata">
              <p>Metadata below was captured with this saved draft or inherited by this revision. It does not prove that a quotation is accurate, that file bytes match, or that an authority is current or approved. Draft, proposed, historical, superseded and unverified material remains subject to confirmation.</p>
              {snapshot.source_evidence && Object.keys(snapshot.source_evidence).length ? Object.entries(snapshot.source_evidence).map(([id, source]) => <section className="packet-source" key={id}><h4>Source {id}</h4><RecordedValue value={source} /></section>)
                : <p>No captured source metadata recorded. Legacy snapshots have not been backfilled; cited versions and currentness remain unverified.</p>}
            </PacketSection>
            <PacketSection title="Gaps and unresolved questions"><RecordedValue value={snapshot.gaps} /></PacketSection>
            <PacketSection title="Saved review notes"><RecordedValue value={draftRow.review_notes} /></PacketSection>
            <PacketSection title="Additional saved context"><RecordedValue value={Object.fromEntries(Object.entries(snapshot).filter(([key]) => !['jurisdiction', 'jurisdiction_unresolved', 'electrical_planning_handoff', 'summary', 'steps', 'source_evidence', 'gaps', 'draft_revision'].includes(key) && !/office/i.test(key)))} /></PacketSection>
            <footer><strong>Unapproved saved proposal</strong> · Draft {draftRow.id || 'ID not recorded'} · Confirm unresolved questions, offices and current requirements before use.</footer>
          </article>
        </div>
      </DialogPrimitive.Content>
    </DialogPortal>
  </Dialog>;
}

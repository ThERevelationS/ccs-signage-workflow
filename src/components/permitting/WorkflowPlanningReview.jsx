import { Label } from '@/components/ui/label';
import { PLANNING_REVIEW_DECISIONS, PLANNING_FOLLOW_UP_AREAS, planningReviewDecisionLabel, planningReviewIssues } from './workflowPlanningReview.mjs';

export default function WorkflowPlanningReview({ step, index, editable, onChange }) {
  const review = step.staff_review || {};
  const decision = review.decision || 'not_reviewed';
  const issues = planningReviewIssues([step]);
  const id = 'pwd-planning-review-' + index;
  return <section aria-label={'Staff planning review for step ' + (index + 1)} className="min-w-0 space-y-3 rounded border border-purple-200 bg-purple-50 p-3 [overflow-wrap:anywhere]">
    <h4 className="text-sm font-semibold">Staff planning review · step {index + 1}</h4>
    <p>Planning notes only. These decisions do not approve requirements, confirm current authority, remove proposed steps or authorize job work.</p>
    {review.invalidated_by_step_edit && <p className="rounded bg-amber-100 p-2 text-amber-950">The proposed step changed after its review ({review.invalidated_by_step_edit}). Recheck the earlier decision and open follow-up areas.</p>}
    {editable ? <fieldset className="min-w-0 space-y-3">
      <legend className="sr-only">Edit staff planning review for step {index + 1}</legend>
      <div><Label htmlFor={id + '-decision'}>Planning decision for step {index + 1}</Label>
        <select id={id + '-decision'} className="min-h-11 w-full min-w-0 rounded border bg-white p-2 text-sm" value={decision} onChange={event => onChange('decision', event.target.value)}>
          {!PLANNING_REVIEW_DECISIONS.some(([key]) => key === decision) && <option value={decision}>{planningReviewDecisionLabel(decision)}</option>}
          {PLANNING_REVIEW_DECISIONS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select>
      </div>
      <fieldset className="min-w-0 space-y-2"><legend className="font-semibold">Open follow-up areas · step {index + 1}</legend>
        {PLANNING_FOLLOW_UP_AREAS.map(([key, label]) => <label key={key} className="flex min-h-11 min-w-0 items-center gap-2 rounded border bg-white p-2"><input type="checkbox" checked={review.follow_up?.[key] === true} onChange={event => onChange('follow_up.' + key, event.target.checked)} /><span>{label} follow-up for step {index + 1}</span></label>)}
        <p>Selecting an area sets Needs follow-up. Resolve and clear open areas before choosing another decision.</p>
      </fieldset>
      <div><Label htmlFor={id + '-reason'}>Review reason for step {index + 1}</Label><textarea id={id + '-reason'} value={review.reason || ''} onChange={event => onChange('reason', event.target.value)} className="min-h-24 w-full min-w-0 rounded border bg-white p-3 text-sm" /><p>Required for Needs follow-up and Proposed not applicable. Include the evidence or question behind the decision.</p></div>
      <div><Label htmlFor={id + '-notes'}>Review notes for step {index + 1}</Label><textarea id={id + '-notes'} value={review.notes || ''} onChange={event => onChange('notes', event.target.value)} className="min-h-24 w-full min-w-0 rounded border bg-white p-3 text-sm" /></div>
      {issues.length > 0 && <ul className="space-y-1 text-amber-950">{issues.map(issue => <li key={issue.message}>{issue.message}</li>)}</ul>}
    </fieldset> : <dl className="space-y-2">
      <div><dt className="font-semibold">Recorded planning decision</dt><dd>{planningReviewDecisionLabel(review.decision)}</dd></div>
      <div><dt className="font-semibold">Open follow-up areas</dt><dd>{PLANNING_FOLLOW_UP_AREAS.filter(([key]) => review.follow_up?.[key] === true).map(([, label]) => label).join('; ') || 'None recorded · not a completeness claim'}</dd></div>
      <div><dt className="font-semibold">Reason</dt><dd className="whitespace-pre-wrap">{review.reason || 'Not recorded'}</dd></div>
      <div><dt className="font-semibold">Review notes</dt><dd className="whitespace-pre-wrap">{review.notes || 'Not recorded'}</dd></div>
      <div><dt className="font-semibold">Last edited</dt><dd>{review.edited_at || 'Not recorded'}</dd></div>
      {!step.staff_review && <p>No staff planning review was recorded in this snapshot. Create an editable revision to add one.</p>}
    </dl>}
  </section>;
}


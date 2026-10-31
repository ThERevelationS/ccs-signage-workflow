import { Label } from '@/components/ui/label';
import { PLANNING_REVIEW_DECISIONS, PLANNING_FOLLOW_UP_AREAS, planningReviewDecisionLabel, planningReviewIssues } from './workflowPlanningReview.mjs';

export default function WorkflowPlanningReview({ step, index, editable, onChange }) {
  const review = step.staff_review || {};
  const decision = review.decision || 'not_reviewed';
  const issues = planningReviewIssues([step]);
  const id = 'pwd-planning-review-' + index;
  return <section aria-label={'Staff check for step ' + (index + 1)} className="min-w-0 space-y-3 rounded border border-purple-200 bg-purple-50 p-3 [overflow-wrap:anywhere]">
    <h4 className="text-sm font-semibold">Staff check · step {index + 1}</h4>
    <p>Just planning notes — they don't approve anything, confirm who's in charge, remove steps, or start work.</p>
    {review.invalidated_by_step_edit && <p className="rounded bg-amber-100 p-2 text-amber-950">The step changed after it was checked ({review.invalidated_by_step_edit}). Look at it again and clear the open items.</p>}
    {editable ? <fieldset className="min-w-0 space-y-3">
      <legend className="sr-only">Edit the staff check for step {index + 1}</legend>
      <div><Label htmlFor={id + '-decision'}>Check status for step {index + 1}</Label>
        <select id={id + '-decision'} className="min-h-11 w-full min-w-0 rounded border bg-white p-2 text-sm" value={decision} onChange={event => onChange('decision', event.target.value)}>
          {!PLANNING_REVIEW_DECISIONS.some(([key]) => key === decision) && <option value={decision}>{planningReviewDecisionLabel(decision)}</option>}
          {PLANNING_REVIEW_DECISIONS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select>
      </div>
      <fieldset className="min-w-0 space-y-2"><legend className="font-semibold">Still open · step {index + 1}</legend>
        {PLANNING_FOLLOW_UP_AREAS.map(([key, label]) => <label key={key} className="flex min-h-11 min-w-0 items-center gap-2 rounded border bg-white p-2"><input type="checkbox" checked={review.follow_up?.[key] === true} onChange={event => onChange('follow_up.' + key, event.target.checked)} /><span>{label} still open</span></label>)}
        <p>Checking a box marks the step "still needs a look". Answer them and uncheck before picking another status.</p>
      </fieldset>
      <div><Label htmlFor={id + '-reason'}>Why — step {index + 1}</Label><textarea id={id + '-reason'} value={review.reason || ''} onChange={event => onChange('reason', event.target.value)} className="min-h-24 w-full min-w-0 rounded border bg-white p-3 text-sm" /><p>Needed when it still needs a look or is marked not needed. Say what you saw or what the question is.</p></div>
      <div><Label htmlFor={id + '-notes'}>Notes — step {index + 1}</Label><textarea id={id + '-notes'} value={review.notes || ''} onChange={event => onChange('notes', event.target.value)} className="min-h-24 w-full min-w-0 rounded border bg-white p-3 text-sm" /></div>
      {issues.length > 0 && <ul className="space-y-1 text-amber-950">{issues.map(issue => <li key={issue.message}>{issue.message}</li>)}</ul>}
    </fieldset> : <dl className="space-y-2">
      <div><dt className="font-semibold">Saved status</dt><dd>{planningReviewDecisionLabel(review.decision)}</dd></div>
      <div><dt className="font-semibold">Still open</dt><dd>{PLANNING_FOLLOW_UP_AREAS.filter(([key]) => review.follow_up?.[key] === true).map(([, label]) => label).join('; ') || "Nothing saved — doesn't mean it's done"}</dd></div>
      <div><dt className="font-semibold">Why</dt><dd className="whitespace-pre-wrap">{review.reason || 'Not saved'}</dd></div>
      <div><dt className="font-semibold">Notes</dt><dd className="whitespace-pre-wrap">{review.notes || 'Not saved'}</dd></div>
      <div><dt className="font-semibold">Last edited</dt><dd>{review.edited_at || 'Not saved'}</dd></div>
      {!step.staff_review && <p>Nobody checked this step in the saved copy. Make a copy you can change to add a check.</p>}
    </dl>}
  </section>;
}


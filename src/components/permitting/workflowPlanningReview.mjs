// Planning annotations only. Never authority approval or operational eligibility.
export const PLANNING_REVIEW_DECISIONS = [
  ['not_reviewed', 'Not reviewed'],
  ['needs_follow_up', 'Needs follow-up'],
  ['reviewed_for_planning', 'Reviewed for planning'],
  ['not_applicable_proposal', 'Proposed not applicable'],
];
export const PLANNING_FOLLOW_UP_AREAS = [['evidence', 'Evidence'], ['office', 'Office / provider'], ['documents', 'Documents / forms']];
export function planningReviewDecisionLabel(value) {
  return PLANNING_REVIEW_DECISIONS.find(([key]) => key === value)?.[1] || (value ? 'Unrecognized saved decision: ' + value : 'Not reviewed');
}
export function editPlanningReview(previous, field, value, timestamp = new Date().toISOString()) {
  const prior = previous && typeof previous === 'object' ? previous : {};
  const next = { ...prior, edited_at: timestamp };
  if (field.startsWith('follow_up.')) {
    next.follow_up = { ...prior.follow_up, [field.slice(10)]: value === true };
    if (value === true) next.decision = 'needs_follow_up';
  } else {
    next[field] = value;
    if (field === 'decision') delete next.invalidated_by_step_edit;
  }
  return next;
}
export function invalidatePlanningReview(previous, field, timestamp = new Date().toISOString()) {
  if (!previous || typeof previous !== 'object') return previous;
  const area = ['office', 'office_type'].includes(field) ? 'office' : ['required_documents', 'required_forms'].includes(field) ? 'documents' : 'evidence';
  return { ...previous, decision: 'needs_follow_up', follow_up: { ...previous.follow_up, [area]: true }, invalidated_by_step_edit: field, edited_at: timestamp };
}
export function planningReviewIssues(steps = []) {
  return steps.flatMap((step, index) => {
    const review = step.staff_review;
    if (!review) return [];
    const issues = [];
    const decision = review.decision || 'not_reviewed';
    if (!PLANNING_REVIEW_DECISIONS.some(([key]) => key === decision)) issues.push('Choose a recognized planning review decision.');
    if (['needs_follow_up', 'not_applicable_proposal'].includes(decision) && !String(review.reason || '').trim()) issues.push('Add a reason for follow-up or a proposed not-applicable decision.');
    if (decision !== 'needs_follow_up' && Object.values(review.follow_up || {}).some(value => value === true)) issues.push('Open follow-up areas require Needs follow-up. Clear them only after resolving the questions.');
    return issues.map(message => ({ index, message }));
  });
}
export function planningReviewSummary(steps = []) {
  const result = Object.fromEntries(PLANNING_REVIEW_DECISIONS.map(([key]) => [key, 0]));
  for (const step of steps) {
    const decision = step.staff_review?.decision || 'not_reviewed';
    result[Object.hasOwn(result, decision) ? decision : 'not_reviewed']++;
  }
  return result;
}


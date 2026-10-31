import { PLANNING_REVIEW_DECISIONS, PLANNING_FOLLOW_UP_AREAS } from './workflowPlanningReview.mjs';

// Loaded immutable snapshots only. No revision selection, source reads or record writes.
export function savedReviewDecision(step) {
  const value = step?.staff_review?.decision || 'not_reviewed';
  return PLANNING_REVIEW_DECISIONS.some(([key]) => key === value) ? value : 'unrecognized';
}
export function savedFollowUpAreas(step) {
  const flags = step?.staff_review?.follow_up || {};
  const known = PLANNING_FOLLOW_UP_AREAS.filter(([key]) => flags[key] === true).map(([, label]) => label);
  if (Object.entries(flags).some(([key, value]) => value === true && !PLANNING_FOLLOW_UP_AREAS.some(([area]) => area === key))) known.push('Something else');
  return known;
}
const includes = (value, query) => String(value ?? '').toLowerCase().includes(query);
export function savedDraftReviewView(row, { query = '', state = 'all', decision = 'all', area = 'all' } = {}) {
  const steps = Array.isArray(row.snapshot?.steps) ? row.snapshot.steps : [];
  const text = query.trim().toLowerCase();
  const draftTextMatches = !text || [row.title, row.jurisdiction_name, row.state, row.project_inputs?.signTypes, row.review_notes].some(value => includes(value, text));
  const summary = { ...Object.fromEntries(PLANNING_REVIEW_DECISIONS.map(([key]) => [key, 0])), unrecognized: 0, open_follow_up: 0, missing_review: 0 };
  const matchingSteps = [];
  steps.forEach((step, index) => {
    const recordedDecision = savedReviewDecision(step);
    summary[recordedDecision]++;
    if (!step.staff_review) summary.missing_review++;
    const areas = savedFollowUpAreas(step);
    if (areas.length) summary.open_follow_up++;
    const decisionMatches = decision === 'all' || decision === recordedDecision;
    const areaMatches = area === 'all' || (area === 'any' ? areas.length > 0 : step.staff_review?.follow_up?.[area] === true);
    const stepTextMatches = draftTextMatches || [step.permit_type, step.office, step.action, step.staff_review?.reason, step.staff_review?.notes].some(value => includes(value, text));
    if (decisionMatches && areaMatches && stepTextMatches) matchingSteps.push({ index, step, areas, decision: recordedDecision });
  });
  const filtered = decision !== 'all' || area !== 'all';
  return { row, steps, summary, matchingSteps, matches: (state === 'all' || row.state === state) && (filtered ? matchingSteps.length > 0 : draftTextMatches || matchingSteps.length > 0) };
}


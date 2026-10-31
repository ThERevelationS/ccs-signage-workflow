// Compare retained permitting snapshots only. No regeneration or record mutation.
const labelOverrides = {
  staff_review: 'Staff notes',
  signTypes: 'Sign types', emcDigital: 'EMC / digital', electricalWork: 'Electrical work',
  temporaryVsPermanent: 'Temporary / permanent', newVsReplacement: 'New / replacement',
  jurisdiction_unresolved: 'No office picked yet', electrical_planning_handoff: 'Handoff to the electrical office',
};
export function draftFieldLabel(key) {
  return labelOverrides[key] || key.replace(/([a-z])([A-Z])/g, '$1 $2').replaceAll('_', ' ').replace(/^./, c => c.toUpperCase());
}
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}
export function sameDraftValue(a, b) {
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
}
export function compareSavedDrafts(earlier, current) {
  const rows = [];
  const add = (group, label, before, after, always = false) => rows.push({group, label, before, after, always, changed: !sameDraftValue(before, after)});
  const fields = (group, a = {}, b = {}, prefix = '') => {
    for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) add(group, prefix + draftFieldLabel(key), a[key], b[key]);
  };
  fields('Job details', earlier.project_inputs || {}, current.project_inputs || {});
  const a = earlier.snapshot || {}, b = current.snapshot || {};
  fields('Offices', a.jurisdiction || {}, b.jurisdiction || {});
  add('Offices', 'No office picked yet', a.jurisdiction_unresolved, b.jurisdiction_unresolved);
  add('Offices', 'Handoff to the electrical office', a.electrical_planning_handoff, b.electrical_planning_handoff);
  // Steps are compared by their saved position, never by a guessed identity.
  const beforeSteps = Array.isArray(a.steps) ? a.steps : [], afterSteps = Array.isArray(b.steps) ? b.steps : [];
  for (let index = 0; index < Math.max(beforeSteps.length, afterSteps.length); index++) {
    const left = beforeSteps[index] || {}, right = afterSteps[index] || {};
    for (const key of new Set([...Object.keys(left), ...Object.keys(right), 'citations'])) {
      if (key === 'step_index') continue;
      const group = key === 'staff_review' ? 'Staff notes' : key === 'citations' ? 'Sources' : ['office', 'office_type', 'issuing_office', 'jurisdiction_name'].includes(key) ? 'Offices' : 'Planned steps';
      add(group, 'Step ' + (index + 1) + ' · ' + draftFieldLabel(key), left[key], right[key], ['citations', 'staff_review'].includes(key));
    }
  }
  add('Open questions', 'Questions still open', a.gaps, b.gaps, true);
  add('Notes', 'Notes / questions to check', earlier.review_notes, current.review_notes, true);
  add('About this plan', 'Plan name', earlier.title, current.title);
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (!['steps', 'gaps', 'jurisdiction', 'jurisdiction_unresolved', 'electrical_planning_handoff', 'draft_revision'].includes(key)) add('About this plan', draftFieldLabel(key), a[key], b[key]);
  }
  return rows;
}
export function validateDraftAncestor(row, expectedId, current, loaded) {
  if (!row || row.id !== expectedId || !row.snapshot?.jurisdiction || !Array.isArray(row.snapshot.steps)) throw new Error('Earlier snapshot is incomplete.');
  const root = current.snapshot?.draft_revision?.root_draft_id || current.id;
  const rowRoot = row.snapshot.draft_revision?.root_draft_id || row.id;
  if (root !== rowRoot || loaded.some(item => item.id === row.id)) throw new Error('Earlier snapshot has inconsistent revision links.');
  return row;
}


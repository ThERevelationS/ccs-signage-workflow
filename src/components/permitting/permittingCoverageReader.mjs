// Read-only snapshot traversal. Page size is a request unit, never a total cap.
export async function readAllCoveragePages(readPage, { isCurrent = () => true, onProgress = () => {} } = {}) {
  const rows = new Map(), cursors = new Set();
  let cursor;
  do {
    if (!isCurrent()) throw Error('Coverage read superseded');
    const page = await readPage(cursor);
    if (!isCurrent()) throw Error('Coverage read superseded');
    if (!page || !Array.isArray(page.items) || typeof page.has_more !== 'boolean') throw Error('Invalid coverage page');
    for (const row of page.items) {
      if (!row?.id) throw Error('Coverage row has no stable identity');
      rows.set(row.id, row);
    }
    onProgress(rows.size);
    if (!page.has_more) break;
    if (!page.next_cursor || cursors.has(page.next_cursor)) throw Error('Coverage cursor did not advance');
    cursors.add(page.next_cursor); cursor = page.next_cursor;
  } while (true);
  return [...rows.values()];
}
const normalized = value => String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
function identity(row, profile = false) {
  const state = normalized(row.state), type = normalized(profile ? row.type : row.jurisdiction_type);
  const name = normalized(profile ? row.name : row.jurisdiction_name);
  const county = type === 'county' ? '' : normalized(profile ? row.parent_county?.name : row.parent_county_name);
  if (!['oh', 'ky'].includes(state) || !name || !['county','city','village','township','planning_unit'].includes(type) || (type !== 'county' && !county)) return null;
  return JSON.stringify([state,type,county,name]);
}
export function reconcileRecordedCoverage(queue, profiles) {
  const grouped = new Map(), invalidProfileIds = [];
  for (const profile of profiles) {
    const key = identity(profile, true);
    if (!key) { invalidProfileIds.push(profile.id); continue; }
    grouped.set(key, [...(grouped.get(key) || []), profile.id]);
  }
  const queueKeys = new Map();
  for (const row of queue) { const key = identity(row); if (key) queueKeys.set(key, [...(queueKeys.get(key) || []), row.id]); }
  const items = queue.map(row => {
    const key = identity(row), candidates = key ? grouped.get(key) || [] : [];
    const state = !key ? 'identity_incomplete' : queueKeys.get(key).length > 1 ? 'duplicate_queue_identity' : candidates.length > 1 ? 'ambiguous_profiles' : candidates.length === 1 ? 'single_profile_candidate' : 'profile_missing';
    return { queue_id: row.id, state, candidate_profile_ids: candidates };
  });
  return { items, invalid_profile_ids: invalidProfileIds,
    unmatched_profile_ids: [...grouped].filter(([key]) => !queueKeys.has(key)).flatMap(([,ids]) => ids),
    inventory_complete: false, authority_verified: false,
    notice: 'Recorded inventory reconciliation only. Name/type/county candidates are not canonical authority matches or statewide completeness.' };
}

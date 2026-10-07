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

const geographicName = value => normalized(value).replace(/^(city|village|township|county) of\s+/, '').replace(/\s+(county|township|city|village)$/, '');
export function reconcileOfficialInventory(queue, profiles, reference) {
  if (!reference || !Array.isArray(reference.rows) || reference.source_rows !== reference.rows.length) throw Error('Invalid official inventory');
  const keys = new Set();
  for (const r of reference.rows) {
    if (!r.key || keys.has(r.key) || !['OH','KY'].includes(r.state)) throw Error('Invalid official inventory identity');
    keys.add(r.key);
  }
  const candidates = reference.rows.filter(r => r.category === 'candidate');
  function reconcile(rows, profile) {
    const assessments = rows.map(row => {
      const state = normalized(row.state).toUpperCase(), type = normalized(profile ? row.type : row.jurisdiction_type);
      const name = geographicName(profile ? row.name : row.jurisdiction_name);
      const county = geographicName(profile ? row.parent_county?.name : row.parent_county_name);
      const hits = candidates.filter(r => r.state === state && r.type === type && geographicName(r.name) === name &&
        (type !== 'township' || !county || geographicName(r.county_name) === county));
      const review_flags = [];
      if (['city','village'].includes(type)) review_flags.push('official_county_relationship_pending');
      if (type === 'township' && !county) review_flags.push('parent_county_missing');
      if (!['county','city','village','township'].includes(type)) review_flags.push('unsupported_type');
      return { id:row.id, state:!hits.length?'unmatched':hits.length>1?'ambiguous':'single_geographic_candidate',
        candidate_keys:hits.map(r=>r.key), review_flags, canonical_identity_verified:false };
    });
    const represented = new Set(assessments.flatMap(r=>r.candidate_keys));
    return { assessments, missing:candidates.filter(r=>!represented.has(r.key)) };
  }
  return { source_vintage:reference.source_vintage,source_rows:reference.source_rows,
    candidate_counts:Object.fromEntries(['OH','KY'].map(state=>[state,candidates.filter(r=>r.state===state).length])),
    status_review_count:reference.rows.filter(r=>r.category==='status_relationship_review').length,
    statistical_reference_count:reference.rows.filter(r=>r.category==='statistical_reference').length,
    queue:reconcile(queue,false),profiles:reconcile(profiles,true),
    geographic_snapshot_accounted_for:true,inventory_complete_for_permitting:false,authority_verified:false,
    gaps:['Geographic candidates are not verified permitting authorities.','Incorporated-place county relationships and consolidated/status-review entities remain explicit review items.','Forms, archives, electrical permit issuance, electrical inspection and staff approval require separate evidence review.'],
    notice:'Missing means no name/type candidate in this permission-scoped read; it does not prove absent government or authority.' };
}

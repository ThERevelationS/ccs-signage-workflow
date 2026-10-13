import { summarizeMatchedLocalityAuthority } from '../../../base44/shared/permittingAddressLocality.js';

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
      if (typeof row?.id!=='string' || !row.id.trim() || row.id!==row.id.trim()) throw Error('Coverage row has no stable identity');
      if (rows.has(row.id)) throw Error('Coverage records repeated during pagination. Refresh recorded coverage before using these counts.');
      rows.set(row.id, row);
    }
    onProgress(rows.size);
    if (!page.has_more) break;
    if (typeof page.next_cursor!=='string' || !page.next_cursor.trim()) throw Error('Invalid coverage continuation token. Refresh recorded coverage.');
    if (cursors.has(page.next_cursor)) throw Error('Coverage cursor did not advance');
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

function geographicName(value, type) {
  const name = normalized(value);
  if (!['county','city','village','township'].includes(type)) return name;
  const withoutPrefix = name.replace(new RegExp('^'+type+' of\\s+'), '');
  // City/Village can be part of an official municipal name (Grove City, Bay Village).
  return ['county','township'].includes(type) ? withoutPrefix.replace(new RegExp('\\s+'+type+'$'), '') : withoutPrefix;
}
export function reconcileOfficialInventory(queue, profiles, reference) {
  if (!reference || !Array.isArray(reference.rows) || reference.source_rows !== reference.rows.length) throw Error('Invalid official inventory');
  const keys = new Set();
  for (const r of reference.rows) {
    if (!r || typeof r.key!=='string' || !r.key.trim() || r.key!==r.key.trim() || keys.has(r.key)
      || !['OH','KY'].includes(r.state) || typeof r.name!=='string' || !r.name.trim()) throw Error('Invalid official inventory identity');
    if (!['candidate','status_relationship_review','statistical_reference'].includes(r.category)) throw Error('Invalid official inventory category');
    if (r.category==='candidate' && !['county','city','village','township'].includes(r.type)) throw Error('Invalid official inventory candidate type');
    if (r.category==='candidate' && r.type==='township' && (typeof r.county_name!=='string' || !geographicName(r.county_name,'county')))
      throw Error('Official township candidate has no usable county identity');
    keys.add(r.key);
  }
  const candidates = reference.rows.filter(r => r.category === 'candidate');
  function reconcile(rows, profile) {
    const assessments = rows.map(row => {
      const state = normalized(row.state).toUpperCase(), type = normalized(profile ? row.type : row.jurisdiction_type);
      const name = geographicName(profile ? row.name : row.jurisdiction_name, type);
      const county = geographicName(profile ? row.parent_county?.name : row.parent_county_name, 'county');
      const nameHits = candidates.filter(r => r.state === state && r.type === type && geographicName(r.name, r.type) === name);
      const hits = nameHits.filter(r => type !== 'township' || !county || geographicName(r.county_name, 'county') === county);
      const review_flags = [];
      if (['city','village'].includes(type)) review_flags.push('official_county_relationship_pending');
      if (type === 'township' && !county) review_flags.push('parent_county_missing');
      if (type === 'township' && county && nameHits.length && !hits.length) review_flags.push('parent_county_conflict');
      if (!['county','city','village','township'].includes(type)) review_flags.push('unsupported_type');
      return { id:row.id, name:String((profile ? row.name : row.jurisdiction_name) || 'Unnamed record'), record_state:state, recorded_county:String((profile ? row.parent_county?.name : row.parent_county_name) || ''), type, state:!hits.length?'unmatched':hits.length>1?'ambiguous':'single_geographic_candidate',
        candidate_keys:hits.map(r=>r.key), candidate_details:hits.map(r=>({key:r.key,state:r.state,type:r.type,name:r.name,county_name:r.county_name || ''})), review_flags, canonical_identity_verified:false };
    });
    const candidateRecords = new Map();
    for (const row of assessments) for (const key of row.candidate_keys)
      candidateRecords.set(key, [...(candidateRecords.get(key) || []), row.id]);
    for (const row of assessments) {
      row.overlapping_record_ids = [...new Set(row.candidate_keys.flatMap(key=>candidateRecords.get(key)).filter(id=>id!==row.id))];
      if (row.overlapping_record_ids.length) row.review_flags.push('shared_geographic_candidate');
    }
    const statePriority = state => state==='OH' ? 0 : state==='KY' ? 1 : 2;
    const reviewOrder = (a,b) => statePriority(a.record_state || a.state)-statePriority(b.record_state || b.state)
      || String(a.name).localeCompare(String(b.name)) || String(a.id || a.key).localeCompare(String(b.id || b.key));
    const represented = new Set(assessments.flatMap(r=>r.candidate_keys));
    return { assessments, identity_review:assessments.filter(row=>row.state!=='single_geographic_candidate' || row.review_flags.length>0).sort(reviewOrder), missing:candidates.filter(r=>!represented.has(r.key)).sort(reviewOrder) };
  }
  if (reference.sources!==undefined && !Array.isArray(reference.sources)) throw Error('Invalid official inventory sources');
  const sourceFiles = new Set();
  const sourceReferences = (reference.sources || []).map(source => {
    let url;
    try { url = new URL(source?.url); } catch { throw Error('Invalid official inventory source URL'); }
    if (url.protocol!=='https:' || url.username || url.password || url.hostname!=='tigerweb.geo.census.gov'
      || typeof source.file!=='string' || !source.file.trim() || source.file!==source.file.trim() || sourceFiles.has(source.file) || !/^[a-f0-9]{64}$/.test(source.sha256 || ''))
      throw Error('Invalid official inventory source reference');
    sourceFiles.add(source.file);
    return {file:source.file,url:source.url,sha256:source.sha256};
  });
  if (reference.sources!==undefined && reference.rows.some(row=>!sourceFiles.has(row.source_file)))
    throw Error('Official inventory row has no unique retained source reference');
  return { source_vintage:reference.source_vintage,source_rows:reference.source_rows,
    source_references:sourceReferences,
    source_row_counts:Object.fromEntries(sourceReferences.map(source=>{
      const rows=reference.rows.filter(row=>row.source_file===source.file);
      return [source.file,{total:rows.length,candidates:rows.filter(row=>row.category==='candidate').length,status_review:rows.filter(row=>row.category==='status_relationship_review').length,statistical:rows.filter(row=>row.category==='statistical_reference').length}];
    })),
    candidate_counts:Object.fromEntries(['OH','KY'].map(state=>[state,candidates.filter(r=>r.state===state).length])),
    status_review_count:reference.rows.filter(r=>r.category==='status_relationship_review').length,
    status_review_items:reference.rows.filter(r=>r.category==='status_relationship_review').map(row=>({...row})).sort((a,b)=>(a.state==='OH'?0:1)-(b.state==='OH'?0:1) || a.name.localeCompare(b.name) || a.key.localeCompare(b.key)),
    statistical_reference_count:reference.rows.filter(r=>r.category==='statistical_reference').length,
    queue:reconcile(queue,false),profiles:reconcile(profiles,true),
    geographic_snapshot_accounted_for:true,inventory_complete_for_permitting:false,authority_verified:false,
    gaps:['Geographic candidates are not verified permitting authorities.','Incorporated-place county relationships and consolidated/status-review entities remain explicit review items.','Forms, archives, electrical permit issuance, electrical inspection and staff approval require separate evidence review.'],
    notice:'Missing means no name/type candidate in this permission-scoped read; it does not prove absent government or authority.' };
}

export function reconcileElectricalOfficeCoverage(localities) {
  if (!Array.isArray(localities)) throw Error('Invalid electrical office coverage records');
  const roles = ['electrical_permit', 'electrical_inspection'];
  const states = Object.fromEntries(['OH','KY'].map(state => [state, {
    locality_count: 0, both_roles_reviewed: 0, legacy_broad_role_count: 0,
    roles: Object.fromEntries(roles.map(role => [role, {staff_verified:0, needs_review:0, missing:0}]))
  }]));
  const seen = new Set(), gaps = [], excluded_record_ids = [];
  for (const row of localities) {
    if (!row?.id || seen.has(row.id)) throw Error('Electrical office coverage identity missing or duplicated');
    seen.add(row.id);
    const state = String(row.state || '').trim().toUpperCase();
    if (!states[state]) { excluded_record_ids.push(row.id); continue; }
    const coverage = summarizeMatchedLocalityAuthority(row).electrical_coverage;
    const counts = states[state]; counts.locality_count++;
    for (const role of roles) counts.roles[role][coverage.roles[role]]++;
    if (!coverage.missing_roles.length) counts.both_roles_reviewed++;
    if (coverage.legacy_broad_role_present) counts.legacy_broad_role_count++;
    if (coverage.missing_roles.length) gaps.push({
      id:row.id, name:String(row.name || 'Unnamed locality'), state, roles:coverage.roles,
      legacy_broad_role_present:coverage.legacy_broad_role_present
    });
  }
  gaps.sort((a,b) => ['OH','KY'].indexOf(a.state)-['OH','KY'].indexOf(b.state) || a.name.localeCompare(b.name));
  return {states, gaps, excluded_record_ids, inventory_complete:false, applicability_verified:false,
    notice:'Saved locality office relationships within your read permissions only. This does not establish statewide electrical coverage, jurisdiction identity or project applicability.'};
}

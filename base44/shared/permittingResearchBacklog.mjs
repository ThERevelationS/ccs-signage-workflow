const norm = (value) => String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

export const normalizeResearchJurisdictionType = (value) => {
  const type = norm(value);
  return ['county', 'city', 'village', 'township', 'planning_unit'].includes(type) ? type : 'city';
};

export const jurisdictionProfileTypeForQueueRow = (row = {}) => {
  const type = normalizeResearchJurisdictionType(row?.jurisdiction_type);
  return ['county', 'city', 'township'].includes(type) ? type : 'municipality';
};

export const profileHasResearchEvidence = (profile = {}) => {
  if (String(profile?.website_url || '').trim()) return true;
  if (String(profile?.permitting_url || '').trim()) return true;
  if (String(profile?.ai_summary || '').trim()) return true;
  if (Array.isArray(profile?.documents) && profile.documents.length > 0) return true;
  if (profile?.permit_requirements && Object.keys(profile.permit_requirements).length > 0) return true;
  if (profile?.contact_info && Object.values(profile.contact_info).some((value) => String(value || '').trim())) return true;
  return false;
};

export function queueResearchIdentity(row = {}) {
  const type = normalizeResearchJurisdictionType(row.jurisdiction_type);
  const parent = type === 'county' ? '' : norm(row.parent_county_name);
  return [norm(row.jurisdiction_name), norm(row.state), type, parent].join('|');
}

function researchParent(value) {
  const key = norm(value);
  return ["information not found", "unknown", "n/a", "not found", "not available"].includes(key) ? "" : key;
}

function profileParent(profile = {}) {
  return researchParent(profile?.parent_county?.name || profile?.parent_county_name);
}

export function profileMatchesQueueRow(row = {}, profile = {}, sameNameStateProfiles = []) {
  if (norm(row.jurisdiction_name) !== norm(profile.name) || norm(row.state) !== norm(profile.state)) return false;

  const queueType = norm(row.jurisdiction_type);
  const profileType = norm(profile.type);
  const compatible = { county: ["county"], city: ["city"], township: ["township"], village: ["village", "municipality"], planning_unit: ["municipality"] };
  if (!compatible[queueType]?.includes(profileType)) return false;
  if (queueType === 'county') return profileType === 'county';

  const queueParent = researchParent(row.parent_county_name);
  const existingParent = profileParent(profile);
  if (queueParent && existingParent) return queueParent === existingParent;

  // Older research-created profiles do not always carry parent_county. Only
  // accept an unqualified name/state match when it is not ambiguous.
  return sameNameStateProfiles.length === 1;
}

// Resolve identity before reconciliation or creation; ambiguous existing rows require review.
export function resolveResearchProfile(row = {}, profiles = []) {
  const matches = profiles.filter(p => norm(p.name) === norm(row.jurisdiction_name) && norm(p.state) === norm(row.state));
  const eligible = matches.filter(p => profileMatchesQueueRow(row, p, matches));
  if (eligible.length === 1) return { profile: eligible[0], conflict: false };
  const parent = researchParent(row.parent_county_name);
  const nearby = matches.filter(p => !parent || !profileParent(p) || parent === profileParent(p));
  return { profile: null, conflict: eligible.length > 1 || nearby.length > 0 };
}

// Ohio-first release policy; stable order within each state and no queue mutation.
export function ohioFirstResearchRows(rows = []) {
  const rank = row => norm(row?.state) === 'oh' ? 0 : norm(row?.state) === 'ky' ? 1 : 2;
  return [...rows].sort((a, b) => rank(a) - rank(b));
}

export function classifyBacklogRows({ queueRows = [], profiles = [], identityProfiles = profiles, inFlightCount = 0, inFlightTarget = 250, maxDispatchPerRun = 50 } = {}) {
  const target = Math.max(1, Number(inFlightTarget) || 250);
  const perRun = Math.max(1, Number(maxDispatchPerRun) || 50);
  const room = Math.max(0, target - Math.max(0, Number(inFlightCount) || 0));

  const byNameState = new Map();
  for (const profile of profiles) {
    const key = `${norm(profile?.name)}|${norm(profile?.state)}`;
    if (!byNameState.has(key)) byNameState.set(key, []);
    byNameState.get(key).push(profile);
  }

  const conflicts = [];
  const reconcile = [];
  const dispatch = [];
  const seen = new Set();

  for (const row of ohioFirstResearchRows(queueRows)) {
    const identity = queueResearchIdentity(row);
    if (!identity || seen.has(identity)) continue;
    seen.add(identity);

    const resolution = resolveResearchProfile(row, identityProfiles);
    if (resolution.conflict) { conflicts.push(row); continue; }
    const nameState = `${norm(row?.jurisdiction_name)}|${norm(row?.state)}`;
    const matchingProfiles = byNameState.get(nameState) || [];
    if (matchingProfiles.some((profile) => profileMatchesQueueRow(row, profile, matchingProfiles))) {
      reconcile.push(row);
      continue;
    }

    if (dispatch.length < Math.min(room, perRun)) dispatch.push(row);
  }

  return {
    room,
    conflicts,
    reconcile,
    dispatch,
    atCapacity: room === 0,
  };
}

export function researchRequestPayload(row = {}, requestedBy = 'continuous_backlog_dispatcher') {
  const type = normalizeResearchJurisdictionType(row.jurisdiction_type);
  const isCounty = type === 'county';
  return {
    jurisdiction_name: String(row.jurisdiction_name || '').trim(),
    state: String(row.state || '').trim().toUpperCase(),
    city: isCounty ? null : String(row.jurisdiction_name || '').trim(),
    county: isCounty ? String(row.jurisdiction_name || '').trim() : (String(row.parent_county_name || '').trim() || null),
    ccs_jurisdiction_id: null,
    status: 'pending',
    requested_by: requestedBy,
  };
}

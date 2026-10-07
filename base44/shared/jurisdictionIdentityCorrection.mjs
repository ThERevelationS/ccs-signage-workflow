// Type-only corrections. Caller must authenticate an administrator and verify the
// retained official bytes/reference relationship before supplying this evidence.
const types = new Set(['county', 'city', 'village', 'township', 'municipality']);
const identityFields = ['id', 'name', 'state', 'type', 'parent_county', 'website_url', 'permitting_url'];
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const fail = message => { throw new Error(message); };
export function buildIdentityTypeCorrection({profile, expected, newType, evidence, actor, requestId, timestamp}) {
  if (!profile?.id || !expected?.updated_date || profile.updated_date !== expected.updated_date)
    fail('Profile version changed or is missing. Reload before correcting identity.');
  for (const field of identityFields) {
    if (!Object.hasOwn(expected, field) || !same(profile[field], expected[field]))
      fail(`Expected profile identity changed or is missing: ${field}.`);
  }
  if (!['OH', 'KY'].includes(profile.state) || !types.has(newType) || newType === profile.type)
    fail('A supported, different locality type is required.');
  if (typeof actor !== 'string' || !actor.trim() || !/^[a-zA-Z0-9_-]{16,100}$/.test(requestId || '') || !Number.isFinite(Date.parse(timestamp)))
    fail('Correction actor, stable request ID and timestamp are required.');
  // Existing receipts and approvals need a dedicated reconciliation path. Never
  // erase them or carry them across an identity change silently.
  if (profile.verification_status === 'verified' || profile.verified_at || profile.verified_by ||
      Object.keys(profile.html_evidence_state || {}).length || Object.keys(profile.office_authority_review_state || {}).length ||
      Object.keys(profile.rewrite_authority || {}).length)
    fail('Identity-bound verification or reservation requires reconciliation before correction.');
  if (!evidence || evidence.profile_id !== profile.id || evidence.new_type !== newType ||
      evidence.state !== profile.state || evidence.official_identity_reviewed !== true ||
      evidence.county_relationship_reviewed !== true || !evidence.reference_key || !evidence.notes?.trim() ||
      !/^[a-f0-9]{64}$/.test(evidence.sha256 || '') || !Number.isFinite(Date.parse(evidence.retrieved_at)))
    fail('Retained official type evidence and reviewed geographic relationship are required.');
  let url;
  try { url = new URL(evidence.source_url); } catch { fail('Official evidence URL is invalid.'); }
  if (url.protocol !== 'https:' || url.username || url.password) fail('Official evidence URL must be HTTPS without credentials.');
  if (profile.activity_log != null && !Array.isArray(profile.activity_log)) fail('Existing correction history is malformed; preserve it for review.');
  const log = profile.activity_log || [];
  if (log.some(row => row.id === requestId)) fail('Correction request already exists; inspect its saved outcome.');
  const before = Object.fromEntries(identityFields.map(field => [field, profile[field] ?? null]));
  const entry = {id:requestId, action:'manual_edit', user:actor.trim(), timestamp,
    description:`Locality type corrected from ${profile.type} to ${newType}; regulatory authority remains unapproved.`,
    changes:{kind:'locality_type_correction', before, after:{...before,type:newType},
      expected_updated_date:expected.updated_date, evidence:structuredClone(evidence), authority_verified:false}};
  return {type:newType, activity_log:[...log,entry]};
}
export async function applyIdentityTypeCorrection({entity, ...input}) {
  const next = buildIdentityTypeCorrection(input);
  if (typeof entity?.updateMany !== 'function' || typeof entity?.get !== 'function') fail('Conditional profile persistence is unavailable.');
  // One exact-version write: history and type commit together. Never rebase an
  // evidence-bound correction onto a newer version or blindly repeat a write.
  let result;
  try {
    result = await entity.updateMany({id:input.profile.id, updated_date:input.expected.updated_date}, {$set:next});
  } catch (error) {
    const after = await entity.get(input.profile.id).catch(() => null);
    const saved = after?.activity_log?.find(row => row.id === input.requestId);
    if (after?.type === next.type && same(saved, next.activity_log.at(-1))) return after;
    throw error;
  }
  if (result?.updated !== 1) fail('Conditional correction did not confirm one saved profile. Reload; do not retry blindly.');
  const saved = await entity.get(input.profile.id);
  if (saved?.type !== next.type || !same(saved.activity_log?.find(row => row.id === input.requestId), next.activity_log.at(-1)))
    fail('Correction readback does not match the saved type and provenance.');
  return saved;
}

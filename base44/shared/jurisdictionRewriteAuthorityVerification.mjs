const VERIFIED = 'verified';
const NOT_VERIFIED = 'not_verified';
const STATUSES = new Set([VERIFIED, NOT_VERIFIED]);

const clean = (value, max = 4000) => String(value ?? '').trim().slice(0, max);

function officialUrl(value, label) {
  const raw = clean(value, 2000);
  if (!raw) throw new Error(`${label} is required before this status can be verified.`);
  let parsed;
  try { parsed = new URL(raw); } catch {
    throw new Error(`${label} must be a valid http(s) URL.`);
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error(`${label} must be a valid http(s) URL.`);
  }
  return parsed.toString();
}

function status(value, label) {
  const normalized = clean(value, 40).toLowerCase() || NOT_VERIFIED;
  if (!STATUSES.has(normalized)) throw new Error(`${label} must be verified or not_verified.`);
  return normalized;
}

export function buildJurisdictionRewriteAuthorityUpdate({ jurisdiction, input, actor, now = () => new Date().toISOString() } = {}) {
  const id = clean(jurisdiction?.id, 200);
  const name = clean(jurisdiction?.name, 300);
  if (!id || !name) throw new Error('A current jurisdiction record is required.');

  const adoptionStatus = status(input?.adoptionStatus, 'Adoption status');
  const effectiveDateStatus = status(input?.effectiveDateStatus, 'Effective-date status');

  const adoptionEvidenceUrl = clean(input?.adoption_evidence_url, 2000);
  const adoptionEvidenceReference = clean(input?.adoption_evidence_reference, 500);
  const effectiveDate = clean(input?.effective_date, 120);
  const effectiveDateEvidenceUrl = clean(input?.effective_date_evidence_url, 2000);
  const verificationNotes = clean(input?.verification_notes, 5000);
  const reviewer = clean(actor?.full_name || actor?.email || actor?.id || 'CCS Admin', 300);
  const verifiedAt = clean(now(), 80);

  if (adoptionStatus === VERIFIED) {
    officialUrl(adoptionEvidenceUrl, 'Official adoption evidence URL');
    if (!adoptionEvidenceReference) {
      throw new Error('An ordinance, resolution, meeting action, or other stable adoption reference is required before adoption can be verified.');
    }
  }

  if (effectiveDateStatus === VERIFIED) {
    if (adoptionStatus !== VERIFIED) {
      throw new Error('Effective-date authority cannot be verified until legislative adoption is verified for the same jurisdiction.');
    }
    officialUrl(effectiveDateEvidenceUrl, 'Official effective-date/applicability evidence URL');
    if (!effectiveDate) {
      throw new Error('An official effective date or applicability statement is required before effectiveness can be verified.');
    }
  }

  return {
    jurisdiction_id: id,
    jurisdiction_name: name,
    adoptionStatus,
    ...(adoptionEvidenceUrl ? { adoption_evidence_url: officialUrl(adoptionEvidenceUrl, 'Official adoption evidence URL') } : {}),
    ...(adoptionEvidenceReference ? { adoption_evidence_reference: adoptionEvidenceReference } : {}),
    ...(adoptionStatus === VERIFIED ? { adoption_verified_at: verifiedAt, adoption_verified_by: reviewer } : {}),
    effectiveDateStatus,
    ...(effectiveDate ? { effective_date: effectiveDate } : {}),
    ...(effectiveDateEvidenceUrl ? { effective_date_evidence_url: officialUrl(effectiveDateEvidenceUrl, 'Official effective-date/applicability evidence URL') } : {}),
    ...(effectiveDateStatus === VERIFIED ? { effective_date_verified_at: verifiedAt, effective_date_verified_by: reviewer } : {}),
    ...(verificationNotes ? { verification_notes: verificationNotes } : {}),
  };
}

export function sameRewriteAuthority(a = {}, b = {}) {
  const normalize = (value) => {
    if (Array.isArray(value)) return value.map(normalize);
    if (!value || typeof value !== 'object') return value;
    return Object.keys(value).sort().reduce((out, key) => {
      out[key] = normalize(value[key]);
      return out;
    }, {});
  };
  return JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));
}

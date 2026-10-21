import { sameDraftValue } from './permitDraftComparison.mjs';

export const electricalResponseRoles = [
  { role: 'electrical_permit', label: 'Electrical permit issuer' },
  { role: 'electrical_inspection', label: 'Electrical inspection provider' },
];
const clone = value => JSON.parse(JSON.stringify(value));
const identity = value => ({ id: value?.id || value?.jurisdiction_id || '', name: value?.name || value?.jurisdiction_name || '', state: value?.state || '', type: value?.type || '' });
const notice = 'Captured office statements are unverified historical evidence. They do not approve authority, resolve an address, establish commercial-sign scope or select an office. Later replies and research changes are not loaded into this saved snapshot.';

export function captureElectricalOfficeResponses(research, jurisdiction) {
  const capturedProfile = identity(research?.profile_snapshot);
  const target = identity(jurisdiction);
  const exact = research?.method === 'office-research-requirements-v1' &&
    Boolean(target.id && target.name && ['OH', 'KY'].includes(target.state)) &&
    sameDraftValue(capturedProfile, target);
  const history = research?.staff_responses;
  const readable = history === undefined || Array.isArray(history);
  const usable = exact && readable ? (history || []).filter(row =>
    row?.method === 'office-response-evidence-v1' && electricalResponseRoles.some(({role}) => role === row.role) &&
    row.verification_status === 'needs_verification' && row.authority_approved === false &&
    row.address_authority_resolved === false) : [];
  const counts = new Map();
  for (const row of usable) counts.set(row.id, (counts.get(row.id) || 0) + 1);
  return {
    classification: 'unverified_office_response_snapshot',
    status: !exact ? 'research_identity_unresolved' : !readable ? 'history_unreadable' : usable.length !== (history || []).length ? 'history_requires_review' : 'captured',
    notice, profile_snapshot: clone(capturedProfile),
    omitted_entry_count: exact && readable ? (history || []).length - usable.length : null,
    roles: electricalResponseRoles.map(({role, label}) => ({
      role, label, responses: usable.filter(row => row.role === role).map(row => ({
        evidence: clone(row),
        response_identity_unique: Boolean(row.id && counts.get(row.id) === 1),
        locality_matches_research: sameDraftValue(identity(row.profile_snapshot), capturedProfile),
        findings_match_research: sameDraftValue(row.recorded_findings, (research.roles || []).filter(finding => finding?.role === role)),
      })),
    })),
  };
}

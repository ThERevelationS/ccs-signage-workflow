import { OFFICE_RESEARCH_METHOD } from '../../../base44/shared/permittingOfficeResearch.mjs';
import { safeGovernmentOfficeSourceUrl } from './governmentOfficeCatalog.js';

const roles = ['electrical_permit', 'electrical_inspection'];
const clone = value => JSON.parse(JSON.stringify(value));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const field = (value, label, limit, required = false) => {
  const result = typeof value === 'string' ? value.trim() : '';
  if ((required && !result) || result.length > limit) throw Error('Enter ' + label + ' within ' + limit + ' characters.');
  return result;
};
const profile = research => {
  const p = research?.profile_snapshot;
  if (research?.method !== OFFICE_RESEARCH_METHOD || !Array.isArray(research.roles) ||
      !p?.id || !p?.name || !['OH', 'KY'].includes(p.state) ||
      !['city', 'village', 'township', 'county', 'municipality'].includes(p.type))
    throw Error('Reload a saved locality research draft before recording a response.');
  return { id: p.id, name: p.name, state: p.state, type: p.type };
};
export const responseReviewLabels = {
  currentness: { unknown: 'Not established', claims_current: 'Office says current — unverified', claims_outdated: 'Office says outdated — unverified' },
  commercial_sign_scope: { unknown: 'Not established', claims_applies: 'Office says it applies — unverified', claims_not_applies: 'Office says it does not apply — unverified' },
  site_applicability: { unknown: 'Not established', claims_covers: 'Office says site is covered — unverified', claims_not_covers: 'Office says site is not covered — unverified' },
};
export function createOfficeResearchResponse(research, role, draft, { id, actor, now = () => new Date().toISOString() } = {}) {
  const locality = profile(research);
  if (!roles.includes(role) || !/^office-response-[a-zA-Z0-9-]{8,100}$/.test(id || '')) throw Error('The response identity or electrical role is unavailable.');
  const responseDate = field(draft?.response_date, 'the response date', 10, true);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(responseDate) || !Number.isFinite(Date.parse(responseDate)) ||
      new Date(responseDate).toISOString().slice(0, 10) !== responseDate) throw Error('Enter a valid response date.');
  const sourceInput = field(draft?.source_url, 'the source URL', 1000);
  const source = sourceInput ? safeGovernmentOfficeSourceUrl(sourceInput) : null;
  if (sourceInput && !source) throw Error('Use a valid HTTPS source URL without embedded credentials.');
  const review = Object.fromEntries(Object.entries(responseReviewLabels).map(([key, options]) => {
    const value = draft?.[key] || 'unknown';
    if (!Object.hasOwn(options, value)) throw Error('Choose a supported unverified review state.');
    return [key, value];
  }));
  const scope = field(draft?.scope_description, 'the discussed site or work scope', 1000, review.site_applicability !== 'unknown');
  return {
    id, method: 'office-response-evidence-v1', role, profile_snapshot: clone(locality),
    recorded_findings: clone(research.roles.filter(row => row?.role === role)),
    responding_office: field(draft?.responding_office, 'the responding office', 200, true),
    response_date: responseDate, exact_quote: field(draft?.exact_quote, 'the exact response quote', 4000, true),
    source_reference: field(draft?.source_reference, 'a source reference, such as an email date or official page', 1000, true),
    source_url: source, scope_description: scope,
    notes: field(draft?.notes, 'response notes', 1500), ...review,
    captured_at: now(), captured_by: field(actor || 'CCS Staff', 'the staff name', 300, true),
    verification_status: 'needs_verification', authority_approved: false, address_authority_resolved: false,
  };
}
export function appendOfficeResearchResponse(research, response) {
  if (!same(profile(research), response?.profile_snapshot) || !roles.includes(response?.role) ||
      response?.method !== 'office-response-evidence-v1' || response.authority_approved !== false ||
      response.address_authority_resolved !== false || response.verification_status !== 'needs_verification')
    throw Error('The response no longer matches this locality or its unverified evidence state.');
  if (research.staff_responses !== undefined && !Array.isArray(research.staff_responses)) throw Error('Saved response history requires review; nothing was replaced.');
  const history = research.staff_responses || [];
  const existing = history.filter(row => row?.id === response.id);
  if (existing.length) {
    if (existing.length === 1 && same(existing[0], response)) return research;
    throw Error('This response identity has conflicting saved evidence. Review the saved history before continuing.');
  }
  if (!same(research.roles.filter(row => row?.role === response.role), response.recorded_findings))
    throw Error('The saved office findings changed while this response was open. Keep your notes and review the latest findings before recording a new response.');
  if (history.length >= 100) throw Error('Response history has reached its review limit. Existing evidence was preserved.');
  return { ...research, staff_responses: [...history, clone(response)] };
}

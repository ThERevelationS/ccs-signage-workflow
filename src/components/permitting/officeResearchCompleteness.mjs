import { officeResearchChecklist, officeResearchFieldLabels } from '../../../base44/shared/permittingOfficeResearch.mjs';
import { safeGovernmentOfficeSourceUrl } from './governmentOfficeCatalog.js';

const unresolvedText = /^(?:unknown|not known|not found(?: yet)?|not recorded|not established|unresolved|pending)$/i;
const hasRecordedText = value => typeof value === 'string' && Boolean(value.trim()) && !unresolvedText.test(value.trim());

export function officeResearchEvidenceGaps(row) {
  return [
    !hasRecordedText(row?.office_name) && 'Office identity missing',
    !safeGovernmentOfficeSourceUrl(row?.official_source_url) && 'Usable HTTPS source link missing',
    !hasRecordedText(row?.responsibility_quote) && 'Official responsibility quote missing',
    !hasRecordedText(row?.service_area) && 'Service area missing',
    !['potentially_applicable', 'not_applicable_candidate'].includes(row?.applicability) && 'Applicability unresolved',
  ].filter(Boolean);
}

/** Field-presence review only: metadata can be ready for staff review without proving authority. */
export function assessOfficeResearchRole(rows, roleKey) {
  const definition = officeResearchChecklist.roles.find(role => role.key === roleKey);
  if (!definition) throw Error('Unsupported office research role');
  const sourceRows = Array.isArray(rows) ? rows : [];
  const requiredFields = [...new Set([
    ...officeResearchChecklist.common_research_fields,
    ...(definition.research_fields || []),
  ])];
  const findings = sourceRows.map((row, index) => ({ row, index }))
    .filter(item => item.row && typeof item.row === 'object' && item.row.role === roleKey)
    .map(({ row, index }) => {
      const missing_fields = requiredFields.filter(key => !hasRecordedText(row.research_fields?.[key]));
      const missing_evidence = officeResearchEvidenceGaps(row);
      return { row, index, missing_fields, missing_evidence };
    });

  const status = findings.length === 0 ? 'missing'
    : findings.length > 1 ? 'ambiguous'
      : findings[0].missing_fields.length || findings[0].missing_evidence.length ? 'incomplete'
        : 'metadata_present_unverified';
  return {
    role: roleKey,
    label: definition.label,
    status,
    findings,
    missing_field_count: findings.reduce((total, item) => total + item.missing_fields.length, 0),
    missing_evidence_count: findings.reduce((total, item) => total + item.missing_evidence.length, 0),
    metadata_present: status === 'metadata_present_unverified',
    authority_verified: false,
    applicable_to_project: false,
  };
}

export function assessOfficeResearchRoles(rows) {
  const assessments = officeResearchChecklist.roles.map(role => assessOfficeResearchRole(rows, role.key));
  return {
    roles: assessments,
    roles_with_findings: assessments.filter(role => role.findings.length > 0).length,
    roles_with_gaps: assessments.filter(role => role.status !== 'metadata_present_unverified').length,
    research_complete: false,
    authority_verified: false,
  };
}

export function officeResearchFieldLabel(key) {
  return officeResearchFieldLabels[key] || key;
}

import { OFFICE_RESEARCH_METHOD, officeResearchFieldLabels } from '../../../base44/shared/permittingOfficeResearch.mjs';
import { assessOfficeResearchRole } from './officeResearchCompleteness.mjs';
import { safeGovernmentOfficeSourceUrl } from './governmentOfficeCatalog.js';

const clean = value => typeof value === 'string' ? value.trim().slice(0, 1200) : '';
export function buildElectricalOfficeInquiry(research, role) {
  const locality = research?.profile_snapshot;
  if (research?.method !== OFFICE_RESEARCH_METHOD || !Array.isArray(research.roles) ||
      !clean(locality?.id) || !clean(locality?.name) || !['OH', 'KY'].includes(locality?.state) ||
      !['city', 'village', 'township', 'county', 'municipality'].includes(locality?.type) ||
      !['electrical_permit', 'electrical_inspection'].includes(role)) {
    return { available: false, text: '', reason: 'A saved locality identity and supported electrical role are needed to prepare an inquiry.' };
  }
  const assessment = assessOfficeResearchRole(research.roles, role);
  const permit = role === 'electrical_permit';
  const lines = [
    'Subject: ' + locality.name + ', ' + locality.state + ' — commercial-sign electrical ' + (permit ? 'permit issuance' : 'inspection responsibility'),
    '',
    'Hello,',
    'Please help us confirm the current electrical ' + (permit ? 'permit process' : 'inspection process') + ' for proposed commercial sign work.',
    'Recorded locality: ' + clean(locality.name) + ' / ' + locality.state + ' / ' + locality.type,
    'Project address / parcel: [add before contacting]',
    'Proposed sign, illumination, circuit and connection work: [describe before contacting]',
    '',
    'Please confirm:',
    ...(permit ? [
      '1. Which office issues the electrical permit, and which office receives applications? Please distinguish issuance from intake and inspections.',
      '2. Does your current responsibility cover this exact site and the proposed commercial sign, illumination, circuit or connection work? What exceptions or other authorities apply?',
      '3. What current official source establishes the issuing office, service area and any delegated responsibility? Please provide the effective date and official URL.',
    ] : [
      '1. Which office or provider performs electrical inspections, separately from the permit issuer and application intake office?',
      '2. Does its current service area cover this exact site and the proposed commercial sign, illumination, circuit or connection work? What exceptions apply?',
      '3. If inspections are delegated, what current official contract or delegation establishes the provider, covered work, service area and term? Please provide the effective date and official URL.',
    ]),
    '',
    'Saved research context — unverified; please correct or update:',
    'Research recorded: ' + (clean(research.researched_at) || 'Date not recorded'),
  ];
  if (!assessment.findings.length) lines.push('No saved finding for this responsibility. Please identify the responsible office.');
  for (const [number, finding] of assessment.findings.entries()) {
    const row = finding.row;
    lines.push('', 'Candidate ' + (number + 1) + ': ' + (clean(row.office_name) || 'Office not recorded'));
    lines.push('Recorded applicability: ' + (['potentially_applicable', 'not_applicable_candidate'].includes(row.applicability) ? row.applicability + ' — unverified' : 'Unknown'));
    if (clean(row.service_area)) lines.push('Recorded service area (unverified): ' + clean(row.service_area));
    const source = safeGovernmentOfficeSourceUrl(row.official_source_url);
    if (source) lines.push('Saved source: ' + source);
    if (clean(row.responsibility_quote)) lines.push('Saved responsibility quote: "' + clean(row.responsibility_quote) + '"');
    if (clean(row.delegation_quote)) lines.push('Saved delegation quote: "' + clean(row.delegation_quote) + '"');
    const fields = [...new Set(finding.missing_fields)];
    if (fields.length) {
      lines.push('Additional information missing from this candidate:');
      fields.forEach(key => lines.push('- Please provide current ' + (officeResearchFieldLabels[key] || key).toLowerCase() + ' and its official source.'));
    }
  }
  if (assessment.findings.length > 1) lines.push('', 'Multiple candidates are recorded. Please clarify each candidate’s responsibility; none has been selected as the responsible office.');
  lines.push('', 'Please include current application / scheduling links, instructions, forms and fees relevant to your responsibility.',
    'If another office handles this work, please provide its official referral and explain the division of responsibility.',
    '', 'Thank you.', '', 'Prepared from saved research only. This inquiry does not establish authority or project applicability.');
  return { available: true, text: lines.join('\n'), reason: '' };
}

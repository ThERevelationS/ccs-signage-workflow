import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ui = readFileSync(new URL('../src/components/permitting/LocalityPickerDialog.jsx', import.meta.url), 'utf8');

test('locality picker only presents staff-verified explicit authority relationships as confirmed', () => {
  assert.match(ui, /summarizeMatchedLocalityAuthority\(locality\)/);
  assert.match(ui, /review\.verified_roles/);
  assert.match(ui, /Only these roles are confirmed authority relationships/);
  assert.match(ui, /other configured offices remain workflow references/);
});

test('unverified localities remain usable under existing workflow with a warning', () => {
  assert.match(ui, /No staff-verified office authority/);
  assert.match(ui, /Configured offices can still be applied with the existing workflow/);
  assert.match(ui, /onApply\(selectedLocalityId, \{ excludeElectrical \}\)/);
});

test('authority display covers the canonical role vocabulary', () => {
  for (const role of ['sign_permit','zoning','building','electrical','right_of_way','historic_review','planning','transportation','other']) {
    assert.match(ui, new RegExp(`${role}:`));
  }
});

test('selection derives authority from the selected configured locality, not AI claims', () => {
  assert.match(ui, /localities\.find\(locality => locality\.id === selectedLocalityId\)/);
  assert.match(ui, /verifiedAuthoritySummary\(selectedLocality\)/);
  assert.match(ui, /summarizeMatchedLocalityAuthority\(locality\)/);
});

test('saved permit locality links retain partial review after Apply and later staff changes', async () => {
  const { summarizePermitGroupAuthorityCoverage } = await import('../base44/shared/permittingAddressLocality.js');
  const lines = [
    { id: 'line-one', locality_id: 'deerfield', locality_name: 'Deerfield Township' },
    { id: 'line-two', locality_id: 'deerfield', locality_name: 'Deerfield Township' },
  ];
  const locality = { id: 'deerfield', name: 'Deerfield Township', offices: [
    { authority_verification_status: 'staff_verified', authority_roles: ['sign_permit'] },
    { authority_verification_status: 'needs_verification', authority_roles: ['electrical'] },
  ] };
  const [saved] = summarizePermitGroupAuthorityCoverage(lines, [locality]);
  assert.equal(summarizePermitGroupAuthorityCoverage(lines, [locality]).length, 1);
  assert.equal(saved.authority.coverage_status, 'partial');
  assert.deepEqual(saved.authority.verified_roles, ['sign_permit']);
  assert.deepEqual(saved.authority.roles_needing_review, ['electrical']);
  locality.offices[0].authority_verification_status = 'needs_verification';
  assert.equal(summarizePermitGroupAuthorityCoverage(lines, [locality])[0].authority.coverage_status, 'not_verified');
});

test('unlinked and duplicate saved locality references fail closed instead of borrowing review', async () => {
  const { summarizePermitGroupAuthorityCoverage } = await import('../base44/shared/permittingAddressLocality.js');
  const lines = [{ locality_id: 'deleted', locality_name: 'Old Town' }, { locality_id: '' }];
  assert.deepEqual(
    summarizePermitGroupAuthorityCoverage(lines, []).map(row => row.authority.coverage_status),
    ['unresolved', 'unresolved']
  );
  const duplicate = [
    { id: 'deleted', name: 'Old Town', offices: [{ authority_verification_status: 'staff_verified', authority_roles: ['zoning'] }] },
    { id: 'deleted', name: 'Old Town duplicate' },
  ];
  assert.deepEqual(summarizePermitGroupAuthorityCoverage(lines, duplicate)[0].authority.verified_roles, []);
});

test('Work Order group recomputes live authority status from saved permit line locality IDs', () => {
  const group = readFileSync(new URL('../src/components/permitting/PermitClientGroup.jsx', import.meta.url), 'utf8');
  const page = readFileSync(new URL('../src/pages/Permitting.jsx', import.meta.url), 'utf8');
  assert.match(group, /summarizePermitGroupAuthorityCoverage\(group\.lines, localities\)/);
  assert.match(group, /authority\.coverage_status === 'partial'/);
  assert.match(group, /Locality link missing or unavailable/);
  assert.match(group, /not complete legal coverage/);
  assert.match(page, /locality_id: locality\.id/);
});

test('permit lines identify the exact staff-reviewed office, not other offices in the locality', async () => {
  const { summarizePermitLineOfficeAuthority } = await import('../base44/shared/permittingAddressLocality.js');
  const localities = [{ id: 'deerfield', offices: [
    { id: 'sign-office', name: 'Sign Department', office_type: 'Zoning', authority_verification_status: 'staff_verified', authority_roles: ['sign_permit', 'zoning'] },
    { id: 'electrical-office', name: 'Electrical Inspector', office_type: 'Electrical', authority_verification_status: 'needs_verification', authority_roles: ['electrical'] },
  ] }];
  const sign = summarizePermitLineOfficeAuthority({ locality_id: 'deerfield', row_name: 'Sign Department', office_type: 'Zoning' }, localities);
  assert.equal(sign.status, 'staff_verified');
  assert.deepEqual(sign.verified_roles, ['sign_permit', 'zoning']);
  const electrical = summarizePermitLineOfficeAuthority({ locality_id: 'deerfield', row_name: 'Electrical Inspector', office_type: 'Electrical' }, localities);
  assert.equal(electrical.status, 'needs_verification');
  assert.equal(electrical.office_name, 'Electrical Inspector');
  assert.deepEqual(electrical.roles_needing_review, ['electrical']);
  assert.deepEqual(electrical.verified_roles, []);
  // A later staff revocation must be reflected when the group re-renders.
  localities[0].offices[0].authority_verification_status = 'needs_verification';
  assert.equal(summarizePermitLineOfficeAuthority({ locality_id: 'deerfield', row_name: 'Sign Department', office_type: 'Zoning' }, localities).status, 'needs_verification');
});

test('renamed, duplicate, mismatched-type and missing offices fail closed', async () => {
  const { summarizePermitLineOfficeAuthority } = await import('../base44/shared/permittingAddressLocality.js');
  const verified = { name: 'Sign Department', office_type: 'Zoning', authority_verification_status: 'staff_verified', authority_roles: ['sign_permit'] };
  const line = { locality_id: 'locality', row_name: 'Sign Department', office_type: 'Zoning' };
  const lookup = offices => summarizePermitLineOfficeAuthority(line, [{ id: 'locality', offices }]);
  assert.equal(lookup([verified, { ...verified }]).status, 'unresolved');
  assert.match(lookup([verified, { ...verified }]).reason, /Multiple configured offices/);
  assert.equal(lookup([{ ...verified, name: 'Renamed Department' }]).status, 'unresolved');
  assert.equal(lookup([{ ...verified, office_type: 'Electrical' }]).status, 'unresolved');
  assert.equal(lookup([]).status, 'unresolved');
  assert.equal(summarizePermitLineOfficeAuthority(line, [{ id: 'locality', offices: [verified] }, { id: 'locality', offices: [verified] }]).status, 'unresolved');
  assert.equal(summarizePermitLineOfficeAuthority({ ...line, locality_id: '' }, [{ id: 'locality', offices: [verified] }]).status, 'unresolved');
});

test('permit line row shows an accessible office-specific review badge from current configured offices', () => {
  const group = readFileSync(new URL('../src/components/permitting/PermitClientGroup.jsx', import.meta.url), 'utf8');
  const row = readFileSync(new URL('../src/components/permitting/PermitSpreadsheetRow.jsx', import.meta.url), 'utf8');
  assert.match(group, /officeAuthority={summarizePermitLineOfficeAuthority\(li, localities\)}/);
  assert.match(row, /officeAuthority\.office_name/);
  assert.match(row, /officeAuthority\.status === 'needs_verification'/);
  assert.match(row, /Office mapping needs review/);
  assert.match(row, /Staff-verified roles/);
  assert.match(row, /role="status"/);
});

test('stable office ID survives office rename and type changes within its locality', async () => {
  const { summarizePermitLineOfficeAuthority } = await import('../base44/shared/permittingAddressLocality.js');
  const locality = { id: 'township', offices: [
    { id: 'office-1', name: 'New Permit Department', office_type: 'Building', authority_verification_status: 'staff_verified', authority_roles: ['sign_permit'] },
    { id: 'office-2', name: 'Old Permit Department', office_type: 'Zoning', authority_verification_status: 'needs_verification', authority_roles: ['zoning'] },
  ] };
  const line = { locality_id: 'township', locality_office_id: 'office-1', row_name: 'Old Permit Department', office_type: 'Zoning' };
  const review = summarizePermitLineOfficeAuthority(line, [locality]);
  assert.equal(review.status, 'staff_verified');
  assert.equal(review.office_name, 'New Permit Department');
  assert.deepEqual(review.verified_roles, ['sign_permit']);
  locality.offices[0].authority_verification_status = 'needs_verification';
  assert.equal(summarizePermitLineOfficeAuthority(line, [locality]).status, 'needs_verification');
});

test('missing or duplicate stable office IDs fail closed without legacy name fallback', async () => {
  const { summarizePermitLineOfficeAuthority } = await import('../base44/shared/permittingAddressLocality.js');
  const office = { id: 'office-1', name: 'Sign Office', office_type: 'Zoning', authority_verification_status: 'staff_verified', authority_roles: ['sign_permit'] };
  const linked = { locality_id: 'township', locality_office_id: 'missing-id', row_name: 'Sign Office', office_type: 'Zoning' };
  const lookup = offices => summarizePermitLineOfficeAuthority(linked, [{ id: 'township', offices }]);
  assert.equal(lookup([office]).status, 'unresolved');
  assert.match(lookup([office]).reason, /saved office ID/);
  assert.equal(summarizePermitLineOfficeAuthority({ ...linked, locality_office_id: 'office-1' }, [{ id: 'township', offices: [office, { ...office }] }]).status, 'unresolved');
  assert.equal(lookup([{ ...office, id: 'missing-id', authority_verification_status: 'needs_verification' }]).status, 'needs_verification');
  assert.equal(summarizePermitLineOfficeAuthority({ ...linked, locality_office_id: '' }, [{ id: 'township', offices: [office] }]).status, 'staff_verified');
});

test('new permit lines persist locality office IDs and locality changes clear unsafe old IDs', () => {
  const schema = JSON.parse(readFileSync(new URL('../base44/entities/PermitLineItem.jsonc', import.meta.url), 'utf8'));
  const page = readFileSync(new URL('../src/pages/Permitting.jsx', import.meta.url), 'utf8');
  assert.equal(schema.properties.locality_office_id.type, 'string');
  assert.ok(!schema.required?.includes('locality_office_id'));
  assert.match(page, /locality_office_id: String\(office\.office_id \|\| ""\)\.trim\(\)/);
  assert.match(page, /locality_office_id: "", \/\/ A previous locality's office ID is never reusable/);
  assert.match(page, /previousMatches\.length === 1/);
  assert.match(page, /updates\.locality_office_id = String\(exactOffice\.id\)\.trim\(\)/);
});
test('manual locality selection uses the same partial authority coverage language as address resolution', () => {
  assert.match(ui, /selectedAuthority\.coverage_status === "partial"/);
  assert.match(ui, /selectedAuthority\.coverage_status === "configured_offices_reviewed"/);
  assert.match(ui, /selectedAuthority\.reviewLabels\.join/);
  assert.match(ui, /Partial office-authority review/);
  assert.match(ui, /does not establish that every legally required authority is represented/);
});

test('address result visually separates geographic confidence from staff-verified authority', () => {
  assert.match(ui, /const addressAuthority = result\?\.authority_review/);
  assert.match(ui, /Permitting authority:/);
  assert.match(ui, /locality match confidence above identifies geography only/);
  assert.match(ui, /These roles come separately from staff-reviewed office relationships/);
  assert.match(ui, /address can match this locality without proving which office has sign, zoning, building, or electrical authority/);
});

test('address result authority labels come from backend verified roles, not AI text', () => {
  assert.match(ui, /addressAuthority\?\.verified_roles/);
  assert.match(ui, /addressAuthorityLabels\.join/);
  assert.match(ui, /addressAuthority\?\.status === 'staff_verified_roles'/);
});

test('address result visually separates geographic confidence from staff-verified authority', () => {
  assert.match(ui, /const addressAuthority = result\?\.authority_review/);
  assert.match(ui, /Permitting authority:/);
  assert.match(ui, /locality match confidence above identifies geography only/);
  assert.match(ui, /These roles come separately from staff-reviewed office relationships/);
  assert.match(ui, /address can match this locality without proving which office has sign, zoning, building, or electrical authority/);
});

test('address result authority labels come from backend verified roles, not AI text', () => {
  assert.match(ui, /addressAuthority\?\.verified_roles/);
  assert.match(ui, /addressAuthorityLabels\.join/);
  assert.match(ui, /addressAuthority\?\.status === 'staff_verified_roles'/);
});

test('legacy office linking offers unique IDs only within the selected locality', async () => {
  const { legacyOfficeLinkOptions } = await import('../base44/shared/permittingAddressLocality.js');
  const line = { id: 'line', locality_id: 'loc' };
  const office = { id: 'o1', name: 'Sign Office' };
  const loc = { id: 'loc', offices: [office] };
  assert.deepEqual(legacyOfficeLinkOptions(line, [loc]).map(o => o.id), ['o1']);
  assert.match(legacyOfficeLinkOptions(line, [loc])[0].label, /ID: o1/);
  assert.deepEqual(legacyOfficeLinkOptions({ ...line, locality_office_id: 'o1' }, [loc]), []);
  assert.deepEqual(legacyOfficeLinkOptions(line, [{ id: 'elsewhere', offices: [office] }]), []);
  assert.deepEqual(legacyOfficeLinkOptions(line, [loc, loc]), []);
  assert.deepEqual(legacyOfficeLinkOptions(line, [{ id: 'loc', offices: [office, office] }]), []);
  assert.deepEqual(legacyOfficeLinkOptions(line, [{ id: 'loc', offices: [{ name: 'No ID' }] }]), []);
});

test('deleted stable office references allow staff repair, but renamed or duplicate IDs remain protected', async () => {
  const { legacyOfficeLinkOptions, summarizePermitLineOfficeAuthority } = await import('../base44/shared/permittingAddressLocality.js');
  const line = { id: 'line-1', locality_id: 'township', locality_office_id: 'removed-office', row_name: 'Old Sign Office', office_type: 'Zoning' };
  const replacement = { id: 'replacement', name: 'New Sign Office', office_type: 'Zoning', authority_verification_status: 'needs_verification', authority_roles: ['sign_permit'] };
  const locality = { id: 'township', offices: [replacement] };
  assert.equal(summarizePermitLineOfficeAuthority(line, [locality]).status, 'unresolved');
  assert.deepEqual(legacyOfficeLinkOptions(line, [locality]).map(o => o.id), ['replacement']);
  // A rename or reinstated ID keeps the existing link. No repair choice is shown.
  const renamed = { ...replacement, id: 'removed-office', name: 'Renamed Department' };
  assert.deepEqual(legacyOfficeLinkOptions(line, [{ id: 'township', offices: [renamed, replacement] }]), []);
  assert.deepEqual(legacyOfficeLinkOptions(line, [{ id: 'township', offices: [renamed, { ...renamed }] }]), []);
  assert.deepEqual(legacyOfficeLinkOptions(line, [{ id: 'township', offices: [replacement, { ...replacement }] }]), []);
  assert.deepEqual(legacyOfficeLinkOptions(line, [{ id: 'township', offices: [{ ...replacement, id: '' }] }]), []);
  // Never cross a missing or ambiguous locality boundary.
  assert.deepEqual(legacyOfficeLinkOptions(line, [{ id: 'other', offices: [replacement] }]), []);
  assert.deepEqual(legacyOfficeLinkOptions(line, [locality, locality]), []);
  // Staff-selected replacement does not automatically inherit approval of the retired office.
  const repaired = summarizePermitLineOfficeAuthority({ ...line, locality_office_id: 'replacement' }, [locality]);
  assert.equal(repaired.status, 'needs_verification');
  assert.deepEqual(repaired.verified_roles, []);
});

test('repair UI is restricted to available explicit choices and preserves the old ID in concurrency guards', () => {
  const row = readFileSync(new URL('../src/components/permitting/PermitSpreadsheetRow.jsx', import.meta.url), 'utf8');
  const page = readFileSync(new URL('../src/pages/Permitting.jsx', import.meta.url), 'utf8');
  assert.match(row, /lineItem\.locality_office_id \? "Repair missing office link"/);
  assert.match(row, /legacyOfficeOptions\.length > 0/);
  assert.match(row, /The saved office ID/);
  assert.match(row, /Review the office history before selecting a replacement/);
  assert.match(page, /legacyOfficeLinkOptions\(line, \[liveLocality\]\)/);
  assert.match(page, /locality_office_id: line\.locality_office_id/);
  assert.match(page, /row_name: line\.row_name/);
  assert.match(page, /guardFields,/);
});

test('legacy office link dialog restores keyboard focus and keeps failures actionable', () => {
  const row = readFileSync(new URL('../src/components/permitting/PermitSpreadsheetRow.jsx', import.meta.url), 'utf8');
  assert.match(row, /ref={linkOfficeTriggerRef}/);
  assert.match(row, /ref={linkOfficeSelectRef}/);
  assert.match(row, /linkOfficeSelectRef\.current\?\.focus\(\)/);
  assert.match(row, /linkOfficeTriggerRef\.current\?\.focus\(\)/);
  assert.match(row, /aria-describedby={"office-link-help-" \+ lineItem\.id}/);
  assert.match(row, /role="alert" aria-live="assertive"/);
  assert.match(row, /if \(linkSaving\) return/);
  assert.match(row, /disabled={!selectedOfficeId \|\| linkSaving \|\| !isRegistered}/);
  assert.match(row, /Office link was not saved/);
});

test('legacy link requires explicit staff confirmation and guarded single-line persistence', () => {
  const page = readFileSync(new URL('../src/pages/Permitting.jsx', import.meta.url), 'utf8');
  const group = readFileSync(new URL('../src/components/permitting/PermitClientGroup.jsx', import.meta.url), 'utf8');
  const row = readFileSync(new URL('../src/components/permitting/PermitSpreadsheetRow.jsx', import.meta.url), 'utf8');
  assert.match(page, /PermitLocality\.get\(line\.locality_id\)/);
  assert.match(page, /legacyOfficeLinkOptions\(line, \[liveLocality\]\)/);
  assert.match(page, /guardFields,/);
  assert.match(page, /row_name: line\.row_name/);
  assert.match(page, /locality_office_id: line\.locality_office_id/);
  assert.match(page, /onLinkLegacyOffice=\{linkLegacyPermitLineOffice\}/);
  assert.match(group, /legacyOfficeOptions=\{legacyOfficeLinkOptions\(li, localities\)\}/);
  assert.match(row, /Link legacy line to office/);
  assert.match(row, /Confirm this office link/);
  assert.match(row, /onLinkLegacyOffice\(lineItem\.id, selectedOfficeId\)/);
  assert.match(row, /This does not verify permitting authority/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ui = readFileSync(new URL('../src/components/permitting/LocalityPickerDialog.jsx', import.meta.url), 'utf8');

test('locality picker only presents staff-verified explicit authority relationships as confirmed', () => {
  assert.match(ui, /authority_verification_status === "staff_verified"/);
  assert.match(ui, /Array\.isArray\(office\?\.authority_roles\)/);
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

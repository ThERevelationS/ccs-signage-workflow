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
});

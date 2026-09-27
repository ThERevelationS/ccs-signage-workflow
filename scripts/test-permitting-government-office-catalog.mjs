import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeGovernmentOfficeCatalogEntry, updateGovernmentOfficeCatalogEntry, updateGovernmentOfficeVerification } from '../src/components/permitting/governmentOfficeCatalog.js';
import { copyCatalogOfficeToLocality } from '../src/components/permitting/localityOfficeCatalogBridge.js';

test('legacy catalog office gains stable canonical identity and explicit contact metadata', () => {
  const row = normalizeGovernmentOfficeCatalogEntry({ id: 'catalog-1', name: 'County Zoning', contact_phone: '555-0100', workflow_steps: [] });
  assert.equal(row.government_office_id, 'catalog-1');
  assert.deepEqual(row.government_office, { name: 'County Zoning', phone: '555-0100', email: '', website: '', address: '', notes: '' });
  assert.equal(row.contact_phone, '555-0100');
});

test('contact edits mirror into canonical metadata without coupling workflow templates', () => {
  const original = normalizeGovernmentOfficeCatalogEntry({ id: 'catalog-1', name: 'County Zoning', contact_phone: 'old', workflow_steps: [{ id: 'submit', name: 'Submit', type: 'submitted_date' }] });
  const edited = updateGovernmentOfficeCatalogEntry(original, { contact_phone: 'new' });
  assert.equal(edited.contact_phone, 'new');
  assert.equal(edited.government_office.phone, 'new');
  assert.deepEqual(edited.workflow_steps, original.workflow_steps);
});

test('locality copy reads canonical metadata but owns independent workflow ids', () => {
  const catalog = normalizeGovernmentOfficeCatalogEntry({ id: 'catalog-1', name: 'Legacy label', workflow_steps: [{ id: 'submit', name: 'Submit', type: 'submitted_date' }] });
  catalog.government_office = { ...catalog.government_office, name: 'Canonical Office', phone: '555-0200' };
  const ids = ['local-office', 'local-step']; let i = 0;
  const copy = copyCatalogOfficeToLocality(catalog, 0, () => ids[i++]);
  assert.equal(copy.government_office_id, 'catalog-1');
  assert.equal(copy.name, 'Canonical Office');
  assert.equal(copy.contact_phone, '555-0200');
  assert.equal(copy.workflow_steps[0].id, 'local-step-submit');
  assert.equal(Object.hasOwn(copy, 'authority_roles'), false);
});

test('existing explicit canonical identity survives catalog normalization', () => {
  const row = normalizeGovernmentOfficeCatalogEntry({ id: 'template-9', government_office_id: 'gov-office-2', name: 'Office' });
  assert.equal(row.government_office_id, 'gov-office-2');
  assert.equal(row.government_office.verification_status, 'needs_verification');
});

test('staff verification records independent office source provenance', () => {
  const row = normalizeGovernmentOfficeCatalogEntry({ id: 'catalog-1', name: 'County Zoning' });
  const verified = updateGovernmentOfficeVerification(row, {
    verification_status: 'staff_verified',
    source_url: 'https://county.example.gov/zoning',
    verification_notes: 'Official department page confirms contact details.',
  }, 'staff@example.com', () => '2026-09-27T12:00:00.000Z');
  assert.equal(verified.government_office.verification_status, 'staff_verified');
  assert.equal(verified.government_office.verified_at, '2026-09-27T12:00:00.000Z');
  assert.equal(verified.government_office.verified_by, 'staff@example.com');
  assert.equal(verified.government_office.source_url, 'https://county.example.gov/zoning');
  assert.equal(Object.hasOwn(verified, 'authority_roles'), false);
});

test('revoking office verification preserves provenance notes but clears reviewer claim', () => {
  const verified = updateGovernmentOfficeVerification({ id: 'catalog-1', name: 'Office' }, {
    verification_status: 'staff_verified', source_url: 'https://official.example.gov', verification_notes: 'Checked'
  }, 'reviewer', () => '2026-09-27T12:00:00.000Z');
  const revoked = updateGovernmentOfficeVerification(verified, { verification_status: 'needs_verification' });
  assert.equal(revoked.government_office.verification_status, 'needs_verification');
  assert.equal(revoked.government_office.verified_at, '');
  assert.equal(revoked.government_office.verified_by, '');
  assert.equal(revoked.government_office.source_url, 'https://official.example.gov');
  assert.equal(revoked.government_office.verification_notes, 'Checked');
});

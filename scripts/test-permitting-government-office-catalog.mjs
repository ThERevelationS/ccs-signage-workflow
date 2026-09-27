import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeGovernmentOfficeCatalogEntry, safeGovernmentOfficeSourceUrl, updateGovernmentOfficeCatalogEntry, updateGovernmentOfficeVerification } from '../src/components/permitting/governmentOfficeCatalog.js';
import { copyCatalogOfficeToLocality } from '../src/components/permitting/localityOfficeCatalogBridge.js';

test('legacy catalog office gains stable canonical identity and explicit contact metadata', () => {
  const row = normalizeGovernmentOfficeCatalogEntry({ id: 'catalog-1', name: 'County Zoning', contact_phone: '555-0100', workflow_steps: [] });
  assert.equal(row.government_office_id, 'catalog-1');
  assert.deepEqual(row.government_office, {
    name: 'County Zoning', phone: '555-0100', email: '', website: '', address: '', notes: '',
    verification_status: 'needs_verification', verified_at: '', verified_by: '', verification_notes: '', source_url: ''
  });
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

test('editing any verified identity/contact field invalidates office verification but preserves sources', () => {
  const verified = updateGovernmentOfficeVerification({
    id: 'catalog-1', name: 'County Zoning', contact_phone: '555-0100',
    contact_email: 'zoning@example.gov', contact_website: 'https://example.gov',
    contact_address: '1 Main Street', workflow_steps: [{ id: 'submit', name: 'Submit' }],
  }, { verification_status: 'staff_verified', source_url: 'https://official.example.gov', verification_notes: 'Reviewed original contact page' },
  'reviewer', () => '2026-09-27T12:00:00.000Z');

  for (const [field, value, canonicalField] of [
    ['name', 'County Planning', 'name'],
    ['contact_phone', '555-0200', 'phone'],
    ['contact_email', 'planning@example.gov', 'email'],
    ['contact_website', 'https://planning.example.gov', 'website'],
    ['contact_address', '2 Main Street', 'address'],
  ]) {
    const edited = updateGovernmentOfficeCatalogEntry(verified, { [field]: value });
    assert.equal(edited.government_office[canonicalField], value, field);
    assert.equal(edited.government_office.verification_status, 'needs_verification', field);
    assert.equal(edited.government_office.verified_at, '', field);
    assert.equal(edited.government_office.verified_by, '', field);
    assert.equal(edited.government_office.source_url, 'https://official.example.gov', field);
    assert.equal(edited.government_office.verification_notes, 'Reviewed original contact page', field);
    assert.deepEqual(edited.workflow_steps, verified.workflow_steps, field);
  }
  assert.equal(verified.government_office.verification_status, 'staff_verified');
});

test('workflow changes, formatting-only contact edits, and verification notes do not revoke office identity verification', () => {
  const verified = updateGovernmentOfficeVerification({ id: 'catalog-1', name: 'County Zoning', contact_phone: '555-0100' }, {
    verification_status: 'staff_verified', source_url: 'https://official.example.gov', verification_notes: 'Reviewed'
  }, 'reviewer', () => '2026-09-27T12:00:00.000Z');
  for (const patch of [
    { name: '  County Zoning  ' },
    { contact_phone: ' 555-0100 ' },
    { office_types: ['Building'] },
    { workflow_steps: [{ id: 'next', name: 'Track submission' }] },
    { contact_notes: 'Staff memo about office hours' },
  ]) {
    const edited = updateGovernmentOfficeCatalogEntry(verified, patch);
    assert.equal(edited.government_office.verification_status, 'staff_verified');
    assert.equal(edited.government_office.verified_by, 'reviewer');
    assert.equal(edited.government_office.verified_at, '2026-09-27T12:00:00.000Z');
  }
});

test('changing a verified official source requires re-verification but preserves the new provenance', () => {
  const verified = updateGovernmentOfficeVerification({ id: 'catalog-1', name: 'Office' }, {
    verification_status: 'staff_verified', source_url: 'https://official.example.gov/old', verification_notes: 'Original review'
  }, 'reviewer', () => '2026-09-27T12:00:00.000Z');
  const changed = updateGovernmentOfficeVerification(verified, { source_url: ' https://official.example.gov/new ' });
  assert.equal(changed.government_office.source_url, 'https://official.example.gov/new');
  assert.equal(changed.government_office.verification_notes, 'Original review');
  assert.equal(changed.government_office.verification_status, 'needs_verification');
  assert.equal(changed.government_office.verified_at, '');
  assert.equal(changed.government_office.verified_by, '');
});

test('formatting-only source edits and note edits keep a verified source claim', () => {
  const verified = updateGovernmentOfficeVerification({ id: 'catalog-1', name: 'Office' }, {
    verification_status: 'staff_verified', source_url: 'https://official.example.gov', verification_notes: 'Original review'
  }, 'reviewer', () => '2026-09-27T12:00:00.000Z');
  const sameSource = updateGovernmentOfficeVerification(verified, { source_url: '  https://official.example.gov  ' });
  assert.equal(sameSource.government_office.verification_status, 'staff_verified');
  const notesOnly = updateGovernmentOfficeVerification(verified, { verification_notes: 'Expanded review notes' });
  assert.equal(notesOnly.government_office.verification_status, 'staff_verified');
  assert.equal(notesOnly.government_office.verified_by, 'reviewer');
});

test('changing source while explicitly re-verifying records the new review', () => {
  const verified = updateGovernmentOfficeVerification({ id: 'catalog-1', name: 'Office' }, {
    verification_status: 'staff_verified', source_url: 'https://official.example.gov/old'
  }, 'reviewer-a', () => '2026-09-27T12:00:00.000Z');
  const reverified = updateGovernmentOfficeVerification(verified, {
    source_url: 'https://official.example.gov/new', verification_status: 'staff_verified'
  }, 'reviewer-b', () => '2026-09-27T13:00:00.000Z');
  assert.equal(reverified.government_office.verification_status, 'staff_verified');
  assert.equal(reverified.government_office.verified_by, 'reviewer-b');
  assert.equal(reverified.government_office.verified_at, '2026-09-27T13:00:00.000Z');
});

test('official source links allow only absolute credential-free HTTPS URLs', () => {
  assert.equal(safeGovernmentOfficeSourceUrl(' https://county.example.gov/zoning '), 'https://county.example.gov/zoning');
  assert.equal(safeGovernmentOfficeSourceUrl('http://county.example.gov/zoning'), '');
  assert.equal(safeGovernmentOfficeSourceUrl('javascript:alert(1)'), '');
  assert.equal(safeGovernmentOfficeSourceUrl('/relative/source'), '');
  assert.equal(safeGovernmentOfficeSourceUrl('https://user:secret@county.example.gov/source'), '');
  assert.equal(safeGovernmentOfficeSourceUrl('https://county.example.gov/source\nmalformed'), '');
});

test('editing an unverified legacy office does not fabricate verification', () => {
  const edited = updateGovernmentOfficeCatalogEntry({ id: 'legacy', name: 'Old office' }, { name: 'New office' });
  assert.equal(edited.government_office.verification_status, 'needs_verification');
  assert.equal(edited.government_office.verified_at, '');
  assert.equal(edited.government_office.verified_by, '');
});

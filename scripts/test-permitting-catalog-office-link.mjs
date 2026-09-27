import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { copyCatalogOfficeToLocality } from '../src/components/permitting/localityOfficeCatalogBridge.js';

const catalog = {
  id: 'catalog-zoning-42', name: 'Regional Zoning', office_type: 'Zoning',
  contact_phone: '555-0100', workflow_steps: [
    { id: 'submit', name: 'Application Submitted', type: 'submitted_date', followup_interval_days: 14 },
  ],
};

function ids(...values) {
  let i = 0;
  return () => values[i++];
}

test('locality office retains canonical catalog provenance with independent workflow IDs', () => {
  const copy = copyCatalogOfficeToLocality(catalog, 2, ids('local-office', 'local-step'));
  assert.equal(copy.catalog_office_id, catalog.id);
  assert.equal(copy.id, 'local-office');
  assert.equal(copy.order, 2);
  assert.equal(copy.office_type, 'Zoning');
  assert.equal(copy.contact_phone, '555-0100');
  assert.equal(copy.workflow_steps[0].id, 'local-step-submit');
  assert.equal(copy.workflow_steps[0].type, catalog.workflow_steps[0].type);
  copy.workflow_steps[0].name = 'Staff-customized step';
  assert.equal(catalog.workflow_steps[0].name, 'Application Submitted');
});

test('same catalog office can serve multiple localities without sharing editable IDs', () => {
  const a = copyCatalogOfficeToLocality(catalog, 0, ids('loc-A', 'step-A'));
  const b = copyCatalogOfficeToLocality(catalog, 0, ids('loc-B', 'step-B'));
  assert.equal(a.catalog_office_id, b.catalog_office_id);
  assert.notEqual(a.id, b.id);
  assert.notEqual(a.workflow_steps[0].id, b.workflow_steps[0].id);
});

test('legacy catalog entries without IDs still copy without inventing a link', () => {
  const copy = copyCatalogOfficeToLocality({ name: 'Legacy office' }, 0, ids('local'));
  assert.equal(copy.name, 'Legacy office');
  assert.equal(Object.hasOwn(copy, 'catalog_office_id'), false);
  assert.deepEqual(copy.workflow_steps, []);
});

test('optional provenance field coexists with existing locality and workflow schema', () => {
  const schema = JSON.parse(readFileSync(new URL('../base44/entities/PermitLocality.jsonc', import.meta.url)));
  assert.equal(schema.properties.offices.items.properties.catalog_office_id.type, 'string');
  assert.deepEqual(schema.required, ['name']);
  const officeSchema = schema.properties.offices.items.properties;
  assert.ok(officeSchema.workflow_steps);
  assert.deepEqual(officeSchema.authority_roles.items.enum, [
    'sign_permit', 'zoning', 'building', 'electrical', 'right_of_way',
    'historic_review', 'planning', 'transportation', 'other',
  ]);
  assert.deepEqual(officeSchema.authority_verification_status.enum, ['needs_verification', 'staff_verified']);
  assert.equal(officeSchema.authority_verified_at.format, 'date-time');
  assert.ok(officeSchema.authority_verified_by);
  assert.ok(officeSchema.authority_verification_notes);
  assert.ok(schema.properties.workflow_steps);
  const picker = readFileSync(new URL('../src/components/permitting/PermitSettingsDialog.jsx', import.meta.url), 'utf8');
  assert.match(picker, /copyCatalogOfficeToLocality\(catalogOffice, form\.offices\.length\)/);
});

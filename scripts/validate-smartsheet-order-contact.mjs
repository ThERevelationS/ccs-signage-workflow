import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { isValidContactEmail, sharedOrderRequestorColumnId, planOrderRequestorContactAppend, orderRequestorOptionsPreserved } from '../base44/shared/smartsheetOrderContact.mjs';

const bindings = { customer_name: '321', requestor_name: '123', requestor_email: '123' };
assert.equal(sharedOrderRequestorColumnId(bindings), '123');
assert.equal(sharedOrderRequestorColumnId({ requestor_name: '123', requestor_email: '124' }), '');
assert.equal(isValidContactEmail('casey@example.com'), true);
assert.equal(isValidContactEmail('Casey Example'), false);

const legacyContacts = [
  { email: 'brett@example.com', name: 'Brett' },
  { email: 'tw@example.com', name: 'Twyla' },
];
const appended = planOrderRequestorContactAppend(legacyContacts, {
  email: 'NEW@EXAMPLE.COM', full_name: 'New Example',
});
assert.equal(appended.changed, true);
assert.deepEqual(appended.options, [...legacyContacts, { email: 'new@example.com', name: 'New Example' }]);
assert.deepEqual(legacyContacts, [
  { email: 'brett@example.com', name: 'Brett' },
  { email: 'tw@example.com', name: 'Twyla' },
]);
assert.equal(orderRequestorOptionsPreserved(appended.options, appended.options), true);
assert.equal(orderRequestorOptionsPreserved(appended.options, legacyContacts), false);
const repeat = planOrderRequestorContactAppend(appended.options, { email: 'new@example.com', full_name: 'Someone Else' });
assert.equal(repeat.changed, false);
assert.deepEqual(repeat.options, appended.options);
assert.throws(() => planOrderRequestorContactAppend(legacyContacts, { email: 'bad', full_name: 'Bad' }), /valid email/);
assert.throws(() => planOrderRequestorContactAppend(legacyContacts, { email: 'new@example.com', full_name: '' }), /full name/);
assert.throws(() => planOrderRequestorContactAppend(
  [{ email: 'same@example.com', name: 'One' }, { email: 'SAME@example.com', name: 'Two' }],
  { email: 'new@example.com', full_name: 'New Example' }
), /duplicate contact emails/);
console.log('PASS new Order Requestor appended once by email; historical first-name translation labels and contacts preserved');

const tempDir = await mkdtemp(join(tmpdir(), 'ccs-order-contact-'));
try {
  const outfile = join(tempDir, 'fields.mjs');
  await build({
    entryPoints: [resolve('base44/shared/smartsheetSyncFields.ts')],
    outfile, bundle: true, platform: 'node', format: 'esm', logLevel: 'silent',
  });
  const { buildCells, parseRowToFields, buildSnapshot } = await import(pathToFileURL(outfile).href);
  const record = { customer_name: 'Test Customer', requestor_name: 'Casey Example', requestor_email: 'casey@example.com' };

  const outgoing = buildCells(record, bindings, 'orders');
  assert.deepEqual(outgoing.filter((c) => c.columnId === '123'), [
    { columnId: '123', value: 'casey@example.com', displayValue: 'Casey Example' },
  ]);
  assert.equal(new Set(outgoing.map((c) => c.columnId)).size, outgoing.length);
  assert.deepEqual(buildSnapshot(record, bindings, 'orders')['123'], 'casey@example.com');
  console.log('PASS shared Order contact is one cell with raw email and display name');

  const inbound = parseRowToFields({
    id: '1', cells: [{ column_id: '123', value: 'casey@example.com', display_value: 'Casey Example' }],
  }, bindings, 'orders');
  assert.equal(inbound.requestor_name, 'Casey Example');
  assert.equal(inbound.requestor_email, 'casey@example.com');
  console.log('PASS inbound Order contact separates email from display name');

  const noDisplay = parseRowToFields({
    id: '2', cells: [{ column_id: '123', value: 'casey@example.com', display_value: '' }],
  }, bindings, 'orders');
  assert.equal(noDisplay.requestor_email, 'casey@example.com');
  assert.equal(Object.hasOwn(noDisplay, 'requestor_name'), false);
  const plainRawCells = parseRowToFields({
    id: '3', cells: [
      { column_id: '321', value: 'Raw Smartsheet customer', display_value: '' },
      { column_id: '322', value: 'Aluminum panel', display_value: '' },
      { column_id: '323', value: '2026-09-25', display_value: '09/25/26' },
    ],
  }, { ...bindings, description: '322', date_received: '323' }, 'orders');
  assert.equal(plainRawCells.customer_name, 'Raw Smartsheet customer');
  assert.equal(plainRawCells.description, 'Aluminum panel');
  assert.equal(plainRawCells.date_received, '2026-09-25');
  const salesUnchanged = parseRowToFields({
    id: '4', cells: [{ column_id: '321', value: 'Sales Raw', display_value: '' }],
  }, { client_name: '321' }, 'sales');
  assert.equal(Object.hasOwn(salesUnchanged, 'client_name'), false);
  console.log('PASS Order raw text fallback, ISO date priority and no email-as-name; Sales translation unchanged');

  const textReceived = parseRowToFields({
    id: 'stock-row', cells: [{ column_id: '323', value: 'In Stock', display_value: 'In Stock' }],
  }, { date_received: '323' }, 'orders');
  assert.equal(textReceived.receipt_option, 'In Stock');
  assert.equal(textReceived.date_received, ''); // Verified nonempty text replaces a stale received date after full-sheet preflight.
  const customReceived = parseRowToFields({
    id: 'custom-row', cells: [{ column_id: '323', value: 'Backordered', display_value: '' }],
  }, { date_received: '323' }, 'orders');
  assert.equal(customReceived.receipt_option, 'Backordered');
  const datedReceived = parseRowToFields({
    id: 'date-row', cells: [{ column_id: '323', value: '2026-09-25', display_value: '09/25/26' }],
  }, { date_received: '323' }, 'orders');
  assert.equal(datedReceived.date_received, '2026-09-25');
  assert.equal(datedReceived.receipt_option, '');
  const mixedOtherDates = parseRowToFields({
    id: 'mixed-dates', cells: [
      { column_id: '324', value: 'ASAP', display_value: 'ASAP' },
      { column_id: '325', value: 'N/A', display_value: 'N/A' },
      { column_id: '326', value: '03/09/021', display_value: '03/09/021' },
    ],
  }, { date_needed: '324', date_ordered: '325', date_received: '326' }, 'orders');
  assert.equal(mixedOtherDates.date_needed, '');
  assert.equal(mixedOtherDates.date_needed_option, 'ASAP');
  assert.equal(mixedOtherDates.date_ordered, '');
  assert.equal(mixedOtherDates.date_ordered_option, 'N/A');
  assert.equal(mixedOtherDates.date_received, '2021-03-09');
  assert.equal(mixedOtherDates.receipt_option, '');
  console.log('PASS mixed Order date columns preserve text options and translate zero-prefixed three-digit years');

  console.log('PASS mixed Smartsheet Date Received cells preserve In Stock/custom text separately from ISO dates');

  const nameOnly = parseRowToFields({
    id: '1', cells: [{ column_id: '123', value: 'Casey Example', display_value: 'Casey Example' }],
  }, bindings, 'orders');
  assert.equal(nameOnly.requestor_name, 'Casey Example');
  assert.equal(Object.hasOwn(nameOnly, 'requestor_email'), false);
  console.log('PASS name-only contact never overwrites Base44 email with a name');

  const invalid = { ...record, requestor_email: 'Casey Example' };
  assert.equal(buildCells(invalid, bindings, 'orders').some((c) => c.columnId === '123'), false);
  assert.equal(Object.hasOwn(buildSnapshot(invalid, bindings, 'orders'), '123'), false);
  console.log('PASS invalid stored email leaves existing Smartsheet contact untouched');

  const separate = buildCells(record, { ...bindings, requestor_email: '124' }, 'orders');
  assert.equal(separate.filter((c) => ['123', '124'].includes(c.columnId)).length, 2);
  console.log('PASS distinct column mappings retain their previous behavior');

  const engine = await readFile('base44/functions/smartsheetSyncAction/entry.ts', 'utf8');
  assert.match(engine, /detectConflict\(freshRow\.cells, verification\.expectedSnapshot, bindings, 'orders'\)/);
  assert.match(engine, /const sharedContactId = dataset === 'orders' \? sharedOrderRequestorColumnId\(bindings\) : '';/);
  assert.ok((engine.match(/displayValue\s*:\s*c\.displayValue/g) || []).length >= 2);
  assert.match(engine, /freshCells\.map\(\(c\) =>/); // guarded Order create still sends contact display names
  assert.match(engine, /requestor_contacts_skipped_no_valid_email/);
  assert.match(engine, /if \(action === 'order_requestor_contact_sync'\)/);
  assert.match(engine, /adminActor\?\.role !== 'admin'/);
  assert.match(engine, /AuthorizedEmail\.filter\(\{ email: requestedEmail \}\)/);
  assert.match(engine, /sharedOrderRequestorColumnId\(profile\?\.column_bindings\)/);
  assert.match(engine, /type: 'CONTACT_LIST', contactOptions: plan\.options/);
  assert.match(engine, /orderRequestorOptionsPreserved\(plan\.options, verifiedOptions\)/);
  const userManagement = await readFile('src/components/admin/UserManagement.jsx', 'utf8');
  assert.match(userManagement, /const inviteResult = await createAuthorizedUserAdmin/);
  assert.ok(userManagement.indexOf('action: "order_requestor_contact_sync"') >
    userManagement.indexOf('const inviteResult = await createAuthorizedUserAdmin'));
  assert.match(userManagement, /Order Requestor Smartsheet sync needs attention/);
  console.log('PASS push payload and conflict guard use Order contact semantics');

  const salesCells = buildCells(
    { client_name: 'Sales Client', est_inv_at: '12345' },
    { client_name: '456', est_inv_at: '457' }, 'sales',
  );
  assert.equal(salesCells.length, 2);
  console.log('PASS unrelated Sales field mapping remains unchanged');
} finally {
  await rm(tempDir, { recursive: true, force: true });
}

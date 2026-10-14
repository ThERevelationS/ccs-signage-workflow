import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createVerifiedOrderSheetBackup } from '../base44/shared/smartsheetOrderPrewriteBackup.mjs';

const SHEET = '4963691473987460';
const DRIVE_ID = 'testDriveId9999999';
const columns = [
  { id: 100, title: 'Customer Name', primary: true, type: 'TEXT_NUMBER' },
  { id: 200, title: 'Requestor', type: 'CONTACT_LIST' },
];
const row = (id, customer, contact) => ({
  id, cells: [
    { columnId: 100, value: customer, displayValue: customer },
    { columnId: 200, value: { email: contact, name: 'Requestor' },
      displayValue: 'Requestor' },
  ],
});
const rawRows = [
  row(123, 'Customer A', 'first@example.com'),
  row(456, 'Customer B', 'second@example.com'),
  row(789, 'Customer C', 'third@example.com'),
];
const page = (number, overrides = {}) => ({
  id: Number(SHEET), version: 19, totalRowCount: 3, columns,
  rows: number === 1 ? rawRows.slice(0, 2) : rawRows.slice(2),
  ...overrides,
});
const args = () => {
  const calls = [];
  let savedContent = '';
  let confirmations = 0;
  const options = {
    sheetId: SHEET, capturedAt: '2026-09-25T22:00:00.000Z',
    pageSize: 2, maxPages: 2,
    readPage: async (n, size) => { calls.push(['read', n, size]); return page(n); },
    verifySource: async () => { confirmations++; calls.push(['version', confirmations]);
      return { id: Number(SHEET), version: 19, totalRowCount: 3 }; },
    upload: async ({filename, content}) => { calls.push(['upload', filename]); savedContent = content;
      return {id: DRIVE_ID}; },
    readBack: async id => { calls.push(['readback', id]); return savedContent; },
    log: async backup => { calls.push(['log', backup]); },
  };
  return { options, calls, getContent: () => savedContent };
};
{
  const setup = args();
  const artifact = await createVerifiedOrderSheetBackup(setup.options);
  assert.equal(artifact.drive_file_id, DRIVE_ID);
  assert.equal(artifact.row_count, 3);
  assert.equal(artifact.sheet_id, SHEET);
  assert.equal(artifact.version, 19);
  assert.match(artifact.filename, /^CCS_OrderRequest_4963691473987460_pre_sync_/);
  const parsed = JSON.parse(setup.getContent());
  assert.deepEqual(parsed.columns, columns);
  assert.deepEqual(parsed.rows, rawRows);
  assert.equal(parsed.format, 'ccs-order-request-smartsheet-prewrite-v1');
  assert.equal(parsed.scope, 'row_and_column_data_no_attachments');
  assert.equal(artifact.bytes, new TextEncoder().encode(setup.getContent()).byteLength);
  assert.deepEqual(setup.calls.map(([kind])=>kind),
    ['read', 'read', 'version', 'upload', 'readback', 'version', 'log']);
  console.log('PASS paginated sheet preserves complete raw row, contact, column and permanent-ID data; Drive readback and final sheet version precede successful log');
}
{
  const setup = args();
  const artifact = await createVerifiedOrderSheetBackup({...setup.options, dataset: 'sales'});
  assert.match(artifact.filename, /^CCS_SalesPipeline_4963691473987460_pre_sync_/);
  const parsed = JSON.parse(setup.getContent());
  assert.equal(parsed.format, 'ccs-sales-pipeline-smartsheet-prewrite-v1');
  assert.equal(parsed.rows.length, 3);
  assert.equal(parsed.sheet_id, SHEET);
  assert.deepEqual(setup.calls.map(([kind])=>kind),
    ['read', 'read', 'version', 'upload', 'readback', 'version', 'log']);
  console.log('PASS Sales uses the same complete paginated, persisted, byte-read-back-verified backup primitive with a distinct recoverable artifact identity');
}

// A temporary edit during the first pagination pass must force a completely
// new backup read; never append later pages to the failed first attempt.
{
  const setup = args();
  const originalReadPage = setup.options.readPage;
  let passes = 0;
  setup.options.readPage = async (number, size) => {
    if (number === 1) passes++;
    const body = await originalReadPage(number, size);
    return passes === 1 && number === 2 ? { ...body, version: 20 } : body;
  };
  const artifact = await createVerifiedOrderSheetBackup(setup.options);
  assert.equal(artifact.row_count, 3);
  assert.equal(passes, 2);
  assert.deepEqual(setup.calls.map(([kind]) => kind),
    ['read', 'read', 'read', 'read', 'version', 'upload', 'readback', 'version', 'log']);
  assert.deepEqual(JSON.parse(setup.getContent()).rows, rawRows);
  console.log('PASS a transient sheet-version change discards the first backup and restarts complete pagination before one verified artifact/log');
}

async function fails(label, alter, matching, expectedLastStep) {
  const setup = args();
  alter(setup.options);
  await assert.rejects(createVerifiedOrderSheetBackup(setup.options), matching, label);
  assert.equal(setup.calls.some(([type])=>type === 'log'), false,
    `${label}: never records successful BackupLog for an unverified artifact`);
  if (expectedLastStep) {
    assert.equal(setup.calls.at(-1)?.[0], expectedLastStep, label);
  }
  return setup.calls;
}
await fails('wrong sheet', o => { o.readPage = async () => ({...page(1), id: 999}); },
  /wrong Smartsheet sheet/);
await fails('missing columns', o => { o.readPage = async n => page(n, {columns: []}); },
  /missing complete column/);
await fails('duplicate column IDs', o => { o.readPage = async n => page(n, {columns: [columns[0],columns[0]]}); },
  /duplicate permanent column/);
await fails('malformed cells', o => { o.readPage = async n => page(n, {rows: [{id: 123, cells: null}]}); },
  /malformed row\/cell/);
await fails('moving sheet', o => { o.readPage = async n => page(n, n===2 ? {version:20}:{}); },
  /changed during pagination/);
await fails('repeated row', o => { o.readPage = async n => page(n, n===2 ? {rows:[rawRows[0]]}:{}); },
  /invalid or repeated row ID/);
await fails('incomplete download', o => { o.readPage = async n => page(n, n===2 ? {rows:[]}:{}); },
  /ended before all rows/);
await fails('sheet changed after download', o => { o.verifySource = async () =>
  ({id:Number(SHEET),version:20,totalRowCount:3}); },
  /changed after backup pagination/);
await fails('upload no persistent ID', o => { o.upload = async () => ({id:null}); },
  /no verifiable persistent file ID/);
await fails('readback bytes mismatch', o => { o.readBack = async () => 'different content'; },
  /readback did not match/);
await fails('readback unavailable', o => { o.readBack = async () => { throw new Error('read failed'); }; },
  /read failed/);
await fails('sheet changed after upload', o => { let i=0; o.verifySource = async () =>
  ({id:Number(SHEET), version: ++i%2===1?19:20, totalRowCount:3}); },
  /changed while backup was being verified/);
await fails('BackupLog write failed', o => { o.log = async () => { throw new Error('log failed'); }; },
  /log failed/);
await fails('oversized JSON', o => { o.maxBytes = 50; },
  /exceeds the verified upload size limit/);
console.log('PASS wrong sheet, incomplete/moving sheet, duplicate IDs, malformed columns/cells, failed upload/readback/log and source races all stop before a success log');

{
  const setup = args();
  await assert.rejects(createVerifiedOrderSheetBackup({...setup.options, sheetId: 'not-an-id'}),
    /permanent sheet identity/);
  assert.equal(setup.calls.length,0);
}
const backend = readFileSync(new URL('../base44/functions/smartsheetSyncAction/entry.ts',import.meta.url),'utf8');
const backupStart = backend.indexOf("if ((dataset === 'orders' || dataset === 'sales') && globalConfig?.backup_before_write)");
const backupEnd = backend.indexOf("\n  const created: string[] = [];", backupStart);
assert.ok(backupStart >= 0 && backupEnd > backupStart, 'shared Order/Sales backup gate must have stable boundaries');
const orderBranch = backend.slice(backupStart, backupEnd);
assert.match(orderBranch, /createVerifiedOrderSheetBackup\(\{[\s\S]*?dataset,/);
assert.match(orderBranch, /connectors\.getConnection\('googledrive'\)/);
assert.match(orderBranch, /uploadType=multipart/);
assert.match(orderBranch, /alt=media/);
assert.match(orderBranch, /BackupLog\.create/);
assert.match(orderBranch, /!savedLog\?\.id/);
assert.match(orderBranch, /BackupLog\.get\(savedLog\.id\)/);
assert.match(orderBranch, /verifiedLog\.data_types\.length !== 1/);
assert.match(orderBranch, /verifiedLog\.results\.length !== 1/);
assert.match(orderBranch, /verifiedResult\?\.filename !== expectedFilename/);
assert.match(orderBranch, /persisted BackupLog could not be read back exactly/);
assert.match(orderBranch, /skipped: true/);
assert.match(orderBranch, /no Smartsheet rows were written/);
assert.doesNotMatch(orderBranch, /smartsheetWrite\(|\.bulkCreate\(|\.bulkUpdate\(/);
assert.match(orderBranch, /smartsheet_\$\{dataset === 'sales' \? 'sales' : 'orders'\}_sheet_/);
assert.match(orderBranch, /smartsheet_sales_prewrite/);
console.log('PASS the shared Order/Sales backend requires an actual persistent Drive artifact and verified readback before continuing to writes');

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { verifiedSalesReadbackRows } from '../base44/shared/smartsheetSalesReadbackEvidence.mjs';
import { buildSalesPullSnapshot } from '../base44/shared/smartsheetSyncFields.ts';
import { salesSnapshotsEqual } from '../base44/shared/smartsheetSalesSafety.mjs';

let checks = 0;
const pass = (condition, label) => { assert.ok(condition, label); checks++; };
const equal = (actual, expected, label) => { assert.deepEqual(actual, expected, label); checks++; };
const rejected = (body, rows, columns, label) => {
  assert.throws(() => verifiedSalesReadbackRows(body, '6000', rows, columns), /Sales read-back/);
  checks++;
};
const cells = (task='Estimate Sent') => [
  {columnId:111, value:task, displayValue:task},
  {columnId:222, value:125, displayValue:'125'},
  {columnId:333, value:'Brett', displayValue:'Brett'},
];
const row = (id, task) => ({id:Number(id),cells:cells(task)});
const base = () => ({
  id:6000,
  columns:[{id:111},{id:222},{id:333}],
  rows:[row('7001'),row('7002')],
});
const ids=['7001','7002'], columns=['111','222','333'];
const copy = value => structuredClone(value);
const success = verifiedSalesReadbackRows(base(),'6000',ids,columns);
equal([...success.keys()],ids,'Exact permanent rows preserve requested identities.');
equal(success.get('7001').cells.length,3,'Mapped cells are normalized for existing snapshot checks.');
const bindings = {current_task_description:'111',estimate_amount:'222',current_task_assigned_to:'333'};
const expected = buildSalesPullSnapshot(success.get('7001'),bindings);
pass(salesSnapshotsEqual(expected,buildSalesPullSnapshot(success.get('7001'),bindings),'333'),
  'Validated evidence still flows through canonical Sales snapshot equality.');
const changed=base();
changed.rows[0].cells[0].value='Lost';
changed.rows[0].cells[0].displayValue='Lost';
const changedRows=verifiedSalesReadbackRows(changed,'6000',ids,columns);
pass(!salesSnapshotsEqual(expected,buildSalesPullSnapshot(changedRows.get('7001'),bindings),'333'),
  'A real task difference is still rejected by downstream Sales snapshot equality.');
const missing=base();missing.rows.pop();
rejected(missing,ids,columns,'Missing row cannot prove whole batch.');
const duplicate=base();duplicate.rows[1]=row('7001');
rejected(duplicate,ids,columns,'Duplicate row identity cannot hide an unverified row.');
const unexpected=base();unexpected.rows[1]=row('9999');
rejected(unexpected,ids,columns,'Unexpected row identity cannot replace requested row.');
const wrong=base();wrong.id=8000;
rejected(wrong,ids,columns,'Different sheet identity rejected.');
const noRows=base();delete noRows.rows;
rejected(noRows,ids,columns,'Missing rows collection rejected.');
const noColumns=base();delete noColumns.columns;
rejected(noColumns,ids,columns,'Missing column metadata rejected.');
const partialColumns=base();partialColumns.columns.pop();
rejected(partialColumns,ids,columns,'Missing mapped column metadata rejected.');
const duplicateColumns=base();duplicateColumns.columns[2].id=222;
rejected(duplicateColumns,ids,columns,'Duplicate column identity rejected.');
const duplicateCells=base();duplicateCells.rows[0].cells.push({columnId:111,value:'Lost'});
rejected(duplicateCells,ids,columns,'Duplicate mapped cell rejected.');
const unreadableCells=base();unreadableCells.rows[0].cells=null;
rejected(unreadableCells,ids,columns,'Unreadable row cells rejected.');
rejected(base(),['7001','7001'],columns,'Duplicate requested row identities rejected.');
rejected(base(),['7001','7002'],['111','111'],'Duplicate mapped column request rejected.');
rejected(base(),['7001','bad'],columns,'Non-numeric requested row identity rejected.');
rejected(base(),ids,['111','bad'],'Non-numeric mapped column identity rejected.');
rejected(base(),[],columns,'Empty read-back target rejected.');
rejected(base(),ids,[],'Missing mapped column list rejected.');
const blank=base();
blank.rows[0].cells=[];
const blankResult=verifiedSalesReadbackRows(blank,'6000',ids,columns);
equal(blankResult.get('7001').cells.length,0,'Legitimate absent cells remain permitted for blank mapped values.');
const extras=base();
extras.rows[0].cells.push({columnId:999,value:'unmapped'});
equal(verifiedSalesReadbackRows(extras,'6000',ids,columns).get('7001').cells.length,4,
  'Unmapped cells are not incorrectly treated as duplicate mapped cells.');
const large=base();
large.rows=Array.from({length:100},(_,i)=>row(String(7001+i)));
const largeIds=large.rows.map(r=>String(r.id));
equal(verifiedSalesReadbackRows(large,'6000',largeIds,columns).size,100,
  'Complete bounded 100-row Sales read-back accepted.');
const badLarge=copy(large);badLarge.rows[99].id=badLarge.rows[98].id;
rejected(badLarge,largeIds,columns,'Duplicate late row fails whole 100-row batch.');
const backend=readFileSync('base44/functions/smartsheetSyncAction/entry.ts','utf8');
pass(backend.includes("import { verifiedSalesReadbackRows } from '../../shared/smartsheetSalesReadbackEvidence.mjs';"),
  'Production backend imports exact read-back evidence validator.');
const start=backend.indexOf('const salesRemoteVerifiedIds = new Set<string>()');
const end=backend.indexOf('const orderRemoteVerifiedIds = new Set<string>()',start);
pass(start>0 && end>start,'Sales-only read-back block exists before Order flow.');
const salesBlock=backend.slice(start,end);
pass(salesBlock.includes('const freshRows = verifiedSalesReadbackRows(') &&
  salesBlock.includes('verificationResult.body, sheetId, rowIds, columnIds'),
  'Production Sales postwrite path invokes strict sheet/row/column evidence check.');
pass(salesBlock.includes('salesSnapshotsEqual(verification.expectedSnapshot, actualSnapshot, assigneeColumnId)') &&
  salesBlock.includes('salesFailedRecordIds.add(recordId)'),
  'Strict evidence feeds existing value checks and fail-closed record handling.');
pass(!backend.slice(end,end+500).includes('verifiedSalesReadbackRows'),
  'Order flow is not altered by the Sales-only helper.');
console.log('Sales strict post-PUT read-back evidence: '+checks+'/'+checks+' PASS.');

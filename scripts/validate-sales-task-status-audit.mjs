import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { classifySalesTaskStatusAudit, salesTaskStatusNeedsReview } from '../base44/shared/salesTaskStatusAudit.mjs';
import { isLegacyTerminalSmartsheetSalesRecord } from '../base44/shared/historicalSalesOutcomeReconciliation.mjs';

let checks = 0;
const same = (actual, expected, label) => { assert.deepEqual(actual, expected, label); checks++; };
const ok = (condition, label) => { assert.ok(condition, label); checks++; };
const modern = {
  id:'synthetic-modern-1', in_pipeline:true, sales_status:'lead',
  current_task_description:'Complete Estimate for Review',
  sales_stage_changed_at:'2026-10-08T16:00:00Z',
  smartsheet_sheet_id:'8702703019812740', smartsheet_row_id:'123456789',
};
const legacy = {
  ...modern, id:'synthetic-legacy-1',
  current_task_description:'Completed Sale', sales_stage_changed_at:'',
  sales_last_activity_at:'', follow_up_date:'', expected_close_date:'',
};
const classification = (row) => classifySalesTaskStatusAudit(row).kind;
const review = (row) => classification(row) === 'modern_review';
const cases = [
  ['matched Lead',modern,'none'],
  ['matched Quoted',{...modern,sales_status:'quoted',current_task_description:'Estimate Sent to Customer'},'none'],
  ['matched Follow Up',{...modern,sales_status:'follow_up',current_task_description:'Follow up with Customer - Post-Estimate'},'none'],
  ['matched On Hold',{...modern,sales_status:'on_hold',current_task_description:'On Hold - Follow Up with Customer'},'none'],
  ['matched Won operational',{...modern,sales_status:'won',current_task_description:'WIP - Designing'},'none'],
  ['matched Lost',{...modern,sales_status:'lost',current_task_description:'Lost'},'none'],
  ['modern Lead with Quoted task',{...modern,current_task_description:'Estimate Sent to Customer'},'modern_review'],
  ['modern Quoted with Lead task',{...modern,sales_status:'quoted'},'modern_review'],
  ['modern Follow Up with On Hold task',{...modern,sales_status:'follow_up',current_task_description:'On Hold - Follow Up with Customer'},'modern_review'],
  ['modern Won with Lost text',{...modern,sales_status:'won',current_task_description:'Lost'},'modern_review'],
  ['modern Lost with Won text',{...modern,sales_status:'lost',current_task_description:'SIPs'},'modern_review'],
  ['modern active with WIP',{...modern,current_task_description:'WIP - Installation'},'modern_review'],
  ['neutral close without confirmation',{...modern,current_task_description:'Closed - Did not Lose'},'modern_review'],
  ['unmapped task',{...modern,current_task_description:'New Custom Workflow Task'},'modern_review'],
  ['missing task',{...modern,current_task_description:''},'modern_review'],
  ['unsupported status',{...modern,sales_status:'needs_stage'},'modern_review'],
  ['missing status',{...modern,sales_status:''},'modern_review'],
  ['historical Smartsheet terminal row',legacy,'legacy_context'],
  ['historical lost row',{...legacy,current_task_description:'Lost'},'legacy_context'],
  ['historical closure row',{...legacy,current_task_description:'Closed - Attempted Follow-up/No Response'},'legacy_context'],
  ['historical non-pipeline closed row',{...legacy,in_pipeline:false},'legacy_context'],
  ['non-pipeline active history',{...modern,in_pipeline:false},'none'],
  ['explicit neutral archive',{...modern,in_pipeline:false,sales_neutral_closed_at:'2026-10-08T13:00:00Z',current_task_description:'Closed - Did not Lose'},'none'],
  ['deleted record',{...modern,deleted:true,current_task_description:'Lost'},'none'],
  ['unknown import shell',{...modern,client_name:'Unknown',title:'Smartsheet row 123456789',sales_stage_changed_at:'',current_task_description:'Lost'},'none'],
  ['empty data',{},'none'],
];
for (const [label, row, expected] of cases) {
  same(classification(row),expected,label);
  same(salesTaskStatusNeedsReview(row),expected==='modern_review',label+' review flag');
}
ok(isLegacyTerminalSmartsheetSalesRecord(legacy),'Real shared legacy classifier excludes imported historical terminal work');
same(classifySalesTaskStatusAudit({...modern,current_task_description:'Estimate Sent to Customer'}).mappedStatus,'quoted',
  'Mapping is explanatory only; never modifies sales_status');
same(classifySalesTaskStatusAudit(legacy).mappedStatus,'won',
  'Historical mapped stage is context only, not reported as a modern outcome');

const summary = [
  modern, {...modern,id:'synthetic-modern-2',current_task_description:'Estimate Sent to Customer'},
  legacy, {...modern,id:'synthetic-won',sales_status:'won',current_task_description:'WIP - Designing'},
];
same(summary.filter(review).length,1,'Modern review count excludes legacy history and valid outcome');
same(summary.filter(row=>classification(row)==='legacy_context').length,1,'Legacy count separate from modern review');
same(summary.map(row=>row.sales_status),['lead','lead','lead','won'],
  'Read-only scan never changes original status');

const sheet = readFileSync('src/components/sales/SalesPipelineSpreadsheet.jsx','utf8');
const menu = readFileSync('src/components/sales/salesAttentionMenu.mjs','utf8');
const attention = readFileSync('src/components/sales/salesAttention.js','utf8');
const detail = readFileSync('src/components/sales/SalesOpportunityDialog.jsx','utf8');
const mobile = readFileSync('src/components/sales/SalesPipelineMobileCards.jsx','utf8');
const table = readFileSync('src/components/sales/SalesPipelineRow.jsx','utf8');
ok(menu.includes('key: "task_status_review"') && menu.includes('key: "legacy_task_context"'),
  'Existing More Filters exposes separate modern review and legacy context views');
ok(menu.includes('loaded rows only'),'Review counts explicitly limited to loaded workspace rows');
ok(sheet.includes('summary.taskStatusReviewCount = 0') && sheet.includes('summary.legacyTaskContextCount = 0') &&
  sheet.includes('for (const wo of scopedWorkOrders)') && !sheet.includes('entities.SyncConflict.create('),
  'Audit computes counts from already-loaded scope without writes or new archive queries');
ok(sheet.includes('attentionFilter === "task_status_review"') && sheet.includes('attentionFilter === "legacy_task_context"'),
  'Both read-only filter paths call the shared classifier');
ok(detail.includes("taskStatusAudit.kind !== 'none'") && detail.includes('No classification or timestamp was updated by this audit.'),
  'Opportunity Detail describes the mismatch without automatic action');
ok(table.includes('taskStatusAudit.kind !== \'none\'') && mobile.includes('taskStatusAudit.kind !== \'none\''),
  'Desktop table and mobile cards show consistent review state');
ok(attention.includes('salesTaskStatusNeedsReview(workOrder)') &&
  attention.includes('task_status_review'), 'Modern current opportunity joins existing attention workflow');
console.log('Read-only Sales Task / Status audit: '+checks+'/'+checks+' PASS.');

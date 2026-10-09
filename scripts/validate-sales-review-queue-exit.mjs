import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { classifySalesTaskStatusAudit } from '../base44/shared/salesTaskStatusAudit.mjs';
import { planSalesTaskChange, captureSalesTransitionGuards, untouchedSalesTransitionGuards } from '../src/components/sales/salesTaskStageMapping.mjs';
import {
  salesReviewQueueFilterKey, canKeepLocallyResolvedSalesReview,
  keepLocallyResolvedSalesReviewDetails, nextSalesReviewQueueIndex,
} from '../src/components/sales/salesReviewQueueExit.mjs';

let checks=0;
const check=(value,msg)=>{assert.ok(value,msg);checks++};
const same=(actual,expected,msg)=>{assert.deepEqual(actual,expected,msg);checks++};
const fixture=(id,task,status='lead')=>({
  id,in_pipeline:true,sales_status:status,current_task_description:task,
  updated_date:'2026-10-09T12:00:00Z',
  sales_last_activity_at:'',sales_stage_changed_at:'',
});
const first=fixture('synth-a','Estimate Sent to Customer');
const second=fixture('synth-b','Waiting on Deposit');
const third=fixture('synth-c','On Hold - Follow Up with Customer','quoted');
const reviewRows=[first,second,third].filter(row=>classifySalesTaskStatusAudit(row).kind==='modern_review');
same(reviewRows.map(row=>row.id),['synth-a','synth-b','synth-c'],'Initial read-only filter includes three mismatches');

const filters={attentionFilter:'task_status_review',recordScope:'current',filterStatus:'all',
  searchTerm:'',outcomePeriod:'all',customFilters:[],customHeaderFilter:null};
const filterKey=salesReviewQueueFilterKey(filters);
same(salesReviewQueueFilterKey({...filters}),filterKey,'Same view settings preserve navigation context');
const plan=planSalesTaskChange(first,'Waiting on Deposit');
same(plan.action,'save_stage_and_task','Choosing a different Quoted task uses the protected task/status transition');
same(plan.status,'quoted','Planned Sales stage matches task catalog');
const corrected={...first,current_task_description:plan.task,sales_status:plan.status};
same(classifySalesTaskStatusAudit(corrected).kind,'none','Corrected task no longer needs review');
check(canKeepLocallyResolvedSalesReview({selectedId:first.id,workOrderBefore:first,
  workOrderAfter:corrected,attentionFilter:filters.attentionFilter}),
  'Locally corrected selected mismatch can retain already-open details');
const exit={id:first.id,filterKey};
check(keepLocallyResolvedSalesReviewDetails({selectedId:first.id,exit,filterKey,latestRow:corrected}),
  'Corrected row remains open after leaving filtered queue');
const remaining=[corrected,second,third].filter(row=>
  classifySalesTaskStatusAudit(row).kind==='modern_review');
same(remaining.map(row=>row.id),['synth-b','synth-c'],'Review queue drops resolved row and retains other mismatches');
same(nextSalesReviewQueueIndex({filteredRows:remaining,selectedId:first.id,anchor:0,direction:1}),
  0,'Next after correction selects the next remaining review row');
same(nextSalesReviewQueueIndex({filteredRows:remaining,selectedId:first.id,anchor:0,direction:-1}),
  -1,'Previous from first resolved item is disabled');
same(nextSalesReviewQueueIndex({filteredRows:remaining,selectedId:second.id,anchor:0,direction:1}),
  1,'Normal Next advances to the third mismatch');
same(nextSalesReviewQueueIndex({filteredRows:remaining,selectedId:third.id,anchor:1,direction:1}),
  -1,'Next at end of filtered queue is disabled');

const afterSecond={...second,current_task_description:'Conduct Site Survey'};
const remainingAfterTwo=[afterSecond,third].filter(row=>
  classifySalesTaskStatusAudit(row).kind==='modern_review');
same(nextSalesReviewQueueIndex({filteredRows:remainingAfterTwo,selectedId:second.id,anchor:0,direction:1}),
  0,'Second correction anchors Next to remaining third item');
check(!keepLocallyResolvedSalesReviewDetails({selectedId:first.id,exit,
  filterKey:salesReviewQueueFilterKey({...filters,searchTerm:'another'}),latestRow:corrected}),
  'Search change must close no-longer-visible detail');
check(!keepLocallyResolvedSalesReviewDetails({selectedId:first.id,exit,
  filterKey:salesReviewQueueFilterKey({...filters,attentionFilter:'all'}),latestRow:corrected}),
  'Attention filter change cannot preserve hidden detail');
check(!keepLocallyResolvedSalesReviewDetails({selectedId:first.id,exit,
  filterKey:salesReviewQueueFilterKey({...filters,recordScope:'outcomes'}),latestRow:corrected}),
  'Workspace change cannot preserve hidden detail');
check(!keepLocallyResolvedSalesReviewDetails({selectedId:second.id,exit,filterKey,latestRow:second}),
  'A previously selected row cannot hold open another item');
check(!keepLocallyResolvedSalesReviewDetails({selectedId:first.id,exit,filterKey,latestRow:undefined}),
  'Externally deleted/hidden row cannot retain its detail');
check(!keepLocallyResolvedSalesReviewDetails({selectedId:first.id,exit,filterKey,
  latestRow:{...corrected,current_task_description:'Lost'}}),
  'Remote changes that reintroduce a mismatch revoke detail retention');
check(!canKeepLocallyResolvedSalesReview({selectedId:first.id,workOrderBefore:first,
  workOrderAfter:corrected,attentionFilter:'all'}),
  'No special retention when user is not in Task / Status Review');
check(!canKeepLocallyResolvedSalesReview({selectedId:second.id,workOrderBefore:first,
  workOrderAfter:corrected,attentionFilter:'task_status_review'}),
  'Unrelated selected opportunity cannot arm resolution retention');
check(!canKeepLocallyResolvedSalesReview({selectedId:first.id,workOrderBefore:corrected,
  workOrderAfter:corrected,attentionFilter:'task_status_review'}),
  'Ordinary updates to an already correct row cannot arm review retention');
check(!canKeepLocallyResolvedSalesReview({selectedId:first.id,workOrderBefore:first,
  workOrderAfter:{...first,current_task_description:'Lost'},attentionFilter:'task_status_review'}),
  'Unresolved terminal/mismatched task cannot arm review retention');

const baselines={sales_status:first.sales_status,current_task_description:first.current_task_description};
const guards=captureSalesTransitionGuards(first,baselines);
same(guards.sales_status,'lead','Protected transition guards original saved status');
same(guards.in_pipeline,true,'Protected transition guards modern pipeline membership');
same(untouchedSalesTransitionGuards(guards,{sales_status:plan.status,current_task_description:plan.task}),
  {in_pipeline:true},'Protected write checks untouched pipeline membership');
const source=readFileSync('src/components/sales/SalesPipelineSpreadsheet.jsx','utf8');
check(source.includes('resolvedReviewExitRef.current = canKeepLocallyResolvedSalesReview(') &&
  source.includes('keepLocallyResolvedSalesReviewDetails({'),
  'Actual Sales UI arms and consumes local-resolution protection');
check(source.includes('const targetIndex = nextSalesReviewQueueIndex({') &&
  source.includes('resolvedReviewExitRef.current = null;') &&
  source.includes('setSelectedWorkOrder(filteredWorkOrders[targetIndex]);'),
  'Existing opportunity navigation uses bounded queue anchors and resets prior retention');
check(source.includes('await replaceWorkOrderFieldsIfUnchanged({') &&
  source.includes('historyFieldsAtSave.has(changedField)') &&
  source.includes('trackChange(orderId, changedField, baselineSource[changedField], saved[changedField])'),
  'Actual Sales save writes CellHistory only after conditional WorkOrder save succeeds');
check(source.includes('pendingHistoryFieldsRef.current[orderId] = trackedFields;') &&
  source.includes('!INTERNAL_SALES_TRACKING_FIELDS.has(changedField)'),
  'Task/status changes retain history intent but timestamps are not synthetic history rows');
check(source.includes('if (currentIndex >= 0) {') &&
  source.includes('selectedQueueIndexRef.current = currentIndex;'),
  'While filters pin the original row, the selected index remains stable');

console.log('Sales review queue resolution / save-history safety: '+checks+'/'+checks+' PASS.');

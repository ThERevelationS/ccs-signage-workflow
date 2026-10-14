import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {hasVerifiedEstimateSalesActivity} from '../src/components/estimator/estimateSalesActivity.mjs';
import {resolvePipelineLifecycleDates} from '../src/components/estimator/pipelineStatus.js';
import {
  parseSalesImportRows, buildExistingImportIndexes, resolveSalesImportMatch,
  buildSalesImportPlan
} from '../base44/shared/salesImportUtils.mjs';

let count=0;
const check=(condition,message)=>{assert.ok(condition,message);count++};
const equal=(actual,expected,message)=>{assert.deepEqual(actual,expected,message);count++};
const existing={
  id:'estimate-linked-work-order', title:'Original Sign Title', client_name:'Cincinnati Signs',
  customer_id:'customer-001', contact_name:'Ann',contact_email:'ann@example.com',
  contact_phone:'555-0001',install_location:'10 Main St',
  in_pipeline:true,sales_status:'quoted',sales_rep:'Brett',estimator:'Brett',
  estimate_id:'estimate-123',estimate_amount:5000,date_order_created:'',
  date_estimate_sent:'2026-10-10',sales_quote_sent_verified_at:'2026-10-10T12:00:00.000Z',
  products:[{id:'product-1',quoted_total:5000}],
};
const initial=structuredClone(existing);
const unchanged={...existing};
check(!hasVerifiedEstimateSalesActivity(existing,unchanged),
  'Replaying identical estimate fields never refreshes Sales activity.');
for(const [field,value] of Object.entries({
  title:'New signage project title',client_name:'Renamed customer',
  contact_name:'New contact',contact_email:'new@example.com',
  contact_phone:'555-2222',install_location:'New installation location',
  customer_id:'customer-999'
})){
  check(!hasVerifiedEstimateSalesActivity(existing,{...existing,[field]:value}),
    field+' only does not manufacture Sales activity from generic project data.');
}
for(const [field,value] of Object.entries({
  sales_status:'won',sales_rep:'Twyla',estimator:'Kyle',
  estimate_amount:5300,date_estimate_sent:'2026-10-11',
  date_order_created:'2026-10-14',estimate_id:'another-approved-estimate',
  in_pipeline:false
})){
  check(hasVerifiedEstimateSalesActivity(existing,{[field]:value}),
    field+' real estimator-linked Sales change is tracked.');
}
check(!hasVerifiedEstimateSalesActivity(existing,{products:[{id:'product-2'}]}),
  'Unapproved product field changes are not automatically Sales activity during pipeline sync.');
check(hasVerifiedEstimateSalesActivity(existing,{products:[{id:'product-2'}]},{includeProducts:true}),
  'Approved estimate conversion with changed quote products counts as Sales activity.');
check(!hasVerifiedEstimateSalesActivity(existing,{products:existing.products},{includeProducts:true}),
  'Re-conversion with unchanged approved quote products does not refresh activity.');
check(hasVerifiedEstimateSalesActivity(null,{title:'New job',estimate_id:'estimate-123'}),
  'Creation of a new estimator-linked opportunity is verified activity.');
check(hasVerifiedEstimateSalesActivity(existing,unchanged,{quoteDateVerificationRequested:true}),
  'First trustworthy quote verification is recorded even if the quote date itself is unchanged.');
check(!hasVerifiedEstimateSalesActivity(existing,unchanged,{quoteDateVerificationRequested:false}),
  'Repeated quote synchronization after verification remains a no-op.');

const missingProof={...existing,sales_quote_sent_verified_at:''};
const actualIssued=resolvePipelineLifecycleDates({
  estimateStatus:'sent',previousEstimateStatus:'sent',
  existingDateEstimateSent:missingProof.date_estimate_sent,
  existingQuoteSentVerifiedAt:missingProof.sales_quote_sent_verified_at,
  today:'2026-10-14',issuedQuoteDate:'2026-10-10',issuedQuoteVersion:3
});
equal(actualIssued,{date_estimate_sent:'2026-10-10'},
  'Explicit quote issuance re-submits the already-stored quote date for verification.');
const shouldConfirm=Boolean(actualIssued.date_estimate_sent &&
  actualIssued.date_estimate_sent===missingProof.date_estimate_sent &&
  !missingProof.sales_quote_sent_verified_at);
check(shouldConfirm && hasVerifiedEstimateSalesActivity(missingProof,
  {...missingProof,...actualIssued},{quoteDateVerificationRequested:shouldConfirm}),
  'First issued-quote date verification gets Sales activity despite no date-value change.');
const noIssue=resolvePipelineLifecycleDates({
  estimateStatus:'sent',previousEstimateStatus:'sent',
  existingDateEstimateSent:missingProof.date_estimate_sent,
  existingQuoteSentVerifiedAt:'',today:'2026-10-14',
  issuedQuoteDate:'2026-10-10',issuedQuoteVersion:0
});
equal(noIssue,{},'Historical quote without explicit issuance evidence is not fabricated.');
equal(resolvePipelineLifecycleDates({
  estimateStatus:'sent',previousEstimateStatus:'sent',
  existingDateEstimateSent:existing.date_estimate_sent,
  existingQuoteSentVerifiedAt:existing.sales_quote_sent_verified_at,
  today:'2026-10-14',issuedQuoteDate:'2026-10-10',issuedQuoteVersion:3
}),{},'Repeated verified quote is never reverified.');
equal(existing,initial,'New estimate Sales activity helper does not mutate live records.');

const source=readFileSync('src/components/estimator/customerSync.js','utf8');
const conversion=readFileSync('src/components/estimator/ConvertToWorkOrder.jsx','utf8');
check(source.includes('hasVerifiedEstimateSalesActivity(existing, fields, {') &&
  source.includes('quoteDateVerificationRequested,') &&
  source.includes('if (salesActivityChanged) {'),
  'Actual estimator pipeline save uses Sales-only change predicate plus verified quote issuance.');
check(conversion.includes('hasVerifiedEstimateSalesActivity(existing, convertedFields, {') &&
  conversion.includes('includeProducts: true'),
  'Approved conversion shares activity criteria while counting changed approved products.');
check(source.includes('existing.sales_status !== fields.sales_status'),
  'Estimator stage timing still changes only when actual Sales status changes.');
check(conversion.includes('existing?.sales_status !== "won"'),
  'Already-Won conversion still preserves stage timestamp.');
const importerSource=readFileSync('base44/shared/salesImportUtils.mjs','utf8');
check(importerSource.includes('IMPORTED_SALES_ACTIVITY_FIELDS.has(field)'),
  'Spreadsheet importer still measures activity only using actual proposed Sales fields.');

const when='2026-10-14T17:00:00.000Z';
const parsed=(row)=>{
  const result=parseSalesImportRows([row],{todayStamp:'2026-10-14'});
  equal(result.validRows.length,1,'Synthetic import row is valid.');
  return result.validRows[0];
};
const row={
  id:'imported-work-order',in_pipeline:true,sales_status:'lead',client_name:'Test Sign Client',
  title:'New Banner',est_inv_at:'INV-700',estimate_amount:2500,
  sales_last_activity_at:'2026-09-30T13:00:00.000Z',
  sales_import_last_synced_at:'2026-09-30T13:00:00.000Z',
  sales_import_snapshot:{client_name:'Test Sign Client',title:'New Banner',
    est_inv_at:'INV-700',estimate_amount:2500,sales_status:'lead'}
};
const importInput={Customer:'Test Sign Client','Est/Inv @':'INV-700',
  Notes:'New Banner','Estimate Amount':'2500','Sales Status':'Lead'};
const plan=(input,current,iso=when)=>{
  const data=parsed(input);
  const match=resolveSalesImportMatch(data,buildExistingImportIndexes([current]));
  equal(match.kind,'matched','Stable import identity resolves to one existing WorkOrder.');
  return buildSalesImportPlan(data,match,{nowIso:iso});
};
const noChange=plan(importInput,row);
equal(noChange.kind,'unchanged','Repeated identical Sales import is explicitly unchanged.');
check(!noChange.nextFields,'Unchanged imported row never contains a generated activity timestamp.');
const notesOnly=plan({...importInput,Notes:'New Banner - additional non-sales project notes'},row);
equal(notesOnly.kind,'update','Changing only project title creates a metadata/project update.');
check(!Object.hasOwn(notesOnly.nextFields,'sales_last_activity_at'),
  'Non-sales project title update does not forge Sales activity.');
const amountChanged=plan({...importInput,'Estimate Amount':'2600'},row);
equal(amountChanged.kind,'update','Real changed imported estimate amount creates an update.');
equal(amountChanged.nextFields.sales_last_activity_at,when,
  'Changed imported Sales estimate amount gets a verified activity timestamp.');
const applied={...row,...amountChanged.nextFields};
const repeated=plan({...importInput,'Estimate Amount':'2600'},applied,
  '2026-10-14T18:00:00.000Z');
equal(repeated.kind,'unchanged','Second identical import after Sales change is unchanged.');
check(!repeated.nextFields,'Repeat changed-file import never refreshes Sales activity.');
const onlySourceId=plan({...importInput,'Source Row ID':'7788990011'},row);
equal(onlySourceId.kind,'update','Source identity linking may be stored as import metadata.');
check(!Object.hasOwn(onlySourceId.nextFields,'sales_last_activity_at'),
  'Linking spreadsheet source identity alone does not fake Sales activity.');
const unknownAgain=plan(importInput,{...row,sales_import_snapshot:{}});
check(!Object.hasOwn(unknownAgain.nextFields||{},'sales_last_activity_at'),
  'First import snapshot baseline without Sales data change cannot fabricate activity.');
console.log('Sales Phase 6B estimator/import activity provenance: '+count+'/'+count+' PASS.');

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildWorkOrderReconciliation } from "../base44/shared/workOrderReconciliation.mjs";

const sample = [
  {id:"one",created_date:"2026-09-23T10:20:30Z",client_name:" Alpha   Signs ",title:"Job A",smartsheet_sheet_id:"8702",smartsheet_row_id:"001",in_pipeline:true,deleted:false,estimate_id:"e1",actual_cost:999},
  {id:"two",created_date:"2026-09-23T10:20:30Z",client_name:"ALPHA SIGNS",title:" job a ",smartsheet_sheet_id:"8702",smartsheet_row_id:"001",deleted:false,corbridge_invoice_number:"1234"},
  {id:"three",created_date:"2026-09-24T10:20:30Z",client_name:"Alpha Signs",title:"Job A",smartsheet_sheet_id:"8702",smartsheet_row_id:"002",deleted:false},
  {id:"four",created_date:"2026-09-24T10:20:30Z",client_name:"Other",title:"B",deleted:true},
  {id:"five",client_name:"Other",title:"C",smartsheet_sheet_id:"8702",smartsheet_row_id:"garbled",deleted:false},
];
const initial = structuredClone(sample);
const result = buildWorkOrderReconciliation(sample);
assert.equal(result.total,5);
assert.equal(result.active,4);
assert.equal(result.deleted,1);
assert.equal(result.unique_workorder_ids,5);
assert.equal(result.linked_sheet_rows,3);
assert.equal(result.missing_sheet_links,1);
assert.equal(result.invalid_sheet_links,1);
assert.equal(result.distinct_sheet_links,2);
assert.equal(result.duplicate_sheet_link_groups,1);
assert.equal(result.duplicate_sheet_link_records,2);
assert.deepEqual(result.duplicate_sheet_link_samples,[{link:"8702:001",ids:["one","two"]}]);
assert.equal(result.same_customer_title_groups,1);
assert.equal(result.same_customer_title_records,3);
assert.equal(result.review_only_name_samples[0].count,3);
assert.deepEqual(result.review_only_name_samples[0].jobs.map(x=>x.id),["one","two","three"]);
assert.deepEqual(result.creation_days.map(x=>x.count),[2,2,1]);
assert.deepEqual(result.sheet_groups,[{name:"8702",count:3}]);
assert.equal(result.linked_estimates,1);
assert.equal(result.with_invoice_number,1);
assert.equal(result.sales_pipeline,1);
assert.deepEqual(sample,initial,"audit must not mutate source records");
assert.deepEqual(buildWorkOrderReconciliation(sample,0).review_only_name_samples,[]);
assert.throws(()=>buildWorkOrderReconciliation([{id:"a"},{id:"a"}]),/repeated/);
assert.throws(()=>buildWorkOrderReconciliation([{title:"no id"}]),/Missing/);
assert.throws(()=>buildWorkOrderReconciliation(null),/complete array/);
const many = Array.from({length:100},(_,i)=>({id:"id"+i,client_name:"same",title:"same",smartsheet_row_id:String(i),smartsheet_sheet_id:"11"}));
const capped=buildWorkOrderReconciliation(many,500);
assert.equal(capped.review_only_name_samples[0].count,100);
assert.equal(capped.review_only_name_samples[0].jobs.length,20,"cap detailed sample, preserve group size");
assert(!JSON.stringify(result).includes("999"),"internal costs must not appear in audit");

const gateway=readFileSync(new URL("../base44/functions/corebridgeApiAction/entry.ts",import.meta.url),"utf8");
const page=readFileSync(new URL("../src/components/admin/CorebridgeApiSettings.jsx",import.meta.url),"utf8");
assert(gateway.includes("actor?.role !== 'admin'"),"server-side authorization required");
assert(gateway.includes("'export_jobs_csv', 'audit_workorders'"),"read-only actions explicitly allowlisted");
assert(!/WorkOrder\.(create|update|delete|bulkCreate|bulkUpdate)\s*\(/.test(gateway),"no WorkOrder writes allowed");
assert(!gateway.includes("safeExternalFetch")&&!gateway.includes("COREBRIDGE_SUBSCRIPTION_KEY"),"no retired CoreBridge API access");
assert(page.includes("action: \"audit_workorders\""),"admin page must use read-only action");
console.log("WorkOrder reconciliation: 33 synthetic and static assertions PASS");

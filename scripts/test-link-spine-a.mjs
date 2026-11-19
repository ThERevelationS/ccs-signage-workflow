// Contract check for the record-lifecycle deep-link spine:
//   work order dialog -> job workspace
//   estimate detail   -> job workspace (when a work order exists)
//   product queue row -> customer record
//   job workspace     -> customer / job costing / purchase orders / statement
// Asserts each anchor string is present in the remote file contents.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = (p) => readFileSync(resolve(here, "..", p), "utf8");

// 1. Work order details dialog -> job workspace (forward from any WO).
const wodd = src("src/components/workflow/WorkOrderDetailsDialog.jsx");
assert.ok(
  wodd.includes("to={`/JobWorkspace?wo=${workOrder.id}`}"),
  "WorkOrderDetailsDialog links to /JobWorkspace?wo=<workOrder.id>"
);
assert.ok(wodd.includes("> Job Workspace"), "WorkOrderDetailsDialog renders the Job Workspace link label");

// 2. Estimate detail -> job workspace, gated on estimate.work_order_id.
const ed = src("src/pages/EstimateDetail.jsx");
assert.ok(
  ed.includes("/JobWorkspace?wo=${estimate.work_order_id}"),
  "EstimateDetail links to /JobWorkspace?wo=<estimate.work_order_id>"
);
assert.ok(ed.includes("estimate.work_order_id &&"), "EstimateDetail gates the link on estimate.work_order_id");
assert.ok(ed.includes("Open Job Workspace"), "EstimateDetail renders the Open Job Workspace label");

// 3. Product queue rows -> customer record (table cell + expanded row editor).
//    Customer links go through kit RecordLink (kind "customer" ->
//    /Customer360?id= per recordRoutes.js): the customer hub is the canonical
//    record page; EstimatorCustomers remains the editor surface.
const pq = src("src/components/queues/ProductQueue.jsx");
assert.ok(
  pq.includes("RecordLink kind=\"customer\" id={r.customerId}"),
  "ProductQueue company cell links to the customer record via RecordLink"
);
assert.ok(
  pq.includes("RecordLink kind=\"customer\" id={row.customerId}"),
  "ProductQueue row editor links to the customer record via RecordLink"
);
assert.ok(
  pq.includes("RecordLink kind=\"workorder\" id={r.workOrderId}"),
  "ProductQueue WO ref links to /JobWorkspace?wo= via RecordLink"
);
const pqModel = src("src/components/queues/productQueueModel.js");
assert.ok(pqModel.includes("customerId: wo.customer_id"), "queue row model carries customerId");

// 4. Job workspace header/meta -> customer record, job costing, purchase
//    orders, and customer statement (all keyed off the work order row).
const jw = src("src/components/jobs/JobWorkspace.jsx");
assert.ok(
  jw.includes("RecordLink kind=\"customer\" id={wo.customer_id}"),
  "JobWorkspace customer cell links to the customer record via RecordLink"
);
assert.ok(
  jw.includes("RecordLink kind=\"estimate\" id={wo.estimate_id}"),
  "JobWorkspace links its source estimate via RecordLink (/EstimateDetail?id=)"
);
assert.ok(
  jw.includes("/JobCosting?job=${wo.id}"),
  "JobWorkspace links Job Costing via the job= param (JobCosting matches work_order_id)"
);
assert.ok(
  jw.includes("/PurchaseOrders?wo=${wo.id}"),
  "JobWorkspace links Purchase Orders via the wo= param"
);
assert.ok(
  jw.includes("/CustomerStatements?customer=${wo.customer_id}"),
  "JobWorkspace links customer Statement via the customer= param"
);

// 5. Canonical record routes -- RecordLink kind -> href map (the customer
//    record page is /Customer360?id=; /EstimatorCustomers?customer= stays the
//    editor surface and is linked explicitly where editing is intended).
const rr = src("src/components/kit/recordRoutes.js");
assert.ok(
  rr.includes("customer: { path: \"/Customer360\", param: \"id\""),
  "RecordLink routes customer records to /Customer360?id="
);
assert.ok(
  rr.includes("workorder: { path: \"/JobWorkspace\", param: \"wo\""),
  "RecordLink routes work orders to /JobWorkspace?wo="
);
assert.ok(
  rr.includes("estimate: { path: \"/EstimateDetail\", param: \"id\""),
  "RecordLink routes estimates to /EstimateDetail?id="
);

console.log("PASS link-spine-a");

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
const pq = src("src/components/queues/ProductQueue.jsx");
assert.ok(
  pq.includes("/EstimatorCustomers?customer=${r.customerId}"),
  "ProductQueue company cell links to /EstimatorCustomers?customer="
);
assert.ok(
  pq.includes("/EstimatorCustomers?customer=${row.customerId}"),
  "ProductQueue row editor links to /EstimatorCustomers?customer="
);
const pqModel = src("src/components/queues/productQueueModel.js");
assert.ok(pqModel.includes("customerId: wo.customer_id"), "queue row model carries customerId");

// 4. Job workspace header/meta -> customer record, job costing, purchase
//    orders, and customer statement (all keyed off the work order row).
const jw = src("src/components/jobs/JobWorkspace.jsx");
assert.ok(
  jw.includes("/EstimatorCustomers?customer=${wo.customer_id}"),
  "JobWorkspace customer cell links to /EstimatorCustomers?customer="
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

console.log("PASS link-spine-a");

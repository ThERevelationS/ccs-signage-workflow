// Contract check for the record-lifecycle deep-link spine (pass B):
//   invoice row/detail  -> customer record, job workspace, statement
//   job costing detail  -> job workspace, customer record
//   purchase order detail -> job workspace
//   CRM event row       -> customer record (pre-existing), opportunity
//   follow-up queue row -> customer record (pre-existing), estimate/invoice
//   statement table     -> customer record
// Asserts each anchor string is present in the remote file contents.
// NOTE: the canonical customer record page is /Customer360?id= (recordRoutes
// kind "customer"); /EstimatorCustomers?customer= remains the editor surface.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = (p) => readFileSync(resolve(here, "..", p), "utf8");

// 1. Invoices: customer links in the list row + detail header, Statement
//    action off the customer, and linked-record deep links.
const inv = src("src/pages/Invoices.jsx");
assert.ok(
  inv.includes('import { Link } from "react-router-dom";'),
  "Invoices imports react-router Link"
);
assert.ok(
  inv.includes("/Customer360?id=${inv.customer_id}") || /RecordLink[^>]*kind=["']customer["']/.test(inv),
  "Invoices links customer name to the customer record (literal or RecordLink kind=customer)"
);
assert.ok(
  inv.includes("/CustomerStatements?customer=${inv.customer_id}"),
  "Invoices adds a Statement action to /CustomerStatements?customer="
);
assert.ok(
  inv.includes("/JobWorkspace?wo=${inv.work_order_id}"),
  "Invoices links the work order ref to /JobWorkspace?wo="
);

// 2. JobCosting: detail header -> job workspace + customer (customer id rides
//    on detail.work_order); expanded row gets a Workspace link.
const jc = src("src/pages/JobCosting.jsx");
assert.ok(
  jc.includes('import { Link } from "react-router-dom";'),
  "JobCosting imports react-router Link"
);
assert.ok(
  jc.includes("/JobWorkspace?wo=${workOrderId}"),
  "JobCosting detail title links to /JobWorkspace?wo=<workOrderId>"
);
assert.ok(
  jc.includes("/JobWorkspace?wo=${j.work_order_id}"),
  "JobCosting expanded row links to /JobWorkspace?wo="
);
assert.ok(
  jc.includes("/Customer360?id=${detail.work_order.customer_id}") || /RecordLink[^>]*kind=["']customer["']/.test(jc),
  "JobCosting detail links client to the customer record (literal or RecordLink kind=customer)"
);

// 3. PurchaseOrders: PO detail -> job workspace when work_order_id is set.
const po = src("src/pages/PurchaseOrders.jsx");
assert.ok(
  po.includes('import { Link } from "react-router-dom";'),
  "PurchaseOrders imports react-router Link"
);
assert.ok(
  po.includes("/JobWorkspace?wo=${po.work_order_id}"),
  "PurchaseOrders links the work order ref to /JobWorkspace?wo="
);

// 4. CRM event rows: customer ref -> customer record (already present),
//    opportunity ref -> opportunity record.
const ceq = src("src/components/crm/CrmEventsQueue.jsx");
assert.ok(
  ceq.includes("/Customer360?id=${r.customer_id}"),
  "CrmEventsQueue links the customer ref to the customer record (/Customer360?id=)"
);
assert.ok(
  ceq.includes("/Opportunities?open=${r.opportunity_id}"),
  "CrmEventsQueue links the opportunity ref to /Opportunities?open="
);

// 5. Follow-up queue rows: customer -> customer record (already present);
//    target ref -> invoice detail (?invoice=) or estimate detail (?id=).
const fq = src("src/components/comms/FollowupQueue.jsx");
assert.ok(
  fq.includes("/Customer360?id=${item.customerId}"),
  "FollowupQueue links the customer to the customer record (/Customer360?id=)"
);
assert.ok(
  fq.includes("/Invoices?invoice=${item.targetId}"),
  "FollowupQueue links invoice targets to /Invoices?invoice="
);
assert.ok(
  fq.includes("/EstimateDetail?id=${item.targetId}"),
  "FollowupQueue links estimate targets to /EstimateDetail?id="
);

// 6. CustomerStatements: customer name cell -> customer record.
const cs = src("src/pages/CustomerStatements.jsx");
assert.ok(
  cs.includes('import { Link } from "react-router-dom";'),
  "CustomerStatements imports react-router Link"
);
assert.ok(
  cs.includes("/Customer360?id=${c.id}"),
  "CustomerStatements links the customer cell to the customer record (/Customer360?id=)"
);

console.log("PASS link-spine-b");

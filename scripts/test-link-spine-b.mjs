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
const hasLink = (src, lit, kind) => src.includes(lit) || new RegExp('RecordLink[^>]*kind=["' + String.fromCharCode(39) + ']' + kind + '["' + String.fromCharCode(39) + ']').test(src) || new RegExp('RecordLink[^>]*kind=[{][^}]*["' + String.fromCharCode(39) + ']' + kind + '["' + String.fromCharCode(39) + ']').test(src);
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = (p) => readFileSync(resolve(here, "..", p), "utf8");

// 1. Invoices: customer links in the list row + detail header, Statement
//    action off the customer, and linked-record deep links.
const inv = src("src/pages/Invoices.jsx");
assert.ok(
  (inv.includes('import { Link }') || /RecordLink/.test(inv)),
  "Invoices imports react-router Link"
);
assert.ok(
  hasLink(inv, "/Customer360?id=${inv.customer_id}", "customer") || /RecordLink[^>]*kind=["']customer["']/.test(inv),
  "Invoices links customer name to the customer record (literal or RecordLink kind=customer)"
);
assert.ok(
  inv.includes("/CustomerStatements?customer=${inv.customer_id}"),
  "Invoices adds a Statement action to /CustomerStatements?customer="
);
assert.ok(
  hasLink(inv, "/JobWorkspace?wo=${inv.work_order_id}", "workorder"),
  "Invoices links the work order ref to /JobWorkspace?wo="
);

// 2. JobCosting: detail header -> job workspace + customer (customer id rides
//    on detail.work_order); expanded row gets a Workspace link.
const jc = src("src/pages/JobCosting.jsx");
assert.ok(
  (jc.includes('import { Link }') || /RecordLink/.test(jc)),
  "JobCosting imports react-router Link"
);
assert.ok(
  hasLink(jc, "/JobWorkspace?wo=${workOrderId}", "workorder"),
  "JobCosting detail title links to /JobWorkspace?wo=<workOrderId>"
);
assert.ok(
  hasLink(jc, "/JobWorkspace?wo=${j.work_order_id}", "workorder"),
  "JobCosting expanded row links to /JobWorkspace?wo="
);
assert.ok(
  hasLink(jc, "/Customer360?id=${detail.work_order.customer_id}", "customer") || /RecordLink[^>]*kind=["']customer["']/.test(jc),
  "JobCosting detail links client to the customer record (literal or RecordLink kind=customer)"
);

// 3. PurchaseOrders: PO detail -> job workspace when work_order_id is set.
const po = src("src/pages/PurchaseOrders.jsx");
assert.ok(
  (po.includes('import { Link }') || /RecordLink/.test(po)),
  "PurchaseOrders imports react-router Link"
);
assert.ok(
  hasLink(po, "/JobWorkspace?wo=${po.work_order_id}", "workorder"),
  "PurchaseOrders links the work order ref to /JobWorkspace?wo="
);

// 4. CRM event rows: customer ref -> customer record (already present),
//    opportunity ref -> opportunity record.
const ceq = src("src/components/crm/CrmEventsQueue.jsx");
assert.ok(
  hasLink(ceq, "/Customer360?id=${r.customer_id}", "customer"),
  "CrmEventsQueue links the customer ref to the customer record (/Customer360?id=)"
);
assert.ok(
  hasLink(ceq, "/Opportunities?open=${r.opportunity_id}", "opportunity"),
  "CrmEventsQueue links the opportunity ref to /Opportunities?open="
);

// 5. Follow-up queue rows: customer -> customer record (already present);
//    target ref -> invoice detail (?invoice=) or estimate detail (?id=).
const fq = src("src/components/comms/FollowupQueue.jsx");
assert.ok(
  hasLink(fq, "/Customer360?id=${item.customerId}", "customer"),
  "FollowupQueue links the customer to the customer record (/Customer360?id=)"
);
assert.ok(
  hasLink(fq, "/Invoices?invoice=${item.targetId}", "invoice"),
  "FollowupQueue links invoice targets to /Invoices?invoice="
);
assert.ok(
  hasLink(fq, "/EstimateDetail?id=${item.targetId}", "estimate"),
  "FollowupQueue links estimate targets to /EstimateDetail?id="
);

// 6. CustomerStatements: customer name cell -> customer record.
const cs = src("src/pages/CustomerStatements.jsx");
assert.ok(
  (cs.includes('import { Link }') || /RecordLink/.test(cs)),
  "CustomerStatements imports react-router Link"
);
assert.ok(
  hasLink(cs, "/Customer360?id=${c.id}", "customer"),
  "CustomerStatements links the customer cell to the customer record (/Customer360?id=)"
);

console.log("PASS link-spine-b");

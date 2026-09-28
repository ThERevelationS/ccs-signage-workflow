import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const queue = readFileSync("src/components/sales/SalesDailyQueue.jsx", "utf8");
let checks = 0;
const check = (condition, label) => { assert.ok(condition, label); checks += 1; };

check(queue.includes('import { buildSalesPersonSelectModel } from "@/components/sales/salesPersonIdentity.mjs";'),
  "Daily Queue uses the shared Sales person identity resolver");
check(queue.includes("const canonicalOwnerKey = (value, users) => ownerKey(buildSalesPersonSelectModel(value, users).canonical);"),
  "Mine filtering remains canonical");
check(queue.includes("canonicalOwnerKey(workOrder.sales_rep, users) === currentOwnerKey"),
  "Mine scope still compares canonical owner identities");
check(queue.includes("const salesOwnerLabel = buildSalesPersonSelectModel(workOrder.sales_rep, users).canonical;"),
  "Visible owner label resolves through the same canonical roster");
check(queue.includes('{salesOwnerLabel || "Unassigned"}'),
  "Daily Queue renders canonical owner label with the existing unassigned fallback");
check(!queue.includes('{workOrder.sales_rep || "Unassigned"}'),
  "Daily Queue no longer renders raw legacy Sales Owner values");
check(!queue.includes('onUpdateWorkOrder?.(workOrder.id, "sales_rep", salesOwnerLabel)'),
  "Display normalization does not rewrite production WorkOrder owner data");

console.log("Sales Daily Queue canonical owner display: " + checks + "/" + checks + " PASS.");

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const ui = readFileSync(new URL("../src/pages/EstimatorCustomers.jsx", import.meta.url), "utf8");
const workspace = readFileSync(new URL("../base44/functions/opportunityWorkspaceAction/entry.ts", import.meta.url), "utf8");

assert.match(ui, /function statementHtml\(data\)/, "Customer 360 builds a printable statement");
assert.match(ui, /Open activity/, "statement includes open invoice activity");
assert.match(ui, /Payments received/, "statement includes received payments");
assert.match(ui, /Balance aging/, "statement includes AR aging");
assert.match(ui, /Total balance due/, "statement totals outstanding balances");
assert.match(ui, /w\.document\.write\(statementHtml\(data\)\)/, "Statement action opens the generated statement");
assert.match(ui, /const escHtml =/, "statement escapes customer-provided fields");
assert.match(workspace, /if \(action === "get_customer_360"\)/, "statement uses Customer 360");
assert.match(workspace, /invoices: inv/, "Customer 360 returns invoices");
assert.match(workspace, /payments: custPayments|payments: \(Array\.isArray\(payments\)/, "Customer 360 returns payments");
assert.match(workspace, /ar_aging: \{ \.\.\.aging, as_of: asOf \}/, "Customer 360 returns statement aging");

console.log("PASS Customer 360 customer-statement contract (11 assertions)");
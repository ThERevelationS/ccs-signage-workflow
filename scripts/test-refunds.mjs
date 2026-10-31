import assert from "node:assert/strict";
import { readFileSync, rmSync } from "node:fs";
import { buildSync } from "esbuild";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const service = readFileSync(new URL("../base44/functions/invoicingAction/entry.ts", import.meta.url), "utf8");
const paymentSchema = JSON.parse(readFileSync(new URL("../base44/entities/Payment.jsonc", import.meta.url), "utf8"));
const page = readFileSync(new URL("../src/pages/Invoices.jsx", import.meta.url), "utf8");
const dialogs = readFileSync(new URL("../src/components/invoicing/CreditRefundDialogs.jsx", import.meta.url), "utf8");

// --- 1. Backend actions exist -------------------------------------------------
assert.match(service, /action === "issue_credit_memo"/, "issue_credit_memo action handler");
assert.match(service, /action === "refund_payment"/, "refund_payment action handler");

// Credit memo = negative recorded Payment row with method credit_memo.
assert.match(service, /amount: money\(-amount\)/, "negative ledger amount written");
assert.match(service, /method: "credit_memo"/, "credit memo uses credit_memo method");
// Refund = negative refunded Payment row linked to the original.
assert.match(service, /status: "refunded"/, "refund row carries refunded status");
assert.match(service, /refund_of_payment_id: paymentId/, "refund row links to original payment");

// Over-credit / over-refund validation (cannot exceed collected/refundable).
assert.match(service, /Credit exceeds the collected amount/, "over-credit rejected");
assert.match(service, /Refund exceeds the refundable amount/, "over-refund rejected");
assert.match(service, /Nothing collected on this invoice to credit/, "no-balance credit rejected");
assert.match(service, /already fully refunded or credited/, "double-refund rejected");

// Both actions are idempotent via creation_request_key.
assert.match(service, /creation_request_key: creditKey/, "credit memo idempotent key");
assert.match(service, /creation_request_key: refundKey/, "refund idempotent key");
assert.match(service, /clean\(p\?\.creation_request_key\) !== creditKey/, "credit retry excludes own row");
assert.match(service, /clean\(p\?\.creation_request_key\) !== refundKey/, "refund retry excludes own row");

// Recompute runs after each ledger write, and counts refunded rows in amount_paid.
const recomputeBody = service.slice(service.indexOf("function recomputeInvoiceAfterPayments"), service.indexOf("function agingSummary"));
assert.match(recomputeBody, /\["recorded", "refunded"\]\.includes\(clean\(p\?\.status\)\)/, "recompute nets refund rows into amount_paid");
assert.ok(
  service.indexOf('action === "issue_credit_memo"') < service.indexOf('credit_memo: createdResult.record'),
  "credit returns memo record",
);
const creditBlock = service.slice(service.indexOf('action === "issue_credit_memo"'), service.indexOf('action === "refund_payment"'));
const refundBlock = service.slice(service.indexOf('action === "refund_payment"'), service.indexOf("Unsupported action"));
assert.match(creditBlock, /recomputeInvoiceAfterPayments/, "recompute runs after credit memo");
assert.match(refundBlock, /recomputeInvoiceAfterPayments/, "recompute runs after refund");

// Original payment is marked, never deleted; void of a refund row restores it.
assert.match(refundBlock, /refunded_amount: Math\.max/, "original refunded_amount accumulates");
assert.match(service, /origDesired\.status = "refunded"/, "fully refunded payment flips status");
assert.match(service, /Payment refund reversal/, "voiding a refund row restores the original");
assert.match(service, /Fully refunded payments cannot be voided/, "refunded original protected from void");

// void_invoice now guards on NET collected (fully credited/refunded invoice voids cleanly).
assert.match(service, /netCollected > 0\.005/, "void guarded by net collected balance");

// Restock: honest reporting — linkage check + explicit no-linkage note, no fake movement.
assert.match(refundBlock, /inventory_item_id \|\| li\?\.item_id/, "restock requires line↔inventory linkage");
assert.match(refundBlock, /No restock performed: invoice line items do not reference inventory items/, "honest restock note");
assert.match(refundBlock, /reason: "return"/, "restock movement uses InventoryMovement return shape when linkage exists");

// --- 2. Payment schema ---------------------------------------------------------
assert.ok(paymentSchema.properties.method.enum.includes("credit_memo"), "credit_memo in method enum");
assert.ok(paymentSchema.properties.status.enum.includes("refunded"), "refunded in status enum");
assert.ok(paymentSchema.properties.refund_of_payment_id, "refund_of_payment_id field");
assert.ok(paymentSchema.properties.refunded_amount, "refunded_amount field");
assert.match(paymentSchema.properties.amount.description, /negative for credit-memo and refund rows/, "amount doc notes signed rows");

// --- 3. UI affordances -----------------------------------------------------------
assert.match(page, /import \{ IssueCreditDialog, RefundPaymentDialog \}/, "detail imports dialogs");
assert.match(page, /Ticket className="h-4 w-4" \/>Issue credit/, "Issue credit affordance");
assert.match(page, />Refund</, "per-payment Refund affordance");
assert.match(page, /action: "issue_credit_memo"/, "UI calls issue_credit_memo");
assert.match(page, /action: "refund_payment"/, "UI calls refund_payment");
assert.match(page, /creation_request_key: creditKeyRef\.current/, "credit submit is idempotent");
assert.match(page, /creation_request_key: refundKeyRef\.current/, "refund submit is idempotent");
assert.match(page, /isCreditMemoRow\(p\)/, "CREDIT badge on credit rows");
assert.match(page, /isRefundRow\(p\)/, "REFUND badge on refund rows");
assert.match(page, /usdSigned\(p\.amount\)/, "negative amounts render signed");
assert.match(dialogs, /RESTOCK_AVAILABLE && restock/, "restock flag gated on availability");
assert.match(dialogs, /disabled=\{!RESTOCK_AVAILABLE\}/, "restock checkbox disabled until linkage exists");
assert.match(dialogs, /Issue credit memo/, "credit dialog title");

// --- 4. Penny-safe math model (dynamic) ------------------------------------------
const out = resolve(here, ".tmp-refundmath.mjs");
buildSync({
  entryPoints: [resolve(here, "../src/components/invoicing/refundMath.js")],
  bundle: true, format: "esm", outfile: out, logLevel: "silent",
});
const {
  netCollected, creditableAmount, paymentRefundable,
  creditedTotal, refundedTotal, usdSigned,
  isCreditMemoRow, isRefundRow, RESTOCK_AVAILABLE, RESTOCK_NOTE,
} = await import(pathToFileURL(out).href);

// Paid $100 → collected 100 → full credit default = 100.
{
  const pays = [{ id: "p1", amount: 100, status: "recorded", method: "check" }];
  assert.equal(netCollected(pays), 100);
  assert.equal(creditableAmount(pays), 100);
  assert.equal(paymentRefundable(pays[0], pays), 100);
}
// $100 payment + $30 credit memo → collected 70, refundable capped at 70.
{
  const pays = [
    { id: "p1", amount: 100, status: "recorded", method: "check" },
    { id: "c1", amount: -30, status: "recorded", method: "credit_memo" },
  ];
  assert.equal(netCollected(pays), 70);
  assert.equal(creditableAmount(pays), 70);
  assert.equal(creditedTotal(pays), 30);
  assert.equal(paymentRefundable(pays[0], pays), 70, "refund capped by net held after credit");
}
// Partial refund $40 → refundable drops to 60; voided refund row doesn't count.
{
  const pays = [
    { id: "p1", amount: 100, status: "recorded", method: "check" },
    { id: "r1", amount: -40, status: "refunded", refund_of_payment_id: "p1" },
    { id: "r2", amount: -10, status: "void", refund_of_payment_id: "p1" },
  ];
  assert.equal(paymentRefundable(pays[0], pays), 60);
  assert.equal(refundedTotal(pays), 40);
  assert.equal(netCollected(pays), 60);
}
// Full refund → nothing refundable; fully-refunded original reads as refunded.
{
  const pays = [
    { id: "p1", amount: 100, status: "refunded", refunded_amount: 100, method: "card" },
    { id: "r1", amount: -100, status: "refunded", refund_of_payment_id: "p1" },
  ];
  assert.equal(paymentRefundable(pays[0], pays), 0);
  assert.equal(netCollected(pays), 0);
  assert.equal(creditableAmount(pays), 0);
}
// Retry-safe: rows matching the in-flight creation key are excluded.
{
  const pays = [
    { id: "p1", amount: 100, status: "recorded" },
    { id: "c1", amount: -100, status: "recorded", method: "credit_memo", creation_request_key: "K1" },
  ];
  assert.equal(creditableAmount(pays), 0);
  assert.equal(creditableAmount(pays, "K1"), 100, "retry re-sees full creditable balance");
}
// Penny rounding: fractional cents stay honest.
{
  const pays = [
    { id: "p1", amount: 33.33, status: "recorded" },
    { id: "r1", amount: -11.11, status: "refunded", refund_of_payment_id: "p1" },
  ];
  assert.equal(paymentRefundable(pays[0], pays), 22.22);
  assert.equal(usdSigned(-22.22), "-$22.22");
  assert.equal(usdSigned(22.22), "$22.22");
}
// Row classifiers and restock honesty.
{
  assert.equal(isCreditMemoRow({ amount: -5, method: "credit_memo", status: "recorded" }), true);
  assert.equal(isRefundRow({ amount: -5, status: "refunded", refund_of_payment_id: "p1" }), true);
  assert.equal(isRefundRow({ amount: 5, status: "recorded" }), false);
  assert.equal(RESTOCK_AVAILABLE, false, "restock disabled until line↔inventory linkage lands");
  assert.match(RESTOCK_NOTE, /not linked to inventory items/, "restock note is honest");
}

rmSync(out, { force: true });
console.log("PASS refunds + credit memos (45 assertions)");

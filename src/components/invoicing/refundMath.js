// Penny-safe refund / credit-memo math for the invoice ledger.
//
// Ledger model (mirrors invoicingAction): every money movement is a Payment row
// on the invoice. Payments are positive "recorded" rows; refunds are negative
// "refunded" rows linked by refund_of_payment_id; credit memos are negative
// "recorded" rows with method "credit_memo". Invoice amount_paid is the NET sum
// of counted rows (recorded + refunded), so credits and refunds reopen
// balance_due without destroying the trail.

export const money = (v) => Math.round((Number(v) || 0) * 100) / 100;

const s = (v) => String(v ?? "").trim();

export const COUNTED_STATUSES = ["recorded", "refunded"];

export const isCountedRow = (p) => COUNTED_STATUSES.includes(s(p?.status));
export const isCreditMemoRow = (p) => s(p?.method) === "credit_memo" && Number(p?.amount) < 0;
export const isRefundRow = (p) =>
  s(p?.refund_of_payment_id) !== "" || (s(p?.status) === "refunded" && Number(p?.amount) < 0);

// Net money currently held against the invoice — payments plus negative
// credit/refund rows. Optionally exclude one creation_request_key so a retried
// request does not count its own already-written row.
export function netCollected(payments = [], excludeKey = "") {
  const key = s(excludeKey);
  return money(
    (payments || [])
      .filter((p) => isCountedRow(p) && (!key || s(p?.creation_request_key) !== key))
      .reduce((sum, p) => sum + (Number(p?.amount) || 0), 0),
  );
}

// Max amount a credit memo may cover: the net money actually held.
export function creditableAmount(payments = [], excludeKey = "") {
  return Math.max(0, netCollected(payments, excludeKey));
}

// How much of one recorded payment can still be refunded: the payment's own
// un-refunded remainder, capped by the invoice's net collected balance so a
// refund cannot stack on top of a credit memo against the same dollars.
export function paymentRefundable(payment, payments = [], excludeKey = "") {
  if (!payment?.id || s(payment?.status) !== "recorded" || !(Number(payment?.amount) > 0)) return 0;
  const key = s(excludeKey);
  const refunded = (payments || [])
    .filter(
      (p) =>
        s(p?.refund_of_payment_id) === s(payment.id) &&
        isCountedRow(p) &&
        (!key || s(p?.creation_request_key) !== key),
    )
    .reduce((sum, p) => sum + Math.abs(Number(p?.amount) || 0), 0);
  const remaining = money(Number(payment.amount) - refunded);
  return Math.max(0, money(Math.min(remaining, netCollected(payments, key))));
}

// Totals for display chips: sum of issued credits / refunds (positive numbers).
export function creditedTotal(payments = []) {
  return money((payments || []).filter(isCreditMemoRow).reduce((sum, p) => sum + Math.abs(Number(p?.amount) || 0), 0));
}
export function refundedTotal(payments = []) {
  return money((payments || []).filter(isRefundRow).reduce((sum, p) => sum + Math.abs(Number(p?.amount) || 0), 0));
}

// Signed currency display: "-$30.00" rather than "$-30.00".
export const usdSigned = (v) => {
  const n = Number(v) || 0;
  const abs = Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${n < -0.004 ? "-" : ""}$${abs}`;
};

// Restock is honest-but-unavailable: invoice line_items do not carry inventory
// item ids today, so no InventoryMovement rows can be written for a refund.
// The backend implements the movement path for when that linkage lands.
export const RESTOCK_AVAILABLE = false;
export const RESTOCK_NOTE =
  "Restock is not available yet — invoice line items are not linked to inventory items, so refunded stock cannot be returned automatically. When line↔inventory linkage lands, refunds will write InventoryMovement return rows.";

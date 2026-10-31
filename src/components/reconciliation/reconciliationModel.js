// Pure helpers for the Reconciliation (batched cash close) module.
// The Payment.method enum is cash|check|card|ach|financing|other; the close
// counts four CoreBridge-style tender buckets — cash, check, card, and other,
// where "other" absorbs ach/financing/unknown methods.

export const TENDER_BUCKETS = ["cash", "check", "card", "other"];

export const BUCKET_LABELS = { cash: "Cash", check: "Check", card: "Card", other: "Other" };

export const bucketFor = (method) => {
  const m = String(method ?? "").trim().toLowerCase();
  return TENDER_BUCKETS.includes(m) ? m : "other";
};

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const money = (v) => Math.round(v * 100) / 100;

// Payments still waiting to be swept into a close: recorded (not void/
// refunded), carrying no reconciliation_batch_id, and not already listed in
// any batch's payment_ids (defends against rows whose back-link was never set).
export function unreconciledPayments(payments = [], batches = []) {
  const swept = new Set();
  for (const b of Array.isArray(batches) ? batches : []) {
    for (const id of Array.isArray(b?.payment_ids) ? b.payment_ids : []) {
      const key = String(id ?? "").trim();
      if (key) swept.add(key);
    }
  }
  return (Array.isArray(payments) ? payments : []).filter((p) => {
    if (!p || typeof p !== "object") return false;
    if (String(p.status ?? "recorded") !== "recorded") return false;
    if (String(p.reconciliation_batch_id ?? "").trim()) return false;
    return !swept.has(String(p.id ?? "").trim());
  });
}

// Expected totals for a close, grouped by tender bucket.
// Returns { cash, check, card, other, total, count, by_method } where by_method
// keeps the raw per-method sums for audit detail.
export function batchTotals(payments = []) {
  const buckets = { cash: 0, check: 0, card: 0, other: 0 };
  const byMethod = {};
  let count = 0;
  for (const p of Array.isArray(payments) ? payments : []) {
    if (!p || String(p.status ?? "recorded") !== "recorded") continue;
    const amount = num(p.amount);
    const method = String(p.method ?? "other").trim().toLowerCase() || "other";
    buckets[bucketFor(method)] = money(buckets[bucketFor(method)] + amount);
    byMethod[method] = money((byMethod[method] || 0) + amount);
    count += 1;
  }
  const total = money(TENDER_BUCKETS.reduce((s, b) => s + buckets[b], 0));
  return { ...buckets, total, count, by_method: byMethod };
}

// counted + cashAdjustment - expected. Positive = over, negative = short.
export function computeVariance(expected, collected, adjustment = 0) {
  return money(num(collected) + num(adjustment) - num(expected));
}

// Next REC-#### number: one past the highest numeric suffix already issued.
// Batch numbers are allocated server-side via DocNumberCounter; this is the
// client-side preview and the fallback for display-only contexts.
export function nextBatchNumber(batches = []) {
  let max = 0;
  for (const b of Array.isArray(batches) ? batches : []) {
    const m = /^REC-(\d+)$/i.exec(String(b?.batch_number ?? "").trim());
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `REC-${String(max + 1).padStart(4, "0")}`;
}

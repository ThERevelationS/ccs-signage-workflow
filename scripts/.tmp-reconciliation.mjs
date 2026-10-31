// src/components/reconciliation/reconciliationModel.js
var TENDER_BUCKETS = ["cash", "check", "card", "other"];
var BUCKET_LABELS = { cash: "Cash", check: "Check", card: "Card", other: "Other" };
var bucketFor = (method) => {
  const m = String(method ?? "").trim().toLowerCase();
  return TENDER_BUCKETS.includes(m) ? m : "other";
};
var num = (v) => Number.isFinite(Number(v)) ? Number(v) : 0;
var money = (v) => Math.round(v * 100) / 100;
function unreconciledPayments(payments = [], batches = []) {
  const swept = /* @__PURE__ */ new Set();
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
function batchTotals(payments = []) {
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
function computeVariance(expected, collected, adjustment = 0) {
  return money(num(collected) + num(adjustment) - num(expected));
}
function nextBatchNumber(batches = []) {
  let max = 0;
  for (const b of Array.isArray(batches) ? batches : []) {
    const m = /^REC-(\d+)$/i.exec(String(b?.batch_number ?? "").trim());
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `REC-${String(max + 1).padStart(4, "0")}`;
}
export {
  BUCKET_LABELS,
  TENDER_BUCKETS,
  batchTotals,
  bucketFor,
  computeVariance,
  nextBatchNumber,
  unreconciledPayments
};

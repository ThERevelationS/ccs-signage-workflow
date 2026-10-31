// Purchase-order receiving math — pure and deterministic.
// Mirrors the server-side rules in base44/functions/purchaseOrderAction/entry.ts
// (receive_items → receiveStatus) so the UI derives exactly what the backend will
// persist: per-line open/partial/received, backorder quantities left on a
// partially-received PO, and expected-vs-received cost variance.

export const EPS = 0.005; // same tolerance the backend uses on receipt checks

const num = (v, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};
export const money = (v) => Math.round(num(v) * 100) / 100;
export const qty = (v) => Math.round(num(v) * 1000) / 1000;

export const LINE_STATUS = { OPEN: "open", PARTIAL: "partial", RECEIVED: "received" };
export const PO_ROLLUP = { OPEN: "open", PARTIAL: "partial", RECEIVED: "received" };

export const LINE_STATUS_LABELS = { open: "Open", partial: "Partial", received: "Received" };

// Map the model's rollup onto the entity status enum the backend persists.
export const toPoStatus = (rollup) =>
  rollup === PO_ROLLUP.RECEIVED ? "received"
    : rollup === PO_ROLLUP.PARTIAL ? "partially_received"
      : "sent";

// One PO line → derived receiving state.
// `poHasReceipt` controls backorder labeling: once a PO has had ANY receipt, the
// still-owed remainder is vendor backorder (CoreBridge semantics) rather than
// simply "not yet delivered".
export function deriveLineReceipt(line, { poHasReceipt } = {}) {
  const ordered = Math.max(0, qty(line?.quantity));
  const received = Math.max(0, qty(line?.quantity_received));
  const open = Math.max(0, qty(ordered - received));
  const unitCost = money(line?.unit_cost);
  const status = received <= EPS
    ? LINE_STATUS.OPEN
    : open <= EPS
      ? LINE_STATUS.RECEIVED
      : LINE_STATUS.PARTIAL;
  const anyReceipt = poHasReceipt === undefined ? received > EPS : poHasReceipt === true;
  const backordered = open > EPS && anyReceipt ? open : 0;
  const orderedCost = money(ordered * unitCost);
  const receivedCost = money(received * unitCost);
  const openCost = money(open * unitCost);
  return {
    ordered,
    received,
    open,
    backordered,
    status,
    unit_cost: unitCost,
    ordered_cost: orderedCost,
    received_cost: receivedCost,
    open_cost: openCost,
    // Expected-vs-received variance — negative means the vendor shipped short.
    variance_qty: qty(received - ordered),
    variance_cost: money(receivedCost - orderedCost),
    overdue: false, // stamped by derivePoReceipt when expected_date has passed
  };
}

// Whole PO → per-line states + rollup totals, mirroring receiveStatus() in the backend.
export function derivePoReceipt(po, { today } = {}) {
  const items = Array.isArray(po?.line_items) ? po.line_items : [];
  const anyReceived = items.some((r) => num(r?.quantity_received) > EPS);
  const todayStr = today || new Date().toISOString().slice(0, 10);
  const poOverdue = Boolean(clean(po?.expected_date) && clean(po?.expected_date) < todayStr
    && ["sent", "partially_received"].includes(clean(po?.status)));
  const lines = items.map((line, index) => ({
    index,
    description: clean(line?.description),
    inventory_item_id: clean(line?.inventory_item_id),
    ...deriveLineReceipt(line, { poHasReceipt: anyReceived }),
  }));
  for (const l of lines) l.overdue = poOverdue && l.open > EPS;

  const totals = lines.reduce((t, l) => ({
    ordered: qty(t.ordered + l.ordered),
    received: qty(t.received + l.received),
    open: qty(t.open + l.open),
    backordered: qty(t.backordered + l.backordered),
    ordered_cost: money(t.ordered_cost + l.ordered_cost),
    received_cost: money(t.received_cost + l.received_cost),
    open_cost: money(t.open_cost + l.open_cost),
    variance_qty: qty(t.variance_qty + l.variance_qty),
    variance_cost: money(t.variance_cost + l.variance_cost),
  }), {
    ordered: 0, received: 0, open: 0, backordered: 0,
    ordered_cost: 0, received_cost: 0, open_cost: 0,
    variance_qty: 0, variance_cost: 0,
  });

  const rollup = lines.length === 0
    ? PO_ROLLUP.OPEN
    : lines.every((l) => l.status === LINE_STATUS.RECEIVED)
      ? PO_ROLLUP.RECEIVED
      : anyReceived
        ? PO_ROLLUP.PARTIAL
        : PO_ROLLUP.OPEN;

  return {
    lines,
    totals,
    rollup,
    status: toPoStatus(rollup),
    any_received: anyReceived,
    complete: rollup === PO_ROLLUP.RECEIVED,
    overdue: poOverdue,
    percent_received: totals.ordered > 0 ? Math.min(100, Math.round((totals.received / totals.ordered) * 1000) / 10) : 0,
  };
}

const clean = (v) => String(v ?? "").trim();

// Turn the UI's {index: qty} input map into the exact lines payload the backend's
// receive_items action expects — [{index, quantity}] — with client-side checks
// that mirror the server's 400/409 guards so bad input never leaves the page.
export function buildReceiptLines(receiveQtys, receipt) {
  const lines = [];
  const errors = [];
  const byIndex = new Map((receipt?.lines || []).map((l) => [l.index, l]));
  for (const [rawIndex, rawQty] of Object.entries(receiveQtys || {})) {
    const index = Math.trunc(Number(rawIndex));
    const quantity = num(rawQty, NaN);
    if (!(quantity > 0)) continue; // blank/zero entries are ignored, like the old inline UI
    if (!byIndex.has(index)) { errors.push(`Receipt references a missing line (${index + 1}).`); continue; }
    const line = byIndex.get(index);
    if (quantity - line.open > EPS) {
      errors.push(`Receiving ${quantity} exceeds the open quantity on line ${index + 1} (${line.open} open).`);
      continue;
    }
    lines.push({ index, quantity: qty(quantity) });
  }
  if (lines.length === 0 && errors.length === 0) {
    errors.push("Enter a quantity to receive on at least one line.");
  }
  return { lines, errors };
}

// Plain-text receiving/backorder summary — used for vendor-notify (mailto body +
// clipboard copy). Deterministic output; no network side effects.
export function receivingSummaryText(po, receipt, { includeBackorderNote = true } = {}) {
  const r = receipt || derivePoReceipt(po);
  const out = [];
  out.push(`Purchase order ${clean(po?.po_number) || "(no number)"}${po?.vendor_name ? ` — ${clean(po.vendor_name)}` : ""}`);
  if (clean(po?.order_date)) out.push(`Ordered: ${clean(po.order_date)}`);
  if (clean(po?.expected_date)) out.push(`Expected: ${clean(po.expected_date)}${r.overdue ? " (OVERDUE)" : ""}`);
  out.push("");
  out.push("Lines:");
  for (const l of r.lines) {
    const parts = [`- ${l.description || `Line ${l.index + 1}`}: ordered ${l.ordered}, received ${l.received}`];
    if (l.open > EPS) parts.push(`open ${l.open}`);
    if (l.backordered > EPS) parts.push(`BACKORDER ${l.backordered}`);
    parts.push(`[${LINE_STATUS_LABELS[l.status] || l.status}]`);
    out.push(parts.join(", "));
  }
  out.push("");
  out.push(`Totals: ordered ${r.totals.ordered}, received ${r.totals.received}, open ${r.totals.open}${r.totals.backordered > EPS ? `, backordered ${r.totals.backordered}` : ""}`);
  if (includeBackorderNote && r.totals.backordered > EPS) {
    out.push("Please advise on the backorder ETA for the open quantities above.");
  }
  return out.join("\n");
}

// mailto: deep link for vendor notify — the backend has no vendor-email action,
// so the UI hands the operator a prefilled email instead.
export function vendorNotifyMailto(po, receipt) {
  const r = receipt || derivePoReceipt(po);
  const to = clean(po?.vendor_email);
  const subject = `${clean(po?.po_number) || "PO"} receiving${r.totals?.backordered > EPS ? " / backorder" : ""} update`;
  const body = receivingSummaryText(po, r);
  return { to, subject, body, href: `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}` };
}

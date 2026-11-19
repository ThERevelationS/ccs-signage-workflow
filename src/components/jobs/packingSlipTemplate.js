// Pure packing-slip model + print-ready HTML renderer for WorkOrders —
// CoreBridge packing-slip style: order number, company, ship-to, and
// qty / product-name / notes rows ONLY. NO monetary fields (no unit price,
// no extended price, no totals) ever appear on the document — receivers
// verify counts and condition, not dollars.
//
// Kept React/base44-free so the model is unit-testable under Node and a
// page or deployed function can render or print the same document without
// extra dependencies. Follows the same pure-model convention as
// src/components/walkin/walkInModel.js and jobWorkspaceModel.js; WorkOrder
// field names match src/pages/WorkOrderTraveler.jsx.

const num = (v, fallback = 0) => (Number.isFinite(Number(v)) ? Number(v) : fallback);
const clean = (v) => String(v ?? "").trim();
const firstText = (...vals) => {
  for (const v of vals) {
    const s = clean(v);
    if (s) return s;
  }
  return "";
};

// Accepts a string ("line1\nline2"), an array of strings, or an array of
// objects with name/label/text — anything reasonable becomes display lines.
const textLines = (v) => {
  if (v == null) return [];
  const items = Array.isArray(v) ? v : [v];
  const out = [];
  for (const item of items) {
    if (item == null) continue;
    const raw = typeof item === "object"
      ? firstText(item.line, item.text, item.label, item.name, item.address)
      : String(item);
    for (const piece of raw.split(/\r?\n/)) {
      const s = clean(piece);
      if (s) out.push(s);
    }
  }
  return out;
};

const fmtQty = (v) => {
  const n = num(v, NaN);
  if (!Number.isFinite(n)) return "";
  return Number.isInteger(n) ? n : Math.round(n * 100) / 100;
};

const fmtDate = (v) => {
  const s = clean(v);
  if (!s) return "";
  const d = s.length === 10 ? new Date(`${s}T12:00:00`) : new Date(s);
  return Number.isNaN(d.getTime())
    ? s
    : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

const escapeHtml = (v) => String(v ?? "")
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&#39;");

// WorkOrder.current_stage enum → display label (same map as the traveler).
export const PACKING_SLIP_STAGE_LABELS = {
  estimating: "Estimating",
  sales: "Sales",
  permitting: "Permitting",
  design: "Design",
  production: "Production",
  fabrication: "Fabrication",
  installation: "Installation",
  completed: "Completed",
};

// Product.fulfillment_state enum → display label for a "ship status" column.
export const PACKING_SLIP_FULFILLMENT_LABELS = {
  none: "",
  awaiting_pickup: "Awaiting Pickup",
  awaiting_installation: "Awaiting Installation",
  awaiting_shipping: "Awaiting Shipping",
  awaiting_delivery: "Awaiting Delivery",
  picked_up: "Picked Up",
  installed: "Installed",
  shipped: "Shipped",
  delivered: "Delivered",
};

// Shop identity printed in the slip header. Defaults are placeholders —
// callers should pass { company: {...} } (e.g. from GlobalSettings) to stamp
// the real shop name/address/phone. Shape: { name, address_lines[], phone,
// email, logo_url }.
export const PACKING_SLIP_DEFAULT_COMPANY = {
  name: "CCS Signage",
  address_lines: [],
  phone: "",
  email: "",
  logo_url: "",
};

// CoreBridge-style handling marks — empty checkboxes the packer or receiver
// ticks by hand. `checked` is pre-filled from workOrder[key] or
// options.checkedHandling so a WO flagged fragile prints pre-ticked.
export const PACKING_SLIP_HANDLING_CHECKS = [
  { key: "fragile", label: "Fragile" },
  { key: "this_side_up", label: "This Side Up" },
  { key: "do_not_stack", label: "Do Not Stack" },
  { key: "keep_dry", label: "Keep Dry" },
];

// Write-in blanks the warehouse fills at pack-out. `key` also reads a
// matching WorkOrder field when present (po_number, ship_via, tracking_number).
export const PACKING_SLIP_HANDLING_BLANKS = [
  { key: "pieces", label: "No. of Boxes / Pieces" },
  { key: "po_number", label: "Customer PO #" },
  { key: "ship_via", label: "Ship Via / Carrier" },
  { key: "tracking_number", label: "Tracking / PRO #" },
];

// Signature line at the bottom — CoreBridge slips end with receive/verify
// blanks so the chain of custody lives on paper.
export const PACKING_SLIP_SIGNATURES = [
  { key: "packed_by", label: "Packed By" },
  { key: "checked_by", label: "Checked By" },
  { key: "received_by", label: "Received By (Print + Sign)" },
  { key: "received_date", label: "Date Received" },
];

const cityLine = (wo) => {
  const cityState = [
    firstText(wo.city, wo.township_city),
    firstText(wo.state, wo.county),
  ].filter(Boolean).join(", ");
  return [cityState, firstText(wo.zip, wo.postal_code, wo.zip_code)]
    .filter(Boolean).join(" ");
};

// Ship-to precedence: explicit shipping fields on the WorkOrder (or
// options.shipTo) → install site (install_location + address line 2 +
// city/state) → billing address as last resort. Name/attention/phone/email
// come from the WO's client + contact fields.
const buildShipTo = (wo, options) => {
  const ov = options.shipTo || options.ship_to || {};
  const explicit = [
    ...textLines(ov.address_lines),
    ...textLines(ov.address),
    ...textLines(wo.ship_to_address_lines),
    ...textLines(wo.ship_to_address),
    ...textLines(wo.shipping_address),
    ...textLines(wo.delivery_address),
  ];
  const site = [
    ...textLines(wo.install_location),
    ...textLines(wo.address_line_2),
    ...textLines(cityLine(wo)),
  ];
  const billing = [
    ...textLines(wo.billing_address),
    ...textLines(wo.billing_address_line_2),
  ];
  return {
    name: firstText(ov.name, wo.ship_to_name, wo.client_name, wo.customer_name),
    attention: firstText(ov.attention, wo.contact_name, wo.additional_contact),
    address_lines: explicit.length ? explicit : (site.length ? site : billing),
    phone: firstText(ov.phone, wo.contact_phone),
    email: firstText(ov.email, wo.contact_email),
  };
};

const buildCompany = (wo, options) => {
  const src = options.company || wo.company || {};
  return {
    name: firstText(src.name, wo.company_name, PACKING_SLIP_DEFAULT_COMPANY.name),
    address_lines: textLines(src.address_lines ?? src.address ?? PACKING_SLIP_DEFAULT_COMPANY.address_lines),
    phone: firstText(src.phone, PACKING_SLIP_DEFAULT_COMPANY.phone),
    email: firstText(src.email, PACKING_SLIP_DEFAULT_COMPANY.email),
    logo_url: firstText(src.logo_url, src.logo, PACKING_SLIP_DEFAULT_COMPANY.logo_url),
  };
};

// One row per packed line — qty + name + notes ONLY. Product rows carry no
// monetary keys by construction (fields are whitelisted, never copied), so
// quoted_unit_price / quoted_total / costs can never leak onto the slip.
const buildRows = (wo) => {
  const rows = [];
  for (const p of Array.isArray(wo.products) ? wo.products : []) {
    if (!p) continue;
    const name = firstText(
      p.customer_description,
      p.description,
      p.client_product_name,
      p.product_type,
    );
    const qty = fmtQty(p.quantity);
    // Match the traveler's cut-list rule: skip rows with neither a label nor
    // a non-zero quantity (nameless zero-qty rows are conversion noise).
    if (!name && !num(qty)) continue;
    rows.push({
      line: rows.length + 1,
      product_id: clean(p.id),
      qty,
      name: name || "Item",
      notes: firstText(
        p.packing_notes,
        p.shipping_notes,
        p.estimator_notes,
        p.production_notes,
        p.notes,
      ),
    });
  }
  // Legacy flat product_1..product_6 columns predate the products[] array.
  for (let i = 1; i <= 6; i += 1) {
    const name = clean(wo[`product_${i}`]);
    if (!name) continue;
    rows.push({ line: rows.length + 1, product_id: "", qty: "", name, notes: "" });
  }
  return rows;
};

export function buildPackingSlipModel(workOrder, options = {}) {
  const wo = workOrder || {};
  const rows = buildRows(wo);
  const orderNumber = firstText(
    wo.corbridge_invoice_number,
    wo.order_number,
    wo.work_order_number,
    wo.invoice_number,
    wo.id,
  );
  const workOrderId = clean(wo.id);
  const checkedHandling = new Set(
    Array.isArray(options.checkedHandling) ? options.checkedHandling.map(clean) : [],
  );

  const meta = [
    { label: "Due Date", value: fmtDate(wo.due_date) },
    {
      label: "Stage",
      value: PACKING_SLIP_STAGE_LABELS[clean(wo.current_stage)] || clean(wo.current_stage),
    },
    { label: "Sales Rep", value: firstText(wo.sales_rep, wo.representative) },
    { label: "Project Manager", value: clean(wo.project_manager) },
  ].filter((entry) => entry.value);

  const handlingBlanks = PACKING_SLIP_HANDLING_BLANKS.map((blank) => ({
    ...blank,
    value: firstText(wo[blank.key], wo[`shipping_${blank.key}`]),
  }));

  return {
    document_title: firstText(options.documentTitle, "Packing Slip"),
    order_number: orderNumber || workOrderId || "—",
    job_code: workOrderId ? `WO-${workOrderId.toUpperCase()}` : orderNumber,
    work_order_id: workOrderId,
    work_order_title: clean(wo.title),
    asap: wo.asap === true,
    printed_at: firstText(options.printedAt, options.printed_at, new Date().toISOString()),
    company: buildCompany(wo, options),
    ship_to: buildShipTo(wo, options),
    meta,
    rows,
    row_count: rows.length,
    piece_count: rows.reduce((sum, row) => sum + (row.qty === "" ? 0 : num(row.qty)), 0),
    handling: {
      checks: PACKING_SLIP_HANDLING_CHECKS.map((check) => ({
        ...check,
        checked: checkedHandling.has(check.key) || wo[check.key] === true,
      })),
      blanks: handlingBlanks,
      signatures: PACKING_SLIP_SIGNATURES.map((sig) => ({
        ...sig,
        value: firstText(wo[sig.key]),
      })),
      condition_note: firstText(
        options.conditionNote,
        "Verify contents against this slip before signing. Note any shortage or damage below.",
      ),
    },
    footer_note: firstText(options.footerNote, "This packing slip lists quantities only — see invoice for pricing."),
  };
}

// ---------------------------------------------------------------------------
// Renderer — standalone print-ready HTML. Inline styles only, no external
// fonts/scripts/images (except an optional caller-supplied company logo URL).
// ---------------------------------------------------------------------------

const box = (checked) =>
  `<span style="display:inline-block;width:11px;height:11px;border:1.5px solid #334155;` +
  `border-radius:2px;vertical-align:-1.5px;background:${checked ? "#334155" : "#fff"};"></span>`;

const label = (text) =>
  `<div style="font-size:9px;font-weight:700;text-transform:uppercase;` +
  `letter-spacing:0.08em;color:#64748b;">${escapeHtml(text)}</div>`;

const blankLine = (lbl, value, flex) =>
  `<div style="flex:${flex || "1"};min-width:120px;">` +
  `<div style="height:26px;border-bottom:1px solid #94a3b8;font-size:12px;` +
  `color:#0f172a;padding:8px 2px 0;">${escapeHtml(value || "")}</div>` +
  `<div style="font-size:9px;font-weight:700;text-transform:uppercase;` +
  `letter-spacing:0.06em;color:#64748b;padding-top:2px;">${escapeHtml(lbl)}</div></div>`;

const renderAddress = (lines) =>
  lines.length
    ? lines.map((l) => `<div>${escapeHtml(l)}</div>`).join("")
    : `<div style="color:#94a3b8;">&mdash;</div>`;

export function renderPackingSlipHtml(model, renderOptions = {}) {
  // Accepts a built model — or a raw WorkOrder, which is converted on the fly
  // so a page can call renderPackingSlipHtml(workOrder) directly.
  const m = model && (Array.isArray(model.rows) || model.order_number != null || model.ship_to)
    ? model
    : buildPackingSlipModel(model);
  const company = m.company || {};
  const shipTo = m.ship_to || {};
  const handling = m.handling || {};
  const checks = Array.isArray(handling.checks) ? handling.checks : [];
  const blanks = Array.isArray(handling.blanks) ? handling.blanks : [];
  const signatures = Array.isArray(handling.signatures) ? handling.signatures : [];
  const meta = Array.isArray(m.meta) ? m.meta : [];
  const rows = Array.isArray(m.rows) ? m.rows : [];

  const printedAt = (() => {
    const d = new Date(m.printed_at);
    return Number.isNaN(d.getTime())
      ? clean(m.printed_at)
      : d.toLocaleString("en-US", {
          month: "short", day: "numeric", year: "numeric",
          hour: "numeric", minute: "2-digit",
        });
  })();

  const companyHtml = `
    <div>
      ${company.logo_url
        ? `<img src="${escapeHtml(company.logo_url)}" alt="" ` +
          `style="max-height:44px;max-width:180px;object-fit:contain;display:block;margin-bottom:4px;" />`
        : ""}
      ${company.name
        ? `<div style="font-size:15px;font-weight:800;color:#0f172a;">${escapeHtml(company.name)}</div>`
        : ""}
      <div style="font-size:11px;color:#475569;line-height:1.45;">
        ${renderAddress(company.address_lines || [])}
        ${company.phone ? `<div>${escapeHtml(company.phone)}</div>` : ""}
        ${company.email ? `<div>${escapeHtml(company.email)}</div>` : ""}
      </div>
    </div>`;

  const titleHtml = `
    <div style="text-align:right;">
      <div style="font-size:22px;font-weight:800;letter-spacing:0.06em;color:#0f172a;text-transform:uppercase;">
        ${escapeHtml(m.document_title || "Packing Slip")}
      </div>
      <div style="font-size:12px;color:#475569;margin-top:2px;">
        Order <span style="font-weight:700;color:#0f172a;">${escapeHtml(m.order_number)}</span>
      </div>
      <div style="font-size:10px;color:#94a3b8;margin-top:2px;">Printed ${escapeHtml(printedAt)}</div>
      ${m.asap
        ? `<div style="display:inline-block;margin-top:4px;background:#dc2626;color:#fff;` +
          `font-size:9px;font-weight:800;letter-spacing:0.08em;padding:2px 8px;border-radius:3px;">ASAP</div>`
        : ""}
    </div>`;

  const shipToHtml = `
    <div style="border:1.5px solid #334155;border-radius:4px;padding:10px 12px;">
      ${label("Ship To")}
      <div style="font-size:13px;font-weight:700;color:#0f172a;margin-top:2px;">
        ${escapeHtml(shipTo.name || "—")}
      </div>
      ${shipTo.attention
        ? `<div style="font-size:11px;color:#475569;">Attn: ${escapeHtml(shipTo.attention)}</div>`
        : ""}
      <div style="font-size:12px;color:#0f172a;line-height:1.5;margin-top:2px;">
        ${renderAddress(shipTo.address_lines || [])}
      </div>
      ${shipTo.phone || shipTo.email
        ? `<div style="font-size:11px;color:#475569;margin-top:2px;">` +
          `${[shipTo.phone, shipTo.email].filter(Boolean).map(escapeHtml).join(" &middot; ")}</div>`
        : ""}
    </div>`;

  const metaHtml = meta.length
    ? `<div style="display:flex;gap:8px;margin-top:10px;">` +
      meta.map((entry) =>
        `<div style="flex:1;border:1px solid #cbd5e1;border-radius:4px;padding:5px 8px;text-align:center;">` +
        `${label(entry.label)}` +
        `<div style="font-size:12px;font-weight:600;color:#1e293b;">${escapeHtml(entry.value)}</div></div>`
      ).join("") + `</div>`
    : "";

  const rowHtml = rows.length
    ? rows.map((row, i) =>
        `<tr style="background:${i % 2 ? "#f8fafc" : "#fff"};">` +
        `<td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;font-size:12px;color:#64748b;width:34px;text-align:right;">${escapeHtml(row.line ?? i + 1)}</td>` +
        `<td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;font-size:13px;font-weight:700;color:#0f172a;width:60px;text-align:center;">${escapeHtml(row.qty === "" || row.qty == null ? "—" : row.qty)}</td>` +
        `<td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;font-size:13px;color:#0f172a;">${escapeHtml(row.name)}</td>` +
        `<td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;font-size:11px;color:#475569;">${escapeHtml(row.notes || "")}</td>` +
        `<td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;width:60px;text-align:center;">${box(false)}</td>` +
        `</tr>`
      ).join("")
    : `<tr><td colspan="5" style="padding:14px;text-align:center;font-size:12px;color:#94a3b8;">No products on this work order.</td></tr>`;

  const itemsHtml = `
    <table style="width:100%;border-collapse:collapse;margin-top:10px;border:1.5px solid #334155;">
      <thead>
        <tr style="background:#f1f5f9;">
          <th style="padding:6px 8px;border-bottom:1.5px solid #334155;font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:0.08em;color:#475569;text-align:right;">#</th>
          <th style="padding:6px 8px;border-bottom:1.5px solid #334155;font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:0.08em;color:#475569;text-align:center;">Qty</th>
          <th style="padding:6px 8px;border-bottom:1.5px solid #334155;font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:0.08em;color:#475569;text-align:left;">Product / Description</th>
          <th style="padding:6px 8px;border-bottom:1.5px solid #334155;font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:0.08em;color:#475569;text-align:left;">Notes</th>
          <th style="padding:6px 8px;border-bottom:1.5px solid #334155;font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:0.08em;color:#475569;text-align:center;">Packed</th>
        </tr>
      </thead>
      <tbody>${rowHtml}</tbody>
    </table>`;

  const checksHtml = checks.length
    ? `<div style="display:flex;flex-wrap:wrap;gap:14px;margin-top:12px;">` +
      checks.map((check) =>
        `<span style="font-size:12px;color:#0f172a;">${box(check.checked)} ${escapeHtml(check.label)}</span>`
      ).join("") + `</div>`
    : "";

  const blanksHtml = blanks.length
    ? `<div style="display:flex;flex-wrap:wrap;gap:18px;margin-top:14px;">` +
      blanks.map((b) => blankLine(b.label, b.value)).join("") + `</div>`
    : "";

  const signaturesHtml = signatures.length
    ? `<div style="display:flex;gap:24px;margin-top:22px;page-break-inside:avoid;">` +
      signatures.map((s) => blankLine(s.label, s.value)).join("") + `</div>`
    : "";

  const conditionHtml = handling.condition_note
    ? `<div style="margin-top:14px;font-size:10px;color:#64748b;font-style:italic;">${escapeHtml(handling.condition_note)}</div>`
    : "";

  const footerHtml = `
    <div style="display:flex;justify-content:space-between;margin-top:20px;padding-top:6px;border-top:1px solid #cbd5e1;font-size:9px;color:#94a3b8;">
      <span>${escapeHtml(m.footer_note || "")}</span>
      <span>${escapeHtml(m.document_title || "Packing Slip")} &mdash; ${escapeHtml(m.order_number)}${m.job_code ? ` (${escapeHtml(m.job_code)})` : ""}</span>
    </div>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(m.document_title || "Packing Slip")} — ${escapeHtml(m.order_number)}</title>
<style>
  @page { margin: 0.55in; }
  * { box-sizing: border-box; }
  body { margin: 0; }
  @media print { .no-print { display: none !important; } }
</style>
</head>
<body style="font-family:Arial,Helvetica,sans-serif;background:#fff;color:#0f172a;">
<div style="max-width:8in;margin:0 auto;padding:0.25in;">
  <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;border-bottom:2.5px solid #0f172a;padding-bottom:10px;">
    ${companyHtml}
    ${titleHtml}
  </div>
  <div style="display:flex;gap:12px;margin-top:10px;">
    <div style="flex:1.4;">${shipToHtml}</div>
    <div style="flex:1;border:1px solid #cbd5e1;border-radius:4px;padding:10px 12px;">
      ${label("Work Order")}
      <div style="font-size:12px;font-weight:600;color:#1e293b;margin-top:2px;">${escapeHtml(m.work_order_title || m.job_code || "—")}</div>
      ${m.work_order_title && m.job_code
        ? `<div style="font-size:10px;color:#64748b;font-family:monospace;margin-top:2px;">${escapeHtml(m.job_code)}</div>`
        : ""}
      ${m.piece_count
        ? `<div style="font-size:10px;color:#475569;margin-top:6px;">Total pieces: <b>${escapeHtml(m.piece_count)}</b> across ${rows.length} line${rows.length === 1 ? "" : "s"}</div>`
        : ""}
    </div>
  </div>
  ${metaHtml}
  ${itemsHtml}
  ${checksHtml}
  ${blanksHtml}
  ${conditionHtml}
  ${signaturesHtml}
  ${footerHtml}
</div>
${renderOptions.autoPrint ? `<script>window.addEventListener("load",function(){window.print();});</scr` + `ipt>` : ""}
</body>
</html>`;
}

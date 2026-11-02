// D-07 — customer-facing invoice print model + "Invoice View Settings".
// Pure and IO-free (same convention as packingSlipTemplate.js) so the model,
// the settings normalization and the HTML render are unit-testable under Node.
//
// Reads the Invoice entity row the page already fetches (invoicingAction
// get_invoice/list_invoices shape): invoice_number, customer_display_name,
// bill_to_*/contact fields, issue_date/due_date, line_items[] ({description,
// quantity, unit_price, total}), subtotal/discount_amount/tax_rate/tax_amount/
// shipping_amount/postage_amount, total, amount_paid, balance_due, payments[].
//
// INVOICE_VIEW_SETTINGS — the "Invoice View Settings" dialog state, persisted
// to localStorage by the React side (key below; per-browser, no entity write):
//   show_payments    — include the Payments Applied block (default on)
//   show_ship_to     — print the WO ship-to block when resolvable (default on)
//   show_internal    — append a staff-only cost/margin column (default OFF;
//                      internal numbers never print for customers unless a
//                      staff user explicitly opts in)
//   itemize          — one line per line_item vs a single "Order total" row
//                      (default on)

const num = (v, fallback = 0) => (Number.isFinite(Number(v)) ? Number(v) : fallback);
const clean = (v) => String(v ?? "").trim();
const asList = (v) => (Array.isArray(v) ? v.filter(Boolean) : []);
const firstText = (...vals) => {
  for (const v of vals) {
    const s = clean(v);
    if (s) return s;
  }
  return "";
};
const money = (v) => `$${num(v).toFixed(2)}`;
const escapeHtml = (v) => String(v ?? "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const textLines = (v) => {
  if (v == null) return [];
  const items = Array.isArray(v) ? v : [v];
  return items
    .flatMap((item) => String(item?.line ?? item?.text ?? item ?? "").split(/\r?\n/))
    .map(clean).filter(Boolean);
};
const fmtDate = (v) => {
  const s = clean(v);
  if (!s) return "";
  const d = s.length === 10 ? new Date(`${s}T12:00:00`) : new Date(s);
  return Number.isNaN(d.getTime())
    ? s
    : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

export const INVOICE_VIEW_SETTINGS_KEY = "ccs.invoiceViewSettings";

export const DEFAULT_INVOICE_VIEW_SETTINGS = {
  show_payments: true,
  show_ship_to: true,
  show_internal: false,
  itemize: true,
};

export const INVOICE_VIEW_SETTING_OPTIONS = [
  { key: "itemize", label: "Itemize line items", hint: "Print each line item instead of one order total." },
  { key: "show_payments", label: "Show payments applied", hint: "Include the payments + balance block." },
  { key: "show_ship_to", label: "Show ship-to", hint: "Print the work order's ship-to address block." },
  { key: "show_internal", label: "Show internal cost/margin", hint: "Staff copy only — never for customers." },
];

// Normalize any stored/passed blob into a complete settings object —
// missing keys fall back to defaults; unknown keys are dropped.
export function normalizeInvoiceViewSettings(value) {
  const src = value && typeof value === "object" ? value : {};
  const out = { ...DEFAULT_INVOICE_VIEW_SETTINGS };
  for (const key of Object.keys(DEFAULT_INVOICE_VIEW_SETTINGS)) {
    if (typeof src[key] === "boolean") out[key] = src[key];
  }
  return out;
}

// --- model ---------------------------------------------------------------------

// buildInvoicePrintModel(invoice, { workOrder, company, settings, payments })
// → everything renderInvoicePrintHtml needs, no React.
export function buildInvoicePrintModel(invoice, {
  workOrder = null,
  company = {},
  settings = null,
  payments = null,
} = {}) {
  const inv = invoice && typeof invoice === "object" ? invoice : {};
  const wo = workOrder && typeof workOrder === "object" ? workOrder : {};
  const view = normalizeInvoiceViewSettings(settings);

  const lineItems = asList(inv.line_items).map((li, i) => ({
    line: i + 1,
    description: firstText(li.description, li.name, li.label, "Item"),
    quantity: num(li.quantity, li.qty != null ? num(li.qty, 1) : 1),
    unit_price: num(li.unit_price ?? li.price),
    total: num(li.total ?? li.ext_total ?? num(li.unit_price ?? li.price) * num(li.quantity, 1)),
    // staff-only internal fields (settings.show_internal)
    cost: li.cost != null || li.internal_cost != null ? num(li.cost ?? li.internal_cost) : null,
  }));

  const shipTo = view.show_ship_to
    ? {
        name: firstText(wo.ship_to_name, wo.client_name, inv.customer_display_name, inv.customer_name),
        attention: firstText(wo.contact_name, wo.additional_contact),
        lines: [
          ...textLines(wo.ship_to_address_lines ?? wo.ship_to_address ?? wo.shipping_address ?? wo.delivery_address),
          ...(textLines(wo.ship_to_address_lines ?? wo.ship_to_address).length ? [] : textLines(wo.install_location)),
        ],
      }
    : null;

  const payRows = (payments ?? inv.payments ?? []).filter(Boolean).map((p, i) => ({
    key: clean(p.id) || `pmt-${i}`,
    date: fmtDate(p.payment_date ?? p.paid_at ?? p.created_date),
    method: firstText(p.method, p.payment_method, "payment"),
    reference: firstText(p.reference, p.check_number, p.transaction_id),
    amount: num(p.amount),
  }));

  return {
    document_title: view.show_internal ? "Invoice — Staff Copy" : "Invoice",
    invoice_number: firstText(inv.invoice_number, inv.number, inv.id),
    status: clean(inv.status),
    issue_date: fmtDate(inv.issue_date ?? inv.created_date),
    due_date: fmtDate(inv.due_date),
    customer_name: firstText(inv.customer_display_name, inv.customer_name, wo.client_name),
    bill_to_lines: [
      ...textLines(inv.bill_to_address ?? inv.billing_address ?? wo.billing_address),
      ...textLines(inv.bill_to_address_line_2 ?? wo.billing_address_line_2),
    ],
    terms: firstText(inv.terms, wo.payment_terms),
    po_number: firstText(inv.po_number, wo.po_number),
    work_order_id: clean(wo.id ?? inv.work_order_id),
    company: {
      name: firstText(company.name, company.company_name, "CCS Signage"),
      address_lines: textLines(company.address_lines ?? company.address),
      phone: clean(company.phone),
      email: clean(company.email),
      logo_url: firstText(company.logo_url, company.logo),
    },
    ship_to: shipTo && (shipTo.name || shipTo.lines.length) ? shipTo : null,
    // itemize=false always collapses to one order-total row, whether or not
    // the invoice carries line items (CoreBridge "summary view").
    line_items: view.itemize
      ? lineItems
      : [{ line: 1, description: "Order total", quantity: 1, unit_price: num(inv.subtotal ?? inv.total), total: num(inv.subtotal ?? inv.total), cost: null }],
    itemized: view.itemize,
    subtotal: num(inv.subtotal, lineItems.reduce((s, li) => s + li.total, 0)),
    discount_amount: num(inv.discount_amount),
    shipping_amount: num(inv.shipping_amount ?? inv.freight_amount),
    postage_amount: num(inv.postage_amount),
    tax_rate: num(inv.tax_rate),
    tax_amount: num(inv.tax_amount),
    deposit_applied: num(inv.deposit_applied ?? inv.deposit_amount),
    total: num(inv.total),
    amount_paid: num(inv.amount_paid),
    balance_due: num(inv.balance_due, num(inv.total) - num(inv.amount_paid)),
    payments: view.show_payments ? payRows : [],
    notes: clean(inv.notes ?? inv.customer_notes),
    printed_at: new Date().toISOString(),
    show_internal: view.show_internal,
  };
}

// --- renderer --------------------------------------------------------------------

const moneyCell = (v, extra = "") =>
  `<td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;font-size:12px;color:#0f172a;text-align:right;${extra}">${escapeHtml(money(v))}</td>`;

const totalRow = (label, value, { strong = false, negative = false } = {}) =>
  `<tr>` +
  `<td colspan="4" style="padding:4px 8px;font-size:${strong ? "14px" : "12px"};` +
  `font-weight:${strong ? "800" : "500"};color:#${strong ? "0f172a" : "475569"};text-align:right;">${escapeHtml(label)}</td>` +
  `<td style="padding:4px 8px;font-size:${strong ? "14px" : "12px"};font-weight:${strong ? "800" : "600"};` +
  `color:#${negative ? "b91c1c" : "0f172a"};text-align:right;width:110px;">${escapeHtml(money(value))}</td>` +
  `</tr>`;

export function renderInvoicePrintHtml(model) {
  const m = model && model.company ? model : buildInvoicePrintModel(model);
  const internal = m.show_internal === true;

  const companyHtml = `
    <div>
      ${m.company.logo_url ? `<img src="${escapeHtml(m.company.logo_url)}" alt="" style="max-height:44px;max-width:180px;object-fit:contain;display:block;margin-bottom:4px;" />` : ""}
      <div style="font-size:15px;font-weight:800;color:#0f172a;">${escapeHtml(m.company.name)}</div>
      <div style="font-size:11px;color:#475569;line-height:1.45;">
        ${(m.company.address_lines || []).map((l) => `<div>${escapeHtml(l)}</div>`).join("")}
        ${m.company.phone ? `<div>${escapeHtml(m.company.phone)}</div>` : ""}
        ${m.company.email ? `<div>${escapeHtml(m.company.email)}</div>` : ""}
      </div>
    </div>`;

  const titleHtml = `
    <div style="text-align:right;">
      <div style="font-size:22px;font-weight:800;letter-spacing:0.06em;color:#0f172a;text-transform:uppercase;">${escapeHtml(m.document_title)}</div>
      <div style="font-size:12px;color:#475569;margin-top:2px;">Invoice <b style="color:#0f172a;">${escapeHtml(m.invoice_number)}</b></div>
      <div style="font-size:10px;color:#94a3b8;margin-top:2px;">Issued ${escapeHtml(m.issue_date || "—")}${m.due_date ? ` · Due ${escapeHtml(m.due_date)}` : ""}</div>
      ${m.status ? `<div style="display:inline-block;margin-top:4px;background:#f1f5f9;border:1px solid #cbd5e1;color:#334155;font-size:9px;font-weight:800;letter-spacing:0.08em;padding:2px 8px;border-radius:3px;text-transform:uppercase;">${escapeHtml(m.status)}</div>` : ""}
    </div>`;

  const blockLabel = (t) => `<div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#64748b;">${escapeHtml(t)}</div>`;
  const addressBlock = (t, name, lines, extra = "") => `
    <div style="flex:1;border:1px solid #cbd5e1;border-radius:4px;padding:10px 12px;">
      ${blockLabel(t)}
      <div style="font-size:13px;font-weight:700;color:#0f172a;margin-top:2px;">${escapeHtml(name || "—")}</div>
      <div style="font-size:12px;color:#0f172a;line-height:1.5;margin-top:2px;">
        ${lines.length ? lines.map((l) => `<div>${escapeHtml(l)}</div>`).join("") : `<div style="color:#94a3b8;">&mdash;</div>`}
        ${extra}
      </div>
    </div>`;

  const metaBits = [
    m.terms ? `Terms: ${m.terms}` : "",
    m.po_number ? `PO: ${m.po_number}` : "",
    m.work_order_id ? `WO-${String(m.work_order_id).toUpperCase()}` : "",
  ].filter(Boolean).join(" &middot; ");

  const itemsHead = `
    <tr style="background:#f1f5f9;">
      <th style="padding:6px 8px;border-bottom:1.5px solid #334155;font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:0.08em;color:#475569;text-align:right;width:34px;">#</th>
      <th style="padding:6px 8px;border-bottom:1.5px solid #334155;font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:0.08em;color:#475569;text-align:left;">Description</th>
      <th style="padding:6px 8px;border-bottom:1.5px solid #334155;font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:0.08em;color:#475569;text-align:center;width:50px;">Qty</th>
      <th style="padding:6px 8px;border-bottom:1.5px solid #334155;font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:0.08em;color:#475569;text-align:right;width:90px;">Unit</th>
      <th style="padding:6px 8px;border-bottom:1.5px solid #334155;font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:0.08em;color:#475569;text-align:right;width:100px;">Amount</th>
      ${internal ? `<th style="padding:6px 8px;border-bottom:1.5px solid #334155;font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:0.08em;color:#475569;text-align:right;width:80px;">Cost</th>` : ""}
    </tr>`;

  const itemsBody = m.line_items.length
    ? m.line_items.map((li, i) =>
        `<tr style="background:${i % 2 ? "#f8fafc" : "#fff"};">` +
        `<td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;font-size:12px;color:#64748b;text-align:right;">${i + 1}</td>` +
        `<td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;font-size:12px;color:#0f172a;">${escapeHtml(li.description)}</td>` +
        `<td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;font-size:12px;color:#0f172a;text-align:center;">${escapeHtml(li.quantity)}</td>` +
        moneyCell(li.unit_price) + moneyCell(li.total) +
        (internal ? moneyCell(li.cost ?? 0, "color:#64748b;") : "") +
        `</tr>`,
      ).join("")
    : `<tr><td colspan="${internal ? 6 : 5}" style="padding:14px;text-align:center;font-size:12px;color:#94a3b8;">No line items on this invoice.</td></tr>`;

  const totalsTable = `
    <table style="width:100%;border-collapse:collapse;margin-top:8px;">
      ${totalRow("Subtotal", m.subtotal)}
      ${m.discount_amount ? totalRow("Discount", -m.discount_amount) : ""}
      ${m.shipping_amount ? totalRow("Shipping", m.shipping_amount) : ""}
      ${m.postage_amount ? totalRow("Postage", m.postage_amount) : ""}
      ${m.tax_amount ? totalRow(`Tax${m.tax_rate ? ` (${m.tax_rate}%)` : ""}`, m.tax_amount) : ""}
      ${m.deposit_applied ? totalRow("Deposit Applied", -m.deposit_applied) : ""}
      ${totalRow("Total", m.total, { strong: true })}
      ${totalRow("Total Paid", m.amount_paid)}
      ${totalRow("Balance Due", m.balance_due, { strong: true, negative: m.balance_due > 0.004 })}
    </table>`;

  const paymentsHtml = m.payments.length
    ? `<div style="margin-top:12px;">${blockLabel("Payments Applied")}
       <table style="width:100%;border-collapse:collapse;margin-top:4px;">
         ${m.payments.map((p) =>
           `<tr><td style="padding:4px 8px;font-size:12px;color:#0f172a;border-bottom:1px solid #e2e8f0;width:110px;">${escapeHtml(p.date)}</td>` +
           `<td style="padding:4px 8px;font-size:12px;color:#0f172a;border-bottom:1px solid #e2e8f0;text-transform:capitalize;">${escapeHtml(p.method)}</td>` +
           `<td style="padding:4px 8px;font-size:12px;color:#64748b;border-bottom:1px solid #e2e8f0;">${escapeHtml(p.reference)}</td>` +
           `<td style="padding:4px 8px;font-size:12px;color:#0f172a;border-bottom:1px solid #e2e8f0;text-align:right;">${escapeHtml(money(p.amount))}</td></tr>`,
         ).join("")}
       </table></div>`
    : "";

  const notesHtml = m.notes
    ? `<div style="margin-top:12px;">${blockLabel("Notes")}<div style="font-size:12px;color:#0f172a;white-space:pre-line;margin-top:2px;">${escapeHtml(m.notes)}</div></div>`
    : "";

  const internalBanner = internal
    ? `<div style="background:#fef3c7;border:1px solid #f59e0b;border-radius:4px;padding:6px 10px;font-size:10px;font-weight:700;color:#92400e;margin-bottom:10px;">STAFF COPY — includes internal cost figures. Do not send to the customer.</div>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Invoice ${escapeHtml(m.invoice_number)}</title>
<style>
  @page { margin: 0.55in; }
  * { box-sizing: border-box; }
  body { margin: 0; }
</style>
</head>
<body style="font-family:Arial,Helvetica,sans-serif;background:#fff;color:#0f172a;">
<div style="max-width:8in;margin:0 auto;padding:0.25in;">
  ${internalBanner}
  <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;border-bottom:2.5px solid #0f172a;padding-bottom:10px;">
    ${companyHtml}
    ${titleHtml}
  </div>
  <div style="display:flex;gap:12px;margin-top:10px;">
    ${addressBlock("Bill To", m.customer_name, m.bill_to_lines)}
    ${m.ship_to ? addressBlock("Ship To", m.ship_to.name, m.ship_to.lines, m.ship_to.attention ? `<div>Attn: ${escapeHtml(m.ship_to.attention)}</div>` : "") : ""}
  </div>
  ${metaBits ? `<div style="font-size:10px;color:#64748b;margin-top:8px;">${metaBits}</div>` : ""}
  <table style="width:100%;border-collapse:collapse;margin-top:10px;border:1.5px solid #334155;">
    <thead>${itemsHead}</thead>
    <tbody>${itemsBody}</tbody>
  </table>
  <div style="display:flex;justify-content:flex-end;">
    <div style="width:340px;">${totalsTable}</div>
  </div>
  ${paymentsHtml}
  ${notesHtml}
  <div style="margin-top:20px;padding-top:6px;border-top:1px solid #cbd5e1;font-size:9px;color:#94a3b8;display:flex;justify-content:space-between;">
    <span>Invoice ${escapeHtml(m.invoice_number)}${m.work_order_id ? ` · WO-${escapeHtml(String(m.work_order_id).toUpperCase())}` : ""}</span>
    <span>Printed ${escapeHtml(fmtDate(m.printed_at.slice(0, 10)))}</span>
  </div>
</div>
</body>
</html>`;
}

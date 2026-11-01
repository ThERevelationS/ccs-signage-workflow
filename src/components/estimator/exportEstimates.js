// Estimate / change-order / job-costing export helpers.
//
// Pure functions — no entity or SDK access — so they can be unit-tested under
// Node (see scripts/test-estimate-import-export.mjs). The button components in
// src/components/importer/ImportExportButtons.jsx wire them to downloads and
// entity loads.
//
// Covers backlog §19: #451 (single-estimate JSON), #452 (bulk estimates CSV),
// #461 (standalone quote HTML), #465 (change orders CSV), #468 (backup file),
// #474 (job-costing breakdown CSV).

import { csvCell, downloadCsv } from "@/components/shared/exportCsv";

const safeFilePart = (value, fallback) => {
  const cleaned = String(value || "")
    .trim()
    .replace(/[^a-z0-9._-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return cleaned || fallback;
};

const todayStamp = () => new Date().toISOString().slice(0, 10);

export function downloadTextFile(filename, text, mimeType = "text/plain") {
  const url = URL.createObjectURL(new Blob([text], { type: mimeType }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// #451 — single-estimate JSON export (re-importable)
// ---------------------------------------------------------------------------
//
// The exported document keeps the raw stored estimate (including line_items,
// pricing waterfall inputs, quote display settings) under `estimate`, wrapped
// in a format envelope so the importer can distinguish it from foreign JSON.
// Identity/lifecycle fields are NOT stripped here — sanitizeEstimateForImport
// removes them on the way back in, so a re-import always lands as a fresh
// draft with a new estimate number.

export const ESTIMATE_EXPORT_FORMAT = "aio-estimate-v1";
export const ESTIMATE_BACKUP_FORMAT = "aio-estimate-backup-v1";

export function estimateExportFilename(estimate = {}) {
  const numberPart = safeFilePart(estimate.estimate_number, "estimate");
  const projectPart = safeFilePart(estimate.project_name, "export");
  return `${numberPart}-${projectPart}.json`;
}

export function buildEstimateExportDocument(estimate = {}) {
  return {
    format: ESTIMATE_EXPORT_FORMAT,
    exported_at: new Date().toISOString(),
    estimate,
  };
}

export function buildEstimatesBackupDocument(estimates = []) {
  return {
    format: ESTIMATE_BACKUP_FORMAT,
    exported_at: new Date().toISOString(),
    count: estimates.length,
    estimates,
  };
}

export function exportEstimateJson(estimate) {
  if (!estimate?.id && !estimate?.project_name && !estimate?.estimate_number) {
    throw new Error("There is no loaded estimate to export.");
  }
  downloadTextFile(
    estimateExportFilename(estimate),
    JSON.stringify(buildEstimateExportDocument(estimate), null, 2),
    "application/json",
  );
}

export function exportEstimatesBackupJson(estimates = []) {
  if (!estimates.length) throw new Error("There are no estimates to back up.");
  downloadTextFile(
    `estimates-backup-${todayStamp()}.json`,
    JSON.stringify(buildEstimatesBackupDocument(estimates), null, 2),
    "application/json",
  );
}

// ---------------------------------------------------------------------------
// #452 — bulk estimates CSV (flat columns; nested data is JSON-encoded)
// ---------------------------------------------------------------------------

export const ESTIMATES_CSV_COLUMNS = [
  ["id", "Estimate ID"],
  ["estimate_number", "Estimate #"],
  ["project_name", "Project"],
  ["client_name", "Customer"],
  ["customer_id", "Customer ID"],
  ["status", "Status"],
  ["sales_stage", "Sales Stage"],
  ["contact_email", "Contact Email"],
  ["office_phone", "Phone"],
  ["site_address", "Site Address"],
  ["quote_total", "Quote Total"],
  ["subtotal", "Subtotal"],
  ["discount_percent", "Discount %"],
  ["tax_percent", "Tax %"],
  ["deposit_percent", "Deposit %"],
  ["pricing_tier", "Pricing Tier"],
  ["quote_version", "Quote Version"],
  ["quote_issue_date", "Quote Issued"],
  ["quote_expiration_date", "Quote Expires"],
  ["work_order_id", "Work Order ID"],
  ["created_date", "Created"],
  ["updated_date", "Updated"],
];

const csvValue = (value) => {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return value;
};

export function exportEstimatesCsvRows(estimates = []) {
  const headers = ESTIMATES_CSV_COLUMNS.map(([, label]) => label);
  const rows = estimates.map((estimate) =>
    ESTIMATES_CSV_COLUMNS.map(([field]) => csvValue(estimate?.[field]))
  );
  return { headers, rows };
}

export function exportEstimatesCsv(estimates = []) {
  if (!estimates.length) throw new Error("There are no estimates to export.");
  const { headers, rows } = exportEstimatesCsvRows(estimates);
  downloadCsv(`estimates-${todayStamp()}.csv`, headers, rows);
}

// ---------------------------------------------------------------------------
// #465 — change orders CSV
// ---------------------------------------------------------------------------

export const CHANGE_ORDERS_CSV_COLUMNS = [
  ["id", "Change Order ID"],
  ["change_order_number", "CO #"],
  ["title", "Title"],
  ["customer_display_name", "Customer"],
  ["work_order_id", "Work Order ID"],
  ["work_order_title", "Work Order"],
  ["estimate_id", "Estimate ID"],
  ["status", "Status"],
  ["reason", "Reason"],
  ["description", "Description"],
  ["amount", "Amount"],
  ["cost_impact", "Cost Impact"],
  ["schedule_impact_days", "Schedule Impact (days)"],
  ["approved_by", "Approved By"],
  ["approved_at", "Approved At"],
  ["created_date", "Created"],
  ["updated_date", "Updated"],
];

export function exportChangeOrdersCsvRows(changeOrders = []) {
  const headers = CHANGE_ORDERS_CSV_COLUMNS.map(([, label]) => label);
  const rows = changeOrders.map((co) =>
    CHANGE_ORDERS_CSV_COLUMNS.map(([field]) => csvValue(co?.[field]))
  );
  return { headers, rows };
}

export function exportChangeOrdersCsv(changeOrders = []) {
  if (!changeOrders.length) throw new Error("There are no change orders to export.");
  const { headers, rows } = exportChangeOrdersCsvRows(changeOrders);
  downloadCsv(`change-orders-${todayStamp()}.csv`, headers, rows);
}

// ---------------------------------------------------------------------------
// #474 — estimate job-costing breakdown CSV
// ---------------------------------------------------------------------------
//
// One row per Builder Part (internal cost detail), subtotal rows per section
// (Product line item), then estimate-level waterfall rows. `products` are the
// estimate's BuilderProduct rows; `parts`/`groups` are that product's Builder
// Part / Part Group rows — callers pass the already-loaded collections.

const num = (value, fallback = 0) => (Number.isFinite(Number(value)) ? Number(value) : fallback);

export function exportEstimateCostingCsvRows({ estimate = {}, products = [], parts = [], groups = [] } = {}) {
  const headers = [
    "Section",
    "Part / Item",
    "Part Group",
    "Type",
    "Qty",
    "Unit",
    "Unit Cost",
    "Extended Cost",
    "Customer Unit Price",
    "Customer Extended",
    "Margin $",
    "Margin %",
    "Source",
  ];
  const rows = [];
  const productsById = new Map(products.map((p) => [p.id, p]));
  const groupsById = new Map(groups.map((g) => [g.id, g]));
  const lines = Array.isArray(estimate.line_items) ? estimate.line_items : [];
  const partsByProduct = new Map();
  for (const part of parts) {
    const key = part?.builder_product_id || "";
    if (!partsByProduct.has(key)) partsByProduct.set(key, []);
    partsByProduct.get(key).push(part);
  }

  lines.forEach((line, index) => {
    const sectionName = line.client_product_name || line.project_name || line.product_category || `Section ${index + 1}`;
    const product = productsById.get(line.builder_product_id) || null;
    const quantity = Math.max(0, num(line.customer_quantity ?? line.quantity, 1));
    const sectionCustomerUnit = Number.isFinite(Number(line.customer_price_snapshot))
      ? Number(line.customer_price_snapshot)
      : num(line.total_snapshot);
    const sectionCustomerExt = sectionCustomerUnit * (quantity || 1);
    const sectionParts = (partsByProduct.get(line.builder_product_id) || [])
      .filter((part) => part.is_active !== false)
      .sort((a, b) => num(a.sort_order) - num(b.sort_order));

    let sectionCost = 0;
    for (const part of sectionParts) {
      const extCost = num(part.frozen_extended_cost, num(part.current_extended_cost));
      const extCustomer = num(part.frozen_extended_customer_price, num(part.current_extended_customer_price));
      sectionCost += extCost;
      const group = groupsById.get(part.part_group_id);
      rows.push([
        sectionName,
        part.client_label || part.part_name || "Part",
        group?.client_label || group?.group_name || "",
        part.part_type || part.part_subtype || "",
        num(part.quantity, 1),
        part.unit || part.pricing_mode || "",
        num(part.frozen_unit_cost, num(part.current_unit_cost)),
        extCost,
        num(part.frozen_unit_customer_price, num(part.current_unit_customer_price)),
        extCustomer,
        extCustomer - extCost,
        extCost > 0 ? (((extCustomer - extCost) / extCost) * 100).toFixed(1) : "",
        part.inventory_item_name || part.source_module_key || "manual",
      ]);
    }
    const internalCost = sectionParts.length ? sectionCost : num(line.total_snapshot) * (quantity || 1);
    rows.push([
      sectionName,
      `${sectionName} — section subtotal`,
      "",
      "section_subtotal",
      quantity || 1,
      "job",
      "",
      internalCost,
      sectionCustomerUnit,
      sectionCustomerExt,
      sectionCustomerExt - internalCost,
      internalCost > 0 ? (((sectionCustomerExt - internalCost) / internalCost) * 100).toFixed(1) : "",
      product ? "builder" : "manual",
    ]);
  });

  const totalCost = rows
    .filter((r) => r[3] === "section_subtotal")
    .reduce((sum, r) => sum + num(r[7]), 0);
  const totalCustomer = rows
    .filter((r) => r[3] === "section_subtotal")
    .reduce((sum, r) => sum + num(r[9]), 0);
  rows.push([
    "",
    "Estimate total",
    "",
    "estimate_total",
    "",
    "",
    "",
    totalCost,
    "",
    num(estimate.quote_total, totalCustomer),
    num(estimate.quote_total, totalCustomer) - totalCost,
    totalCost > 0 ? (((num(estimate.quote_total, totalCustomer) - totalCost) / totalCost) * 100).toFixed(1) : "",
    "",
  ]);
  return { headers, rows };
}

export function exportEstimateCostingCsv({ estimate, products = [], parts = [], groups = [] } = {}) {
  if (!estimate?.id) throw new Error("There is no loaded estimate to export.");
  const { headers, rows } = exportEstimateCostingCsvRows({ estimate, products, parts, groups });
  downloadCsv(
    `${safeFilePart(estimate.estimate_number, "estimate")}-job-costing-${todayStamp()}.csv`,
    headers,
    rows,
  );
}

// ---------------------------------------------------------------------------
// #461 — standalone quote HTML (self-contained, shareable)
// ---------------------------------------------------------------------------
//
// Builds a single .html file from the same data the live customer-quote print
// article renders. All styling is inline so the file stands alone when emailed
// or opened outside the app — internal cost fields are never included.

const escHtml = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const moneyFmt = (value, round = false) =>
  Number(value || 0).toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: round ? 0 : 2, maximumFractionDigits: round ? 0 : 2 });
const textLines = (value) => String(value || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
const defaultBool = (estimate, key, fallback = true) =>
  estimate?.[key] === undefined || estimate?.[key] === null ? fallback : estimate[key] !== false;

export function buildStandaloneQuoteHtml({ estimate = {}, pricing = {}, quoteRows = [] } = {}) {
  const round = estimate.round_prices_to_dollar === true;
  const show = (key, fallback = true) => defaultBool(estimate, key, fallback);
  const rows = (quoteRows || [])
    .map((row) => `<tr>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;vertical-align:top">
        <div style="font-weight:600">${escHtml(row.name)}</div>
        ${row.description && show("show_section_descriptions") ? `<div style="font-size:11px;color:#4b5563;margin-top:2px;white-space:pre-line">${escHtml(row.description)}</div>` : ""}
      </td>
      ${show("show_category_column") ? `<td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:11px;color:#4b5563;vertical-align:top">${escHtml(row.category || "")}</td>` : ""}
      ${show("show_quantity_column", false) ? `<td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:right;vertical-align:top">${escHtml(row.quantity ?? "")}</td>` : ""}
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:right;vertical-align:top">${moneyFmt(row.amount, round)}</td>
    </tr>`)
    .join("");

  const totalRow = (label, value) => `<div style="display:flex;justify-content:space-between;gap:16px;padding:3px 0;font-size:11px"><span style="color:#4b5563">${escHtml(label)}</span><span>${moneyFmt(value, round)}</span></div>`;
  const block = (title, text) => text ? `<div style="margin-top:24px"><div style="font-size:10px;font-weight:700;letter-spacing:.08em;color:#6b7280;text-transform:uppercase">${escHtml(title)}</div><div style="margin-top:4px;font-size:11px;color:#374151;white-space:pre-line">${escHtml(text)}</div></div>` : "";
  const scopeList = (title, items) => items.length
    ? `<div style="flex:1"><div style="font-size:10px;font-weight:700;letter-spacing:.08em;color:#6b7280;text-transform:uppercase">${escHtml(title)}</div><ul style="margin:6px 0 0 16px;padding:0;font-size:11px;color:#374151">${items.map((i) => `<li style="margin:2px 0">${escHtml(i)}</li>`).join("")}</ul></div>`
    : "";

  const inclusions = textLines(estimate.scope_inclusions);
  const exclusions = textLines(estimate.scope_exclusions);
  const expirationLabel = estimate.quote_expiration_date || "";

  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${escHtml(estimate.quote_title || "Project Estimate")}${estimate.estimate_number ? ` — ${escHtml(estimate.estimate_number)}` : ""}</title>
<style>@media print {.no-print{display:none} body{margin:0}}</style></head>
<body style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#111827;margin:32px">
<div class="no-print" style="margin-bottom:16px"><button type="button" onclick="window.print()" style="padding:8px 14px;border:1px solid #cbd5e1;border-radius:8px;background:#fff;cursor:pointer;font-size:12px">Print / Save PDF</button></div>
<article style="max-width:850px;margin:0 auto;padding:24px 0">
  <header style="border-bottom:2px solid #111827;padding-bottom:20px;display:flex;justify-content:space-between;gap:24px">
    <div>
      ${show("show_company_block") ? `
        ${show("show_logo", false) && estimate.company_logo_url ? `<img src="${escHtml(estimate.company_logo_url)}" alt="Company logo" style="max-height:48px;max-width:190px;margin-bottom:8px">` : ""}
        <div style="font-size:21px;font-weight:800;letter-spacing:-.01em">${escHtml(estimate.company_name || "Company Name")}</div>
        ${estimate.company_address ? `<div style="margin-top:4px;font-size:10px;color:#4b5563;white-space:pre-line">${escHtml(estimate.company_address)}</div>` : ""}
        <div style="margin-top:4px;font-size:10px;color:#4b5563">${escHtml([estimate.company_phone, estimate.company_email, estimate.company_website].filter(Boolean).join(" · "))}</div>
        ${estimate.company_license ? `<div style="margin-top:4px;font-size:9px;color:#6b7280">${escHtml(estimate.company_license)}</div>` : ""}
      ` : ""}
    </div>
    <div style="text-align:right;flex-shrink:0">
      <div style="font-size:22px;font-weight:700">${escHtml(estimate.quote_title || "Project Estimate")}</div>
      ${show("show_estimate_number") && estimate.estimate_number ? `<div style="margin-top:4px;font-size:10px;color:#4b5563">Estimate #${escHtml(estimate.estimate_number)}</div>` : ""}
      ${show("show_po_number") && estimate.po_number ? `<div style="font-size:10px;color:#4b5563">PO #${escHtml(estimate.po_number)}</div>` : ""}
      ${show("show_dates") ? `${estimate.quote_issue_date ? `<div style="font-size:10px;color:#4b5563">Issued ${escHtml(estimate.quote_issue_date)}</div>` : ""}${expirationLabel ? `<div style="font-size:9px;color:#6b7280">Valid through ${escHtml(expirationLabel)}</div>` : ""}` : ""}
      ${Number(estimate.quote_version) > 0 ? `<div style="font-size:9px;color:#6b7280">Quote Version ${Number(estimate.quote_version)}</div>` : ""}
    </div>
  </header>

  <div style="display:flex;gap:24px;padding:20px 0;border-bottom:1px solid #e5e7eb">
    <div style="flex:1">
      <div style="font-size:8px;font-weight:700;letter-spacing:.12em;color:#9ca3af">PREPARED FOR</div>
      <div style="margin-top:4px;font-size:13px;font-weight:700">${escHtml(estimate.client_name || "Customer")}</div>
      ${show("show_contact_block") ? `<div style="margin-top:4px;font-size:10px;color:#4b5563">${escHtml([estimate.order_contact || estimate.contact_name, estimate.contact_email, estimate.office_phone || estimate.contact_phone].filter(Boolean).join(" · "))}</div>` : ""}
    </div>
    <div style="flex:1">
      <div style="font-size:8px;font-weight:700;letter-spacing:.12em;color:#9ca3af">PROJECT</div>
      <div style="margin-top:4px;font-size:13px;font-weight:700">${escHtml(estimate.project_name || "Project")}</div>
      ${show("show_site_address") && estimate.site_address ? `<div style="margin-top:4px;font-size:10px;color:#4b5563">${escHtml(estimate.site_address)}</div>` : ""}
    </div>
  </div>

  ${estimate.quote_intro_text ? `<p style="padding:16px 0;font-size:11px;line-height:1.6;color:#374151;white-space:pre-line">${escHtml(estimate.quote_intro_text)}</p>` : ""}

  <table style="width:100%;border-collapse:collapse;margin-top:16px;border:1px solid #d1d5db">
    <thead><tr style="background:#f3f4f6;font-size:9px;color:#6b7280;letter-spacing:.06em">
      <th style="padding:8px 12px;text-align:left">PRODUCT / SCOPE</th>
      ${show("show_category_column") ? `<th style="padding:8px 12px;text-align:left">CATEGORY</th>` : ""}
      ${show("show_quantity_column", false) ? `<th style="padding:8px 12px;text-align:right">QTY</th>` : ""}
      <th style="padding:8px 12px;text-align:right">PRICE</th>
    </tr></thead>
    <tbody>${rows || `<tr><td colspan="4" style="padding:12px;color:#9ca3af">No priced sections.</td></tr>`}</tbody>
  </table>

  <div style="margin-left:auto;margin-top:16px;max-width:330px">
    ${show("show_subtotal_line") ? totalRow("Subtotal", pricing.subtotal) : ""}
    ${show("show_discount_line") && Math.abs(Number(pricing.discount || 0)) > 0.005 ? totalRow(`Discount (${Number(estimate.discount_percent || 0)}%)`, -Number(pricing.discount || 0)) : ""}
    ${Math.abs(Number(pricing.contingency || 0)) > 0.005 ? totalRow(`Contingency (${Number(estimate.contingency_percent || 0)}%)`, pricing.contingency) : ""}
    ${show("show_fees_line") && Math.abs(Number(pricing.fees || 0)) > 0.005 ? totalRow("Shipping / permits / fees", pricing.fees) : ""}
    ${show("show_tax_line") && Math.abs(Number(pricing.tax || 0)) > 0.005 ? totalRow(`Tax (${Number(estimate.tax_percent || 0)}%)`, pricing.tax) : ""}
    <div style="display:flex;justify-content:space-between;gap:16px;border-top:2px solid #111827;padding-top:8px;margin-top:6px;font-size:14px;font-weight:800"><span>Total</span><span>${moneyFmt(pricing.quoteTotal, round)}</span></div>
    ${show("show_deposit_lines") ? `${totalRow(`Deposit (${Number(estimate.deposit_percent || 0)}%)`, pricing.deposit)}${totalRow("Balance", pricing.balance)}` : ""}
  </div>

  ${show("show_scope_lists") && (inclusions.length || exclusions.length) ? `<div style="display:flex;gap:24px;margin-top:28px;border-top:1px solid #e5e7eb;padding-top:20px">${scopeList("Included", inclusions)}${scopeList("Excluded", exclusions)}</div>` : ""}

  ${show("show_lead_time_block") ? block("Lead Time", estimate.lead_time_text) : ""}
  ${show("show_warranty_block") ? block("Warranty", estimate.warranty_text) : ""}
  ${show("show_notes_on_quote", false) ? block("Notes", estimate.notes) : ""}
  ${show("show_terms_block") ? block("Terms & Conditions", [estimate.payment_terms, estimate.quote_terms_conditions].filter(Boolean).join("\n\n")) : ""}

  ${show("show_signature_block") ? `<div style="display:flex;gap:32px;margin-top:36px;padding-top:24px;border-top:1px solid #e5e7eb;font-size:9px;color:#6b7280"><div style="flex:1;border-top:1px solid #6b7280;padding-top:4px">Customer acceptance / signature</div><div style="flex:1;border-top:1px solid #6b7280;padding-top:4px">Date</div></div>` : ""}

  <footer style="margin-top:32px;padding-top:16px;border-top:1px solid #e5e7eb;font-size:9px;color:#6b7280;text-align:center">
    ${estimate.quote_footer_text ? `<div style="margin-bottom:8px;white-space:pre-line">${escHtml(estimate.quote_footer_text)}</div>` : ""}
    ${show("show_validity_footer") ? `<div>${expirationLabel ? `This estimate is valid through ${escHtml(expirationLabel)}` : `This estimate is valid for ${Number(estimate.quote_valid_days ?? 30)} days`} unless otherwise stated.</div>` : ""}
  </footer>
</article>
</body></html>`;
}

export function exportStandaloneQuoteHtml({ estimate, pricing = {}, quoteRows = [] } = {}) {
  if (!estimate?.id && !estimate?.project_name) throw new Error("There is no loaded estimate to export.");
  const html = buildStandaloneQuoteHtml({ estimate, pricing, quoteRows });
  downloadTextFile(
    `${safeFilePart(estimate.estimate_number, "estimate")}-quote.html`,
    html,
    "text/html",
  );
}

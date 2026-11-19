// Pure work-order print model — normalizes a WorkOrder record (+ optional
// company identity) into the single `model` shape every template in
// src/components/jobs/printTemplates/templates/ consumes.
//
// Kept React/base44-free so the model is unit-testable under Node and a page,
// dialog, or deployed function can build the same document without extra
// dependencies. Follows the same pure-model convention as
// src/components/jobs/packingSlipTemplate.js (D-08) — WorkOrder field names
// match base44/entities/WorkOrder.jsonc and src/pages/WorkOrderTraveler.jsx.
//
// Monetary rule: ALL templates print customer-facing prices (quoted_unit_price
// / quoted_total / totals). The `streamlined` variant additionally hides
// per-product INTERNAL fields (unit_cost / ext_cost / margin / estimator
// provenance) — the model still carries them under `row.internal` and
// `totals.internal` so templates that want the shop copy can show them.

const num = (v, fallback = 0) => (Number.isFinite(Number(v)) ? Number(v) : fallback);
const clean = (v) => String(v ?? "").trim();
const firstText = (...vals) => {
  for (const v of vals) {
    const s = clean(v);
    if (s) return s;
  }
  return "";
};

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

// Money is normalized to a number-or-null on the model; templates call
// model.fmt.usd() so every template formats currency identically.
const moneyOrNull = (v) => {
  const s = clean(v);
  if (!s && s !== "0") {
    const n = num(v, NaN);
    return Number.isFinite(n) ? n : null;
  }
  const n = num(v, NaN);
  return Number.isFinite(n) ? n : null;
};

const usd = (n) =>
  n == null || !Number.isFinite(Number(n))
    ? ""
    : `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// WorkOrder.current_stage enum → display label (same map as the traveler).
export const WO_PRINT_STAGE_LABELS = {
  estimating: "Estimating",
  sales: "Sales",
  permitting: "Permitting",
  design: "Design",
  production: "Production",
  fabrication: "Fabrication",
  installation: "Installation",
  completed: "Completed",
};

// Product.operational_status enum → display label for the status column.
export const WO_PRINT_PRODUCT_STATUS_LABELS = {
  queued: "Queued",
  in_design: "In Design",
  design_review: "Design Review",
  ready_for_production: "Ready for Production",
  in_production: "In Production",
  in_fabrication: "In Fabrication",
  ready_for_install: "Ready for Install",
  in_installation: "In Installation",
  completed: "Completed",
  on_hold: "On Hold",
};

// Placeholder shop identity — callers should pass { company: {...} } built
// from loadQuoteDefaults() ({company_name, company_address, company_phone,
// company_email, company_website, company_logo_url}) or GlobalSettings.
export const WO_PRINT_DEFAULT_COMPANY = {
  name: "CCS Signage",
  address_lines: [],
  phone: "",
  email: "",
  website: "",
  license: "",
  logo_url: "",
};

const buildCompany = (wo, options) => {
  const src = options.company || wo.company || {};
  // Accept both the quote-defaults shape (company_name / company_logo_url)
  // and the packing-slip shape (name / logo_url).
  return {
    name: firstText(src.name, src.company_name, wo.company_name, WO_PRINT_DEFAULT_COMPANY.name),
    address_lines: textLines(
      src.address_lines ?? src.company_address ?? src.address ?? WO_PRINT_DEFAULT_COMPANY.address_lines,
    ),
    phone: firstText(src.phone, src.company_phone, WO_PRINT_DEFAULT_COMPANY.phone),
    email: firstText(src.email, src.company_email, WO_PRINT_DEFAULT_COMPANY.email),
    website: firstText(src.website, src.company_website, WO_PRINT_DEFAULT_COMPANY.website),
    license: firstText(src.license, src.company_license, WO_PRINT_DEFAULT_COMPANY.license),
    logo_url: firstText(
      options.logoUrl,
      options.logo_url,
      src.logo_url,
      src.company_logo_url,
      src.logo,
      WO_PRINT_DEFAULT_COMPANY.logo_url,
    ),
  };
};

const cityStateZip = (wo) => {
  const cityState = [
    firstText(wo.city, wo.township_city),
    firstText(wo.state, wo.county),
  ].filter(Boolean).join(", ");
  return [cityState, firstText(wo.zip, wo.postal_code, wo.zip_code)]
    .filter(Boolean).join(" ");
};

// Bill-to: explicit billing address when present, else client name only.
const buildBillTo = (wo, options) => {
  const ov = options.billTo || options.bill_to || {};
  return {
    name: firstText(ov.name, wo.bill_to_name, wo.client_name, wo.customer_name),
    attention: firstText(ov.attention, wo.contact_name, wo.additional_contact),
    address_lines: [
      ...textLines(ov.address_lines),
      ...textLines(ov.address),
      ...textLines(wo.billing_address),
      ...textLines(wo.billing_address_line_2),
    ],
    phone: firstText(ov.phone, wo.contact_phone),
    email: firstText(ov.email, wo.contact_email),
  };
};

// Install site: install_location + address_line_2 + city/state/zip.
const buildShipTo = (wo, options) => {
  const ov = options.shipTo || options.ship_to || {};
  const lines = [
    ...textLines(ov.address_lines),
    ...textLines(ov.address),
    ...textLines(wo.install_location),
    ...textLines(wo.address_line_2),
    ...textLines(cityStateZip(wo)),
  ];
  return {
    name: firstText(ov.name, wo.ship_to_name, wo.client_name, wo.customer_name),
    attention: firstText(ov.attention, wo.contact_name, wo.additional_contact),
    address_lines: lines,
    phone: firstText(ov.phone, wo.contact_phone),
    email: firstText(ov.email, wo.contact_email),
  };
};

// One row per product line. Customer price fields (unit_price / ext_price)
// are ALWAYS populated; internal shop fields (unit_cost / ext_cost / margin /
// estimator provenance) live under `internal` so streamlined/customer-facing
// templates can drop them by construction.
const buildRows = (wo, options) => {
  const rows = [];
  const srcProducts = Array.isArray(options.products)
    ? options.products
    : Array.isArray(wo.products)
      ? wo.products
      : [];
  for (const p of srcProducts) {
    if (!p) continue;
    const name = firstText(
      p.customer_description,
      p.description,
      p.client_product_name,
      p.product_type,
      p.category,
    );
    const qty = fmtQty(p.quantity);
    // Same cut-list rule as the traveler/packing slip: skip rows with neither
    // a label nor a non-zero quantity.
    if (!name && !num(qty)) continue;

    const unitPrice = moneyOrNull(p.quoted_unit_price);
    const extPrice = moneyOrNull(
      p.quoted_total ?? (unitPrice != null && num(qty) ? unitPrice * num(qty) : null),
    );
    const unitCost = moneyOrNull(p.unit_cost ?? p.cost ?? p.est_unit_cost);
    const extCost = moneyOrNull(
      p.ext_cost ?? p.extended_cost ?? (unitCost != null && num(qty) ? unitCost * num(qty) : null),
    );
    const margin = moneyOrNull(
      p.margin ?? (extPrice != null && extCost != null ? extPrice - extCost : null),
    );
    const status = firstText(
      WO_PRINT_PRODUCT_STATUS_LABELS[clean(p.operational_status)],
      clean(p.operational_status),
      clean(p.fulfillment_state),
    );

    rows.push({
      line: rows.length + 1,
      product_id: clean(p.id),
      qty,
      name: name || "Item",
      type: firstText(p.product_type, p.category),
      description: firstText(p.customer_description) && firstText(p.description) !== name
        ? firstText(p.description)
        : "",
      notes: firstText(p.packing_notes, p.production_notes, p.notes),
      status,
      due_date: fmtDate(firstText(p.product_due_date, p.design_due_date)),
      unit_price: unitPrice,
      ext_price: extPrice,
      internal: {
        unit_cost: unitCost,
        ext_cost: extCost,
        margin,
        estimator_notes: firstText(p.estimator_notes),
        source_estimate_number: firstText(p.source_estimate_number),
        module_key: firstText(p.module_key),
        responsibility: firstText(p.responsibility),
        assigned_to: firstText(p.assigned_to, p.designer),
      },
    });
  }
  // Legacy flat product_1..product_6 columns predate the products[] array.
  for (let i = 1; i <= 6; i += 1) {
    const name = clean(wo[`product_${i}`]);
    if (!name) continue;
    rows.push({
      line: rows.length + 1,
      product_id: "",
      qty: "",
      name,
      type: "",
      description: "",
      notes: "",
      status: "",
      due_date: "",
      unit_price: null,
      ext_price: null,
      internal: {
        unit_cost: null, ext_cost: null, margin: null,
        estimator_notes: "", source_estimate_number: "", module_key: "",
        responsibility: "", assigned_to: "",
      },
    });
  }
  return rows;
};

// Flattened materials manifest — internal-only section (unit_cost / ext_cost
// are shop costs, never customer prices). Templates that print a materials
// table are shop copies by definition.
const buildMaterials = (wo, options) => {
  const src = Array.isArray(options.materials)
    ? options.materials
    : Array.isArray(wo.materials)
      ? wo.materials
      : [];
  const rows = [];
  for (const m of src) {
    if (!m) continue;
    const name = firstText(m.part_name, m.name, m.item_label, m.part_key);
    const qty = fmtQty(m.quantity);
    if (!name && !num(qty)) continue;
    rows.push({
      name: name || "Material",
      type: firstText(m.part_type, m.part_subtype),
      qty,
      unit: clean(m.unit),
      unit_cost: moneyOrNull(m.unit_cost),
      ext_cost: moneyOrNull(m.ext_cost ?? m.extended_cost ??
        (moneyOrNull(m.unit_cost) != null && num(qty) ? moneyOrNull(m.unit_cost) * num(qty) : null)),
      section: firstText(m.section_name, m.module_key),
    });
  }
  return rows;
};

const buildTasks = (wo) => {
  const src = Array.isArray(wo.notes) ? wo.notes : [];
  return src
    .filter((t) => t && clean(t.text))
    .map((t) => ({
      text: clean(t.text),
      completed: t.completed === true,
      is_milestone: t.is_milestone === true,
      is_critical_path: t.is_critical_path === true,
      assigned_to: clean(t.assigned_to),
      due_date: fmtDate(t.due_date),
      checklist_context: clean(t.checklist_context),
    }));
};

export function buildWorkOrderPrintModel(workOrder, options = {}) {
  const wo = workOrder || {};
  const rows = buildRows(wo, options);
  const materials = buildMaterials(wo, options);
  const tasks = buildTasks(wo);

  const orderNumber = firstText(
    wo.corbridge_invoice_number,
    wo.order_number,
    wo.work_order_number,
    wo.invoice_number,
    wo.id,
  );
  const workOrderId = clean(wo.id);

  const meta = [
    { key: "stage", label: "Stage", value: WO_PRINT_STAGE_LABELS[clean(wo.current_stage)] || clean(wo.current_stage) },
    { key: "start_date", label: "Start Date", value: fmtDate(wo.start_date) },
    { key: "due_date", label: "Due Date", value: fmtDate(wo.due_date) },
    { key: "install_date", label: "Install Date", value: fmtDate(wo.project_install_date) },
    { key: "sales_rep", label: "Sales Rep", value: firstText(wo.sales_rep, wo.representative) },
    { key: "project_manager", label: "Project Manager", value: clean(wo.project_manager) },
    { key: "designer", label: "Designer", value: clean(wo.designer) },
    { key: "estimator", label: "Estimator", value: clean(wo.estimator) },
    { key: "assigned_to", label: "Assigned To", value: clean(wo.assigned_to) },
    { key: "project_type", label: "Project Type", value: clean(wo.project_type) },
    { key: "permit_number", label: "Permit #", value: clean(wo.permit_number) },
    { key: "po_number", label: "Customer PO", value: clean(wo.po_number) },
  ].filter((entry) => entry.value);

  // Totals — customer-facing money. subtotal is the sum of printed product
  // ext prices; estimate_amount is the WO's stored contract amount when it
  // disagrees with (or stands in for) the product sum.
  const subtotal = rows.reduce((sum, r) => sum + (r.ext_price != null ? r.ext_price : 0), 0);
  const estimateAmount = moneyOrNull(wo.estimate_amount);
  const depositAmount = moneyOrNull(wo.deposit_amount);
  const totalCost = rows.reduce((sum, r) => sum + (r.internal.ext_cost != null ? r.internal.ext_cost : 0), 0);
  const totalMargin = subtotal - totalCost;
  const hasCost = rows.some((r) => r.internal.ext_cost != null) ||
    materials.some((m) => m.ext_cost != null);

  const pieceCount = rows.reduce((sum, r) => sum + (r.qty === "" ? 0 : num(r.qty)), 0);

  return {
    template_id: clean(options.templateId ?? options.template_id),
    document_title: firstText(options.documentTitle, "Work Order"),
    order_number: orderNumber || workOrderId || "—",
    job_code: workOrderId ? `WO-${workOrderId.toUpperCase()}` : orderNumber,
    work_order_id: workOrderId,
    work_order_title: clean(wo.title),
    description: clean(wo.description),
    image_url: clean(wo.image_url),
    asap: wo.asap === true,
    is_rider: wo.is_rider === true,
    completed: wo.completed === true,
    printed_at: firstText(options.printedAt, options.printed_at, new Date().toISOString()),
    company: buildCompany(wo, options),
    bill_to: buildBillTo(wo, options),
    ship_to: buildShipTo(wo, options),
    meta,
    rows,
    row_count: rows.length,
    piece_count: pieceCount,
    totals: {
      subtotal,
      estimate_amount: estimateAmount,
      // The headline contract total: stored estimate_amount when present,
      // else the product subtotal.
      contract_total: estimateAmount != null ? estimateAmount : subtotal,
      deposit_required: wo.deposit_required === true,
      deposit_amount: depositAmount,
      deposit_invoiced: wo.deposit_invoiced === true,
      balance_due: estimateAmount != null && depositAmount != null
        ? estimateAmount - depositAmount
        : estimateAmount,
      internal: {
        total_cost: hasCost ? totalCost : null,
        total_margin: hasCost ? totalMargin : null,
        margin_pct: hasCost && subtotal ? Math.round((totalMargin / subtotal) * 1000) / 10 : null,
        actual_cost: moneyOrNull(wo.actual_cost),
        profit_margin: moneyOrNull(wo.profit_margin),
        materials_cost: materials.some((m) => m.ext_cost != null)
          ? materials.reduce((sum, m) => sum + (m.ext_cost != null ? m.ext_cost : 0), 0)
          : null,
      },
    },
    materials,
    tasks,
    task_counts: {
      total: tasks.length,
      done: tasks.filter((t) => t.completed).length,
      milestones: tasks.filter((t) => t.is_milestone).length,
    },
    fmt: { usd, fmtDate, fmtQty },
    footer_note: firstText(
      options.footerNote,
      "This work order lists customer pricing — production details travel on the shop traveler.",
    ),
  };
}

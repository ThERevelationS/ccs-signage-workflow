// Pure, React-free model builder for the work-order print templates (D-09).
// Every template renders from one normalized shape — rows, materials, tasks,
// totals, meta, company/bill-to/ship-to blocks — so adding a template never
// re-derives WorkOrder fields. Customer prices and internal cost/margin live in
// SEPARATE properties (row.unit_price vs row.internal.unit_cost, totals.subtotal
// vs totals.internal.*) so a customer-facing template can simply never read the
// internal side and cannot leak shop costs onto the sheet.

const clean = (v) => String(v ?? "").trim();

const num = (v, fallback = null) => {
  if (v === "" || v == null) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const moneyOrNull = (value) => {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "string" && value.trim() === "") return null;
  return num(value, null);
};

const firstText = (...vals) => {
  for (const v of vals) {
    const s = clean(v);
    if (s) return s;
  }
  return "";
};

// Accepts a string ("line1\nline2"), an array of strings, or an array of
// objects with name/label/line/text — anything reasonable becomes a line.
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
  const n = num(v, null);
  if (n == null) return "";
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

const formatUsd = (n) => {
  const value = num(n, null);
  return value == null
    ? ""
    : `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

export const PRINT_STAGE_LABELS = {
  estimating: "Estimating",
  sales: "Sales",
  permitting: "Permitting",
  design: "Design",
  production: "Production",
  fabrication: "Fabrication",
  installation: "Installation",
  completed: "Completed",
};

// WorkOrder.products[].operational_status → readable print label. Printed
// statuses stay English in every template (the Spanish sheet translates its
// own headers, not the underlying record data).
export const PRINT_PRODUCT_STATUS_LABELS = {
  order_review: "Order Review",
  site_survey: "Site Survey",
  awaiting_customer_action: "Awaiting Customer",
  awaiting_proof_approval: "Awaiting Proof Approval",
  proof_changes_requested: "Proof Changes Requested",
  permitting: "Permitting",
  proof_approved: "Proof Approved",
  design_review: "Design Review",
  in_design: "In Design",
  in_production: "In Production",
  quality_control: "Quality Control",
  service_repair: "Service Repair",
  install_or_removal_only: "Install / Removal Only",
  vended: "Vended",
  none: "",
};

const titleCase = (v) => {
  const s = clean(v).replace(/[_-]+/g, " ");
  return s ? s.replace(/\b[a-z]/g, (c) => c.toUpperCase()) : "";
};

const productStatus = (product) =>
  (PRINT_PRODUCT_STATUS_LABELS[clean(product?.operational_status)]
    ?? titleCase(product?.operational_status))
    || clean(product?.customer_facing_status);

// Customer-facing product notes only. Estimator notes are INTERNAL and must
// never travel into a print model.
const customerNotes = (product) => {
  const rows = Array.isArray(product?.notes) ? product.notes : [];
  return rows
    .filter((n) => ["customer", "client"].includes(clean(n?.channel).toLowerCase()))
    .map((n) => clean(n?.text))
    .filter(Boolean)
    .join(" · ");
};

// Quote-defaults record (company_name / company_logo_url / company_address …)
// maps to the print company block; an already-mapped company passes through.
export function mapPrintCompany(source) {
  const c = source || {};
  return {
    name: firstText(c.name, c.company_name),
    logo_url: firstText(c.logo_url, c.company_logo_url),
    address_lines: textLines(c.address_lines?.length ? c.address_lines : c.company_address),
    phone: firstText(c.phone, c.company_phone),
    email: firstText(c.email, c.company_email),
    website: firstText(c.website, c.company_website),
    license: firstText(c.license, c.company_license),
    footer_note: firstText(c.footer_note, c.quote_footer_text),
  };
}

export function buildWorkOrderPrintModel(workOrder, opts = {}) {
  const wo = workOrder || {};
  const company = mapPrintCompany(opts.company || opts.companyDefaults);

  const rows = (Array.isArray(wo.products) ? wo.products : []).map((p, i) => {
    const qty = fmtQty(p?.quantity);
    const unitPrice = moneyOrNull(p?.quoted_unit_price);
    const extPrice = moneyOrNull(p?.quoted_total) ?? (
      unitPrice != null && qty !== "" ? unitPrice * qty : null
    );
    const unitCost = moneyOrNull(p?.unit_cost);
    const extCost = moneyOrNull(p?.ext_cost ?? p?.extended_cost) ?? (
      unitCost != null && qty !== "" ? unitCost * qty : null
    );
    return {
      line: i + 1,
      name: firstText(p?.customer_description, p?.description) || "Item",
      type: clean(p?.product_type),
      qty,
      unit_price: unitPrice,
      ext_price: extPrice,
      internal: {
        unit_cost: unitCost,
        ext_cost: extCost,
        margin: extPrice != null && extCost != null ? extPrice - extCost : null,
      },
      status: productStatus(p),
      notes: customerNotes(p),
      due_date: fmtDate(p?.product_due_date || p?.design_due_date),
    };
  });

  const materials = (Array.isArray(wo.materials) ? wo.materials : []).map((mat) => {
    const qty = fmtQty(mat?.quantity);
    const unitCost = moneyOrNull(mat?.unit_cost);
    return {
      name: firstText(mat?.part_name, mat?.name, mat?.inventory_item_name) || "Part",
      type: clean(mat?.part_type),
      section: clean(mat?.section_name),
      qty,
      unit: clean(mat?.unit),
      unit_cost: unitCost,
      ext_cost: moneyOrNull(mat?.ext_cost ?? mat?.extended_cost) ?? (unitCost != null && qty !== "" ? unitCost * qty : null),
    };
  });

  const tasks = (Array.isArray(wo.notes) ? wo.notes : [])
    .map((task) => ({
      text: clean(task?.text),
      completed: !!task?.completed,
      is_milestone: !!task?.is_milestone,
      assigned_to: clean(task?.assigned_to),
      due_date: fmtDate(task?.due_date),
    }))
    .filter((task) => task.text);

  const subtotal = rows.reduce(
    (sum, row) => (row.ext_price == null ? sum : sum + row.ext_price),
    0,
  );
  const totalCost = rows.reduce(
    (sum, row) => (row.internal.ext_cost == null ? sum : sum + row.internal.ext_cost),
    0,
  );
  const hasCompleteCost = rows.length > 0 && rows.every((row) => row.internal.ext_cost != null);
  const hasCompletePrice = rows.length > 0 && rows.every((row) => row.ext_price != null);
  const totalMargin = hasCompleteCost && hasCompletePrice ? subtotal - totalCost : null;

  const estimateAmount = moneyOrNull(wo.estimate_amount);
  const depositAmount = moneyOrNull(wo.deposit_amount);
  const contractTotal = estimateAmount ?? subtotal;
  const balanceDue = contractTotal == null
    ? null
    : contractTotal - (depositAmount || 0);

  const billToLines = textLines(
    Array.isArray(wo.billing_address) || wo.billing_address
      ? wo.billing_address
      : wo.install_location,
  ).concat(textLines(wo.billing_address_line_2));
  const siteLines = textLines(wo.install_location).concat(textLines(wo.address_line_2));
  const locality = [clean(wo.township_city), clean(wo.county)].filter(Boolean).join(", ");
  if (locality) siteLines.push(locality);

  const clientName = firstText(wo.client_name, wo.contact_name);
  const contactName = clean(wo.contact_name);

  const meta = [
    { key: "stage", label: "Stage", value: PRINT_STAGE_LABELS[clean(wo.current_stage)] || titleCase(wo.current_stage) },
    { key: "start_date", label: "Start Date", value: fmtDate(wo.start_date) },
    { key: "due_date", label: "Due Date", value: fmtDate(wo.due_date) },
    { key: "install_date", label: "Install Date", value: fmtDate(wo.project_install_date) },
    { key: "project_manager", label: "Project Manager", value: clean(wo.project_manager) },
    { key: "sales_rep", label: "Sales Rep", value: clean(wo.sales_rep) },
    { key: "estimator", label: "Estimator", value: clean(wo.estimator) },
    { key: "designer", label: "Designer", value: clean(wo.designer) },
    { key: "project_type", label: "Project Type", value: clean(wo.project_type) },
    { key: "permit_number", label: "Permit #", value: clean(wo.permit_number) },
  ].filter((entry) => entry.value);

  const pieceCount = rows.reduce(
    (sum, row) => (row.qty === "" ? sum : sum + Number(row.qty)),
    0,
  );

  return {
    template_id: firstText(opts.templateId, opts.template_id),
    order_number: firstText(wo.order_number, wo.order_id, wo.id),
    job_code: clean(wo.job_code),
    document_title: clean(opts.documentTitle) || "Work Order",
    document_title_es: clean(opts.documentTitleEs) || "Orden de Trabajo",
    printed_at: opts.printedAt || new Date().toISOString(),
    footer_note: firstText(opts.footerNote, company.footer_note),
    work_order_title: clean(wo.title),
    description: clean(wo.description),
    asap: !!wo.asap,
    completed: !!wo.completed,
    piece_count: pieceCount || null,
    company,
    bill_to: {
      name: clientName,
      attention: contactName && contactName !== clientName ? contactName : "",
      address_lines: billToLines,
      phone: clean(wo.contact_phone),
      email: clean(wo.contact_email),
    },
    ship_to: {
      attention: contactName,
      address_lines: siteLines.length ? siteLines : billToLines,
    },
    rows,
    materials,
    tasks,
    task_counts: {
      done: tasks.filter((task) => task.completed).length,
      total: tasks.length,
    },
    totals: {
      subtotal,
      estimate_amount: estimateAmount,
      contract_total: contractTotal,
      deposit_required: !!wo.deposit_required,
      deposit_amount: depositAmount,
      deposit_invoiced: !!wo.deposit_invoiced,
      balance_due: balanceDue,
      internal: {
        total_cost: hasCompleteCost ? totalCost : null,
        total_margin: totalMargin,
        margin_pct: totalMargin != null && subtotal > 0
          ? Math.round((totalMargin / subtotal) * 100)
          : null,
        actual_cost: moneyOrNull(wo.actual_cost),
        profit_margin: moneyOrNull(wo.profit_margin),
      },
    },
    meta,
    fmt: { usd: formatUsd },
  };
}

export default buildWorkOrderPrintModel;
import { getModuleLabel } from "./moduleRegistry";
import { acceptedCustomerUnitPrice } from "./customerPricing";

const num = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const norm = (value) => String(value || "").trim().toLowerCase();
const firstNonBlank = (...values) => values.find((value) => value !== undefined && value !== null && String(value).trim() !== "") ?? "";

export function buildEstimateWorkOrderProducts(estimate = {}, pricing = {}) {
  const pricedByLine = new Map(
    (pricing.sections || [])
      .filter((section) => section?.line_id)
      .map((section) => [section.line_id, section])
  );

  return (estimate.line_items || []).map((line, index) => {
    const priced = pricedByLine.get(line.line_id) || line;
    const quantity = Math.max(0, num(priced.quantity, num(line.customer_quantity, 1)));
    const unitPrice = num(priced.unitRaw, acceptedCustomerUnitPrice(line));
    const adjustedTotal = Number.isFinite(Number(priced.adjusted))
      ? Number(priced.adjusted)
      : unitPrice * quantity * (1 + num(line.adjustment_percent) / 100);
    const productName = line.client_product_name || line.project_name || getModuleLabel(line.module_key) || `Product ${index + 1}`;

    return {
      id: line.builder_product_id || line.line_id || line.project_id || `estimate-product-${index + 1}`,
      description: productName,
      // SIP/production Product Type is an explicit classification selected on
      // the estimator Product. Builder/module names are not interchangeable
      // with the production taxonomy, so never guess a fallback here.
      product_type: line.production_product_type || "",
      estimate_line_id: line.line_id || "",
      builder_product_id: line.builder_product_id || "",
      source_project_id: line.project_id || "",
      module_key: line.module_key || "",
      quantity,
      quoted_unit_price: unitPrice,
      quoted_total: adjustedTotal,
      category: line.product_category || "",
      customer_description: line.customer_description || "",
      estimator_notes: line.product_notes || "",
    };
  });
}

const productKey = (product = {}) => {
  if (product.id) return `id:${product.id}`;
  return `name:${norm(product.description)}|type:${norm(product.product_type)}`;
};

// WorkOrder products may already have been edited by Sales/Production. Preserve
// those rows exactly and append only estimate Products that are not represented.
export function mergeWorkOrderProducts(existingProducts = [], estimateProducts = []) {
  const merged = [...(existingProducts || [])];
  const keys = new Set(merged.map(productKey));
  for (const product of estimateProducts || []) {
    const key = productKey(product);
    if (keys.has(key)) continue;
    keys.add(key);
    merged.push(product);
  }
  return merged;
}

export function selectExistingEstimateWorkOrder(rows = [], linkedWorkOrderId = "") {
  if (linkedWorkOrderId) {
    const linked = (rows || []).find((row) => row.id === linkedWorkOrderId);
    if (linked) return linked;
  }
  return (rows || []).slice().sort((a, b) => {
    const aTime = Date.parse(a?.created_date || a?.updated_date || "") || 0;
    const bTime = Date.parse(b?.created_date || b?.updated_date || "") || 0;
    if (aTime !== bTime) return aTime - bTime;
    return String(a?.id || "").localeCompare(String(b?.id || ""));
  })[0] || null;
}

export function convertedWorkOrderStage(existingStage) {
  // Do not move a WorkOrder backward if operations has already advanced it.
  if (existingStage && !["estimating", "sales"].includes(existingStage)) return existingStage;
  return "sales";
}

export function buildConvertedWorkOrderFields({ estimate = {}, pricing = {}, existing = null, products = [], generatedDescription = "", conversionDate = "", verifiedCustomerId = "" } = {}) {
  return {
    title: firstNonBlank(estimate.project_name, existing?.title),
    client_name: firstNonBlank(estimate.client_name, existing?.client_name),
    // Conversion must not revive a stale estimate.customer_id. The caller passes
    // only a Customer ID verified against the live Customer entity.
    customer_id: firstNonBlank(verifiedCustomerId, existing?.customer_id),
    estimate_id: estimate.id || existing?.estimate_id || "",
    // Preserve richer sales/production notes already entered on the pipeline lead.
    description: firstNonBlank(existing?.description, generatedDescription),
    current_stage: convertedWorkOrderStage(existing?.current_stage),
    sales_status: "won",
    install_location: firstNonBlank(estimate.site_address, existing?.install_location),
    contact_name: firstNonBlank(estimate.contact_name, estimate.order_contact, existing?.contact_name),
    contact_email: firstNonBlank(estimate.contact_email, existing?.contact_email),
    contact_phone: firstNonBlank(estimate.contact_phone, estimate.office_phone, existing?.contact_phone),
    representative: firstNonBlank(estimate.order_contact, existing?.representative),
    sales_rep: firstNonBlank(estimate.salesperson, existing?.sales_rep),
    estimator: firstNonBlank(estimate.salesperson, existing?.estimator),
    estimate_amount: num(pricing.quoteTotal),
    quoted_amount: num(pricing.quoteTotal),
    quote_date: firstNonBlank(estimate.quote_issue_date, existing?.quote_date),
    date_order_created: firstNonBlank(existing?.date_order_created, conversionDate),
    corbridge_invoice_number: firstNonBlank(estimate.estimate_number, existing?.corbridge_invoice_number),
    project_install_date: firstNonBlank(estimate.target_install_date, existing?.project_install_date),
    in_pipeline: true,
    products,
  };
}

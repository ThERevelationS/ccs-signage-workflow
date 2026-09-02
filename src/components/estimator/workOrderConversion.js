import { getModuleLabel } from "./moduleRegistry";
import { acceptedCustomerUnitPrice } from "./customerPricing";

const num = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const norm = (value) => String(value || "").trim().toLowerCase();

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
  return (rows || [])[0] || null;
}

export function convertedWorkOrderStage(existingStage) {
  // Do not move a WorkOrder backward if operations has already advanced it.
  if (existingStage && !["estimating", "sales"].includes(existingStage)) return existingStage;
  return "sales";
}

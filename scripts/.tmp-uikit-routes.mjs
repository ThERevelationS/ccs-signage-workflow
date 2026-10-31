// src/components/kit/recordRoutes.js
var RECORD_ROUTES = {
  estimate: { path: "/EstimateDetail", param: "id", label: "Estimate" },
  workorder: { path: "/JobWorkspace", param: "wo", label: "Work Order" },
  invoice: { path: "/Invoices", param: "invoice", label: "Invoice" },
  po: { path: "/PurchaseOrders", param: "po", label: "Purchase Order" },
  customer: { path: "/Customer360", param: "id", label: "Customer" },
  opportunity: { path: "/Opportunities", param: "open", label: "Opportunity" },
  changeorder: { path: "/ChangeOrders", param: "co", label: "Change Order" }
};
var RECORD_KINDS = Object.keys(RECORD_ROUTES);
var normKind = (v) => String(v || "").trim().toLowerCase();
var KIND_ALIASES = {
  wo: "workorder",
  work_order: "workorder",
  workorder: "workorder",
  purchase_order: "po",
  purchaseorder: "po",
  purchaseorders: "po",
  estimates: "estimate",
  invoices: "invoice",
  customers: "customer",
  opportunities: "opportunity",
  change_order: "changeorder",
  changeorders: "changeorder",
  co: "changeorder"
};
function recordRoute(kind) {
  const k = normKind(kind);
  const canonical = RECORD_ROUTES[k] ? k : KIND_ALIASES[k];
  return canonical ? { kind: canonical, ...RECORD_ROUTES[canonical] } : null;
}
function recordHref(kind, id) {
  const route = recordRoute(kind);
  const value = String(id ?? "").trim();
  if (!route || !value) return "";
  return `${route.path}?${route.param}=${encodeURIComponent(value)}`;
}
function recordLabel(kind) {
  return recordRoute(kind)?.label || String(kind || "").trim() || "Record";
}
export {
  RECORD_KINDS,
  RECORD_ROUTES,
  recordHref,
  recordLabel,
  recordRoute
};

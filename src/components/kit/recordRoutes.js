// Typed deep-link model for the kit RecordLink primitive.
//
// One canonical kind -> { path, param } table so every surface deep-links a
// record the same way the pages actually read their query params:
//   estimate    -> /EstimateDetail?id=        (EstimateDetail reads "id")
//   workorder   -> /JobWorkspace?wo=          (JobWorkspace reads "wo")
//   invoice     -> /Invoices?invoice=         (Invoices reads "invoice")
//   po          -> /PurchaseOrders?po=        (PurchaseOrders reads "po")
//   customer    -> /Customer360?id=           (Customer360 reads "id")
//   opportunity -> /Opportunities?open=       (Opportunities reads "open")
// Pure and import-free so scripts/test-uikit.mjs can bundle it under Node.

export const RECORD_ROUTES = {
  estimate: { path: "/EstimateDetail", param: "id", label: "Estimate" },
  workorder: { path: "/JobWorkspace", param: "wo", label: "Work Order" },
  invoice: { path: "/Invoices", param: "invoice", label: "Invoice" },
  po: { path: "/PurchaseOrders", param: "po", label: "Purchase Order" },
  customer: { path: "/Customer360", param: "id", label: "Customer" },
  opportunity: { path: "/Opportunities", param: "open", label: "Opportunity" },
};

export const RECORD_KINDS = Object.keys(RECORD_ROUTES);

const normKind = (v) => String(v || "").trim().toLowerCase();

// A few natural aliases callers already use — "wo" and "work_order" show up
// in row data, "purchase_order" in procurement code.
const KIND_ALIASES = {
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
};

export function recordRoute(kind) {
  const k = normKind(kind);
  const canonical = RECORD_ROUTES[k] ? k : KIND_ALIASES[k];
  return canonical ? { kind: canonical, ...RECORD_ROUTES[canonical] } : null;
}

// kind + id -> "/Page?param=id" href, or "" when the link can't be built
// (unknown kind / blank id) so callers can fall back to plain text instead
// of emitting a broken route.
export function recordHref(kind, id) {
  const route = recordRoute(kind);
  const value = String(id ?? "").trim();
  if (!route || !value) return "";
  return `${route.path}?${route.param}=${encodeURIComponent(value)}`;
}

export function recordLabel(kind) {
  return recordRoute(kind)?.label || String(kind || "").trim() || "Record";
}

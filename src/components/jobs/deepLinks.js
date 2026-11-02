// Job-workspace deep links: one canonical entityType -> { path, param } map so
// every surface that cross-links records builds URLs the target pages actually
// read. Conventions verified against the page sources:
//   work_order     -> /JobWorkspace?wo=        (JobWorkspace reads "wo"; also
//                                              accepts ?estimate= to resolve a WO)
//   estimate       -> /EstimateDetail?id=      (EstimateDetail reads "id")
//   invoice        -> /Invoices?invoice=       (Invoices reads "invoice")
//   customer       -> /Customer360?id=         (Customer360 reads "id";
//                                              "customer" is an accepted alias)
//   opportunity    -> /Opportunities?open=     (Opportunities reads "open")
//   intake         -> /Opportunities?view=queue&intake=
//                                              (OpportunityIntake events have no
//                                              dedicated page; the queue view is
//                                              the intake surface. "intake" is
//                                              carried for forward compatibility.)
//   purchase_order -> /PurchaseOrders?po=      (PurchaseOrders reads "po")
//   change_order   -> /ChangeOrders?co=        (ChangeOrders reads "co")
// Pure and import-free (no React / window) so scripts/test-deep-links.mjs can
// bundle it under Node — same constraint as components/kit/recordRoutes.js,
// which stays the kind-keyed variant for the RecordLink primitive.

export const DEEP_LINK_ROUTES = {
  work_order: {
    path: "/JobWorkspace",
    param: "wo",
    label: "Work Order",
    back: "/MainWorkflow",
  },
  estimate: {
    path: "/EstimateDetail",
    param: "id",
    label: "Estimate",
    back: "/EstimatorQueues",
  },
  invoice: {
    path: "/Invoices",
    param: "invoice",
    label: "Invoice",
    back: "/Invoices",
  },
  customer: {
    path: "/Customer360",
    param: "id",
    label: "Customer",
    back: "/EstimatorCustomers",
  },
  opportunity: {
    path: "/Opportunities",
    param: "open",
    label: "Opportunity",
    back: "/Opportunities",
  },
  intake: {
    path: "/Opportunities",
    param: "intake",
    extraParams: { view: "queue" },
    label: "Intake",
    back: "/Opportunities?view=queue",
  },
  purchase_order: {
    path: "/PurchaseOrders",
    param: "po",
    label: "Purchase Order",
    back: "/PurchaseOrders",
  },
  change_order: {
    path: "/ChangeOrders",
    param: "co",
    label: "Change Order",
    back: "/ChangeOrders",
  },
};

export const ENTITY_TYPES = Object.keys(DEEP_LINK_ROUTES);

// Natural spellings seen in row data and sibling code (recordRoutes.js uses the
// same wo/work_order family; quotes are customer-facing estimates here).
const ENTITY_ALIASES = {
  wo: "work_order",
  workorder: "work_order",
  workorders: "work_order",
  work_orders: "work_order",
  job: "work_order",
  jobs: "work_order",
  order: "work_order",
  orders: "work_order",
  estimates: "estimate",
  quote: "estimate",
  quotes: "estimate",
  customer_quote: "estimate",
  customerquote: "estimate",
  invoices: "invoice",
  customers: "customer",
  client: "customer",
  clients: "customer",
  account: "customer",
  opportunities: "opportunity",
  sales: "opportunity",
  sales_opportunity: "opportunity",
  pipeline: "opportunity",
  intakes: "intake",
  opportunity_intake: "intake",
  opportunityintake: "intake",
  estimate_request: "intake",
  estimating_request: "intake",
  po: "purchase_order",
  purchaseorder: "purchase_order",
  purchase_orders: "purchase_order",
  purchaseorders: "purchase_order",
  co: "change_order",
  changeorder: "change_order",
  change_orders: "change_order",
  changeorders: "change_order",
};

const normType = (v) => String(v || "").trim().toLowerCase();

// Resolves an entity type spelling to a canonical DEEP_LINK_ROUTES key, or ""
// for anything unrecognized. Case-insensitive; "_" / "-" / " " normalized.
export function canonicalEntityType(entityType) {
  const k = normType(entityType).replace(/[-\s]+/g, "_");
  if (DEEP_LINK_ROUTES[k]) return k;
  const alias = ENTITY_ALIASES[k];
  return alias && DEEP_LINK_ROUTES[alias] ? alias : "";
}

// Query string built with encodeURIComponent (not URLSearchParams.toString,
// which emits "+" for spaces) so output matches recordHref/RecordLink and the
// pages' own navigate(`...?id=${encodeURIComponent(id)}`) calls byte-for-byte.
function buildQuery(route, id) {
  const parts = [];
  for (const [k, v] of Object.entries(route.extraParams || {})) {
    parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(v)}`);
  }
  const value = String(id ?? "").trim();
  if (value) parts.push(`${encodeURIComponent(route.param)}=${encodeURIComponent(value)}`);
  return parts.length ? `?${parts.join("&")}` : "";
}

// entityType + id -> "/Page?param=id" workspace URL. Unknown type -> null so
// callers can fall back to plain text or a list link; blank id -> the bare
// route (with any fixed params) which still resolves to the page's own
// picker/list state. Ids are URL-encoded — Base44 ids are safe today but
// order numbers and external keys are not.
export function deepLinkFor(entityType, id) {
  const canonical = canonicalEntityType(entityType);
  if (!canonical) return null;
  const route = DEEP_LINK_ROUTES[canonical];
  return `${route.path}${buildQuery(route, id)}`;
}

// Parses a deep link back to its canonical entity type. Accepts a path+query
// ("/JobWorkspace?wo=x"), a full URL, or a bare path. Path match is
// case-sensitive-exact per registered route names; "/Opportunities" disambiguates
// intake (view=queue or an intake param) from opportunity. Unknown path -> null.
export function entityTypeFromUrl(url) {
  const raw = String(url || "").trim();
  if (!raw) return null;
  let pathname = "";
  let search = "";
  try {
    const parsed = new URL(raw, "https://ccs.deep-link.local");
    pathname = parsed.pathname;
    search = parsed.search;
  } catch {
    return null;
  }
  const params = new URLSearchParams(search);
  // Match the longest registered path first so nested routes win if added later.
  const candidates = ENTITY_TYPES
    .map((t) => ({ type: t, ...DEEP_LINK_ROUTES[t] }))
    .sort((a, b) => b.path.length - a.path.length);
  for (const route of candidates) {
    if (pathname !== route.path) continue;
    if (route.type === "intake") {
      // /Opportunities?view=queue or any explicit intake param is the intake
      // surface; ?open= (and bare /Opportunities) stays opportunity.
      if (params.get("view") === "queue" || params.has("intake")) return "intake";
      continue;
    }
    if (route.type === "opportunity") {
      if (params.get("view") === "queue" || params.has("intake")) return "intake";
      return "opportunity";
    }
    return route.type;
  }
  return null;
}

// Round-trip helper: "/Page?param=id" -> { entityType, id } or null.
export function parseDeepLink(url) {
  const entityType = entityTypeFromUrl(url);
  if (!entityType) return null;
  const route = DEEP_LINK_ROUTES[entityType];
  let id = "";
  try {
    id = new URL(String(url || ""), "https://ccs.deep-link.local").searchParams.get(route.param) || "";
  } catch {
    // id stays "" — the type still resolved.
  }
  return { entityType, id, path: route.path };
}

// The "back" surface for a record page — the list/queue a user returns to.
// Unknown type -> "/" (app home) so a back control always lands somewhere sane.
export function backLinkFor(entityType) {
  const canonical = canonicalEntityType(entityType);
  if (!canonical) return "/";
  return DEEP_LINK_ROUTES[canonical].back || "/";
}

// Convenience label for link text: deepLinkLabel("work_order") -> "Work Order".
export function deepLinkLabel(entityType) {
  const canonical = canonicalEntityType(entityType);
  return canonical ? DEEP_LINK_ROUTES[canonical].label : normType(entityType) || "Record";
}

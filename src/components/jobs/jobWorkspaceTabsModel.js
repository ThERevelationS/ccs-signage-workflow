// D-03 — Job workspace tab model (CoreBridge "Order.aspx" tab strip,
// COREBRIDGE_MAP.md §5): Products / Order Contact / Address Info / Notes /
// Order History / Overrides / Payments.
//
// Pure and IO-free — no React, no base44 — so the registry, field resolvers,
// notes roll-up, overrides roll-up and history-feed assembly are unit-testable
// under Node (scripts/test-job-workspace-tabs.mjs). Follows the same pure-model
// convention as jobWorkspaceModel.js / orderHeaderModel.js.
//
// Data sources per tab (the "zero new reads on mount" contract):
//   products      — on-WO products[] (workspaceProductRows); already mounted.
//   contact       — on-WO contact/rep fields; zero reads.
//   address       — on-WO install/billing/ship-to fields; zero reads.
//   notes         — on-WO notes[]/work_notes[] + per-product channel notes
//                   (productNotesModel, surface 'jobWorkspace'); zero reads.
//   history       — on-WO status_history + conversion_events[] merged with
//                   caller-supplied ProductActivity / OpportunityActivity /
//                   Payment rows (lazy reads owned by the page).
//   overrides     — on-WO overridden flags + caller-supplied ProductActivity
//                   override/price_override rows (same lazy read as history).
//   payments      — invoices + payments the page already fetches via
//                   invoicingAction for the Financials card.

import { notesForSurface, NOTE_CHANNELS } from "./productNotesModel.js";
import {
  hasOrderEntryOverride,
  overrideBadgeLabel,
  overrideBadgeTooltip,
} from "./orderEntryOverrideModel.js";
import { mergeOrderHistorySources } from "./orderHistoryModel.js";

const clean = (v) => String(v ?? "").trim();
const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const asList = (v) => (Array.isArray(v) ? v.filter(Boolean) : []);
const firstText = (...vals) => {
  for (const v of vals) {
    const s = clean(v);
    if (s) return s;
  }
  return "";
};

// ---------------------------------------------------------------------------
// Tab registry — the ordered strip. `key` doubles as the ?tab= deep-link value
// (deepLinks.js convention: pages serialize view state into query params).
// ---------------------------------------------------------------------------

export const JOB_WORKSPACE_TABS = [
  { key: "products", label: "Products", lazy: false },
  { key: "contact", label: "Order Contact", lazy: false },
  { key: "address", label: "Address Info", lazy: false },
  { key: "notes", label: "Notes", lazy: false },
  { key: "history", label: "Order History", lazy: true },
  { key: "overrides", label: "Overrides", lazy: true },
  { key: "payments", label: "Payments", lazy: false },
];

export const JOB_WORKSPACE_TAB_KEYS = JOB_WORKSPACE_TABS.map((t) => t.key);

export const DEFAULT_JOB_WORKSPACE_TAB = "products";

// Tabs whose content needs the lazy activity read (ProductActivity +
// OpportunityActivity) — the page arms the query when ANY of these is open.
export const LAZY_ACTIVITY_TABS = JOB_WORKSPACE_TABS.filter((t) => t.lazy).map((t) => t.key);

// Deep-link aliases — the CoreBridge tab names are "Order Contact",
// "Address Info", "Order History"; callers/deep links may use those forms.
const TAB_ALIASES = {
  order_contact: "contact",
  contacts: "contact",
  address_info: "address",
  addresses: "address",
  order_history: "history",
  activity: "history",
  order_overrides: "overrides",
  financials: "payments",
};

// Resolve a ?tab= param (or any caller value) to a registry key; unknown /
// blank values fall back to the default tab so a stale deep link can never
// blank the surface.
export function resolveWorkspaceTab(value) {
  const raw = clean(value).toLowerCase().replace(/[\s-]+/g, "_");
  const key = TAB_ALIASES[raw] || raw;
  return JOB_WORKSPACE_TAB_KEYS.includes(key) ? key : DEFAULT_JOB_WORKSPACE_TAB;
}

export function workspaceTab(key) {
  return JOB_WORKSPACE_TABS.find((t) => t.key === clean(key)) || null;
}

// Does this tab need the lazy ProductActivity/OpportunityActivity feed?
export function tabNeedsActivityFeed(key) {
  return LAZY_ACTIVITY_TABS.includes(clean(key));
}

// ---------------------------------------------------------------------------
// Order Contact tab — the people attached to the order. Everything resolves
// off the WO row itself (contact_* are declared WorkOrder fields;
// representative is the order-contact display name, sales_rep the salesperson).
// ---------------------------------------------------------------------------

export function orderContactFields(workOrder) {
  const wo = isObj(workOrder) ? workOrder : {};
  const field = (key, label, value, extra = {}) => ({
    key, label, value: clean(value), missing: !clean(value), ...extra,
  });
  return [
    field("customer", "Customer", firstText(wo.client_name, wo.customer_name)),
    field("contact_name", "Contact Name", wo.contact_name),
    field("contact_email", "Contact Email", wo.contact_email),
    field("contact_phone", "Contact Phone", wo.contact_phone),
    field("additional_contact", "Additional Contact", wo.additional_contact),
    field("representative", "Order Contact / Rep", firstText(wo.representative, wo.contact_name)),
    field("salesperson", "Salesperson", firstText(wo.sales_rep, wo.salesperson, wo.estimator)),
    field("project_manager", "Project Manager", wo.project_manager),
    field("assigned_to", "Assigned To", wo.assigned_to),
    field("designer", "Designer", wo.designer),
    field("entered_by", "Entered By", firstText(wo.entered_by_display, wo.entered_by, wo.created_by)),
  ];
}

// ---------------------------------------------------------------------------
// Address Info tab — grouped address blocks. Field fallbacks match the
// packing-slip / work-order print models (city → township_city, state →
// county, zip → postal_code/zip_code) so all three surfaces read one address.
// ---------------------------------------------------------------------------

const addressLines = (wo, prefixes) => {
  const lines = [];
  for (const key of prefixes) {
    const v = clean(wo[key]);
    if (!v) continue;
    for (const piece of v.split(/\r?\n/)) {
      const s = clean(piece);
      if (s) lines.push(s);
    }
  }
  return lines;
};

const cityStateZipLine = (wo) => {
  const cityState = [firstText(wo.city, wo.township_city), firstText(wo.state, wo.county)]
    .filter(Boolean).join(", ");
  return [cityState, firstText(wo.zip, wo.postal_code, wo.zip_code)].filter(Boolean).join(" ");
};

// Returns [{key, label, name, attention, lines, phone, email, missing}] —
// install/site first, then billing, then explicit ship-to when it differs.
export function addressInfoGroups(workOrder) {
  const wo = isObj(workOrder) ? workOrder : {};
  const siteLines = [
    ...addressLines(wo, ["install_location", "address_line_2"]),
    cityStateZipLine(wo),
  ].filter(Boolean);
  const billingLines = addressLines(wo, ["billing_address", "billing_address_line_2"]);
  const shipLines = [
    ...addressLines(wo, ["ship_to_address_lines", "ship_to_address", "shipping_address", "delivery_address"]),
  ];
  const groups = [
    {
      key: "site",
      label: "Install / Site Address",
      name: firstText(wo.client_name, wo.customer_name),
      attention: firstText(wo.contact_name, wo.additional_contact),
      lines: siteLines,
      phone: clean(wo.contact_phone),
      email: clean(wo.contact_email),
    },
    {
      key: "billing",
      label: "Billing Address",
      name: firstText(wo.bill_to_name, wo.client_name, wo.customer_name),
      attention: "",
      lines: billingLines,
      phone: "",
      email: "",
    },
  ];
  // Ship-to block only when explicit ship-to fields exist (otherwise it would
  // duplicate the site block verbatim — the packing slip makes the same call).
  if (shipLines.length || clean(wo.ship_to_name)) {
    groups.push({
      key: "ship_to",
      label: "Ship-To Address",
      name: firstText(wo.ship_to_name, wo.client_name),
      attention: firstText(wo.contact_name, wo.additional_contact),
      lines: shipLines.length ? shipLines : siteLines,
      phone: clean(wo.contact_phone),
      email: clean(wo.contact_email),
    });
  }
  return groups.map((g) => ({ ...g, missing: !g.lines.length && !g.name }));
}

// ---------------------------------------------------------------------------
// Notes tab — three on-WO sources normalized to one row shape:
//   { key, channel, channel_label, scope, text, author, at, done, product }
//   wo.notes[]        — order task list ({id, text, timestamp, created_by, completed})
//   wo.work_notes[]   — typed production notes ({id, type, text, author…})
//   products[].notes[] — B-10 channel notes (all channels visible here —
//                        'jobWorkspace' is the full-audience surface).
// ---------------------------------------------------------------------------

export const NOTE_SCOPE_LABELS = {
  order: "Order",
  work: "Work",
  product: "Product",
};

const NOTE_CHANNEL_LABELS = Object.fromEntries(
  NOTE_CHANNELS.map((c) => [c, c[0].toUpperCase() + c.slice(1)]),
);

function noteRow(key, scope, { channel = "", text = "", author = "", at = "", done = null, product = "", type = "" } = {}) {
  return {
    key,
    scope,
    scope_label: NOTE_SCOPE_LABELS[scope] || scope,
    channel: clean(channel),
    channel_label: NOTE_CHANNEL_LABELS[clean(channel)] || firstText(type, channel ? clean(channel) : ""),
    text: clean(text),
    author: clean(author),
    at: clean(at),
    done: done === null ? null : done === true,
    product: clean(product),
  };
}

// Newest-first merged note list for the Notes tab. `opts.surface` defaults to
// 'jobWorkspace' (full audience); portal/queue callers can pass their own
// surface and the fail-closed channel map still applies.
export function orderNoteRows(workOrder, { surface = "jobWorkspace" } = {}) {
  const wo = isObj(workOrder) ? workOrder : {};
  const rows = [];
  asList(wo.notes).forEach((n, i) => {
    const src = typeof n === "string" ? { text: n } : isObj(n) ? n : {};
    const row = noteRow(`order-${clean(src.id) || i}`, "order", {
      text: src.text ?? src.note ?? src.body,
      author: src.created_by ?? src.author ?? src.by,
      at: src.timestamp ?? src.created_at ?? src.at,
      done: src.completed === true ? true : (src.completed === false ? false : null),
      type: "task",
    });
    if (row.text) rows.push(row);
  });
  asList(wo.work_notes).forEach((n, i) => {
    const src = isObj(n) ? n : { text: n };
    const row = noteRow(`work-${clean(src.id) || i}`, "work", {
      channel: src.type,
      text: src.text ?? src.note ?? src.body,
      author: src.created_by ?? src.author ?? src.by ?? src.entered_by,
      at: src.timestamp ?? src.created_at ?? src.at,
      type: src.type,
    });
    if (row.text) rows.push(row);
  });
  asList(wo.products).forEach((p, pi) => {
    if (!isObj(p)) return;
    const productLabel = firstText(p.description, p.client_product_name, p.name) || `Product ${pi + 1}`;
    notesForSurface(p, surface).forEach((n, i) => {
      const row = noteRow(`product-${pi}-${clean(n.id) || i}`, "product", {
        channel: n.channel,
        text: n.text,
        author: n.author,
        at: n.created_at,
        product: productLabel,
      });
      if (row.text) rows.push(row);
    });
  });
  // Newest first; undated notes keep authored order at the tail (stable sort).
  rows.sort((a, b) => String(b.at || "").localeCompare(String(a.at || "")));
  return rows;
}

export function orderNoteCounts(workOrder, opts = {}) {
  const rows = orderNoteRows(workOrder, opts);
  const byScope = { order: 0, work: 0, product: 0 };
  rows.forEach((r) => { byScope[r.scope] = (byScope[r.scope] || 0) + 1; });
  return { total: rows.length, by_scope: byScope };
}

// ---------------------------------------------------------------------------
// Overrides tab — the D-11 money-trail surface: every product flagged
// `overridden` plus the persisted override audit rows the caller fetched
// (ProductActivity rows with event_type override|price_override, the same lazy
// read that feeds Order History).
// ---------------------------------------------------------------------------

const OVERRIDE_EVENT_TYPES = new Set(["override", "price_override"]);

export function isOverrideEvent(evt) {
  const t = clean(evt?.event_type ?? evt?.type).toLowerCase();
  return OVERRIDE_EVENT_TYPES.has(t) || clean(evt?.details?.override_type) === "price_override";
}

// One row per overridden product: flag provenance (who/when/what) rendered by
// the same badge helpers every surface shares.
export function productOverrideRows(workOrder) {
  const wo = isObj(workOrder) ? workOrder : {};
  return asList(wo.products)
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => isObj(p) && hasOrderEntryOverride(p))
    .map(({ p, i }) => ({
      product_id: firstText(p.id, p.product_id, p.builder_product_id, p.estimate_line_id) || `product-${i}`,
      name: firstText(p.description, p.client_product_name, p.name) || `Product ${i + 1}`,
      badge: overrideBadgeLabel(p),
      tooltip: overrideBadgeTooltip(p),
      edits: asList(p.override_edits),
      overridden_at: clean(p.overridden_at),
      overridden_by: clean(p.overridden_by),
    }));
}

// Audit rows for the Overrides tab feed — ProductActivity-shaped rows filtered
// to the two override event types, newest first.
export function overrideEventRows(events) {
  return asList(events)
    .filter(isOverrideEvent)
    .map((e, i) => ({
      key: firstText(e.id, e.creation_request_key) || `override-evt-${i}`,
      at: firstText(e.occurred_at, e.created_date, e.at),
      product: firstText(e.product_label, e.product_name, typeof e.product === "string" ? e.product : ""),
      label: firstText(e.label, e.summary, e.note, clean(e.event_type).replace(/_/g, " ")),
      from: e.from_value ?? e.from ?? "",
      to: e.to_value ?? e.to ?? "",
      actor: firstText(e.actor_label, e.actor, e.by, e.created_by),
      actor_type: clean(e.actor_type) || "staff",
      event_type: clean(e.event_type),
    }))
    .sort((a, b) => String(b.at).localeCompare(String(a.at)));
}

// ---------------------------------------------------------------------------
// Order History tab — merge every feed source through orderHistoryModel.
// On-WO sources are free: products[].status_history + conversion_events[].
// Caller supplies the lazy entity reads (ProductActivity, OpportunityActivity)
// and the payments list the page already holds.
// ---------------------------------------------------------------------------

// products[].status_history entries ({at, field, from, to, by}) re-shaped to
// the ProductActivity-ish rows mergeOrderHistorySources.normalizeProductEvent
// reads: product label + field-as-event_type + actor in `by`.
export function statusHistoryEvents(workOrder) {
  const wo = isObj(workOrder) ? workOrder : {};
  const out = [];
  asList(wo.products).forEach((p, pi) => {
    if (!isObj(p)) return;
    const name = firstText(p.description, p.client_product_name) || `Product ${pi + 1}`;
    asList(p.status_history).forEach((h, i) => {
      if (!isObj(h)) return;
      out.push({
        id: `status-${pi}-${i}`,
        product_name: name,
        field: clean(h.field),
        event_type: clean(h.field) || "status_change",
        summary: `${name} — ${clean(h.field).replace(/_/g, " ")}: ${h.from ?? "—"} → ${h.to ?? "—"}`,
        occurred_at: clean(h.at),
        by: clean(h.by),
        actor_type: "staff",
      });
    });
  });
  return out;
}

// conversion_events[] are already ProductActivity-shaped (D-06); they feed the
// 'product' source lane of mergeOrderHistorySources as-is.
export function conversionEvents(workOrder) {
  const wo = isObj(workOrder) ? workOrder : {};
  return asList(wo.conversion_events).filter(isObj);
}

// Assemble the merged chronological feed.
//   { activities, productEvents, payments, emails, includeStatusHistory }
// activities    — lazy OpportunityActivity rows (caller).
// productEvents — lazy ProductActivity rows (caller); combined with the WO's
//                 own status_history + conversion_events inside.
// Dedupe: ProductActivity entity rows can duplicate embedded conversion_events
// (same creation_request_key) and status transitions the audit trail also
// persisted — rows with an identical id/creation_request_key, or identical
// (label, occurred_at), keep only the first.
export function workspaceOrderHistoryFeed(workOrder, {
  activities = [],
  productEvents = [],
  payments = [],
  emails = [],
  includeStatusHistory = true,
} = {}) {
  const embedded = [
    ...(includeStatusHistory ? statusHistoryEvents(workOrder) : []),
    ...conversionEvents(workOrder),
  ];
  const merged = mergeOrderHistorySources({
    activities,
    productEvents: [...embedded, ...asList(productEvents)],
    payments,
    emails,
  });
  const seen = new Set();
  return merged.filter((row) => {
    const raw = row?.raw || {};
    const dedupeKey =
      firstText(raw.id, raw.creation_request_key, row.id) &&
      (firstText(raw.creation_request_key) || firstText(raw.id));
    const key = dedupeKey || `${row.label}|${row.occurred_at}|${row.actor}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ---------------------------------------------------------------------------
// Tab badges — small counts the strip can render next to labels
// ({products, notes, overrides, payments}).
// ---------------------------------------------------------------------------

export function workspaceTabBadges(workOrder, { payments = [] } = {}) {
  const wo = isObj(workOrder) ? workOrder : {};
  return {
    products: asList(wo.products).length,
    notes: orderNoteCounts(wo).total,
    overrides: productOverrideRows(wo).length,
    payments: asList(payments).length,
  };
}

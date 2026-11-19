// Pure per-product audit helpers (B-12): diff a product patch against the
// loaded product into typed ProductActivity rows and render one history line.
//
// No React, no IO — the model is esbuild-bundled and unit-tested under plain
// Node (scripts/test-product-audit-stage.mjs). Event rows match the
// ProductActivity entity contract (base44/entities/ProductActivity.jsonc):
//   work_order_id · product_id · event_type · actor_type · actor_label ·
//   from_value · to_value · note · occurred_at · details{field,…}

export const PRODUCT_AUDIT_EVENT_TYPES = [
  "status_change",
  "substatus_change",
  "proof_event",
  "proof_approved",
  "proof_changes_requested",
  "proof_superseded",
  "due_date_change",
  "assignment_change",
  "priority_change",
  "note",
  "conversion",
  "override",
  "price_override",
];

export const PRODUCT_AUDIT_ACTOR_TYPES = ["staff", "customer", "vendor", "system"];

// products[] field → audit classification. Every diff-able product field maps
// onto exactly one typed event; fields not listed here carry no audit signal
// (quantity/price edits are money history, not ops history — D-11/F-26 own
// those trails).
const FIELD_RULES = [
  { field: "operational_status", event_type: "status_change", label: "Status" },
  { field: "operational_substatus", event_type: "substatus_change", label: "Substatus" },
  { field: "quick_tags", event_type: "substatus_change", label: "Quick tags" },
  { field: "customer_facing_status", event_type: "status_change", label: "Customer-facing status" },
  { field: "fulfillment_state", event_type: "status_change", label: "Fulfillment" },
  { field: "proof_status", event_type: "proof_event", label: "Proof status" },
  { field: "proof_version", event_type: "proof_event", label: "Proof version" },
  { field: "proof_approved_version", event_type: "proof_event", label: "Proof approved version" },
  { field: "proof_file_url", event_type: "proof_event", label: "Proof file" },
  { field: "proof_file_name", event_type: "proof_event", label: "Proof file name" },
  { field: "design_due_date", event_type: "due_date_change", label: "Design due date" },
  { field: "product_due_date", event_type: "due_date_change", label: "Product due date" },
  { field: "hard_due_date", event_type: "due_date_change", label: "Hard due date" },
  { field: "assigned_to", event_type: "assignment_change", label: "Assigned to" },
  { field: "designer", event_type: "assignment_change", label: "Designer" },
  { field: "responsibility", event_type: "assignment_change", label: "Responsibility" },
  { field: "priority", event_type: "priority_change", label: "Priority" },
  { field: "queue_priority", event_type: "priority_change", label: "Queue priority" },
];

const FIELD_BY_NAME = Object.fromEntries(FIELD_RULES.map((r) => [r.field, r]));

const clean = (v) => String(v ?? "").trim();

// String-render a product value for from_value/to_value. Arrays join with a
// comma so quick_tags diffs read "a, b → a, c"; objects JSON-compact; blank
// stays "" so formatAuditLine can render "—".
export const renderAuditValue = (v) => {
  if (v === undefined || v === null) return "";
  if (Array.isArray(v)) return v.map(renderAuditValue).filter(Boolean).join(", ");
  if (typeof v === "object") {
    try {
      return JSON.stringify(v);
    } catch {
      return String(v);
    }
  }
  if (typeof v === "boolean") return v ? "yes" : "no";
  return String(v);
};

const sameValue = (a, b) => renderAuditValue(a) === renderAuditValue(b);

// Low-level row builder for the non-diff event types (note / conversion /
// override) and for callers that already know from→to. `fields` are the
// ProductActivity columns; occurred_at defaults to now.
export function makeProductAuditEvent({
  work_order_id = "",
  product_id = "",
  product_label = "",
  event_type,
  actor_type = "staff",
  actor_label = "",
  from_value = "",
  to_value = "",
  note = "",
  occurred_at = "",
  details = {},
} = {}) {
  const type = clean(event_type);
  if (!PRODUCT_AUDIT_EVENT_TYPES.includes(type)) return null;
  const actor = PRODUCT_AUDIT_ACTOR_TYPES.includes(clean(actor_type)) ? clean(actor_type) : "staff";
  return {
    schema_version: 1,
    work_order_id: clean(work_order_id),
    product_id: clean(product_id),
    product_label: clean(product_label),
    event_type: type,
    actor_type: actor,
    actor_label: clean(actor_label),
    from_value: renderAuditValue(from_value),
    to_value: renderAuditValue(to_value),
    note: clean(note),
    occurred_at: clean(occurred_at) || new Date().toISOString(),
    details: details && typeof details === "object" ? details : {},
  };
}

// Diff `patch` against the loaded `product` into typed audit rows — one event
// per changed audited field, in FIELD_RULES order (status first, then
// substatus/proof/dates/assignment/priority). `patch.note` (a plain string)
// appends a trailing `note` event so human context rides along with the diff.
//
// Returns an array of ProductActivity rows — [] when the patch touches no
// audited field or every value is unchanged. Unmapped patch keys are ignored
// by design: money/qty edits are not ops audit.
//
// opts: { actor, actorType, workOrderId, note, now }
//  - actor      → actor_label (name/email); "" stays blank
//  - actorType  → staff|customer|vendor|system (default staff)
//  - workOrderId → overrides product.work_order_id for rows built from a
//    bare product object that doesn't carry the parent link
//  - note       → appended to every emitted row's note AND produces the
//    patch.note event when patch itself is silent
//  - now        → ISO timestamp override (tests); default = creation time
export function buildProductAuditEvent(product, patch = {}, opts = {}) {
  const p = product && typeof product === "object" ? product : {};
  const delta = patch && typeof patch === "object" ? patch : {};
  const workOrderId = clean(opts.workOrderId) || clean(p.work_order_id);
  const productId = clean(p.id) || clean(p.product_id);
  const productLabel = clean(p.description) || clean(p.client_product_name) || clean(p.name);
  const base = {
    work_order_id: workOrderId,
    product_id: productId,
    product_label: productLabel,
    actor_type: opts.actorType || "staff",
    actor_label: opts.actor || "",
    occurred_at: opts.now || "",
  };

  const events = [];
  const changedKeys = [];
  for (const rule of FIELD_RULES) {
    if (!(rule.field in delta)) continue;
    if (sameValue(p[rule.field], delta[rule.field])) continue;
    changedKeys.push(rule.field);
    const evt = makeProductAuditEvent({
      ...base,
      event_type: rule.event_type,
      from_value: p[rule.field],
      to_value: delta[rule.field],
      note: opts.note || "",
      details: { field: rule.field, field_label: rule.label },
    });
    if (evt) events.push(evt);
  }

  // A patch can carry a human note without touching an audited field.
  const patchNote = typeof delta.note === "string" ? clean(delta.note) : "";
  if (patchNote || (opts.note && !events.length)) {
    const evt = makeProductAuditEvent({
      ...base,
      event_type: "note",
      note: patchNote || opts.note || "",
      details: { field: "note", patch_keys: changedKeys },
    });
    if (evt) events.push(evt);
  }
  return events;
}

// --- Display ---------------------------------------------------------------

const EVENT_TYPE_LABEL = {
  status_change: "Status",
  substatus_change: "Substatus",
  proof_event: "Proof",
  due_date_change: "Due date",
  assignment_change: "Assignment",
  priority_change: "Priority",
  note: "Note",
  conversion: "Conversion",
  override: "Override",
};

// "2026-11-02T07:19:35.000Z" → "2026-11-02 07:19" (UTC slice — deterministic
// across machines so tests and CSV exports agree).
const whenLabel = (iso) => {
  const s = clean(iso);
  return s.length >= 16 ? `${s.slice(0, 10)} ${s.slice(11, 16)}` : s || "—";
};

const arrow = (from, to) => {
  const f = clean(from);
  const t = clean(to);
  if (f && t) return `${f} → ${t}`;
  if (t) return `set to ${t}`;
  if (f) return `cleared ${f}`;
  return "";
};

// One chronological history line:
//   "2026-11-02 07:19 · Brett H (staff) — Status: order_review → in_production"
// Falls back through actor_label → actor_type, and note → field label, so
// partial rows still render.
export function formatAuditLine(evt = {}) {
  const type = clean(evt.event_type);
  const fieldLabel =
    clean(evt?.details?.field_label) ||
    FIELD_BY_NAME[clean(evt?.details?.field)]?.label ||
    EVENT_TYPE_LABEL[type] ||
    "Change";
  const move = arrow(evt.from_value, evt.to_value);
  const note = clean(evt.note);
  const actor = clean(evt.actor_label) || clean(evt.actor_type) || "system";
  const actorType = clean(evt.actor_type);

  let phrase;
  if (type === "note") {
    phrase = `Note: ${note || "—"}`;
  } else if (type === "conversion") {
    phrase = `Converted${move ? ` ${move}` : ""}${note ? ` — ${note}` : ""}`;
  } else if (type === "override") {
    phrase = `Override${move ? `: ${move}` : ""}${note ? ` — ${note}` : ""}`;
  } else {
    phrase = `${fieldLabel}${move ? `: ${move}` : ""}${note ? ` — ${note}` : ""}`;
  }
  const actorSuffix = actorType && actorType !== clean(evt.actor_label) ? ` (${actorType})` : "";
  return `${whenLabel(evt.occurred_at)} · ${actor}${actorSuffix} — ${phrase}`;
}

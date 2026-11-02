// Status-override required-reason model (B-11).
//
// GlobalSettings.statusOverrideReasons[] (entity field `status_override_reasons`)
// configures the labels staff must pick from when a manual override fires —
// cancel-estimate reasons, forced status moves, deadline pushes. When the
// configured list applies to the override type, the dialog cannot submit
// without a reason, and the chosen reason lands in the product audit trail
// (B-12 `override` event) and order-history feed.
//
// Pure and IO-free — esbuild-bundled + unit-tested under Node by
// scripts/test-notes-override.mjs. Emits ProductActivity rows via
// productAuditModel.makeProductAuditEvent so the shape never drifts from the
// B-12 contract (event_type 'override' is already in the entity enum).

import { makeProductAuditEvent } from "./productAuditModel.js";

const clean = (v) => String(v ?? "").trim();
const norm = (v) => clean(v).toLowerCase().replace(/[\s-]+/g, "_");

// Stable error codes returned by validateOverride — UI maps them through
// OVERRIDE_ERROR_MESSAGES for display.
export const OVERRIDE_ERROR_CODES = [
  "reason_required",      // configured reasons apply and none was picked
  "reason_not_in_list",   // picked label isn't one of the applicable configured reasons
  "custom_text_required", // picked reason carries requires_text (e.g. "Other")
];

export const OVERRIDE_ERROR_MESSAGES = {
  reason_required: "Pick a reason for this override.",
  reason_not_in_list: "Pick one of the configured override reasons.",
  custom_text_required: "Type the reason detail — this choice requires an explanation.",
};

// Read the raw configured list from a settings object. The entity field is
// snake_case (`status_override_reasons`); the setting_value payload the admin
// screen edits is camelCase (`statusOverrideReasons`) — accept both so a
// writer either way still validates.
function rawReasonList(settings) {
  const s = settings && typeof settings === "object" ? settings : {};
  const list = s.statusOverrideReasons ?? s.status_override_reasons;
  return Array.isArray(list) ? list : [];
}

// Normalize applies_to to a string array. Entity declares it as a single
// string; tolerate arrays too so future multi-type rows don't break. An empty
// result means "applies to every override type".
function normalizeAppliesTo(raw) {
  const list = Array.isArray(raw) ? raw : [raw];
  return list.map(norm).filter((s) => s && s !== "all" && s !== "*");
}

// Normalize one configured reason. Accepts the stored object or a bare string
// label. Returns null for entries with no usable label.
export function normalizeOverrideReason(raw) {
  if (raw === null || raw === undefined) return null;
  const src = typeof raw === "string" ? { label: raw } : raw;
  if (typeof src !== "object") return null;
  const label = clean(src.label ?? src.name ?? src.reason);
  if (!label) return null;
  const status = norm(src.status) || "active";
  return {
    label,
    applies_to: normalizeAppliesTo(src.applies_to),
    requires_text: src.requires_text === true || norm(src.requires_text) === "true",
    sort: Number.isFinite(Number(src.sort)) ? Number(src.sort) : 0,
    status,
  };
}

// The full normalized configured list, sorted by `sort` then label. Includes
// non-active rows (status surfaced so the admin UI can render them disabled);
// validation/visibility logic uses activeReasons().
export function overrideReasons(settings) {
  return rawReasonList(settings)
    .map(normalizeOverrideReason)
    .filter(Boolean)
    .sort((a, b) => a.sort - b.sort || a.label.localeCompare(b.label));
}

// Active, normalized reasons — 'active' or unset status only; archived /
// disabled entries are inert and cannot satisfy a required reason.
export function activeReasons(settings) {
  return overrideReasons(settings).filter((r) => r.status === "active");
}

// Reasons applicable to one override type: applies_to unset/empty means the
// reason applies to every override; otherwise the normalized overrideType must
// be listed (case/separator-insensitive).
export function applicableReasons(settings, overrideType) {
  const t = norm(overrideType);
  return activeReasons(settings).filter(
    (r) => !r.applies_to.length || r.applies_to.includes(t),
  );
}

// Is a reason required for this override? True only when at least one ACTIVE
// configured reason applies to the override type — an empty configured list
// (or a list whose reasons all exclude this type) leaves the reason optional.
export function requiresReason(settings, overrideType) {
  return applicableReasons(settings, overrideType).length > 0;
}

// "Other" always demands elaboration, even if an admin forgot requires_text.
const isOtherLabel = (label) => norm(label) === "other";

// Validate the dialog submit: {reason, customText} against the configured list.
//   { ok: true,  error: "" }                  — allowed
//   { ok: false, error: <OVERRIDE_ERROR_CODES> }
//
// Semantics:
//  - no applicable configured reasons → reason optional; any provided text ok
//  - applicable reasons exist → reason must match an applicable label
//    (fail-closed: a free-typed bogus label can't bypass the list)
//  - matched reason requires_text OR label is "Other" → customText non-empty
export function validateOverride({ reason, customText } = {}, settings, overrideType) {
  const applicable = applicableReasons(settings, overrideType);
  const label = clean(typeof reason === "object" && reason !== null ? reason.label : reason);
  const text = clean(customText ?? (typeof reason === "object" && reason !== null ? reason.customText : ""));

  if (!applicable.length) return { ok: true, error: "" };

  const matched = applicable.find((r) => norm(r.label) === norm(label));
  if (!label) return { ok: false, error: "reason_required" };
  if (!matched) return { ok: false, error: "reason_not_in_list" };
  if ((matched.requires_text || isOtherLabel(matched.label)) && !text) {
    return { ok: false, error: "custom_text_required" };
  }
  return { ok: true, error: "" };
}

// Build the ProductActivity `override` row for an applied override (B-12
// shape). `override` describes what was forced:
//   { type, field, from, to, work_order_id, product_id, product_label }
// `reason` is the validated pick: {label, customText} or a bare label string.
// `actor` = display name/email; `actorType` = staff|customer|vendor|system.
// `now` pins occurred_at for tests/retry-safe writers.
//
// The row's `note` carries the reason — "Liability waiver — customer signed
// at counter" — so the history line reads complete without opening details.
// Returns the event row, or null only if makeProductAuditEvent rejects it
// (cannot happen for event_type 'override').
export function auditPayload({ override = {}, reason = {}, actor = "", actorType = "staff", workOrderId = "", productId = "", productLabel = "", now = "" } = {}) {
  const ov = override && typeof override === "object" ? override : {};
  const r = typeof reason === "string" ? { label: reason }
    : reason && typeof reason === "object" ? reason : {};
  const reasonLabel = clean(r.label ?? r.reason);
  const customText = clean(r.customText ?? r.custom_text ?? r.text);

  return makeProductAuditEvent({
    work_order_id: workOrderId || ov.work_order_id,
    product_id: productId || ov.product_id,
    product_label: productLabel || ov.product_label,
    event_type: "override",
    actor_type: actorType,
    actor_label: actor,
    from_value: ov.from ?? ov.from_value ?? "",
    to_value: ov.to ?? ov.to_value ?? "",
    note: [reasonLabel, customText].filter(Boolean).join(" — "),
    occurred_at: now,
    details: {
      field: clean(ov.field) || "operational_status",
      field_label: "Override",
      override_type: norm(ov.type ?? ov.override_type) || "status",
      reason_label: reasonLabel,
      custom_text: customText,
    },
  });
}

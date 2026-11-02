// Due-date engine — pure TS, zero entity/io imports. Safe to import from Deno
// functions (base44/functions/*) and from frontend modules.
//
// Model (CoreBridge parity, see ESTIMATOR_MASTERPLAN B-07 / A-03 / A-21):
//   - Every part carries per-kind lead days: `design_lead_days` /
//     `product_lead_days` (flat A-03 fields), optionally refined by tier fields
//     `<kind>_min_days` / `<kind>_std_days` / `<kind>_add_days`.
//   - A part's resolved lead = standard unless min/max tier bounds are given:
//       floor   = <kind>_min_days                     (when finite)
//       std     = <kind>_std_days  ?? <kind>_lead_days (flat fallback)
//       ceiling = std + <kind>_add_days               ("additional" is additive)
//     The requested tier picks inside those bounds; every pick is clamped to
//     [floor, ceiling] (explicit numeric tiers clamp to floor only).
//   - product due  = anchor + max(resolved product leads across parts)
//     design due   = anchor + max(resolved design leads across parts)
//     order due    = max(due dates across products)
//   - "Recalculate Product Due Date upon Proof Approval" (deadlineRules
//     .recalc_on_proof_approval): recalcOnProofApproval clamps forward-only —
//     the computed candidate may push a due date later but never pulls it
//     earlier — and a product flagged hard_due_date is never moved when
//     respect_hard_dates is on (deadlineRules.respect_hard_dates).
//   - Two clocks (GlobalSettings.hoursOfOperation, modeled here — the engine
//     never reads settings): `clock` drives production deadline math,
//     `design_clock` drives design/sales-center math and defaults to `clock`.
//     A clock is { business_days?: (0-6 weekday indexes|names)[] | null,
//     holidays?: "YYYY-MM-DD"[] }. No clock / no business_days = calendar days.
//     `clockFromHours` adapts hoursOfOperation-style entries into a clock.
//   - B-08: `isHardDue` / `assertDueDateMutable` (end of file) are the standalone
//     form of the hard-date rule for writers staging a due-date write outside
//     the computes: a hard date is locked BOTH directions — a recalc that
//     would move it is a no-op; flagging a manual override is the caller's job.
//
// Dates: stored convention is date-only "YYYY-MM-DD" (local day). Inputs may be
// date-only or full ISO; outputs are always "YYYY-MM-DD" and day-granularity
// comparisons are string comparisons on that form.
//
// Every compute returns the same envelope:
//   { due_date, prior_due_date, computed_due_date, pushed, changed,
//     held_by_hard_date, trace[] }
// pushed = final > prior (false when there was no prior — that is `changed`).
// trace[] is a serializable audit list (anchor, per-part resolution, max pick,
// clock note, hold/clamp) intended for diagnostics and status_history notes.

export const LEAD_TIERS = ["standard", "minimum", "additional"];
export const LEAD_KINDS = ["design", "product"];

// Names accepted for the two settings clocks (GlobalSettings.hoursOfOperation
// sales_center_hours vs production_hours). The engine does not fetch them —
// callers pick which clock feeds which computation.
export const DUE_DATE_CLOCKS = { PRODUCTION: "production", SALES_CENTER: "sales_center" };

const DAY_NAMES: Record<string, number> = {
  sun: 0, sunday: 0,
  mon: 1, monday: 1,
  tue: 2, tues: 2, tuesday: 2,
  wed: 3, wednesday: 3,
  thu: 4, thur: 4, thurs: 4, thursday: 4,
  fri: 5, friday: 5,
  sat: 6, saturday: 6,
};

const finite = (value: unknown): number | undefined => {
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
};

const nonNeg = (value: unknown): number | undefined => {
  const n = finite(value);
  return n === undefined ? undefined : Math.max(0, n);
};

const pad2 = (n: number) => String(n).padStart(2, "0");

// "YYYY-MM-DD" → local midnight (repo convention — bare new Date(str) would be
// UTC). Anything else parses via Date; invalid → null.
export function toLocalDate(value: any): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : new Date(value.getTime());
  if (typeof value === "number" && Number.isFinite(value)) return new Date(value);
  const v = String(value ?? "").trim();
  if (!v) return null;
  const d = /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T00:00:00`) : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function toDateOnly(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

// Normalize any parseable date input to "YYYY-MM-DD"; "" when it does not parse.
export function parseDateOnly(value: any): string {
  const d = toLocalDate(value);
  return d ? toDateOnly(d) : "";
}

const dayIndex = (value: any): number | undefined => {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 6) return value;
  const key = String(value ?? "").trim().toLowerCase();
  return DAY_NAMES[key];
};

// Normalized open-day set + holiday set for a clock. Returns null when the
// clock imposes no day restriction (pure calendar-day math).
function openDaySet(clock: any): { days: Set<number>; holidays: Set<string> } | null {
  if (!clock || typeof clock !== "object") return null;
  const rawDays = clock.business_days ?? clock.businessDays ?? clock.days_of_week ?? null;
  const days = new Set<number>();
  let restricted = false;
  if (Array.isArray(rawDays)) {
    for (const entry of rawDays) {
      const idx = dayIndex(entry);
      if (idx !== undefined) days.add(idx);
    }
    // An explicitly empty list is ambiguous (a shop that is never open makes
    // the engine uncomputable) — treat it as "no restriction", not "closed".
    if (rawDays.length && days.size) restricted = true;
  }
  const holidays = new Set<string>();
  for (const h of Array.isArray(clock.holidays) ? clock.holidays : []) {
    const d = parseDateOnly(h);
    if (d) holidays.add(d);
  }
  if (!restricted && !holidays.size) return null;
  if (!restricted) for (let i = 0; i < 7; i += 1) days.add(i); // holidays only → every weekday open
  return { days, holidays };
}

// Adapt hoursOfOperation-style entries ({day|days|day_of_week|days_of_week|
// weekday|weekdays: 0-6 index or name, open/close windows, closed:true}) into a
// DueDateClock. Numbers are 0=Sun..6=Sat only — use names for anything else.
// Entries flagged closed/off contribute nothing; {date|holiday} entries feed
// the holiday list. Empty result → calendar days (business_days: null).
export function clockFromHours(entries: any[] = [], name = "") {
  const days = new Set<number>();
  const holidays = new Set<string>();
  for (const entry of Array.isArray(entries) ? entries : []) {
    if (!entry || typeof entry !== "object") {
      const idx = dayIndex(entry);
      if (idx !== undefined) days.add(idx);
      continue;
    }
    const holiday = parseDateOnly(entry.date ?? entry.holiday ?? "");
    if (holiday) holidays.add(holiday);
    if (entry.closed === true || entry.off === true || entry.open === false) continue;
    for (const key of ["day", "days", "day_of_week", "days_of_week", "weekday", "weekdays"]) {
      const value = entry[key];
      for (const item of Array.isArray(value) ? value : [value]) {
        const idx = dayIndex(item);
        if (idx !== undefined) days.add(idx);
      }
    }
  }
  return { name: String(name || ""), business_days: days.size ? [...days].sort() : null, holidays: [...holidays] };
}

const isOpenDay = (d: Date, open: { days: Set<number>; holidays: Set<string> }) =>
  open.days.has(d.getDay()) && !open.holidays.has(toDateOnly(d));

// anchor + N days. Calendar mode: plain day add (matches the legacy
// recalculateProductDueDateOnProofApproval). Business mode: count only open
// days, starting the day AFTER the anchor (Mon+3 on a Mon–Fri clock → Thu;
// Fri+1 → Mon). N=0 returns the anchor unchanged even when it is a closed day.
export function addLeadDays(anchor: Date, days: number, clock: any = null, trace: any[] | null = null, field = ""): Date {
  const open = openDaySet(clock);
  const out = new Date(anchor.getTime());
  const n = Math.max(0, Math.round(Number(days) || 0));
  if (!open) {
    out.setDate(out.getDate() + n);
    if (trace) trace.push({ kind: "clock", field, mode: "calendar", days: n });
    return out;
  }
  let remaining = n;
  while (remaining > 0) {
    out.setDate(out.getDate() + 1);
    if (isOpenDay(out, open)) remaining -= 1;
  }
  if (trace) {
    trace.push({
      kind: "clock",
      field,
      mode: "business",
      days: n,
      business_days: [...open.days].sort(),
      holidays: [...open.holidays].sort(),
    });
  }
  return out;
}

// Resolve a part's lead days for kind ("design"|"product") under a tier.
// Standard = <kind>_std_days falling back to flat <kind>_lead_days. "minimum"
// picks <kind>_min_days (fallback std). "additional" = std + <kind>_add_days.
// Every pick clamps to [min, std+add] when those bounds are finite; an explicit
// numeric tier clamps to the floor only so deliberate overrides still apply.
export function resolvePartLead(part: any, kind: string = "product", tier: any = "standard") {
  const k = kind === "design" ? "design" : "product";
  const flat = nonNeg(part?.[`${k}_lead_days`]);
  const min = nonNeg(part?.[`${k}_min_days`]);
  const stdField = nonNeg(part?.[`${k}_std_days`]);
  const add = nonNeg(part?.[`${k}_add_days`]);
  const std = stdField ?? flat ?? 0;
  const floor = min ?? 0;
  const ceiling = std + (add ?? 0);

  let pick: number;
  let source: string;
  const numericTier = typeof tier === "number" ? tier : finite(tier);
  const name = String(tier ?? "standard").trim().toLowerCase();
  if (numericTier !== undefined && !LEAD_TIERS.includes(name) && name !== "") {
    pick = numericTier;
    source = "tier";
  } else if (name === "minimum" || name === "min") {
    pick = min ?? std;
    source = min !== undefined ? "min" : stdField !== undefined ? "std" : flat !== undefined ? "flat" : "zero";
  } else if (name === "additional" || name === "add" || name === "max" || name === "maximum" || name === "extended") {
    pick = ceiling;
    source = add !== undefined ? "add" : stdField !== undefined ? "std" : flat !== undefined ? "flat" : "zero";
  } else {
    pick = std;
    source = stdField !== undefined ? "std" : flat !== undefined ? "flat" : "zero";
  }

  // The floor always wins: a part can't promise less than its minimum, so a
  // degenerate ceiling below the floor is lifted to the floor first.
  const effectiveCeiling = Math.max(ceiling, floor);
  const bounded = numericTier !== undefined && !LEAD_TIERS.includes(name) && name !== ""
    ? Math.max(floor, pick)                            // explicit override: floor only
    : Math.min(effectiveCeiling, Math.max(floor, pick)); // tier pick: inside [min, std+add]
  return {
    days: Math.round(bounded),
    min_days: min,
    std_days: std,
    add_days: add,
    flat_days: flat,
    floor,
    ceiling,
    source,
  };
}

const holdResult = (existingProduct: string, existingDesign: string, trace: any[]) => ({
  due_date: existingProduct,
  design_due_date: existingDesign,
  prior_due_date: existingProduct,
  computed_due_date: "",
  anchor_date: "",
  max_product_lead_days: 0,
  max_design_lead_days: 0,
  pushed: false,
  changed: false,
  held_by_hard_date: true,
  trace: [...trace, { kind: "hard_date", held: true, due_date: existingProduct }],
});

const clampForward = (candidate: string, existing: string, enabled: boolean, field: string, trace: any[]) => {
  if (!enabled || !existing || !candidate || candidate >= existing) return candidate;
  trace.push({ kind: "clamp", field, from: candidate, to: existing, reason: "push_forward_only" });
  return existing;
};

// product_due = anchor + max(part product leads); design_due = anchor +
// max(part design leads). `clock` is the production clock; `design_clock`
// (sales-center) defaults to it. hard_due_date + respect_hard_dates holds the
// existing dates untouched. push_forward_only clamps candidates at-or-after
// the existing dates (the proof-approval rule — off by default here, on in
// recalcOnProofApproval).
export function computeProductDueDate({
  parts = [],
  anchor_date,
  hard_due_date = false,
  product_due_date = "",
  design_due_date = "",
  clock = null,
  design_clock = null,
  tier = "standard",
  respect_hard_dates = true,
  push_forward_only = false,
  label = "",
}: any = {}) {
  const trace: any[] = label ? [{ kind: "trigger", label }] : [];
  const hard = hard_due_date === true;
  const respect = respect_hard_dates !== false;
  const existingProduct = parseDateOnly(product_due_date);
  const existingDesign = parseDateOnly(design_due_date);

  // A hard-due product with a date never moves.
  if (hard && respect && existingProduct) {
    return holdResult(existingProduct, existingDesign, trace);
  }

  const anchorInput = anchor_date ?? new Date();
  const anchor = toLocalDate(anchorInput);
  const anchorStr = anchor ? toDateOnly(anchor) : "";
  trace.push({ kind: "anchor", date: anchorStr, input: String(anchorInput ?? "") });
  if (!anchor) {
    trace.push({ kind: "error", reason: "anchor_unparseable" });
    return {
      due_date: existingProduct,
      design_due_date: existingDesign,
      prior_due_date: existingProduct,
      computed_due_date: "",
      anchor_date: "",
      max_product_lead_days: 0,
      max_design_lead_days: 0,
      pushed: false,
      changed: false,
      held_by_hard_date: false,
      trace,
    };
  }

  const partList = (Array.isArray(parts) ? parts : []).filter((p) => p && typeof p === "object");
  if (!partList.length) {
    trace.push({ kind: "note", reason: "no_parts" });
    return {
      due_date: existingProduct,
      design_due_date: existingDesign,
      prior_due_date: existingProduct,
      computed_due_date: "",
      anchor_date: anchorStr,
      max_product_lead_days: 0,
      max_design_lead_days: 0,
      pushed: false,
      changed: false,
      held_by_hard_date: false,
      trace,
    };
  }

  let maxProduct = 0;
  let maxDesign = 0;
  let productOwner: any = null;
  let designOwner: any = null;
  partList.forEach((part: any, index: number) => {
    const design = resolvePartLead(part, "design", tier);
    const product = resolvePartLead(part, "product", tier);
    trace.push({
      kind: "part",
      index,
      part_id: String(part?.id ?? part?.part_id ?? part?.builder_part_id ?? ""),
      name: String(part?.name ?? part?.part_name ?? part?.description ?? ""),
      design_days: design.days,
      product_days: product.days,
      design_source: design.source,
      product_source: product.source,
      design_bounds: [design.floor, design.ceiling],
      product_bounds: [product.floor, product.ceiling],
    });
    if (product.days >= maxProduct) { maxProduct = product.days; productOwner = { index, part_id: String(part?.id ?? part?.part_id ?? "") }; }
    if (design.days >= maxDesign) { maxDesign = design.days; designOwner = { index, part_id: String(part?.id ?? part?.part_id ?? "") }; }
  });
  trace.push({ kind: "max", field: "product_due_date", days: maxProduct, ...productOwner });
  trace.push({ kind: "max", field: "design_due_date", days: maxDesign, ...designOwner });

  const productionClock = clock ?? null;
  const salesClock = design_clock ?? productionClock;
  const prodCandidate = toDateOnly(addLeadDays(anchor, maxProduct, productionClock, trace, "product_due_date"));
  const designCandidate = toDateOnly(addLeadDays(anchor, maxDesign, salesClock, trace, "design_due_date"));

  const finalProduct = clampForward(prodCandidate, existingProduct, push_forward_only !== false, "product_due_date", trace);
  const finalDesign = clampForward(designCandidate, existingDesign, push_forward_only !== false, "design_due_date", trace);
  if (hard && !respect) trace.push({ kind: "hard_date", held: false, reason: "respect_hard_dates_off" });

  return {
    due_date: finalProduct,
    design_due_date: finalDesign,
    prior_due_date: existingProduct,
    computed_due_date: prodCandidate,
    anchor_date: anchorStr,
    max_product_lead_days: maxProduct,
    max_design_lead_days: maxDesign,
    pushed: Boolean(existingProduct) && finalProduct > existingProduct,
    changed: finalProduct !== existingProduct,
    held_by_hard_date: false,
    trace,
  };
}

// order_due = max(due dates across products). Entries may be raw WorkOrder
// products[] rows (product_due_date) or computeProductDueDate results
// (due_date). `date_field` forces a specific field. Blanks/unparseables are
// skipped; order-level hard_due_date + respect_hard_dates holds the existing
// order date.
export function computeOrderDueDate({
  products = [],
  existing_due_date = "",
  hard_due_date = false,
  date_field = "",
  respect_hard_dates = true,
  push_forward_only = false,
  label = "",
}: any = {}) {
  const trace: any[] = label ? [{ kind: "trigger", label }] : [];
  const hard = hard_due_date === true;
  const respect = respect_hard_dates !== false;
  const existing = parseDateOnly(existing_due_date);

  if (hard && respect && existing) {
    return holdResult(existing, "", trace);
  }

  const list = (Array.isArray(products) ? products : []).filter((p) => p && typeof p === "object");
  let best = "";
  let bestIndex = -1;
  let bestId = "";
  list.forEach((product: any, index: number) => {
    const raw = date_field
      ? product?.[date_field]
      : product?.due_date || product?.product_due_date;
    const d = parseDateOnly(raw);
    trace.push({
      kind: "product",
      index,
      product_id: String(product?.id ?? product?.product_id ?? ""),
      due_date: d,
      skipped: !d,
    });
    if (d && (!best || d > best)) {
      best = d;
      bestIndex = index;
      bestId = String(product?.id ?? product?.product_id ?? "");
    }
  });
  trace.push({ kind: "max", field: "due_date", due_date: best, index: bestIndex, product_id: bestId });

  if (!best) {
    return {
      due_date: existing,
      design_due_date: "",
      prior_due_date: existing,
      computed_due_date: "",
      binding_product_id: "",
      binding_index: -1,
      pushed: false,
      changed: false,
      held_by_hard_date: false,
      trace,
    };
  }

  const final = clampForward(best, existing, push_forward_only !== false, "due_date", trace);
  return {
    due_date: final,
    design_due_date: "",
    prior_due_date: existing,
    computed_due_date: best,
    binding_product_id: bestId,
    binding_index: bestIndex,
    pushed: Boolean(existing) && final > existing,
    changed: final !== existing,
    held_by_hard_date: false,
    trace,
  };
}

// "Recalculate Product Due Date upon Proof Approval" (deadlineRules
// .recalc_on_proof_approval): compute from part leads anchored on the approval
// date, respect hard_due_date, and only push forward — a computed candidate
// earlier than the stored date is clamped to the stored date.
// `parts` defaults to product.parts / part_list / builder_parts when not given.
export function recalcOnProofApproval({
  product = {},
  approval_date,
  parts,
  clock = null,
  design_clock = null,
  tier = "standard",
  respect_hard_dates = true,
  push_forward_only = true,
}: any = {}) {
  const partList = parts !== undefined
    ? parts
    : product?.parts ?? product?.part_list ?? product?.builder_parts ?? [];
  return computeProductDueDate({
    parts: partList,
    anchor_date: approval_date ?? new Date(),
    hard_due_date: product?.hard_due_date === true,
    product_due_date: product?.product_due_date,
    design_due_date: product?.design_due_date,
    clock,
    design_clock,
    tier,
    respect_hard_dates,
    push_forward_only,
    label: "proof_approval",
  });
}

// ---------------------------------------------------------------------------
// B-08 hard-due-date guard — explicit named exports for writers.
//
// The computes already honor hard_due_date internally: with respect_hard_dates
// on (the default) a hard product carrying a stored date is held in place
// (held_by_hard_date: true — see computeProductDueDate, computeOrderDueDate,
// and holdResult above). isHardDue + assertDueDateMutable expose that same rule
// as a standalone check for call sites that stage a due-date write outside the
// computes (server actions, importers, manual patch builders) so they can ask
// "may this write land?" before applying it.
//
// assertDueDateMutable(product, new_date, { actor_type }) semantics:
//   - Soft product (hard_due_date !== true) → always ok; dates may move either
//     direction.
//   - Hard product + new_date equal to the stored date (incl. both blank) →
//     ok: a recalc that doesn't move the date is a no-op.
//   - Hard product + new_date different — EARLIER OR LATER; a hard date is
//     locked both directions, and a blank/unparseable new_date against a
//     stored date counts as clearing it (fail closed) — the actor decides:
//       * manual actor (DUE_DATE_MANUAL_ACTORS — a human deliberately editing
//         the date) → ok:true with manual_override:true + a warning. The guard
//         allows the move; FLAGGING it (status_history note, ProductActivity
//         override row, confirmation dialog) is the caller's job.
//       * any other actor — "recalc", "auto", "system", "proof_approval",
//         "sync", every unknown value, and a missing actor_type (defaults to
//         "recalc"; fail closed) → ok:false + error + held_by_hard_date:true.
//         The write must be skipped or re-issued as a manual override.
//
// The existing date is read from product_due_date (products[] convention) with
// due_date as a fallback so computeProductDueDate result objects can be passed
// straight back in. Composes with the computes: feeding recalcOnProofApproval's
// held result back through the guard yields a same-date no-op ok.
export const DUE_DATE_MANUAL_ACTORS = [
  "manual",
  "manual_override",
  "override",
  "user",
  "staff",
  "admin",
];

export function isHardDue(product: any): boolean {
  return product?.hard_due_date === true;
}

export function assertDueDateMutable(product: any, new_date: any, { actor_type = "recalc" }: any = {}) {
  const actor = String(actor_type ?? "recalc").trim().toLowerCase() || "recalc";
  const manual = DUE_DATE_MANUAL_ACTORS.includes(actor);
  const existing = parseDateOnly(product?.product_due_date ?? product?.due_date);
  const requested = parseDateOnly(new_date);
  const moves = requested !== existing;
  const base = {
    actor_type: actor,
    is_hard: isHardDue(product),
    existing_due_date: existing,
    requested_due_date: requested,
    moves_date: moves,
    held_by_hard_date: false,
    manual_override: false,
    warning: "",
  };
  if (!base.is_hard) {
    return { ...base, ok: true, error: "" };
  }
  if (!moves) {
    // Same-date (or both-blank) no-op — the hard date is untouched.
    return { ...base, ok: true, error: "" };
  }
  if (manual) {
    return {
      ...base,
      ok: true,
      error: "",
      manual_override: true,
      warning: "Hard due date moved by manual override — flag this change for audit.",
    };
  }
  return {
    ...base,
    ok: false,
    error: "Hard due date is locked — automatic recalculation will not move it. Re-issue as a manual override to change it.",
    held_by_hard_date: true,
  };
}

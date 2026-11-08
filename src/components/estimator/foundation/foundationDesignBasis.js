// O-104 (CMP-I03) + O-105 (CMP-I04) — pure write-shaping for the
// FoundationProject `design_basis` and `site_hazard` blocks.
//
// No React, no entity access: given the current block and an authored field
// patch, return the next block with provenance stamped — or a rejection. The
// FoundationDesignBasisPanel writes ONLY through these functions so a project
// basis is never minted, defaulted, or silently changed:
//
//   * Nothing is auto-filled. Absent stays absent; "" clears to absent
//     (explicit-empty vs authored), except latitude/longitude which the
//     schema declares nullable and which clear to an explicit null.
//   * An authored write stamps provenance — basis_source / entry_method
//     'manual' unless an official-report transcription is explicitly
//     selected this write; 'api' is a reserved enum value this writer can
//     never produce.
//   * basis_captured_at records the FIRST capture and is never rewritten;
//     basis_updated_at / input_timestamp move on every authored change, so a
//     basis never changes without a recorded when.
//   * A post-capture change to code_edition preserves the superseded value
//     in code_edition_prior — the trail that keeps an edition switch
//     visible instead of silent. Callers should commit edition changes at
//     whole-value granularity (blur/enter), not per keystroke, so the
//     prior is the true superseded edition.
//   * basis_locked gates all basis edits: writes touching content (or
//     unlocking itself) return { rejected: "basis_locked" } until the
//     caller passes confirmed:true — the recorded re-capture intent.

export const DESIGN_BASIS_VERSION = 1;
export const SITE_HAZARD_VERSION = 1;

export const BASIS_SOURCES = ["manual", "official_report", "api"];
export const ENTRY_METHODS = ["manual", "official_report", "api"];
// 'api' is reserved for a future automation writer — surfaces must not
// offer it; sanitize re-marks it 'manual' with an issue if one arrives.
export const WRITABLE_SOURCES = ["manual", "official_report"];

export const HAZARD_UNITS = ["imperial", "metric"];
export const RISK_CATEGORIES = ["I", "II", "III", "IV"];
export const EXPOSURE_CATEGORIES = ["B", "C", "D"];

const isRecord = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const isoNow = (now) =>
  typeof now === "string" && Number.isFinite(Date.parse(now)) ? now : new Date().toISOString();

// Content keys an authored write may replace/clear. A field present in
// `fields` replaces; "" / null removes the key (explicit-empty, never a
// fabricated value); absent keys keep current values.
const BASIS_TEXT_KEYS = ["code_edition", "jurisdiction", "basis_notes"];
const BASIS_CONTENT_KEYS = [...BASIS_TEXT_KEYS, "code_edition_prior", "basis_source"];

const mergeTextFields = (cur, fields, keys) => {
  const next = { ...cur };
  for (const k of keys) {
    if (!(k in fields)) continue;
    const v = fields[k];
    if (v === "" || v === undefined || v === null) delete next[k];
    else next[k] = v;
  }
  return next;
};

// A block "has content" when something substantive is recorded — the audit
// timestamps alone do not make an empty block a captured basis.
const hasBasisContent = (b) =>
  isRecord(b) &&
  [b.code_edition, b.jurisdiction, b.basis_notes].some(
    (v) => typeof v === "string" && v.trim() !== ""
  );

// Substance for provenance marking: any key outside the pure audit set.
// Without this, an all-empty write on an absent block would mint a
// source-only shell (a fabricated record of an entry that never happened).
const BASIS_AUDIT_KEYS = ["version", "basis_captured_at", "basis_updated_at", "basis_source"];
const HAZARD_AUDIT_KEYS = ["version", "input_timestamp", "entry_method"];
const hasSubstance = (o, auditKeys) =>
  isRecord(o) && Object.keys(o).some((k) => !auditKeys.includes(k));

const stableSans = (obj, omitKeys) => {
  const out = {};
  for (const k of Object.keys(obj || {}).sort()) {
    if (omitKeys.includes(k)) continue;
    out[k] = obj[k];
  }
  return JSON.stringify(out);
};

/**
 * Shape a design_basis write.
 * @param {object} current   currently stored block (may be absent/malformed)
 * @param {object} fields    authored patch (see BASIS_* key lists above)
 * @param {string} now       ISO timestamp to stamp (defaults to current time)
 * @param {boolean} confirmed  caller has collected the re-capture intent for
 *                           a locked basis
 * @returns {{ next: object|undefined, changed: boolean, issues: object[], rejected?: string }}
 *   `next === undefined` means the block should store null/absent
 *   (explicit clear), never a fabricated empty record.
 */
export function sanitizeDesignBasisWrite(current, fields = {}, { now, confirmed = false } = {}) {
  const cur = isRecord(current) ? current : {};
  const issues = [];
  const touchesContent = BASIS_CONTENT_KEYS.some((k) => k in fields);
  const touchesLock = "basis_locked" in fields;

  if (
    cur.basis_locked === true &&
    confirmed !== true &&
    (touchesContent || fields.basis_locked === false)
  ) {
    return {
      rejected: "basis_locked",
      next: cur,
      changed: false,
      issues: [
        {
          code: "basis_locked",
          field: "basis_locked",
          message:
            "Design basis is locked; confirm the re-capture before editing it.",
        },
      ],
    };
  }

  const next = mergeTextFields(cur, fields, BASIS_TEXT_KEYS);

  // Edition-change trail: a post-capture write that changes a recorded
  // edition preserves the superseded value — including clearing it (a
  // cleared edition is a change, not a silent absence). An explicit
  // code_edition_prior in the patch wins (future migration/restore paths).
  if (
    "code_edition" in fields &&
    typeof cur.code_edition === "string" &&
    cur.code_edition !== "" &&
    fields.code_edition !== cur.code_edition
  ) {
    next.code_edition_prior = cur.code_edition;
  } else if ("code_edition_prior" in fields) {
    if (fields.code_edition_prior === "" || fields.code_edition_prior === null)
      delete next.code_edition_prior;
    else next.code_edition_prior = fields.code_edition_prior;
  }

  // Provenance: an authored content edit re-marks the block 'manual' — a
  // hand-edited basis may not keep claiming a report/API provenance. An
  // explicit official_report in the patch is honored (transcription is an
  // authored choice); 'api' can never be produced here.
  if ("basis_source" in fields) {
    if (fields.basis_source === "api") {
      issues.push({
        code: "basis_source_reserved",
        field: "basis_source",
        message:
          "'api' provenance is reserved for a future automation writer; recorded 'manual'.",
      });
      next.basis_source = "manual";
    } else if (WRITABLE_SOURCES.includes(fields.basis_source)) {
      next.basis_source = fields.basis_source;
    } else {
      next.basis_source = "manual";
    }
  } else if (touchesContent && (hasSubstance(next, BASIS_AUDIT_KEYS) || hasSubstance(cur, BASIS_AUDIT_KEYS))) {
    // Only when the write actually has substance — either the resulting
    // block records something or a content-bearing block is being edited/
    // cleared (clearing is an authored change, never a silent absence).
    next.basis_source = "manual";
  }

  // Lock handling: the authored value is kept verbatim, but a block with no
  // basis content has nothing to lock — strip rather than record a phantom.
  if (touchesLock) {
    if (fields.basis_locked === true) next.basis_locked = true;
    else delete next.basis_locked;
  }
  if (next.basis_locked === true && !hasBasisContent(next) && !next.basis_captured_at) {
    delete next.basis_locked;
    if (fields.basis_locked === true) {
      issues.push({
        code: "basis_lock_nothing",
        field: "basis_locked",
        message: "Nothing is recorded to lock yet — capture edition or jurisdiction first.",
      });
    }
  }

  // Timestamps are audit provenance, not content — compare without them so
  // an identical re-write is a true no-op (no timestamp churn, no dirty
  // marking downstream).
  const CHURN_KEYS = ["basis_updated_at"];
  if (stableSans(next, CHURN_KEYS) === stableSans(cur, CHURN_KEYS)) {
    return { next: cur, changed: false, issues };
  }
  next.basis_captured_at =
    typeof cur.basis_captured_at === "string" && cur.basis_captured_at
      ? cur.basis_captured_at
      : isoNow(now);
  next.basis_updated_at = isoNow(now);
  next.version = DESIGN_BASIS_VERSION;

  const contentKeys = Object.keys(next).filter(
    (k) => !["version", "basis_captured_at", "basis_updated_at", "basis_source"].includes(k)
  );
  if (contentKeys.length === 0) {
    // Everything authored is gone — the block reduces to a pure audit shell
    // (captured/updated/source). Storing null is the honest representation
    // of "basis cleared"; the timestamps are dropped with it because the
    // clear itself is recorded by the editor's save trail, not a ghost block.
    return { next: undefined, changed: true, issues };
  }
  return { next, changed: true, issues };
}

/**
 * Shape a site_hazard write.
 * @returns same contract as sanitizeDesignBasisWrite — `next === undefined`
 * means store null/absent. Coordinate fields are the schema-declared
 * nullable numbers: "" / null in the patch record an explicit null, never a
 * fabricated 0. Out-of-range or non-finite coordinates are rejected from
 * the record (issue surfaced) while other authored fields still land.
 */
export function sanitizeSiteHazardWrite(current, fields = {}, { now } = {}) {
  const cur = isRecord(current) ? current : {};
  const issues = [];
  const next = { ...cur };

  for (const k of ["latitude", "longitude"]) {
    if (!(k in fields)) continue;
    const v = fields[k];
    if (v === null || v === "" || v === undefined) {
      // Explicitly recorded empty — schema-declared nullable number.
      next[k] = null;
      continue;
    }
    const n = Number(v);
    const [lo, hi] = k === "latitude" ? [-90, 90] : [-180, 180];
    if (!Number.isFinite(n) || n < lo || n > hi) {
      issues.push({
        code: `${k}_invalid`,
        field: k,
        message: `${k === "latitude" ? "Latitude" : "Longitude"} must be a number between ${lo} and ${hi}; the value was not recorded.`,
      });
      continue; // keep the previously recorded value, never the invalid one
    }
    next[k] = n;
  }

  const enumField = (key, allowed, label) => {
    if (!(key in fields)) return;
    const v = fields[key];
    if (v === "" || v === undefined || v === null) {
      delete next[key];
      return;
    }
    if (!allowed.includes(v)) {
      issues.push({
        code: `${key}_invalid`,
        field: key,
        message: `${label} must be one of ${allowed.join("/")}; the value was not recorded.`,
      });
      return;
    }
    next[key] = v;
  };
  enumField("units", HAZARD_UNITS, "Units");
  enumField("risk_category", RISK_CATEGORIES, "Risk category");
  enumField("exposure_category", EXPOSURE_CATEGORIES, "Exposure category");

  if ("exposure_assumption" in fields) {
    if (fields.exposure_assumption === "" || fields.exposure_assumption === null)
      delete next.exposure_assumption;
    else next.exposure_assumption = fields.exposure_assumption;
  }

  // Provenance mirrors design_basis: an authored write lands 'manual'
  // unless an official-report transcription is explicitly selected; 'api'
  // is reserved. A write carrying no content fields preserves the recorded
  // method (there is no entry to re-attribute).
  const touchesContent = [
    "latitude",
    "longitude",
    "units",
    "risk_category",
    "exposure_category",
    "exposure_assumption",
    "entry_method",
  ].some((k) => k in fields);
  if ("entry_method" in fields) {
    if (fields.entry_method === "api") {
      issues.push({
        code: "entry_method_reserved",
        field: "entry_method",
        message:
          "'api' provenance is reserved for a future automation writer; recorded 'manual'.",
      });
      next.entry_method = "manual";
    } else if (WRITABLE_SOURCES.includes(fields.entry_method)) {
      next.entry_method = fields.entry_method;
    } else {
      next.entry_method = "manual";
    }
  } else if (touchesContent && (hasSubstance(next, HAZARD_AUDIT_KEYS) || hasSubstance(cur, HAZARD_AUDIT_KEYS))) {
    next.entry_method = "manual";
  }

  const CHURN_KEYS = ["input_timestamp"];
  if (stableSans(next, CHURN_KEYS) === stableSans(cur, CHURN_KEYS)) {
    return { next: cur, changed: false, issues };
  }
  next.input_timestamp = isoNow(now);
  next.version = SITE_HAZARD_VERSION;

  const contentKeys = Object.keys(next).filter(
    (k) => !["version", "input_timestamp", "entry_method"].includes(k)
  );
  if (contentKeys.length === 0) {
    return { next: undefined, changed: true, issues };
  }
  return { next, changed: true, issues };
}

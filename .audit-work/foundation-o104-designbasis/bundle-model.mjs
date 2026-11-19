// .audit-work/foundation-o104-designbasis/candidates/foundationDesignBasis.js
var DESIGN_BASIS_VERSION = 1;
var SITE_HAZARD_VERSION = 1;
var BASIS_SOURCES = ["manual", "official_report", "api"];
var ENTRY_METHODS = ["manual", "official_report", "api"];
var WRITABLE_SOURCES = ["manual", "official_report"];
var HAZARD_UNITS = ["imperial", "metric"];
var RISK_CATEGORIES = ["I", "II", "III", "IV"];
var EXPOSURE_CATEGORIES = ["B", "C", "D"];
var isRecord = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
var isoNow = (now) => typeof now === "string" && Number.isFinite(Date.parse(now)) ? now : (/* @__PURE__ */ new Date()).toISOString();
var BASIS_TEXT_KEYS = ["code_edition", "jurisdiction", "basis_notes"];
var BASIS_CONTENT_KEYS = [...BASIS_TEXT_KEYS, "code_edition_prior", "basis_source"];
var mergeTextFields = (cur, fields, keys) => {
  const next = { ...cur };
  for (const k of keys) {
    if (!(k in fields)) continue;
    const v = fields[k];
    if (v === "" || v === void 0 || v === null) delete next[k];
    else next[k] = v;
  }
  return next;
};
var hasBasisContent = (b) => isRecord(b) && [b.code_edition, b.jurisdiction, b.basis_notes].some(
  (v) => typeof v === "string" && v.trim() !== ""
);
var BASIS_AUDIT_KEYS = ["version", "basis_captured_at", "basis_updated_at", "basis_source"];
var HAZARD_AUDIT_KEYS = ["version", "input_timestamp", "entry_method"];
var hasSubstance = (o, auditKeys) => isRecord(o) && Object.keys(o).some((k) => !auditKeys.includes(k));
var stableSans = (obj, omitKeys) => {
  const out = {};
  for (const k of Object.keys(obj || {}).sort()) {
    if (omitKeys.includes(k)) continue;
    out[k] = obj[k];
  }
  return JSON.stringify(out);
};
function sanitizeDesignBasisWrite(current, fields = {}, { now, confirmed = false } = {}) {
  const cur = isRecord(current) ? current : {};
  const issues = [];
  const touchesContent = BASIS_CONTENT_KEYS.some((k) => k in fields);
  const touchesLock = "basis_locked" in fields;
  if (cur.basis_locked === true && confirmed !== true && (touchesContent || fields.basis_locked === false)) {
    return {
      rejected: "basis_locked",
      next: cur,
      changed: false,
      issues: [
        {
          code: "basis_locked",
          field: "basis_locked",
          message: "Design basis is locked; confirm the re-capture before editing it."
        }
      ]
    };
  }
  const next = mergeTextFields(cur, fields, BASIS_TEXT_KEYS);
  if ("code_edition" in fields && typeof cur.code_edition === "string" && cur.code_edition !== "" && fields.code_edition !== cur.code_edition) {
    next.code_edition_prior = cur.code_edition;
  } else if ("code_edition_prior" in fields) {
    if (fields.code_edition_prior === "" || fields.code_edition_prior === null)
      delete next.code_edition_prior;
    else next.code_edition_prior = fields.code_edition_prior;
  }
  if ("basis_source" in fields) {
    if (fields.basis_source === "api") {
      issues.push({
        code: "basis_source_reserved",
        field: "basis_source",
        message: "'api' provenance is reserved for a future automation writer; recorded 'manual'."
      });
      next.basis_source = "manual";
    } else if (WRITABLE_SOURCES.includes(fields.basis_source)) {
      next.basis_source = fields.basis_source;
    } else {
      next.basis_source = "manual";
    }
  } else if (touchesContent && (hasSubstance(next, BASIS_AUDIT_KEYS) || hasSubstance(cur, BASIS_AUDIT_KEYS))) {
    next.basis_source = "manual";
  }
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
        message: "Nothing is recorded to lock yet \u2014 capture edition or jurisdiction first."
      });
    }
  }
  const CHURN_KEYS = ["basis_updated_at"];
  if (stableSans(next, CHURN_KEYS) === stableSans(cur, CHURN_KEYS)) {
    return { next: cur, changed: false, issues };
  }
  next.basis_captured_at = typeof cur.basis_captured_at === "string" && cur.basis_captured_at ? cur.basis_captured_at : isoNow(now);
  next.basis_updated_at = isoNow(now);
  next.version = DESIGN_BASIS_VERSION;
  const contentKeys = Object.keys(next).filter(
    (k) => !["version", "basis_captured_at", "basis_updated_at", "basis_source"].includes(k)
  );
  if (contentKeys.length === 0) {
    return { next: void 0, changed: true, issues };
  }
  return { next, changed: true, issues };
}
function sanitizeSiteHazardWrite(current, fields = {}, { now } = {}) {
  const cur = isRecord(current) ? current : {};
  const issues = [];
  const next = { ...cur };
  for (const k of ["latitude", "longitude"]) {
    if (!(k in fields)) continue;
    const v = fields[k];
    if (v === null || v === "" || v === void 0) {
      next[k] = null;
      continue;
    }
    const n = Number(v);
    const [lo, hi] = k === "latitude" ? [-90, 90] : [-180, 180];
    if (!Number.isFinite(n) || n < lo || n > hi) {
      issues.push({
        code: `${k}_invalid`,
        field: k,
        message: `${k === "latitude" ? "Latitude" : "Longitude"} must be a number between ${lo} and ${hi}; the value was not recorded.`
      });
      continue;
    }
    next[k] = n;
  }
  const enumField = (key, allowed, label) => {
    if (!(key in fields)) return;
    const v = fields[key];
    if (v === "" || v === void 0 || v === null) {
      delete next[key];
      return;
    }
    if (!allowed.includes(v)) {
      issues.push({
        code: `${key}_invalid`,
        field: key,
        message: `${label} must be one of ${allowed.join("/")}; the value was not recorded.`
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
  const touchesContent = [
    "latitude",
    "longitude",
    "units",
    "risk_category",
    "exposure_category",
    "exposure_assumption",
    "entry_method"
  ].some((k) => k in fields);
  if ("entry_method" in fields) {
    if (fields.entry_method === "api") {
      issues.push({
        code: "entry_method_reserved",
        field: "entry_method",
        message: "'api' provenance is reserved for a future automation writer; recorded 'manual'."
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
    return { next: void 0, changed: true, issues };
  }
  return { next, changed: true, issues };
}
export {
  BASIS_SOURCES,
  DESIGN_BASIS_VERSION,
  ENTRY_METHODS,
  EXPOSURE_CATEGORIES,
  HAZARD_UNITS,
  RISK_CATEGORIES,
  SITE_HAZARD_VERSION,
  WRITABLE_SOURCES,
  sanitizeDesignBasisWrite,
  sanitizeSiteHazardWrite
};

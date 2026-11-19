// Pure helpers for the Customer tax-exemption registry (masterplan G-08) —
// no React, no IO. This file is esbuild-bundled and unit-tested under plain
// Node by scripts/test-tax-exempt.mjs.
//
// Data contract (base44/entities/Customer.jsonc):
//   Customer.tax_exemption           — canonical registry OBJECT:
//     { reason, certificate_id, expires_on (YYYY-MM-DD, blank = perpetual),
//       issued_by, status ('active'|'expired'|'revoked') }
//   Legacy flat aliases (import fidelity; object wins when both are set):
//     tax_exempt          — legacy boolean "is exempt" flag.
//     tax_exempt_id       — certificate / exemption id (also certificate_id alias).
//     tax_exempt_expires  — expiry date alias (preferred flat).
//     tax_exempt_expiration — older expiry date alias.
//     tax_exempt_reason   — reason alias (preferred flat).
//     exempt_reason       — short reason alias.
//     tax_id_number       — fallback certificate id ONLY; on its own it is an
//                           EIN, not proof of exemption, so it never creates
//                           a record by itself.
//
// Status ladder (first match wins):
//   'none'    — no registry object, no boolean flag, no populated flat alias.
//   'revoked' — stored status 'revoked' (or a truthy revoked flag). Always
//               beats expiry — a revoked cert is dead even if undated/future.
//   'expired' — stored status 'expired', OR a parseable expires_on that is
//               BEFORE today (UTC day compare; a certificate is valid THROUGH
//               its expires_on date and expires the next day).
//   'active'  — has a record and is neither revoked nor expired. A BLANK
//               expires_on = perpetual: never auto-expires. A non-empty but
//               malformed expires_on = expired (fail-closed, N-07.4).
//
// Tax rule: expired/revoked → the estimate taxes NORMALLY (taxable) and the
// estimator warns. Active → not taxed. None → taxed (there is no exemption).

const clean = (v) => String(v ?? "").trim();

// --- UTC-day parsing ----------------------------------------------------------
// 'YYYY-MM-DD' is taken literally (rollover dates like 2026-02-31 rejected);
// ISO datetimes and Date objects contribute their UTC calendar date; numbers
// are epoch millis. NaN for anything unparseable.
const toUtcDay = (v) => {
  if (v instanceof Date) {
    if (!Number.isFinite(v.getTime())) return NaN;
    return Date.UTC(v.getUTCFullYear(), v.getUTCMonth(), v.getUTCDate());
  }
  if (typeof v === "number" && Number.isFinite(v)) {
    const d = new Date(v);
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  }
  const s = clean(v);
  if (!s) return NaN;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) {
    const epoch = Date.UTC(+m[1], +m[2] - 1, +m[3]);
    const d = new Date(epoch);
    return d.getUTCFullYear() === +m[1] &&
      d.getUTCMonth() === +m[2] - 1 &&
      d.getUTCDate() === +m[3]
      ? epoch
      : NaN;
  }
  const t = Date.parse(s);
  if (!Number.isFinite(t)) return NaN;
  const d = new Date(t);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
};

const nowDay = (now) => {
  const d = toUtcDay(now ?? new Date());
  return Number.isFinite(d) ? d : toUtcDay(new Date());
};

const firstText = (...vals) => {
  for (const v of vals) {
    const s = clean(v);
    if (s) return s;
  }
  return "";
};

const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

// --- taxExemption -------------------------------------------------------------

// taxExemption(customer, { now }) →
//   { status: 'none'|'active'|'expired'|'revoked',
//     record: null | { reason, certificate_id, expires_on, issued_by,
//                      stored_status, perpetual, source },
//     days_until_expiry: number | null }  (null for none/perpetual; negative
//     when expired — today - expires_on would be >0 past, so we return
//     expires_day - now_day which is <0)
// Object fields win over flat aliases on a per-field basis; a customer counts
// as "has a record" when the object carries any content, the legacy boolean is
// true, or any flat exemption alias is populated.
export function taxExemption(customer, { now } = {}) {
  const c = isObj(customer) ? customer : {};
  const reg = isObj(c.tax_exemption) ? c.tax_exemption : {};

  const reason = firstText(reg.reason, c.tax_exempt_reason, c.exempt_reason);
  const certificate_id = firstText(reg.certificate_id, reg.id, c.tax_exempt_id, c.tax_id_number);
  const expires_on = firstText(reg.expires_on, reg.expires, c.tax_exempt_expires, c.tax_exempt_expiration);
  const issued_by = firstText(reg.issued_by, reg.issuer, c.tax_exempt_issued_by);
  const stored_status = firstText(reg.status, c.tax_exempt_status).toLowerCase();

  const hasObjectContent = [reg.reason, reg.certificate_id, reg.id, reg.expires_on,
    reg.expires, reg.issued_by, reg.issuer, reg.status].some((v) => clean(v) !== "");
  const hasFlatContent = [c.tax_exempt_id, c.tax_exempt_expires,
    c.tax_exempt_expiration, c.tax_exempt_reason, c.exempt_reason,
    c.tax_exempt_status].some((v) => clean(v) !== "");
  const legacyFlag = c.tax_exempt === true;

  if (!hasObjectContent && !hasFlatContent && !legacyFlag) {
    return { status: "none", record: null, days_until_expiry: null };
  }

  const source = hasObjectContent ? (hasFlatContent || legacyFlag ? "mixed" : "tax_exemption") : "legacy";
  const today = nowDay(now);
  const expiryDay = toUtcDay(expires_on);
  // N-07.4: a BLANK expires_on is perpetual (documented), but a NON-EMPTY
  // malformed one ('2026-02-31') must not silently grant a perpetual
  // exemption — fail closed to 'expired', matching the reports side which
  // string-compares malformed dates as past. Fix the data to restore.
  const hasExpiryText = clean(expires_on) !== "";
  const malformedExpiry = hasExpiryText && !Number.isFinite(expiryDay);
  const perpetual = !hasExpiryText;
  const days_until_expiry = Number.isFinite(expiryDay) ? Math.round((expiryDay - today) / 86400000) : null;

  const revoked = stored_status === "revoked" || reg.revoked === true || c.tax_exempt_revoked === true;
  const expired = !revoked && (stored_status === "expired" || malformedExpiry || (Number.isFinite(expiryDay) && expiryDay < today));
  const status = revoked ? "revoked" : expired ? "expired" : "active";

  return {
    status,
    record: { reason, certificate_id, expires_on, issued_by, stored_status, perpetual, malformed_expiry: malformedExpiry, source },
    days_until_expiry,
  };
}

// --- estimateTaxWarning -------------------------------------------------------

export const EXEMPTION_EXPIRING_DAYS = 30;

// estimateTaxWarning({ customer, estimate, now }) →
//   null | { code: 'exemption_expired' | 'exemption_expiring', message }
// Expired cert → the estimate must tax normally; the warning says exactly that.
// Expiring within EXEMPTION_EXPIRING_DAYS (30) → soft renewal warning. The
// estimate argument is part of the contract for future estimate-level flags;
// the warning today is purely customer-registry driven.
export function estimateTaxWarning({ customer, estimate, now } = {}) {
  void estimate;
  const { status, record, days_until_expiry } = taxExemption(customer, { now });
  if (status === "expired") {
    const date = clean(record?.expires_on) || "on an unknown date";
    return {
      code: "exemption_expired",
      message: `Customer tax exemption expired ${date} — applying tax.`,
    };
  }
  if (status === "active" && days_until_expiry != null && days_until_expiry <= EXEMPTION_EXPIRING_DAYS) {
    const when = days_until_expiry === 0
      ? "expires today"
      : `expires ${record.expires_on} in ${days_until_expiry} day${days_until_expiry === 1 ? "" : "s"}`;
    return {
      code: "exemption_expiring",
      message: `Customer tax exemption ${when} — renewal may be required.`,
    };
  }
  return null;
}

// --- taxableEstimate ----------------------------------------------------------

// taxableEstimate({ customer, estimate, now }) → { taxable, reason }
//   taxable:true  — no record ('no_exemption'), expired ('exemption_expired'),
//                   or revoked ('exemption_revoked') → tax normally.
//   taxable:false — a live certificate ('exempt_active', incl. perpetual).
export function taxableEstimate({ customer, estimate, now } = {}) {
  void estimate;
  const { status } = taxExemption(customer, { now });
  switch (status) {
    case "active":
      return { taxable: false, reason: "exempt_active" };
    case "expired":
      return { taxable: true, reason: "exemption_expired" };
    case "revoked":
      return { taxable: true, reason: "exemption_revoked" };
    default:
      return { taxable: true, reason: "no_exemption" };
  }
}

// --- exemptCustomersReport ----------------------------------------------------

// exemptCustomersReport(customers, { now }) →
//   [{ customer_id, company, status, expires_on, certificate_id }]
// One row per customer that HAS a registry record (status != 'none' — active,
// expired and revoked all appear so the report is a true registry listing).
// Sorted by expires_on ascending; perpetual / undated records sort last.
export function exemptCustomersReport(customers, { now } = {}) {
  const rows = (Array.isArray(customers) ? customers : [])
    .map((c) => {
      const { status, record } = taxExemption(c, { now });
      if (status === "none" || !record) return null;
      return {
        customer_id: clean(c?.id),
        company: firstText(c?.company_name, c?.name) || "Unnamed customer",
        status,
        expires_on: clean(record.expires_on) || null,
        certificate_id: clean(record.certificate_id) || null,
        _perpetual: record.perpetual === true,
      };
    })
    .filter(Boolean);
  rows.sort((a, b) => {
    if (a._perpetual !== b._perpetual) return a._perpetual ? 1 : -1; // perpetual last
    const ad = a.expires_on, bd = b.expires_on;
    const byDate = ad == null && bd == null ? 0
      : ad == null ? 1
      : bd == null ? -1
      : ad.localeCompare(bd);
    return byDate ||
      a.company.localeCompare(b.company) ||
      a.customer_id.localeCompare(b.customer_id);
  });
  for (const r of rows) delete r._perpetual;
  return rows;
}

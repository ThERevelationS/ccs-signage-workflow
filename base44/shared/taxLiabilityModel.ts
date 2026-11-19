// Sales tax liability model — ESTIMATOR_MASTERPLAN WS-I / item I-13.
// Pure TS, zero imports: bundle-safe for Deno functions (base44/functions/*),
// frontend report code, and Node test harnesses alike. No I/O anywhere in
// this module — the wiring layer loads Invoice / TaxGroup / TaxAgency rows
// and these functions produce the J-08 "Sales Tax Liability" report inputs.
//
// Data contract (base44/entities/*.jsonc, invoicingAction computeTotals):
//   Invoice.status        — 'draft' | 'sent' | 'partially_paid' | 'paid' | 'void'
//   Invoice.issue_date    — canonical 'YYYY-MM-DD' invoice date. Imported /
//                           CoreBridge-flavoured rows may carry 'invoice_date'
//                           or 'date'; every row also has 'created_date'.
//   Invoice.tax_rate      — DECIMAL rate (0.078 = 7.8%), server-computed.
//   Invoice.tax_amount    — tax charged, dollars (money, 2dp). 'tax' and
//                           'tax_total' are tolerated import aliases.
//   Invoice.subtotal / discount_amount / total / line_items[]
//                         — dollars; line_items[] = {quantity, unit_price,
//                           taxable}. Server tax base =
//                           max(0, Σ taxable lines − discount_amount).
//   Invoice.tax_group_id / tax_group / tax_group_name / source_summary.*
//                         — NOT declared in the schema but tolerated: tax-group
//                           stamps written by imports or future wiring resolve
//                           against TaxGroup by id first, then by group_name.
//   TaxGroup.group_name / tax_percent (PERCENT, 7.8 = 7.8%) / agency_id.
//   TaxAgency.name / rate / jurisdiction / gl_account — the remit-to agency.
//   JurisdictionProfile rows also work as agency-map values (name[, state]).
//
// "Posted" = liability-carrying invoices: sent | partially_paid | paid.
// Drafts were never billed; voids were reversed — both excluded. Unknown /
// blank statuses are fail-closed (excluded). 'partial' and 'issued' are
// tolerated aliases for partially_paid/sent on imported rows.
//
// Money: every monetary output is INTEGER CENTS (12345 = $123.45). Dollar
// inputs convert exactly once via toCents — no float arithmetic touches the
// totals, so reconcileLiability ties to the cent by construction.
//
// Exempt vs untaxed: an invoice is EXEMPT only when it carries an explicit
// marker — a tax_exempt/exempt flag, an 'active' tax_exemption object, or
// evidence fields (exemption_reason / certificate refs, incl. source_summary
// stamps). A zero-tax invoice with no marker is merely UNTAXED: it counts in
// invoice_count but contributes nothing to taxable_cents or exempt_count.
// A flagged-exempt invoice with tax_amount 0 reports taxable base 0 and its
// full (subtotal − discount) sale value as exempt_sales_cents.
//
// Rate display: row.rate is a PERCENT resolved group-first — TaxGroup.
// tax_percent, else the first contributing invoice's normalized rate, else
// the derived effective rate (tax_collected / taxable × 100). rate_source
// says which: 'group' | 'invoice' | 'derived' | 'none'.
//
// API:
//   invoiceDate / isPostedInvoice / invoiceTaxCents / invoiceTaxableCents
//   invoiceRatePercent / isExemptInvoice / exemptSaleCents
//   taxLiabilityRows(invoices, {from, to, taxGroupsById, jurisdictionsById})
//   liabilitySummary(rows, {from,to}?)     reconcileLiability(rows, invoices, {from,to}?)
//   exemptSalesRows(invoices, {from,to,include_unposted}?)
//   effectiveRate / formatRate / centsToMoney
//   POSTED_INVOICE_STATUSES / UNASSIGNED_AGENCY / UNGROUPED_KEY

const clean = (v: any) => String(v ?? '').trim();
const isObj = (v: any) => !!v && typeof v === 'object' && !Array.isArray(v);
const num = (v: any, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};
const round4 = (n: number) => Math.round(n * 10000) / 10000;

// Loose numeric parse: accepts numbers and plain/decorated numeric strings
// ('1,234.56', '$5.00', '-2.5', '7.8%') but rejects letter-laden strings like
// 'INV-001' — a naive strip would read those as -1. NaN when unusable.
const MONEYISH = /^\s*\$?\s*-?[\d,]*\.?\d+\s*%?\s*$/;
const looseNum = (v: any): number => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : NaN;
  const s = clean(v);
  if (!s || !MONEYISH.test(s)) return NaN;
  const n = Number(s.replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? n : NaN;
};

// First value that parses as a finite number; NaN when none do. 0 is a real
// value (a legitimately zero rate/base), so truthiness checks won't do.
const firstFinite = (...vals: any[]): number => {
  for (const v of vals) {
    const n = looseNum(v);
    if (Number.isFinite(n)) return n;
  }
  return NaN;
};

const firstText = (...vals: any[]): string => {
  for (const v of vals) {
    const s = clean(v);
    if (s) return s;
  }
  return '';
};

// Dollar field → integer cents via looseNum (decorated strings parse,
// letter-laden strings don't). Non-finite → 0.
const toCents = (v: any): number => {
  if (v === null || v === undefined || v === '') return 0;
  const n = looseNum(v);
  return Number.isFinite(n) ? Math.sign(n) * Math.round(Math.abs(n) * 100 + 1e-9) : 0;
};

// Normalize any date-ish value to 'YYYY-MM-DD'. A leading 'YYYY-MM-DD' prefix
// wins so ISO timestamps never shift days across timezones (same rule as
// statementBatchModel). Date instances / epoch millis → their UTC day;
// other parseable strings → UTC day. '' for anything unparseable.
const toDay = (value: any): string => {
  if (value instanceof Date) {
    const t = value.getTime();
    return Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : '';
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Date(value).toISOString().slice(0, 10);
  }
  const s = clean(value);
  if (!s) return '';
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (m) return m[1];
  const t = Date.parse(s);
  return Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : '';
};

// --- statuses / dates ---------------------------------------------------------

// Invoice.statuses that carry tax liability (schema enum is
// draft|sent|partially_paid|paid|void — draft and void never billed).
export const POSTED_INVOICE_STATUSES = ['sent', 'partially_paid', 'paid'];
const POSTED = new Set([...POSTED_INVOICE_STATUSES, 'partial', 'issued']);

// Agency-bucket label for tax groups with no resolvable TaxAgency row and
// for group-less buckets.
export const UNASSIGNED_AGENCY = '(unassigned)';

// Bucket key for posted invoices with no tax group and no rate — typically
// exempt and untaxed sales.
export const UNGROUPED_KEY = 'ungrouped';

/** isPostedInvoice — true only for liability-carrying statuses. */
export function isPostedInvoice(inv: any): boolean {
  return POSTED.has(clean(inv?.status).toLowerCase());
}

/**
 * invoiceDate — the invoice's taxable date as 'YYYY-MM-DD'.
 * Chain: invoice_date → issue_date → date → created_date (the spec's
 * invoice_date → created_date ladder with the schema-canonical issue_date
 * preferred over the raw import alias).
 */
export function invoiceDate(inv: any): string {
  return toDay(firstText(inv?.invoice_date, inv?.issue_date, inv?.date, inv?.created_date));
}

// --- per-invoice amounts ------------------------------------------------------

/** invoiceTaxCents — stored tax charged, integer cents (tax_amount|tax|tax_total). */
export function invoiceTaxCents(inv: any): number {
  return toCents(firstFinite(inv?.tax_amount, inv?.tax, inv?.tax_total));
}

/**
 * invoiceRatePercent — the invoice's stored rate normalized to PERCENT.
 * tax_rate is a decimal fraction (≤1 → ×100); values >1 are already percent.
 * null when the invoice stores no usable rate.
 */
export function invoiceRatePercent(inv: any): number | null {
  const raw = firstFinite(inv?.tax_rate, inv?.tax_percent, inv?.rate);
  if (!Number.isFinite(raw) || raw < 0) return null;
  const pct = raw <= 1 ? raw * 100 : raw;
  return round4(pct);
}

/**
 * invoiceTaxableCents — the taxable base this invoice's tax was levied on,
 * integer cents. Resolution mirrors invoicingAction.computeTotals:
 *   1. explicit stored base   taxable_base | tax_base          (verbatim)
 *   2. pre-discount taxable   taxable_subtotal | taxable_amount − discount
 *   3. Σ taxable line_items (qty × unit_price) − discount       (floored 0)
 *   4. derived                tax_amount ÷ tax_rate (when both > 0)
 *   5. 0 — untaxed / exempt / indeterminate.
 * A flagged-exempt invoice with zero tax charged short-circuits to 0 — the
 * sale is reported via exempt_sales_cents, not the taxable base.
 */
export function invoiceTaxableCents(inv: any): number {
  if (!isObj(inv)) return 0;
  const tax = invoiceTaxCents(inv);
  if (tax === 0 && isExemptInvoice(inv)) return 0;

  const discount = Math.max(0, toCents(inv?.discount_amount));
  const explicit = firstFinite(inv?.taxable_base, inv?.tax_base);
  if (Number.isFinite(explicit)) return Math.max(0, toCents(explicit));

  const preDiscount = firstFinite(inv?.taxable_subtotal, inv?.taxable_amount);
  if (Number.isFinite(preDiscount)) return Math.max(0, toCents(preDiscount) - discount);

  const items = Array.isArray(inv?.line_items) ? inv.line_items : null;
  if (items && items.length) {
    let cents = 0;
    for (const li of items) {
      if (!isObj(li) || li.taxable !== true) continue;
      const line = firstFinite(li?.line_total, num(li?.quantity) * num(li?.unit_price));
      cents += toCents(Number.isFinite(line) ? line : 0);
    }
    return Math.max(0, cents - discount);
  }

  const rate = invoiceRatePercent(inv);
  if (tax !== 0 && rate && rate > 0) return Math.max(0, Math.round(tax / (rate / 100)));
  return 0;
}

// --- exemption detection ------------------------------------------------------

// Exemption evidence aliases (invoice-level stamps; G-08's registry lives on
// Customer — invoices may denormalize it via tax_exemption/source_summary).
const exemptReasonOf = (inv: any): string => firstText(
  inv?.exemption_reason, inv?.tax_exempt_reason, inv?.exempt_reason,
  inv?.tax_exemption?.reason,
  inv?.source_summary?.exemption_reason, inv?.source_summary?.tax_exempt_reason,
  inv?.source_summary?.exempt_reason,
);
const exemptCertificateOf = (inv: any): string => firstText(
  inv?.exemption_certificate_id, inv?.exemption_certificate, inv?.tax_exempt_certificate,
  inv?.tax_exempt_id, inv?.tax_exemption?.certificate_id, inv?.tax_exemption?.id,
  inv?.certificate_id,
  inv?.source_summary?.exemption_certificate_id, inv?.source_summary?.tax_exempt_id,
  inv?.source_summary?.certificate_id,
);
const exemptExpiresOf = (inv: any): string => firstText(
  inv?.tax_exempt_expires, inv?.exemption_expires, inv?.tax_exemption?.expires_on,
  inv?.tax_exemption?.expires, inv?.source_summary?.tax_exempt_expires,
);

/**
 * isExemptInvoice — true when the invoice carries an explicit exemption
 * marker: a boolean flag (tax_exempt|exempt|is_tax_exempt, incl.
 * source_summary stamps), a tax_exemption object with status 'active', or
 * evidence fields (a reason or certificate reference). Evidence without a
 * flag still counts — the cert/reason IS the marker on an invoice.
 */
export function isExemptInvoice(inv: any): boolean {
  if (!isObj(inv)) return false;
  const src = isObj(inv.source_summary) ? inv.source_summary : {};
  if (inv.tax_exempt === true || inv.exempt === true || inv.is_tax_exempt === true) return true;
  if (src.tax_exempt === true || src.exempt === true || src.is_tax_exempt === true) return true;
  const reg = isObj(inv.tax_exemption) ? inv.tax_exemption : {};
  if (clean(reg.status).toLowerCase() === 'active') return true;
  return Boolean(exemptReasonOf(inv) || exemptCertificateOf(inv));
}

/**
 * exemptSaleCents — the non-taxed sale value of an exempt invoice, integer
 * cents: (subtotal − discount), else (Σ line_items − discount), else
 * (total − tax). 0 for non-exempt rows.
 */
export function exemptSaleCents(inv: any): number {
  if (!isExemptInvoice(inv)) return 0;
  const discount = Math.max(0, toCents(inv?.discount_amount));
  const sub = firstFinite(inv?.subtotal);
  if (Number.isFinite(sub)) return Math.max(0, toCents(sub) - discount);
  const items = Array.isArray(inv?.line_items) ? inv.line_items : null;
  if (items && items.length) {
    let cents = 0;
    for (const li of items) {
      if (!isObj(li)) continue;
      const line = firstFinite(li?.line_total, num(li?.quantity) * num(li?.unit_price));
      cents += toCents(Number.isFinite(line) ? line : 0);
    }
    return Math.max(0, cents - discount);
  }
  const total = firstFinite(inv?.total, inv?.grand_total);
  if (Number.isFinite(total)) return Math.max(0, toCents(total) - invoiceTaxCents(inv));
  return 0;
}

// --- lookup maps --------------------------------------------------------------

// Accept a {id: row} map OR a bare row array → {byId, list}. Rows contribute
// both the map key and their own .id so either keying style resolves.
const indexLookup = (input: any): { byId: Map<string, any>; list: any[] } => {
  const byId = new Map<string, any>();
  const list: any[] = [];
  const add = (key: any, row: any) => {
    if (!isObj(row)) return;
    list.push(row);
    const k = clean(key);
    if (k && !byId.has(k)) byId.set(k, row);
    const rid = clean(row.id);
    if (rid && !byId.has(rid)) byId.set(rid, row);
  };
  if (Array.isArray(input)) for (const r of input) add(r?.id, r);
  else if (isObj(input)) for (const [k, v] of Object.entries(input)) add(k, v);
  return { byId, list };
};

const groupNameOf = (g: any): string => firstText(g?.group_name, g?.name, g?.label, g?.title);

// TaxGroup.tax_percent is already a PERCENT; tolerate decimal-rate rows too.
const groupPercentOf = (g: any): number | null => {
  const direct = firstFinite(g?.tax_percent, g?.percent);
  if (Number.isFinite(direct) && direct >= 0) return round4(direct);
  const raw = firstFinite(g?.tax_rate, g?.rate);
  if (Number.isFinite(raw) && raw >= 0) return round4(raw <= 1 ? raw * 100 : raw);
  return null;
};

const agencyLabelOf = (row: any, agencyId: string): string | null => {
  if (!isObj(row)) return clean(agencyId) || null;
  let label = firstText(row.name, row.agency_name, row.jurisdiction, row.label, row.title);
  const st = clean(row.state);
  if (label && st && !label.toLowerCase().endsWith(st.toLowerCase())) label = `${label}, ${st}`;
  return label || clean(agencyId) || null;
};

type GroupIndex = { byId: Map<string, any>; byName: Map<string, any> };

const buildGroupIndex = (input: any): GroupIndex => {
  const { byId, list } = indexLookup(input);
  const byName = new Map<string, any>();
  for (const g of list) {
    const n = groupNameOf(g).toLowerCase();
    if (n && !byName.has(n)) byName.set(n, g);
  }
  return { byId, byName };
};

/**
 * resolveTaxGroup — which bucket an invoice posts to.
 *   1. tax_group_id (id → group; unknown ids stay separate buckets by raw id)
 *   2. tax_group / tax_group_name / taxgroup (an id match wins, then a
 *      case-insensitive group_name match, else a name-only bucket)
 *   3. source_summary.{tax_group_id|tax_group|tax_group_name} stamps
 *   4. rate bucket 'rate:<pct>' for group-less invoices that still charged tax
 *   5. UNGROUPED_KEY — no group, no rate, no tax
 */
const resolveTaxGroup = (inv: any, idx: GroupIndex) => {
  const src = isObj(inv.source_summary) ? inv.source_summary : {};
  const idRef = firstText(inv?.tax_group_id, inv?.taxgroup_id, inv?.taxGroupId, src?.tax_group_id);
  if (idRef) {
    const g = idx.byId.get(idRef) || null;
    const gid = clean(g?.id) || idRef;
    return { key: `id:${gid}`, id: gid, group: g, nameOnly: '', rate: null as number | null };
  }
  const nameRef = firstText(
    inv?.tax_group, inv?.tax_group_name, inv?.taxgroup, inv?.taxGroup,
    src?.tax_group, src?.tax_group_name,
  );
  if (nameRef) {
    const byIdHit = idx.byId.get(nameRef);
    if (byIdHit) return { key: `id:${clean(byIdHit.id) || nameRef}`, id: clean(byIdHit.id) || nameRef, group: byIdHit, nameOnly: '', rate: null as number | null };
    const byNameHit = idx.byName.get(nameRef.toLowerCase());
    if (byNameHit) return { key: `id:${clean(byNameHit.id) || nameRef.toLowerCase()}`, id: clean(byNameHit.id), group: byNameHit, nameOnly: '', rate: null as number | null };
    return { key: `name:${nameRef.toLowerCase()}`, id: '', group: null, nameOnly: nameRef, rate: null as number | null };
  }
  const pct = invoiceRatePercent(inv);
  if (pct && pct > 0) return { key: `rate:${round4(pct)}`, id: '', group: null, nameOnly: '', rate: pct };
  return { key: UNGROUPED_KEY, id: '', group: null, nameOnly: '', rate: null as number | null };
};

const bucketName = (res: { id: string; group: any; nameOnly: string; rate: number | null }): string => {
  if (res.group) return groupNameOf(res.group) || res.id || 'Tax group';
  if (res.nameOnly) return res.nameOnly;
  if (res.id) return res.id; // unknown group id — show what was stored
  if (res.rate && res.rate > 0) return `Ungrouped (${formatRate(res.rate)})`;
  return 'No tax group';
};

// --- report builders ----------------------------------------------------------

/**
 * taxLiabilityRows — per-tax-group liability rows for a period.
 *
 * @param invoices             Invoice rows (any statuses/dates — this function
 *                             applies the posted-status + period filter).
 * @param opts.from / opts.to  'YYYY-MM-DD' inclusive bounds (period_start /
 *                             period_end / start_date / end_date aliases ok).
 *                             Both absent → unbounded (undated rows included).
 *                             Any bound present → undated rows excluded (they
 *                             can't be attributed to the period).
 * @param opts.taxGroupsById   {id: TaxGroup} map or TaxGroup[] array.
 * @param opts.jurisdictionsById  {id: agency} map or array — TaxAgency rows
 *                             (agenciesById/taxAgenciesById aliases ok); a
 *                             JurisdictionProfile map also works (name[,state]).
 * @returns rows [{tax_group_id, name, agency, agency_id, rate, rate_source,
 *                 taxable_cents, tax_collected_cents, exempt_sales_cents,
 *                 invoice_count, exempt_count}] sorted by tax_collected_cents
 *                 desc then name. The array also carries `.period = {from,to}`
 *                 so liabilitySummary/reconcileLiability inherit the window.
 */
export function taxLiabilityRows(invoices: any, opts: any = {}) {
  const o = isObj(opts) ? opts : {};
  const fromDay = toDay(o.from ?? o.period_start ?? o.start ?? o.start_date);
  const toBound = toDay(o.to ?? o.period_end ?? o.end ?? o.end_date);
  const bounded = Boolean(fromDay || toBound);
  const groups = buildGroupIndex(o.taxGroupsById ?? o.tax_groups ?? o.taxGroups);
  const agencies = indexLookup(
    o.agenciesById ?? o.jurisdictionsById ?? o.taxAgenciesById ?? o.agencies ?? o.jurisdictions,
  );

  const buckets = new Map<string, any>();
  const bucketFor = (res: ReturnType<typeof resolveTaxGroup>) => {
    let b = buckets.get(res.key);
    if (b) return b;
    const g = res.group;
    const agencyId = firstText(g?.agency_id, g?.tax_agency_id, g?.agency);
    const agencyRow = agencyId ? agencies.byId.get(agencyId) : null;
    const pct = g ? groupPercentOf(g) : null;
    b = {
      tax_group_id: res.id || '',
      name: bucketName(res),
      agency: agencyLabelOf(agencyRow, agencyId),
      agency_id: agencyId || '',
      rate: Number.isFinite(pct) ? pct : null,
      rate_source: Number.isFinite(pct) ? 'group' : 'none',
      taxable_cents: 0,
      tax_collected_cents: 0,
      exempt_sales_cents: 0,
      invoice_count: 0,
      exempt_count: 0,
      _invoice_rate: null as number | null,
    };
    buckets.set(res.key, b);
    return b;
  };

  for (const inv of Array.isArray(invoices) ? invoices : []) {
    if (!isObj(inv) || !isPostedInvoice(inv)) continue;
    const day = invoiceDate(inv);
    if (bounded && (!day || (fromDay && day < fromDay) || (toBound && day > toBound))) continue;
    const b = bucketFor(resolveTaxGroup(inv, groups));
    b.invoice_count += 1;
    b.taxable_cents += invoiceTaxableCents(inv);
    b.tax_collected_cents += invoiceTaxCents(inv);
    if (isExemptInvoice(inv)) {
      b.exempt_count += 1;
      b.exempt_sales_cents += exemptSaleCents(inv);
    }
    if (b._invoice_rate == null) {
      const p = invoiceRatePercent(inv);
      if (p && p > 0) b._invoice_rate = p;
    }
  }

  const rows = [...buckets.values()].map((b) => {
    if (b.rate == null && b._invoice_rate != null) {
      b.rate = b._invoice_rate;
      b.rate_source = 'invoice';
    }
    if (b.rate == null && b.taxable_cents > 0 && b.tax_collected_cents > 0) {
      b.rate = round4((b.tax_collected_cents / b.taxable_cents) * 100);
      b.rate_source = 'derived';
    }
    delete b._invoice_rate;
    return b;
  });
  rows.sort(
    (a, b) =>
      b.tax_collected_cents - a.tax_collected_cents ||
      clean(a.name).localeCompare(clean(b.name)) ||
      a.tax_group_id.localeCompare(b.tax_group_id),
  );
  (rows as any).period = { from: fromDay || null, to: toBound || null };
  return rows;
}

const periodOf = (rows: any, opts: any) => {
  const o = isObj(opts) ? opts : {};
  const src = isObj(o.period)
    ? o.period
    : o.from || o.to || o.period_start || o.period_end
      ? o
      : isObj((rows as any)?.period)
        ? (rows as any).period
        : {};
  return {
    from: toDay(src.from ?? src.period_start ?? src.start ?? src.start_date) || null,
    to: toDay(src.to ?? src.period_end ?? src.end ?? src.end_date) || null,
  };
};

/**
 * liabilitySummary — report-level rollup over taxLiabilityRows output.
 * @returns {total_taxable_cents, total_tax_cents, invoice_count,
 *           exempt_invoice_count, exempt_sales_cents,
 *           by_agency: [{agency, tax_cents, taxable_cents, invoice_count,
 *                        exempt_count}] sorted by tax_cents desc,
 *           period: {from,to}}
 * Rows with no resolved agency roll under UNASSIGNED_AGENCY. The period is
 * read from opts or the `.period` taxLiabilityRows attaches to its output.
 */
export function liabilitySummary(rows: any, opts: any = {}) {
  const list = Array.isArray(rows) ? rows : [];
  const period = periodOf(list, opts);
  const byAgency = new Map<string, any>();
  let totalTaxable = 0;
  let totalTax = 0;
  let invCount = 0;
  let exemptCount = 0;
  let exemptSales = 0;
  for (const r of list) {
    if (!isObj(r)) continue;
    totalTaxable += num(r.taxable_cents);
    totalTax += num(r.tax_collected_cents);
    invCount += num(r.invoice_count);
    exemptCount += num(r.exempt_count);
    exemptSales += num(r.exempt_sales_cents);
    const label = clean(r.agency) || UNASSIGNED_AGENCY;
    const a =
      byAgency.get(label) ||
      { agency: label, tax_cents: 0, taxable_cents: 0, invoice_count: 0, exempt_count: 0 };
    a.tax_cents += num(r.tax_collected_cents);
    a.taxable_cents += num(r.taxable_cents);
    a.invoice_count += num(r.invoice_count);
    a.exempt_count += num(r.exempt_count);
    byAgency.set(label, a);
  }
  const by_agency = [...byAgency.values()].sort(
    (a, b) => b.tax_cents - a.tax_cents || a.agency.localeCompare(b.agency),
  );
  return {
    total_taxable_cents: totalTaxable,
    total_tax_cents: totalTax,
    invoice_count: invCount,
    exempt_invoice_count: exemptCount,
    exempt_sales_cents: exemptSales,
    by_agency,
    period,
  };
}

/**
 * reconcileLiability — tie-out that the bucketed math equals the raw invoice
 * sums. `invoices` are re-filtered by the same posted-status + period rules
 * (the period comes from opts, else the `.period` on taxLiabilityRows output,
 * else unbounded). ok ⇔ every expected cent and invoice landed in a row.
 * @returns {ok, expected_tax_cents, computed_tax_cents, delta_cents,
 *           expected_taxable_cents, computed_taxable_cents,
 *           taxable_delta_cents, expected_invoice_count,
 *           computed_invoice_count, invoice_count_delta, period}
 */
export function reconcileLiability(rows: any, invoices: any, opts: any = {}) {
  const list = Array.isArray(rows) ? rows : [];
  const period = periodOf(list, opts);
  const bounded = Boolean(period.from || period.to);
  let expectedTax = 0;
  let expectedTaxable = 0;
  let expectedCount = 0;
  for (const inv of Array.isArray(invoices) ? invoices : []) {
    if (!isObj(inv) || !isPostedInvoice(inv)) continue;
    const day = invoiceDate(inv);
    if (bounded && (!day || (period.from && day < period.from) || (period.to && day > period.to))) continue;
    expectedCount += 1;
    expectedTax += invoiceTaxCents(inv);
    expectedTaxable += invoiceTaxableCents(inv);
  }
  let computedTax = 0;
  let computedTaxable = 0;
  let computedCount = 0;
  for (const r of list) {
    if (!isObj(r)) continue;
    computedTax += num(r.tax_collected_cents);
    computedTaxable += num(r.taxable_cents);
    computedCount += num(r.invoice_count);
  }
  const delta = expectedTax - computedTax;
  return {
    ok: delta === 0,
    expected_tax_cents: expectedTax,
    computed_tax_cents: computedTax,
    delta_cents: delta,
    expected_taxable_cents: expectedTaxable,
    computed_taxable_cents: computedTaxable,
    taxable_delta_cents: expectedTaxable - computedTaxable,
    expected_invoice_count: expectedCount,
    computed_invoice_count: computedCount,
    invoice_count_delta: expectedCount - computedCount,
    period,
  };
}

/**
 * exemptSalesRows — per-invoice detail for the tax-exempt sales report:
 * posted invoices carrying an exemption marker, sorted by date then number.
 * @param opts.from / opts.to   same inclusive 'YYYY-MM-DD' bounds.
 * @param opts.include_unposted when true, draft/void/unknown-status rows are
 *                              listed too (default false — posted only).
 * @returns [{invoice_id, invoice_number, date, status, customer_id,
 *            customer_name, exempt_sales_cents, exemption_reason,
 *            certificate_id, certificate_expires}] — reason/cert/expires are
 *            null when absent.
 */
export function exemptSalesRows(invoices: any, opts: any = {}) {
  const o = isObj(opts) ? opts : {};
  const fromDay = toDay(o.from ?? o.period_start ?? o.start ?? o.start_date);
  const toBound = toDay(o.to ?? o.period_end ?? o.end ?? o.end_date);
  const bounded = Boolean(fromDay || toBound);
  const includeUnposted = o.include_unposted === true || o.include_non_posted === true;

  const rows: any[] = [];
  for (const inv of Array.isArray(invoices) ? invoices : []) {
    if (!isObj(inv) || !isExemptInvoice(inv)) continue;
    if (!includeUnposted && !isPostedInvoice(inv)) continue;
    const day = invoiceDate(inv);
    if (bounded && (!day || (fromDay && day < fromDay) || (toBound && day > toBound))) continue;
    rows.push({
      invoice_id: clean(inv.id),
      invoice_number: clean(inv.invoice_number),
      date: day || null,
      status: clean(inv.status).toLowerCase(),
      customer_id: clean(inv.customer_id),
      customer_name: firstText(inv.customer_display_name, inv.customer_name, inv.client_name) || null,
      exempt_sales_cents: exemptSaleCents(inv),
      exemption_reason: exemptReasonOf(inv) || null,
      certificate_id: exemptCertificateOf(inv) || null,
      certificate_expires: toDay(exemptExpiresOf(inv)) || null,
    });
  }
  rows.sort(
    (a, b) =>
      String(a.date || '9999-12-31').localeCompare(String(b.date || '9999-12-31')) ||
      String(a.invoice_number).localeCompare(String(b.invoice_number)) ||
      String(a.invoice_id).localeCompare(String(b.invoice_id)),
  );
  return rows;
}

// --- display helpers ----------------------------------------------------------

/**
 * effectiveRate — the effective collected rate as a PERCENT:
 * tax_collected_cents ÷ taxable_cents × 100 when both are positive, else the
 * row's stored rate, else null. Use when a stored rate is absent (spec: the
 * derived effective rate is the display fallback).
 */
export function effectiveRate(row: any): number | null {
  const r = isObj(row) ? row : {};
  const taxable = num(r.taxable_cents);
  const tax = num(r.tax_collected_cents);
  if (taxable > 0 && tax > 0) return round4((tax / taxable) * 100);
  const stored = firstFinite(r.rate);
  return Number.isFinite(stored) ? round4(stored) : null;
}

/**
 * formatRate — '7.8%' display for a percent number or a liability row
 * (row.rate first, then the derived effective rate). '—' when unknown.
 */
export function formatRate(v: any): string {
  let pct: number | null = null;
  if (isObj(v)) {
    const stored = firstFinite(v.rate);
    pct = Number.isFinite(stored) ? round4(stored) : effectiveRate(v);
  } else {
    const n = firstFinite(v);
    pct = Number.isFinite(n) ? round4(n) : null;
  }
  return pct == null ? '—' : `${pct}%`;
}

/** centsToMoney — integer cents → '$1,234.56' (negative → '-$1,234.56'). */
export function centsToMoney(cents: any): string {
  const c = Math.round(num(cents));
  const sign = c < 0 ? '-' : '';
  const dollars = Math.abs(c) / 100;
  return `${sign}$${dollars.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

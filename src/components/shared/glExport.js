// GL-coded CSV export helpers (CoreBridge-style Manage Accounts mapping).
// Pure module — no imports, no I/O — so it bundles under Node for
// scripts/test-parity-items.mjs and stays deterministic in the UI.
//
// Journal-ish output columns:
//   date, memo, entity_ref, gl_account, debit, credit
//
// gl_account resolution order per entry:
//   1. An explicit gl_account (or equivalent code field) on the record itself.
//   2. A lookup built from the GL-mapped catalogs — MarkupCategory.gl_code,
//      Inventory.income_account/cogs_account, PartTemplate.income_account —
//      matched on the record's category/item/template text.
//   3. Blank — the row still exports and is counted in `unmapped` so the UI
//      can report how many rows need Manage-Accounts attention.

export const GL_EXPORT_HEADERS = ["date", "memo", "entity_ref", "gl_account", "debit", "credit"];

const clean = (v) => String(v ?? "").trim();
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const money = (v) => Math.round(num(v) * 100) / 100;

// Normalized lookup key — forgiving of case and punctuation so "Vinyl",
// "vinyl ", and "VINYL" all map together.
export const glKey = (v) => clean(v).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

// Field names that carry a GL code on catalog records. `gl_account` is the
// spec name; the entities currently ship gl_code (MarkupCategory) and
// income_account/cogs_account (Inventory, PartTemplate).
const GL_CODE_FIELDS = [
  "gl_account",
  "gl_code",
  "income_account",
  "cogs_account",
  "account_code",
  "glAccount",
];

// Record fields worth trying as lookup keys — category/item identity text.
const GL_HINT_FIELDS = [
  "category",
  "category_key",
  "category_name",
  "product_category",
  "item_name",
  "product_name",
  "template_name",
  "material_type",
  "name",
  "inventory_item_id",
];

export function glCodeOf(record) {
  if (!record || typeof record !== "object") return "";
  for (const key of GL_CODE_FIELDS) {
    const code = clean(record[key]);
    if (code) return code;
  }
  return "";
}

/**
 * Build the name → GL-code map from the mapped catalogs.
 * @param {object[]} markupCategories  MarkupCategory rows (gl_code, gl_active).
 * @param {object[]} inventoryItems    Inventory rows (income_account, cogs_account).
 * @param {object[]} partTemplates     PartTemplate rows (income_account).
 * Later sources never overwrite an existing key — the first mapping wins.
 */
export function buildGlLookup({ markupCategories = [], inventoryItems = [], partTemplates = [] } = {}) {
  const map = new Map();
  const add = (keys, code) => {
    const c = clean(code);
    if (!c) return;
    for (const k of keys) {
      const nk = glKey(k);
      if (nk && !map.has(nk)) map.set(nk, c);
    }
  };
  for (const c of Array.isArray(markupCategories) ? markupCategories : []) {
    // Inactive mappings are skipped so exports flag those lines for review
    // instead of silently posting to a retired account.
    if (c?.gl_active === false) continue;
    add([c?.category_key, c?.category_name, c?.name, c?.label], c?.gl_code || c?.gl_account);
  }
  for (const it of Array.isArray(inventoryItems) ? inventoryItems : []) {
    const label = [it?.material_type, it?.product_type, it?.size].map(clean).filter(Boolean).join(" ");
    add([it?.id, label, it?.item_name, it?.name, it?.sku, it?.barcode], it?.income_account || it?.gl_account || it?.gl_code);
  }
  for (const t of Array.isArray(partTemplates) ? partTemplates : []) {
    add([t?.id, t?.template_name, t?.category], t?.income_account || t?.gl_account || t?.gl_code);
  }
  return map;
}

/**
 * Resolve the GL account for one record. `hints` are extra text candidates
 * (e.g. report-row cells, tender bucket) tried after the record's own fields.
 */
export function resolveGlAccount(lookup, record, hints = []) {
  const direct = glCodeOf(record);
  if (direct) return direct;
  const candidates = [];
  if (record && typeof record === "object") {
    for (const f of GL_HINT_FIELDS) candidates.push(record[f]);
  }
  for (const v of [...candidates, ...(Array.isArray(hints) ? hints : [])]) {
    const k = glKey(v);
    if (k && lookup && typeof lookup.get === "function") {
      const code = lookup.get(k);
      if (code) return code;
    }
  }
  return "";
}

/**
 * entries → CSV body rows + the count of rows left unmapped.
 * Entry shape: { date, memo, entity_ref, record, hints, gl_account, debit, credit }
 * - record/hints feed gl_account resolution; an explicit gl_account wins.
 * - debit/credit export as fixed-decimal strings (blank when zero).
 */
export function glExportRows(entries = [], lookup) {
  const rows = [];
  let unmapped = 0;
  for (const e of Array.isArray(entries) ? entries : []) {
    const code = clean(e?.gl_account) || resolveGlAccount(lookup, e?.record, e?.hints);
    if (!code) unmapped += 1;
    const debit = money(e?.debit);
    const credit = money(e?.credit);
    rows.push([
      clean(e?.date),
      clean(e?.memo),
      clean(e?.entity_ref),
      code,
      debit ? debit.toFixed(2) : "",
      credit ? credit.toFixed(2) : "",
    ]);
  }
  return { rows, unmapped, total: rows.length };
}

// --- Record-type adapters ---------------------------------------------------

// Money-column keys that read as money-IN (credits) rather than charges.
const CREDIT_KEY = /collect|paid|credit|payment|received|deposit/;
// Column keys that are dates or date-ish buckets for the journal `date` col.
const DATE_KEY = /date|month|issued|created|due|paid/;
// Text-looking column keys that are actually metrics — never the entity ref.
const REF_SKIP = /^(value|amount|total|subtotal|debit|credit|balance|orders|products|invoices|count|qty|percent|share|days|avg|max|needed|on_hand|on_order|short|undated|open|conv|net|open_ar|aov|created|sent|approved|converted|cancelled|archived|invoiced|collected|b0|b1|b2|b3)$/;

/**
 * Generic ops-report table → GL entries. Report defs vary, so the mapping is
 * column-driven: the first date-ish column becomes `date`, the first text
 * (non-money, non-metric) column becomes `entity_ref`, and every money column
 * emits one journal line — credit-keyed columns land in `credit`, all others
 * in `debit`. Rows ship only report rows (totals rows are excluded upstream so
 * a journal import never double-counts the rollup line).
 */
export function reportToGlEntries({ columns = [], rows = [], source = "" } = {}) {
  const cols = Array.isArray(columns) ? columns : [];
  const dateIdx = (() => {
    const exact = cols.findIndex((c) => c?.format === "date");
    return exact >= 0 ? exact : cols.findIndex((c) => DATE_KEY.test(clean(c?.key)));
  })();
  const moneyIdx = cols.map((c, i) => (c?.format === "money" ? i : -1)).filter((i) => i >= 0);
  const refIdx = cols.findIndex((c, i) => c?.format !== "money" && i !== dateIdx && !REF_SKIP.test(clean(c?.key)));
  const entries = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!Array.isArray(row)) continue;
    const ref = refIdx >= 0 ? clean(row[refIdx]) : "";
    const date = dateIdx >= 0 ? clean(row[dateIdx]) : "";
    const hints = row.filter((cell, i) => typeof cell === "string" && clean(cell) && i !== refIdx);
    for (const i of moneyIdx) {
      const amount = money(row[i]);
      if (!amount) continue;
      const label = clean(cols[i]?.label);
      // Negative amounts flip sides so magnitudes stay positive on export.
      const wantsCredit = CREDIT_KEY.test(clean(cols[i]?.key));
      const asCredit = amount < 0 ? !wantsCredit : wantsCredit;
      entries.push({
        date,
        memo: clean(`${source}${label ? ` — ${label}` : ""}${ref ? ` — ${ref}` : ""}`),
        entity_ref: ref,
        debit: asCredit ? 0 : Math.abs(amount),
        credit: asCredit ? Math.abs(amount) : 0,
        hints: ref ? [ref, ...hints] : hints,
      });
    }
  }
  return entries;
}

/**
 * Reconciliation batch payments → receipt lines (debit = cash/tender received).
 * entity_ref prefers the invoice number so a journal import can tie receipts
 * back to AR documents; bucket/method text feeds GL resolution.
 */
export function paymentsToGlEntries({ payments = [], batch = {} } = {}) {
  const batchNo = clean(batch?.batch_number);
  return (Array.isArray(payments) ? payments : []).map((p) => ({
    date: clean(p?.paid_date || p?.paid_at || p?.created_date).slice(0, 10),
    memo: clean(`${batchNo ? `${batchNo} ` : ""}receipt — ${p?.customer_display_name || p?.customer || ""}`),
    entity_ref: clean(p?.invoice_number || p?.invoice_id || p?.id),
    record: p,
    hints: [p?.category, p?.bucket, p?.method, p?.tender].filter(Boolean),
    debit: money(p?.amount),
    credit: 0,
  }));
}

// Customer CSV import model — company + addresses + contacts in one pass
// (ESTIMATOR_MASTERPLAN G-13, parallel to F-20 catalogImportModel). Pure TS,
// zero imports — safe for Deno functions and frontend modules. The CSV parser
// below is intentionally a standalone copy of the wizard parser contract
// (src/components/imports/importModel.js parseCsvText): quoted fields, ""
// escapes, embedded newlines, LF/CRLF/CR endings, UTF-8 BOM, blank-row skip
// with preserved row numbers.
//
// Pipeline:
//   parseCsv(text)                              → { headers, records }
//   mapCustomerHeaders(headers)                 → { keyToHeader, unmappedHeaders, missingRequired }
//   canonicalizeCustomerRow(record|object)      → CanonicalRow (string cells keyed by column key)
//   rowsToCustomerPatches(records, {now, existingCustomers})
//                                               → [{ row, key, patch, contacts, locations, errors, action, ... }]
//   classifyCustomerRow(row, existingCustomers) → 'create' | 'merge' | 'skip' | 'error'
//   importSummary(results)                      → ImportJob-shaped counts + ambiguous[] detail
//   contactRowsFor(patch, row)                  → CustomerContact-shaped creates (customer_id placeholder)
//   locationRowsFor(patch, row)                 → CustomerLocation-shaped creates (customer_id placeholder)
//
// Field targets (verified against base44/entities/*.jsonc):
//   Customer         — flat billing_address_1/2 + billing_city/state/postal_code/country and
//                      location_address_1/2 + location_city/state/postal_code with
//                      location_same_as_billing; there is NO locations[] array on Customer.
//                      contact_first/last/email/office_phone/office_ext/cell_phone hold the
//                      primary contact inline; salesperson (not sales_rep), tax_exempt bool,
//                      status free-string + customer_status enum (prospect|active|inactive).
//   CustomerContact  — customer_id (required), first_name, last_name, display_name, position,
//                      email, phone, phone_ext, mobile_phone, role ('primary'|'billing'|'site'),
//                      is_primary / is_billing_contact, authority_role, creation_request_key,
//                      source_summary{...}, is_active.
//   CustomerLocation — customer_id (required), label, address_line_1/2, city, state,
//                      postal_code, country, site_type enum (incl. 'billing'/'install'),
//                      is_primary_site, is_billing_address, creation_request_key,
//                      source_summary{...}, is_active.
//   ImportJob        — import_type 'customers' + created_items / updated_items /
//                      skipped_items / ambiguous_items / invalid_items counters is the
//                      history row shape importSummary() emits.
//
// Dedupe semantics (documented precedence, deterministic):
//   1. error    — required-field or format failure (needs company_name OR contact_name+email;
//                 malformed email). Nothing is written for an error row.
//   2. merge    — EXACT normalized-email match against ONE existing customer
//                 (contact_email | billing_contact_email | additional_contacts[].email)
//                 wins over name matching; OR company-name-only match (normalized
//                 company_name | legacy_client_names | id) against exactly ONE customer.
//   3. skip     — ambiguous: email hits >1 customer, name-only hits >1 customer, or email and
//                 name each hit DIFFERENT customers; or a duplicate of an earlier row in the
//                 same file (same normalized email or same company+contact identity).
//   4. create   — no match.
//   In-file extension: a second row naming the SAME company with a DIFFERENT contact merges
//   into that earlier row's pending create (action 'merge', matched_pending_key) so
//   multi-contact-per-company CSVs create one Customer plus extra CustomerContact rows.
//   Existing-customer matches always win over in-file folds (an exact email hit is
//   authoritative); merge rows carry the real matched id on their child creates, while
//   create/fold rows carry the 'pending:<key>' placeholder the executor resolves —
//   for a folded row the placeholder is the TARGET row's key, resolved to its create
//   id (or its matched customer id when the target itself merged).
//
// creation_request_key contract (retry-safe, deterministic — no clock, no random):
//   customer : custimp:<company-slug>:<email|nophone>
//   contact  : custimp-ct:<company-slug>:<email|name-slug|row<N>>
//   location : custimp-loc:<company-slug>:<billing|site>:<address-slug>
// customer_id on child creates is the placeholder 'pending:<customer-key>'; the
// executor resolves it after the Customer create lands.

// ---------------------------------------------------------------------------
// CSV parsing
// ---------------------------------------------------------------------------

export const normalizeHeader = (value: unknown): string =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

export interface CsvRecord {
  row: number; // 1-based spreadsheet line (header = row 1)
  cells: string[];
  data: Record<string, string>;
}

/**
 * Parse CSV text into a header row + record list.
 * Strips a UTF-8 BOM; handles quoted fields with commas, "" escapes and
 * embedded newlines; accepts LF, CRLF and CR endings. Fully blank rows are
 * skipped but still consume a record number so `row` matches the spreadsheet
 * line the user sees.
 */
export function parseCsv(text: string): { headers: string[]; records: CsvRecord[] } {
  const raw = String(text ?? "");
  const src = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
  const records: Array<{ row: number; cells: string[] }> = [];
  let field = "";
  let cells: string[] = [];
  let inQuotes = false;
  let recordNo = 1;
  let sawAny = false;

  const pushRecord = () => {
    cells.push(field);
    field = "";
    const isBlank = cells.every((c) => String(c).trim() === "");
    if (!isBlank) records.push({ row: recordNo, cells });
    cells = [];
    recordNo += 1;
    sawAny = false;
  };

  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"' && field.trim() === "") {
      inQuotes = true;
      field = "";
      sawAny = true;
      continue;
    }
    if (ch === ",") {
      cells.push(field);
      field = "";
      sawAny = true;
      continue;
    }
    if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i += 1;
      pushRecord();
      continue;
    }
    field += ch;
    sawAny = true;
  }
  if (field !== "" || cells.length || sawAny) pushRecord();

  const headers = (records[0]?.cells || []).map((h) => String(h).trim());
  const data = records.slice(1).map((rec) => {
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => {
      if (h) obj[h] = String(rec.cells[i] ?? "").trim();
    });
    return { row: rec.row, cells: rec.cells, data: obj };
  });
  return { headers, records: data };
}

// ---------------------------------------------------------------------------
// Column registry — canonical key → Customer field + header aliases
// ---------------------------------------------------------------------------

export interface CustomerColumn {
  key: string;
  label: string;
  /** Customer patch field when it differs from the canonical column key. */
  field?: string;
  aliases: string[];
  kind?: "boolean" | "number" | "list";
}

/**
 * Canonical customer-import columns. `key` is what canonicalizeCustomerRow
 * produces; `field` is the Customer entity property it lands on. Aliases are
 * normalized with normalizeHeader before matching, so "Sales Rep", "sales_rep"
 * and "SALES-REP" all hit the same column.
 */
export const CUSTOMER_COLUMNS: CustomerColumn[] = [
  { key: "company_name", label: "Company", aliases: ["company_name", "company", "customer", "customer_name", "account", "account_name", "business_name", "business", "name", "organization", "org"] },
  { key: "contact_name", label: "Contact Name", aliases: ["contact_name", "contact", "primary_contact", "contact_full_name", "full_name", "contact_person", "attention", "attn"] },
  { key: "first_name", label: "Contact First", field: "contact_first_name", aliases: ["first_name", "contact_first_name", "first", "contact_first", "given_name"] },
  { key: "last_name", label: "Contact Last", field: "contact_last_name", aliases: ["last_name", "contact_last_name", "last", "contact_last", "surname", "family_name"] },
  { key: "contact_title", label: "Contact Title", field: "contact_position", aliases: ["contact_title", "title", "position", "job_title", "contact_position", "role"] },
  { key: "email", label: "Email", field: "contact_email", aliases: ["email", "contact_email", "e_mail", "email_address", "primary_email", "mail"] },
  { key: "phone", label: "Phone", field: "company_phone", aliases: ["phone", "company_phone", "main_phone", "phone_number", "office_phone", "work_phone", "main", "telephone"] },
  { key: "contact_phone", label: "Contact Direct Phone", field: "contact_office_phone", aliases: ["contact_phone", "direct_phone", "direct", "contact_office_phone"] },
  { key: "ext", label: "Phone Ext", field: "contact_office_ext", aliases: ["ext", "extension", "office_ext", "contact_office_ext", "phone_ext"] },
  { key: "mobile_phone", label: "Mobile", field: "contact_cell_phone", aliases: ["mobile_phone", "mobile", "cell", "cell_phone", "contact_cell_phone"] },
  { key: "fax", label: "Fax", field: "company_fax", aliases: ["fax", "fax_number", "company_fax"] },
  { key: "website", label: "Website", aliases: ["website", "url", "web", "web_site", "homepage"] },
  { key: "address1", label: "Address 1", field: "billing_address_1", aliases: ["address1", "address_1", "address", "street", "street_address", "billing_address_1", "billing_address", "bill_to_address_1", "address_line_1"] },
  { key: "address2", label: "Address 2", field: "billing_address_2", aliases: ["address2", "address_2", "suite", "unit", "billing_address_2", "bill_to_address_2", "address_line_2"] },
  { key: "city", label: "City", field: "billing_city", aliases: ["city", "billing_city", "bill_to_city", "town"] },
  { key: "state", label: "State", field: "billing_state", aliases: ["state", "st", "billing_state", "bill_to_state", "province", "region"] },
  { key: "zip", label: "Zip", field: "billing_postal_code", aliases: ["zip", "zip_code", "postal_code", "postal", "billing_zip", "billing_postal_code", "bill_to_zip", "postcode"] },
  { key: "country", label: "Country", field: "billing_country", aliases: ["country", "billing_country", "bill_to_country"] },
  { key: "shipping_address1", label: "Ship Addr 1", field: "location_address_1", aliases: ["shipping_address_1", "shipping_address", "ship_to_address_1", "ship_address_1", "location_address_1", "site_address_1", "site_address"] },
  { key: "shipping_address2", label: "Ship Addr 2", field: "location_address_2", aliases: ["shipping_address_2", "ship_to_address_2", "ship_address_2", "location_address_2", "site_address_2"] },
  { key: "shipping_city", label: "Ship City", field: "location_city", aliases: ["shipping_city", "ship_to_city", "ship_city", "location_city", "site_city"] },
  { key: "shipping_state", label: "Ship State", field: "location_state", aliases: ["shipping_state", "ship_to_state", "ship_state", "location_state", "site_state"] },
  { key: "shipping_zip", label: "Ship Zip", field: "location_postal_code", aliases: ["shipping_zip", "ship_to_zip", "ship_zip", "location_postal_code", "location_zip", "site_zip"] },
  { key: "billing_contact_name", label: "Billing Contact", aliases: ["billing_contact_name", "billing_contact", "billing_name", "accounts_payable_contact", "ap_contact", "billing_person"] },
  { key: "billing_email", label: "Billing Email", field: "billing_contact_email", aliases: ["billing_email", "billing_contact_email", "ap_email", "accounts_payable_email", "invoice_email", "invoicing_email"] },
  { key: "billing_phone", label: "Billing Phone", field: "billing_contact_phone", aliases: ["billing_phone", "billing_contact_phone", "ap_phone"] },
  { key: "sales_rep", label: "Sales Rep", field: "salesperson", aliases: ["sales_rep", "salesrep", "salesperson", "sales_person", "rep", "account_rep", "account_manager", "assigned_rep"] },
  { key: "customer_type", label: "Customer Type", aliases: ["customer_type", "type", "segment", "customer_segment"] },
  { key: "status", label: "Status", aliases: ["status", "lifecycle", "customer_status", "account_status"] },
  { key: "industry", label: "Industry", field: "industry_type", aliases: ["industry", "industry_type", "vertical"] },
  { key: "origination", label: "Origination", field: "customer_origination", aliases: ["origination", "customer_origination", "source", "referral_source", "lead_source", "how_heard"] },
  { key: "terms", label: "Terms", aliases: ["terms", "payment_terms"] },
  { key: "tax_group", label: "Tax Group", field: "default_tax_group", aliases: ["tax_group", "default_tax_group", "tax_rate_group"] },
  { key: "tax_exempt", label: "Tax Exempt", kind: "boolean", aliases: ["tax_exempt", "tax_exempt_flag", "exempt", "is_tax_exempt", "nontaxable", "non_taxable"] },
  { key: "tax_id", label: "Tax ID", field: "tax_id_number", aliases: ["tax_id", "tax_id_number", "tax_exempt_id", "resale_number", "exemption_number", "exemption_id"] },
  { key: "credit_limit", label: "Credit Limit", kind: "number", aliases: ["credit_limit"] },
  { key: "require_po", label: "PO Required", kind: "boolean", field: "require_purchase_order", aliases: ["require_po", "po_required", "require_purchase_order", "purchase_order_required"] },
  { key: "tags", label: "Tags", kind: "list", aliases: ["tags", "tag", "labels"] },
  { key: "notes", label: "Notes", aliases: ["notes", "note", "comments", "memo"] },
];

const CUSTOMER_STATUS_ENUM = ["prospect", "active", "inactive"];

/** Match file headers to CUSTOMER_COLUMNS via normalized aliases. */
export function mapCustomerHeaders(headers: string[]): {
  keyToHeader: Record<string, string | null>;
  unmappedHeaders: string[];
  missingRequired: string[];
} {
  const normalized = (headers || []).map((h) => normalizeHeader(h));
  const keyToHeader: Record<string, string | null> = {};
  const used = new Set<number>();
  for (const col of CUSTOMER_COLUMNS) {
    keyToHeader[col.key] = null;
    for (const alias of col.aliases) {
      const idx = normalized.indexOf(normalizeHeader(alias));
      if (idx >= 0 && !used.has(idx)) {
        keyToHeader[col.key] = headers[idx];
        used.add(idx);
        break;
      }
    }
  }
  const unmappedHeaders = (headers || []).filter((h, i) => h && !used.has(i));
  // company_name is conditionally required (contact_name+email also
  // satisfies a row), so there is no statically-required column; still flag a
  // file that can never satisfy any row.
  const missingRequired: string[] = [];
  if (!keyToHeader.company_name && !keyToHeader.contact_name && !keyToHeader.email) {
    missingRequired.push("Company (or Contact Name + Email)");
  }
  return { keyToHeader, unmappedHeaders, missingRequired };
}

// ---------------------------------------------------------------------------
// Normalization helpers
// ---------------------------------------------------------------------------

export const cleanCell = (value: unknown): string =>
  String(value ?? "").trim().replace(/\s+/g, " ");

export const normalizeEmail = (value: unknown): string =>
  cleanCell(value).toLowerCase();

/** Company dedupe key — case/whitespace/punctuation-insensitive. */
export const normalizeCompanyName = (value: unknown): string =>
  cleanCell(value)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Slug used inside creation_request_key values — lowercase alnum runs. */
export const customerSlug = (value: unknown): string =>
  normalizeCompanyName(value).replace(/\s+/g, "-").slice(0, 60) || "x";

export function parseImportBool(value: unknown): boolean | null {
  const s = cleanCell(value).toLowerCase();
  if (["yes", "true", "1", "y", "x", "exempt"].includes(s)) return true;
  if (["no", "false", "0", "n", "", "taxable"].includes(s)) return false;
  return null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Split a freeform "contact name" cell into first/last.
 * "Last, First" (comma) → {first_name:'First', last_name:'Last'};
 * otherwise first token = first name, remainder = last name.
 */
export function splitContactName(name: unknown): { first_name: string; last_name: string } {
  const s = cleanCell(name);
  if (!s) return { first_name: "", last_name: "" };
  if (s.includes(",")) {
    const [last, ...rest] = s.split(",");
    return {
      first_name: cleanCell(rest.join(" ")),
      last_name: cleanCell(last),
    };
  }
  const parts = s.split(" ").filter(Boolean);
  if (parts.length <= 1) return { first_name: parts[0] || "", last_name: "" };
  return { first_name: parts[0], last_name: parts.slice(1).join(" ") };
}

// ---------------------------------------------------------------------------
// Canonical rows
// ---------------------------------------------------------------------------

export type CanonicalRow = Record<string, string> & { row: number };

/**
 * Reduce one parsed record (or a plain object) to canonical column keys.
 * Accepts: a CsvRecord ({row, data}), a header-keyed object, or an already
 * canonical object — every column key and alias is probed in order.
 */
export function canonicalizeCustomerRow(
  input: CsvRecord | Record<string, unknown>,
  keyToHeader?: Record<string, string | null>,
): CanonicalRow {
  const src: Record<string, unknown> =
    (input as CsvRecord)?.data && typeof (input as CsvRecord).data === "object"
      ? (input as CsvRecord).data
      : (input as Record<string, unknown>);
  const row = Number((input as CsvRecord)?.row) || 0;
  const byNormalized = new Map<string, unknown>();
  for (const [k, v] of Object.entries(src || {})) {
    const nk = normalizeHeader(k);
    if (nk && !byNormalized.has(nk)) byNormalized.set(nk, v);
  }
  const out: CanonicalRow = { row };
  for (const col of CUSTOMER_COLUMNS) {
    let value: unknown;
    const mapped = keyToHeader?.[col.key];
    if (mapped && src[mapped] !== undefined) {
      value = src[mapped];
    } else {
      for (const alias of [col.key, ...col.aliases]) {
        const v = byNormalized.get(normalizeHeader(alias));
        if (v !== undefined && cleanCell(v) !== "") { value = v; break; }
      }
    }
    out[col.key] = cleanCell(value);
  }
  // Synthesize split names from contact_name when explicit parts are absent.
  if (!out.first_name && !out.last_name && out.contact_name) {
    const split = splitContactName(out.contact_name);
    out.first_name = split.first_name;
    out.last_name = split.last_name;
  }
  out.email = normalizeEmail(out.email);
  out.billing_email = normalizeEmail(out.billing_email);
  return out;
}

// ---------------------------------------------------------------------------
// Patch / child-row shaping
// ---------------------------------------------------------------------------

export const CUSTOMER_IMPORT_KEY_PREFIX = "custimp";

/** Deterministic retry-safe receipt for one imported customer. */
export function customerImportKey(row: CanonicalRow): string {
  const slug = customerSlug(row.company_name || row.contact_name || row.email);
  const email = normalizeEmail(row.email);
  return `${CUSTOMER_IMPORT_KEY_PREFIX}:${slug}:${email || "nophone"}`;
}

/**
 * Build the Customer patch for one canonical row.
 * Sparse — blank cells never emit fields so merges only fill gaps.
 * Returns { patch, errors } where errors are human strings (no row prefix).
 */
export function rowToCustomerPatch(row: CanonicalRow): {
  patch: Record<string, unknown>;
  errors: string[];
} {
  const errors: string[] = [];
  const patch: Record<string, unknown> = {};

  const company = cleanCell(row.company_name);
  const contactName = cleanCell(row.contact_name) ||
    cleanCell(`${row.first_name || ""} ${row.last_name || ""}`);
  const email = normalizeEmail(row.email);

  // Required: company_name OR (contact_name + email).
  if (!company && !(contactName && email)) {
    errors.push("requires company_name or contact_name + email");
  }
  if (row.email && !EMAIL_RE.test(email)) {
    errors.push(`email "${cleanCell(row.email)}" is not a valid email`);
  }
  if (row.billing_email && !EMAIL_RE.test(normalizeEmail(row.billing_email))) {
    errors.push(`billing email "${cleanCell(row.billing_email)}" is not a valid email`);
  }

  // Person-only rows become a person-named customer (company_name is a
  // required Customer field — fall back to the contact's name).
  patch.company_name = company || contactName;
  patch.creation_request_key = customerImportKey(row);

  const put = (field: string, value: unknown) => {
    if (value !== undefined && value !== null && value !== "") patch[field] = value;
  };

  for (const col of CUSTOMER_COLUMNS) {
    const raw = row[col.key];
    if (raw === undefined || raw === "") continue;
    // contact_name is split into first/last during canonicalization — it is
    // not itself a Customer field, so it must never be written to the patch.
    if (col.key === "contact_name") continue;
    const field = col.field || col.key;
    switch (col.kind) {
      case "boolean": {
        const b = parseImportBool(raw);
        if (b === null) { errors.push(`${col.label} "${raw}" must be yes/no`); break; }
        if (col.key === "tax_exempt") patch.tax_exempt = b; // explicit false is meaningful
        else if (b) patch[field] = true;
        break;
      }
      case "number": {
        const n = Number(String(raw).replace(/[$,]/g, ""));
        if (!Number.isFinite(n)) { errors.push(`${col.label} "${raw}" must be a number`); break; }
        patch[field] = n;
        break;
      }
      case "list": {
        const list = String(raw).split(/[;|]/).map((t) => cleanCell(t)).filter(Boolean);
        if (list.length) patch[field] = list;
        break;
      }
      default:
        put(field, col.key === "email" ? email : raw);
    }
  }

  // Name splits landed via the column loop (first_name→contact_first_name
  // etc.); contact_name itself was consumed during canonicalization.

  // Status: keep the free string; mirror into the enum only when it fits.
  if (row.status) {
    patch.status = cleanCell(row.status);
    const lowered = cleanCell(row.status).toLowerCase();
    if (CUSTOMER_STATUS_ENUM.includes(lowered)) patch.customer_status = lowered;
  }

  // Address presence drives location_same_as_billing.
  const hasBilling = !!(row.address1 || row.city || row.state || row.zip);
  const hasSite = !!(row.shipping_address1 || row.shipping_city || row.shipping_state || row.shipping_zip);
  if (hasBilling) {
    if (!patch.billing_country) patch.billing_country = cleanCell(row.country) || "United States";
    patch.location_same_as_billing = !hasSite;
  } else if (hasSite) {
    patch.location_same_as_billing = false;
  }

  return { patch, errors };
}

/**
 * CustomerContact-shaped creates for a row's people. `customer_id` carries
 * the 'pending:<customer creation_request_key>' placeholder — the executor
 * swaps in the real id after the Customer create lands. Only emitted when
 * the row carries person data (name, email, phones or title).
 */
export function contactRowsFor(
  customerPatch: Record<string, unknown>,
  row: CanonicalRow,
  opts: { now?: unknown } = {},
): Array<Record<string, unknown>> {
  const key = String(customerPatch?.creation_request_key || customerImportKey(row));
  const slug = key.split(":")[1] || "x";
  const pendingId = `pending:${key}`;
  const source = {
    source: "customer_csv_import",
    row: row.row || 0,
    imported_at: opts.now ? String(opts.now) : "",
  };
  const contacts: Array<Record<string, unknown>> = [];

  const first = cleanCell(row.first_name);
  const last = cleanCell(row.last_name);
  const email = normalizeEmail(row.email);
  const hasPerson = !!(first || last || email || row.contact_phone || row.mobile_phone || row.contact_title);
  if (hasPerson) {
    const nameKey = normalizeEmail(row.email) ||
      customerSlug(`${first} ${last}`.trim() || row.contact_name) ||
      `r${row.row || 0}`;
    contacts.push({
      customer_id: pendingId,
      first_name: first || undefined,
      last_name: last || undefined,
      display_name: cleanCell(`${first} ${last}`) || cleanCell(row.contact_name) || undefined,
      position: cleanCell(row.contact_title) || undefined,
      email: email || undefined,
      phone: cleanCell(row.contact_phone) || undefined,
      phone_ext: cleanCell(row.ext) || undefined,
      mobile_phone: cleanCell(row.mobile_phone) || undefined,
      role: "primary",
      is_primary: true,
      authority_role: "unknown",
      creation_request_key: `custimp-ct:${slug}:${nameKey}`,
      source_summary: source,
      is_active: true,
    });
  }

  const billingEmail = normalizeEmail(row.billing_email);
  const hasBillingPerson = !!(cleanCell(row.billing_contact_name) || billingEmail || cleanCell(row.billing_phone));
  if (hasBillingPerson) {
    const b = splitContactName(row.billing_contact_name);
    const bKey = billingEmail || customerSlug(row.billing_contact_name) || `r${row.row || 0}`;
    contacts.push({
      customer_id: pendingId,
      first_name: b.first_name || undefined,
      last_name: b.last_name || undefined,
      display_name: cleanCell(row.billing_contact_name) || undefined,
      email: billingEmail || undefined,
      phone: cleanCell(row.billing_phone) || undefined,
      role: "billing",
      is_billing_contact: true,
      authority_role: "accounts_payable",
      creation_request_key: `custimp-ct:${slug}:billing:${bKey}`,
      source_summary: source,
      is_active: true,
    });
  }
  return contacts;
}

/**
 * CustomerLocation-shaped creates for a row's addresses. Same 'pending:' id
 * placeholder as contacts. Billing address → site_type 'billing' +
 * is_billing_address; a distinct ship/site address → site_type 'install' +
 * is_primary_site.
 */
export function locationRowsFor(
  customerPatch: Record<string, unknown>,
  row: CanonicalRow,
  opts: { now?: unknown } = {},
): Array<Record<string, unknown>> {
  const key = String(customerPatch?.creation_request_key || customerImportKey(row));
  const slug = key.split(":")[1] || "x";
  const pendingId = `pending:${key}`;
  const source = {
    source: "customer_csv_import",
    row: row.row || 0,
    imported_at: opts.now ? String(opts.now) : "",
  };
  const addrSlug = (a1: unknown, city: unknown, st: unknown, zip: unknown) =>
    customerSlug(`${a1 || ""} ${city || ""} ${st || ""} ${zip || ""}`.trim());

  const out: Array<Record<string, unknown>> = [];
  const hasBilling = !!(row.address1 || row.city || row.state || row.zip);
  const hasSite = !!(row.shipping_address1 || row.shipping_city || row.shipping_state || row.shipping_zip);
  if (hasBilling) {
    out.push({
      customer_id: pendingId,
      label: cleanCell(row.company_name) ? `${cleanCell(row.company_name)} billing` : "Billing address",
      address_line_1: cleanCell(row.address1) || undefined,
      address_line_2: cleanCell(row.address2) || undefined,
      city: cleanCell(row.city) || undefined,
      state: cleanCell(row.state) || undefined,
      postal_code: cleanCell(row.zip) || undefined,
      country: cleanCell(row.country) || "US",
      site_type: hasSite ? "billing" : "install_and_billing",
      is_billing_address: true,
      is_primary_site: !hasSite,
      creation_request_key: `custimp-loc:${slug}:billing:${addrSlug(row.address1, row.city, row.state, row.zip)}`,
      source_summary: source,
      is_active: true,
    });
  }
  if (hasSite) {
    out.push({
      customer_id: pendingId,
      label: cleanCell(row.shipping_address1) || "Site",
      address_line_1: cleanCell(row.shipping_address1) || undefined,
      address_line_2: cleanCell(row.shipping_address2) || undefined,
      city: cleanCell(row.shipping_city) || undefined,
      state: cleanCell(row.shipping_state) || undefined,
      postal_code: cleanCell(row.shipping_zip) || undefined,
      country: "US",
      site_type: "install",
      is_primary_site: true,
      is_billing_address: false,
      creation_request_key: `custimp-loc:${slug}:site:${addrSlug(row.shipping_address1, row.shipping_city, row.shipping_state, row.shipping_zip)}`,
      source_summary: source,
      is_active: true,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Dedupe / classification
// ---------------------------------------------------------------------------

export type CustomerRowAction = "create" | "merge" | "skip" | "error";

export interface CustomerMatch {
  action: CustomerRowAction;
  matched_customer_ids: string[];
  ambiguous: boolean;
  reason: string;
}

const collectEmails = (c: Record<string, unknown>): Set<string> => {
  const emails = new Set<string>();
  for (const v of [c?.contact_email, c?.billing_contact_email]) {
    const e = normalizeEmail(v);
    if (e) emails.add(e);
  }
  for (const ac of (c?.additional_contacts as Array<Record<string, unknown>>) || []) {
    const e = normalizeEmail(ac?.email);
    if (e) emails.add(e);
  }
  return emails;
};

const collectNames = (c: Record<string, unknown>): Set<string> => {
  const names = new Set<string>();
  const n = normalizeCompanyName(c?.company_name);
  if (n) names.add(n);
  for (const v of (c?.legacy_client_names as string[]) || []) {
    const ln = normalizeCompanyName(v);
    if (ln) names.add(ln);
  }
  return names;
};

/**
 * Match a canonical row against existing Customer rows.
 * Precedence (see header): exact email hit on ONE customer > single
 * company-name hit > anything multi-way (ambiguous → 'skip') > 'create'.
 * Validation failures are reported by rowsToCustomerPatches as 'error' —
 * this matcher only ranks candidate rows.
 */
export function matchCustomer(
  row: CanonicalRow,
  existingCustomers: Array<Record<string, unknown>>,
): CustomerMatch {
  const email = normalizeEmail(row.email);
  const name = normalizeCompanyName(row.company_name || row.contact_name);
  const emailHits: string[] = [];
  const nameHits: string[] = [];
  for (const c of existingCustomers || []) {
    const id = String(c?.id ?? c?._id ?? "");
    if (!id) continue;
    if (email && collectEmails(c).has(email)) emailHits.push(id);
    else if (name && collectNames(c).has(name)) nameHits.push(id);
  }
  // An email hit on one customer is authoritative — a name hit on the SAME
  // customer is consistent; a name hit on OTHER customers is a conflict.
  if (emailHits.length === 1) {
    const others = nameHits.filter((id) => id !== emailHits[0]);
    if (others.length) {
      return { action: "skip", matched_customer_ids: [emailHits[0], ...others], ambiguous: true, reason: "email and company name match different customers" };
    }
    return { action: "merge", matched_customer_ids: emailHits, ambiguous: false, reason: "email match" };
  }
  if (emailHits.length > 1) {
    return { action: "skip", matched_customer_ids: emailHits, ambiguous: true, reason: "email matches multiple customers" };
  }
  if (nameHits.length === 1) {
    return { action: "merge", matched_customer_ids: nameHits, ambiguous: false, reason: "company name match" };
  }
  if (nameHits.length > 1) {
    return { action: "skip", matched_customer_ids: nameHits, ambiguous: true, reason: "company name matches multiple customers" };
  }
  return { action: "create", matched_customer_ids: [], ambiguous: false, reason: "no match" };
}

/**
 * Classify one row (raw record or canonical) → 'create'|'merge'|'skip'|'error'.
 * 'error' rows failed required-field/format validation; 'skip' rows are
 * in-file-exact duplicates or ambiguous merges the executor must not guess on.
 */
export function classifyCustomerRow(
  input: CsvRecord | Record<string, unknown> | CanonicalRow,
  existingCustomers: Array<Record<string, unknown>> = [],
): CustomerRowAction {
  const row = canonicalizeCustomerRow(input as Record<string, unknown>);
  const { errors } = rowToCustomerPatch(row);
  if (errors.length) return "error";
  return matchCustomer(row, existingCustomers).action;
}

// ---------------------------------------------------------------------------
// Full pipeline
// ---------------------------------------------------------------------------

export interface CustomerImportResult {
  row: number;
  key: string;
  patch: Record<string, unknown>;
  contacts: Array<Record<string, unknown>>;
  locations: Array<Record<string, unknown>>;
  errors: string[];
  action: CustomerRowAction;
  matched_customer_ids: string[];
  /** Set when this row merges into an earlier in-file pending create. */
  matched_pending_key?: string;
  ambiguous: boolean;
  reason: string;
}

/**
 * Rows → import plan. `existingCustomers` are real Customer records for
 * dedupe; in-file duplicates and multi-contact company rows are folded per
 * the in-file rules documented at the top. Entries always carry patch +
 * contacts + locations + errors so a caller can re-derive the plan.
 */
export function rowsToCustomerPatches(
  rows: Array<CsvRecord | Record<string, unknown>>,
  opts: { now?: unknown; existingCustomers?: Array<Record<string, unknown>> } = {},
): CustomerImportResult[] {
  const existing = opts.existingCustomers || [];
  const results: CustomerImportResult[] = [];
  // Pending identity indexes for in-file folding.
  const pendingByEmail = new Map<string, string>(); // email → customer key
  const pendingByName = new Map<string, string>();  // normalized company → customer key
  const pendingIdentity = new Map<string, string>(); // exact identity (email|name+contact) → row no

  for (const input of rows || []) {
    const row = canonicalizeCustomerRow(input as Record<string, unknown>);
    const key = customerImportKey(row);
    const { patch, errors } = rowToCustomerPatch(row);

    const base: CustomerImportResult = {
      row: row.row,
      key,
      patch,
      contacts: [],
      locations: [],
      errors: errors.map((e) => `row ${row.row}: ${e}`),
      action: "create",
      matched_customer_ids: [],
      ambiguous: false,
      reason: "",
    };

    if (errors.length) {
      base.action = "error";
      base.reason = base.errors[0];
      results.push(base);
      continue;
    }

    const email = normalizeEmail(row.email);
    const name = normalizeCompanyName(row.company_name || row.contact_name);
    const identity = email ? `e:${email}` : `n:${name}|${normalizeCompanyName(row.contact_name || `${row.first_name} ${row.last_name}`)}`;

    // Exact in-file duplicate → skip (first row wins; keys are deterministic
    // so a retry would land on the same create anyway).
    if (pendingIdentity.has(identity)) {
      base.action = "skip";
      base.reason = `duplicate in file of row ${pendingIdentity.get(identity)}`;
      results.push(base);
      continue;
    }

    // Existing-customer match runs BEFORE in-file folding: an exact email hit
    // on a real customer is authoritative and must not be swallowed by a
    // pending create for the same company name.
    const match = matchCustomer(row, existing);

    // In-file company folding: no existing hit, but an earlier row already
    // created this company → merge into that pending create and contribute
    // only contact/location rows (children point at pending:<target key>).
    const pendingKey = (email && pendingByEmail.get(email)) || (name && pendingByName.get(name));
    if (match.action === "create" && pendingKey) {
      base.action = "merge";
      base.matched_pending_key = pendingKey;
      base.reason = "merges into earlier row in file";
      const targetPatch = { creation_request_key: pendingKey };
      base.contacts = contactRowsFor(targetPatch, row, { now: opts.now });
      base.locations = locationRowsFor(targetPatch, row, { now: opts.now });
      results.push(base);
      if (email) pendingByEmail.set(email, pendingKey);
      pendingIdentity.set(identity, String(row.row));
      continue;
    }

    base.action = match.action;
    base.matched_customer_ids = match.matched_customer_ids;
    base.ambiguous = match.ambiguous;
    base.reason = match.reason;
    if (match.action === "create" || match.action === "merge") {
      base.contacts = contactRowsFor(patch, row, { now: opts.now });
      base.locations = locationRowsFor(patch, row, { now: opts.now });
      if (match.action === "merge") {
        // Target id is already known — drop the placeholder entirely.
        const targetId = match.matched_customer_ids[0];
        for (const child of [...base.contacts, ...base.locations]) child.customer_id = targetId;
      }
    }
    // Identity registration: 'create' rows seed the pending-create indexes so
    // later rows can fold into them; every non-skip row registers its exact
    // identity for in-file duplicate detection. Ambiguous skips register
    // nothing — later rows must not fold into a guess.
    if (match.action !== "skip") {
      pendingIdentity.set(identity, String(row.row));
    }
    if (match.action === "create") {
      if (email) pendingByEmail.set(email, key);
      if (name) pendingByName.set(name, key);
    }
    results.push(base);
  }
  return results;
}

// ---------------------------------------------------------------------------
// Summary / history shape
// ---------------------------------------------------------------------------

/**
 * ImportJob-shaped summary for the 'customers' import history row plus the
 * ambiguous[] detail list for the review UI. Counts are disjoint:
 * total = created + updated + skipped + ambiguous + invalid.
 */
export function importSummary(results: CustomerImportResult[]): {
  import_type: string;
  total_items: number;
  processed_items: number;
  created_items: number;
  updated_items: number;
  skipped_items: number;
  ambiguous_items: number;
  invalid_items: number;
  contact_creates: number;
  location_creates: number;
  ambiguous: Array<{ row: number; key: string; matched_customer_ids: string[]; reason: string }>;
  result_message: string;
} {
  const list = results || [];
  const created = list.filter((r) => r.action === "create").length;
  const updated = list.filter((r) => r.action === "merge").length;
  const ambiguousRows = list.filter((r) => r.ambiguous);
  const skipped = list.filter((r) => r.action === "skip" && !r.ambiguous).length;
  const invalid = list.filter((r) => r.action === "error").length;
  const contactCreates = list.reduce((n, r) => n + (r.contacts?.length || 0), 0);
  const locationCreates = list.reduce((n, r) => n + (r.locations?.length || 0), 0);
  const parts = [
    `${created} create${created === 1 ? "" : "s"}`,
    `${updated} merge${updated === 1 ? "" : "s"}`,
  ];
  if (skipped) parts.push(`${skipped} skipped`);
  if (ambiguousRows.length) parts.push(`${ambiguousRows.length} ambiguous`);
  if (invalid) parts.push(`${invalid} invalid`);
  if (contactCreates) parts.push(`${contactCreates} contact${contactCreates === 1 ? "" : "s"}`);
  if (locationCreates) parts.push(`${locationCreates} location${locationCreates === 1 ? "" : "s"}`);
  return {
    import_type: "customers",
    total_items: list.length,
    processed_items: list.length,
    created_items: created,
    updated_items: updated,
    skipped_items: skipped,
    ambiguous_items: ambiguousRows.length,
    invalid_items: invalid,
    contact_creates: contactCreates,
    location_creates: locationCreates,
    ambiguous: ambiguousRows.map((r) => ({
      row: r.row,
      key: r.key,
      matched_customer_ids: r.matched_customer_ids,
      reason: r.reason,
    })),
    result_message: `customers: ${parts.join(", ")}`,
  };
}

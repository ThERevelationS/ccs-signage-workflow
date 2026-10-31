// Pure model for the /Imports wizard: CSV parsing, per-import-type column
// mappings (with CoreBridge synonym headers), row validators, plan counts and
// write batching. No I/O — every function is testable under plain Node.

// ---------------------------------------------------------------------------
// CSV parsing
// ---------------------------------------------------------------------------

export const normalizeHeader = (value) =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

/**
 * Parse CSV text into a header row + record list.
 * - Strips a UTF-8 BOM.
 * - Handles quoted fields containing commas, double-quote escapes ("") and
 *   embedded newlines; accepts LF, CRLF and CR line endings.
 * - Fully blank rows are skipped but still consume a record number so `row`
 *   matches the line the user sees in their spreadsheet (header = row 1).
 *
 * @returns {{ headers: string[], records: Array<{row:number, cells:string[], data:Object}> }}
 */
export function parseCsvText(text) {
  const src = String(text ?? "").charCodeAt(0) === 0xfeff ? String(text).slice(1) : String(text ?? ""); // strip UTF-8 BOM
  const records = [];
  let field = "";
  let cells = [];
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
  // Trailing record without a final newline.
  if (field !== "" || cells.length || sawAny) pushRecord();

  const headers = (records[0]?.cells || []).map((h) => String(h).trim());
  const data = records.slice(1).map((rec) => {
    const obj = {};
    headers.forEach((h, i) => {
      if (h) obj[h] = String(rec.cells[i] ?? "").trim();
    });
    return { row: rec.row, cells: rec.cells, data: obj };
  });
  return { headers, records: data };
}

// ---------------------------------------------------------------------------
// Column mappings
// ---------------------------------------------------------------------------

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const INVENTORY_MATERIAL_TYPES = ["Aluminum", "Steel", "Stainless_Steel", "Galvanized_Steel", "Brass", "Copper", "Plastic", "Other"];
export const INVENTORY_PRODUCT_TYPES = ["Angle", "Channel", "Tube_Square", "Tube_Round", "Flat_Bar", "Round_Bar", "Sheet", "Plate", "I_Beam", "H_Beam", "Pipe", "Other"];
export const INVENTORY_UNIT_TYPES = ["per_foot", "per_piece", "per_pound", "per_sqft"];
export const LOCATION_SITE_TYPES = ["unknown", "install", "billing", "install_and_billing", "mailing", "other"];

/**
 * Import type registry. `columns` drive header matching + preview; `validate`
 * turns each parsed record into {valid:[{row,data}], errors:[{row,message}]}.
 * `executable: false` means no staff write path exists today — the wizard
 * renders the preview but gates the Execute button with `gateReason`.
 */
export const IMPORT_TYPES = {
  customers: {
    key: "customers",
    label: "Customers",
    jobType: "customers",
    description: "CoreBridge customer export — creates/matches Customer records by company name and fills contact, billing/shipping, industry and origination fields.",
    executable: true,
    columns: [
      { key: "company_name", label: "Company", required: true, synonyms: ["company_name", "company", "name", "customer", "customer_name", "account", "account_name", "business_name", "business"] },
      { key: "contact_first_name", label: "Contact First", synonyms: ["contact_first_name", "first_name", "contact_first", "first"] },
      { key: "contact_last_name", label: "Contact Last", synonyms: ["contact_last_name", "last_name", "contact_last", "last"] },
      { key: "contact_email", label: "Email", kind: "email", synonyms: ["contact_email", "email", "e_mail", "primary_email", "email_address"] },
      { key: "contact_office_phone", label: "Contact Phone", synonyms: ["contact_office_phone", "contact_phone", "direct_phone"] },
      { key: "contact_office_ext", label: "Ext", synonyms: ["contact_office_ext", "office_ext", "ext", "extension"] },
      { key: "company_phone", label: "Company Phone", synonyms: ["company_phone", "phone", "main_phone", "phone_number", "office_phone"] },
      { key: "company_fax", label: "Fax", synonyms: ["company_fax", "fax", "fax_number"] },
      { key: "website", label: "Website", synonyms: ["website", "url", "web", "web_site"] },
      { key: "billing_address_1", label: "Billing Addr 1", synonyms: ["billing_address_1", "billing_address", "bill_to_address_1", "address_1", "address", "street"] },
      { key: "billing_address_2", label: "Billing Addr 2", synonyms: ["billing_address_2", "bill_to_address_2", "address_2"] },
      { key: "billing_city", label: "Billing City", synonyms: ["billing_city", "city", "bill_to_city"] },
      { key: "billing_state", label: "Billing State", synonyms: ["billing_state", "state", "st", "bill_to_state"] },
      { key: "billing_postal_code", label: "Billing Zip", synonyms: ["billing_postal_code", "billing_zip", "zip", "zip_code", "postal_code", "postal", "bill_to_zip"] },
      { key: "location_address_1", label: "Ship Addr 1", synonyms: ["location_address_1", "shipping_address_1", "shipping_address", "ship_to_address_1", "site_address"] },
      { key: "location_address_2", label: "Ship Addr 2", synonyms: ["location_address_2", "shipping_address_2", "ship_to_address_2"] },
      { key: "location_city", label: "Ship City", synonyms: ["location_city", "shipping_city", "ship_to_city"] },
      { key: "location_state", label: "Ship State", synonyms: ["location_state", "shipping_state", "ship_to_state"] },
      { key: "location_postal_code", label: "Ship Zip", synonyms: ["location_postal_code", "shipping_zip", "ship_to_zip", "ship_zip"] },
      { key: "industry_type", label: "Industry", synonyms: ["industry_type", "industry"] },
      { key: "customer_origination", label: "Origination", synonyms: ["customer_origination", "origination", "source", "referral_source", "lead_source"] },
      { key: "master_account", label: "Master Acct", synonyms: ["master_account", "parent_account"] },
      { key: "terms", label: "Terms", synonyms: ["terms", "payment_terms"] },
      { key: "salesperson", label: "Salesperson", synonyms: ["salesperson", "sales_rep", "rep"] },
      { key: "default_tax_group", label: "Tax Group", synonyms: ["default_tax_group", "tax_group"] },
      { key: "tax_id_number", label: "Tax ID", synonyms: ["tax_id_number", "tax_id", "tax_exempt_id"] },
      { key: "credit_limit", label: "Credit Limit", kind: "number", min: 0, synonyms: ["credit_limit"] },
      { key: "pricing_tier", label: "Tier", kind: "integer", min: 1, max: 8, synonyms: ["pricing_tier", "tier"] },
      { key: "notes", label: "Notes", synonyms: ["notes", "note", "comments"] },
    ],
  },

  customer_contacts: {
    key: "customer_contacts",
    label: "Customer Contacts",
    jobType: "customer_contacts",
    description: "Additional people at existing customers — appended to each Customer's contact list (matched by company name).",
    executable: true,
    columns: [
      { key: "customer", label: "Customer", required: true, synonyms: ["customer", "company_name", "company", "customer_name", "account", "account_name"] },
      { key: "first_name", label: "First", synonyms: ["first_name", "contact_first_name", "first"] },
      { key: "last_name", label: "Last", synonyms: ["last_name", "contact_last_name", "last"] },
      { key: "position", label: "Position", synonyms: ["position", "title", "job_title", "role"] },
      { key: "email", label: "Email", kind: "email", synonyms: ["email", "contact_email", "e_mail", "email_address"] },
      { key: "office_phone", label: "Office Phone", synonyms: ["office_phone", "phone", "work_phone", "contact_phone"] },
      { key: "office_ext", label: "Ext", synonyms: ["office_ext", "ext", "extension"] },
      { key: "cell_phone", label: "Cell", synonyms: ["cell_phone", "mobile", "mobile_phone", "cell"] },
      { key: "contact_status", label: "Status", synonyms: ["contact_status", "status"] },
      { key: "job_authority", label: "Authority", synonyms: ["job_authority", "authority", "decision_authority"] },
    ],
  },

  customer_addresses: {
    key: "customer_addresses",
    label: "Customer Addresses",
    jobType: "customer_addresses",
    description: "Shipping/site addresses for existing customers — creates CustomerLocation records (matched by company name).",
    executable: true,
    columns: [
      { key: "customer", label: "Customer", required: true, synonyms: ["customer", "company_name", "company", "customer_name", "account", "account_name"] },
      { key: "label", label: "Label", synonyms: ["label", "location_name", "site_name", "name"] },
      { key: "address_line_1", label: "Address 1", required: true, synonyms: ["address_line_1", "address_1", "address", "street", "ship_to_address", "shipping_address"] },
      { key: "address_line_2", label: "Address 2", synonyms: ["address_line_2", "address_2", "suite", "unit"] },
      { key: "city", label: "City", required: true, synonyms: ["city", "ship_to_city", "shipping_city"] },
      { key: "state", label: "State", required: true, synonyms: ["state", "st", "ship_to_state", "shipping_state", "province"] },
      { key: "postal_code", label: "Zip", synonyms: ["postal_code", "zip", "zip_code", "postal", "ship_to_zip", "shipping_zip"] },
      { key: "country", label: "Country", synonyms: ["country"] },
      { key: "site_type", label: "Site Type", kind: "enum", enumValues: LOCATION_SITE_TYPES, synonyms: ["site_type", "location_type", "address_type"] },
      { key: "is_primary_site", label: "Primary", kind: "boolean", synonyms: ["is_primary_site", "primary", "primary_site"] },
      { key: "is_billing_address", label: "Billing", kind: "boolean", synonyms: ["is_billing_address", "billing", "is_billing"] },
      { key: "county", label: "County", synonyms: ["county"] },
      { key: "access_notes", label: "Access Notes", synonyms: ["access_notes", "gate_code", "delivery_notes"] },
      { key: "notes", label: "Notes", synonyms: ["notes", "note", "comments"] },
    ],
  },

  parts: {
    key: "parts",
    label: "Parts (Inventory)",
    jobType: "parts",
    description: "CoreBridge part export — metal stock catalog rows (Inventory entity: material/product type, size, cost, unit, supplier).",
    executable: false,
    gateReason: "Inventory rows cannot be created from staff screens yet — the staff write gateway (staffEntityWrite) has no Inventory entry and inventoryAction only handles stock movements. A backend allowlist change is required before this import can execute.",
    columns: [
      { key: "name", label: "Part Name", required: true, synonyms: ["name", "part_name", "product_name", "product", "item_name", "part", "description"] },
      { key: "category", label: "Category", synonyms: ["category", "part_group", "group", "product_type", "type"] },
      { key: "material", label: "Material", kind: "enum", enumValues: INVENTORY_MATERIAL_TYPES, enumMap: { stainless: "Stainless_Steel", stainless_steel: "Stainless_Steel", galvanized: "Galvanized_Steel", galvanized_steel: "Galvanized_Steel" }, synonyms: ["material", "material_type", "metal"] },
      { key: "size", label: "Size", synonyms: ["size", "dimensions", "dimension"] },
      { key: "thickness_gauge", label: "Thickness/Ga", synonyms: ["thickness_gauge", "thickness", "gauge"] },
      { key: "standard_length", label: "Length (ft)", kind: "number", min: 0, synonyms: ["standard_length", "length", "length_ft", "length_feet"] },
      { key: "cost", label: "Cost", required: true, kind: "number", min: 0, synonyms: ["cost", "cost_per_unit", "unit_cost", "part_cost", "price"] },
      { key: "unit", label: "Unit", kind: "enum", enumValues: INVENTORY_UNIT_TYPES, enumMap: { each: "per_piece", ea: "per_piece", piece: "per_piece", ft: "per_foot", foot: "per_foot", feet: "per_foot", lf: "per_foot", lb: "per_pound", lbs: "per_pound", pound: "per_pound", sf: "per_sqft", sqft: "per_sqft", sq_ft: "per_sqft" }, synonyms: ["unit", "unit_type", "pricing_unit", "uom"] },
      { key: "supplier", label: "Supplier", synonyms: ["supplier", "vendor", "vendor_name"] },
      { key: "barcode", label: "SKU/Barcode", synonyms: ["barcode", "sku", "mfg_part", "part_number", "mfg_part_number"] },
      { key: "quantity_on_hand", label: "On Hand", kind: "number", min: 0, synonyms: ["quantity_on_hand", "on_hand", "qty_on_hand", "quantity", "qty"] },
      { key: "notes", label: "Notes", synonyms: ["notes", "note", "comments"] },
    ],
  },

  vendor_associations: {
    key: "vendor_associations",
    label: "Part–Vendor Associations",
    jobType: "vendor_associations",
    description: "CoreBridge vendor-association export — links a vendor (name + optional SKU/cost) to an existing Inventory part.",
    executable: false,
    gateReason: "Vendor associations would update Inventory rows (supplier/cost), and Inventory is not writable through any staff path today — staffEntityWrite has no Inventory entry. A backend allowlist change is required before this import can execute.",
    columns: [
      { key: "vendor_name", label: "Vendor", required: true, synonyms: ["vendor_name", "vendor", "supplier", "supplier_name"] },
      { key: "part_ref", label: "Part", required: true, synonyms: ["part_ref", "part", "part_name", "name", "product_name", "item", "item_name"] },
      { key: "vendor_sku", label: "Vendor SKU", synonyms: ["vendor_sku", "vendor_part_number", "supplier_sku", "vendor_part"] },
      { key: "cost", label: "Vendor Cost", kind: "number", min: 0, synonyms: ["cost", "vendor_cost", "unit_cost", "cost_per_unit"] },
      { key: "notes", label: "Notes", synonyms: ["notes", "note", "comments"] },
    ],
  },
};

export const IMPORT_TYPE_LIST = Object.values(IMPORT_TYPES);

// ---------------------------------------------------------------------------
// Header mapping + typed values
// ---------------------------------------------------------------------------

/**
 * Match file headers to an import type's columns via normalized synonyms.
 * @returns {{ keyToHeader: Object<string,string|null>, unmappedHeaders: string[], missingRequired: string[] }}
 */
export function mapHeaders(headers, typeKey) {
  const type = IMPORT_TYPES[typeKey];
  if (!type) throw new Error(`Unknown import type "${typeKey}".`);
  const normalized = (headers || []).map((h) => normalizeHeader(h));
  const keyToHeader = {};
  const used = new Set();
  for (const col of type.columns) {
    keyToHeader[col.key] = null;
    for (const syn of col.synonyms) {
      const idx = normalized.indexOf(normalizeHeader(syn));
      if (idx >= 0 && !used.has(idx)) {
        keyToHeader[col.key] = headers[idx];
        used.add(idx);
        break;
      }
    }
  }
  const unmappedHeaders = (headers || []).filter((h, i) => h && !used.has(i));
  const missingRequired = type.columns
    .filter((c) => c.required && !keyToHeader[c.key])
    .map((c) => c.label);
  return { keyToHeader, unmappedHeaders, missingRequired };
}

export const cleanCell = (value) => String(value ?? "").trim().replace(/\s+/g, " ");

const normKey = (value) => cleanCell(value).toLowerCase();

function parseBool(value) {
  const s = cleanCell(value).toLowerCase();
  if (["yes", "true", "1", "y", "x"].includes(s)) return true;
  if (["no", "false", "0", "n", ""].includes(s)) return false;
  return null;
}

function coerceEnum(value, col) {
  const raw = cleanCell(value);
  if (!raw) return { value: "", ok: true };
  const lowered = raw.toLowerCase().replace(/[\s-]+/g, "_");
  const mapped = col.enumMap?.[lowered] || col.enumMap?.[raw.toLowerCase()];
  if (mapped) return { value: mapped, ok: true };
  const exact = col.enumValues.find((v) => v.toLowerCase() === lowered || v.toLowerCase() === raw.toLowerCase());
  if (exact) return { value: exact, ok: true };
  return { value: "", ok: false };
}

/**
 * Build the typed `data` payload for one record using a column mapping.
 * Returns { data, errors: string[] } — errors are per-cell messages.
 */
export function extractRow(record, typeKey, keyToHeader) {
  const type = IMPORT_TYPES[typeKey];
  const data = {};
  const errors = [];
  for (const col of type.columns) {
    const header = keyToHeader?.[col.key];
    const raw = header ? record.data?.[header] : "";
    const cell = cleanCell(raw);
    if (col.required && !cell) {
      errors.push(`${col.label} is required`);
      continue;
    }
    if (!cell) continue;
    switch (col.kind) {
      case "number": {
        const n = Number(cell.replace(/[$,]/g, ""));
        if (!Number.isFinite(n)) { errors.push(`${col.label} must be a number`); break; }
        if (col.min !== undefined && n < col.min) { errors.push(`${col.label} must be at least ${col.min}`); break; }
        if (col.max !== undefined && n > col.max) { errors.push(`${col.label} must be at most ${col.max}`); break; }
        data[col.key] = n;
        break;
      }
      case "integer": {
        const n = Math.floor(Number(cell));
        if (!Number.isInteger(n)) { errors.push(`${col.label} must be a whole number`); break; }
        if (col.min !== undefined && n < col.min) { errors.push(`${col.label} must be between ${col.min} and ${col.max}`); break; }
        if (col.max !== undefined && n > col.max) { errors.push(`${col.label} must be between ${col.min} and ${col.max}`); break; }
        data[col.key] = n;
        break;
      }
      case "email":
        if (!EMAIL_RE.test(cell)) { errors.push(`${col.label} is not a valid email`); break; }
        data[col.key] = cell;
        break;
      case "boolean": {
        const b = parseBool(cell);
        if (b === null) { errors.push(`${col.label} must be yes/no`); break; }
        if (b) data[col.key] = true; // false is the default — keep payloads sparse
        break;
      }
      case "enum": {
        const r = coerceEnum(cell, col);
        if (!r.ok) { errors.push(`${col.label} "${cell}" is not a known value`); break; }
        if (r.value) data[col.key] = r.value;
        break;
      }
      default:
        data[col.key] = cell;
    }
  }
  return { data, errors };
}

// ---------------------------------------------------------------------------
// Per-type validators → {valid:[{row,data}], errors:[{row,message}]}
// ---------------------------------------------------------------------------

function dedupeKey(data, fields) {
  return fields.map((f) => normKey(data?.[f])).join("|");
}

function validateWithDedupe(records, typeKey, keyToHeader, keyFields, extraChecks) {
  const valid = [];
  const errors = [];
  const seen = new Map();
  for (const record of records || []) {
    const { data, errors: cellErrors } = extractRow(record, typeKey, keyToHeader);
    const extra = extraChecks ? extraChecks(data) : [];
    const messages = [...cellErrors, ...extra];
    if (messages.length) {
      messages.forEach((message) => errors.push({ row: record.row, message }));
      continue;
    }
    const key = dedupeKey(data, keyFields);
    if (key && key.replace(/\|/g, "")) {
      if (seen.has(key)) {
        errors.push({ row: record.row, message: `Duplicate of row ${seen.get(key)} in this file` });
        continue;
      }
      seen.set(key, record.row);
    }
    valid.push({ row: record.row, data });
  }
  return { valid, errors };
}

export function validateRows(records, typeKey, keyToHeader) {
  switch (typeKey) {
    case "customers":
      return validateWithDedupe(records, typeKey, keyToHeader, ["company_name"]);
    case "customer_contacts":
      return validateWithDedupe(
        records,
        typeKey,
        keyToHeader,
        ["customer", "email", "first_name", "last_name"],
        (data) => (data.first_name || data.last_name || data.email
          ? []
          : ["A contact needs at least a first name, last name, or email"]),
      );
    case "customer_addresses":
      return validateWithDedupe(
        records,
        typeKey,
        keyToHeader,
        ["customer", "address_line_1", "city", "state", "postal_code"],
      );
    case "parts":
      return validateWithDedupe(records, typeKey, keyToHeader, ["name", "size"]);
    case "vendor_associations":
      return validateWithDedupe(records, typeKey, keyToHeader, ["vendor_name", "part_ref"]);
    default:
      throw new Error(`Unknown import type "${typeKey}".`);
  }
}

/**
 * Run the whole pipeline: map headers → validate records.
 * @returns {{ keyToHeader, unmappedHeaders, missingRequired, valid, errors }}
 */
export function validateImport({ headers, records }, typeKey) {
  const { keyToHeader, unmappedHeaders, missingRequired } = mapHeaders(headers, typeKey);
  if (missingRequired.length) {
    return {
      keyToHeader,
      unmappedHeaders,
      missingRequired,
      valid: [],
      errors: (records || []).map((r) => ({ row: r.row, message: `Missing required column(s): ${missingRequired.join(", ")}` })),
    };
  }
  const { valid, errors } = validateRows(records, typeKey, keyToHeader);
  return { keyToHeader, unmappedHeaders, missingRequired, valid, errors };
}

// ---------------------------------------------------------------------------
// Planning + batching
// ---------------------------------------------------------------------------

/**
 * Summary counts for the confirm step.
 * @param {Array} records parsed CSV records
 * @param {{valid:Array, errors:Array}} validation
 * @param {{matchedRows?: number[]}} [opts] rows already present in the target
 */
export function planImport(records, validation, { matchedRows = [] } = {}) {
  const matched = new Set(matchedRows);
  const valid = validation?.valid || [];
  return {
    total: (records || []).length,
    valid: valid.length,
    invalid: (validation?.errors || []).length
      ? new Set((validation.errors || []).map((e) => e.row)).size
      : 0,
    matched: valid.filter((v) => matched.has(v.row)).length,
    toCreate: valid.filter((v) => !matched.has(v.row)).length,
  };
}

export function chunkRows(rows, size = 25) {
  const n = Math.max(1, Math.floor(Number(size) || 25));
  const out = [];
  for (let i = 0; i < (rows || []).length; i += n) out.push(rows.slice(i, i + n));
  return out;
}

// ---------------------------------------------------------------------------
// Payload shaping — entity-ready objects per import type
// ---------------------------------------------------------------------------

/** Non-empty fields only — blanks never overwrite existing data on import. */
export function nonEmptyFields(data, keys) {
  const out = {};
  for (const key of keys) {
    const v = data?.[key];
    if (v !== undefined && v !== null && v !== "") out[key] = v;
  }
  return out;
}

export function toCustomerPayload(data) {
  return nonEmptyFields(data, IMPORT_TYPES.customers.columns.map((c) => c.key));
}

export function toContactPayload(data) {
  return {
    ...nonEmptyFields(data, ["first_name", "last_name", "position", "email", "office_phone", "office_ext", "cell_phone", "contact_status", "job_authority"]),
    is_active: true,
  };
}

export function toLocationPayload(data, customerId, sourceSummary) {
  return {
    customer_id: customerId,
    label: cleanCell(data?.label) || cleanCell(data?.address_line_1),
    ...nonEmptyFields(data, ["address_line_1", "address_line_2", "city", "state", "postal_code", "county", "access_notes", "notes"]),
    country: cleanCell(data?.country) || "US",
    site_type: data?.site_type || "unknown",
    is_primary_site: data?.is_primary_site === true,
    is_billing_address: data?.is_billing_address === true,
    is_active: true,
    ...(sourceSummary ? { source_summary: sourceSummary } : {}),
  };
}

/** Inventory has no name field — the part name is preserved in notes. */
export function toInventoryPayload(data) {
  const payload = {
    material_type: data?.material || "Other",
    product_type: "Other",
    size: cleanCell(data?.size) || cleanCell(data?.name),
    ...nonEmptyFields(data, ["thickness_gauge", "standard_length", "supplier", "barcode", "quantity_on_hand"]),
    cost_per_unit: Number(data?.cost) || 0,
    unit_type: data?.unit || "per_piece",
  };
  const notes = [`Part: ${cleanCell(data?.name)}`, cleanCell(data?.notes)].filter(Boolean);
  const category = cleanCell(data?.category);
  if (category) notes.unshift(`Category: ${category}`);
  payload.notes = notes.join(" — ");
  return payload;
}

/** Loose match of a CSV customer reference against Customer rows. */
export function customerRefMatches(row, ref) {
  const want = normKey(ref);
  if (!want) return false;
  if (normKey(row?.id) === want) return true;
  if (normKey(row?.company_name) === want) return true;
  return (row?.legacy_client_names || []).some((v) => normKey(v) === want);
}

/** Address dedupe identity: owning customer + normalized street/city/state/zip. */
export function locationDedupeKey(customerId, data) {
  return [
    normKey(customerId),
    normKey(data?.address_line_1),
    normKey(data?.city),
    normKey(data?.state),
    normKey(data?.postal_code),
  ].join("|");
}

/** Contact dedupe identity inside a Customer.additional_contacts list. */
export function contactDedupeKey(contact) {
  const email = normKey(contact?.email);
  if (email) return `email:${email}`;
  return `name:${normKey(contact?.first_name)}|${normKey(contact?.last_name)}`;
}

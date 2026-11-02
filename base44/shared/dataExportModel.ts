// Data export model — pure TS, ZERO imports. Safe to bundle into Deno
// functions (base44/functions/*), frontend admin export surfaces, and Node
// test harnesses. No I/O anywhere in this module — the wiring layer (the
// admin export action / admin panel) loads entity rows and these functions
// decide WHICH fields leave the backend, serialize them to CSV, and build
// the manifest + AdminAuditLog event that proves the export happened.
//
// K-04 (ESTIMATOR_MASTERPLAN) — admin export of all estimator data: estimates
// + customers + work orders + invoices + payments + parts/inventory +
// contacts, with an audit event (backlog item 482).
//
// FIELD SAFETY MODEL (staffDataRead parity):
//   * EXPORT_DATASETS carries a curated per-dataset field ALLOWLIST drawn
//     from base44/entities/*.jsonc. Only allowlisted fields may export.
//   * FIELD_DENYLIST is a per-entity named-field denylist — same concept as
//     staffDataRead.FIELD_DENYLIST (credentials/session state never leaves
//     the backend). Applied on top of the allowlist so a deny entry can
//     never be overridden by the registry.
//   * classifyFieldSensitive is a name heuristic: any field carrying a
//     credential-shaped token (password|token|secret|key|hash|session|salt|
//     credential|auth …) is sensitive. Identity/idempotency keys are
//     explicitly SAFE-LISTED — creation_request_key, estimator_creation_key,
//     part_key, and friends stay exportable because the export is a
//     backup/re-import artifact and those keys preserve create-idempotency
//     lineage. Only actual secret-bearing fields are denied.
//   * Transient internal plumbing (pipeline_sync_pending/error,
//     smartsheet_create_attempt, automation_deadline_fired) is excluded from
//     the allowlists — it has no backup value and would mislead a restore.
//     Stored snapshots + remote ids are KEPT (lineage data).
//   * System fields id/created_date/updated_date are implicit on every row —
//     they lead each allowlist and pass through schema-presence filtering.
//
// CSV: rowsToCsv emits RFC-4180 text — a header row, comma separators, and a
// field is double-quoted only when it contains a comma, quote, CR, or LF
// (internal quotes doubled). Nested objects flatten to JSON strings; arrays
// of scalars join '; '; an array containing objects serializes the whole
// array as JSON so structure survives a re-import.
//
// AUDIT: exportAuditEvent returns an AdminAuditLog-shaped row
// ({actor_email, action, target_email, detail, at} — manageAuthorizedUsers
// parity). action 'data_export'; detail is a JSON string carrying the full
// event payload (export_key, actor, dataset_count, row_total, per-dataset
// key/entity/row_count/fields_count/sha_hint).

// ---------------------------------------------------------------------------
// Dataset registry.
// ---------------------------------------------------------------------------

/** Base44 system fields present on every stored row (not in entity schema). */
export const EXPORT_SYSTEM_FIELDS = ['id', 'created_date', 'updated_date'] as const;

export interface ExportDatasetSpec {
  /** Short public key — becomes the CSV file name stem (<key>.csv). */
  key: string;
  /** Backend entity name. */
  entity: string;
  /** Curated exportable-field allowlist (entity properties + system fields). */
  fields: string[];
  /** Human description for the admin picker. */
  description?: string;
}

/**
 * EXPORT_DATASETS — the seven estimator datasets an admin may export.
 * Fields are the entity's top-level properties (base44/entities/*.jsonc)
 * minus transient internal plumbing and credential-shaped fields.
 */
export const EXPORT_DATASETS: ExportDatasetSpec[] = [
  {
    key: 'estimates',
    entity: 'AllInOneEstimate',
    description: 'All-In-One estimate headers, quote settings, and section line_items snapshots.',
    fields: [
      'id', 'created_date', 'updated_date',
      'project_name', 'creation_request_key', 'client_name', 'customer_id',
      'opportunity_id', 'split_from_estimate_id', 'duplicated_from_estimate_id',
      'estimating_request_id', 'work_order_id', 'sales_stage',
      'sales_stage_changed_at', 'estimate_number', 'po_number',
      'delivery_method', 'terms', 'order_contact', 'office_phone',
      'office_phone_ext', 'salesperson', 'sales_center', 'tax_group',
      'hyperlink', 'site_address', 'contact_name', 'contact_email',
      'contact_phone', 'target_install_date', 'accepted_at',
      'accepted_by_name', 'accepted_by_email', 'attachment_refs', 'priority',
      'tags', 'tax_percent', 'deposit_percent', 'discount_percent',
      'contingency_percent', 'shipping_fee', 'permit_fee', 'round_quote_total',
      'quote_valid_days', 'quote_issue_date', 'quote_expiration_date',
      'quote_expired', 'quote_version', 'payment_terms', 'scope_inclusions',
      'scope_exclusions', 'scope_auto_apply', 'hide_section_prices',
      'section_acceptance_mode', 'company_name', 'company_phone',
      'company_email', 'company_address', 'company_website', 'company_license',
      'company_logo_url', 'quote_title', 'quote_accent_color',
      'quote_intro_text', 'quote_footer_text', 'quote_terms_conditions',
      'warranty_text', 'lead_time_text', 'show_company_block', 'show_logo',
      'show_contact_block', 'show_estimate_number', 'show_po_number',
      'show_site_address', 'show_dates', 'show_category_column',
      'show_section_descriptions', 'show_quantity_column', 'show_scope_lists',
      'show_subtotal_line', 'show_discount_line', 'show_fees_line',
      'show_tax_line', 'show_deposit_lines', 'show_notes_on_quote',
      'show_terms_block', 'show_warranty_block', 'show_lead_time_block',
      'show_signature_block', 'show_validity_footer', 'round_prices_to_dollar',
      'status', 'is_template', 'cancel_reason', 'cancelled_at', 'archived_at',
      'archived_reason', 'line_items', 'total_cost', 'quote_total',
      'internal_approval', 'volume_discount_tiers', 'category_adjustments',
      'pricing_tier', 'personal_tags', 'notes', 'notes_log', 'edit_reason',
      'last_product_removal_key', 'last_product_removal_line_id',
      'last_product_removal_at', 'deleted', 'deleted_at', 'deleted_by',
      'entered_by_display', 'follow_up_date', 'follow_up_state',
      'payment_terms_label', 'internal_discount', 'fee_lines',
      // excluded (transient internal plumbing): pipeline_sync_pending,
      // pipeline_sync_error
    ],
  },
  {
    key: 'customers',
    entity: 'Customer',
    description: 'Shared customer accounts — contacts, billing/location addresses, terms, tax, credit.',
    fields: [
      'id', 'created_date', 'updated_date',
      'company_name', 'estimator_creation_key', 'creation_request_key',
      'company_phone', 'company_fax', 'website', 'additional_phone',
      'additional_phone_type', 'last_contacted_at', 'merged_into_customer_id',
      'customer_status', 'status', 'customer_type', 'warning_flags',
      'warning_flag_details', 'tags', 'contact_first_name', 'contact_last_name',
      'contact_position', 'contact_email', 'contact_office_phone',
      'contact_office_ext', 'contact_cell_phone', 'contact_additional_phone',
      'contact_additional_phone_type', 'contact_status', 'job_authority',
      'billing_contact_same', 'billing_contact_name', 'billing_contact_email',
      'billing_contact_phone', 'additional_contacts', 'billing_address_1',
      'billing_address_2', 'billing_city', 'billing_state',
      'billing_postal_code', 'billing_postal_ext', 'billing_country',
      'location_same_as_billing', 'location_address_1', 'location_address_2',
      'location_city', 'location_state', 'location_postal_code', 'salesperson',
      'location', 'default_tax_group', 'quote_valid_days',
      'customer_origination', 'origination_path', 'industry_type',
      'master_account', 'master_account_id', 'terms', 'credit_terms_days',
      'tax_exempt', 'tax_id_number', 'tax_exempt_expiration',
      'tax_exempt_reason', 'tax_exempt_id', 'tax_exempt_expires',
      'tax_exemption', 'require_purchase_order', 'po_required',
      'po_required_note', 'shipping_account', 'credit_limit', 'credit_hold',
      'in_store_credit', 'in_store_credit_balance', 'pricing_tier',
      'pricing_tier_set_by', 'pricing_tier_set_at', 'send_monthly_statements',
      'is_active', 'auto_inactive_after_months', 'auto_inactive_months',
      'notes', 'legacy_client_names',
    ],
  },
  {
    key: 'work_orders',
    entity: 'WorkOrder',
    description: 'Workflow jobs — stages, scheduling, permitting, sales tracking, attachments.',
    fields: [
      'id', 'created_date', 'updated_date',
      'title', 'client_name', 'customer_id', 'opportunity_id',
      'estimating_request_id', 'estimate_id', 'estimate_ids', 'materials',
      'description', 'image_url', 'attachment_refs', 'files',
      'google_drive_folder_url', 'google_drive_file_ids', 'current_stage',
      'manual_stage_override', 'fulfillment_method', 'priority', 'assigned_to',
      'notes', 'milestones', 'project_health', 'health_override',
      'health_notes', 'work_notes', 'follow_up', 'due_date', 'start_date',
      'is_rider', 'parent_work_order_id', 'rider_stage', 'completed', 'asap',
      'dependencies', 'in_pipeline', 'sales_import_source_id',
      'sales_import_last_synced_at', 'sales_import_snapshot',
      'smartsheet_sheet_id', 'smartsheet_row_id', 'smartsheet_parent_row_id',
      'smartsheet_last_synced_at', 'smartsheet_sync_snapshot',
      'sales_status', 'sales_neutral_closed_at', 'lead_source',
      'current_task_deadline', 'current_task_assigned_to', 'designer',
      'surveyor', 'site_survey_date', 'site_survey_time', 'site_survey_am_pm',
      'project_manager', 'estimator', 'est_inv_at',
      'corbridge_invoice_number', 'corbridge_link', 'estimate_amount',
      'estimate_revision_required', 'current_task_description',
      'date_initial_contact', 'date_estimate_sent',
      'sales_quote_sent_verified_at', 'date_order_created',
      'project_install_date', 'install_route_order', 'permit_submitted_date',
      'permit_receipt_confirmed_date', 'permit_number', 'permit_approved_date',
      'actual_cost', 'profit_margin', 'contact_name', 'contact_email',
      'contact_phone', 'representative', 'additional_contact',
      'follow_up_date', 'sales_last_follow_up_completed_at',
      'sales_last_follow_up_outcome', 'close_date', 'expected_close_date',
      'sales_last_activity_at', 'sales_stage_changed_at', 'lost_reason',
      'project_type', 'install_location', 'address_line_2',
      'billing_address', 'billing_address_line_2', 'billing_schedule',
      'deposit_required', 'deposit_amount', 'deposit_invoiced', 'sales_rep',
      'permitting', 'township_city', 'county', 'permit_code', 'permit_class',
      'property_owner', 'pud', 'parcel_number', 'electrical_ibi',
      'electrical_nkyei', 'electrical_nec', 'electrical_city',
      'electrical_county', 'customer_is_building_owner', 'customer_is_tenant',
      'customer_is_marketing_co', 'business_co_coo_reminder',
      'business_co_coo_date', 'install_yes', 'install_no', 'budget_less_than',
      'removal_yes', 'removal_no', 'service_repair', 'origination', 'patch',
      'paint', 'color', 'products', 'product_1', 'product_2', 'product_3',
      'product_4', 'product_5', 'product_6', 'cb_complete', 'cf_complete',
      'cc_complete', 'sms_complete', 'deleted', 'deleted_at', 'deleted_by',
      'production_type', 'sip_checklist', 'mmm_sip_checklist',
      'mmm_checklist', 'sip_completed', 'sip_revisit_date',
      'mmm_last_discussed_at', 'mmm_defer_until', 'mmm_tasks',
      // excluded (transient internal plumbing): smartsheet_create_attempt,
      // automation_deadline_fired
    ],
  },
  {
    key: 'invoices',
    entity: 'Invoice',
    description: 'Customer invoices — line items, totals, status, GL split metadata.',
    fields: [
      'id', 'created_date', 'updated_date',
      'schema_version', 'creation_request_key', 'invoice_number', 'status',
      'billing_type', 'customer_id', 'customer_display_name', 'opportunity_id',
      'estimating_request_id', 'estimate_id', 'work_order_id', 'contact_id',
      'location_id', 'line_items', 'subtotal', 'discount_amount', 'tax_rate',
      'tax_amount', 'deposit_applied', 'credit_applied', 'total', 'pay_url',
      'amount_paid', 'balance_due', 'issue_date', 'due_date', 'terms',
      'sent_date', 'paid_date', 'voided_date', 'void_reason', 'notes',
      'internal_notes', 'created_by', 'updated_by', 'source_summary',
      'fee_lines', 'salesperson', 'entered_by', 'income_account_splits',
      'statement_batch_id', 'splits_override', 'splits_override_by',
      'splits_override_at', 'splits_override_reason',
    ],
  },
  {
    key: 'payments',
    entity: 'Payment',
    description: 'Receipts, refunds, and credit memos applied to invoices.',
    fields: [
      'id', 'created_date', 'updated_date',
      'schema_version', 'creation_request_key', 'invoice_id', 'customer_id',
      'opportunity_id', 'estimate_id', 'work_order_id', 'amount', 'method',
      'reference_number', 'paid_date', 'status', 'void_reason', 'voided_date',
      'notes', 'refund_of_payment_id', 'refunded_amount',
      'reconciliation_batch_id', 'portal_source',
      'deposit_applied_to_invoice_id', 'gl_memo', 'created_by',
    ],
  },
  {
    key: 'parts',
    entity: 'Inventory',
    description: 'Master inventory stock catalog (extruded/sheet stock; is_pole rows feed Foundation).',
    fields: [
      'id', 'created_date', 'updated_date',
      'material_type', 'product_type', 'size', 'thickness_gauge',
      'standard_length', 'cost_per_unit', 'unit_type', 'supplier', 'notes',
      'is_pole', 'legacy_source_id', 'legacy_compatibility',
      'quantity_on_hand', 'reorder_point', 'image_url', 'barcode', 'deleted',
      'income_account', 'cogs_account',
    ],
  },
  {
    key: 'contacts',
    entity: 'CustomerContact',
    description: 'Per-customer contact records — roles, phones, email groups.',
    fields: [
      'id', 'created_date', 'updated_date',
      'schema_version', 'creation_request_key', 'customer_id', 'first_name',
      'last_name', 'display_name', 'position', 'email', 'phone', 'phone_ext',
      'mobile_phone', 'authority_role', 'is_primary', 'is_billing_contact',
      'is_site_contact', 'role', 'email_groups', 'preferred_contact_method',
      'source_summary', 'notes', 'contact_status', 'is_active',
    ],
  },
];

/** Look up a registry dataset by dataset key or entity name. */
export function datasetFor(keyOrEntity: unknown): ExportDatasetSpec | null {
  const k = String(keyOrEntity || '').trim();
  if (!k) return null;
  return EXPORT_DATASETS.find((d) => d.key === k || d.entity === k) || null;
}

// ---------------------------------------------------------------------------
// Denylist — staffDataRead.FIELD_DENYLIST parity. Named fields here never
// leave the backend regardless of the allowlist (belt-and-suspenders over
// the name heuristic for known secret-bearing columns).
// ---------------------------------------------------------------------------

export const FIELD_DENYLIST: Record<string, string[]> = {
  // Same secrets as staffDataRead — credentials, bearer tokens, biometric
  // descriptors, and session-revocation state are never exportable.
  AuthorizedEmail: [
    'password_hash',
    'password_reset_token',
    'password_reset_token_hash',
    'password_reset_expires',
    'onboarding_token',
    'onboarding_token_hash',
    'onboarding_expires',
    'session_not_before',
    'failed_login_count',
    'login_locked_until',
    'face_descriptors',
  ],
};

// ---------------------------------------------------------------------------
// Sensitive-field classification.
// ---------------------------------------------------------------------------

/** Tokens that mark a field as secret-bearing when they appear as a whole
 *  name segment (password_hash → ['password','hash'], sessionToken →
 *  ['session','token']). Whole-segment matching keeps authority_role,
 *  tax_id_number, and pay_url exportable. 'key' is intentionally included —
 *  credential keys (api_key, access_key, private_key, license_key) must be
 *  denied — while identity/idempotency keys are carved back out by
 *  SENSITIVE_SAFE_LIST / SAFE_KEY_RE below. */
const SENSITIVE_TOKENS = new Set([
  'password', 'passwd', 'pwd', 'passphrase',
  'token', 'tokens',
  'secret', 'secrets',
  'hash', 'hashes',
  'session', 'sessions',
  'salt', 'salts',
  'credential', 'credentials',
  'auth', 'oauth', 'jwt', 'bearer', 'csrf', 'xsrf',
  'key', 'keys',
  'private', 'encrypted', 'encryption',
  'apikey',
  'pin',
]);

/** Fused-compound fallback for names with no separators at all
 *  ('passwordhash', 'accesstoken', 'sessiontoken'). */
const SENSITIVE_FUSED_RE =
  /(password|passwd|passphrase|credential|apikey|secretkey|privatekey|accesstoken|refreshtoken|sessiontoken|bearertoken|oauth|jwt)/i;

/** Explicit safe-list — known identity/idempotency keys kept for re-import
 *  fidelity (creation_request_key lineage preserves create-idempotency). */
export const SENSITIVE_SAFE_LIST = new Set<string>([
  'creation_request_key',
  'estimator_creation_key',
  'idempotency_key',
  'last_product_removal_key',
  'last_part_group_mutation_key',
  'quick_product_insert_key',
  'blank_product_insert_key',
  'part_key',
  'part_group_key',
  'module_key',
  'source_module_key',
  'template_family_key',
  'export_key',
  'import_key',
  'sync_key',
  'row_key',
  'line_key',
  'item_key',
  'record_key',
  'dataset_key',
  'group_key',
  'family_key',
  'source_key',
  'batch_key',
  'dedupe_key',
  'merge_key',
  'parent_key',
  'link_key',
  'doc_key',
  'document_key',
  'category_key',
  'inventory_key',
  'product_key',
  'vendor_key',
  'project_key',
  'estimate_key',
  'order_key',
  'invoice_key',
  'payment_key',
  'customer_key',
  'contact_key',
]);

/** Safe *_key prefixes — non-credential identity/lineage key contexts. A
 *  trailing '_key' field is exportable when its prefix is one of these;
 *  credential prefixes (api/access/secret/private/license/master/session/
 *  token/auth/oauth/ssh/tls/ssl/signing/encryption/public/server/client)
 *  are deliberately absent so those keys stay denied. */
const SAFE_KEY_PREFIX_RE =
  /(?:^|_)(request|idempotency|mutation|insert|removal|family|group|part|module|source_module|line|row|item|record|dataset|export|import|sync|display|sort|search|origin|source|job|batch|run|dedupe|natural|merge|parent|child|link|lookup|match|document|doc|option|field|column|section|segment|stage|status|type|category|catalog|inventory|product|vendor|node|route|page|view|filter|queue|lane|card|report|setting|preference|policy|rule|template|tab|metric|feature|flag|step|task|form|variant|style|theme|layout|entity|schema|project|estimate|order|invoice|payment|customer|contact|user|role|entry|unit|kind|class|tier|level|sequence|series|slot|lane|bucket|question|answer|choice|snapshot|revision|version)_?key$/;

/**
 * classifyFieldSensitive — true when a field name smells secret-bearing:
 * any whole name-segment in SENSITIVE_TOKENS (password|token|secret|key|
 * hash|session|salt|credential|auth …) or a fused credential compound.
 * SENSITIVE_SAFE_LIST and SAFE_KEY_PREFIX_RE override for identity/
 * idempotency keys so re-import lineage survives the export.
 */
export function classifyFieldSensitive(field_name: unknown): boolean {
  const raw = String(field_name || '').trim();
  const name = raw.toLowerCase();
  if (!name) return false;
  if (SENSITIVE_SAFE_LIST.has(name)) return false;
  // camelCase/PascalCase → snake before segmenting (passwordResetToken).
  const tokens = raw
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  for (const t of tokens) {
    if (SENSITIVE_TOKENS.has(t)) {
      // A bare 'key'/'keys' segment is sensitive only outside the known
      // identity-key shapes — check the safe prefix carve-out.
      if ((t === 'key' || t === 'keys') && SAFE_KEY_PREFIX_RE.test(name)) {
        continue;
      }
      return true;
    }
  }
  return SENSITIVE_FUSED_RE.test(name);
}

// ---------------------------------------------------------------------------
// exportableFields — allowlist ∩ schema ∩ (not denied) ∩ (not sensitive).
// ---------------------------------------------------------------------------

/** RLS-verb keys — never data fields, even when a caller hands over a raw
 *  properties map or field list that includes them. (Everything else —
 *  'name', 'type', 'description' — is legitimate schema data and exports.) */
const NON_DATA_KEYS = new Set(['create', 'read', 'update', 'delete']);

/**
 * Pull a field-name list out of an entity schema. Accepts a parsed entity
 * jsonc object ({name, properties:{...}}), {properties:[{name}…]}, a bare
 * {fields:[…]}, an array of field-name strings, or a JSON string of any of
 * those (full-line // comments tolerated). Returns [] when no field list is
 * recoverable — callers must treat that as "schema unknown".
 */
function schemaFieldNames(entity_json: unknown): string[] {
  let node: any = entity_json;
  if (typeof node === 'string') {
    try {
      node = JSON.parse(node);
    } catch {
      try {
        // Tolerate full-line // comments (never inline — strings may hold
        // URLs) then retry.
        node = JSON.parse(String(entity_json).replace(/^[ \t]*\/\/[^\n]*$/gm, ''));
      } catch {
        return [];
      }
    }
  }
  if (Array.isArray(node)) {
    return node
      .map((v) => (typeof v === 'string' ? v : cleanName(v && (v.name || v.field || v.key))))
      .filter(Boolean) as string[];
  }
  if (!node || typeof node !== 'object') return [];
  const props = node.properties !== undefined ? node.properties : node.fields;
  if (Array.isArray(props)) {
    return props
      .map((v) => (typeof v === 'string' ? v : cleanName(v && (v.name || v.field || v.key))))
      .filter(Boolean) as string[];
  }
  if (props && typeof props === 'object') return Object.keys(props);
  return [];
}

const cleanName = (v: unknown): string => String(v || '').trim();

/**
 * exportableFields(entity_name, entity_json) → the ordered field list an
 * export may emit for one entity.
 *   - Registered dataset: allowlist order, optionally pruned to fields the
 *     schema actually declares (system fields always pass — they are real
 *     row data, just absent from `properties`).
 *   - Unregistered entity with a schema: schema property order (fail-open
 *     to the schema, still denylist/heuristic filtered).
 *   - Neither registry nor schema: [] (fail-closed — never guess fields).
 * FIELD_DENYLIST[entity] and classifyFieldSensitive then strip anything
 * secret-bearing from whatever survived.
 */
export function exportableFields(entity_name: unknown, entity_json?: unknown): string[] {
  const entityName = String(entity_name || '').trim();
  if (!entityName) return [];
  const ds = datasetFor(entityName);
  const schema = schemaFieldNames(entity_json);
  const schemaSet = new Set(schema);
  const system = new Set<string>(EXPORT_SYSTEM_FIELDS);

  let base: string[];
  if (ds && ds.fields.length) {
    base = schema.length
      ? ds.fields.filter((f) => schemaSet.has(f) || system.has(f))
      : [...ds.fields];
  } else if (schema.length) {
    base = schema.filter((f) => !NON_DATA_KEYS.has(f));
  } else {
    return [];
  }

  const denied = new Set(FIELD_DENYLIST[entityName] || []);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const f of base) {
    if (!f || seen.has(f) || denied.has(f) || classifyFieldSensitive(f)) continue;
    seen.add(f);
    out.push(f);
  }
  return out;
}

// ---------------------------------------------------------------------------
// rowsToCsv — RFC-4180.
// ---------------------------------------------------------------------------

const isScalar = (v: unknown): boolean =>
  v === null || v === undefined ||
  typeof v === 'string' || typeof v === 'number' ||
  typeof v === 'boolean' || v instanceof Date;

/** Raw (unescaped) cell text. Objects → JSON strings; arrays of scalars →
 *  '; '-joined; an array holding any object serializes whole as JSON so
 *  nested structure survives a re-import. */
export function csvCellText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) {
    const t = value.getTime();
    return Number.isFinite(t) ? value.toISOString() : '';
  }
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    if (!value.length) return '';
    if (value.every(isScalar)) {
      return value.map((v) => csvCellText(v)).join('; ');
    }
    try {
      return JSON.stringify(value);
    } catch {
      return '';
    }
  }
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return '';
    }
  }
  return String(value);
}

/** RFC-4180 field escape — quote only when the text carries , " CR or LF. */
function csvEscape(text: string): string {
  if (/[",\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

/**
 * rowsToCsv(rows, fields) → CSV text: header row of field names, then one
 * record per row, CRLF line endings, no trailing newline. When `fields` is
 * empty the column set is the union of row keys in first-seen order.
 */
export function rowsToCsv(rows: unknown, fields?: unknown): string {
  const list = Array.isArray(rows) ? rows : [];
  let cols = Array.isArray(fields)
    ? (fields.map((f) => cleanName(f)).filter(Boolean) as string[])
    : [];
  if (!cols.length) {
    const seen = new Set<string>();
    for (const row of list) {
      if (!row || typeof row !== 'object') continue;
      for (const k of Object.keys(row as Record<string, unknown>)) {
        if (!seen.has(k)) { seen.add(k); cols.push(k); }
      }
    }
  }
  const lines: string[] = [cols.map(csvEscape).join(',')];
  for (const row of list) {
    const r = (row && typeof row === 'object' ? row : {}) as Record<string, unknown>;
    lines.push(cols.map((c) => csvEscape(csvCellText(r[c]))).join(','));
  }
  return lines.join('\r\n');
}

// ---------------------------------------------------------------------------
// Export manifest + audit event.
// ---------------------------------------------------------------------------

export interface ExportManifestDataset {
  key: string;
  entity: string;
  row_count: number;
  fields_count: number;
  sha_hint: string;
}

export interface ExportManifest {
  export_key: string;
  requested_by: string;
  requested_at: string;
  format: 'csv';
  version: 1;
  dataset_count: number;
  row_total: number;
  datasets: ExportManifestDataset[];
}

/** FNV-1a 32-bit → 8-hex. Deterministic content hint — NOT a security
 *  digest (zero-import module; name is sha_hint on purpose). */
export function shaHint(text: unknown): string {
  const s = String(text ?? '');
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/** Accept ISO string / Date / epoch-ms; return ISO (new-Date ISO when absent). */
function toIso(now: unknown): string {
  if (now instanceof Date) {
    const t = now.getTime();
    return Number.isFinite(t) ? now.toISOString() : new Date().toISOString();
  }
  if (typeof now === 'number' && Number.isFinite(now)) {
    return new Date(now).toISOString();
  }
  const s = String(now || '').trim();
  if (s) {
    const t = Date.parse(s);
    if (Number.isFinite(t)) return new Date(t).toISOString();
  }
  return new Date().toISOString();
}

const toEpochMs = (now: unknown): number => Date.parse(toIso(now));

/**
 * Normalize one manifest dataset entry. Accepts a registry spec
 * ({key,entity,fields}), a flat runtime entry ({key?,entity,row_count?|
 * rows?,fields?}), or {dataset, rows, fields?}. Row count prefers explicit
 * row_count, then rows.length; fields prefer explicit fields, then the
 * registry allowlist for the named entity.
 */
function manifestDataset(input: unknown): ExportManifestDataset | null {
  if (!input || typeof input !== 'object') return null;
  const src: any = input;
  const inner = src.dataset && typeof src.dataset === 'object' ? src.dataset : src;
  const entity = cleanName(inner.entity);
  if (!entity) return null;
  const reg = datasetFor(inner.key || entity);
  const key = cleanName(inner.key) || (reg ? reg.key : entity.toLowerCase());
  const fields: string[] = Array.isArray(src.fields) ? src.fields
    : Array.isArray(inner.fields) ? inner.fields
    : (reg ? reg.fields : []);
  const rows = Array.isArray(src.rows) ? src.rows
    : Array.isArray(inner.rows) ? inner.rows : null;
  const rowCount = Number.isFinite(Number(src.row_count ?? inner.row_count))
    ? Number(src.row_count ?? inner.row_count)
    : (rows ? rows.length : 0);
  const firstId = rows && rows.length ? cleanName(rows[0] && rows[0].id) : '';
  const lastId = rows && rows.length ? cleanName(rows[rows.length - 1] && rows[rows.length - 1].id) : '';
  const sha_hint = shaHint(`${key}|${entity}|${rowCount}|${fields.join(',')}|${firstId}|${lastId}`);
  return { key, entity, row_count: rowCount, fields_count: fields.length, sha_hint };
}

/**
 * exportManifest(datasets, {actor_id, now, rand}) → the manifest row that
 * travels beside the CSV files. `now` accepts ISO/Date/epoch-ms; `rand` may
 * inject a deterministic suffix for tests. export_key shape:
 * `export:<epoch-ms>:<rand>`.
 */
export function exportManifest(
  datasets: unknown,
  options: { actor_id?: unknown; now?: unknown; rand?: unknown } = {},
): ExportManifest {
  const list = (Array.isArray(datasets) ? datasets : [])
    .map(manifestDataset)
    .filter(Boolean) as ExportManifestDataset[];
  const requestedAt = toIso(options.now);
  const rand = cleanName(options.rand) ||
    Math.random().toString(36).slice(2, 8);
  const exportKey = `export:${toEpochMs(options.now)}:${rand}`;
  return {
    export_key: exportKey,
    requested_by: cleanName(options.actor_id),
    requested_at: requestedAt,
    format: 'csv',
    version: 1,
    dataset_count: list.length,
    row_total: list.reduce((s, d) => s + d.row_count, 0),
    datasets: list,
  };
}

/**
 * exportAuditEvent(manifest, {actor_id, now}) → an AdminAuditLog-shaped row
 * ({actor_email, action, target_email, detail, at} — matches
 * base44/entities/AdminAuditLog.jsonc and the manageAuthorizedUsers write
 * convention). action is 'data_export'; `detail` is a JSON string carrying
 * the full event payload so the admin audit view can render dataset counts
 * without a schema change.
 */
export function exportAuditEvent(
  manifest: unknown,
  options: { actor_id?: unknown; now?: unknown } = {},
): Record<string, string> {
  const m = (manifest && typeof manifest === 'object' ? manifest : {}) as Partial<ExportManifest>;
  const actor = cleanName(options.actor_id) || cleanName(m.requested_by) || 'unknown';
  const datasets = Array.isArray(m.datasets) ? m.datasets : [];
  const detail = {
    event: 'data_export',
    export_key: cleanName(m.export_key),
    actor,
    dataset_count: Number.isFinite(Number(m.dataset_count)) ? Number(m.dataset_count) : datasets.length,
    row_total: Number.isFinite(Number(m.row_total))
      ? Number(m.row_total)
      : datasets.reduce((s, d: any) => s + (Number(d && d.row_count) || 0), 0),
    datasets: datasets.map((d: any) => ({
      key: cleanName(d && d.key),
      entity: cleanName(d && d.entity),
      row_count: Number(d && d.row_count) || 0,
      fields_count: Number(d && d.fields_count) || 0,
      sha_hint: cleanName(d && d.sha_hint),
    })),
  };
  return {
    actor_email: actor,
    action: 'data_export',
    target_email: '',
    detail: JSON.stringify(detail),
    at: toIso(options.now),
  };
}

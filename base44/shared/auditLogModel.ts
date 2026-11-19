// Admin audit-log model — pure TS, ZERO imports, NO IO. Every function is
// deterministic over its arguments so it can run identically in a deployed
// base44 function, the Vite frontend, or a Node test harness.
// (ESTIMATOR_MASTERPLAN K-06 / item 490: "who changed what/when" across
// estimator entities — activity records -> admin page w/ entity/user/date
// filters. This module owns the pure normalization/merge semantics; the page
// and any backend reader are wiring items.)
//
// ---------------------------------------------------------------------------
// SOURCES SURVEYED (field maps verified against base44/entities/*.jsonc)
// ---------------------------------------------------------------------------
// ProductActivity (B-12 w-35 productAuditModel + D-11 w-64 override
//   provenance — both write THIS row shape, so one source def covers ops
//   audit AND the price_override money trail):
//     occurred_at (declared ts) · actor_label + actor_type (staff|customer|
//     vendor|system) · product_id/product_label = audited record ·
//     work_order_id = parent · event_type · from_value/to_value/note ·
//     details{field,field_label,edits,override_type,...}
// ActivityLog:
//     no declared ts -> created_date system field · performed_by_name/
//     performed_by_email · work_order_id + work_order_title · action_type ·
//     action_details · previous_value/new_value
// OpportunityActivity:
//     no declared ts -> created_date · actor (+assigned_to/completed_by/
//     created_by fallbacks) · opportunity_id|work_order_id|customer_id ref
//     chain (standalone CRM events may omit opportunity_id) · event_type ·
//     summary (required) · subject/company_name/contact_name labels ·
//     details/notes/outcome/source
// AdminAuditLog (admin-only RLS — user-management actions):
//     at (declared ts) · actor_email · action · target_email (audited
//     "record" is the staff/user account acted on) · detail
// EstimateRevision (already merged by src/pages/AuditLog.jsx):
//     updated_date -> created_date/started_at/completed_at · created_by_email/
//     created_by · estimate_id (+estimate_number label) · revision_type ·
//     reason + change_summary[] + previous/new_status · work_order_id parent
// FieldAudit (per-field WorkOrder/Order change journal):
//     modified_at · actor_name/actor_email · ROW-CARRIED entity_type +
//     entity_id (entity_type_field mode) · field_name · old/new_value ·
//     source (app|smartsheet|admin) + status (pending|committed|aborted)
//
// ---------------------------------------------------------------------------
// DECISIONS
// ---------------------------------------------------------------------------
// D1 — REGISTRY IS DECLARATIVE FIELD MAPS. AUDIT_SOURCES entries carry the
//      spec'd keys {entity, label, actor_fields, ts_field, entity_ref_fields}
//      plus the extra maps heterogeneous rows need (email/ts fallbacks,
//      entity label fields, parent refs, ref->type chains, summary/detail
//      field lists). New sources are added by appending one entry; the
//      normalize/merge code never gains per-source branches (the only
//      per-entity logic left is summary PHRASING, isolated in
//      summaryFor() — field extraction itself stays map-driven).
// D2 — NORMALIZED ROW = the spec'd union:
//        {id, occurred_at, actor_label, actor_email, entity_type, entity_id,
//         entity_label, event_type, summary, detail?}
//      plus source/source_label/actor_type/parent_entity_type/parent_entity_id
//      extras the admin page needs for source chips and WO-level filtering.
//      id is `${source}:${row.id}` so cross-source ids never collide; rows
//      without an entity id fall back to creation_request_key/event_key/
//      save_attempt_id (the retry-safe receipts these tables already carry).
// D3 — UNDATED ROWS SORT LAST, never silently dropped from an unfiltered
//      feed. When from/to bounds ARE set an unparseable occurred_at is
//      excluded — an undated row cannot prove it is inside the window and a
//      date-filtered admin view must not leak out-of-range records.
// D4 — entity_type FILTER matches EITHER the audited entity type
//      (row.entity_type: Product/WorkOrder/Opportunity/User/Estimate/Order/…)
//      OR the source entity name (row.source: 'ProductActivity', 'FieldAudit'
//      …) OR the parent entity type (ProductActivity->WorkOrder rows also
//      surface under a 'WorkOrder' filter). Rationale: an admin filtering
//      "WorkOrder" wants the WO activity log AND product-level edits on that
//      WO, while filtering "ProductActivity" narrows to that trail alone.
// D5 — user FILTER: case-insensitive exact match against actor_email OR
//      actor_label first (dropdown selection semantics); if neither matches
//      exactly, falls back to substring on both (free-text forgiveness).
//      Documented so the page's actor dropdown and search box can share it.
// D6 — q FILTER: case-insensitive substring over actor_label, actor_email,
//      entity_label, entity_id, summary, event_type. (Spec requires actor/
//      entity_label/summary; entity_id + event_type added because "find
//      everything on estimate EST-1042" and "find all status_change events"
//      are the two most natural admin searches.)
// D7 — STABLE NEWEST-FIRST ORDER: occurred_at desc; equal timestamps keep
//      merge (insertion) order via an explicit sequence tiebreak — same
//      convention orderHistoryModel uses for the order feed.
// ---------------------------------------------------------------------------

const clean = (v: any): string => String(v ?? '').trim();
const norm = (v: any): string => clean(v).toLowerCase();
const asObj = (v: any): Record<string, any> => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
const firstText = (...vals: any[]): string => {
  for (const v of vals) {
    if (typeof v === 'string' && clean(v)) return clean(v);
    if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  }
  return '';
};

const EMAIL_RX = /@/;

// "status_change" -> "Status change"; "Call: Prospecting" -> "Call:
// Prospecting" (colon phrases are already human). Used for event_type chips
// and as a summary fallback when a row carries no prose.
export function humanizeAuditToken(token: any): string {
  const s = clean(token);
  if (!s) return '';
  if (s.includes(':')) return s;
  return s.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

// from -> to arrow shared by the ProductActivity/ActivityLog/FieldAudit
// summary builders (same convention as productAuditModel.formatAuditLine).
const moveArrow = (from: any, to: any): string => {
  const f = clean(from);
  const t = clean(to);
  if (f && t) return `${f} → ${t}`;
  if (t) return `set to ${t}`;
  if (f) return `cleared ${f}`;
  return '';
};

// ---------------------------------------------------------------------------
// Source registry
// ---------------------------------------------------------------------------

export interface AuditSourceDef {
  entity: string;
  label: string;
  actor_fields: string[];          // actor display-name candidates, priority order
  actor_email_fields: string[];    // fields that may carry the actor's email
  ts_field: string;                // primary event-time field ('' -> created_date chain)
  ts_fallback_fields: string[];    // additional time fields before created_date
  entity_type: string;             // audited entity type ('' when the row carries its own)
  entity_type_field?: string;      // row field holding the audited type (FieldAudit)
  entity_ref_fields: string[];     // audited-record id candidates, first non-blank wins
  entity_ref_types?: string[];     // per-position type for entity_ref_fields (ref chains)
  entity_label_fields: string[];   // stored display-label candidates for the audited record
  parent_entity_type?: string;     // parent record type for roll-up filtering
  parent_ref_fields?: string[];    // parent id candidates
  event_fields: string[];          // event-type candidates, first non-blank wins
  event_type_fixed?: string;       // used when the source has no event field (FieldAudit)
  summary_fields: string[];        // preferred prose-summary candidates
  detail_fields: string[];         // fields folded into detail{}
}

export const AUDIT_SOURCES: AuditSourceDef[] = [
  {
    entity: 'ProductActivity',
    label: 'Product history',
    actor_fields: ['actor_label', 'actor_email', 'actor', 'created_by'],
    actor_email_fields: ['actor_email'],
    ts_field: 'occurred_at',
    ts_fallback_fields: ['created_date'],
    entity_type: 'Product',
    entity_ref_fields: ['product_id'],
    entity_label_fields: ['product_label'],
    parent_entity_type: 'WorkOrder',
    parent_ref_fields: ['work_order_id'],
    event_fields: ['event_type'],
    summary_fields: ['note'],
    detail_fields: ['details', 'note', 'from_value', 'to_value', 'actor_type'],
  },
  {
    entity: 'ActivityLog',
    label: 'Order activity',
    actor_fields: ['performed_by_name', 'performed_by_email', 'created_by'],
    actor_email_fields: ['performed_by_email'],
    ts_field: 'created_date',
    ts_fallback_fields: ['updated_date'],
    entity_type: 'WorkOrder',
    entity_ref_fields: ['work_order_id'],
    entity_label_fields: ['work_order_title'],
    event_fields: ['action_type'],
    summary_fields: ['action_details'],
    detail_fields: ['previous_value', 'new_value'],
  },
  {
    entity: 'OpportunityActivity',
    label: 'Opportunity activity',
    actor_fields: ['actor', 'created_by', 'assigned_to', 'completed_by'],
    actor_email_fields: ['actor_email'],
    ts_field: 'created_date',
    ts_fallback_fields: ['updated_date', 'completed_at'],
    entity_type: 'Opportunity',
    // Standalone CRM events may omit opportunity_id — ref chain walks
    // opportunity -> work order -> customer; the type follows whichever
    // field actually supplied the id (entity_ref_types positional map).
    entity_ref_fields: ['opportunity_id', 'work_order_id', 'customer_id'],
    entity_ref_types: ['Opportunity', 'WorkOrder', 'Customer'],
    entity_label_fields: ['subject', 'company_name', 'contact_name'],
    event_fields: ['event_type'],
    summary_fields: ['summary', 'subject', 'notes'],
    detail_fields: ['details', 'notes', 'source', 'outcome', 'due_at'],
  },
  {
    entity: 'AdminAuditLog',
    label: 'Admin action',
    actor_fields: ['actor_email', 'created_by'],
    actor_email_fields: ['actor_email'],
    ts_field: 'at',
    ts_fallback_fields: ['created_date'],
    entity_type: 'User',
    entity_ref_fields: ['target_email'],
    entity_label_fields: ['target_email'],
    event_fields: ['action'],
    summary_fields: ['detail'],
    detail_fields: ['target_email'],
  },
  {
    entity: 'EstimateRevision',
    label: 'Estimate revision',
    actor_fields: ['created_by_email', 'created_by'],
    actor_email_fields: ['created_by_email'],
    ts_field: 'updated_date',
    ts_fallback_fields: ['created_date', 'completed_at', 'started_at'],
    entity_type: 'Estimate',
    entity_ref_fields: ['estimate_id'],
    entity_label_fields: ['estimate_number'],
    parent_entity_type: 'WorkOrder',
    parent_ref_fields: ['work_order_id'],
    event_fields: ['revision_type'],
    summary_fields: ['reason'],
    detail_fields: [
      'change_summary', 'previous_status', 'new_status',
      'previous_quote_total', 'new_quote_total', 'revision_number',
      'quote_version', 'revision_status', 'notes',
    ],
  },
  {
    entity: 'FieldAudit',
    label: 'Field change',
    actor_fields: ['actor_name', 'actor_email', 'created_by'],
    actor_email_fields: ['actor_email'],
    ts_field: 'modified_at',
    ts_fallback_fields: ['created_date'],
    entity_type: '',                    // each row declares its own entity_type
    entity_type_field: 'entity_type',
    entity_ref_fields: ['entity_id'],
    entity_label_fields: [],
    event_fields: [],
    event_type_fixed: 'field_change',
    summary_fields: [],
    detail_fields: [
      'field_name', 'old_value', 'new_value', 'source', 'status',
      'save_attempt_id', 'preview_truncated',
    ],
  },
];

const SOURCE_BY_ENTITY: Record<string, AuditSourceDef> = {};
for (const def of AUDIT_SOURCES) SOURCE_BY_ENTITY[def.entity] = def;

// Resolve a source spec: registry entity name, a def object, or a
// normalized row's `source` value. Unknown names get a generic def so
// mergeAuditLog tolerates future audit tables it has never heard of.
export function auditSourceFor(source: any): AuditSourceDef {
  const name = typeof source === 'string' ? source : clean(source?.entity || source?.source);
  if (name && SOURCE_BY_ENTITY[name]) return SOURCE_BY_ENTITY[name];
  if (source && typeof source === 'object' && clean(source.entity) && Array.isArray(source.actor_fields)) {
    return source as AuditSourceDef;
  }
  return {
    entity: name || 'AuditEvent',
    label: name ? humanizeAuditToken(name) : 'Audit event',
    actor_fields: ['actor_label', 'actor_name', 'actor', 'performed_by_name', 'created_by_email', 'created_by'],
    actor_email_fields: ['actor_email', 'performed_by_email', 'created_by_email'],
    ts_field: 'occurred_at',
    ts_fallback_fields: ['at', 'modified_at', 'created_date'],
    entity_type: name || 'Record',
    entity_ref_fields: ['entity_id', 'record_id'],
    entity_label_fields: ['entity_label', 'title', 'name'],
    event_fields: ['event_type', 'action_type', 'action', 'type'],
    summary_fields: ['summary', 'action_details', 'detail', 'reason', 'note'],
    detail_fields: ['details'],
  };
}

// ---------------------------------------------------------------------------
// Actor + entity-label helpers
// ---------------------------------------------------------------------------

// Display-name chain: per-source actor_fields first (when a source def is
// supplied), then the spec'd generic chain actor_label -> actor_email ->
// created_by -> 'system'. Numbers tolerated; the 'system' literal is only
// ever the FINAL fallback so a real identity always wins.
export function actorLabel(row: any, source?: any): string {
  const r = asObj(row);
  const def = source ? auditSourceFor(source) : null;
  for (const f of def?.actor_fields || []) {
    const v = firstText(r[f]);
    if (v) return v;
  }
  return firstText(
    r.actor_label, r.actor_name, r.actor, r.performed_by_name,
    r.actor_email, r.performed_by_email, r.created_by_email,
    r.created_by, r.by, r.user_email,
  ) || 'system';
}

// Actor email for the filter column: dedicated email fields first, then any
// actor-field value that happens to look like an email (ProductActivity
// actor_label is allowed to hold one — the entity doc says so).
export function actorEmail(row: any, source?: any): string {
  const r = asObj(row);
  const def = source ? auditSourceFor(source) : null;
  const fields = [...(def?.actor_email_fields || []), ...(def?.actor_fields || []),
    'actor_email', 'performed_by_email', 'created_by_email',
    'actor_label', 'actor_name', 'actor', 'performed_by_name', 'created_by'];
  for (const f of fields) {
    const v = firstText(r[f]);
    if (v && EMAIL_RX.test(v)) return v;
  }
  return '';
}

// Human label for the audited record. Accepts a normalized row (uses its
// entity_label/entity_type/entity_id/source) or a raw entity row ({source}
// opt disambiguates). Chain: normalized/stored label -> source label fields
// -> titlesById lookup (id OR parent id keyed title maps the page hands us)
// -> "Type · short-id" -> '—'.
export function entityLabelFor(row: any, { titlesById, source }: { titlesById?: Record<string, string>; source?: any } = {}): string {
  const r = asObj(row);
  const def = source ? auditSourceFor(source)
    : (r.source ? auditSourceFor(r.source) : null);

  const stored = firstText(r.entity_label);
  if (stored) return stored;
  for (const f of def?.entity_label_fields || []) {
    const v = firstText(r[f]);
    if (v) return v;
  }
  // Raw rows: resolve the audited id through the source ref chain, then the
  // caller's {id -> title} map (estimates->number, WO->title, etc.).
  let id = firstText(r.entity_id);
  let type = firstText(r.entity_type);
  if (!id && def) {
    for (let i = 0; i < def.entity_ref_fields.length; i += 1) {
      const v = firstText(r[def.entity_ref_fields[i]]);
      if (v) { id = v; type = def.entity_ref_types?.[i] || def.entity_type || type; break; }
    }
  }
  const titles = titlesById && typeof titlesById === 'object' ? titlesById : {};
  if (id && firstText(titles[id])) return firstText(titles[id]);
  if (id) {
    const short = id.length > 10 ? `${id.slice(0, 8)}…` : id;
    return type ? `${humanizeAuditToken(type)} ${short}` : short;
  }
  return '—';
}

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

const firstRef = (r: Record<string, any>, fields: string[] = []): string => {
  for (const f of fields) {
    const v = firstText(r[f]);
    if (v) return v;
  }
  return '';
};

// Per-source summary phrasing — the ONLY place entity-specific prose lives
// (D1). Everything else about a source is its field map.
function summaryFor(def: AuditSourceDef, r: Record<string, any>): string {
  const details = asObj(r.details);
  switch (def.entity) {
    case 'ProductActivity': {
      // w-35/w-64 row shape: details.field_label or the changed field name
      // leads, from->to follows, note trails. D-11 rows carry their own
      // `label` ("Overridden during order entry — unit_price 10 → 12.5")
      // which wins verbatim so the money trail reads identically everywhere.
      const own = firstText(r.label);
      if (own) return own;
      const fieldLabel = firstText(details.field_label, details.field, r.event_type);
      const move = moveArrow(r.from_value, r.to_value);
      const base = [humanizeAuditToken(fieldLabel) || 'Change', move].filter(Boolean).join(': ');
      const note = firstText(r.note);
      return note ? `${base} — ${note}` : base;
    }
    case 'ActivityLog': {
      const prose = firstText(r.action_details);
      if (prose) return prose;
      const move = moveArrow(r.previous_value, r.new_value);
      return [humanizeAuditToken(r.action_type) || 'Activity', move].filter(Boolean).join(': ');
    }
    case 'EstimateRevision': {
      const rev = firstText(r.revision_number);
      const head = `Revision ${rev || '?'}`;
      const type = humanizeAuditToken(r.revision_type);
      const statusMove = moveArrow(r.previous_status, r.new_status);
      const reason = firstText(r.reason);
      const changes = Array.isArray(r.change_summary) ? r.change_summary.map(clean).filter(Boolean) : [];
      return [
        [head, type].filter(Boolean).join(' · '),
        statusMove,
        reason || (changes.length ? changes.join('; ') : ''),
      ].filter(Boolean).join(' — ');
    }
    case 'FieldAudit': {
      const move = moveArrow(r.old_value, r.new_value);
      const status = norm(r.status);
      const suffix = status && status !== 'committed' ? ` (${status})` : '';
      const src = norm(r.source);
      const via = src && src !== 'app' ? ` via ${src}` : '';
      return `${firstText(r.field_name, 'field')}${move ? `: ${move}` : ''}${via}${suffix}`;
    }
    case 'AdminAuditLog': {
      const detail = firstText(r.detail);
      const action = humanizeAuditToken(r.action) || 'Admin action';
      const target = firstText(r.target_email);
      return detail || [action, target ? `→ ${target}` : ''].filter(Boolean).join(' ');
    }
    default: {
      for (const f of def.summary_fields) {
        const v = firstText(r[f]);
        if (v) return v;
      }
      return humanizeAuditToken(firstText(r[def.event_fields[0] || ''], r.event_type)) || '—';
    }
  }
}

const VALID_ACTOR_TYPES = new Set(['staff', 'customer', 'vendor', 'system']);
const SYSTEMISH_ACTOR = /^(system|auto|automation|automated|auto_followup|import|imported|sync|scheduler|scheduled|workflow|integration|notification_engine|digest|smartsheet)\b/;

// Normalize one raw audit row into the unified feed shape (D2). `source` is
// a registry entity name ('ProductActivity'), a def object, or omitted (the
// row's own `source`/generic fallback). Returns null for non-object input.
export function normalizeAuditRow(row: any, { source }: { source?: any } = {}): Record<string, any> | null {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return null;
  const r = row as Record<string, any>;
  // A row's own `source` field is only a def hint when it names a REGISTERED
  // source — OpportunityActivity.source carries origin values
  // ('manual'|'auto_followup'|'system'), not an entity name.
  const hint = source || r._source || r.audit_source
    || (SOURCE_BY_ENTITY[clean(r.source)] ? r.source : '');
  const def = auditSourceFor(hint);

  // Audited entity: ref chain picks the id; when the def carries a
  // positional type map (entity_ref_types) the matched position also picks
  // the type, else the row's own entity_type field (FieldAudit) or the
  // def's fixed type applies.
  let entityId = '';
  let entityType = '';
  for (let i = 0; i < def.entity_ref_fields.length; i += 1) {
    const v = firstText(r[def.entity_ref_fields[i]]);
    if (v) { entityId = v; entityType = firstText(def.entity_ref_types?.[i]); break; }
  }
  entityType = entityType || firstText(def.entity_type_field ? r[def.entity_type_field] : '', def.entity_type);

  const actor_label = actorLabel(r, def);
  const actor_email = actorEmail(r, def);
  const explicitType = norm(r.actor_type || asObj(r.details).actor_type);
  const actor_type = VALID_ACTOR_TYPES.has(explicitType)
    ? explicitType
    : (actor_label === 'system' || SYSTEMISH_ACTOR.test(norm(actor_label)) || SYSTEMISH_ACTOR.test(norm(r.source))
      ? 'system'
      : (actor_email || actor_label !== 'system' ? 'staff' : 'system'));

  const event_type = firstText(
    firstRef(r, def.event_fields),
    def.event_type_fixed,
    r.event_type,
  ) || 'event';

  const occurred_at = firstText(
    def.ts_field ? r[def.ts_field] : '',
    ...def.ts_fallback_fields.map((f) => r[f]),
    r.occurred_at, r.at, r.modified_at, r.created_date, r.timestamp, r.date,
  );

  const detail: Record<string, any> = {};
  for (const f of def.detail_fields) {
    const v = r[f];
    if (v === undefined || v === null || v === '') continue;
    detail[f] = v;
  }

  const rawId = firstText(r.id, r._id, r.creation_request_key, r.event_key, r.save_attempt_id, r.quote_issue_key);
  const normalized: Record<string, any> = {
    id: `${def.entity}:${rawId || `${occurred_at || 'undated'}|${event_type}|${actor_label}`}`,
    source: def.entity,
    source_label: def.label,
    occurred_at,
    actor_label,
    actor_email,
    actor_type,
    entity_type: entityType || def.entity,
    entity_id: entityId,
    entity_label: entityLabelFor(r, { source: def }),
    event_type,
    summary: summaryFor(def, r),
  };
  const parentId = firstRef(r, def.parent_ref_fields);
  if (def.parent_entity_type && parentId) {
    normalized.parent_entity_type = def.parent_entity_type;
    normalized.parent_entity_id = parentId;
  }
  if (Object.keys(detail).length) normalized.detail = detail;
  return normalized;
}

// ---------------------------------------------------------------------------
// Merge + filter
// ---------------------------------------------------------------------------

const parseTime = (v: any): number => {
  const t = Date.parse(clean(v));
  return Number.isNaN(t) ? NaN : t;
};

// Merge raw rows from every audit source into ONE unified feed.
//
//   rows_by_source — {SourceEntityName: rawRow[]} (arrays only; non-array
//     values are ignored). Keys need not be registered sources — unknown
//     keys normalize through the generic fallback def (auditSourceFor).
//   opts.from / opts.to — ISO bounds on occurred_at, INCLUSIVE either side.
//     Undated/unparseable rows are excluded while a bound is set (D3).
//   opts.entity_type — matches the AUDITED entity type OR the source entity
//     name OR the parent entity type (D4). Case-insensitive.
//   opts.user — actor filter: exact match on actor_email/actor_label, else
//     substring on both (D5). Case-insensitive.
//   opts.q — substring over actor_label/actor_email/entity_label/entity_id/
//     summary/event_type (D6).
//   opts.limit — max rows returned (positive int); absent/<=0 -> no cap.
//
// Returns the newest-first feed (D7). Callers wanting a "capped" flag pass
// limit+1 or compare against auditSummary(merged-unlimited).count.
export function mergeAuditLog(
  rows_by_source: Record<string, any> | null | undefined,
  { from, to, entity_type, user, q, limit }: {
    from?: any; to?: any; entity_type?: any; user?: any; q?: any; limit?: any;
  } = {},
): Record<string, any>[] {
  const input = asObj(rows_by_source);
  const rows: Record<string, any>[] = [];
  let seq = 0;
  for (const key of Object.keys(input)) {
    const list = input[key];
    if (!Array.isArray(list)) continue;
    const def = auditSourceFor(key);
    for (const raw of list) {
      const n = normalizeAuditRow(raw, { source: def });
      if (n) rows.push({ ...n, _seq: seq++ });
    }
  }

  const fromMs = parseTime(from);
  const toMs = parseTime(to);
  const bounded = Number.isFinite(fromMs) || Number.isFinite(toMs);
  const typeWanted = norm(entity_type);
  const userWanted = norm(user);
  const qWanted = norm(q);

  const filtered = rows.filter((r) => {
    const ms = parseTime(r.occurred_at);
    if (bounded) {
      if (!Number.isFinite(ms)) return false;              // D3
      if (Number.isFinite(fromMs) && ms < fromMs) return false;
      if (Number.isFinite(toMs) && ms > toMs) return false;
    }
    if (typeWanted) {
      const hit = norm(r.entity_type) === typeWanted
        || norm(r.source) === typeWanted
        || norm(r.parent_entity_type) === typeWanted;
      if (!hit) return false;
    }
    if (userWanted) {
      const email = norm(r.actor_email);
      const label = norm(r.actor_label);
      const exact = email === userWanted || label === userWanted;
      const fuzzy = (email && email.includes(userWanted)) || (label && label.includes(userWanted));
      if (!exact && !fuzzy) return false;
    }
    if (qWanted) {
      const hay = [r.actor_label, r.actor_email, r.entity_label, r.entity_id, r.summary, r.event_type]
        .map(norm).join('\n');
      if (!hay.includes(qWanted)) return false;
    }
    return true;
  });

  filtered.sort((a, b) => {
    const ma = parseTime(a.occurred_at);
    const mb = parseTime(b.occurred_at);
    const fa = Number.isFinite(ma) ? ma : -Infinity;       // undated last
    const fb = Number.isFinite(mb) ? mb : -Infinity;
    if (fa !== fb) return fb - fa;
    return (a._seq as number) - (b._seq as number);
  });

  const cap = Number(limit);
  const out = Number.isFinite(cap) && cap > 0 ? filtered.slice(0, Math.floor(cap)) : filtered;
  return out.map(({ _seq, ...rest }) => rest);
}

// ---------------------------------------------------------------------------
// Header summary
// ---------------------------------------------------------------------------

// {count, by_entity, by_actor, by_source, top_actions} for the page header.
// by_entity keys on the AUDITED entity type (falls back to the source name so
// unlinked rows still bucket); top_actions is the full event_type histogram
// sorted count-desc then alpha — callers slice for a "top N" chip row.
export function auditSummary(rows: any): {
  count: number;
  by_entity: Record<string, number>;
  by_actor: Record<string, number>;
  by_source: Record<string, number>;
  top_actions: { event_type: string; count: number }[];
} {
  const by_entity: Record<string, number> = {};
  const by_actor: Record<string, number> = {};
  const by_source: Record<string, number> = {};
  const actions: Record<string, number> = {};
  let count = 0;
  for (const r of Array.isArray(rows) ? rows : []) {
    if (!r || typeof r !== 'object') continue;
    count += 1;
    const entity = firstText(r.entity_type, r.source, 'unknown');
    by_entity[entity] = (by_entity[entity] || 0) + 1;
    const actor = firstText(r.actor_label, r.actor_email, 'system');
    by_actor[actor] = (by_actor[actor] || 0) + 1;
    const src = firstText(r.source, 'unknown');
    by_source[src] = (by_source[src] || 0) + 1;
    const evt = firstText(r.event_type, 'event');
    actions[evt] = (actions[evt] || 0) + 1;
  }
  const top_actions = Object.entries(actions)
    .map(([event_type, n]) => ({ event_type, count: n }))
    .sort((a, b) => (b.count - a.count) || a.event_type.localeCompare(b.event_type));
  return { count, by_entity, by_actor, by_source, top_actions };
}

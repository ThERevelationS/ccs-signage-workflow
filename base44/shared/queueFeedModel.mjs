// Queue-feed shaping model — zero imports so the deployed function and the
// Node test harness bundle the identical logic. queueFeed composes the queue
// pages' whole mount read set (rows + scoped extras) into one function call;
// every projection/scoping rule that decides WHAT leaves the server lives
// here so scripts/test-queue-feed.mjs can assert the exact same shapes the
// frontend consumes.
//
// Field lists are allowlist projections: anything not listed never leaves
// the function. Scoping helpers replicate the frontend model semantics
// exactly — savedViewsModel.js (lens/page axis + own/shared visibility +
// deterministic sort) and crmEventsModel.js (CRM taxonomy filter) — so a
// composed payload is a drop-in replacement for the N-pull result.

// ---------------------------------------------------------------------------
// SavedQueueView — scoping parity with src/components/queues/savedViewsModel.js
// ---------------------------------------------------------------------------

// Every field the frontend view store reads (list/save/CAS/dedupe). The
// entity stores a `filters` blob per view — small by design.
export const SAVED_VIEW_FIELDS = [
  'id', 'created_date', 'updated_date',
  'name', 'filters', 'status',
  'queue_lens', 'page',
  'owner_email', 'user_email',
  'is_shared', 'shared',
  'pinned', 'sort', 'is_default',
  'creation_request_key',
];

const normEmail = (v) => String(v || '').trim().toLowerCase();
const normScopeKey = (v, fallback = 'all') => String(v ?? '').trim() || fallback;

export function projectSavedView(row) {
  if (!row || typeof row !== 'object') return row;
  const out = {};
  for (const field of SAVED_VIEW_FIELDS) out[field] = row[field];
  return out;
}

export function viewOwnerEmail(view = {}) {
  return normEmail(view?.owner_email || view?.user_email);
}

export function isViewShared(view = {}) {
  return view?.is_shared === true || view?.shared === true;
}

// Rows marked archived (any status other than active/blank) are retired —
// hidden from pickers without deleting them. Same rule as isLiveView.
export function isLiveSavedView(view = {}) {
  const s = String(view?.status ?? '').trim().toLowerCase();
  return s === '' || s === 'active';
}

export function isOwnView(view, ownerEmail = '') {
  const me = normEmail(ownerEmail);
  return me !== '' && viewOwnerEmail(view) === me;
}

// Staff see their own views plus anything marked shared.
export function isViewVisible(view, ownerEmail = '') {
  return isViewShared(view) || isOwnView(view, ownerEmail);
}

const sortWeight = (v) => {
  const n = Number(v?.sort);
  return Number.isFinite(n) ? n : null;
};

// Dropdown order, fully deterministic — own first, pinned before unpinned,
// sort weight asc (unweighted last), name, created, id. Mirrors
// savedViewsModel.sortViews exactly so the composed response orders
// identically to the gateway path.
export function sortSavedViews(views = [], ownerEmail = '') {
  return [...(views || [])].sort((a, b) => {
    const aMine = isOwnView(a, ownerEmail);
    const bMine = isOwnView(b, ownerEmail);
    if (aMine !== bMine) return aMine ? -1 : 1;
    const aPin = a?.pinned === true;
    const bPin = b?.pinned === true;
    if (aPin !== bPin) return aPin ? -1 : 1;
    const aw = sortWeight(a);
    const bw = sortWeight(b);
    if (aw !== bw) {
      if (aw === null) return 1;
      if (bw === null) return -1;
      return aw - bw;
    }
    const byName = String(a?.name || '').localeCompare(String(b?.name || ''));
    if (byName !== 0) return byName;
    const byCreated = String(a?.created_date || '').localeCompare(String(b?.created_date || ''));
    if (byCreated !== 0) return byCreated;
    return String(a?.id || '').localeCompare(String(b?.id || ''));
  });
}

// Lens-axis scope (the ProductQueue contract): savedViewsModel.loadLensViews
// reads {queue_lens: lens} then keeps live rows that are own or shared. The
// caller passes the already-queried rows; the scope match is re-applied here
// because the stored queue_lens spelling must equal the normalized lens.
export function scopeSavedViewsForLens(rows, { lens = 'all', ownerEmail = '' } = {}) {
  const want = normScopeKey(lens);
  const me = normEmail(ownerEmail);
  const views = (Array.isArray(rows) ? rows : [])
    .map(projectSavedView)
    .filter(
      (r) =>
        String(r?.queue_lens || '') === want &&
        isLiveSavedView(r) &&
        ((me !== '' && viewOwnerEmail(r) === me) || isViewShared(r))
    );
  return sortSavedViews(views, ownerEmail);
}

// Page-axis scope (C-03 savedViewsModel.listViews): the `page` field only —
// deliberately disjoint from queue_lens so the two axes never cross-list.
export function scopeSavedViewsForPage(rows, { pageKey = 'all', ownerEmail = '' } = {}) {
  const want = normScopeKey(pageKey);
  const me = normEmail(ownerEmail);
  const views = (Array.isArray(rows) ? rows : [])
    .map(projectSavedView)
    .filter(
      (r) =>
        String(r?.page ?? '').trim() === want &&
        isLiveSavedView(r) &&
        ((me !== '' && viewOwnerEmail(r) === me) || isViewShared(r))
    );
  return sortSavedViews(views, ownerEmail);
}

// ---------------------------------------------------------------------------
// Settings — the GlobalSettings rows queue pages read on mount.
// Records stay record-shaped ({id, setting_key, setting_value}) so the
// frontend's productStageModeFromSetting consumes them unchanged.
// ---------------------------------------------------------------------------

export const SETTING_RECORD_FIELDS = ['id', 'setting_key', 'setting_value'];

export function projectSettingRecord(row) {
  if (!row || typeof row !== 'object') return row;
  const out = {};
  for (const field of SETTING_RECORD_FIELDS) out[field] = row[field];
  return out;
}

// ---------------------------------------------------------------------------
// CRM event queue — feed projection for OpportunityActivity rows + the
// customer datalist. CRM_EVENT_TYPES mirrors crmEventsModel.CRM_EVENT_TYPES
// (the queue only ever renders taxonomy rows; the server applies the same
// filter with an $in query so audit-trail rows never cross the wire).
// ---------------------------------------------------------------------------

export const CRM_EVENT_TYPES = [
  'Call: Accounts Receivable',
  'Call: Collections',
  'Call: Estimate Follow Up',
  'Call: Install Scheduling',
  'Call: Post delivery follow up',
  'Call: Proof',
  'Call: Prospecting',
  'Call: Sales Follow Up',
  'Consultation',
  'E-Mail: Estimate',
  'E-Mail: Follow Up',
  'E-Mail: Information Request',
  'ReDo Work',
  'Visit: Installation',
  'Visit: Networking/Marketing',
  'Visit: Sales Appointment',
  'Visit: Sales Cold Call',
  'Visit: Sales Relationship',
  'Visit: Site Survey',
];

// Everything CrmEventsQueue/crmEventsModel/crmActivityPersistence reads:
// the taxonomy filter, the row chrome (contact/company/subject/notes/due/
// outcome/assignee/links), the updated_date CAS anchor completeCrmEvent
// writes against, and the audit fields the model inspects.
export const CRM_ACTIVITY_FIELDS = [
  'id', 'created_date', 'updated_date',
  'event_type', 'subject', 'summary', 'notes', 'details',
  'contact_name', 'contact_id', 'company_name',
  'customer_id', 'opportunity_id', 'work_order_id',
  'assigned_to', 'due_at', 'completed_at', 'outcome',
  'source', 'actor', 'created_by', 'deleted',
];

export function projectCrmActivity(row) {
  if (!row || typeof row !== 'object') return row;
  const out = {};
  for (const field of CRM_ACTIVITY_FIELDS) out[field] = row[field];
  return out;
}

// The Add-Event company datalist matches on company_name and links by id —
// the only two Customer fields the queue consumes.
export const CRM_CUSTOMER_FIELDS = ['id', 'company_name', 'name'];

export function projectCrmCustomer(row) {
  if (!row || typeof row !== 'object') return row;
  const out = {};
  for (const field of CRM_CUSTOMER_FIELDS) out[field] = row[field];
  return out;
}

// ---------------------------------------------------------------------------
// Estimate queue — feed projection for AllInOneEstimate rows. The page's row
// cards, bucket/status filters, CSV export, trash lifecycle CAS baselines
// (expectedEstimateFields) and deepLinks.js estimateMatchesSearch haystacks
// all read only these fields; line_items[] survives projected to the search
// subfields so global estimate search keeps working byte-identically.
// ---------------------------------------------------------------------------

export const ESTIMATE_QUEUE_FIELDS = [
  'id', 'created_date', 'updated_date',
  // Identity / display
  'estimate_number', 'project_name', 'job_name', 'client_name', 'contact_name',
  'project_address', 'site_address', 'source_module',
  // Status buckets + lifecycle
  'status', 'pipeline_sync_pending',
  'deleted', 'deleted_at', 'deleted_by',
  'archived_at', 'archived_reason',
  // Money + dates the cards/sorts/exports read
  'quote_total', 'total_cost', 'cost_total',
  'quote_issue_date', 'quote_valid_days', 'valid_days',
  'quote_expiration_date', 'quote_expired',
  'due_date', 'target_install_date', 'priority',
  // People / filters
  'salesperson', 'salesperson_email', 'assigned_to', 'created_by',
  'personal_tags', 'work_order_id',
  // Search haystack fields (deepLinks.ESTIMATE_SEARCH_FIELDS)
  'notes', 'estimate_notes',
  // line_items[] survives projected to ESTIMATE_LINE_ITEM_FIELDS
  'line_items',
];

// deepLinks.LINE_ITEM_SEARCH_FIELDS — the only subfields the queue reads.
export const ESTIMATE_LINE_ITEM_FIELDS = [
  'title', 'name', 'product_name', 'client_product_name', 'builder_name',
  'project_name', 'description', 'module_key', 'product_category',
  'production_product_type',
];

export function projectEstimateLineItem(line) {
  if (!line || typeof line !== 'object') return line;
  const out = {};
  for (const field of ESTIMATE_LINE_ITEM_FIELDS) out[field] = line[field];
  return out;
}

export function projectEstimate(row) {
  if (!row || typeof row !== 'object') return row;
  const out = {};
  for (const field of ESTIMATE_QUEUE_FIELDS) {
    if (field === 'line_items') continue;
    out[field] = row[field];
  }
  out.line_items = Array.isArray(row.line_items)
    ? row.line_items.map(projectEstimateLineItem)
    : row.line_items;
  return out;
}

// The queue's timezone/custom-status read: QuoteDefaults.filter(
// {config_name:"default"}, 1) — the page parses display_timezone,
// custom_statuses and status_transitions out of the row.
export const QUOTE_DEFAULTS_FIELDS = [
  'id', 'config_name', 'display_timezone', 'custom_statuses', 'status_transitions',
];

export function projectQuoteDefaults(row) {
  if (!row || typeof row !== 'object') return row;
  const out = {};
  for (const field of QUOTE_DEFAULTS_FIELDS) out[field] = row[field];
  return out;
}

// ---------------------------------------------------------------------------
// Feed cache keys — canonical isolate-cache key so a burst of identical
// composed pulls collapses to one upstream read set. Isolation rules the
// tests assert: distinct feeds, lenses, owners and include sets never share
// an entry (a per-user saved-views payload must never cross owners).
// ---------------------------------------------------------------------------

export function queueFeedCacheKey({
  feed = 'product_queue',
  lens = '',
  pageKey = '',
  owner = '',
  include = [],
  moduleKey = '',
} = {}) {
  const inc = [...new Set((Array.isArray(include) ? include : [include])
    .map((v) => String(v || '').trim().toLowerCase())
    .filter(Boolean))].sort();
  return [
    String(feed || 'product_queue'),
    normScopeKey(lens, ''),
    normScopeKey(pageKey, ''),
    normEmail(owner),
    inc.join(','),
    String(moduleKey || '').trim().toLowerCase(),
  ].join('|');
}

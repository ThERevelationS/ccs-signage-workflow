import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { resolveFleetStaffUser } from '../../shared/fleetStaffSession.ts';
import { withEntityRateLimitRetry } from '../../shared/entityRateLimitRetry.ts';

// Session-authenticated read gateway for non-Fleet role-gated entities.
// Staff sessions are EmailGate sessions — not Base44 app users — so direct
// entity reads can never satisfy entity RLS. Every staff-facing read of these
// entities flows through here instead: a valid sss_session_token is required
// and the per-entity tier plus field projection preserve the intended access.
const STAFF_READABLE = new Set([
  'ActivityLog',
  'AuthorizedEmail',
  'EstimateClipboardItem',
  'ImportJob',
  'LegacyMigrationMap',
  'PartTemplate',
  'PermittingOfficeAuthorityReview',
  'PermittingRule',
  'PermittingSourceDocument',
  'PermittingSourceTextSegment',
  'PermittingWorkflowDraft',
  'QuickProduct',
  'SourceCollectionQueue',
  'SourceMonitorState',
  'TimeClockAudit',
  'TimeClockBreak',
  'TimeClockCorrectionRequest',
  'TimeClockLaborSegment',
  'TimeClockPayPeriod',
  'TimeClockWorkPause',
  'TimeEntry',
  'TimeOffRequest',
  'UserPTOBalance',

  // Staff-tier entities migrated off anonymous entity access (RLS is now
  // backend-only). Staff keep the same read breadth they had before — the
  // difference is a valid session is now required and writes stay on
  // dedicated action functions.
  'AllInOneEstimate',
  'BrickStoneInventory',
  'BrickStoneProject',
  'BuilderPart',
  'BuilderPartGroup',
  'BuilderProduct',
  'CNCProject',
  'CellHistory',
  'ChannelLetterInstallEquipment',
  'ChannelLetterInstallInventory',
  'ChannelLetterInstallation',
  'ChecklistSubItem',
  'Customer',
  'CustomerLocation',
  'CustomerNote',
  'DimensionalLetterMaterial',
  'EstimateOption',
  'FoundationInventory',
  'FoundationProject',
  'GeneralTask',
  'GlobalSettings',
  'Inventory',
  'JurisdictionProfile',
  'LaborServiceInventory',
  'LaserProject',
  'MaintenanceActionRate',
  'MaintenanceInventory',
  'MaintenanceProject',
  'MarkupCategory',
  'MarkupTier',
  'MetalProject',
  'OpportunityActivity',
  'Order',
  'PermitLineItem',
  'PermitLocality',
  'PortalMessage',
  'Project',
  'QuoteDefaults',
  'RegulationAlert',
  'Settings',
  'SignHardwareInventory',
  'SignLightingInventory',
  'SignPartsSuppliesInventory',
  'SipChecklistTemplate',
  'TaskTemplate',
  'TaxGroup',
  'VinylInventory',
  'VinylMachine',
  'VinylPartTemplate',
  'VinylProject',
  'VinylWorkflowTemplate',
  'WorkOrder',

  // Screens that previously read these straight from the browser (which entity
  // RLS blocks for staff sessions): announcements, sales filters, calendar,
  // estimator revisions/acceptances, price revisions, templates and capacity.
  'Announcement',
  'BuilderPriceRevision',
  'CalendarEvent',
  'EstimateAcceptance',
  'EstimateQuoteDelivery',
  'EstimateRevision',
  'EstimateSectionAcceptance',
  'InventoryMovement',
  'PTOPolicy',
  'ProjectTemplate',
  'QuickProductCategory',
  'SalesFilter',
  'UserCapacity',
]);

// Admin-settings data: readable by admins only. AuthorizedEmail is
// staff-readable because dozens of staff views resolve user identities from
// it; its secret fields are stripped by FIELD_DENYLIST below before any row
// leaves the backend.
const ADMIN_READABLE = new Set<string>([
  'AdminAuditLog',
  'AutomationRule',
  'EmailGroup',
  'EmailNotificationSettings',
  'FailedAdminAttempt',
  'UserSession',
]);

// Fields that must never leave the backend regardless of role. These hold
// credentials, bearer tokens, biometric descriptors, and session-revocation
// state; no staff-facing page has a legitimate read for them.
const FIELD_DENYLIST: Record<string, string[]> = {
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

const MAX_LIMIT = 500;
const MAX_SKIP = 100000;
const MAX_QUERY_BYTES = 4000;

// Payroll/HR rows are visible to their owner or an admin — not to every
// coworker. Entities listed here are filtered to user_email = caller
// whenever the caller is not an admin.
const OWNER_SCOPED = new Set([
  'TimeEntry',
  'TimeClockAudit',
  'TimeClockBreak',
  'TimeClockCorrectionRequest',
  'TimeClockLaborSegment',
  'TimeClockPayPeriod',
  'TimeClockWorkPause',
  'TimeOffRequest',
  'UserPTOBalance',
]);
const SORT_PATTERN = /^(-?[A-Za-z_][\w.]*)(\s*,\s*-?[A-Za-z_][\w.]*){0,3}$/;

function projectItem(entityName: string, item: any, user?: any) {
  const denied = [...(FIELD_DENYLIST[entityName] || []),
    ...((user?.admin_permissions?.denied_fields?.[entityName]) || [])];
  if (!denied || !item || typeof item !== 'object') return item;
  const clean = { ...item };
  for (const field of denied) delete clean[field];
  return clean;
}

function cleanSort(value: unknown, entityName: string) {
  const sort = String(value || '').trim();
  if (!sort) return '';
  if (sort.length > 200 || !SORT_PATTERN.test(sort)) {
    throw Object.assign(new Error('Staff read sort is invalid.'), { status: 400 });
  }
  // Denylisted fields must not be usable as a sort oracle either.
  const denied = new Set(FIELD_DENYLIST[entityName] || []);
  for (const part of sort.split(',')) {
    const field = part.trim().replace(/^-/, '');
    if (denied.has(field)) {
      throw Object.assign(new Error('Staff read sort field is not permitted.'), { status: 400 });
    }
  }
  return sort;
}

// Read-filter operators allowed on non-denied fields. Anything that scans or
// evaluates ($regex/$where/$expr/$or/...) stays blocked — those turn a filter
// into a boolean oracle on fields the projection denies.
const SAFE_READ_OPERATORS = new Set(["$in", "$nin", "$lt", "$lte", "$gt", "$gte", "$ne", "$exists"]);

function cleanQuery(value: unknown, entityName: string) {
  if (value == null) return null;
  if (typeof value !== "object" || Array.isArray(value)) {
    throw Object.assign(new Error("Staff read filter must be an object."), { status: 400 });
  }
  const denied = new Set(FIELD_DENYLIST[entityName] || []);
  const stack: Array<{ node: any; field: string }> = [{ node: value, field: "" }];
  while (stack.length) {
    const { node, field } = stack.pop();
    if (!node || typeof node !== "object") continue;
    for (const [key, val] of Object.entries(node)) {
      if (key.startsWith("$")) {
        if (!field || denied.has(field) || !SAFE_READ_OPERATORS.has(key)) {
          throw Object.assign(new Error("Staff read filter operators are not allowed."), { status: 400 });
        }
        continue;
      }
      if (val && typeof val === "object" && !Array.isArray(val)) stack.push({ node: val, field: key });
    }
  }
  let serialized;
  try {
    serialized = JSON.stringify(value);
  } catch {
    throw Object.assign(new Error('Staff read filter must be JSON-serializable.'), { status: 400 });
  }
  if (serialized.length > MAX_QUERY_BYTES) {
    throw Object.assign(new Error('Staff read filter is too large.'), { status: 400 });
  }
  return value;
}

function cleanLimit(value: unknown, fallback: number) {
  if (value == null || value === '') return fallback;
  const parsed = Math.floor(Number(value));
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > MAX_LIMIT) {
    throw Object.assign(new Error(`Staff read limit must be between 1 and ${MAX_LIMIT}.`), { status: 400 });
  }
  return parsed;
}

function cleanSkip(value: unknown) {
  if (value == null || value === '') return 0;
  const parsed = Math.floor(Number(value));
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > MAX_SKIP) {
    throw Object.assign(new Error(`Staff read offset must be between 0 and ${MAX_SKIP}.`), { status: 400 });
  }
  return parsed;
}

// Module-scope read cache — identical read bursts (mount storms: every
// component's staffEntities call + subscribe checks + batch loads) collapse
// to a single upstream entity_list read while an isolate stays warm.
const staffReadCache = new Map();
const STAFF_READ_CACHE_MS = 45_000;

Deno.serve(async (req) => {
  try {
    const base44 = withEntityRateLimitRetry(createClientFromRequest(req), { maxRetries: 1 });
    const body = await req.json().catch(() => ({}));
    const user = await resolveFleetStaffUser(base44, body?.session_token);
    if (!user?.email) return Response.json({ error: 'Authentication required' }, { status: 401 });
    const readCacheKey = JSON.stringify(body) + '|' + user.email + '|' + user.role;
    const cachedRead = staffReadCache.get(readCacheKey);
    if (cachedRead && cachedRead.expires > Date.now()) return Response.json(cachedRead.payload);

    // Batch mode: { entities: [{ entity, query?, sort?, limit?, skip? }] } — one
    // response carries every entity's rows, cutting page-mount bursts to a
    // single function call. Each entry still passes the same read gate.
    if (Array.isArray(body?.entities)) {
      if (body.entities.length > 16) {
        return Response.json({ error: 'A batch read is limited to 16 record types.' }, { status: 400 });
      }
      const out: Record<string, any> = {};
      for (const entry of body.entities) {
        const name = String(entry?.entity || '').trim();
        if (!STAFF_READABLE.has(name) && !ADMIN_READABLE.has(name)) {
          return Response.json({ error: `This record type cannot be read here: ${name}` }, { status: 403 });
        }
        if (ADMIN_READABLE.has(name) && user.role !== 'admin') {
          return Response.json({ error: `This record type requires a CCS admin: ${name}` }, { status: 403 });
        }
        const ent = base44.asServiceRole.entities[name];
        const q = cleanQuery(entry?.query, name);
        const sort = String(entry?.sort || 'created_date').trim() || null;
        const limit = normalizeLimit(entry?.limit);
        const skip = normalizeSkip(entry?.skip);
        const rows = q
          ? await ent.filter(q, sort, limit, skip)
          : await ent.list(sort, limit, skip);
        out[name] = (Array.isArray(rows) ? rows : []).map((r: any) => projectItem(name, r));
      }
      const batchPayload = { success: true, entities: out };
      if (staffReadCache.size > 300) staffReadCache.clear();
      staffReadCache.set(readCacheKey, { payload: batchPayload, expires: Date.now() + STAFF_READ_CACHE_MS });
      return Response.json(batchPayload);
    }

    const entityName = String(body?.entity || '').trim();
    if (!STAFF_READABLE.has(entityName) && !ADMIN_READABLE.has(entityName)) {
      return Response.json({ error: 'This record type cannot be read here.' }, { status: 403 });
    }
    if (ADMIN_READABLE.has(entityName) && user.role !== 'admin') {
      return Response.json({ error: 'This record type requires a CCS admin.' }, { status: 403 });
    }

    const entity = base44.asServiceRole.entities[entityName];
    const ownerEmail = user.role === 'admin' ? '' : String(user.email).trim().toLowerCase();
    const id = String(body?.id || '').trim();
    if (id) {
      const item = await entity.get(id).catch(() => null);
      if (!item) return Response.json({ error: 'Record not found.' }, { status: 404 });
      if (OWNER_SCOPED.has(entityName) && ownerEmail && String(item?.user_email || '').trim().toLowerCase() !== ownerEmail) {
        return Response.json({ error: 'Record not found.' }, { status: 404 });
      }
      return Response.json({ success: true, item: projectItem(entityName, item, user) });
    }

    const query = cleanQuery(body?.query, entityName);
    const sort = cleanSort(body?.sort, entityName);
    const limit = cleanLimit(body?.limit, 100);
    const skip = cleanSkip(body?.skip);
    let effectiveQuery = query;
    if (OWNER_SCOPED.has(entityName) && ownerEmail) {
      effectiveQuery = { ...(effectiveQuery || {}), user_email: ownerEmail };
    }
    const items = effectiveQuery
      ? await entity.filter(effectiveQuery, sort || null, limit, skip)
      : await entity.list(sort || null, limit, skip);
    const rows = Array.isArray(items) ? items : [];
    const scopedRows = OWNER_SCOPED.has(entityName) && ownerEmail
      ? rows.filter((row) => String(row?.user_email || '').trim().toLowerCase() === ownerEmail)
      : rows;
    if (body?.count === true) {
      return Response.json({ success: true, count: scopedRows.length });
    }
    const listPayload = { success: true, items: scopedRows.map((row) => projectItem(entityName, row)) };
    if (staffReadCache.size > 300) staffReadCache.clear();
    staffReadCache.set(readCacheKey, { payload: listPayload, expires: Date.now() + STAFF_READ_CACHE_MS });
    return Response.json(listPayload);
  } catch (error: any) {
    const status = Number(error?.status || error?.response?.status || 500);
    if ([400, 401, 403, 429].includes(status)) {
      return Response.json({ error: error?.message || 'Staff read failed.' }, { status });
    }
    console.error('staffDataRead error:', error);
    return Response.json({ error: 'Data could not be loaded. Try again.' }, { status: 500 });
  }
});
var import_sdk_0_8 = require("npm:@base44/sdk@0.8.25");
var import_fleetStaffSession = require("../../shared/fleetStaffSession.ts");
var import_entityRateLimitRetry = require("../../shared/entityRateLimitRetry.ts");
const STAFF_READABLE = /* @__PURE__ */ new Set([
  "ActivityLog",
  "AuthorizedEmail",
  "EstimateClipboardItem",
  "ImportJob",
  "LaborLevel",
  "LegacyMigrationMap",
  "MachineRate",
  "PartTemplate",
  "PermittingOfficeAuthorityReview",
  "PermittingRule",
  "PermittingSourceDocument",
  "PermittingSourceTextSegment",
  "PermittingWorkflowDraft",
  "QuickProduct",
  "SourceCollectionQueue",
  "SourceMonitorState",
  "TimeClockAudit",
  "TimeClockBreak",
  "TimeClockCorrectionRequest",
  "TimeClockLaborSegment",
  "TimeClockPayPeriod",
  "TimeClockWorkPause",
  "TimeEntry",
  "TimeOffRequest",
  "UserPTOBalance",
  // Staff-tier entities migrated off anonymous entity access (RLS is now
  // backend-only). Staff keep the same read breadth they had before — the
  // difference is a valid session is now required and writes stay on
  // dedicated action functions.
  "AllInOneEstimate",
  "BrickStoneInventory",
  "BrickStoneProject",
  "BuilderPart",
  "BuilderPartGroup",
  "BuilderProduct",
  "CNCProject",
  "CellHistory",
  "ChannelLetterInstallEquipment",
  "ChannelLetterInstallInventory",
  "ChannelLetterInstallation",
  "ChecklistSubItem",
  "Customer",
  "CustomerContact",
  "CustomerLocation",
  "CustomerNote",
  "DimensionalLetterMaterial",
  "EstimateOption",
  "FoundationInventory",
  "FoundationProject",
  "GeneralTask",
  "GlobalSettings",
  "Inventory",
  "JurisdictionProfile",
  "LaborServiceInventory",
  "CustomItemsProject",
  "LaserProject",
  "MaintenanceActionRate",
  "MaintenanceInventory",
  "MaintenanceProject",
  "MarkupCategory",
  "MarkupTier",
  "MetalProject",
  "OpportunityActivity",
  "Order",
  "PermitLineItem",
  "PermitLocality",
  "PermitLookupIndex",
  "PermittingAddressArchive",
  "PermitResolutionRule",
  "PortalMessage",
  "PricingTierMatrix",
  "Project",
  "QuoteDefaults",
  "RegulationAlert",
  "SalesLocation",
  "SavedQueueView",
  "Settings",
  "SignHardwareInventory",
  "SignageFact",
  "SignageFactIndex",
  "SignLightingInventory",
  "SignPartsSuppliesInventory",
  "SipChecklistTemplate",
  "TaskTemplate",
  "TaxGroup",
  "VinylInventory",
  "VinylMachine",
  "VinylPartTemplate",
  "VinylProject",
  "VinylWorkflowTemplate",
  "WorkOrder",
  // Screens that previously read these straight from the browser (which entity
  // RLS blocks for staff sessions): announcements, sales filters, calendar,
  // estimator revisions/acceptances, price revisions, templates and capacity.
  "Announcement",
  "BuilderPriceRevision",
  "CalendarEvent",
  "EstimateAcceptance",
  "EstimateQuoteDelivery",
  "EstimateRevision",
  "EstimateSectionAcceptance",
  "InventoryCostHistory",
  "InventoryMovement",
  "PTOPolicy",
  "ProjectTemplate",
  "QuickProductCategory",
  "SalesFilter",
  "UserCapacity",
  // Estimator/queue registries + audit entities (masterplan A-29). Operational
  // data staff screens need for queue filters, product editors and reporting.
  "CatalogPartGroup",
  "CrmEventType",
  "GlobalPricingTier",
  "Machine",
  "ModifierOption",
  "OriginationNode",
  "PricingModifier",
  "PricingTemplate",
  "ProductActivity",
  "ProductSubstatus",
  "Responsibility",
  "StoreCreditLedger",
  "WorkOrderTimeEntry"
]);
const ADMIN_READABLE = /* @__PURE__ */ new Set([
  "AccountDeletionRequest",
  "AdminAuditLog",
  "AutomationRule",
  "CorebridgeLog",
  "EmailGroup",
  "EmailNotificationSettings",
  "FailedAdminAttempt",
  "FeatureReport",
  "SyncConflict",
  "TimeClockPunchException",
  "UserSession",
  // GL/accounting configuration (masterplan A-29) — admin tier only.
  "COGSAccount",
  "IncomeAccount",
  "TaxAgency"
]);
const FIELD_DENYLIST = {
  AuthorizedEmail: [
    "password_hash",
    "password_reset_token",
    "password_reset_token_hash",
    "password_reset_expires",
    "onboarding_token",
    "onboarding_token_hash",
    "onboarding_expires",
    "session_not_before",
    "failed_login_count",
    "login_locked_until",
    "face_descriptors"
  ]
};
const OWNER_FIELD_DENYLIST = {
  AuthorizedEmail: ["hr_data"]
};
const STAFF_FIELD_DENYLIST = {
  TimeClockPayPeriod: [
    "finalized_summary",
    "finalized_summary_history",
    "finalization_note",
    "reopen_reason",
    "finalized_by",
    "reopened_by",
    "review_started_by",
    "last_request_id"
  ]
};
function roleDeniedForItem(entityName, user, item) {
  if (!user || user.role === "admin") return [];
  const staffDenied = STAFF_FIELD_DENYLIST[entityName] || [];
  const fields = OWNER_FIELD_DENYLIST[entityName] || [];
  if (!fields.length) return staffDenied;
  const owner = String(item?.email || item?.user_email || "").trim().toLowerCase();
  const ownerDenied = owner === String(user.email || "").trim().toLowerCase() ? [] : fields;
  return [...staffDenied, ...ownerDenied];
}
function roleDeniedForQuery(entityName, user) {
  if (!user || user.role === "admin") return [];
  return [...STAFF_FIELD_DENYLIST[entityName] || [], ...OWNER_FIELD_DENYLIST[entityName] || []];
}
const MAX_LIMIT = 5e3;
const MAX_SKIP = 1e5;
const MAX_QUERY_BYTES = 4e3;
const OWNER_SCOPED = /* @__PURE__ */ new Set([
  "TimeEntry",
  "TimeClockAudit",
  "TimeClockBreak",
  "TimeClockCorrectionRequest",
  "TimeClockLaborSegment",
  "TimeClockWorkPause",
  "TimeOffRequest",
  "UserPTOBalance"
]);
const SORT_PATTERN = /^(-?[A-Za-z_][\w.]*)(\s*,\s*-?[A-Za-z_][\w.]*){0,3}$/;
function projectItem(entityName, item, user) {
  const denied = [
    ...FIELD_DENYLIST[entityName] || [],
    ...user?.admin_permissions?.denied_fields?.[entityName] || [],
    ...roleDeniedForItem(entityName, user, item)
  ];
  if (!denied || !item || typeof item !== "object") return item;
  const clean = { ...item };
  for (const field of denied) delete clean[field];
  return clean;
}
function isDeniedField(field, denied) {
  if (denied.has(field)) return true;
  for (const d of denied) if (field.startsWith(`${d}.`)) return true;
  return false;
}
function cleanSort(value, entityName, user) {
  const sort = String(value || "").trim();
  if (!sort) return "";
  if (sort.length > 200 || !SORT_PATTERN.test(sort)) {
    throw Object.assign(new Error("Staff read sort is invalid."), { status: 400 });
  }
  const denied = /* @__PURE__ */ new Set([...FIELD_DENYLIST[entityName] || [], ...roleDeniedForQuery(entityName, user)]);
  for (const part of sort.split(",")) {
    const field = part.trim().replace(/^-/, "");
    if (isDeniedField(field, denied)) {
      throw Object.assign(new Error("Staff read sort field is not permitted."), { status: 400 });
    }
  }
  return sort;
}
const ALLOWED_OPERATORS = /* @__PURE__ */ new Set([
  "$eq",
  "$ne",
  "$in",
  "$nin",
  "$gt",
  "$gte",
  "$lt",
  "$lte",
  "$exists",
  "$regex",
  "$options"
]);
const MAX_IN_VALUES = 200;
const MAX_REGEX_LENGTH = 200;
function checkOperatorValue(operator, value) {
  if (operator === "$in" || operator === "$nin") {
    if (!Array.isArray(value) || value.length === 0 || value.length > MAX_IN_VALUES) {
      throw Object.assign(new Error(`Staff read ${operator} needs 1 to ${MAX_IN_VALUES} values.`), { status: 400 });
    }
    for (const entry of value) {
      if (entry && typeof entry === "object") {
        throw Object.assign(new Error("Staff read filter operators are not allowed."), { status: 400 });
      }
    }
    return;
  }
  if (operator === "$exists") {
    if (typeof value !== "boolean") {
      throw Object.assign(new Error("Staff read $exists needs true or false."), { status: 400 });
    }
    return;
  }
  if (operator === "$regex" || operator === "$options") {
    if (typeof value !== "string" || value.length > MAX_REGEX_LENGTH) {
      throw Object.assign(new Error("Staff read search pattern is not allowed."), { status: 400 });
    }
    return;
  }
  if (value !== null && typeof value === "object") {
    throw Object.assign(new Error("Staff read filter operators are not allowed."), { status: 400 });
  }
}
function cleanQuery(value, entityName, user) {
  if (value == null) return null;
  if (typeof value !== "object" || Array.isArray(value)) {
    throw Object.assign(new Error("Staff read filter must be an object."), { status: 400 });
  }
  const deniedFields = /* @__PURE__ */ new Set([...FIELD_DENYLIST[entityName] || [], ...roleDeniedForQuery(entityName, user)]);
  const stack = [{ node: value, field: "", depth: 0 }];
  while (stack.length) {
    const { node, field, depth } = stack.pop();
    if (!node || typeof node !== "object" || Array.isArray(node)) continue;
    for (const [key, val] of Object.entries(node)) {
      if (key.startsWith("$")) {
        if (depth !== 1 || !field) {
          throw Object.assign(new Error("Staff read filter operators are not allowed."), { status: 400 });
        }
        if (!ALLOWED_OPERATORS.has(key)) {
          throw Object.assign(new Error("Staff read filter operators are not allowed."), { status: 400 });
        }
        if (isDeniedField(field, deniedFields)) {
          throw Object.assign(new Error("Staff read filter operators are not allowed."), { status: 400 });
        }
        checkOperatorValue(key, val);
        continue;
      }
      if (depth === 0 && isDeniedField(key, deniedFields)) {
        throw Object.assign(new Error("Staff read filter field is not permitted."), { status: 400 });
      }
      if (val && typeof val === "object") {
        stack.push({ node: val, field: key, depth: depth + 1 });
      }
    }
  }
  let serialized;
  try {
    serialized = JSON.stringify(value);
  } catch {
    throw Object.assign(new Error("Staff read filter must be JSON-serializable."), { status: 400 });
  }
  if (serialized.length > MAX_QUERY_BYTES) {
    throw Object.assign(new Error("Staff read filter is too large."), { status: 400 });
  }
  return value;
}
function cleanLimit(value, fallback) {
  if (value == null || value === "") return fallback;
  const parsed = Math.floor(Number(value));
  if (!Number.isFinite(parsed) || parsed < 1) {
    throw Object.assign(new Error(`Staff read limit must be between 1 and ${MAX_LIMIT}.`), { status: 400 });
  }
  return Math.min(parsed, MAX_LIMIT);
}
function cleanSkip(value) {
  if (value == null || value === "") return 0;
  const parsed = Math.floor(Number(value));
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > MAX_SKIP) {
    throw Object.assign(new Error(`Staff read offset must be between 0 and ${MAX_SKIP}.`), { status: 400 });
  }
  return parsed;
}
const MAX_CURSOR_BYTES = 4e3;
const MAX_FIELD_LIST = 200;
const FIELD_NAME_PATTERN = /^[A-Za-z_][\w.]*$/;
const COUNT_PAGE = 500;
const COUNT_MAX_ROWS = 1e5;
function cleanCursor(value) {
  const cursor = String(value || "").trim();
  if (!cursor) return "";
  if (cursor.length > MAX_CURSOR_BYTES) {
    throw Object.assign(new Error("Staff read cursor is invalid."), { status: 400 });
  }
  return cursor;
}
function cleanFields(value) {
  if (value == null || value === "") return null;
  if (!Array.isArray(value) || value.length > MAX_FIELD_LIST) {
    throw Object.assign(new Error("Staff read fields list is invalid."), { status: 400 });
  }
  const out = [...new Set(value.map((f) => String(f || "").trim()).filter((f) => FIELD_NAME_PATTERN.test(f)))];
  return out.length ? out : null;
}
async function countRows(entity, query) {
  const countQuery = query && typeof query === "object" ? query : {};
  if (typeof entity?.count === "function") {
    try {
      const total = Number(await entity.count(countQuery));
      if (Number.isFinite(total) && total >= 0) return { count: total, truncated: false };
    } catch {
    }
  }
  let scanned = 0;
  while (scanned < COUNT_MAX_ROWS) {
    const page = await entity.filter(countQuery, null, COUNT_PAGE, scanned);
    if (!Array.isArray(page)) break;
    scanned += page.length;
    if (page.length < COUNT_PAGE) return { count: scanned, truncated: false };
  }
  return { count: scanned, truncated: true };
}
const staffReadCache = /* @__PURE__ */ new Map();
const staffReadInFlight = /* @__PURE__ */ new Map();
const STAFF_READ_CACHE_MS = 45e3;
const isRateLimited = (error) => Number(error?.status) === 429 || /rate limit|too many requests|traffic volume/i.test(String(error?.message || error));
function rateLimitRetryAfterMs(error) {
  const match = /retry after (\d+)\s*s/i.exec(String(error?.message || error));
  const ms = match ? Number(match[1]) * 1e3 : 3e3;
  return Math.min(Math.max(ms, 3e3), 6e4);
}
const MAX_BATCH = 16;
const BATCH_CONCURRENCY = 4;
function staffReadEntryKey(request, user, deniedFieldScope) {
  const entity = String(request?.entity || "").trim();
  const ownerScope = user.role !== "admin" && (OWNER_SCOPED.has(entity) || (OWNER_FIELD_DENYLIST[entity] || []).length > 0) ? String(user.email || "").trim().toLowerCase() : "";
  return JSON.stringify({
    entity,
    id: request?.id,
    query: request?.query,
    sort: request?.sort,
    limit: request?.limit,
    skip: request?.skip,
    cursor: request?.cursor,
    fields: request?.fields,
    count: request?.count
  }) + "|" + (user.role === "admin" ? "admin" : "staff") + "|" + ownerScope + "|" + deniedFieldScope;
}
async function readOneCached(base44, user, request, deniedFieldScope) {
  const key = staffReadEntryKey(request, user, deniedFieldScope);
  const hit = staffReadCache.get(key);
  if (hit && hit.expires > Date.now()) return hit.result;
  const pending = staffReadInFlight.get(key);
  if (pending) return pending;
  const promise = readOne(base44, user, request).then((result) => {
    if (result.status === 200) {
      if (staffReadCache.size > 300) staffReadCache.clear();
      staffReadCache.set(key, { result, expires: Date.now() + STAFF_READ_CACHE_MS });
    }
    return result;
  }).finally(() => {
    staffReadInFlight.delete(key);
  });
  staffReadInFlight.set(key, promise);
  return promise;
}
async function readOne(base44, user, body) {
  try {
    const entityName = String(body?.entity || "").trim();
    if (!STAFF_READABLE.has(entityName) && !ADMIN_READABLE.has(entityName)) {
      return { status: 403, body: { error: "This record type cannot be read here." } };
    }
    if (ADMIN_READABLE.has(entityName) && user.role !== "admin") {
      return { status: 403, body: { error: "This record type requires a CCS admin." } };
    }
    const entity = base44.asServiceRole.entities[entityName];
    const ownerEmail = user.role === "admin" ? "" : String(user.email).trim().toLowerCase();
    const id = String(body?.id || "").trim();
    if (id) {
      const item = await entity.get(id).catch((e) => Number(e?.status) === 404 ? null : Promise.reject(e));
      if (!item) return { status: 404, body: { error: "Record not found." } };
      if (OWNER_SCOPED.has(entityName) && ownerEmail && String(item?.user_email || "").trim().toLowerCase() !== ownerEmail) {
        return { status: 404, body: { error: "Record not found." } };
      }
      return { status: 200, body: { success: true, item: projectItem(entityName, item, user) } };
    }
    const query = cleanQuery(body?.query, entityName, user);
    const sort = cleanSort(body?.sort, entityName, user);
    const limit = cleanLimit(body?.limit, 100);
    const skip = cleanSkip(body?.skip);
    const cursor = cleanCursor(body?.cursor);
    const fields = cleanFields(body?.fields);
    let effectiveQuery = query;
    if (OWNER_SCOPED.has(entityName) && ownerEmail) {
      effectiveQuery = { ...effectiveQuery || {}, user_email: ownerEmail };
    }
    if (body?.count === true) {
      const counted = await countRows(entity, effectiveQuery);
      return { status: 200, body: { success: true, count: counted.count, truncated: counted.truncated } };
    }
    let rows = [];
    let nextCursor = null;
    let hasMore = false;
    if (cursor || fields) {
      const options = { sort: sort || void 0, limit };
      if (!cursor && skip) options.skip = skip;
      if (cursor) options.cursor = cursor;
      if (fields) options.fields = fields;
      const page = effectiveQuery ? await entity.filter(effectiveQuery, options) : await entity.list(options);
      const pageRows = Array.isArray(page) ? page : page?.items;
      rows = Array.isArray(pageRows) ? pageRows : [];
      nextCursor = !Array.isArray(page) && typeof page?.next_cursor === "string" && page.next_cursor ? page.next_cursor : null;
      hasMore = !Array.isArray(page) && (page?.has_more === true || Boolean(nextCursor));
    } else {
      const items = effectiveQuery ? await entity.filter(effectiveQuery, sort || null, limit, skip) : await entity.list(sort || null, limit, skip);
      rows = Array.isArray(items) ? items : [];
    }
    const scopedRows = OWNER_SCOPED.has(entityName) && ownerEmail ? rows.filter((row) => String(row?.user_email || "").trim().toLowerCase() === ownerEmail) : rows;
    const payload = {
      success: true,
      items: scopedRows.map((row) => projectItem(entityName, row, user)),
      returned: scopedRows.length,
      truncated: hasMore || Boolean(nextCursor) || rows.length >= limit
    };
    if (nextCursor) payload.next_cursor = nextCursor;
    return { status: 200, body: payload };
  } catch (error) {
    if (isRateLimited(error)) {
      return { status: 429, body: { error: "Data could not be loaded. Try again.", retry_after_ms: rateLimitRetryAfterMs(error) } };
    }
    const status = Number(error?.status || error?.response?.status || 500);
    if ([400, 401, 403, 404, 429].includes(status)) {
      return { status, body: { error: error?.message || "Staff read failed." } };
    }
    console.error("staffDataRead error:", error);
    return { status: 500, body: { error: "Data could not be loaded. Try again." } };
  }
}
function toResponse(result) {
  const retryMs = Number(result.body?.retry_after_ms) || 3e3;
  const headers = result.status === 429 ? { "Retry-After": String(Math.max(1, Math.ceil(retryMs / 1e3))) } : {};
  return Response.json(result.body, { status: result.status, headers });
}
Deno.serve(async (req) => {
  try {
    const base44 = (0, import_entityRateLimitRetry.withEntityRateLimitRetry)((0, import_sdk_0_8.createClientFromRequest)(req), { maxRetries: 1 });
    const entityStatsStart = (0, import_entityRateLimitRetry.entityCallIsolateStats)();
    const entityCalls = () => (0, import_entityRateLimitRetry.entityCallIsolateStats)().calls - entityStatsStart.calls;
    const body = await req.json().catch(() => ({}));
    const user = await (0, import_fleetStaffSession.resolveFleetStaffUser)(base44, body?.session_token);
    if (!user?.email) return Response.json({ error: "Authentication required" }, { status: 401 });
    const deniedFieldScope = user?.admin_permissions?.denied_fields ? JSON.stringify(user.admin_permissions.denied_fields) : "";
    if (Array.isArray(body?.entities) || Array.isArray(body?.requests)) {
      const entityMode = Array.isArray(body.entities);
      const requests = entityMode ? body.entities : body.requests;
      if (requests.length === 0 || requests.length > MAX_BATCH) {
        return Response.json({ error: `Staff read batch needs 1 to ${MAX_BATCH} reads.` }, { status: 400 });
      }
      const entities = {};
      const errors = {};
      const denied = [];
      const results = new Array(requests.length);
      let rateLimited = false;
      let rateLimitError = "Data could not be loaded. Try again.";
      let batchRetryAfterMs = 0;
      for (let start = 0; start < requests.length; start += BATCH_CONCURRENCY) {
        const slice = requests.slice(start, start + BATCH_CONCURRENCY);
        const settled = rateLimited ? slice.map(() => ({ status: 429, body: { error: rateLimitError, retry_after_ms: batchRetryAfterMs || 3e3 } })) : await Promise.all(slice.map((request) => readOneCached(base44, user, request, deniedFieldScope)));
        settled.forEach((result2, offset) => {
          results[start + offset] = result2;
          const name = String(requests[start + offset]?.entity || "").trim();
          if (result2.status === 200) {
            entities[name] = result2.body?.items ?? result2.body?.item ?? result2.body?.count;
          } else if (result2.status === 403 && name) {
            entities[name] = [];
            if (!denied.includes(name)) denied.push(name);
          } else if (name) {
            errors[name] = {
              status: result2.status,
              error: result2.body?.error || "Staff read failed.",
              ...result2.status === 429 ? { retry_after_ms: Number(result2.body?.retry_after_ms) || 3e3 } : {}
            };
          }
          if (result2.status === 429) {
            batchRetryAfterMs = Math.max(batchRetryAfterMs, Number(result2.body?.retry_after_ms) || 3e3);
          }
        });
        if (!rateLimited) {
          const limited = settled.find((result2) => result2.status === 429);
          if (limited) {
            rateLimited = true;
            rateLimitError = limited.body?.error || rateLimitError;
          }
        }
      }
      const batchPayload = entityMode ? {
        success: true,
        entity_calls: entityCalls(),
        entities,
        ...denied.length ? { denied } : {},
        ...Object.keys(errors).length ? { errors } : {},
        ...batchRetryAfterMs ? { retry_after_ms: batchRetryAfterMs } : {}
      } : { success: true, results, ...batchRetryAfterMs ? { retry_after_ms: batchRetryAfterMs } : {} };
      return Response.json(batchPayload);
    }
    const result = await readOneCached(base44, user, body, deniedFieldScope);
    if (result.status === 200 && result.body && typeof result.body === "object") {
      result.body.entity_calls = entityCalls();
    }
    return toResponse(result);
  } catch (error) {
    if (isRateLimited(error)) {
      const retryAfterMs = rateLimitRetryAfterMs(error);
      return Response.json(
        { error: "Data could not be loaded. Try again.", retry_after_ms: retryAfterMs },
        { status: 429, headers: { "Retry-After": String(Math.max(1, Math.ceil(retryAfterMs / 1e3))) } }
      );
    }
    const status = Number(error?.status || error?.response?.status || 500);
    if ([400, 401, 403, 429].includes(status)) {
      return Response.json({ error: error?.message || "Staff read failed." }, { status });
    }
    console.error("staffDataRead error:", error);
    return Response.json({ error: "Data could not be loaded. Try again." }, { status: 500 });
  }
});

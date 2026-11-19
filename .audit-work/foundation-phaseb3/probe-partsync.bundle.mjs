// candidate-tree-src/api/base44Client.js
var base44 = { entities: {}, functions: { invoke: async () => {
  throw new Error("stub");
} }, asServiceRole: { entities: {} } };

// candidate-tree-src/components/estimator/loadAllEntityRows.js
async function loadAllEntityRows() {
  return [];
}

// candidate-tree-src/components/estimator/parts/partState.js
var requiresBuilderReattach = () => false;

// candidate-tree-src/components/vinylEstimator/vinylNestingCalculator.js
var calculateVinylProject = () => ({ parts: [] });

// candidate-tree-src/components/estimator/brick/brickCalc.js
var calcBrickStoneProject = () => ({ parts: [] });

// candidate-tree-src/components/signMaintenance/maintenanceCalculator.js
var calcServiceItem = () => ({ parts: [] });
var calcProjectTotals = () => ({ parts: [] });

// candidate-tree-src/components/estimator/customerPricing.js
var acceptedCustomerUnitPrice = () => null;
var liveCustomerUnitPrice = () => null;

// candidate-tree-src/components/estimator/estimateMutationGuard.js
var assertEstimateProductMutationAllowed = () => true;

// candidate-tree-src/components/estimator/estimatePersistence.js
function normalize(value) {
  if (Array.isArray(value)) return value.map(normalize);
  if (!value || typeof value !== "object") return value;
  return Object.keys(value).sort().reduce((out, key) => {
    out[key] = normalize(value[key]);
    return out;
  }, {});
}
function sameValue(a, b) {
  if (a !== null && a !== void 0 && a !== "" && b !== null && b !== void 0 && b !== "") {
    if (Number.isFinite(Number(a)) && Number.isFinite(Number(b))) {
      return Math.abs(Number(a) - Number(b)) <= 1e-6;
    }
  }
  return JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));
}
function expectedEstimateFields(record = {}, nextFields = {}) {
  const expected = Object.fromEntries(
    Object.keys(nextFields || {}).map((field) => [field, record?.[field]])
  );
  if (!Object.prototype.hasOwnProperty.call(expected, "deleted") && Object.prototype.hasOwnProperty.call(record || {}, "deleted")) {
    expected.deleted = record?.deleted;
  }
  return expected;
}
async function replaceEstimateFieldsIfUnchanged({
  entity,
  estimateId,
  expectedFields,
  guardFields = {},
  nextFields,
  label = "Estimate fields",
  maxAttempts = 3
} = {}) {
  const id = String(estimateId || "").trim();
  const expected = expectedFields && typeof expectedFields === "object" && !Array.isArray(expectedFields) ? expectedFields : null;
  const guards = guardFields && typeof guardFields === "object" && !Array.isArray(guardFields) ? guardFields : {};
  const desired = nextFields && typeof nextFields === "object" && !Array.isArray(nextFields) ? nextFields : null;
  const fieldNames = desired ? Object.keys(desired) : [];
  const guardNames = Object.keys(guards);
  if (!id || !expected || !desired || fieldNames.length === 0 || typeof entity?.get !== "function" || typeof entity?.updateMany !== "function") {
    throw new Error(`${label} could not initialize its concurrency-safe update.`);
  }
  for (const fieldName of fieldNames) {
    if (!Object.prototype.hasOwnProperty.call(expected, fieldName)) {
      throw new Error(`${label} is missing the loaded baseline for ${fieldName}.`);
    }
  }
  const attempts = Math.max(1, Math.min(5, Number(maxAttempts) || 3));
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const current = await entity.get(id);
    if (!current?.id) throw new Error(`${label} could not verify its Estimate before saving.`);
    if ((current.deleted === true || expected.deleted === true) && !Object.prototype.hasOwnProperty.call(desired, "deleted")) {
      throw new Error(`${label} was blocked because this Estimate is in Trash. Restore it before saving. No Estimate fields were overwritten.`);
    }
    for (const fieldName of guardNames) {
      if (!sameValue(current[fieldName], guards[fieldName])) {
        throw new Error(`${label} changed in another session (${fieldName}). Reload before saving. No Estimate fields were overwritten.`);
      }
    }
    const alreadyDesired = fieldNames.every((fieldName) => sameValue(current[fieldName], desired[fieldName]));
    if (alreadyDesired) return current;
    for (const fieldName of fieldNames) {
      const currentValue = current[fieldName];
      if (!sameValue(currentValue, expected[fieldName]) && !sameValue(currentValue, desired[fieldName])) {
        throw new Error(`${label} changed in another session (${fieldName}). Reload before saving. No Estimate fields were overwritten.`);
      }
    }
    const expectedUpdatedAt = String(current.updated_date || "").trim();
    if (!expectedUpdatedAt) throw new Error(`${label} is missing its current Estimate version. Reload before saving.`);
    let result;
    try {
      result = await entity.updateMany(
        { id, updated_date: expectedUpdatedAt },
        { $set: desired }
      );
    } catch (error) {
      const afterError = await entity.get(id).catch(() => null);
      if (afterError && fieldNames.every((fieldName) => sameValue(afterError[fieldName], desired[fieldName]))) {
        return afterError;
      }
      throw error;
    }
    if (!result || typeof result.updated !== "number") {
      throw new Error(`${label} conditional update result could not be verified.`);
    }
    if (result.updated === 1) {
      const saved = await entity.get(id).catch(() => null);
      if (!saved) throw new Error(`${label} was saved but could not be re-read.`);
      return saved;
    }
  }
  throw new Error(`${label} Estimate changed repeatedly while saving. Reload and try again.`);
}

// candidate-tree-src/components/estimator/builder/builderEntityPersistence.js
function normalize2(value) {
  if (Array.isArray(value)) return value.map(normalize2);
  if (!value || typeof value !== "object") return value;
  return Object.keys(value).sort().reduce((out, key) => {
    out[key] = normalize2(value[key]);
    return out;
  }, {});
}
function sameValue2(a, b) {
  if (a !== null && a !== void 0 && a !== "" && b !== null && b !== void 0 && b !== "") {
    if (Number.isFinite(Number(a)) && Number.isFinite(Number(b))) {
      return Math.abs(Number(a) - Number(b)) <= 1e-6;
    }
  }
  return JSON.stringify(normalize2(a)) === JSON.stringify(normalize2(b));
}
function isEntityNotFoundError(error) {
  const status = Number(error?.status || error?.response?.status || error?.response?.statusCode || error?.data?.status || 0);
  if (status === 404) return true;
  const message = String(
    error?.message || error?.response?.data?.message || error?.response?.data?.error || error?.data?.message || error?.data?.error || ""
  ).toLowerCase();
  return message.includes("not found") || message.includes("does not exist");
}
function expectedBuilderEntityFields(record = {}, nextFields = {}) {
  return Object.fromEntries(
    Object.keys(nextFields || {}).map((field) => [field, record?.[field]])
  );
}
async function replaceBuilderEntityFieldsIfUnchanged({
  entity,
  id,
  expectedUpdatedAt = "",
  expectedFields,
  nextFields,
  guardFields = {},
  label = "Builder record",
  maxAttempts = 3
} = {}) {
  const recordId = String(id || "").trim();
  const expectedVersion = String(expectedUpdatedAt || "").trim();
  const expected = expectedFields && typeof expectedFields === "object" && !Array.isArray(expectedFields) ? expectedFields : null;
  const desired = nextFields && typeof nextFields === "object" && !Array.isArray(nextFields) ? nextFields : null;
  const guards = guardFields && typeof guardFields === "object" && !Array.isArray(guardFields) ? guardFields : {};
  const fieldNames = desired ? Object.keys(desired) : [];
  if (!recordId || !expected || !desired || fieldNames.length === 0 || typeof entity?.get !== "function" || typeof entity?.updateMany !== "function") {
    throw new Error(`${label} could not initialize its concurrency-safe update.`);
  }
  for (const fieldName of fieldNames) {
    if (!Object.prototype.hasOwnProperty.call(expected, fieldName)) {
      throw new Error(`${label} is missing the loaded baseline for ${fieldName}.`);
    }
  }
  const attempts = Math.max(1, Math.min(5, Number(maxAttempts) || 3));
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const current = await entity.get(recordId);
    if (!current?.id) throw new Error(`${label} could not be re-read before saving.`);
    for (const [fieldName, value] of Object.entries(guards)) {
      if (!sameValue2(current[fieldName], value)) {
        throw new Error(`${label} changed in another session (${fieldName}). Reload before saving.`);
      }
    }
    const alreadyDesired = fieldNames.every((fieldName) => sameValue2(current[fieldName], desired[fieldName]));
    if (alreadyDesired) return current;
    if (expectedVersion && String(current.updated_date || "") !== expectedVersion) {
      throw new Error(`${label} changed in another session. Reload before saving.`);
    }
    for (const fieldName of fieldNames) {
      if (!sameValue2(current[fieldName], expected[fieldName]) && !sameValue2(current[fieldName], desired[fieldName])) {
        throw new Error(`${label} changed in another session (${fieldName}). Reload before saving.`);
      }
    }
    const currentVersion = String(current.updated_date || "").trim();
    if (!currentVersion) throw new Error(`${label} is missing its current version. Reload before saving.`);
    let result;
    try {
      result = await entity.updateMany(
        { id: recordId, updated_date: currentVersion },
        { $set: desired }
      );
    } catch (error) {
      const afterError = await entity.get(recordId).catch(() => null);
      if (afterError && fieldNames.every((fieldName) => sameValue2(afterError[fieldName], desired[fieldName]))) return afterError;
      throw error;
    }
    if (!result || typeof result.updated !== "number") {
      throw new Error(`${label} conditional-update result could not be verified.`);
    }
    if (result.updated === 1) {
      const saved = await entity.get(recordId).catch(() => null);
      if (!saved) throw new Error(`${label} was updated but could not be re-read.`);
      if (!fieldNames.every((fieldName) => sameValue2(saved[fieldName], desired[fieldName]))) {
        throw new Error(`${label} was updated but its stored values do not match this save. Reload and review the record before retrying.`);
      }
      return saved;
    }
  }
  throw new Error(`${label} changed repeatedly while saving. Reload and try again.`);
}
async function deleteBuilderEntityIfUnchanged({
  entity,
  record,
  guardFields = {},
  label = "Builder record"
} = {}) {
  const id = String(record?.id || "").trim();
  const updatedDate = String(record?.updated_date || "").trim();
  if (!id || !updatedDate || typeof entity?.deleteMany !== "function" || typeof entity?.get !== "function") {
    throw new Error(`${label} could not initialize its concurrency-safe delete.`);
  }
  const query = { ...guardFields, id, updated_date: updatedDate };
  let result;
  try {
    result = await entity.deleteMany(query);
  } catch (error) {
    let current2;
    try {
      current2 = await entity.get(id);
    } catch (verificationError) {
      if (isEntityNotFoundError(verificationError)) {
        return { deleted: true, convergedAfterResponseLoss: true };
      }
      throw new Error(
        `${label} delete returned an error and its outcome could not be verified. ` + `Do not retry blindly; reload before continuing. ${verificationError?.message || ""}`.trim()
      );
    }
    if (!current2) return { deleted: true, convergedAfterResponseLoss: true };
    throw error;
  }
  if (!result || typeof result.deleted !== "number") {
    throw new Error(`${label} conditional-delete result could not be verified.`);
  }
  if (result.deleted === 1) return { deleted: true };
  if (result.deleted > 1) {
    throw new Error(`${label} returned an impossible multi-record delete count.`);
  }
  let current;
  try {
    current = await entity.get(id);
  } catch (verificationError) {
    if (isEntityNotFoundError(verificationError)) {
      return { deleted: true, alreadyDeleted: true };
    }
    throw new Error(
      `${label} deletion matched no current version and the record could not be re-read. ` + `Do not retry blindly; reload before continuing. ${verificationError?.message || ""}`.trim()
    );
  }
  if (!current) return { deleted: true, alreadyDeleted: true };
  throw new Error(`${label} changed in another session. It was not deleted.`);
}
var expectedEntityFields = expectedBuilderEntityFields;
var replaceEntityFieldsIfUnchanged = replaceBuilderEntityFieldsIfUnchanged;

// candidate-tree-src/components/estimator/builder/builderPartGroupPersistence.js
var cleanString = (value) => String(value ?? "").trim().replace(/\s+/g, " ");
function comparable(value) {
  if (Array.isArray(value)) return value.map(comparable);
  if (!value || typeof value !== "object") return value;
  return Object.keys(value).sort().reduce((result, key) => {
    result[key] = comparable(value[key]);
    return result;
  }, {});
}
function sameValue3(a, b) {
  const emptyA = a === void 0 || a === null || a === "";
  const emptyB = b === void 0 || b === null || b === "";
  if (emptyA && emptyB) return true;
  if (!emptyA && !emptyB && Number.isFinite(Number(a)) && Number.isFinite(Number(b))) {
    return Math.abs(Number(a) - Number(b)) <= 1e-6;
  }
  if (typeof a === "string" && typeof b === "string") {
    return cleanString(a) === cleanString(b);
  }
  return JSON.stringify(comparable(a)) === JSON.stringify(comparable(b));
}
function matchesPayload(row, data) {
  return !!row && Object.entries(data || {}).every(([field, value]) => sameValue3(row[field], value));
}
async function createBuilderPartGroupWithRecovery({
  entity,
  data,
  label = "Builder Part Group"
} = {}) {
  const builderProductId = String(data?.builder_product_id || "").trim();
  const groupKey = String(data?.group_key || "").trim();
  if (!builderProductId || !groupKey || typeof entity?.filter !== "function" || typeof entity?.create !== "function") {
    throw new Error(`${label} could not initialize its retry-safe create.`);
  }
  const loadMatches = async () => {
    const rows = await entity.filter({ builder_product_id: builderProductId, group_key: groupKey });
    if (!Array.isArray(rows)) throw new Error(`${label} identity lookup did not return a record list.`);
    return rows.filter(
      (row) => String(row?.builder_product_id || "") === builderProductId && String(row?.group_key || "") === groupKey
    );
  };
  const before = await loadMatches();
  if (before.length > 1) {
    throw new Error(`${label} has multiple stored rows with the same Product/Group key. No row was changed; reload and review the duplicate Part Groups.`);
  }
  if (before.length === 1) {
    if (!matchesPayload(before[0], data)) {
      throw new Error(`${label} appeared concurrently with different data. The existing Part Group was not overwritten.`);
    }
    return { record: before[0], status: "existing" };
  }
  let created = null;
  let createError = null;
  try {
    created = await entity.create(data);
  } catch (error) {
    createError = error;
  }
  let after;
  try {
    after = await loadMatches();
  } catch (verifyError) {
    if (created?.id && matchesPayload(created, data)) return { record: created, status: "created_unverified_lookup" };
    throw new Error(`${label} create outcome could not be verified. Reload before retrying. ${verifyError?.message || "Recovery lookup failed."}`);
  }
  if (after.length > 1) {
    throw new Error(`${label} was created concurrently more than once for the same Product/Group key. No uncertain Part Group was deleted; reload and review the duplicate groups.`);
  }
  if (after.length === 1) {
    if (!matchesPayload(after[0], data)) {
      throw new Error(`${label} identity exists but its live data does not match this create. No Part Group was overwritten or deleted.`);
    }
    return {
      record: after[0],
      status: created?.id === after[0].id ? "created" : "recovered"
    };
  }
  if (created?.id && matchesPayload(created, data)) return { record: created, status: "created" };
  if (createError) throw new Error(`${label} could not be created and no matching Part Group was visible on recovery read. Reload before retrying. ${createError?.message || ""}`.trim());
  throw new Error(`${label} create response could not be verified. Reload before retrying.`);
}

// candidate-tree-src/components/staff/staffEntities.js
var staffEntities = {};

// candidate-tree-src/components/estimator/builder/builderMutationRecovery.js
var num = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value).sort().filter((key) => !["created_by", "created_by_id"].includes(key)).map((key) => [key, stableValue(value[key])])
  );
}
function sameSubstantiveValue(a, b) {
  const bothPresent = a !== null && a !== void 0 && a !== "" && b !== null && b !== void 0 && b !== "";
  if (bothPresent && Number.isFinite(Number(a)) && Number.isFinite(Number(b))) {
    return Math.abs(num(a) - num(b)) <= 5e-3;
  }
  return JSON.stringify(stableValue(a ?? null)) === JSON.stringify(stableValue(b ?? null));
}
function recoveryPatchDiffers(record, patch) {
  return Object.entries(patch || {}).some(([key, value]) => !sameSubstantiveValue(record?.[key], value));
}
function builderMutationHash(value) {
  const text = JSON.stringify(stableValue(value ?? null));
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}
function pendingBuilderMutation(line) {
  const pending = line?.price_acceptance_pending;
  return pending && typeof pending === "object" && String(pending.key || "").trim() ? pending : null;
}
var STALE_PENDING_BUILDER_MUTATION_MS = 24 * 60 * 60 * 1e3;
async function markBuilderMutationPending({ estimate, builder, pending }) {
  if (!estimate?.id || !builder?.id || !pending?.key) {
    throw new Error("Builder mutation recovery could not be initialized.");
  }
  const latestEstimate = await staffEntities.AllInOneEstimate.get(estimate.id);
  if (!latestEstimate) throw new Error("Estimate could not be verified before starting this Builder mutation.");
  if (estimate.updated_date && latestEstimate.updated_date && estimate.updated_date !== latestEstimate.updated_date) {
    throw new Error("This estimate changed in another session before the Builder mutation could start. No Product or Part pricing was changed.");
  }
  const latestLine = (latestEstimate.line_items || []).find((item) => item.builder_product_id === builder.id);
  if (!latestLine) throw new Error("This Product is no longer part of the estimate. No Product or Part pricing was changed.");
  const lineItems = (latestEstimate.line_items || []).map(
    (item) => item.builder_product_id === builder.id ? { ...item, price_acceptance_pending: pending } : item
  );
  await replaceEstimateFieldsIfUnchanged({
    entity: staffEntities.AllInOneEstimate,
    estimateId: estimate.id,
    expectedFields: expectedEstimateFields(latestEstimate, { line_items: lineItems }),
    nextFields: { line_items: lineItems },
    label: "Builder mutation recovery marker"
  });
  const [markedEstimate, currentBuilder, currentParts] = await Promise.all([
    staffEntities.AllInOneEstimate.get(estimate.id),
    staffEntities.BuilderProduct.get(builder.id),
    loadAllEntityRows({ entity: staffEntities.BuilderPart, query: { builder_product_id: builder.id }, sort: "sort_order", label: "Builder recovery Parts" })
  ]);
  const markedLine = (markedEstimate?.line_items || []).find((item) => item.builder_product_id === builder.id);
  const canonicalPending = pendingBuilderMutation(markedLine);
  if (!canonicalPending || canonicalPending.key !== pending.key) {
    throw new Error("Another Builder mutation won the recovery marker race. Reload before continuing.");
  }
  return { markedEstimate, currentBuilder, currentParts, markedLine, canonicalPending };
}
function validatePendingBuilderMutation(pending, { estimateId, builder, line }) {
  if (!pending || !String(pending.kind || "").startsWith("builder_")) {
    throw new Error("The pending Builder recovery marker is invalid. No pricing or Part change was continued.");
  }
  if (String(pending.estimate_id || "") !== String(estimateId || "") || String(pending.builder_product_id || "") !== String(builder?.id || "") || pending.estimate_line_id && line?.line_id && pending.estimate_line_id !== line.line_id) {
    throw new Error("The pending Builder recovery marker no longer matches this Estimate Product.");
  }
}
function currentSignShopSessionToken() {
  try {
    if (typeof window === "undefined") return "";
    return String(window.localStorage?.getItem("sss_session_token") || "").trim();
  } catch {
    return "";
  }
}
async function ensureBuilderPriceRevision(idempotencyKey, revision) {
  const sessionToken = currentSignShopSessionToken();
  if (!sessionToken) {
    throw new Error("Your signed sign-shop session is no longer available. Sign in again before changing Builder pricing.");
  }
  const response = await base44.functions.invoke("ensureBuilderPriceRevision", {
    idempotency_key: idempotencyKey,
    revision,
    session_token: sessionToken
  });
  const result = response?.data || response;
  if (result?.error) throw new Error(result.error);
  if (!result?.revision?.id) throw new Error("Builder price revision could not be verified after recording.");
  return result.revision;
}
async function applyPendingSourcePatch(pending) {
  const sourceEntity = String(pending?.source_entity || "").trim();
  const sourceProjectId = String(pending?.source_project_id || "").trim();
  const sourcePatch = pending?.source_patch && typeof pending.source_patch === "object" ? pending.source_patch : null;
  if (!sourceEntity || !sourceProjectId || !sourcePatch || Object.keys(sourcePatch).length === 0) return null;
  const entity = staffEntities[sourceEntity];
  if (!entity?.get || !entity?.updateMany) throw new Error("The Builder source entity needed for recovery is unavailable.");
  const current = await entity.get(sourceProjectId);
  if (!current) throw new Error("The Builder source project could not be verified while recovering the pending mutation.");
  if (!recoveryPatchDiffers(current, sourcePatch)) return current;
  const expected = String(pending?.source_updated_date_before || "").trim();
  const actual = String(current?.updated_date || "").trim();
  if (expected && actual && expected !== actual) {
    throw new Error("The Builder source project changed while reattachment was pending. The recovery marker was retained and no unrelated source edit was overwritten.");
  }
  return replaceEntityFieldsIfUnchanged({
    entity,
    id: sourceProjectId,
    expectedUpdatedAt: current.updated_date || "",
    expectedFields: expectedEntityFields(current, sourcePatch),
    nextFields: sourcePatch,
    label: "Builder source recovery"
  });
}
async function applyPendingGroupCreatePlan(pending, builderProductId) {
  const plan = pending?.group_create_plan;
  const groups = Array.isArray(plan?.groups) ? plan.groups : [];
  if (!groups.length) return /* @__PURE__ */ new Map();
  const currentGroups = await loadAllEntityRows({ entity: staffEntities.BuilderPartGroup, query: { builder_product_id: builderProductId }, sort: "sort_order", label: "Builder recovery Part Groups" });
  if (!Array.isArray(currentGroups) || currentGroups.some((group) => String(group?.builder_product_id || "") !== String(builderProductId || ""))) {
    throw new Error("Part Groups could not be verified while recovering the pending Builder mutation.");
  }
  const byKey = new Map(currentGroups.map((group) => [group.group_key, group]));
  const resolvedIds = /* @__PURE__ */ new Map();
  for (const step of groups) {
    const groupKey = String(step?.group_key || step?.data?.group_key || "").trim();
    const data = step?.data && typeof step.data === "object" ? step.data : null;
    if (!groupKey || !data) throw new Error("A stored Part Group create step is invalid. Recovery was stopped before creating anything else.");
    const { record: resolved } = await createBuilderPartGroupWithRecovery({
      entity: staffEntities.BuilderPartGroup,
      data,
      label: `Builder Part Group \u201C${data.group_name || groupKey}\u201D recovery create`
    });
    if (!resolved?.id) throw new Error("A Part Group could not be verified after creation while recovering the Builder mutation.");
    byKey.set(groupKey, resolved);
    resolvedIds.set(groupKey, resolved.id);
  }
  return resolvedIds;
}
function resolvePendingPartGroupRefs(plan, groupIds) {
  if (!Array.isArray(plan?.part_updates) || !groupIds?.size) return plan;
  return {
    ...plan,
    part_updates: plan.part_updates.map((step) => {
      const groupKey = String(step?.part_group_key_ref || "").trim();
      if (!groupKey) return step;
      const groupId = groupIds.get(groupKey);
      if (!groupId) throw new Error("A stored Part could not resolve its pending Part Group during recovery.");
      return {
        ...step,
        data: step?.data ? { ...step.data, part_group_id: groupId } : step.data,
        patch: step?.patch ? { ...step.patch, part_group_id: groupId } : step.patch
      };
    })
  };
}
async function verifyPendingPreconditions(pending, builderProductId) {
  const plan = pending?.precondition_plan;
  if (!plan || typeof plan !== "object") return;
  const createGroups = Array.isArray(pending?.group_create_plan?.groups) ? pending.group_create_plan.groups : [];
  let createdGroupsByKey = /* @__PURE__ */ new Map();
  if (createGroups.length) {
    const currentGroups = await loadAllEntityRows({ entity: staffEntities.BuilderPartGroup, query: { builder_product_id: builderProductId }, sort: "sort_order", label: "Builder recovery Part Groups" });
    if (!Array.isArray(currentGroups)) throw new Error("Part Groups could not be verified while checking Builder mutation preconditions.");
    createdGroupsByKey = new Map(currentGroups.map((group) => [group.group_key, group]));
  }
  for (const step of plan.groups || []) {
    const group = await staffEntities.BuilderPartGroup.get(step.id);
    if (!group) {
      if (step.allow_missing_if_applied) continue;
      throw new Error("A source Part Group disappeared while the Builder mutation was pending.");
    }
    if (String(group.builder_product_id || "") !== String(builderProductId || "")) {
      throw new Error("A source Part Group changed ownership while the Builder mutation was pending.");
    }
    const sourceMatches = (!step.expected_patch || !recoveryPatchDiffers(group, step.expected_patch)) && (!step.expected_updated_date || !group.updated_date || String(step.expected_updated_date) === String(group.updated_date));
    if (sourceMatches) continue;
    if (step.target_patch && !recoveryPatchDiffers(group, step.target_patch)) continue;
    throw new Error(`Part Group \u201C${group.group_name || "Part Group"}\u201D changed while the Builder mutation was pending. No unrelated Group edit was overwritten.`);
  }
  for (const step of plan.parts || []) {
    const part = await staffEntities.BuilderPart.get(step.id);
    if (!part || String(part.builder_product_id || "") !== String(builderProductId || "")) {
      throw new Error("A source Part changed ownership or disappeared while the Builder mutation was pending.");
    }
    const sourceMatches = (!step.expected_patch || !recoveryPatchDiffers(part, step.expected_patch)) && (!step.expected_updated_date || !part.updated_date || String(step.expected_updated_date) === String(part.updated_date));
    if (sourceMatches) continue;
    if (step.target_patch && !recoveryPatchDiffers(part, step.target_patch)) continue;
    if (step.target_group_key_ref) {
      const targetGroup = createdGroupsByKey.get(step.target_group_key_ref);
      if (targetGroup?.id && String(part.part_group_id || "") === String(targetGroup.id)) continue;
    }
    throw new Error(`Part \u201C${part.part_name || "Part"}\u201D changed while the Builder mutation was pending. No unrelated Part edit was overwritten.`);
  }
}
async function applyPendingDeletePlan(pending, builderProductId) {
  const plan = pending?.delete_plan;
  if (!plan || typeof plan !== "object") return { partDeletes: 0, groupDeletes: 0 };
  const verifiedParts = [];
  const verifiedGroups = [];
  for (const step of plan.parts || []) {
    const part = await staffEntities.BuilderPart.get(step.id);
    if (!part) continue;
    if (String(part.builder_product_id || "") !== String(builderProductId || "")) {
      throw new Error("A Part scheduled for deletion changed ownership while the Builder mutation was pending.");
    }
    const expected = String(step.expected_updated_date || "").trim();
    const current = String(part.updated_date || "").trim();
    if (expected && current && expected !== current) {
      throw new Error(`Part \u201C${part.part_name || "Part"}\u201D changed while removal was pending. No unrelated Part edit was deleted.`);
    }
    verifiedParts.push(part);
  }
  for (const step of plan.groups || []) {
    const group = await staffEntities.BuilderPartGroup.get(step.id);
    if (!group) continue;
    if (String(group.builder_product_id || "") !== String(builderProductId || "")) {
      throw new Error("A Part Group scheduled for deletion changed ownership while the Builder mutation was pending.");
    }
    const expected = String(step.expected_updated_date || "").trim();
    const current = String(group.updated_date || "").trim();
    if (expected && current && expected !== current) {
      throw new Error(`Part Group \u201C${group.group_name || "Part Group"}\u201D changed while removal was pending. No unrelated group edit was deleted.`);
    }
    verifiedGroups.push(group);
  }
  let partDeletes = 0;
  let groupDeletes = 0;
  for (const part of verifiedParts) {
    await deleteBuilderEntityIfUnchanged({
      entity: staffEntities.BuilderPart,
      record: part,
      guardFields: { builder_product_id: builderProductId },
      label: `Builder Part \u201C${part.part_name || "Part"}\u201D`
    });
    partDeletes += 1;
  }
  for (const group of verifiedGroups) {
    await deleteBuilderEntityIfUnchanged({
      entity: staffEntities.BuilderPartGroup,
      record: group,
      guardFields: { builder_product_id: builderProductId },
      label: `Builder Part Group \u201C${group.group_name || "Part Group"}\u201D`
    });
    groupDeletes += 1;
  }
  return { partDeletes, groupDeletes };
}
async function resumeBuilderMutation({
  estimateId,
  estimate,
  builder,
  parts,
  line,
  pending,
  applyPartPlan
}) {
  validatePendingBuilderMutation(pending, { estimateId, builder, line });
  if (pending.kind === "builder_part_group_move") {
    throw new Error("This pending Part Group move must be resumed with its two-Product recovery action.");
  }
  if (pending.kind === "builder_product_remove") {
    throw new Error("This pending Product removal must be resumed with Resume Product Remove.");
  }
  if (typeof applyPartPlan !== "function") throw new Error("Builder recovery could not apply its stored Part plan.");
  await assertEstimateProductMutationAllowed(estimate, { allowPriceAcceptanceKey: pending.key });
  if (!Array.isArray(parts) || parts.some((part) => part?.builder_product_id !== builder.id)) {
    throw new Error("Builder Parts could not be verified while recovering the pending Builder mutation.");
  }
  const plan = pending.part_acceptance_plan || {};
  const builderPatch = pending.builder_patch || {};
  const preflightBuilder = await staffEntities.BuilderProduct.get(builder.id);
  if (!preflightBuilder?.id) throw new Error("Builder Product could not be verified before recovering the pending mutation.");
  if (recoveryPatchDiffers(preflightBuilder, builderPatch)) {
    const expectedBuilderUpdatedAt = String(pending.builder_updated_date_before || "").trim();
    const currentBuilderUpdatedAt = String(preflightBuilder.updated_date || "").trim();
    if (expectedBuilderUpdatedAt && currentBuilderUpdatedAt && expectedBuilderUpdatedAt !== currentBuilderUpdatedAt) {
      throw new Error("This Builder Product changed while a Builder mutation was pending. Recovery stopped before applying any stored Part/Group writes.");
    }
  }
  await verifyPendingPreconditions(pending, builder.id);
  await applyPendingSourcePatch(pending);
  await applyPendingDeletePlan(pending, builder.id);
  const groupIds = await applyPendingGroupCreatePlan(pending, builder.id);
  const resolvedPlan = resolvePendingPartGroupRefs(plan, groupIds);
  await applyPartPlan(builder.id, resolvedPlan);
  if (pending.post_part_delete_plan) {
    await applyPendingDeletePlan({ delete_plan: pending.post_part_delete_plan }, builder.id);
  }
  let revision = pending.revision || {};
  const changedParts = Array.isArray(revision.changed_parts) ? revision.changed_parts : [];
  if (changedParts.some((part) => part?.part_key_ref || part?.new_group_key_ref)) {
    const currentParts = await loadAllEntityRows({ entity: staffEntities.BuilderPart, query: { builder_product_id: builder.id }, sort: "sort_order", label: "Builder recovery Parts" });
    if (!Array.isArray(currentParts)) throw new Error("Created Parts could not be verified before recording the Builder revision.");
    const partsByKey = new Map(currentParts.map((part) => [part.part_key, part]));
    revision = {
      ...revision,
      changed_parts: changedParts.map((part) => {
        const hydrated = { ...part };
        if (hydrated.part_key_ref) {
          const createdPart = partsByKey.get(hydrated.part_key_ref);
          if (!createdPart?.id) throw new Error("A created Part could not be resolved for the Builder revision audit.");
          hydrated.part_id = createdPart.id;
          hydrated.part_key = createdPart.part_key;
          delete hydrated.part_key_ref;
        }
        if (hydrated.new_group_key_ref) {
          const createdGroupId = groupIds.get(hydrated.new_group_key_ref);
          if (!createdGroupId) throw new Error("A created Part Group could not be resolved for the Builder revision audit.");
          hydrated.new_group_id = createdGroupId;
          delete hydrated.new_group_key_ref;
        }
        return hydrated;
      })
    };
  }
  if (!pending.skip_revision) {
    await ensureBuilderPriceRevision(pending.key, revision);
  }
  const currentBuilder = await staffEntities.BuilderProduct.get(builder.id);
  if (!currentBuilder?.id) throw new Error("Builder Product could not be verified while completing the pending mutation.");
  if (recoveryPatchDiffers(currentBuilder, builderPatch)) {
    const expectedBuilderUpdatedAt = String(pending.builder_updated_date_before || "").trim();
    const currentBuilderUpdatedAt = String(currentBuilder.updated_date || "").trim();
    if (expectedBuilderUpdatedAt && currentBuilderUpdatedAt && expectedBuilderUpdatedAt !== currentBuilderUpdatedAt) {
      throw new Error("This Builder Product changed while a Builder mutation was pending. The recovery marker was retained and no unrelated Builder edit was overwritten.");
    }
    await replaceBuilderEntityFieldsIfUnchanged({
      entity: staffEntities.BuilderProduct,
      id: builder.id,
      expectedUpdatedAt: currentBuilder.updated_date || "",
      expectedFields: expectedBuilderEntityFields(currentBuilder, builderPatch),
      nextFields: builderPatch,
      guardFields: { estimate_id: currentBuilder.estimate_id },
      label: "Builder Product recovery completion"
    });
  }
  const latestEstimate = await staffEntities.AllInOneEstimate.get(estimateId);
  if (!latestEstimate) throw new Error("Estimate could not be verified while completing the pending Builder mutation.");
  const latestLine = (latestEstimate.line_items || []).find((item) => item.builder_product_id === builder.id);
  if (!latestLine) throw new Error("This Product is no longer part of the estimate. The pending Builder recovery marker could not be completed.");
  const latestPending = pendingBuilderMutation(latestLine);
  const linePatch = pending.line_patch || {};
  if (!latestPending) {
    if (!recoveryPatchDiffers(latestLine, linePatch)) {
      return {
        blocked: false,
        recovered: true,
        alreadyCompleted: true,
        changedParts: resolvedPlan.changed_parts || [],
        line: latestLine
      };
    }
    throw new Error("The Builder recovery marker disappeared before the accepted Estimate line was verified. Reload before continuing.");
  }
  if (latestPending.key !== pending.key) {
    throw new Error("A different Builder recovery operation is now active for this Product. Reload before continuing.");
  }
  await assertEstimateProductMutationAllowed(latestEstimate, { allowPriceAcceptanceKey: pending.key });
  const lineItems = (latestEstimate.line_items || []).map(
    (item) => item.builder_product_id === builder.id ? { ...item, ...linePatch, price_acceptance_pending: {} } : item
  );
  const updateResult = await replaceEstimateFieldsIfUnchanged({
    entity: staffEntities.AllInOneEstimate,
    estimateId,
    expectedFields: expectedEstimateFields(latestEstimate, { line_items: lineItems }),
    nextFields: { line_items: lineItems },
    label: "Builder mutation recovery completion"
  });
  const completedLine = (updateResult?.line_items || lineItems).find((item) => item.builder_product_id === builder.id) || null;
  return {
    blocked: false,
    recovered: true,
    changedParts: resolvedPlan.changed_parts || [],
    line: completedLine
  };
}

// candidate-tree-src/components/estimator/builder/builderPartPersistence.js
var cleanString2 = (value) => String(value ?? "").trim().replace(/\s+/g, " ");
function comparable2(value) {
  if (Array.isArray(value)) return value.map(comparable2);
  if (!value || typeof value !== "object") return value;
  return Object.keys(value).sort().reduce((result, key) => {
    result[key] = comparable2(value[key]);
    return result;
  }, {});
}
function sameValue4(a, b) {
  const emptyA = a === void 0 || a === null || a === "";
  const emptyB = b === void 0 || b === null || b === "";
  if (emptyA && emptyB) return true;
  if (!emptyA && !emptyB && Number.isFinite(Number(a)) && Number.isFinite(Number(b))) {
    return Math.abs(Number(a) - Number(b)) <= 1e-6;
  }
  if (typeof a === "string" && typeof b === "string") {
    return cleanString2(a) === cleanString2(b);
  }
  return JSON.stringify(comparable2(a)) === JSON.stringify(comparable2(b));
}
function matchesPayload2(row, data) {
  return !!row && Object.entries(data || {}).every(([field, value]) => sameValue4(row[field], value));
}
async function createBuilderPartWithRecovery({
  entity,
  data,
  label = "Builder Part"
} = {}) {
  const builderProductId = String(data?.builder_product_id || "").trim();
  const partKey = String(data?.part_key || "").trim();
  if (!builderProductId || !partKey || typeof entity?.filter !== "function" || typeof entity?.create !== "function") {
    throw new Error(`${label} could not initialize its retry-safe create.`);
  }
  const loadMatches = async () => {
    const rows = await entity.filter({ builder_product_id: builderProductId, part_key: partKey });
    if (!Array.isArray(rows)) throw new Error(`${label} identity lookup did not return a record list.`);
    return rows.filter(
      (row) => String(row?.builder_product_id || "") === builderProductId && String(row?.part_key || "") === partKey
    );
  };
  const before = await loadMatches();
  if (before.length > 1) {
    throw new Error(`${label} has multiple stored rows with the same Product/Part key. No row was changed; reload and review the duplicate Parts.`);
  }
  if (before.length === 1) {
    if (!matchesPayload2(before[0], data)) {
      throw new Error(`${label} appeared concurrently with different data. The existing Part was not overwritten.`);
    }
    return { record: before[0], status: "existing" };
  }
  let created = null;
  let createError = null;
  try {
    created = await entity.create(data);
  } catch (error) {
    createError = error;
  }
  let after;
  try {
    after = await loadMatches();
  } catch (verifyError) {
    if (created?.id && matchesPayload2(created, data)) return { record: created, status: "created_unverified_lookup" };
    throw new Error(`${label} create outcome could not be verified. Reload before retrying. ${verifyError?.message || "Recovery lookup failed."}`);
  }
  if (after.length > 1) {
    throw new Error(`${label} was created concurrently more than once for the same Product/Part key. No uncertain Part was deleted; reload and review the duplicate Parts.`);
  }
  if (after.length === 1) {
    if (!matchesPayload2(after[0], data)) {
      throw new Error(`${label} identity exists but its live data does not match this create. No Part was overwritten or deleted.`);
    }
    return {
      record: after[0],
      status: created?.id === after[0].id ? "created" : "recovered"
    };
  }
  if (created?.id && matchesPayload2(created, data)) return { record: created, status: "created" };
  if (createError) throw new Error(`${label} could not be created and no matching Part was visible on recovery read. Reload before retrying. ${createError?.message || ""}`.trim());
  throw new Error(`${label} create response could not be verified. Reload before retrying.`);
}

// candidate-tree-src/components/masterInventory/inventoryNormalization.js
var STRICT_SIGNED_DECIMAL = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/;
var STRICT_UNSIGNED_EXPONENT = /^[+]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;
var strictNumber = (value, { unsignedExponent = false } = {}) => {
  if (typeof value !== "number" && (typeof value !== "string" || !(unsignedExponent ? STRICT_UNSIGNED_EXPONENT : STRICT_SIGNED_DECIMAL).test(value.trim()))) {
    return null;
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};
var inventoryNonnegativeNumber = (value) => {
  const number = strictNumber(value);
  return number !== null && number >= 0 ? number : null;
};
var inventoryPositiveNumber = (value) => {
  const number = strictNumber(value, { unsignedExponent: true });
  return number !== null && number > 0 ? number : null;
};

// candidate-tree-src/components/estimator/foundation/landscapeMaterials.js
var LANDSCAPE_MATERIALS = [
  { key: "dirt", label: "Dirt (Eraser)", color: "#a1866f", cost_per_sqft: 0 },
  { key: "grass", label: "Grass", color: "#4ade80", cost_per_sqft: 0.75 },
  { key: "concrete", label: "Concrete", color: "#cbd5e1", cost_per_sqft: 8 },
  { key: "asphalt", label: "Asphalt", color: "#475569", cost_per_sqft: 5 },
  { key: "gravel", label: "Gravel", color: "#94a3b8", cost_per_sqft: 2.25 },
  { key: "sand", label: "Sand", color: "#fcd34d", cost_per_sqft: 1.75 },
  { key: "mulch", label: "Mulch", color: "#92400e", cost_per_sqft: 1.25 },
  { key: "wood_decking", label: "Wood Decking", color: "#d97706", cost_per_sqft: 14 },
  { key: "water", label: "Water", color: "#38bdf8", cost_per_sqft: 6 }
];
var materialByKey = (key) => LANDSCAPE_MATERIALS.find((m) => m.key === key);
var isRecord = (v) => !!v && typeof v === "object" && !Array.isArray(v);
function landscapeInputIssues(landscape) {
  const issues = [];
  if (landscape === void 0 || landscape === null) return issues;
  const add = (field, code, message) => issues.push({
    kind: "landscape",
    index: null,
    componentId: null,
    field,
    code,
    message: `Landscape: ${message}`
  });
  const rawCells = landscape.cells;
  const cells = isRecord(rawCells) ? rawCells : null;
  if (rawCells !== void 0 && rawCells !== null && cells === null) {
    add(
      "cells",
      "landscape_cells_unavailable",
      "the recorded site grid is malformed \u2014 repair or clear it before repricing"
    );
    return issues;
  }
  const painted = Object.entries(cells || {}).filter(([, key]) => key && key !== "dirt");
  if (!painted.length) return issues;
  if (inventoryPositiveNumber(landscape.cell_size_inches) === null) {
    add(
      "cell_size_inches",
      "landscape_cell_size_unavailable",
      "record a finite, positive cell size in inches before repricing site materials"
    );
  }
  const reported = /* @__PURE__ */ new Set();
  for (const [, key] of painted) {
    if (reported.has(key)) continue;
    reported.add(key);
    const mat = materialByKey(key);
    if (!mat) {
      add(
        "cells",
        "landscape_material_unavailable",
        `site material ${JSON.stringify(key)} is not in the landscape catalog \u2014 pick a catalog material or erase it before repricing`
      );
    } else if (inventoryNonnegativeNumber(mat.cost_per_sqft) === null) {
      add(
        "cost_per_sqft",
        "landscape_material_price_unavailable",
        `record a finite, nonnegative cost per sq ft for "${mat.label}" before repricing`
      );
    }
  }
  return issues;
}
var landscapeSummary = (landscape) => {
  const cells = isRecord(landscape?.cells) ? landscape.cells : {};
  const cellSize = inventoryPositiveNumber(landscape?.cell_size_inches);
  const sqftPerCell = cellSize === null ? null : Math.pow(cellSize / 12, 2);
  const counts = {};
  const rows = {};
  Object.values(cells).forEach((key) => {
    if (!key || key === "dirt") return;
    counts[key] = (counts[key] || 0) + 1;
    if (sqftPerCell !== null) rows[key] = (rows[key] || 0) + sqftPerCell;
  });
  const lines = Object.entries(counts).map(([key, count]) => {
    const mat = materialByKey(key);
    const sqft = sqftPerCell === null ? null : rows[key];
    const rate = mat ? inventoryNonnegativeNumber(mat.cost_per_sqft) : null;
    return {
      key,
      label: mat?.label || key,
      color: mat?.color || "#999",
      cells: count,
      sqft,
      cost: sqft === null || rate === null ? null : sqft * rate
    };
  });
  const total = lines.every((l) => l.cost !== null) ? lines.reduce((s, l) => s + l.cost, 0) : null;
  return { lines, total, issues: landscapeInputIssues(landscape) };
};

// candidate-tree-src/components/estimator/foundation/foundationInputValidation.js
function signageCabinetInputIssues(cabinet, index = 0) {
  const issues = [];
  const record = cabinet ?? {};
  const add = (field, code, message) => issues.push({
    kind: "signage_cabinet",
    index,
    componentId: record.component_id ?? record.id ?? null,
    field,
    code,
    message: `Signage cabinet ${index + 1}: ${message}`
  });
  const qty = record.quantity;
  if (qty !== void 0 && qty !== null && qty !== "" && inventoryPositiveNumber(qty) === null) {
    add(
      "quantity",
      "signage_cabinet_quantity_unavailable",
      "record a finite, positive quantity \u2014 a zero or malformed quantity cannot be repriced"
    );
  }
  if (inventoryNonnegativeNumber(record.unit_cost) === null) {
    add(
      "unit_cost",
      "signage_cabinet_price_unavailable",
      "record a finite, nonnegative unit cost \u2014 a missing price is not a free cabinet"
    );
  }
  return issues;
}

// candidate-tree-src/components/estimator/foundation/foundationReinforcementBasis.js
var FOOT_UNITS = Object.freeze(["ft", "foot", "feet", "lf", "linear ft", "linear foot", "linear feet"]);

// candidate-tree-src/components/estimator/foundation/foundationReinforcementCost.js
var STEEL_ROLES = Object.freeze(["horizontal", "longitudinal", "hoop", "inter_mat_tie"]);

// candidate-tree-src/components/estimator/foundation/foundationCalc.js
function calcSignageCabinetPricing(cabinets = []) {
  return (Array.isArray(cabinets) ? cabinets : []).map((cabinet, index) => {
    const issues = signageCabinetInputIssues(cabinet, index);
    const entry = { ...cabinet ?? {} };
    if (issues.length) return { available: false, issues, cost: null, pricedEntry: entry };
    const quantity = entry.quantity === void 0 || entry.quantity === null || entry.quantity === "" ? 1 : Number(entry.quantity);
    const cost = Number(entry.unit_cost) * quantity;
    return { available: true, issues, cost, pricedEntry: entry };
  });
}

// candidate-tree-src/components/estimator/builder/partSync.js
var num2 = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
var nowIso = () => (/* @__PURE__ */ new Date()).toISOString();
var norm = (value) => String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
var DIRECT_LIVE_REPRICE_MODULES = /* @__PURE__ */ new Set(["brick_stone", "maintenance"]);
var PENDING_REMOVAL_KEY = "__builder_pending_removal";
var CATALOG_NAME_FIELDS = {
  FoundationInventory: ["material_name"],
  LaborServiceInventory: ["service_name", "vendor_name"],
  ChannelLetterInstallInventory: ["item_name"],
  ChannelLetterInstallEquipment: ["equipment_name"],
  DimensionalLetterMaterial: ["material_name"],
  VinylInventory: ["vinyl_name"],
  VinylMachine: ["machine_name"],
  Inventory: ["material_type", "product_type", "size"],
  BrickStoneInventory: ["material_name"],
  MaintenanceInventory: ["item_name"],
  MaintenanceEquipment: ["equipment_name"]
};
function rowName(entity, row) {
  if (!row) return "";
  const fields = CATALOG_NAME_FIELDS[entity] || ["name"];
  if (entity === "Inventory") {
    return fields.map((field) => row[field]).filter(Boolean).join(" ");
  }
  return fields.map((field) => row[field]).find(Boolean) || "";
}
function stableObject(value) {
  if (Array.isArray(value)) return value.map(stableObject);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value).sort().filter((key) => !["created_by", "created_by_id"].includes(key)).map((key) => [key, stableObject(value[key])])
  );
}
function same(a, b) {
  return JSON.stringify(stableObject(a ?? null)) === JSON.stringify(stableObject(b ?? null));
}
function patchDiffers(record, patch) {
  return Object.entries(patch || {}).some(([key, value]) => !same(record?.[key], value));
}
function pricingSnapshot(row) {
  if (!row || typeof row !== "object") return {};
  const out = {};
  Object.entries(row).forEach(([key, value]) => {
    if (["id", "created_date", "updated_date", "created_by", "created_by_id", "price_history"].includes(key)) return;
    if (/(cost|price|rate|fee|charge|markup|surcharge)/i.test(key) || [
      "pricing_mode",
      "pole_pricing_mode",
      "unit",
      "unit_type",
      "quantity_tiers",
      "minimum_order_yards",
      "minimum_order_quantity",
      "waste_factor_percent",
      "yield_factor"
    ].includes(key)) {
      out[key] = stableObject(value);
    }
  });
  return out;
}
function genericUnitCost(row) {
  if (!row) return 0;
  const preferred = [
    "cost_per_unit",
    "default_rate",
    "cost_per_letter",
    "cost_per_cabinet",
    "cost_per_foot",
    "cost_per_sqft",
    "cost_per_linear_foot",
    "cost_per_roll",
    "cost_per_sheet",
    "cost_per_hour",
    "cost_per_day",
    "cost_flat",
    "pole_stock_price",
    "cap_stock_price"
  ];
  for (const key of preferred) {
    if (Number.isFinite(Number(row[key])) && Number(row[key]) !== 0) return Number(row[key]);
  }
  return 0;
}
function independentPartUnitCost(part, row) {
  if (!row) return num2(part?.current_unit_cost, num2(part?.frozen_unit_cost));
  const entity = part?.inventory_entity || "";
  const mode = part?.pricing_basis_snapshot?.pricing_mode || row.pricing_mode || row.pole_pricing_mode || row.unit_type || "";
  if (entity === "DimensionalLetterMaterial") return num2(row.cost_per_sheet);
  if (entity === "VinylInventory") {
    if (mode === "per_sqft") return num2(row.cost_per_sqft);
    if (mode === "per_linear_foot") return num2(row.cost_per_linear_foot);
    return num2(row.cost_per_roll);
  }
  if (entity === "LaborServiceInventory") return num2(row.default_rate);
  if (entity === "ChannelLetterInstallInventory") {
    if (mode === "per_raceway_foot") return num2(row.cost_per_foot);
    if (mode === "per_project_flat") return num2(row.cost_flat);
    if (mode === "per_letter_by_size") {
      const size = part?.pricing_basis_snapshot?.letter_size || "medium";
      return num2(row[`cost_${size}`], num2(row.cost_medium || row.cost_per_letter));
    }
    return num2(row.cost_per_letter);
  }
  if (entity === "ChannelLetterInstallEquipment") {
    if (mode === "delivery_pickup") return num2(row.delivery_pickup_cost);
    if (mode === "idle_running") return num2(row.idle_running_cost_per_hour);
    if (mode === "per_hour") return num2(row.cost_per_hour);
    if (mode === "per_week") return num2(row.cost_per_week);
    if (mode === "per_month") return num2(row.cost_per_month);
    if (["owned_flat", "per_project_flat"].includes(mode)) return num2(row.cost_flat);
    return num2(row.cost_per_day);
  }
  if (entity === "MaintenanceInventory") {
    const size = part?.pricing_basis_snapshot?.size || "medium";
    if (mode === "per_letter_flat") return num2(row.cost_per_letter);
    if (mode === "per_letter_by_size" || mode === "per_cabinet_by_size") return num2(row[`cost_${size}`]);
    if (mode === "per_cabinet_flat") return num2(row.cost_per_cabinet);
    if (mode === "per_linear_foot") return num2(row.cost_per_foot);
    if (mode === "per_sqft") return num2(row.cost_per_sqft);
    return num2(row.cost_flat);
  }
  if (entity === "MaintenanceEquipment") {
    if (mode === "delivery_pickup") return num2(row.delivery_pickup_cost);
    if (mode === "idle_running") return num2(row.idle_running_cost_per_hour);
    if (mode === "per_hour") return num2(row.cost_per_hour);
    if (mode === "per_week") return num2(row.cost_per_week);
    if (mode === "per_month") return num2(row.cost_per_month);
    if (["owned_flat", "per_project_flat"].includes(mode)) return num2(row.cost_flat);
    return num2(row.cost_per_day);
  }
  if (entity === "FoundationInventory") {
    if (row.material_type === "pole" && mode === "stock_price") return num2(row.pole_stock_price);
    if (row.material_type === "wall_cap") return num2(row.cap_stock_price || row.cost_per_unit);
    if (["excavation_equipment", "attachment", "sub_attachment"].includes(row.material_type)) {
      if (mode === "pickup_delivery") return num2(row.pickup_delivery_cost);
      if (mode === "per_week") return num2(row.cost_per_week);
      if (mode === "per_month") return num2(row.cost_per_month);
      if (mode === "per_hour") return num2(row.cost_per_hour);
      return num2(row.cost_per_day || row.cost_per_unit);
    }
    return num2(row.cost_per_unit);
  }
  return num2(row.cost_per_unit ?? row.default_rate ?? row.cost_flat ?? row.cost_per_sheet, genericUnitCost(row));
}
async function loadCatalog(entity, sort = null, { strict = false } = {}) {
  try {
    return await loadAllEntityRows({
      entity: staffEntities[entity],
      sort: sort || "created_date",
      label: `${entity} catalog`
    });
  } catch (error) {
    if (strict) throw new Error(`${entity} catalog could not be verified: ${error?.message || "read failed"}`);
    return [];
  }
}
async function loadBuilderCatalogs(moduleKey, { strict = false } = {}) {
  const specs = {
    foundation: [
      ["FoundationInventory", "material_name"],
      ["LaborServiceInventory", "service_name"]
    ],
    channel_letters: [
      ["ChannelLetterInstallInventory", "sort_order"],
      ["ChannelLetterInstallEquipment", "sort_order"],
      ["DimensionalLetterMaterial", "sort_order"]
    ],
    vinyl: [
      ["VinylInventory", "vinyl_name"],
      ["VinylMachine", "sort_order"],
      ["LaborServiceInventory", "service_name"],
      ["ChannelLetterInstallEquipment", "sort_order"]
    ],
    metal: [["Inventory", "material_type"]],
    brick_stone: [
      ["FoundationInventory", "material_name"],
      ["BrickStoneInventory", "material_name"]
    ],
    maintenance: [
      ["MaintenanceInventory", "sort_order"],
      ["SignLightingInventory", "sort_order"],
      ["SignHardwareInventory", "sort_order"],
      ["SignPartsSuppliesInventory", "sort_order"],
      ["DimensionalLetterMaterial", "sort_order"],
      ["VinylInventory", "sort_order"],
      ["ChannelLetterInstallInventory", "sort_order"],
      ["FoundationInventory", "material_name"],
      ["ChannelLetterInstallEquipment", "sort_order"],
      // Legacy compatibility only. New Maintenance selections use the shared
      // Master Inventory equipment catalog above.
      ["MaintenanceEquipment", "sort_order"],
      ["MaintenanceActionRate", null],
      ["Settings", null]
    ]
  };
  const requested = specs[moduleKey] || [];
  const loaded = await Promise.all(
    requested.map(async ([entity, sort]) => [entity, await loadCatalog(entity, sort, { strict })])
  );
  const catalogs = {};
  loaded.forEach(([entity, rows]) => {
    const filtered = entity === "LaborServiceInventory" && moduleKey === "foundation" ? rows.filter((row) => row.service_category === "concrete_service") : rows;
    catalogs[entity] = {
      rows: filtered,
      byId: new Map(filtered.map((row) => [row.id, row]))
    };
  });
  return catalogs;
}
async function loadVerifiedBuilderPartSyncInputs({ builderProduct = null, moduleKey = "" } = {}) {
  const [catalogs, existingParts] = await Promise.all([
    loadBuilderCatalogs(moduleKey || builderProduct?.module_key || "", { strict: true }),
    builderProduct?.id ? loadAllEntityRows({ entity: staffEntities.BuilderPart, query: { builder_product_id: builderProduct.id }, sort: "sort_order", label: "Builder Parts" }) : Promise.resolve([])
  ]);
  const inventoryRowsOverride = /* @__PURE__ */ new Map();
  for (const part of existingParts || []) {
    if (part.builder_sync_state !== "manual_addon" || !part.inventory_entity || !part.inventory_item_id || part.manual_cost_override) continue;
    let row;
    try {
      row = await staffEntities[part.inventory_entity].get(part.inventory_item_id);
    } catch (error) {
      throw new Error(`${part.inventory_entity} inventory could not be verified for Part \u201C${part.part_name || "Part"}\u201D: ${error?.message || "read failed"}`);
    }
    inventoryRowsOverride.set(`${part.inventory_entity}:${part.inventory_item_id}`, row || null);
  }
  return { catalogs, existingParts: existingParts || [], inventoryRowsOverride };
}
function findRow(catalogs, entity, id) {
  if (!id) return null;
  if (entity && catalogs[entity]?.byId.has(id)) return catalogs[entity].byId.get(id);
  for (const catalog of Object.values(catalogs)) {
    if (catalog.byId.has(id)) return catalog.byId.get(id);
  }
  return null;
}
function findEntity(catalogs, id, preferred = "") {
  if (!id) return preferred;
  if (preferred && catalogs[preferred]?.byId.has(id)) return preferred;
  return Object.entries(catalogs).find(([, catalog]) => catalog.byId.has(id))?.[0] || preferred;
}
function findNameCandidate(catalogs, entity, name) {
  const target = norm(name);
  if (!target || !catalogs[entity]) return null;
  return catalogs[entity].rows.find((row) => norm(rowName(entity, row)) === target) || null;
}
function makePart({
  key,
  name,
  type = "material",
  subtype = "",
  sourcePath = "",
  entity = "",
  inventoryId = "",
  quantity = 1,
  unit = "",
  unitCost = 0,
  extendedCost = 0,
  builderData = {},
  calculation = {},
  pricingBasis = {}
}) {
  return {
    part_key: key,
    part_name: name || type || "Part",
    part_type: type,
    part_subtype: subtype,
    source_path: sourcePath,
    inventory_entity: entity,
    inventory_item_id: inventoryId || "",
    quantity: num2(quantity, 1),
    unit,
    unit_cost: num2(unitCost),
    extended_cost: num2(extendedCost),
    builder_data: builderData || {},
    calculation_snapshot: calculation || {},
    pricing_basis_snapshot: pricingBasis || {}
  };
}
function extractChannel(project) {
  const parts = [];
  const hasNumber = (value) => value !== null && value !== void 0 && Number.isFinite(Number(value));
  const itemLabel = (item, fallback) => item?.description?.trim() || fallback;
  (project.items || []).forEach((item, itemIndex) => {
    (item.materials || []).forEach((mat, matIndex) => {
      const id = mat.inventory_item_id || mat.inventory_id || "";
      parts.push(makePart({
        key: `channel:item:${itemIndex}:material:${matIndex}`,
        name: mat.item_name || "Install material",
        type: "material",
        subtype: mat.pricing_mode || "install_material",
        sourcePath: mat.inventory_item_id ? `items[${itemIndex}].materials[${matIndex}].inventory_item_id` : `items[${itemIndex}].materials[${matIndex}].inventory_id`,
        entity: "ChannelLetterInstallInventory",
        inventoryId: id,
        quantity: mat.quantity,
        unit: mat.pricing_mode || "",
        unitCost: mat.unit_cost,
        extendedCost: mat.total_cost,
        builderData: { parent_item: item.description, installation_type: item.installation_type, letter_size: item.letter_size, qty_letters: item.qty_letters },
        calculation: mat,
        pricingBasis: { pricing_mode: mat.pricing_mode, letter_size: item.letter_size, installation_type: item.installation_type }
      }));
    });
  });
  const personnelRowsTotal = (project.personnel || []).reduce(
    (sum, person) => sum + num2(person.total_cost, num2(person.hourly_rate) * num2(person.hours)),
    0
  );
  const personnelTotal = hasNumber(project.total_personnel_cost) ? num2(project.total_personnel_cost) : personnelRowsTotal;
  const installLaborInSubtotal = hasNumber(project.labor_cost_in_subtotal) ? num2(project.labor_cost_in_subtotal) : personnelTotal > 5e-3 ? 0 : num2(project.labor_cost, (project.items || []).reduce((sum, item) => sum + num2(item.labor_cost), 0));
  if (Math.abs(installLaborInSubtotal) > 5e-3) {
    let representedLabor = 0;
    (project.items || []).forEach((item, index) => {
      const cost = num2(item.labor_cost);
      if (Math.abs(cost) <= 5e-3) return;
      representedLabor += cost;
      parts.push(manualCostPart({
        key: `channel:item:${index}:labor`,
        name: `${itemLabel(item, `Install Item ${index + 1}`)} \u2014 Installation Labor`,
        type: "labor",
        subtype: "installation_labor",
        sourcePath: `items[${index}].labor_cost`,
        cost,
        quantity: item.labor_hours || 1,
        unit: item.labor_hours ? "hour" : "job",
        builderData: item,
        calculation: { labor_hours: item.labor_hours, labor_cost: item.labor_cost, installation_type: item.installation_type }
      }));
    });
    const laborResidual = installLaborInSubtotal - representedLabor;
    if (Math.abs(laborResidual) > 5e-3) {
      parts.push(manualCostPart({
        key: "channel:install-labor:reconciliation",
        name: "Installation Labor \u2014 Saved Cost Adjustment",
        type: "labor",
        subtype: "installation_labor_adjustment",
        sourcePath: "labor_cost_in_subtotal",
        cost: laborResidual,
        calculation: { authoritative_total: installLaborInSubtotal, represented_total: representedLabor }
      }));
    }
  }
  (project.selected_equipment || []).forEach((eq, index) => {
    const duration = Math.max(num2(eq.duration, 1), 0);
    const baseCost = num2(eq.unit_cost) * duration;
    const owned = eq.ownership === "owned" || eq.pricing_mode === "owned_flat";
    const deliveryCost = !owned && eq.include_delivery ? num2(eq.delivery_pickup_cost) : 0;
    const idleCost = hasNumber(eq.idle_cost) ? num2(eq.idle_cost) : num2(eq.idle_hours) * num2(eq.idle_running_cost_per_hour);
    const total = num2(eq.total_cost, baseCost + deliveryCost + idleCost);
    let represented = 0;
    if (Math.abs(baseCost) > 5e-3 || eq.equipment_id) {
      parts.push(makePart({
        key: `channel:equipment:${index}:base`,
        name: eq.equipment_name || "Install equipment",
        type: "equipment",
        subtype: eq.equipment_type || eq.pricing_mode || "equipment",
        sourcePath: `selected_equipment[${index}].equipment_id`,
        entity: "ChannelLetterInstallEquipment",
        inventoryId: eq.equipment_id,
        quantity: duration || 1,
        unit: eq.pricing_mode || "unit",
        unitCost: eq.unit_cost,
        extendedCost: baseCost,
        builderData: eq,
        calculation: { duration, unit_cost: eq.unit_cost, base_cost: baseCost },
        pricingBasis: { pricing_mode: eq.pricing_mode }
      }));
      represented += baseCost;
    }
    if (Math.abs(deliveryCost) > 5e-3) {
      parts.push(makePart({
        key: `channel:equipment:${index}:delivery`,
        name: `${eq.equipment_name || "Install Equipment"} \u2014 Delivery / Pickup`,
        type: "service",
        subtype: "equipment_delivery",
        sourcePath: `selected_equipment[${index}].include_delivery`,
        entity: "ChannelLetterInstallEquipment",
        inventoryId: eq.equipment_id,
        quantity: 1,
        unit: "delivery",
        unitCost: deliveryCost,
        extendedCost: deliveryCost,
        builderData: eq,
        calculation: { include_delivery: eq.include_delivery, delivery_pickup_cost: deliveryCost },
        pricingBasis: { pricing_mode: "delivery_pickup" }
      }));
      represented += deliveryCost;
    }
    if (Math.abs(idleCost) > 5e-3) {
      parts.push(makePart({
        key: `channel:equipment:${index}:idle`,
        name: `${eq.equipment_name || "Install Equipment"} \u2014 Idle Running`,
        type: "equipment",
        subtype: "idle_running",
        sourcePath: `selected_equipment[${index}].idle_hours`,
        entity: "ChannelLetterInstallEquipment",
        inventoryId: eq.equipment_id,
        quantity: eq.idle_hours || 1,
        unit: "hour",
        unitCost: eq.idle_running_cost_per_hour,
        extendedCost: idleCost,
        builderData: eq,
        calculation: { idle_hours: eq.idle_hours, idle_running_cost_per_hour: eq.idle_running_cost_per_hour, idle_cost: idleCost },
        pricingBasis: { pricing_mode: "idle_running" }
      }));
      represented += idleCost;
    }
    const residual = total - represented;
    if (Math.abs(residual) > 5e-3) {
      parts.push(manualCostPart({
        key: `channel:equipment:${index}:saved-adjustment`,
        name: `${eq.equipment_name || "Install Equipment"} \u2014 Saved Cost Adjustment`,
        type: "equipment",
        subtype: "equipment_adjustment",
        sourcePath: `selected_equipment[${index}].total_cost`,
        cost: residual,
        builderData: eq,
        calculation: { authoritative_total: total, represented_total: represented }
      }));
    }
  });
  if (personnelTotal > 5e-3 || (project.personnel || []).some((person) => num2(person.total_cost) > 5e-3)) {
    let representedPersonnel = 0;
    (project.personnel || []).forEach((person, index) => {
      const cost = num2(person.total_cost, num2(person.hourly_rate) * num2(person.hours));
      if (Math.abs(cost) <= 5e-3) return;
      representedPersonnel += cost;
      parts.push(manualCostPart({
        key: `channel:personnel:${index}`,
        name: person.name?.trim() || person.role || `Installer ${index + 1}`,
        type: "labor",
        subtype: person.role || "personnel",
        sourcePath: `personnel[${index}]`,
        cost,
        quantity: person.hours || 1,
        unit: person.hours ? "hour" : "job",
        builderData: person,
        calculation: person
      }));
    });
    const residual = personnelTotal - representedPersonnel;
    if (Math.abs(residual) > 5e-3) {
      parts.push(manualCostPart({
        key: "channel:personnel:reconciliation",
        name: "Crew Labor \u2014 Saved Cost Adjustment",
        type: "labor",
        subtype: "personnel_adjustment",
        sourcePath: "total_personnel_cost",
        cost: residual,
        calculation: { authoritative_total: personnelTotal, represented_total: representedPersonnel }
      }));
    }
  }
  const pushFabBreakdown = ({ purchase, index, fab, total, prefix, label, materialSourcePath }) => {
    if (!fab) return 0;
    const qty = Math.max(num2(purchase.qty, 1), 0);
    const materialCost = num2(fab.unit_material_cost) * qty;
    const cutCost = num2(fab.unit_cut_cost) * qty;
    const paintCost = num2(fab.unit_paint_cost) * qty;
    let represented = 0;
    if (Math.abs(materialCost) > 5e-3 || fab.material_id) {
      const materialRate = num2(fab.material_cost_per_sqin);
      const materialSqinPerUnit = materialRate > 0 ? num2(fab.unit_material_cost) / materialRate : num2(purchase.size_value) * 144;
      const materialQty = materialSqinPerUnit > 0 ? materialSqinPerUnit * qty : qty || 1;
      parts.push(makePart({
        key: `${prefix}:material`,
        name: `${label} \u2014 ${fab.material_name || "Material"}`,
        type: "material",
        subtype: "dimensional_material",
        sourcePath: materialSourcePath,
        entity: "DimensionalLetterMaterial",
        inventoryId: fab.material_id || "",
        quantity: materialQty,
        unit: materialSqinPerUnit > 0 ? "sqin" : "unit",
        unitCost: materialSqinPerUnit > 0 ? materialRate : num2(fab.unit_material_cost),
        extendedCost: materialCost,
        builderData: purchase,
        calculation: fab,
        pricingBasis: {
          pricing_mode: "sheet_yield",
          material_cost_per_sqin: fab.material_cost_per_sqin,
          sheet_yield_factor: fab.sheet_yield_factor,
          material_thickness_inches: fab.material_thickness_inches
        }
      }));
      represented += materialCost;
    }
    if (Math.abs(cutCost) > 5e-3) {
      parts.push(manualCostPart({
        key: `${prefix}:cutting`,
        name: `${label} \u2014 ${fab.cutting_method === "laser" ? "Laser" : "CNC"} Cutting`,
        type: "fabrication",
        subtype: fab.cutting_method === "laser" ? "laser_cutting" : "cnc_cutting",
        sourcePath: `${prefix.includes("backer") ? `letter_purchases[${index}].backer_fab_config` : `letter_purchases[${index}].fab_config`}.unit_cut_cost`,
        cost: cutCost,
        quantity: qty || 1,
        unit: "unit",
        builderData: purchase,
        calculation: fab
      }));
      represented += cutCost;
    }
    if (Math.abs(paintCost) > 5e-3) {
      parts.push(manualCostPart({
        key: `${prefix}:paint`,
        name: `${label} \u2014 Paint`,
        type: "finishing",
        subtype: "paint",
        sourcePath: `${prefix.includes("backer") ? `letter_purchases[${index}].backer_fab_config` : `letter_purchases[${index}].fab_config`}.unit_paint_cost`,
        cost: paintCost,
        quantity: qty || 1,
        unit: "unit",
        builderData: purchase,
        calculation: fab
      }));
      represented += paintCost;
    }
    const residual = num2(total) - represented;
    if (Math.abs(residual) > 5e-3) {
      parts.push(manualCostPart({
        key: `${prefix}:adjustment`,
        name: `${label} \u2014 Price Override / Saved Adjustment`,
        type: "pricing",
        subtype: "fab_price_adjustment",
        sourcePath: prefix.includes("backer") ? `letter_purchases[${index}].backer_total` : `letter_purchases[${index}].letters_total`,
        cost: residual,
        builderData: purchase,
        calculation: { authoritative_total: total, represented_total: represented, unit_cost_override: purchase.unit_cost_override }
      }));
      represented += residual;
    }
    return represented;
  };
  (project.letter_purchases || []).forEach((purchase, index) => {
    const qty = Math.max(num2(purchase.qty, 1), 0);
    const purchaseTotal = hasNumber(purchase.total_cost) ? num2(purchase.total_cost) : num2(purchase.line_total);
    const racewayTotal = num2(purchase.raceway_total);
    const backerTotal = num2(purchase.backer_total);
    const lettersTotal = hasNumber(purchase.letters_total) ? num2(purchase.letters_total) : purchaseTotal - racewayTotal - backerTotal;
    const prefix = `channel:letters:${purchase.id || index}`;
    const label = purchase.description?.trim() || purchase.letter_type || `Letter Purchase ${index + 1}`;
    let representedPurchase = 0;
    if (purchase.letter_type === "dimensional_letters" && purchase.fab_config) {
      representedPurchase += pushFabBreakdown({
        purchase,
        index,
        fab: purchase.fab_config,
        total: lettersTotal,
        prefix: `${prefix}:fab`,
        label,
        materialSourcePath: `letter_purchases[${index}].fab_config.material_id`
      });
    } else if (Math.abs(lettersTotal) > 5e-3) {
      const size = Math.max(num2(purchase.size_value), 0);
      const effectiveQty = size > 0 ? size * Math.max(qty, 1) : Math.max(qty, 1);
      const unit = purchase.letter_type === "raceway" ? "ft" : purchase.letter_type === "capsule_logo_pillbox" ? "sqft" : purchase.letter_type?.startsWith("channel_") ? "letter-inch" : "unit";
      parts.push(manualCostPart({
        key: `${prefix}:letters`,
        name: label,
        type: "material",
        subtype: purchase.letter_type || "letter_purchase",
        sourcePath: `letter_purchases[${index}].letters_total`,
        cost: lettersTotal,
        quantity: effectiveQty,
        unit,
        builderData: purchase,
        calculation: { unit_cost: purchase.unit_cost, size_value: purchase.size_value, qty: purchase.qty, letters_total: lettersTotal }
      }));
      representedPurchase += lettersTotal;
    }
    if (Math.abs(racewayTotal) > 5e-3) {
      const racewayQty = Math.max(num2(purchase.raceway_qty, 1), 1);
      const racewayLength = Math.max(num2(purchase.raceway_length_feet), 0);
      const effectiveQty = racewayLength > 0 ? racewayLength * racewayQty : racewayQty;
      parts.push(manualCostPart({
        key: `${prefix}:raceway`,
        name: `${label} \u2014 Raceway`,
        type: "material",
        subtype: "raceway_purchase",
        sourcePath: `letter_purchases[${index}].raceway_total`,
        cost: racewayTotal,
        quantity: effectiveQty,
        unit: racewayLength > 0 ? "ft" : "unit",
        builderData: purchase,
        calculation: { raceway_length_feet: purchase.raceway_length_feet, raceway_qty: purchase.raceway_qty, raceway_unit_cost: purchase.raceway_unit_cost, raceway_total: racewayTotal }
      }));
      representedPurchase += racewayTotal;
    }
    if (Math.abs(backerTotal) > 5e-3) {
      if (purchase.backer_fab_config) {
        representedPurchase += pushFabBreakdown({
          purchase,
          index,
          fab: purchase.backer_fab_config,
          total: backerTotal,
          prefix: `${prefix}:backer`,
          label: `${label} \u2014 Backer`,
          materialSourcePath: `letter_purchases[${index}].backer_fab_config.material_id`
        });
      } else {
        parts.push(manualCostPart({
          key: `${prefix}:backer`,
          name: `${label} \u2014 Backer`,
          type: "fabrication",
          subtype: "backer",
          sourcePath: `letter_purchases[${index}].backer_total`,
          cost: backerTotal,
          quantity: qty || 1,
          unit: "unit",
          builderData: purchase,
          calculation: { backer_total: backerTotal }
        }));
        representedPurchase += backerTotal;
      }
    }
    const purchaseResidual = purchaseTotal - representedPurchase;
    if (Math.abs(purchaseResidual) > 5e-3) {
      parts.push(manualCostPart({
        key: `${prefix}:reconciliation`,
        name: `${label} \u2014 Saved Cost Adjustment`,
        type: "pricing",
        subtype: "letter_purchase_adjustment",
        sourcePath: `letter_purchases[${index}].total_cost`,
        cost: purchaseResidual,
        builderData: purchase,
        calculation: { authoritative_total: purchaseTotal, represented_total: representedPurchase }
      }));
    }
  });
  const purchases = project.letter_purchases || [];
  const onlyDimensional = purchases.length > 0 && purchases.every((purchase) => purchase.letter_type === "dimensional_letters");
  const letterFees = [
    ["delivery", "Letter Delivery / Freight", onlyDimensional ? 0 : project.letters_delivery_fee],
    ["design", "Letter Design", project.letters_design_fee],
    ["install-supplies", "Letter Install Supplies", project.letters_install_supplies_fee],
    ["permitting", "Letter Permitting", project.letters_permitting_fee],
    ["other", "Other Letter Cost", project.letters_other_fee]
  ];
  letterFees.forEach(([key, name, cost]) => {
    if (Math.abs(num2(cost)) <= 5e-3) return;
    parts.push(manualCostPart({
      key: `channel:letter-fee:${key}`,
      name,
      type: key === "permitting" ? "permit" : "service",
      subtype: `letter_${key}`,
      sourcePath: `letters_${key.replaceAll("-", "_")}_fee`,
      cost
    }));
  });
  const letterMarkup = num2(project.total_letters_cost) - num2(project.letters_subtotal);
  if (Math.abs(letterMarkup) > 5e-3) {
    parts.push(manualCostPart({
      key: "channel:letters-markup",
      name: "Letter Purchase Markup",
      type: "pricing",
      subtype: "markup",
      sourcePath: "letters_markup_percent",
      cost: letterMarkup,
      calculation: { markup_percent: project.letters_markup_percent, markup_amount: letterMarkup }
    }));
  }
  if (Math.abs(num2(project.total_supplies_cost)) > 5e-3) {
    parts.push(manualCostPart({
      key: "channel:install-supplies",
      name: "Installation Consumables / Supplies",
      type: "consumable",
      subtype: "installation_supplies",
      sourcePath: "total_supplies_cost",
      cost: project.total_supplies_cost,
      calculation: { supplies_percent: project.supplies_percent_of_materials, extra_supplies_cost: project.extra_supplies_cost }
    }));
  }
  if (Math.abs(num2(project.total_travel_cost)) > 5e-3) {
    parts.push(manualCostPart({
      key: "channel:travel",
      name: "Travel / Fuel / Travel Labor",
      type: "service",
      subtype: "travel",
      sourcePath: "total_travel_cost",
      cost: project.total_travel_cost,
      quantity: project.travel_miles_round_trip || 1,
      unit: project.travel_miles_round_trip ? "round_trip_mile" : "job",
      calculation: { miles: project.travel_miles_round_trip, accepted_total: project.total_travel_cost }
    }));
  }
  if (Math.abs(num2(project.markup_amount)) > 5e-3) {
    parts.push(manualCostPart({
      key: "channel:project-markup",
      name: "Builder Markup",
      type: "pricing",
      subtype: "markup",
      sourcePath: "markup_amount",
      cost: project.markup_amount,
      calculation: { markup_percent: project.markup_percent, markup_amount: project.markup_amount }
    }));
  }
  const authoritativeTotal = num2(project.total_cost);
  const representedTotal = parts.reduce((sum, part) => sum + num2(part.extended_cost), 0);
  const finalResidual = authoritativeTotal - representedTotal;
  if (Math.abs(finalResidual) > 5e-3) {
    parts.push(manualCostPart({
      key: "channel:saved-total-reconciliation",
      name: "Channel / Dimensional \u2014 Saved Total Adjustment",
      type: "pricing",
      subtype: "saved_total_adjustment",
      sourcePath: "total_cost",
      cost: finalResidual,
      calculation: { authoritative_total: authoritativeTotal, represented_total: representedTotal }
    }));
  }
  return parts;
}
function extractVinylLegacy(project) {
  const parts = [];
  (project.items || []).forEach((item, index) => {
    if (item.vinyl_id) {
      parts.push(makePart({
        key: `vinyl:item:${index}:vinyl`,
        name: item.description ? `${item.description} \u2014 Vinyl` : "Vinyl",
        type: "material",
        subtype: "vinyl",
        sourcePath: `items[${index}].vinyl_id`,
        entity: "VinylInventory",
        inventoryId: item.vinyl_id,
        quantity: item.vinyl_sqft || item.quantity || 1,
        unit: "sqft",
        unitCost: item.vinyl_sqft ? num2(item.vinyl_cost) / num2(item.vinyl_sqft, 1) : 0,
        extendedCost: item.vinyl_cost,
        builderData: item,
        calculation: { sqft: item.vinyl_sqft, cost: item.vinyl_cost }
      }));
    }
    if (item.laminate_id) {
      parts.push(makePart({
        key: `vinyl:item:${index}:laminate`,
        name: item.description ? `${item.description} \u2014 Laminate` : "Laminate",
        type: "material",
        subtype: "laminate",
        sourcePath: `items[${index}].laminate_id`,
        entity: "VinylInventory",
        inventoryId: item.laminate_id,
        quantity: item.laminate_sqft || item.quantity || 1,
        unit: "sqft",
        unitCost: item.laminate_sqft ? num2(item.laminate_cost) / num2(item.laminate_sqft, 1) : 0,
        extendedCost: item.laminate_cost,
        builderData: item,
        calculation: { sqft: item.laminate_sqft, cost: item.laminate_cost }
      }));
    }
  });
  [
    ["printer_id", "Printer"],
    ["cutter_id", "Cutter"],
    ["laminator_id", "Laminator"]
  ].forEach(([field, label]) => {
    if (!project[field]) return;
    parts.push(makePart({
      key: `vinyl:machine:${field}`,
      name: label,
      type: "equipment",
      subtype: field.replace("_id", ""),
      sourcePath: field,
      entity: "VinylMachine",
      inventoryId: project[field],
      quantity: 1,
      builderData: { machine_id: project[field] }
    }));
  });
  (project.items || []).forEach((item, index) => {
    if (num2(item.print_cost) > 5e-3) {
      parts.push(manualCostPart({
        key: `vinyl:item:${index}:print`,
        name: item.description ? `${item.description} \u2014 Printing / Ink` : "Printing / Ink",
        type: "consumable",
        subtype: "printing",
        sourcePath: `items[${index}].print_cost`,
        cost: item.print_cost,
        quantity: item.print_sqft || 1,
        unit: item.print_sqft ? "sqft" : "job",
        builderData: item,
        calculation: { print_sqft: item.print_sqft, print_cost: item.print_cost, rate: project.print_cost_per_sqft }
      }));
    }
    if (num2(item.labor_cost) > 5e-3) {
      parts.push(manualCostPart({
        key: `vinyl:item:${index}:labor`,
        name: item.description ? `${item.description} \u2014 Production Labor` : "Vinyl Production Labor",
        type: "labor",
        subtype: "production_labor",
        sourcePath: `items[${index}].labor_cost`,
        cost: item.labor_cost,
        quantity: item.labor_hours || 1,
        unit: item.labor_hours ? "hour" : "job",
        builderData: item,
        calculation: { labor_hours: item.labor_hours, labor_cost: item.labor_cost, rate: project.labor_rate_per_hour }
      }));
    }
  });
  if (num2(project.total_supplies_cost) > 5e-3) {
    parts.push(manualCostPart({
      key: "vinyl:supplies",
      name: "Vinyl Production Supplies",
      type: "consumable",
      subtype: "production_supplies",
      sourcePath: "total_supplies_cost",
      cost: project.total_supplies_cost,
      calculation: { supplies_percent: project.supplies_percent_of_materials }
    }));
  }
  if (num2(project.markup_amount) > 5e-3) {
    parts.push(manualCostPart({
      key: "vinyl:markup",
      name: "Builder Markup",
      type: "pricing",
      subtype: "markup",
      sourcePath: "markup_amount",
      cost: project.markup_amount,
      calculation: { markup_percent: project.markup_percent, markup_amount: project.markup_amount }
    }));
  }
  return parts;
}
function extractVinyl(project, catalogs = {}, options = {}) {
  const workflows = Array.isArray(project.workflows) ? project.workflows : [];
  if (!workflows.length) return extractVinylLegacy(project);
  const parts = [];
  let workflowMaterialTotal = 0;
  let workflowMachineTotal = 0;
  let workflowLaborTotal = 0;
  const addLinkedCost = ({
    key,
    name,
    type = "material",
    subtype = "",
    sourcePath = "",
    entity = "",
    inventoryId = "",
    quantity = 1,
    unit = "job",
    cost = 0,
    builderData = {},
    calculation = {},
    pricingBasis = {},
    includeZero = false
  }) => {
    const extended = num2(cost);
    if (!includeZero && Math.abs(extended) <= 5e-3) return;
    const qty = Math.max(num2(quantity, 1), 1e-6);
    parts.push(makePart({
      key,
      name,
      type,
      subtype,
      sourcePath,
      entity,
      inventoryId,
      quantity: qty,
      unit,
      unitCost: extended / qty,
      extendedCost: extended,
      builderData,
      calculation,
      pricingBasis
    }));
  };
  const laborInventoryFor = (row = {}) => {
    const savedId = row.inventory_id || row.labor_service_id || "";
    if (savedId) {
      const saved = findRow(catalogs, "LaborServiceInventory", savedId);
      if (saved) return saved;
    }
    return findNameCandidate(catalogs, "LaborServiceInventory", row.role || row.name || "");
  };
  workflows.forEach((workflow, workflowIndex) => {
    const prefix = `vinyl:workflow:${workflowIndex}`;
    const workflowName = workflow.name || `Workflow ${workflowIndex + 1}`;
    const printer = findRow(catalogs, "VinylMachine", workflow.printer_id);
    const cutter = findRow(catalogs, "VinylMachine", workflow.cutter_id);
    const laminator = findRow(catalogs, "VinylMachine", workflow.laminator_id);
    const vinyl = findRow(catalogs, "VinylInventory", workflow.vinyl_id);
    const laminate = findRow(catalogs, "VinylInventory", workflow.laminate_id);
    const transferTape = findRow(catalogs, "VinylInventory", workflow.transfer_tape_id);
    const operatorRate = printer?.operator_hourly_rate ?? cutter?.operator_hourly_rate ?? laminator?.operator_hourly_rate ?? 45;
    const calc = workflow._calc && Number.isFinite(Number(workflow._calc.totalCost)) ? workflow._calc : calculateVinylProject({
      items: workflow.items || [],
      printer,
      cutter,
      laminator,
      vinyl,
      laminate,
      transferTape,
      operatorHourlyRate: operatorRate,
      applyPrint: !!workflow.apply_print,
      applyCut: !!workflow.apply_cut,
      applyLaminate: !!workflow.apply_laminate,
      applyTransferTape: !!workflow.apply_transfer_tape,
      overrideGutterH: workflow.gutter_h_override === "" || workflow.gutter_h_override == null ? void 0 : num2(workflow.gutter_h_override),
      overrideGutterV: workflow.gutter_v_override === "" || workflow.gutter_v_override == null ? void 0 : num2(workflow.gutter_v_override),
      printQuality: workflow.print_quality || printer?.default_print_quality || "high_quality",
      weedingDifficulty: workflow.weeding_difficulty || "moderate",
      weedingMinutesPerPartOverride: workflow.weeding_minutes_per_part_override,
      installMinutesPerPart: workflow.install_minutes_per_part,
      personnel: workflow.personnel || [],
      spoilageBufferPercent: num2(workflow.spoilage_buffer_percent),
      setupFeeFloor: num2(workflow.setup_fee_floor)
    });
    workflowMaterialTotal += num2(calc.materialCost);
    workflowMachineTotal += num2(calc.machineCost);
    workflowLaborTotal += num2(calc.laborCost);
    if (workflow.vinyl_id) {
      addLinkedCost({
        key: `${prefix}:vinyl`,
        name: `${workflowName} \u2014 Vinyl`,
        type: "material",
        subtype: "vinyl",
        sourcePath: `workflows[${workflowIndex}].vinyl_id`,
        entity: "VinylInventory",
        inventoryId: workflow.vinyl_id,
        quantity: calc.totalRollSqFtPulled || 1,
        unit: "sqft",
        cost: calc.vinylCost,
        includeZero: true,
        builderData: workflow,
        calculation: { total_roll_sqft_pulled: calc.totalRollSqFtPulled, used_sqft: calc.usedSqFt, wasted_sqft: calc.wastedSqFt, vinyl_cost: calc.vinylCost }
      });
    }
    if (workflow.apply_laminate && workflow.laminate_id) {
      addLinkedCost({
        key: `${prefix}:laminate`,
        name: `${workflowName} \u2014 Laminate`,
        type: "material",
        subtype: "laminate",
        sourcePath: `workflows[${workflowIndex}].laminate_id`,
        entity: "VinylInventory",
        inventoryId: workflow.laminate_id,
        quantity: calc.laminateSqFt || 1,
        unit: "sqft",
        cost: calc.laminateCost,
        includeZero: true,
        builderData: workflow,
        calculation: { laminate_sqft: calc.laminateSqFt, laminate_cost: calc.laminateCost }
      });
    }
    if (workflow.apply_transfer_tape && workflow.transfer_tape_id) {
      addLinkedCost({
        key: `${prefix}:transfer-tape`,
        name: `${workflowName} \u2014 Transfer Tape`,
        type: "material",
        subtype: "transfer_tape",
        sourcePath: `workflows[${workflowIndex}].transfer_tape_id`,
        entity: "VinylInventory",
        inventoryId: workflow.transfer_tape_id,
        quantity: calc.transferTapeSqFt || 1,
        unit: "sqft",
        cost: calc.transferTapeCost,
        includeZero: true,
        builderData: workflow,
        calculation: { transfer_tape_sqft: calc.transferTapeSqFt, transfer_tape_cost: calc.transferTapeCost }
      });
    }
    if (workflow.apply_print && workflow.printer_id) {
      addLinkedCost({
        key: `${prefix}:ink`,
        name: `${workflowName} \u2014 Ink`,
        type: "consumable",
        subtype: "ink",
        sourcePath: `workflows[${workflowIndex}].printer_id`,
        entity: "VinylMachine",
        inventoryId: workflow.printer_id,
        quantity: calc.usedSqFt || 1,
        unit: "sqft",
        cost: calc.inkCost,
        builderData: workflow,
        calculation: { used_sqft: calc.usedSqFt, ink_rate_per_sqin: calc.inkRatePerSqIn, print_quality: calc.printQuality, ink_cost: calc.inkCost }
      });
      addLinkedCost({
        key: `${prefix}:printer-machine`,
        name: `${workflowName} \u2014 Printer Time`,
        type: "equipment",
        subtype: "printer",
        sourcePath: `workflows[${workflowIndex}].printer_id`,
        entity: "VinylMachine",
        inventoryId: workflow.printer_id,
        quantity: num2(calc.printMinutes) / 60 || 1,
        unit: num2(calc.printMinutes) > 0 ? "hour" : "job",
        cost: calc.printMachineCost,
        includeZero: true,
        builderData: workflow,
        calculation: { print_minutes: calc.printMinutes, print_machine_cost: calc.printMachineCost }
      });
    }
    if (workflow.apply_cut && workflow.cutter_id) {
      addLinkedCost({
        key: `${prefix}:blade`,
        name: `${workflowName} \u2014 Blade Wear`,
        type: "consumable",
        subtype: "blade_wear",
        sourcePath: `workflows[${workflowIndex}].cutter_id`,
        entity: "VinylMachine",
        inventoryId: workflow.cutter_id,
        quantity: num2(calc.cutMinutes) || 1,
        unit: num2(calc.cutMinutes) > 0 ? "minute" : "job",
        cost: calc.bladeCost,
        builderData: workflow,
        calculation: { cut_minutes: calc.cutMinutes, cut_distance_inches: calc.cutDistanceIn, blade_cost: calc.bladeCost }
      });
      addLinkedCost({
        key: `${prefix}:cutter-machine`,
        name: `${workflowName} \u2014 Cutter Time`,
        type: "equipment",
        subtype: "cutter",
        sourcePath: `workflows[${workflowIndex}].cutter_id`,
        entity: "VinylMachine",
        inventoryId: workflow.cutter_id,
        quantity: num2(calc.cutMinutes) / 60 || 1,
        unit: num2(calc.cutMinutes) > 0 ? "hour" : "job",
        cost: calc.cutMachineCost,
        includeZero: true,
        builderData: workflow,
        calculation: { cut_minutes: calc.cutMinutes, cut_machine_cost: calc.cutMachineCost }
      });
    }
    if (workflow.apply_laminate && workflow.laminator_id) {
      addLinkedCost({
        key: `${prefix}:laminator-machine`,
        name: `${workflowName} \u2014 Laminator Time`,
        type: "equipment",
        subtype: "laminator",
        sourcePath: `workflows[${workflowIndex}].laminator_id`,
        entity: "VinylMachine",
        inventoryId: workflow.laminator_id,
        quantity: num2(calc.laminateMinutes) / 60 || 1,
        unit: num2(calc.laminateMinutes) > 0 ? "hour" : "job",
        cost: calc.laminateMachineCost,
        includeZero: true,
        builderData: workflow,
        calculation: { laminate_minutes: calc.laminateMinutes, laminate_machine_cost: calc.laminateMachineCost }
      });
    }
    let workflowPersonnelTotal = 0;
    (workflow.personnel || []).forEach((person, personIndex) => {
      const personCost = num2(person.total_cost, num2(person.hourly_rate) * num2(person.hours));
      if (Math.abs(personCost) <= 5e-3) return;
      workflowPersonnelTotal += personCost;
      const inventoryRow = laborInventoryFor(person);
      addLinkedCost({
        key: `${prefix}:personnel:${personIndex}`,
        name: `${workflowName} \u2014 ${person.role || person.name || "Production Labor"}`,
        type: "labor",
        subtype: "workflow_personnel",
        sourcePath: `workflows[${workflowIndex}].personnel[${personIndex}].inventory_id`,
        entity: inventoryRow ? "LaborServiceInventory" : "",
        inventoryId: person.inventory_id || inventoryRow?.id || "",
        quantity: person.hours || 1,
        unit: person.hours ? "hour" : "job",
        cost: personCost,
        builderData: person,
        calculation: { role: person.role, hourly_rate: person.hourly_rate, hours: person.hours, total_cost: personCost }
      });
    });
    const laborResidual = num2(calc.laborCost) - workflowPersonnelTotal;
    if (laborResidual > 5e-3) {
      parts.push(manualCostPart({
        key: `${prefix}:labor`,
        name: `${workflowName} \u2014 Production Labor`,
        type: "labor",
        subtype: "production_labor",
        sourcePath: `workflows[${workflowIndex}]`,
        cost: laborResidual,
        quantity: calc.laborHours || 1,
        unit: calc.laborHours ? "hour" : "job",
        builderData: workflow,
        calculation: { labor_hours: calc.laborHours, labor_cost: calc.laborCost, residual_cost: laborResidual }
      }));
    }
    if (num2(calc.setupFeeApplied) > 5e-3) {
      parts.push(manualCostPart({
        key: `${prefix}:setup-floor`,
        name: `${workflowName} \u2014 Setup Fee Floor (Not Billed by Source)`,
        type: "service",
        subtype: "setup_fee_floor_source_metric",
        sourcePath: `workflows[${workflowIndex}].setup_fee_floor`,
        cost: 0,
        builderData: workflow,
        calculation: { setup_fee_floor: workflow.setup_fee_floor, pre_floor_total: calc.preFloorTotal, setup_fee_applied: calc.setupFeeApplied, source_rollup_billed: false }
      }));
    }
  });
  const baseSupplies = workflowMaterialTotal * (num2(project.supplies_percent_of_materials) / 100);
  if (baseSupplies > 5e-3) {
    parts.push(manualCostPart({
      key: "vinyl:base-supplies",
      name: "Vinyl Production Supplies",
      type: "consumable",
      subtype: "production_supplies",
      sourcePath: "supplies_percent_of_materials",
      cost: baseSupplies,
      calculation: { supplies_percent: project.supplies_percent_of_materials, workflow_material_total: workflowMaterialTotal, base_supplies_cost: baseSupplies }
    }));
  }
  if (num2(project.extra_supplies_cost) > 5e-3) {
    parts.push(manualCostPart({
      key: "vinyl:extra-supplies",
      name: "Additional Vinyl Supplies",
      type: "consumable",
      subtype: "extra_supplies",
      sourcePath: "extra_supplies_cost",
      cost: project.extra_supplies_cost
    }));
  }
  let equipmentTotal = 0;
  (project.selected_equipment || []).forEach((entry, index) => {
    const cost = num2(entry.total_cost);
    equipmentTotal += cost;
    const inventoryId = entry.equipment_id || "";
    addLinkedCost({
      key: `vinyl:equipment:${index}`,
      name: entry.equipment_name || rowName("ChannelLetterInstallEquipment", findRow(catalogs, "ChannelLetterInstallEquipment", inventoryId)) || `Installation Equipment ${index + 1}`,
      type: "equipment",
      subtype: entry.equipment_type || "installation_equipment",
      sourcePath: `selected_equipment[${index}].equipment_id`,
      entity: "ChannelLetterInstallEquipment",
      inventoryId,
      quantity: entry.duration || 1,
      unit: entry.pricing_mode === "per_hour" ? "hour" : entry.pricing_mode === "per_week" ? "week" : entry.pricing_mode === "per_month" ? "month" : entry.pricing_mode === "per_day" ? "day" : "job",
      cost,
      includeZero: !!inventoryId,
      builderData: entry,
      calculation: entry
    });
  });
  let projectPersonnelTotal = 0;
  (project.personnel || []).forEach((person, index) => {
    const cost = num2(person.total_cost, num2(person.hourly_rate) * num2(person.hours));
    if (Math.abs(cost) <= 5e-3) return;
    projectPersonnelTotal += cost;
    const inventoryRow = laborInventoryFor(person);
    addLinkedCost({
      key: `vinyl:installation-personnel:${index}`,
      name: person.name ? `${person.name} \u2014 ${person.role || "Installation Labor"}` : person.role || "Installation Labor",
      type: "labor",
      subtype: "installation_personnel",
      sourcePath: `personnel[${index}].inventory_id`,
      entity: inventoryRow ? "LaborServiceInventory" : "",
      inventoryId: person.inventory_id || inventoryRow?.id || "",
      quantity: person.hours || 1,
      unit: person.hours ? "hour" : "job",
      cost,
      builderData: person,
      calculation: { role: person.role, hourly_rate: person.hourly_rate, hours: person.hours, total_cost: cost }
    });
  });
  const travelTotal = num2(project.total_travel_cost);
  if (travelTotal > 5e-3) {
    parts.push(manualCostPart({
      key: "vinyl:travel",
      name: "Travel / Fuel",
      type: "service",
      subtype: "travel",
      sourcePath: "total_travel_cost",
      cost: travelTotal,
      quantity: project.travel_miles_round_trip || 1,
      unit: project.travel_miles_round_trip ? "mile" : "job",
      calculation: { miles: project.travel_miles_round_trip, total_travel_cost: travelTotal }
    }));
  }
  const suppliesTotal = baseSupplies + num2(project.extra_supplies_cost);
  const subtotal = workflowMaterialTotal + workflowMachineTotal + workflowLaborTotal + equipmentTotal + projectPersonnelTotal + travelTotal + suppliesTotal;
  const markup = subtotal * (num2(project.markup_percent) / 100);
  if (markup > 5e-3) {
    parts.push(manualCostPart({
      key: "vinyl:markup",
      name: "Builder Markup",
      type: "pricing",
      subtype: "markup",
      sourcePath: "markup_percent",
      cost: markup,
      calculation: { markup_percent: project.markup_percent, subtotal, markup_amount: markup }
    }));
  }
  if (options.legacyMode && project.total_cost !== null && project.total_cost !== void 0) {
    const authoritativeTotal = num2(project.total_cost);
    const representedTotal = parts.reduce((sum, part) => sum + num2(part.extended_cost), 0);
    const residual = authoritativeTotal - representedTotal;
    if (Math.abs(residual) > 5e-3) {
      parts.push(manualCostPart({
        key: "vinyl:saved-total-reconciliation",
        name: "Vinyl \u2014 Saved Total Adjustment",
        type: "pricing",
        subtype: "saved_total_adjustment",
        sourcePath: "total_cost",
        cost: residual,
        calculation: { authoritative_total: authoritativeTotal, represented_total: representedTotal }
      }));
    }
  }
  return parts;
}
function extractMetal(project) {
  const parts = [];
  const represented = {
    material: 0,
    supplies: 0,
    fabrication: 0,
    welding: 0,
    finishing: 0
  };
  (project.items || []).forEach((item, index) => {
    const itemQty = Math.max(num2(item.quantity, 1), 1e-6);
    const lengthPerUnit = num2(item.material_length_ft);
    const materialExtended = num2(item.material_cost) * itemQty;
    represented.material += materialExtended;
    if (Math.abs(materialExtended) > 5e-3 || item.inventory_item_id) {
      const linkedUsageQty = lengthPerUnit > 0 ? lengthPerUnit * itemQty : itemQty;
      const frozenMaterialUnitCost = lengthPerUnit > 0 ? num2(item.material_cost) / Math.max(lengthPerUnit, 1e-6) : num2(item.material_cost);
      parts.push(makePart({
        key: `metal:item:${index}:material`,
        name: item.description ? `${item.description} \u2014 Metal Material` : item.item_type || "Metal Material",
        type: "material",
        subtype: item.item_type || "metal",
        sourcePath: `items[${index}].inventory_item_id`,
        entity: item.inventory_item_id ? "Inventory" : "",
        inventoryId: item.inventory_item_id || "",
        quantity: linkedUsageQty,
        unit: lengthPerUnit > 0 ? "source_unit" : "item",
        unitCost: frozenMaterialUnitCost,
        extendedCost: materialExtended,
        builderData: item,
        calculation: {
          item_quantity: itemQty,
          material_length_per_unit: lengthPerUnit,
          material_cost_per_item: item.material_cost,
          total_material_cost: materialExtended
        },
        pricingBasis: {
          pricing_mode: "legacy_cost_per_unit",
          material_length_ft_per_item: lengthPerUnit,
          item_quantity: itemQty
        }
      }));
    }
    const suppliesExtended = num2(item.supplies_cost) * itemQty;
    represented.supplies += suppliesExtended;
    if (Math.abs(suppliesExtended) > 5e-3) {
      parts.push(manualCostPart({
        key: `metal:item:${index}:supplies`,
        name: item.description ? `${item.description} \u2014 Fabrication Consumables` : "Fabrication Consumables",
        type: "consumable",
        subtype: "supplies",
        sourcePath: `items[${index}].supplies_cost`,
        cost: suppliesExtended,
        quantity: itemQty,
        unit: "item",
        builderData: item,
        calculation: { item_quantity: itemQty, supplies_cost_per_item: item.supplies_cost, total_supplies_cost: suppliesExtended }
      }));
    }
    [
      ["fabrication", "Fabrication Labor", item.fabrication_cost, item.fabrication_hours],
      ["welding", "Welding Labor", item.welding_cost, item.welding_hours],
      ["finishing", "Finishing Labor", item.finishing_cost, item.finishing_hours]
    ].forEach(([key, label, perItemCost, hoursPerItem]) => {
      const extended = num2(perItemCost) * itemQty;
      represented[key] += extended;
      if (Math.abs(extended) <= 5e-3) return;
      const totalHours = num2(hoursPerItem) * itemQty;
      parts.push(manualCostPart({
        key: `metal:item:${index}:${key}`,
        name: item.description ? `${item.description} \u2014 ${label}` : label,
        type: "labor",
        subtype: key,
        sourcePath: `items[${index}].${key}_cost`,
        cost: extended,
        quantity: totalHours || itemQty,
        unit: totalHours ? "hour" : "item",
        builderData: item,
        calculation: {
          item_quantity: itemQty,
          hours_per_item: hoursPerItem,
          cost_per_item: perItemCost,
          total_cost: extended
        }
      }));
    });
  });
  const authoritative = {
    material: project.total_material_cost == null ? represented.material : num2(project.total_material_cost),
    supplies: project.total_supplies_cost == null ? represented.supplies : num2(project.total_supplies_cost),
    fabrication: project.total_fabrication_cost == null ? represented.fabrication : num2(project.total_fabrication_cost),
    welding: project.total_welding_cost == null ? represented.welding : num2(project.total_welding_cost),
    finishing: project.total_finishing_cost == null ? represented.finishing : num2(project.total_finishing_cost)
  };
  const labels = {
    material: ["Metal Material Adjustment", "material"],
    supplies: ["Metal Supplies Adjustment", "consumable"],
    fabrication: ["Fabrication Labor Adjustment", "labor"],
    welding: ["Welding Labor Adjustment", "labor"],
    finishing: ["Finishing Labor Adjustment", "labor"]
  };
  Object.keys(authoritative).forEach((key) => {
    const adjustment = authoritative[key] - represented[key];
    if (Math.abs(adjustment) <= 5e-3) return;
    parts.push(manualCostPart({
      key: `metal:${key}-adjustment`,
      name: labels[key][0],
      type: labels[key][1],
      subtype: `${key}_adjustment`,
      sourcePath: `total_${key}_cost`,
      cost: adjustment,
      calculation: {
        authoritative_total: authoritative[key],
        represented_total: represented[key],
        adjustment
      }
    }));
  });
  return parts;
}
function brickMaterialForCalc(row) {
  if (!row) return null;
  if (row.material_type === "wall_material") {
    return {
      ...row,
      length: row.wall_unit_length_inches,
      width: row.wall_unit_width_inches,
      height: row.wall_unit_height_inches
    };
  }
  if (row.material_type === "brick_stone") {
    return {
      ...row,
      length: row.brick_length_inches,
      width: row.brick_width_inches,
      height: row.brick_height_inches
    };
  }
  return row;
}
function extractBrick(project, catalogs = {}, options = {}) {
  const parts = [];
  const selectedId = project.selected_material_id || "";
  const foundationRow = selectedId ? catalogs.FoundationInventory?.byId.get(selectedId) : null;
  const legacyRow = selectedId ? catalogs.BrickStoneInventory?.byId.get(selectedId) : null;
  const liveRow = foundationRow || legacyRow || null;
  const entity = foundationRow ? "FoundationInventory" : legacyRow ? "BrickStoneInventory" : "FoundationInventory";
  const liveCalc = !options.legacyMode && liveRow ? calcBrickStoneProject(project, brickMaterialForCalc(liveRow)) : null;
  const calculatedBricks = liveCalc ? liveCalc.calculated_bricks : num2(project.calculated_bricks);
  const materialCost = liveCalc ? liveCalc.material_cost : num2(project.material_cost);
  const mortarBags = liveCalc ? liveCalc.mortar_bags_needed : num2(project.mortar_bags_needed);
  const mortarCost = liveCalc ? liveCalc.mortar_cost : num2(project.mortar_cost);
  const laborHours = liveCalc ? liveCalc.labor_hours : num2(project.labor_hours);
  const laborCost = liveCalc ? liveCalc.labor_cost : num2(project.labor_cost);
  const markupAmount = liveCalc ? liveCalc.markup_amount : num2(project.markup_amount);
  if (selectedId) {
    const qty = Math.max(calculatedBricks, 1);
    parts.push(makePart({
      key: "brick:primary-material",
      name: project.material_name || liveRow?.material_name || "Brick / Stone Material",
      type: "material",
      subtype: liveRow?.wall_material_subtype || liveRow?.material_type || "brick_stone",
      sourcePath: "selected_material_id",
      entity,
      inventoryId: selectedId,
      quantity: qty,
      unit: "unit",
      unitCost: qty ? materialCost / qty : 0,
      extendedCost: materialCost,
      builderData: {
        material_dimensions: project.material_dimensions,
        bricks_along_length: project.bricks_along_length,
        bricks_along_width: project.bricks_along_width,
        courses_high: project.courses_high,
        layers: project.layers
      },
      calculation: {
        calculated_bricks: calculatedBricks,
        material_cost: materialCost,
        material_inventory_entity: entity
      },
      pricingBasis: { pricing_mode: "per_unit" }
    }));
  }
  if (Math.abs(mortarCost) > 5e-3) {
    parts.push(manualCostPart({
      key: "brick:mortar",
      name: "Mortar",
      type: "consumable",
      subtype: "mortar",
      sourcePath: "mortar_cost",
      cost: mortarCost,
      quantity: mortarBags || 1,
      unit: mortarBags ? "bag" : "job",
      calculation: { mortar_bags_needed: mortarBags, mortar_bag_cost: project.mortar_bag_cost }
    }));
  }
  if (Math.abs(laborCost) > 5e-3) {
    parts.push(manualCostPart({
      key: "brick:labor",
      name: "Masonry Labor",
      type: "labor",
      subtype: "masonry_labor",
      sourcePath: "labor_cost",
      cost: laborCost,
      quantity: laborHours || 1,
      unit: laborHours ? "hour" : "job",
      calculation: { labor_hours: laborHours, labor_rate_per_hour: project.labor_rate_per_hour }
    }));
  }
  if (Math.abs(markupAmount) > 5e-3) {
    parts.push(manualCostPart({
      key: "brick:markup",
      name: "Builder Markup",
      type: "pricing",
      subtype: "markup",
      sourcePath: "markup_amount",
      cost: markupAmount,
      calculation: { markup_percent: project.markup_percent, markup_amount: markupAmount }
    }));
  }
  if (options.legacyMode && project.total_cost !== null && project.total_cost !== void 0) {
    const represented = parts.reduce((sum, part) => sum + num2(part.extended_cost), 0);
    const residual = num2(project.total_cost) - represented;
    if (Math.abs(residual) > 5e-3) {
      parts.push(manualCostPart({
        key: "brick:saved-total-reconciliation",
        name: "Brick & Stone \u2014 Saved Total Adjustment",
        type: "pricing",
        subtype: "saved_total_adjustment",
        sourcePath: "total_cost",
        cost: residual,
        calculation: { authoritative_total: project.total_cost, represented_total: represented, adjustment: residual }
      }));
    }
  }
  return parts;
}
function maintenanceEquipmentSource(entry, catalogs) {
  const id = entry?.equipment_id || entry?.inventory_item_id || "";
  if (!id) return { entity: "", row: null };
  const requested = entry?.inventory_entity || "";
  if (requested && catalogs[requested]?.byId?.has(id)) {
    return { entity: requested, row: catalogs[requested].byId.get(id) };
  }
  const shared = catalogs.ChannelLetterInstallEquipment?.byId?.get(id);
  if (shared) return { entity: "ChannelLetterInstallEquipment", row: shared };
  const legacy = catalogs.MaintenanceEquipment?.byId?.get(id);
  if (legacy) return { entity: "MaintenanceEquipment", row: legacy };
  return { entity: requested, row: null };
}
function recalcMaintenanceEquipmentRow(entry, catalogs) {
  const { entity, row } = maintenanceEquipmentSource(entry, catalogs);
  if (!row) return entry;
  const pricingMode = entry.pricing_mode || row.pricing_mode || "per_day";
  const duration = Math.max(num2(entry.duration, 1), 0);
  const unitCost = independentPartUnitCost({
    inventory_entity: entity,
    pricing_basis_snapshot: { pricing_mode: pricingMode }
  }, row);
  const owned = row.ownership === "owned" || ["owned_flat", "per_project_flat"].includes(pricingMode);
  const delivery = !owned && entry.include_delivery ? num2(row.delivery_pickup_cost) : 0;
  const idleRate = num2(row.idle_running_cost_per_hour);
  const idleHours = num2(entry.idle_hours);
  const idleCost = idleRate * idleHours;
  return {
    ...entry,
    inventory_entity: entity,
    equipment_name: row.equipment_name || entry.equipment_name,
    equipment_type: row.equipment_type || entry.equipment_type,
    pricing_mode: pricingMode,
    ownership: row.ownership || entry.ownership,
    unit_cost: unitCost,
    delivery_pickup_cost: num2(row.delivery_pickup_cost),
    idle_running_cost_per_hour: idleRate,
    idle_cost: idleCost,
    total_cost: unitCost * duration + delivery + idleCost
  };
}
function liveMaintenanceProject(project, catalogs) {
  const settings = {};
  (catalogs.Settings?.rows || []).forEach((row) => {
    if (row.setting_name) settings[row.setting_name] = row.setting_value;
  });
  const rates = catalogs.MaintenanceActionRate?.rows || [];
  const inventory = (catalogs.MaintenanceInventory?.rows || []).map((rule) => {
    if (!rule.inventory_entity || !rule.inventory_item_id) return rule;
    const masterRow = catalogs[rule.inventory_entity]?.byId?.get(rule.inventory_item_id) || null;
    const pricingMode = masterRow?.pricing_mode || masterRow?.pole_pricing_mode || masterRow?.unit_type || (rule.inventory_entity === "DimensionalLetterMaterial" ? "per_sheet" : "per_unit");
    return {
      ...rule,
      _master_missing: !masterRow,
      _master_unit_cost: masterRow ? independentPartUnitCost({ inventory_entity: rule.inventory_entity, pricing_basis_snapshot: { pricing_mode: pricingMode } }, masterRow) : void 0,
      _master_pricing_mode: pricingMode,
      _display_name: masterRow ? rowName(rule.inventory_entity, masterRow) : rule.inventory_item_name || rule.item_name
    };
  });
  const items = (project.items || []).map((item) => calcServiceItem(item, settings, rates, inventory));
  const selectedEquipment = (project.selected_equipment || []).map((entry) => recalcMaintenanceEquipmentRow(entry, catalogs));
  const current = { ...project, items, selected_equipment: selectedEquipment };
  return { ...current, ...calcProjectTotals(current) };
}
function extractMaintenance(project, catalogs = {}, options = {}) {
  if (!options.legacyMode && (catalogs.Settings?.rows || []).length) {
    project = liveMaintenanceProject(project, catalogs);
  }
  const parts = [];
  const represented = { labor: 0, materials: 0, equipment: 0, personnel: 0, supplies: 0, travel: 0, markup: 0 };
  (project.items || []).forEach((item, itemIndex) => {
    let itemMaterialParts = 0;
    (item.materials || []).forEach((mat, matIndex) => {
      const ruleId = mat.maintenance_rule_id || (!mat.inventory_entity ? mat.inventory_item_id || mat.inventory_id || "" : "");
      const rule = ruleId ? catalogs.MaintenanceInventory?.byId.get(ruleId) : null;
      const linkedEntity = mat.inventory_entity || rule?.inventory_entity || "";
      const linkedId = linkedEntity ? mat.inventory_item_id || rule?.inventory_item_id || "" : "";
      const inventoryEntity = linkedEntity || (ruleId ? "MaintenanceInventory" : "");
      const inventoryId = linkedEntity ? linkedId : ruleId;
      const row = linkedEntity ? catalogs[linkedEntity]?.byId?.get(linkedId) : rule;
      const quantity = num2(mat.quantity, 0);
      const unitCost = num2(mat.unit_cost);
      const extendedCost = mat.total_cost == null ? quantity * unitCost : num2(mat.total_cost);
      itemMaterialParts += extendedCost;
      represented.materials += extendedCost;
      if (Math.abs(extendedCost) <= 5e-3 && !inventoryId) return;
      parts.push(makePart({
        key: `maintenance:item:${itemIndex}:material:${matIndex}`,
        name: mat.item_name || (linkedEntity && row ? rowName(linkedEntity, row) : rule?.item_name) || "Maintenance Material",
        type: "material",
        subtype: mat.pricing_mode || row?.pricing_mode || rule?.pricing_mode || "maintenance_material",
        sourcePath: linkedEntity ? `items[${itemIndex}].materials[${matIndex}].inventory_item_id` : ruleId ? `items[${itemIndex}].materials[${matIndex}].maintenance_rule_id` : `items[${itemIndex}].materials[${matIndex}]`,
        entity: inventoryId ? inventoryEntity : "",
        inventoryId,
        quantity: quantity || 1,
        unit: mat.unit || row?.unit || rule?.unit || mat.pricing_mode || row?.pricing_mode || rule?.pricing_mode || "unit",
        unitCost,
        extendedCost,
        builderData: { sign: item.description, sign_type: item.sign_type, size: item.size, actions: item.actions || [], maintenance_rule_id: ruleId, maintenance_rule: rule || null, material: mat },
        calculation: { ...mat, maintenance_rule_id: ruleId, saved_total_cost: extendedCost },
        pricingBasis: { pricing_mode: mat.pricing_mode || row?.pricing_mode || row?.pole_pricing_mode || row?.unit_type || rule?.pricing_mode || "", size: item.size, sign_type: item.sign_type, actions: item.actions || [], usage_basis: mat.usage_basis || rule?.usage_basis || "", usage_multiplier: mat.usage_multiplier ?? rule?.usage_multiplier }
      }));
    });
    const authoritativeItemMaterials = item.materials_cost == null ? itemMaterialParts : num2(item.materials_cost);
    const itemMaterialAdjustment = authoritativeItemMaterials - itemMaterialParts;
    if (Math.abs(itemMaterialAdjustment) > 5e-3) {
      const isRepaint = !!item.repaint_calc;
      parts.push(manualCostPart({
        key: `maintenance:item:${itemIndex}:material-adjustment`,
        name: isRepaint ? `${item.description || "Monument"} \u2014 Repaint Paint Material` : `${item.description || `Service Item ${itemIndex + 1}`} \u2014 Material Adjustment`,
        type: "material",
        subtype: isRepaint ? "monument_repaint_paint" : "material_adjustment",
        sourcePath: `items[${itemIndex}].materials_cost`,
        cost: itemMaterialAdjustment,
        builderData: item,
        calculation: { authoritative_item_materials: authoritativeItemMaterials, inventory_materials: itemMaterialParts, repaint_calc: item.repaint_calc, adjustment: itemMaterialAdjustment }
      }));
      represented.materials += itemMaterialAdjustment;
    }
    const laborCost = num2(item.labor_cost);
    represented.labor += laborCost;
    if (Math.abs(laborCost) > 5e-3) {
      parts.push(manualCostPart({
        key: `maintenance:item:${itemIndex}:labor`,
        name: `${item.description || `Service Item ${itemIndex + 1}`} \u2014 Maintenance Labor`,
        type: "labor",
        subtype: "maintenance_labor",
        sourcePath: `items[${itemIndex}].labor_cost`,
        cost: laborCost,
        quantity: item.labor_hours || 1,
        unit: item.labor_hours ? "hour" : "job",
        builderData: { sign_type: item.sign_type, size: item.size, qty: item.qty, actions: item.actions || [], repaint_calc: item.repaint_calc },
        calculation: { labor_hours: item.labor_hours, labor_cost: laborCost, actions: item.actions || [] }
      }));
    }
  });
  (project.selected_equipment || []).forEach((eq, index) => {
    const id = eq.equipment_id || eq.inventory_item_id || "";
    const equipmentSource = maintenanceEquipmentSource(eq, catalogs);
    const equipmentEntity = equipmentSource.entity || eq.inventory_entity || (id ? "MaintenanceEquipment" : "");
    const duration = num2(eq.duration, 1);
    const baseCost = num2(eq.unit_cost) * duration;
    const deliveryCost = eq.include_delivery ? num2(eq.delivery_pickup_cost) : 0;
    const idleCost = eq.idle_cost == null ? num2(eq.idle_running_cost_per_hour) * num2(eq.idle_hours) : num2(eq.idle_cost);
    const reconstructed = baseCost + deliveryCost + idleCost;
    const authoritativeEquipment = eq.total_cost == null ? reconstructed : num2(eq.total_cost);
    if (Math.abs(baseCost) > 5e-3 || id) {
      parts.push(makePart({
        key: `maintenance:equipment:${index}:base`,
        name: eq.equipment_name || "Maintenance Equipment",
        type: "equipment",
        subtype: eq.equipment_type || "maintenance_equipment",
        sourcePath: `selected_equipment[${index}].equipment_id`,
        entity: id ? equipmentEntity : "",
        inventoryId: id,
        quantity: duration || 1,
        unit: eq.pricing_mode || "unit",
        unitCost: eq.unit_cost,
        extendedCost: baseCost,
        builderData: eq,
        calculation: { duration, unit_cost: eq.unit_cost, base_cost: baseCost },
        pricingBasis: { pricing_mode: eq.pricing_mode || "" }
      }));
    }
    if (Math.abs(deliveryCost) > 5e-3) {
      parts.push(makePart({
        key: `maintenance:equipment:${index}:delivery`,
        name: `${eq.equipment_name || "Equipment"} \u2014 Delivery / Pickup`,
        type: "service",
        subtype: "equipment_delivery",
        sourcePath: `selected_equipment[${index}].delivery_pickup_cost`,
        entity: id ? equipmentEntity : "",
        inventoryId: id,
        quantity: 1,
        unit: "delivery",
        unitCost: deliveryCost,
        extendedCost: deliveryCost,
        builderData: eq,
        calculation: { include_delivery: eq.include_delivery, delivery_pickup_cost: deliveryCost },
        pricingBasis: { pricing_mode: "delivery_pickup" }
      }));
    }
    if (Math.abs(idleCost) > 5e-3) {
      const idleHours = num2(eq.idle_hours, 1);
      parts.push(makePart({
        key: `maintenance:equipment:${index}:idle`,
        name: `${eq.equipment_name || "Equipment"} \u2014 Idle Running`,
        type: "equipment",
        subtype: "idle_running",
        sourcePath: `selected_equipment[${index}].idle_running_cost_per_hour`,
        entity: id ? equipmentEntity : "",
        inventoryId: id,
        quantity: idleHours || 1,
        unit: "hour",
        unitCost: idleHours ? idleCost / idleHours : idleCost,
        extendedCost: idleCost,
        builderData: eq,
        calculation: { idle_hours: eq.idle_hours, idle_running_cost_per_hour: eq.idle_running_cost_per_hour, idle_cost: idleCost },
        pricingBasis: { pricing_mode: "idle_running" }
      }));
    }
    const equipmentAdjustment = authoritativeEquipment - reconstructed;
    if (Math.abs(equipmentAdjustment) > 5e-3) {
      parts.push(manualCostPart({
        key: `maintenance:equipment:${index}:adjustment`,
        name: `${eq.equipment_name || "Equipment"} \u2014 Saved Cost Adjustment`,
        type: "equipment",
        subtype: "equipment_adjustment",
        sourcePath: `selected_equipment[${index}].total_cost`,
        cost: equipmentAdjustment,
        builderData: eq,
        calculation: { authoritative_total: authoritativeEquipment, reconstructed_total: reconstructed, adjustment: equipmentAdjustment }
      }));
    }
    represented.equipment += authoritativeEquipment;
  });
  (project.personnel || []).forEach((person, index) => {
    const cost = person.total_cost == null ? num2(person.hourly_rate) * num2(person.hours) : num2(person.total_cost);
    represented.personnel += cost;
    if (Math.abs(cost) <= 5e-3) return;
    parts.push(manualCostPart({
      key: `maintenance:personnel:${index}`,
      name: `${person.name || person.role || `Crew Member ${index + 1}`} \u2014 Personnel`,
      type: "labor",
      subtype: (person.role || "personnel").toLowerCase().replace(/\s+/g, "_"),
      sourcePath: `personnel[${index}].total_cost`,
      cost,
      quantity: person.hours || 1,
      unit: person.hours ? "hour" : "job",
      builderData: person,
      calculation: { hourly_rate: person.hourly_rate, hours: person.hours, total_cost: cost }
    }));
  });
  const totalSupplies = num2(project.total_supplies_cost);
  represented.supplies = totalSupplies;
  if (Math.abs(totalSupplies) > 5e-3) {
    parts.push(manualCostPart({
      key: "maintenance:supplies",
      name: "Maintenance Consumables / Supplies",
      type: "consumable",
      subtype: "maintenance_supplies",
      sourcePath: "total_supplies_cost",
      cost: totalSupplies,
      calculation: { supplies_percent_of_materials: project.supplies_percent_of_materials, extra_supplies_cost: project.extra_supplies_cost, total_materials_cost: project.total_materials_cost, total_supplies_cost: totalSupplies }
    }));
  }
  const totalTravel = num2(project.total_travel_cost);
  represented.travel = totalTravel;
  if (Math.abs(totalTravel) > 5e-3) {
    parts.push(manualCostPart({
      key: "maintenance:travel",
      name: "Travel / Mileage",
      type: "service",
      subtype: "travel",
      sourcePath: "total_travel_cost",
      cost: totalTravel,
      quantity: project.travel_miles_round_trip || 1,
      unit: project.travel_miles_round_trip ? "mile" : "job",
      calculation: { miles: project.travel_miles_round_trip, total_travel_cost: totalTravel, site_address: project.site_address }
    }));
  }
  const totalMarkup = num2(project.markup_amount);
  represented.markup = totalMarkup;
  if (Math.abs(totalMarkup) > 5e-3) {
    parts.push(manualCostPart({
      key: "maintenance:markup",
      name: "Builder Markup",
      type: "pricing",
      subtype: "markup",
      sourcePath: "markup_amount",
      cost: totalMarkup,
      calculation: { markup_percent: project.markup_percent, subtotal: project.subtotal, markup_amount: totalMarkup }
    }));
  }
  const authoritativeCategories = {
    labor: project.labor_cost == null ? represented.labor : num2(project.labor_cost),
    materials: project.total_materials_cost == null ? represented.materials : num2(project.total_materials_cost),
    equipment: project.total_equipment_cost == null ? represented.equipment : num2(project.total_equipment_cost),
    personnel: project.total_personnel_cost == null ? represented.personnel : num2(project.total_personnel_cost)
  };
  const categoryMeta = { labor: ["Labor", "labor"], materials: ["Materials", "material"], equipment: ["Equipment", "equipment"], personnel: ["Personnel", "labor"] };
  Object.keys(authoritativeCategories).forEach((key) => {
    const adjustment = authoritativeCategories[key] - represented[key];
    if (Math.abs(adjustment) <= 5e-3) return;
    parts.push(manualCostPart({
      key: `maintenance:${key}-adjustment`,
      name: `Maintenance ${categoryMeta[key][0]} Adjustment`,
      type: categoryMeta[key][1],
      subtype: `${key}_adjustment`,
      sourcePath: key === "labor" ? "labor_cost" : `total_${key}_cost`,
      cost: adjustment,
      calculation: { authoritative_total: authoritativeCategories[key], represented_total: represented[key], adjustment }
    }));
    represented[key] = authoritativeCategories[key];
  });
  const reconstructedTotal = Object.values(represented).reduce((sum, value) => sum + num2(value), 0);
  if (project.total_cost != null) {
    const finalAdjustment = num2(project.total_cost) - reconstructedTotal;
    if (Math.abs(finalAdjustment) > 5e-3) {
      parts.push(manualCostPart({
        key: "maintenance:project-total-adjustment",
        name: "Maintenance Saved Total Adjustment",
        type: "pricing",
        subtype: "project_total_adjustment",
        sourcePath: "total_cost",
        cost: finalAdjustment,
        calculation: { authoritative_total: project.total_cost, reconstructed_total: reconstructedTotal, adjustment: finalAdjustment }
      }));
    }
  }
  return parts;
}
function manualCostPart({ key, name, type = "labor", subtype = "", sourcePath = "", cost = 0, quantity = 1, unit = "job", builderData = {}, calculation = {} }) {
  const extended = num2(cost);
  const qty = Math.max(num2(quantity, 1), 1e-6);
  return makePart({
    key,
    name,
    type,
    subtype,
    sourcePath,
    quantity: qty,
    unit,
    unitCost: extended / qty,
    extendedCost: extended,
    builderData,
    calculation
  });
}
function foundationSavedSectionTotal(...candidates) {
  for (const value of candidates) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return null;
}
function foundationEquipmentBreakdown(entry, catalogs) {
  const equipmentRow = catalogs.FoundationInventory?.byId.get(entry.equipment_id);
  if (!equipmentRow) return { baseRental: num2(entry.equipment_cost), delivery: 0, attachmentCosts: [], subAttachmentCosts: [], total: num2(entry.equipment_cost) };
  const rentalPeriod = entry.rental_period || "day";
  const duration = entry.custom_qty !== void 0 && entry.custom_qty !== null ? num2(entry.custom_qty, 1) : num2(entry.rental_duration, 1);
  const rateFor = (row, override = void 0) => {
    if (override !== void 0 && override !== null) return num2(override) * duration;
    if (rentalPeriod === "day") return num2(row?.cost_per_day) * duration;
    if (rentalPeriod === "week") return num2(row?.cost_per_week) * duration;
    if (rentalPeriod === "month") return num2(row?.cost_per_month) * duration;
    return 0;
  };
  const attachmentQty = /* @__PURE__ */ new Map();
  if (entry.attachments?.length) {
    entry.attachments.forEach((attachment) => {
      const id = attachment.id || attachment.inventory_id || "";
      if (id) attachmentQty.set(id, num2(attachment.qty, 1));
    });
  } else if (entry.attachment_counts) {
    Object.entries(entry.attachment_counts).forEach(([id, qty]) => attachmentQty.set(id, num2(qty, 0)));
  } else if (entry.attachment_ids?.length) {
    entry.attachment_ids.forEach((id) => attachmentQty.set(id, 1));
  }
  const attachmentCosts = [...attachmentQty.entries()].map(([id, quantity]) => {
    const row = catalogs.FoundationInventory?.byId.get(id);
    return { id, row, quantity, cost: rateFor(row) * quantity, attachment: { id, qty: quantity } };
  }).filter((entry2) => entry2.quantity > 0);
  const subAttachmentCosts = Object.entries(entry.sub_attachment_counts || {}).map(([id, qty]) => {
    const quantity = num2(qty, 0);
    const row = catalogs.FoundationInventory?.byId.get(id);
    return { id, row, quantity, cost: rateFor(row) * quantity, attachment: { id, qty: quantity } };
  }).filter((entry2) => entry2.quantity > 0);
  const baseRental = rateFor(equipmentRow, entry.custom_rate);
  const delivery = entry.include_delivery ? entry.custom_delivery_charge !== void 0 && entry.custom_delivery_charge !== null ? num2(entry.custom_delivery_charge) : num2(equipmentRow.pickup_delivery_cost) : 0;
  const total = baseRental + delivery + attachmentCosts.reduce((sum, item) => sum + item.cost, 0) + subAttachmentCosts.reduce((sum, item) => sum + item.cost, 0);
  return { baseRental, delivery, attachmentCosts, subAttachmentCosts, total };
}
function extractFoundation(project, catalogs) {
  const parts = [];
  const rows = (v) => Array.isArray(v) ? v.filter((r) => r && typeof r === "object") : [];
  project = {
    ...project || {},
    items: rows(project?.items),
    walls: rows(project?.walls),
    poles: rows(project?.poles),
    wall_caps: rows(project?.wall_caps),
    selected_equipment: rows(project?.selected_equipment),
    signage_cabinets: rows(project?.signage_cabinets),
    project_concrete_admixtures: Array.isArray(project?.project_concrete_admixtures) ? project.project_concrete_admixtures : []
  };
  (project.items || []).forEach((item, index) => {
    const concreteId = item.selected_concrete_id || project.selected_concrete_id || "";
    if (concreteId) {
      const entity = findEntity(catalogs, concreteId, "FoundationInventory");
      const concreteRow = findRow(catalogs, entity, concreteId);
      if (concreteRow?.material_type === "bagged_concrete" || num2(item.concrete_cost) > 0) {
        const qty = item.concrete_bags || item.concrete_volume_cy || item.quantity || 1;
        parts.push(makePart({
          key: `foundation:item:${index}:concrete`,
          name: item.description ? `${item.description} \u2014 Concrete` : "Concrete",
          type: "material",
          subtype: concreteRow?.material_type || "concrete",
          sourcePath: `items[${index}].selected_concrete_id`,
          entity,
          inventoryId: concreteId,
          quantity: qty,
          unit: concreteRow?.material_type === "bagged_concrete" ? "bag" : "cy",
          unitCost: item.concrete_rate ?? item.custom_concrete_cost_per_cy,
          extendedCost: item.concrete_cost,
          builderData: item,
          calculation: { concrete_bags: item.concrete_bags, concrete_volume_cy: item.concrete_volume_cy, concrete_cost: item.concrete_cost },
          pricingBasis: { project_concrete_type: project.project_concrete_type, admixtures: project.project_concrete_admixtures }
        }));
      }
    }
    if (item.include_rebar) {
      const size = item.foundation_type === "pillar" ? item.pillar_rebar_size || "#4" : item.rebar_size || "#4";
      const rebarRow = catalogs.FoundationInventory?.rows.find(
        (row) => row.material_type === "rebar" && row.rebar_size === size
      );
      const rebarRate = num2(item.rebar_rate, num2(item.custom_rebar_cost_per_ft, genericUnitCost(rebarRow)));
      const rebarFeet = num2(item.rebar_feet);
      const totalRebarCost = num2(item.rebar_cost);
      const rebarMaterialCost = rebarFeet > 0 && rebarRate > 0 ? Math.min(totalRebarCost, rebarFeet * rebarRate) : totalRebarCost;
      const rebarLaborCost = Math.max(0, totalRebarCost - rebarMaterialCost);
      parts.push(makePart({
        key: `foundation:item:${index}:rebar`,
        name: `${size} Rebar`,
        type: "material",
        subtype: "rebar",
        sourcePath: `items[${index}].${item.foundation_type === "pillar" ? "pillar_rebar_size" : "rebar_size"}`,
        entity: "FoundationInventory",
        inventoryId: rebarRow?.id || "",
        quantity: rebarFeet || 1,
        unit: "ft",
        unitCost: rebarRate,
        extendedCost: rebarMaterialCost,
        builderData: item,
        calculation: { rebar_cost: totalRebarCost, rebar_material_cost: rebarMaterialCost, rebar_labor_cost: rebarLaborCost, rebar_feet: rebarFeet }
      }));
      if (rebarLaborCost > 5e-3) {
        parts.push(manualCostPart({
          key: `foundation:item:${index}:rebar-labor`,
          name: item.description ? `${item.description} \u2014 Rebar Labor` : "Rebar Labor",
          type: "labor",
          subtype: "rebar_labor",
          sourcePath: `items[${index}].rebar_cost`,
          cost: rebarLaborCost,
          builderData: item,
          calculation: { total_rebar_cost: totalRebarCost, material_cost: rebarMaterialCost, labor_cost: rebarLaborCost }
        }));
      }
    }
    if (item.include_forming) {
      const formingRow = item.selected_forming_id ? catalogs.FoundationInventory?.byId.get(item.selected_forming_id) : null;
      const formingQty = num2(item.forming_qty, 1);
      const formingRate = num2(item.forming_rate, num2(item.custom_forming_rate, genericUnitCost(formingRow)));
      const totalFormingCost = num2(item.forming_cost);
      const formingMaterialCost = item.selected_forming_id ? Math.min(totalFormingCost, formingQty * formingRate) : 0;
      const formingLaborCost = Math.max(0, totalFormingCost - formingMaterialCost);
      if (item.selected_forming_id) {
        parts.push(makePart({
          key: `foundation:item:${index}:forming`,
          name: item.description ? `${item.description} \u2014 Forming Material` : "Forming Material",
          type: "material",
          subtype: "forming",
          sourcePath: `items[${index}].selected_forming_id`,
          entity: "FoundationInventory",
          inventoryId: item.selected_forming_id,
          quantity: formingQty,
          unit: "piece",
          unitCost: formingRate,
          extendedCost: formingMaterialCost,
          builderData: item,
          calculation: { forming_cost: totalFormingCost, material_cost: formingMaterialCost, forming_qty: formingQty }
        }));
      }
      if (formingLaborCost > 5e-3) {
        parts.push(manualCostPart({
          key: `foundation:item:${index}:forming-labor`,
          name: item.description ? `${item.description} \u2014 Forming Labor / Allowance` : "Forming Labor / Allowance",
          type: "labor",
          subtype: "forming_labor",
          sourcePath: `items[${index}].forming_cost`,
          cost: formingLaborCost,
          builderData: item,
          calculation: { total_forming_cost: totalFormingCost, material_cost: formingMaterialCost, labor_allowance_cost: formingLaborCost }
        }));
      }
    }
    if (num2(item.excavation_cost) > 5e-3) {
      parts.push(manualCostPart({
        key: `foundation:item:${index}:excavation`,
        name: item.description ? `${item.description} \u2014 Excavation` : "Excavation Labor",
        type: "labor",
        subtype: item.excavation_method || "excavation",
        sourcePath: `items[${index}].excavation_cost`,
        cost: item.excavation_cost,
        quantity: item.excavation_hours || 1,
        unit: item.excavation_hours ? "hour" : "job",
        builderData: item,
        calculation: { hours: item.excavation_hours, rate: item.excavation_rate, cost: item.excavation_cost }
      }));
    }
    if (num2(item.pouring_cost) > 5e-3) {
      parts.push(manualCostPart({
        key: `foundation:item:${index}:pouring`,
        name: item.description ? `${item.description} \u2014 Concrete Pour Labor` : "Concrete Pour Labor",
        type: "labor",
        subtype: "concrete_pouring",
        sourcePath: `items[${index}].pouring_cost`,
        cost: item.pouring_cost,
        quantity: item.concrete_volume_cy || 1,
        unit: "cy",
        builderData: item,
        calculation: { concrete_volume_cy: item.concrete_volume_cy, cost: item.pouring_cost }
      }));
    }
    if (num2(item.finishing_cost) > 5e-3) {
      parts.push(manualCostPart({
        key: `foundation:item:${index}:finishing`,
        name: item.description ? `${item.description} \u2014 Concrete Finishing` : "Concrete Finishing Labor",
        type: "labor",
        subtype: "concrete_finishing",
        sourcePath: `items[${index}].finishing_cost`,
        cost: item.finishing_cost,
        quantity: item.finishing_hours || 1,
        unit: item.finishing_hours ? "hour" : "job",
        builderData: item,
        calculation: { hours: item.finishing_hours, rate: item.finishing_rate, cost: item.finishing_cost }
      }));
    }
  });
  const delivery = project.builder_calculation?.delivery || {};
  const itemConcreteCost = (project.items || []).reduce((sum, item) => sum + num2(item.concrete_cost), 0);
  const fallbackDeliveryCost = Math.max(0, num2(project.total_concrete_cost) - itemConcreteCost);
  const deliveryCost = num2(delivery.concreteTotal, fallbackDeliveryCost);
  if (deliveryCost > 5e-3) {
    const concreteServiceItem = (project.items || []).find((item) => {
      const id = item.selected_concrete_id || project.selected_concrete_id || "";
      const row = findRow(catalogs, findEntity(catalogs, id, "LaborServiceInventory"), id);
      return row?.material_type === "concrete_service" || row?.service_category === "concrete_service";
    });
    const concreteId = concreteServiceItem?.selected_concrete_id || project.selected_concrete_id || "";
    const entity = findEntity(catalogs, concreteId, "LaborServiceInventory");
    const hasDetailedDelivery = Array.isArray(delivery.trucksList) && delivery.trucksList.length > 0;
    if (hasDetailedDelivery) {
      const roundedYards = num2(delivery.roundedYards, 0);
      const selectedMix = (delivery.availableMixes || []).find((mix) => mix.id === project.project_concrete_type) || (delivery.availableMixes || []).find((mix) => mix.id === "4000_ae");
      const mixPrice = num2(selectedMix?.price, num2(delivery.ratePerYard));
      const mixCost = roundedYards * mixPrice;
      let representedDelivery = 0;
      if (mixCost > 5e-3) {
        parts.push(makePart({
          key: "foundation:concrete-delivery:mix",
          name: `Ready-Mix Concrete \u2014 ${selectedMix?.name || project.project_concrete_type || "Mix"}`,
          type: "material",
          subtype: "ready_mix_concrete",
          sourcePath: "builder_calculation.delivery.availableMixes",
          entity,
          inventoryId: concreteId,
          quantity: roundedYards,
          unit: "cy",
          unitCost: mixPrice,
          extendedCost: mixCost,
          builderData: { project_concrete_type: project.project_concrete_type },
          calculation: { rounded_yards: roundedYards, mix_price: mixPrice, mix_cost: mixCost },
          pricingBasis: { pricing_mode: "concrete_mix", mix: project.project_concrete_type }
        }));
        representedDelivery += mixCost;
      }
      (project.project_concrete_admixtures || []).forEach((admixId) => {
        const admix = (delivery.availableAdmixes || []).find((candidate) => candidate.id === admixId);
        const rate = num2(admix?.price);
        const cost = roundedYards * rate;
        if (cost <= 5e-3) return;
        parts.push(makePart({
          key: `foundation:concrete-delivery:admix:${admixId}`,
          name: `Concrete Admixture \u2014 ${admix?.name || admixId}`,
          type: "material",
          subtype: "concrete_admixture",
          sourcePath: "project_concrete_admixtures",
          entity,
          inventoryId: concreteId,
          quantity: roundedYards,
          unit: "cy",
          unitCost: rate,
          extendedCost: cost,
          builderData: { admixture_id: admixId },
          calculation: { rounded_yards: roundedYards, rate, cost },
          pricingBasis: { pricing_mode: "concrete_admixture", admixture: admixId }
        }));
        representedDelivery += cost;
      });
      (delivery.trucksList || []).forEach((truck, truckIndex) => {
        const smallLoadFee = num2(truck.smallOrderFee);
        if (smallLoadFee > 5e-3) {
          parts.push(makePart({
            key: `foundation:concrete-delivery:truck:${truckIndex}:small-load`,
            name: `Concrete Truck ${truckIndex + 1} \u2014 Small Load Fee`,
            type: "service",
            subtype: "concrete_small_load_fee",
            sourcePath: `builder_calculation.delivery.trucksList[${truckIndex}].smallOrderFee`,
            entity,
            inventoryId: concreteId,
            quantity: 1,
            unit: "truck",
            unitCost: smallLoadFee,
            extendedCost: smallLoadFee,
            builderData: truck,
            calculation: truck,
            pricingBasis: { pricing_mode: "small_load_fee", rounded_yards: truck.roundedYards }
          }));
          representedDelivery += smallLoadFee;
        }
        const fuelFee = num2(truck.fuelFee);
        if (fuelFee > 5e-3) {
          parts.push(makePart({
            key: `foundation:concrete-delivery:truck:${truckIndex}:fuel`,
            name: `Concrete Truck ${truckIndex + 1} \u2014 Fuel Surcharge`,
            type: "service",
            subtype: "concrete_fuel_surcharge",
            sourcePath: `builder_calculation.delivery.trucksList[${truckIndex}].fuelFee`,
            entity,
            inventoryId: concreteId,
            quantity: 1,
            unit: "truck",
            unitCost: fuelFee,
            extendedCost: fuelFee,
            builderData: truck,
            calculation: truck,
            pricingBasis: { pricing_mode: "fuel_surcharge" }
          }));
          representedDelivery += fuelFee;
        }
      });
      const additionalStopsCost = num2(delivery.additionalStopsCost);
      if (additionalStopsCost > 5e-3) {
        const stopCount = Math.max(1, Math.round(additionalStopsCost / 100));
        parts.push(manualCostPart({
          key: "foundation:concrete-delivery:additional-stops",
          name: "Additional Sign Locations / Concrete Stops",
          type: "service",
          subtype: "additional_concrete_stop",
          sourcePath: "builder_calculation.delivery.additionalStopsCost",
          cost: additionalStopsCost,
          quantity: stopCount,
          unit: "stop",
          builderData: { stop_count: stopCount },
          calculation: { additional_stops_cost: additionalStopsCost, stop_count: stopCount }
        }));
        representedDelivery += additionalStopsCost;
      }
      const deliveryResidual = deliveryCost - representedDelivery;
      if (Math.abs(deliveryResidual) > 5e-3) {
        parts.push(manualCostPart({
          key: "foundation:concrete-delivery:reconciliation",
          name: "Ready-Mix Delivery Reconciliation",
          type: "service",
          subtype: "delivery_reconciliation",
          sourcePath: "builder_calculation.delivery.concreteTotal",
          cost: deliveryResidual,
          builderData: { project_concrete_type: project.project_concrete_type, admixtures: project.project_concrete_admixtures || [] },
          calculation: { authoritative_total: deliveryCost, represented_total: representedDelivery }
        }));
      }
    } else {
      parts.push(makePart({
        key: "foundation:concrete-delivery",
        name: "Ready-Mix Concrete Delivery",
        type: "material",
        subtype: "ready_mix_concrete",
        sourcePath: "total_concrete_cost",
        entity,
        inventoryId: concreteId,
        quantity: delivery.roundedYards || 1,
        unit: "cy",
        unitCost: delivery.ratePerYard,
        extendedCost: deliveryCost,
        builderData: { project_concrete_type: project.project_concrete_type, admixtures: project.project_concrete_admixtures || [] },
        calculation: delivery,
        pricingBasis: { pricing_mode: "legacy_delivery_aggregate", mix: project.project_concrete_type, admixtures: project.project_concrete_admixtures || [] }
      }));
    }
  }
  (project.walls || []).forEach((wall, index) => {
    if (wall.materialId) {
      parts.push(makePart({
        key: `foundation:wall:${index}:outer`,
        name: wall.name ? `${wall.name} \u2014 Outer wall` : "Wall material",
        type: "material",
        subtype: "wall_material",
        sourcePath: `walls[${index}].materialId`,
        entity: "FoundationInventory",
        inventoryId: wall.materialId,
        quantity: wall.calculatedCosts?.totalBricks || 1,
        unit: "unit",
        extendedCost: wall.calculatedCosts?.materialCost,
        builderData: wall,
        calculation: wall.calculatedCosts || {}
      }));
    }
    if (wall.internalMaterialId) {
      parts.push(makePart({
        key: `foundation:wall:${index}:internal`,
        name: wall.name ? `${wall.name} \u2014 Internal wall` : "Internal wall material",
        type: "material",
        subtype: "wall_fill",
        sourcePath: `walls[${index}].internalMaterialId`,
        entity: "FoundationInventory",
        inventoryId: wall.internalMaterialId,
        quantity: wall.calculatedCosts?.internalTotalBricks || 1,
        unit: "unit",
        extendedCost: wall.calculatedCosts?.internalMaterialCost,
        builderData: wall,
        calculation: wall.calculatedCosts || {}
      }));
    }
    if (num2(wall.calculatedCosts?.mortarCost) > 5e-3) {
      parts.push(manualCostPart({
        key: `foundation:wall:${index}:mortar`,
        name: wall.name ? `${wall.name} \u2014 Mortar` : "Wall Mortar",
        type: "consumable",
        subtype: "mortar",
        sourcePath: `walls[${index}].calculatedCosts.mortarCost`,
        cost: wall.calculatedCosts.mortarCost,
        builderData: wall,
        calculation: wall.calculatedCosts
      }));
    }
    if (num2(wall.calculatedCosts?.laborCost) > 5e-3) {
      parts.push(manualCostPart({
        key: `foundation:wall:${index}:labor`,
        name: wall.name ? `${wall.name} \u2014 Masonry Labor` : "Masonry Labor",
        type: "labor",
        subtype: "masonry_labor",
        sourcePath: `walls[${index}].calculatedCosts.laborCost`,
        cost: wall.calculatedCosts.laborCost,
        quantity: wall.calculatedCosts.laborHours || 1,
        unit: wall.calculatedCosts.laborHours ? "hour" : "job",
        builderData: wall,
        calculation: wall.calculatedCosts
      }));
    }
    if (num2(wall.calculatedCosts?.internalMortarCost) > 5e-3) {
      parts.push(manualCostPart({
        key: `foundation:wall:${index}:internal-mortar`,
        name: wall.name ? `${wall.name} \u2014 Internal Mortar` : "Internal Wall Mortar",
        type: "consumable",
        subtype: "mortar",
        sourcePath: `walls[${index}].calculatedCosts.internalMortarCost`,
        cost: wall.calculatedCosts.internalMortarCost,
        builderData: wall,
        calculation: wall.calculatedCosts
      }));
    }
    if (num2(wall.calculatedCosts?.internalLaborCost) > 5e-3) {
      parts.push(manualCostPart({
        key: `foundation:wall:${index}:internal-labor`,
        name: wall.name ? `${wall.name} \u2014 Internal Masonry Labor` : "Internal Masonry Labor",
        type: "labor",
        subtype: "masonry_labor",
        sourcePath: `walls[${index}].calculatedCosts.internalLaborCost`,
        cost: wall.calculatedCosts.internalLaborCost,
        quantity: wall.calculatedCosts.internalLaborHours || 1,
        unit: wall.calculatedCosts.internalLaborHours ? "hour" : "job",
        builderData: wall,
        calculation: wall.calculatedCosts
      }));
    }
  });
  (project.poles || []).forEach((pole, index) => {
    if (!pole.pole_id) return;
    const row = catalogs.FoundationInventory?.byId.get(pole.pole_id);
    const totalPoleInches = num2(pole.height_inches) + num2(pole.y_offset_inches);
    const poleQtyFt = totalPoleInches / 12 || 1;
    const isStock = row?.pole_pricing_mode === "stock_price";
    const stockLengthFt = num2(row?.pole_stock_length_ft, 20);
    const stockPieces = isStock ? Math.max(1, Math.ceil(totalPoleInches / Math.max(stockLengthFt * 12, 1))) : null;
    const partQty = isStock ? stockPieces : poleQtyFt;
    const partUnitCost = isStock ? num2(pole.custom_cost_per_unit, num2(row?.pole_stock_price)) : num2(pole.custom_cost_per_unit, num2(row?.cost_per_unit));
    parts.push(makePart({
      key: `foundation:pole:${index}`,
      name: pole.pole_name || row?.material_name || "Sign Pole",
      type: "material",
      subtype: "pole",
      sourcePath: `poles[${index}].pole_id`,
      entity: "FoundationInventory",
      inventoryId: pole.pole_id,
      quantity: partQty,
      unit: isStock ? "stock_piece" : "ft",
      unitCost: partUnitCost,
      extendedCost: pole.pole_cost,
      builderData: pole,
      calculation: { ...pole, stock_pieces: stockPieces, total_pole_inches: totalPoleInches },
      pricingBasis: { pricing_mode: isStock ? "stock_price" : "per_foot", stock_length_ft: stockLengthFt }
    }));
    if (num2(pole.pole_painting_cost) > 5e-3) {
      parts.push(manualCostPart({
        key: `foundation:pole:${index}:painting`,
        name: `${pole.pole_name || row?.material_name || "Sign Pole"} \u2014 Painting`,
        type: "labor",
        subtype: "pole_painting",
        sourcePath: `poles[${index}].pole_painting_cost`,
        cost: pole.pole_painting_cost,
        quantity: poleQtyFt,
        unit: "ft",
        builderData: pole,
        calculation: pole
      }));
    }
  });
  (project.wall_caps || []).forEach((cap, index) => {
    if (!cap.cap_inventory_id) return;
    parts.push(makePart({
      key: `foundation:cap:${cap.id || index}`,
      name: "Wall cap",
      type: "material",
      subtype: "wall_cap",
      sourcePath: `wall_caps[${index}].cap_inventory_id`,
      entity: "FoundationInventory",
      inventoryId: cap.cap_inventory_id,
      quantity: 1,
      unit: "stock_piece",
      unitCost: cap.cost,
      extendedCost: cap.cost,
      builderData: cap,
      calculation: cap
    }));
  });
  (project.selected_equipment || []).forEach((eq, index) => {
    const breakdown = foundationEquipmentBreakdown(eq, catalogs);
    const equipmentRow = eq.equipment_id ? catalogs.FoundationInventory?.byId.get(eq.equipment_id) : null;
    const qty = eq.custom_qty ?? eq.rental_duration ?? 1;
    if (eq.equipment_id) {
      parts.push(makePart({
        key: `foundation:equipment:${index}`,
        name: equipmentRow?.material_name || "Foundation Equipment",
        type: "equipment",
        subtype: "excavation_equipment",
        sourcePath: `selected_equipment[${index}].equipment_id`,
        entity: "FoundationInventory",
        inventoryId: eq.equipment_id,
        quantity: qty,
        unit: eq.rental_period || "day",
        unitCost: num2(breakdown.baseRental) / Math.max(num2(qty, 1), 1),
        extendedCost: breakdown.baseRental,
        builderData: eq,
        calculation: { ...eq, equipment_total_with_attachments: eq.equipment_cost, base_equipment_cost: breakdown.baseRental },
        pricingBasis: { pricing_mode: `per_${eq.rental_period || "day"}` }
      }));
    }
    if (eq.equipment_id && Math.abs(num2(breakdown.delivery)) > 5e-3) {
      parts.push(makePart({
        key: `foundation:equipment:${index}:delivery`,
        name: `${equipmentRow?.material_name || "Foundation Equipment"} \u2014 Delivery / Pickup`,
        type: "service",
        subtype: "equipment_delivery",
        sourcePath: `selected_equipment[${index}].include_delivery`,
        entity: "FoundationInventory",
        inventoryId: eq.equipment_id,
        quantity: 1,
        unit: "delivery",
        unitCost: breakdown.delivery,
        extendedCost: breakdown.delivery,
        builderData: eq,
        calculation: { include_delivery: eq.include_delivery, delivery_cost: breakdown.delivery },
        pricingBasis: { pricing_mode: "pickup_delivery" }
      }));
    }
    breakdown.attachmentCosts.forEach((entry) => {
      if (!entry.id) return;
      parts.push(makePart({
        key: `foundation:equipment:${index}:attachment:${entry.id}`,
        name: entry.row?.material_name || "Equipment Attachment",
        type: "equipment",
        subtype: entry.row?.material_type || "attachment",
        sourcePath: `selected_equipment[${index}].attachment_counts.${entry.id}`,
        entity: "FoundationInventory",
        inventoryId: entry.id,
        quantity: entry.quantity * Math.max(num2(qty, 1), 1),
        unit: eq.rental_period || "day",
        unitCost: entry.quantity * Math.max(num2(qty, 1), 1) ? entry.cost / (entry.quantity * Math.max(num2(qty, 1), 1)) : entry.cost,
        extendedCost: entry.cost,
        builderData: entry.attachment,
        calculation: { rental_period: eq.rental_period, rental_duration: eq.rental_duration, attachment_quantity: entry.quantity, total_cost: entry.cost },
        pricingBasis: { pricing_mode: `per_${eq.rental_period || "day"}` }
      }));
    });
    breakdown.subAttachmentCosts.forEach((entry) => {
      if (!entry.id) return;
      parts.push(makePart({
        key: `foundation:equipment:${index}:sub-attachment:${entry.id}`,
        name: entry.row?.material_name || "Equipment Sub-Attachment",
        type: "equipment",
        subtype: entry.row?.material_type || "sub_attachment",
        sourcePath: `selected_equipment[${index}].sub_attachment_counts.${entry.id}`,
        entity: "FoundationInventory",
        inventoryId: entry.id,
        quantity: entry.quantity * Math.max(num2(qty, 1), 1),
        unit: eq.rental_period || "day",
        unitCost: entry.quantity * Math.max(num2(qty, 1), 1) ? entry.cost / (entry.quantity * Math.max(num2(qty, 1), 1)) : entry.cost,
        extendedCost: entry.cost,
        builderData: entry.attachment,
        calculation: { rental_period: eq.rental_period, rental_duration: eq.rental_duration, attachment_quantity: entry.quantity, total_cost: entry.cost },
        pricingBasis: { pricing_mode: `per_${eq.rental_period || "day"}` }
      }));
    });
    const representedEquipment = num2(breakdown.total);
    if (eq.equipment_cost != null && Math.abs(num2(eq.equipment_cost) - representedEquipment) > 5e-3) {
      parts.push(manualCostPart({
        key: `foundation:equipment:${index}:saved-adjustment`,
        name: `${equipmentRow?.material_name || "Foundation Equipment"} \u2014 Saved Cost Adjustment`,
        type: "equipment",
        subtype: "equipment_adjustment",
        sourcePath: `selected_equipment[${index}].equipment_cost`,
        cost: num2(eq.equipment_cost) - representedEquipment,
        builderData: eq,
        calculation: { authoritative_total: eq.equipment_cost, reconstructed_total: representedEquipment }
      }));
    }
  });
  const cabinetSavedTotal = foundationSavedSectionTotal(
    project.builder_calculation?.cabinet_cost,
    project.builder_calculation?.totals?.total_signage_cabinet_cost,
    project.total_signage_cabinet_cost
  );
  let representedCabinets = 0;
  calcSignageCabinetPricing(project.signage_cabinets).forEach((row, index) => {
    if (!row.available) return;
    const cabinet = row.pricedEntry;
    const quantity = cabinet.quantity === void 0 || cabinet.quantity === null || cabinet.quantity === "" ? 1 : num2(cabinet.quantity, 1);
    parts.push(makePart({
      key: `foundation:cabinet:${cabinet.id || index}`,
      name: cabinet.description || "Signage Cabinet",
      type: "fabrication",
      subtype: "signage_cabinet",
      sourcePath: `signage_cabinets[${index}]`,
      quantity,
      unit: "each",
      unitCost: cabinet.unit_cost,
      extendedCost: row.cost,
      builderData: cabinet,
      calculation: { ...cabinet, pricing_available: true, line_cost: row.cost },
      pricingBasis: { pricing_mode: "cabinet_unit_cost" }
    }));
    representedCabinets += num2(row.cost);
  });
  if (cabinetSavedTotal !== null && Math.abs(cabinetSavedTotal - representedCabinets) > 5e-3) {
    parts.push(manualCostPart({
      key: "foundation:cabinet:saved-adjustment",
      name: "Signage Cabinets \u2014 Saved Cost Adjustment",
      type: "fabrication",
      subtype: "signage_cabinet_adjustment",
      sourcePath: "total_signage_cabinet_cost",
      cost: cabinetSavedTotal - representedCabinets,
      builderData: { signage_cabinets: project.signage_cabinets || [] },
      calculation: { authoritative_total: cabinetSavedTotal, reconstructed_total: representedCabinets }
    }));
  }
  const landscapeSavedTotal = foundationSavedSectionTotal(
    project.builder_calculation?.landscape_cost,
    project.builder_calculation?.totals?.total_landscape_cost,
    project.total_landscape_cost
  );
  const landscapeCalc = landscapeSummary(project.landscape);
  let representedLandscape = 0;
  landscapeCalc.lines.forEach((line) => {
    if (line.cost === null || line.sqft === null) return;
    parts.push(makePart({
      key: `foundation:landscape:${line.key}`,
      name: `Site Material \u2014 ${line.label}`,
      type: "material",
      subtype: "landscape",
      sourcePath: "landscape.cells",
      quantity: line.sqft,
      unit: "sq_ft",
      unitCost: line.cost / line.sqft,
      extendedCost: line.cost,
      builderData: { material_key: line.key, cells: line.cells, cell_size_inches: project.landscape?.cell_size_inches },
      calculation: { cells: line.cells, sqft: line.sqft, cost: line.cost },
      pricingBasis: { pricing_mode: "landscape_material_sqft" }
    }));
    representedLandscape += line.cost;
  });
  if (landscapeSavedTotal !== null && Math.abs(landscapeSavedTotal - representedLandscape) > 5e-3) {
    parts.push(manualCostPart({
      key: "foundation:landscape:saved-adjustment",
      name: "Landscape Materials \u2014 Saved Cost Adjustment",
      type: "material",
      subtype: "landscape_adjustment",
      sourcePath: "total_landscape_cost",
      cost: landscapeSavedTotal - representedLandscape,
      builderData: project.landscape || {},
      calculation: { authoritative_total: landscapeSavedTotal, reconstructed_total: representedLandscape }
    }));
  }
  return parts;
}
function extractPainting(project) {
  const parts = [];
  let itemMaskTotal = 0;
  let itemPaintTotal = 0;
  let itemLaborTotal = 0;
  (project.items || []).forEach((item, index) => {
    const label = item.description || (item.item_type === "lettering" ? "Painted Lettering" : item.item_type === "complex_shapes" ? "Painted Complex Shape" : "Painted Panel");
    const quantity = item.item_type === "lettering" ? 1 : item.quantity || 1;
    const maskCost = num2(item.supplies_cost);
    const paintCost = num2(item.paint_cost);
    const laborCost = num2(item.labor_cost);
    itemMaskTotal += maskCost;
    itemPaintTotal += paintCost;
    itemLaborTotal += laborCost;
    if (Math.abs(maskCost) > 5e-3) {
      parts.push(manualCostPart({
        key: `painting:item:${index}:mask`,
        name: `${label} \u2014 Paint Mask`,
        type: "consumable",
        subtype: "paint_mask",
        sourcePath: `items[${index}].supplies_cost`,
        cost: maskCost,
        quantity,
        unit: quantity > 1 ? "each" : "job",
        builderData: item,
        calculation: { paint_mask_sqft: item.paint_mask_sqft, paint_colors: item.paint_colors, supplies_cost: maskCost }
      }));
    }
    if (Math.abs(paintCost) > 5e-3) {
      parts.push(manualCostPart({
        key: `painting:item:${index}:paint`,
        name: `${label} \u2014 Paint & Supplies`,
        type: "material",
        subtype: "liquid_paint_supplies",
        sourcePath: `items[${index}].paint_cost`,
        cost: paintCost,
        quantity,
        unit: quantity > 1 ? "each" : "job",
        builderData: item,
        calculation: { paintable_sqft: item.paintable_sqft, paint_gallons: item.paint_gallons, paint_colors: item.paint_colors, paint_cost: paintCost }
      }));
    }
    if (Math.abs(laborCost) > 5e-3) {
      parts.push(manualCostPart({
        key: `painting:item:${index}:labor`,
        name: `${label} \u2014 Painting Labor`,
        type: "labor",
        subtype: "painting_labor",
        sourcePath: `items[${index}].labor_cost`,
        cost: laborCost,
        quantity: item.labor_hours || 1,
        unit: item.labor_hours ? "hour" : "job",
        builderData: item,
        calculation: { labor_hours: item.labor_hours, labor_cost: laborCost }
      }));
    }
  });
  const authoritativeMaterialTotal = num2(project.total_paint_mask_cost) + num2(project.total_liquid_paint_and_supplies_cost);
  const materialAdjustment = authoritativeMaterialTotal - itemMaskTotal - itemPaintTotal;
  if (Math.abs(materialAdjustment) > 5e-3) {
    parts.push(manualCostPart({
      key: "painting:material-adjustment",
      name: materialAdjustment > 0 ? "Painting Minimum / Fixed Materials" : "Painting Materials Adjustment",
      type: "material",
      subtype: "paint_material_adjustment",
      sourcePath: "total_liquid_paint_and_supplies_cost",
      cost: materialAdjustment,
      calculation: {
        authoritative_material_total: authoritativeMaterialTotal,
        item_mask_total: itemMaskTotal,
        item_paint_total: itemPaintTotal,
        adjustment: materialAdjustment
      }
    }));
  }
  const authoritativeLaborTotal = num2(project.total_labor_cost);
  const laborAdjustment = authoritativeLaborTotal - itemLaborTotal;
  if (Math.abs(laborAdjustment) > 5e-3) {
    parts.push(manualCostPart({
      key: "painting:fixed-labor-adjustment",
      name: laborAdjustment > 0 ? "Painting Setup / Mixing / Minimum Labor" : "Painting Labor Adjustment",
      type: "labor",
      subtype: "painting_fixed_labor",
      sourcePath: "total_labor_cost",
      cost: laborAdjustment,
      calculation: {
        authoritative_labor_total: authoritativeLaborTotal,
        item_labor_total: itemLaborTotal,
        adjustment: laborAdjustment
      }
    }));
  }
  return parts;
}
function extractCNC(project) {
  const parts = [];
  (project.items || []).forEach((item, index) => {
    if (num2(item.machine_cost) > 5e-3) {
      parts.push(manualCostPart({
        key: `cnc:item:${index}:machine`,
        name: item.description ? `${item.description} \u2014 CNC Machine Time` : "CNC Machine Time",
        type: "equipment",
        subtype: "cnc_machine_time",
        sourcePath: `items[${index}].machine_cost`,
        cost: item.machine_cost,
        quantity: item.machine_time_hours || 1,
        unit: item.machine_time_hours ? "hour" : "job",
        builderData: item,
        calculation: { machine_time_hours: item.machine_time_hours, machine_cost: item.machine_cost, rate: project.machine_rate_per_hour }
      }));
    }
    if (num2(item.labor_cost) > 5e-3) {
      parts.push(manualCostPart({
        key: `cnc:item:${index}:labor`,
        name: item.description ? `${item.description} \u2014 CNC Setup / Handling Labor` : "CNC Setup / Handling Labor",
        type: "labor",
        subtype: "cnc_setup_labor",
        sourcePath: `items[${index}].labor_cost`,
        cost: item.labor_cost,
        quantity: item.setup_time_hours || 1,
        unit: item.setup_time_hours ? "hour" : "job",
        builderData: item,
        calculation: { setup_time_hours: item.setup_time_hours, labor_cost: item.labor_cost, rate: project.labor_rate, hold_down: item.hold_down }
      }));
    }
  });
  const dynamicItemLabor = (project.items || []).reduce((sum, item) => sum + num2(item.labor_cost), 0);
  const fixedSetupCost = num2(
    project.builder_calculation?.totals?.fixed_setup_cost,
    num2(project.fixed_setup_hours) * num2(project.labor_rate)
  );
  if (fixedSetupCost > 5e-3) {
    parts.push(manualCostPart({
      key: "cnc:fixed-setup",
      name: "CNC Fixed Setup Labor",
      type: "labor",
      subtype: "fixed_setup",
      sourcePath: "fixed_setup_hours",
      cost: fixedSetupCost,
      quantity: project.fixed_setup_hours || 1,
      unit: project.fixed_setup_hours ? "hour" : "job",
      calculation: { fixed_setup_hours: project.fixed_setup_hours, labor_rate: project.labor_rate, cost: fixedSetupCost }
    }));
  }
  const authoritativeLaborTotal = num2(
    project.total_labor_cost,
    num2(project.builder_calculation?.totals?.total_labor_cost, dynamicItemLabor + fixedSetupCost)
  );
  const minimumLaborAdjustment = authoritativeLaborTotal - dynamicItemLabor - fixedSetupCost;
  if (Math.abs(minimumLaborAdjustment) > 5e-3) {
    parts.push(manualCostPart({
      key: "cnc:minimum-dynamic-labor-adjustment",
      name: minimumLaborAdjustment > 0 ? "CNC Minimum Dynamic Labor" : "CNC Labor Adjustment",
      type: "labor",
      subtype: "minimum_dynamic_labor",
      sourcePath: "total_labor_cost",
      cost: minimumLaborAdjustment,
      quantity: 1,
      unit: "job",
      calculation: {
        total_labor_cost: authoritativeLaborTotal,
        item_labor_cost: dynamicItemLabor,
        fixed_setup_cost: fixedSetupCost,
        minimum_dynamic_labor_adjustment: minimumLaborAdjustment
      }
    }));
  }
  return parts;
}
function extractLaser(project) {
  const parts = [];
  let itemMachineTotal = 0;
  let itemLaborTotal = 0;
  (project.items || []).forEach((item, index) => {
    itemMachineTotal += num2(item.machine_cost);
    itemLaborTotal += num2(item.labor_cost);
    if (num2(item.machine_cost) > 5e-3) {
      parts.push(manualCostPart({
        key: `laser:item:${index}:machine`,
        name: item.description ? `${item.description} \u2014 Laser Machine Time` : "Laser Machine Time",
        type: "equipment",
        subtype: "laser_machine_time",
        sourcePath: `items[${index}].machine_cost`,
        cost: item.machine_cost,
        quantity: item.machine_time_hours || 1,
        unit: item.machine_time_hours ? "hour" : "job",
        builderData: item,
        calculation: { engrave_hours: item.engrave_hours, cut_hours: item.cut_hours, machine_time_hours: item.machine_time_hours, machine_cost: item.machine_cost }
      }));
    }
    if (num2(item.labor_cost) > 5e-3) {
      parts.push(manualCostPart({
        key: `laser:item:${index}:labor`,
        name: item.description ? `${item.description} \u2014 Laser Handling Labor` : "Laser Handling Labor",
        type: "labor",
        subtype: "laser_handling_labor",
        sourcePath: `items[${index}].labor_cost`,
        cost: item.labor_cost,
        quantity: item.handling_time_hours || 1,
        unit: item.handling_time_hours ? "hour" : "job",
        builderData: item,
        calculation: { handling_time_hours: item.handling_time_hours, labor_cost: item.labor_cost }
      }));
    }
  });
  const fixedSetupCost = num2(
    project.builder_calculation?.totals?.fixed_setup_cost,
    num2(project.fixed_setup_hours) * num2(project.labor_rate)
  );
  if (fixedSetupCost > 5e-3) {
    parts.push(manualCostPart({
      key: "laser:fixed-setup",
      name: "Laser Fixed Setup Labor",
      type: "labor",
      subtype: "fixed_setup",
      sourcePath: "fixed_setup_hours",
      cost: fixedSetupCost,
      quantity: project.fixed_setup_hours || 1,
      unit: project.fixed_setup_hours ? "hour" : "job",
      calculation: { fixed_setup_hours: project.fixed_setup_hours, labor_rate: project.labor_rate, cost: fixedSetupCost }
    }));
  }
  const authoritativeMachineTotal = num2(
    project.total_machine_cost,
    num2(project.builder_calculation?.totals?.total_machine_cost, itemMachineTotal)
  );
  const machineAdjustment = authoritativeMachineTotal - itemMachineTotal;
  if (Math.abs(machineAdjustment) > 5e-3) {
    parts.push(manualCostPart({
      key: "laser:machine-adjustment",
      name: "Laser Machine Cost Adjustment",
      type: "equipment",
      subtype: "machine_adjustment",
      sourcePath: "total_machine_cost",
      cost: machineAdjustment,
      calculation: { total_machine_cost: authoritativeMachineTotal, item_machine_cost: itemMachineTotal, adjustment: machineAdjustment }
    }));
  }
  const authoritativeLaborTotal = num2(
    project.total_labor_cost,
    num2(project.builder_calculation?.totals?.total_labor_cost, itemLaborTotal + fixedSetupCost)
  );
  const laborAdjustment = authoritativeLaborTotal - itemLaborTotal - fixedSetupCost;
  if (Math.abs(laborAdjustment) > 5e-3) {
    parts.push(manualCostPart({
      key: "laser:labor-adjustment",
      name: "Laser Labor Adjustment",
      type: "labor",
      subtype: "labor_adjustment",
      sourcePath: "total_labor_cost",
      cost: laborAdjustment,
      calculation: { total_labor_cost: authoritativeLaborTotal, item_labor_cost: itemLaborTotal, fixed_setup_cost: fixedSetupCost, adjustment: laborAdjustment }
    }));
  }
  const authoritativeSupplies = num2(
    project.total_supplies_cost,
    num2(project.fixed_material_setup_cost, project.builder_calculation?.totals?.total_supplies_cost)
  );
  if (Math.abs(authoritativeSupplies) > 5e-3) {
    parts.push(manualCostPart({
      key: "laser:fixed-material-setup",
      name: "Laser Material Setup / Consumables",
      type: "consumable",
      subtype: "material_setup",
      sourcePath: "total_supplies_cost",
      cost: authoritativeSupplies,
      calculation: { fixed_material_setup_cost: project.fixed_material_setup_cost, total_supplies_cost: authoritativeSupplies }
    }));
  }
  return parts;
}
function extractManualItems(project, moduleKey) {
  return (project.items || []).map((item, index) => makePart({
    key: `${moduleKey}:item:${index}`,
    name: item.description || `${moduleKey.toUpperCase()} item ${index + 1}`,
    type: "fabrication",
    subtype: item.item_type || moduleKey,
    sourcePath: `items[${index}]`,
    quantity: item.quantity || 1,
    unit: "item",
    unitCost: item.quantity ? num2(item.item_total_cost) / num2(item.quantity, 1) : 0,
    extendedCost: item.item_total_cost,
    builderData: item,
    calculation: item
  }));
}
var _extractCache = /* @__PURE__ */ new WeakMap();
function extractBuilderParts(moduleKey, project, catalogs = {}, options = {}) {
  if (!project) return [];
  if (typeof project !== "object") return _extractBuilderPartsComputed(moduleKey, project, catalogs, options);
  const key = `${moduleKey}|${options?.legacyMode ? 1 : 0}`;
  let byKey = _extractCache.get(project);
  const hit = byKey?.get(key);
  if (hit && hit.catalogs === catalogs) return hit.out;
  const out = _extractBuilderPartsComputed(moduleKey, project, catalogs, options);
  if (!byKey) {
    byKey = /* @__PURE__ */ new Map();
    _extractCache.set(project, byKey);
  }
  byKey.set(key, { catalogs, out });
  return out;
}
function _extractBuilderPartsComputed(moduleKey, project, catalogs = {}, options = {}) {
  switch (moduleKey) {
    case "foundation":
      return extractFoundation(project, catalogs);
    case "channel_letters":
      return extractChannel(project, catalogs);
    case "vinyl":
      return extractVinyl(project, catalogs, options);
    case "metal":
      return extractMetal(project);
    case "brick_stone":
      return extractBrick(project, catalogs, options);
    case "maintenance":
      return extractMaintenance(project, catalogs, options);
    case "painting":
      return extractPainting(project);
    case "cnc":
      return extractCNC(project);
    case "laser":
      return extractLaser(project);
    default:
      return extractManualItems(project, moduleKey || "legacy");
  }
}
function effectiveCurrentUnitCost(descriptor, row) {
  if (Number.isFinite(Number(descriptor.unit_cost)) && Number(descriptor.unit_cost) !== 0) {
    return Number(descriptor.unit_cost);
  }
  return genericUnitCost(row);
}
async function syncBuilderParts({ builderProduct, sourceProject, acceptPrices = false, legacyMode = false, builderRecalculated = false, catalogsOverride = null, strictCatalogs = false, existingPartsOverride = null, inventoryRowsOverride = null, skipUnchangedWrites = false, planOnly = false, planTimestamp = "" }) {
  if (!builderProduct?.id || !sourceProject) {
    return {
      partCount: 0,
      detachedCount: 0,
      changedCount: 0,
      newPartCount: 0,
      removedPartCount: 0,
      writesPerformed: 0,
      recalcRequired: false,
      recalcReason: "",
      usesDirectLiveReprice: false,
      currentPartsTotal: 0,
      frozenPartsTotal: 0,
      currentMarkupTotal: 0,
      frozenMarkupTotal: 0,
      manualAddonFrozenTotal: 0,
      manualAddonCurrentTotal: 0,
      parts: [],
      partWritePlan: []
    };
  }
  const catalogs = catalogsOverride || await loadBuilderCatalogs(builderProduct.module_key, { strict: strictCatalogs });
  const descriptors = extractBuilderParts(builderProduct.module_key, sourceProject, catalogs, { legacyMode });
  const existing = existingPartsOverride || await loadAllEntityRows({ entity: staffEntities.BuilderPart, query: { builder_product_id: builderProduct.id }, sort: "sort_order", label: "Builder Parts" });
  const byKey = new Map((existing || []).map((part) => [part.part_key, part]));
  const seen = /* @__PURE__ */ new Set();
  const synced = [];
  let detachedCount = 0;
  let changedCount = 0;
  let newPartCount = 0;
  let removedPartCount = 0;
  let writesPerformed = 0;
  let recalcRequired = false;
  const recalcPartNames = [];
  const partWritePlan = [];
  const syncNow = () => planTimestamp || nowIso();
  const directLiveReprice = DIRECT_LIVE_REPRICE_MODULES.has(builderProduct.module_key);
  const writePartUpdate = async (old, patch) => {
    const step = {
      operation: "update",
      part_id: old.id,
      part_key: old.part_key,
      expected_updated_date: old.updated_date || "",
      patch
    };
    partWritePlan.push(step);
    if (planOnly) return { ...old, ...patch };
    const saved = await replaceBuilderEntityFieldsIfUnchanged({
      entity: staffEntities.BuilderPart,
      id: old.id,
      expectedUpdatedAt: old.updated_date || "",
      expectedFields: expectedBuilderEntityFields(old, patch),
      nextFields: patch,
      guardFields: { builder_product_id: old.builder_product_id },
      label: `Builder Part \u201C${old.part_name || "Part"}\u201D synchronization`
    });
    writesPerformed += 1;
    return saved;
  };
  const writePartCreate = async (data) => {
    const step = {
      operation: "create",
      part_key: data.part_key,
      data
    };
    partWritePlan.push(step);
    if (planOnly) return { ...data, id: `planned:${data.part_key}`, updated_date: "" };
    const { record: created, status } = await createBuilderPartWithRecovery({
      entity: staffEntities.BuilderPart,
      data,
      label: `Builder Part \u201C${data.part_name || data.part_key || "Part"}\u201D synchronization`
    });
    if (status !== "existing") writesPerformed += 1;
    return created;
  };
  const WRITE_CONCURRENCY = 4;
  const writeJobs = [];
  const queueWrite = (work) => {
    const slot = synced.length;
    synced.push(null);
    writeJobs.push(async () => {
      synced[slot] = await work();
    });
  };
  for (let index = 0; index < descriptors.length; index += 1) {
    const descriptor = descriptors[index];
    seen.add(descriptor.part_key);
    const old = byKey.get(descriptor.part_key);
    const resolvedEntity = findEntity(catalogs, descriptor.inventory_item_id, descriptor.inventory_entity);
    if (old?.builder_sync_state === "detached_override") {
      const currentRow2 = findRow(catalogs, old.inventory_entity || resolvedEntity, old.inventory_item_id || descriptor.inventory_item_id);
      const candidateId = descriptor.inventory_item_id || old.inventory_item_id || old.original_inventory_item_id || "";
      const candidateEntity = findEntity(catalogs, candidateId, old.inventory_entity || resolvedEntity);
      const candidateRow = findRow(catalogs, candidateEntity, candidateId);
      const corePatch = {
        inventory_link_state: currentRow2 ? "attached" : old.inventory_link_state,
        current_inventory_snapshot: currentRow2 || old.current_inventory_snapshot || {},
        reattach_candidate_id: candidateId,
        reattach_candidate_name: rowName(candidateEntity, candidateRow) || old.inventory_item_name || descriptor.part_name,
        price_state: "detached",
        is_active: true
      };
      if (!skipUnchangedWrites || patchDiffers(old, corePatch)) {
        const patch2 = { ...corePatch, last_price_check_at: syncNow() };
        queueWrite(() => writePartUpdate(old, patch2));
      } else {
        synced.push(old);
      }
      detachedCount += 1;
      continue;
    }
    const currentRow = findRow(catalogs, resolvedEntity, descriptor.inventory_item_id);
    const currentName = rowName(resolvedEntity, currentRow) || descriptor.part_name;
    const oldFrozenName = old?.inventory_item_name || rowName(old?.inventory_entity, old?.frozen_inventory_snapshot) || descriptor.part_name;
    const candidate = !currentRow && oldFrozenName ? findNameCandidate(catalogs, old?.inventory_entity || resolvedEntity, oldFrozenName) : null;
    const hasInventoryLink = !!descriptor.inventory_item_id || !!old?.inventory_item_id || !!old?.original_inventory_item_id;
    const detached = hasInventoryLink && !currentRow;
    const currentPricing = pricingSnapshot(currentRow);
    const frozenPricing = pricingSnapshot(old?.frozen_inventory_snapshot);
    const linkChanged = !!old && !!descriptor.inventory_item_id && descriptor.inventory_item_id !== (old.inventory_item_id || old.original_inventory_item_id);
    const pricingChanged = !!old && !!currentRow && !same(currentPricing, frozenPricing);
    const changed = linkChanged || pricingChanged;
    const currentUnitCost = effectiveCurrentUnitCost(descriptor, currentRow);
    const currentExtended = num2(descriptor.extended_cost);
    const timestamp = syncNow();
    const lastBuilderCalculatedPricing = old?.pricing_basis_snapshot?.builder_calculated_inventory_pricing || {};
    const builderAlreadyCalculatedCurrentPricing = !!old && same(currentPricing, lastBuilderCalculatedPricing);
    if (pricingChanged && !legacyMode && builderProduct.price_state !== "unchecked" && !directLiveReprice && !builderRecalculated && !builderAlreadyCalculatedCurrentPricing) {
      recalcRequired = true;
      recalcPartNames.push(currentName || descriptor.part_name);
    }
    let linkState = "manual";
    if (hasInventoryLink) {
      if (currentRow) linkState = "attached";
      else if (candidate) linkState = "reattach_available";
      else linkState = "detached";
    }
    if (detached) detachedCount += 1;
    if (changed) changedCount += 1;
    if (!old) {
      const establishBaseline = legacyMode || builderProduct.price_state === "unchecked" || acceptPrices;
      const initialFrozenUnit = establishBaseline ? descriptor.unit_cost || currentUnitCost : 0;
      const initialFrozenExtended = establishBaseline ? num2(descriptor.extended_cost) : 0;
      if (!establishBaseline) {
        changedCount += 1;
        newPartCount += 1;
      }
      queueWrite(() => writePartCreate({
        builder_product_id: builderProduct.id,
        part_key: descriptor.part_key,
        sort_order: index,
        part_name: descriptor.part_name,
        part_type: descriptor.part_type,
        part_subtype: descriptor.part_subtype,
        source_module_key: builderProduct.module_key,
        source_path: descriptor.source_path,
        builder_sync_state: "linked",
        inventory_entity: resolvedEntity,
        inventory_item_id: descriptor.inventory_item_id,
        original_inventory_item_id: descriptor.inventory_item_id,
        inventory_item_name: currentName,
        inventory_link_state: linkState,
        reattach_candidate_id: candidate?.id || "",
        reattach_candidate_name: candidate ? rowName(old?.inventory_entity || resolvedEntity, candidate) : "",
        frozen_inventory_snapshot: establishBaseline ? currentRow || {} : {},
        current_inventory_snapshot: currentRow || {},
        builder_data: descriptor.builder_data,
        calculation_snapshot: descriptor.calculation_snapshot,
        pricing_basis_snapshot: {
          ...descriptor.pricing_basis_snapshot,
          inventory_pricing: currentPricing,
          ...builderRecalculated ? { builder_calculated_inventory_pricing: currentPricing } : {}
        },
        quantity: descriptor.quantity,
        unit: descriptor.unit,
        frozen_unit_cost: initialFrozenUnit,
        frozen_extended_cost: initialFrozenExtended,
        current_unit_cost: currentUnitCost,
        current_extended_cost: currentExtended,
        price_state: legacyMode ? "legacy_frozen" : detached ? "detached" : establishBaseline ? "current" : "changed",
        price_delta: currentExtended - initialFrozenExtended,
        price_delta_percent: initialFrozenExtended ? (currentExtended - initialFrozenExtended) / initialFrozenExtended * 100 : 0,
        inventory_updated_date_snapshot: establishBaseline ? currentRow?.updated_date || "" : "",
        last_price_check_at: timestamp,
        last_price_update_at: acceptPrices ? timestamp : "",
        manual_cost_override: !hasInventoryLink,
        manual_cost: !hasInventoryLink ? descriptor.extended_cost : void 0,
        is_active: true,
        notes: legacyMode ? "Backfilled from an existing Builder Product. Saved estimator costs remain authoritative; catalog snapshot is compatibility context." : establishBaseline ? "" : "New Builder Part added after the Product price was frozen. Frozen cost remains $0 until Update Price is explicitly accepted."
      }));
      continue;
    }
    const shouldAccept = acceptPrices && !detached;
    const frozenUnit = shouldAccept ? currentUnitCost : num2(old.frozen_unit_cost, descriptor.unit_cost || currentUnitCost);
    const frozenExtended = shouldAccept ? currentExtended : num2(old.frozen_extended_cost, descriptor.extended_cost);
    const state = detached ? "detached" : legacyMode || old.price_state === "legacy_frozen" ? "legacy_frozen" : changed || Math.abs(currentExtended - frozenExtended) > 5e-3 ? "changed" : "current";
    const patch = {
      sort_order: index,
      part_name: descriptor.part_name,
      part_type: descriptor.part_type,
      part_subtype: descriptor.part_subtype,
      source_module_key: builderProduct.module_key,
      source_path: descriptor.source_path,
      inventory_entity: resolvedEntity || old.inventory_entity,
      inventory_item_id: descriptor.inventory_item_id,
      inventory_item_name: currentName || old.inventory_item_name,
      inventory_link_state: linkState,
      reattach_candidate_id: candidate?.id || "",
      reattach_candidate_name: candidate ? rowName(old.inventory_entity || resolvedEntity, candidate) : "",
      current_inventory_snapshot: currentRow || {},
      builder_data: descriptor.builder_data,
      calculation_snapshot: descriptor.calculation_snapshot,
      pricing_basis_snapshot: {
        ...descriptor.pricing_basis_snapshot,
        inventory_pricing: currentPricing,
        builder_calculated_inventory_pricing: builderRecalculated ? currentPricing : old.pricing_basis_snapshot?.builder_calculated_inventory_pricing || {}
      },
      quantity: descriptor.quantity,
      unit: descriptor.unit,
      current_unit_cost: currentUnitCost,
      current_extended_cost: currentExtended,
      price_state: shouldAccept ? "current" : state,
      price_delta: currentExtended - frozenExtended,
      price_delta_percent: frozenExtended ? (currentExtended - frozenExtended) / frozenExtended * 100 : 0,
      is_active: true
    };
    if (shouldAccept) {
      patch.frozen_inventory_snapshot = currentRow || old.frozen_inventory_snapshot || {};
      patch.frozen_unit_cost = frozenUnit;
      patch.frozen_extended_cost = frozenExtended;
      patch.inventory_updated_date_snapshot = currentRow?.updated_date || old.inventory_updated_date_snapshot || "";
      patch.last_price_update_at = timestamp;
    }
    if (!skipUnchangedWrites || patchDiffers(old, patch)) {
      const writePatch = { ...patch, last_price_check_at: timestamp };
      queueWrite(() => writePartUpdate(old, writePatch));
    } else {
      synced.push(old);
    }
  }
  const addonRowKeys = /* @__PURE__ */ new Map();
  for (const old of existing || []) {
    if (seen.has(old.part_key) || old.is_active === false) continue;
    if (old.builder_sync_state !== "manual_addon") continue;
    if (!old.inventory_entity || !old.inventory_item_id || old.manual_cost_override) continue;
    const key = `${old.inventory_entity}:${old.inventory_item_id}`;
    if (!inventoryRowsOverride?.has(key) && !addonRowKeys.has(key)) addonRowKeys.set(key, old);
  }
  const addonRows = /* @__PURE__ */ new Map();
  const addonKeys = [...addonRowKeys.keys()];
  for (let i = 0; i < addonKeys.length; i += WRITE_CONCURRENCY) {
    await Promise.all(addonKeys.slice(i, i + WRITE_CONCURRENCY).map(async (key) => {
      const part = addonRowKeys.get(key);
      try {
        addonRows.set(key, await staffEntities[part.inventory_entity].get(part.inventory_item_id));
      } catch (error) {
        if (strictCatalogs) {
          throw new Error(`${part.inventory_entity} inventory could not be verified for Part \u201C${part.part_name || "Part"}\u201D: ${error?.message || "read failed"}`);
        }
      }
    }));
  }
  for (const old of existing || []) {
    if (seen.has(old.part_key) || old.is_active === false) continue;
    if (old.builder_sync_state === "detached_override") {
      detachedCount += 1;
      synced.push(old);
      continue;
    }
    if (old.builder_sync_state === "manual_addon") {
      const syncedSlot = synced.length;
      synced.push(old);
      if (old.inventory_entity && old.inventory_item_id && !old.manual_cost_override) {
        let currentRow = null;
        const inventoryKey = `${old.inventory_entity}:${old.inventory_item_id}`;
        if (inventoryRowsOverride?.has(inventoryKey)) {
          currentRow = inventoryRowsOverride.get(inventoryKey);
        } else {
          currentRow = addonRows.get(inventoryKey) || null;
        }
        if (currentRow) {
          const currentUnit = independentPartUnitCost(old, currentRow);
          const currentExtended = currentUnit * num2(old.quantity, 1);
          const changed = Math.abs(currentExtended - num2(old.frozen_extended_cost)) > 5e-3 || !same(pricingSnapshot(currentRow), pricingSnapshot(old.frozen_inventory_snapshot));
          const patch = {
            current_inventory_snapshot: currentRow,
            current_unit_cost: currentUnit,
            current_extended_cost: currentExtended,
            inventory_link_state: "attached",
            price_state: changed ? "changed" : "current",
            price_delta: currentExtended - num2(old.frozen_extended_cost),
            price_delta_percent: num2(old.frozen_extended_cost) ? (currentExtended - num2(old.frozen_extended_cost)) / num2(old.frozen_extended_cost) * 100 : 0,
            is_active: true
          };
          if (changed) changedCount += 1;
          if (!skipUnchangedWrites || patchDiffers(old, patch)) {
            const writePatch = { ...patch, last_price_check_at: syncNow() };
            writeJobs.push(async () => {
              synced[syncedSlot] = await writePartUpdate(old, writePatch);
            });
          }
        } else {
          const patch = {
            inventory_link_state: "detached",
            price_state: "detached",
            is_active: true
          };
          if (!skipUnchangedWrites || patchDiffers(old, patch)) {
            const writePatch = { ...patch, last_price_check_at: syncNow() };
            writeJobs.push(async () => {
              synced[syncedSlot] = await writePartUpdate(old, writePatch);
            });
          }
        }
      }
      continue;
    }
    const frozenRemovedCost = num2(old.frozen_extended_cost);
    if (Math.abs(frozenRemovedCost) <= 5e-3) {
      writeJobs.push(() => writePartUpdate(old, {
        is_active: false,
        current_unit_cost: 0,
        current_extended_cost: 0,
        price_state: "current",
        price_delta: 0,
        price_delta_percent: 0,
        last_price_check_at: syncNow(),
        notes: `${old.notes ? `${old.notes}
` : ""}Part removed from Builder before it carried a frozen cost; historical row retained inactive.`
      }));
      continue;
    }
    const alreadyPendingRemoval = !!old.builder_data?.[PENDING_REMOVAL_KEY];
    const removalNote = "Part no longer exists in the current Builder. Frozen cost is retained until Update Price accepts its removal.";
    const pendingRemoval = {
      current_unit_cost: 0,
      current_extended_cost: 0,
      price_state: "changed",
      price_delta: -frozenRemovedCost,
      price_delta_percent: -100,
      builder_data: { ...old.builder_data || {}, [PENDING_REMOVAL_KEY]: true },
      is_active: true,
      notes: alreadyPendingRemoval ? old.notes || removalNote : `${old.notes ? `${old.notes}
` : ""}${removalNote}`
    };
    if (!skipUnchangedWrites || patchDiffers(old, pendingRemoval)) {
      const writePatch = { ...pendingRemoval, last_price_check_at: syncNow() };
      queueWrite(() => writePartUpdate(old, writePatch));
    } else {
      synced.push(old);
    }
    changedCount += 1;
    removedPartCount += 1;
  }
  for (let i = 0; i < writeJobs.length; i += WRITE_CONCURRENCY) {
    await Promise.all(writeJobs.slice(i, i + WRITE_CONCURRENCY).map((run) => run()));
  }
  const activeEconomicParts = synced.filter((part) => part.is_active !== false);
  const currentPartsTotal = activeEconomicParts.reduce(
    (sum, part) => sum + num2(part.current_extended_cost, num2(part.frozen_extended_cost)),
    0
  );
  const frozenPartsTotal = activeEconomicParts.reduce(
    (sum, part) => sum + num2(part.frozen_extended_cost),
    0
  );
  const markupParts = activeEconomicParts.filter((part) => part.part_subtype === "markup");
  const currentMarkupTotal = markupParts.reduce(
    (sum, part) => sum + num2(part.current_extended_cost, num2(part.frozen_extended_cost)),
    0
  );
  const frozenMarkupTotal = markupParts.reduce((sum, part) => sum + num2(part.frozen_extended_cost), 0);
  const manualAddons = activeEconomicParts.filter((part) => part.builder_sync_state === "manual_addon");
  const manualAddonFrozenTotal = manualAddons.reduce((sum, part) => sum + num2(part.frozen_extended_cost), 0);
  const manualAddonCurrentTotal = manualAddons.reduce((sum, part) => sum + num2(part.current_extended_cost, num2(part.frozen_extended_cost)), 0);
  const uniqueRecalcNames = [...new Set(recalcPartNames.filter(Boolean))];
  return {
    partCount: activeEconomicParts.length,
    detachedCount,
    changedCount,
    newPartCount,
    removedPartCount,
    writesPerformed,
    recalcRequired,
    recalcReason: recalcRequired ? `Master Inventory changed after this ${builderProduct.builder_name || "Builder"} was last calculated${uniqueRecalcNames.length ? `: ${uniqueRecalcNames.slice(0, 4).join(", ")}${uniqueRecalcNames.length > 4 ? "\u2026" : ""}` : ""}. Reopen and save the Builder before accepting Update Price.` : "",
    usesDirectLiveReprice: directLiveReprice && !legacyMode,
    currentPartsTotal,
    frozenPartsTotal,
    currentMarkupTotal,
    frozenMarkupTotal,
    manualAddonFrozenTotal,
    manualAddonCurrentTotal,
    parts: synced,
    partWritePlan
  };
}
function assertUniqueBuilderPartKeys(parts, builderProductId, label = "Builder Parts") {
  if (!Array.isArray(parts)) throw new Error(`${label} could not be verified while recovering a Builder mutation.`);
  const seen = /* @__PURE__ */ new Map();
  for (const part of parts) {
    if (String(part?.builder_product_id || "") !== String(builderProductId || "")) {
      throw new Error(`${label} contains a Part owned by a different Builder Product. Recovery stopped before continuing.`);
    }
    const key = String(part?.part_key || "").trim();
    if (!key) continue;
    if (seen.has(key)) {
      throw new Error(`${label} contains multiple Parts with key \u201C${key}\u201D for the same Builder Product. Recovery stopped without choosing between duplicate Parts.`);
    }
    seen.set(key, part.id || "");
  }
  return true;
}
async function applyBuilderPartPriceAcceptancePlan(builderProductId, plan, { partsOverride = void 0 } = {}) {
  const parts = partsOverride !== void 0 ? partsOverride : await loadAllEntityRows({ entity: staffEntities.BuilderPart, query: { builder_product_id: builderProductId }, sort: "sort_order", label: "Builder Parts" });
  assertUniqueBuilderPartKeys(parts, builderProductId);
  const byId = new Map(parts.map((part) => [part.id, part]));
  const byKey = new Map(parts.map((part) => [part.part_key, part]));
  let writesPerformed = 0;
  let createdAny = false;
  for (const step of plan?.part_updates || []) {
    if (step.operation === "create") {
      const data = step.data || {};
      const existing = byKey.get(step.part_key || data.part_key);
      if (existing) {
        if (existing.builder_product_id !== builderProductId) {
          throw new Error("A planned Builder Part key is now owned by a different Product. Reload before continuing.");
        }
        if (patchDiffers(existing, data)) {
          throw new Error(`Part \u201C${existing.part_name || "Part"}\u201D appeared while the Builder mutation was pending with different data. No unrelated Part was overwritten.`);
        }
        continue;
      }
      const { record: created, status } = await createBuilderPartWithRecovery({
        entity: staffEntities.BuilderPart,
        data,
        label: `Builder Part \u201C${data.part_name || data.part_key || "Part"}\u201D recovery create`
      });
      if (status !== "existing") {
        writesPerformed += 1;
        createdAny = true;
      }
      if (created?.id) byId.set(created.id, created);
      if (created?.part_key) byKey.set(created.part_key, created);
      continue;
    }
    const part = byId.get(step.part_id);
    if (!part || part.builder_product_id !== builderProductId) {
      throw new Error("A Builder Part changed ownership while a Builder mutation was pending. Reload before continuing.");
    }
    const targetPatch = step.patch || {};
    if (!patchDiffers(part, targetPatch)) continue;
    const expected = String(step.expected_updated_date || "").trim();
    const current = String(part.updated_date || "").trim();
    if (expected && current && current !== expected) {
      throw new Error(`Part \u201C${part.part_name || "Part"}\u201D changed while a Builder mutation was pending. No unrelated Part edit was overwritten.`);
    }
    await replaceBuilderEntityFieldsIfUnchanged({
      entity: staffEntities.BuilderPart,
      id: part.id,
      expectedUpdatedAt: part.updated_date || "",
      expectedFields: expectedBuilderEntityFields(part, targetPatch),
      nextFields: targetPatch,
      guardFields: { builder_product_id: builderProductId },
      label: `Builder Part \u201C${part.part_name || "Part"}\u201D recovery update`
    });
    writesPerformed += 1;
  }
  if (createdAny) {
    const verifiedParts = await loadAllEntityRows({
      entity: staffEntities.BuilderPart,
      query: { builder_product_id: builderProductId },
      sort: "sort_order",
      label: "Builder Parts post-create verification"
    });
    assertUniqueBuilderPartKeys(verifiedParts, builderProductId, "Builder Parts post-create verification");
  }
  return { writesPerformed };
}
async function acceptBuilderPartPrices(builderProductId, {
  builderOverride = void 0,
  partsOverride = void 0,
  apply = true,
  timestamp = nowIso()
} = {}) {
  const [parts, builder] = await Promise.all([
    partsOverride !== void 0 ? Promise.resolve(partsOverride) : loadAllEntityRows({ entity: staffEntities.BuilderPart, query: { builder_product_id: builderProductId }, sort: "sort_order", label: "Builder Parts" }),
    builderOverride !== void 0 ? Promise.resolve(builderOverride) : staffEntities.BuilderProduct.get(builderProductId)
  ]);
  if (!builder?.id || builder.id !== builderProductId) {
    throw new Error("Builder Product could not be verified before accepting Part prices.");
  }
  if (!Array.isArray(parts)) {
    throw new Error("Builder Parts could not be verified before accepting pricing.");
  }
  if (parts.some((part) => part?.builder_product_id !== builderProductId)) {
    throw new Error("Builder Part ownership changed before pricing could be accepted. Reload the estimate and try again.");
  }
  const activeParts = parts.filter((row) => row.is_active !== false);
  const detachedParts = activeParts.filter(
    (part) => part.builder_sync_state === "detached_override" || ["detached", "reattach_available"].includes(part.inventory_link_state)
  );
  if (detachedParts.length > 0) {
    return {
      changedParts: [],
      detachedCount: detachedParts.length,
      detachedParts: detachedParts.map((part) => ({
        part_id: part.id,
        part_key: part.part_key,
        part_name: part.part_name,
        inventory_item_name: part.inventory_item_name,
        reattach_candidate_id: part.reattach_candidate_id || "",
        reattach_candidate_name: part.reattach_candidate_name || ""
      }))
    };
  }
  const staleCatalogParts = !builder || DIRECT_LIVE_REPRICE_MODULES.has(builder.module_key) || builder.price_state === "unchecked" ? [] : activeParts.filter((part) => {
    if (["manual", "manual_addon", "detached_override"].includes(part.builder_sync_state)) return false;
    const currentPricing = pricingSnapshot(part.current_inventory_snapshot);
    const frozenPricing = pricingSnapshot(part.frozen_inventory_snapshot);
    if (same(currentPricing, frozenPricing)) return false;
    const builderCalculatedPricing = part.pricing_basis_snapshot?.builder_calculated_inventory_pricing || {};
    return !same(currentPricing, builderCalculatedPricing);
  });
  if (builder?.price_recalc_required || staleCatalogParts.length > 0) {
    return {
      changedParts: [],
      detachedCount: 0,
      detachedParts: [],
      recalcRequired: true,
      recalcParts: staleCatalogParts.map((part) => ({
        part_id: part.id,
        part_key: part.part_key,
        part_name: part.part_name,
        inventory_item_name: part.inventory_item_name
      })),
      recalcReason: builder?.price_recalc_reason || "Master Inventory changed after this Builder was last calculated. Reopen and save the Builder before accepting Update Price."
    };
  }
  const changedParts = [];
  const partUpdates = [];
  let activePartCount = 0;
  for (const part of activeParts) {
    const wasChanged = part.price_state === "changed" || Math.abs(num2(part.current_extended_cost) - num2(part.frozen_extended_cost)) > 5e-3 || !same(pricingSnapshot(part.current_inventory_snapshot), pricingSnapshot(part.frozen_inventory_snapshot));
    const pendingRemoval = !!part.builder_data?.[PENDING_REMOVAL_KEY];
    if (wasChanged) {
      changedParts.push({
        part_id: part.id,
        part_key: part.part_key,
        part_name: part.part_name,
        previous_inventory_item_id: part.original_inventory_item_id || part.inventory_item_id,
        current_inventory_item_id: part.inventory_item_id,
        previous_unit_cost: num2(part.frozen_unit_cost),
        new_unit_cost: num2(part.current_unit_cost),
        previous_extended_cost: num2(part.frozen_extended_cost),
        new_extended_cost: num2(part.current_extended_cost),
        previous_inventory_snapshot: part.frozen_inventory_snapshot || {},
        new_inventory_snapshot: part.current_inventory_snapshot || {},
        action: pendingRemoval ? "remove" : Math.abs(num2(part.frozen_extended_cost)) <= 5e-3 && Math.abs(num2(part.current_extended_cost)) > 5e-3 ? "add" : "price_update"
      });
    }
    const acceptedBuilderData = { ...part.builder_data || {} };
    delete acceptedBuilderData[PENDING_REMOVAL_KEY];
    partUpdates.push({
      part_id: part.id,
      expected_updated_date: part.updated_date || "",
      patch: {
        frozen_inventory_snapshot: part.current_inventory_snapshot || part.frozen_inventory_snapshot || {},
        frozen_unit_cost: num2(part.current_unit_cost, num2(part.frozen_unit_cost)),
        frozen_extended_cost: num2(part.current_extended_cost, num2(part.frozen_extended_cost)),
        inventory_updated_date_snapshot: part.current_inventory_snapshot?.updated_date || part.inventory_updated_date_snapshot || "",
        price_state: "current",
        price_delta: 0,
        price_delta_percent: 0,
        builder_data: acceptedBuilderData,
        is_active: !pendingRemoval,
        last_price_update_at: timestamp
      }
    });
    if (!pendingRemoval) activePartCount += 1;
  }
  const acceptancePlan = {
    timestamp,
    part_updates: partUpdates,
    changed_parts: changedParts,
    active_part_count: activePartCount
  };
  if (apply) {
    await applyBuilderPartPriceAcceptancePlan(builderProductId, acceptancePlan, { partsOverride: parts });
  }
  return {
    changedParts,
    detachedCount: 0,
    detachedParts: [],
    recalcRequired: false,
    recalcParts: [],
    recalcReason: "",
    activePartCount,
    acceptancePlan
  };
}
async function getDetachedBuilderParts(builderProductId) {
  if (!builderProductId) return [];
  const parts = await loadAllEntityRows({ entity: staffEntities.BuilderPart, query: { builder_product_id: builderProductId }, sort: "sort_order", label: "Builder Parts" });
  return (parts || []).filter(requiresBuilderReattach).sort((a, b) => num2(a.sort_order) - num2(b.sort_order)).map((part) => ({
    ...part,
    can_reattach: part.builder_sync_state === "detached_override" || !!part.reattach_candidate_id
  }));
}
function assertEstimatorPartVersion(part, expectedUpdatedAt = "") {
  const expected = String(expectedUpdatedAt || "").trim();
  const current = String(part?.updated_date || "").trim();
  if (expected && current !== expected) {
    throw new Error(`Part \u201C${part?.part_name || "Part"}\u201D changed in another session. Reload the Product before continuing.`);
  }
}
function estimateBuilderLine(estimate, builderProductId) {
  return (estimate?.line_items || []).find((line) => line.builder_product_id === builderProductId) || null;
}
async function loadPendingAwarePartMutationContext(partId, options = {}, allowedKinds = []) {
  const part = await staffEntities.BuilderPart.get(partId);
  if (!part?.id) throw new Error("The Part could not be loaded.");
  const builder = await staffEntities.BuilderProduct.get(part.builder_product_id);
  if (!builder?.id || !builder.estimate_id) throw new Error("The Builder Product could not be verified against an estimate.");
  const estimate = await staffEntities.AllInOneEstimate.get(builder.estimate_id);
  if (!estimate) throw new Error("Estimate could not be loaded.");
  const line = estimateBuilderLine(estimate, builder.id);
  if (!line) throw new Error("This Product is no longer part of the estimate. Reload before changing its Parts.");
  const pending = pendingBuilderMutation(line);
  if (pending) {
    if (!allowedKinds.includes(pending.kind) || String(pending.target_part_id || "") !== String(part.id)) {
      throw new Error("Another Builder mutation is still being recovered for this Product. Resume that operation before changing this Part.");
    }
    await assertEstimateProductMutationAllowed(estimate, { allowPriceAcceptanceKey: pending.key });
    return { part, builder, estimate, line, pending, alreadyComplete: false };
  }
  if (typeof options.isAlreadyComplete === "function" && options.isAlreadyComplete({ part, builder, estimate, line })) {
    return { part, builder, estimate, line, pending: null, alreadyComplete: true };
  }
  assertEstimatorPartVersion(part, options.expectedPartUpdatedAt || "");
  await assertEstimateProductMutationAllowed(estimate, { expectedUpdatedAt: options.expectedEstimateUpdatedAt || "" });
  return { part, builder, estimate, line, pending: null, alreadyComplete: false };
}
async function detachBuilderPartOverride(partId, reason = "Detached for independent Part override.", options = {}) {
  if (!partId) return null;
  const context = await loadPendingAwarePartMutationContext(
    partId,
    {
      ...options,
      isAlreadyComplete: ({ part: part2 }) => part2.builder_sync_state === "detached_override"
    },
    ["builder_detach_override"]
  );
  const { part, builder, estimate, line, pending, alreadyComplete } = context;
  if (pending) {
    const allParts2 = await loadAllEntityRows({ entity: staffEntities.BuilderPart, query: { builder_product_id: builder.id }, sort: "sort_order", label: "Builder Parts" });
    await resumeBuilderMutation({
      estimateId: estimate.id,
      estimate,
      builder,
      parts: allParts2,
      line,
      pending,
      applyPartPlan: applyBuilderPartPriceAcceptancePlan
    });
    const step = (pending.part_acceptance_plan?.part_updates || []).find((item) => item.part_id === part.id);
    return { ...part, ...step?.patch || {} };
  }
  if (alreadyComplete) return part;
  if (["manual", "manual_addon"].includes(part.builder_sync_state)) {
    throw new Error("Independent manual Parts do not need to be detached from a Builder.");
  }
  const allParts = await loadAllEntityRows({ entity: staffEntities.BuilderPart, query: { builder_product_id: builder.id }, sort: "sort_order", label: "Builder Parts" });
  if (!Array.isArray(allParts) || allParts.some((row) => row?.builder_product_id !== builder.id)) {
    throw new Error("Builder Parts could not be verified before detaching this Part.");
  }
  const detachedCount = allParts.filter(
    (row) => row.id === part.id ? row.is_active !== false : requiresBuilderReattach(row)
  ).length;
  const timestamp = nowIso();
  const detachedSnapshot = {
    part_name: part.part_name,
    client_label: part.client_label,
    quantity: part.quantity,
    unit: part.unit,
    inventory_entity: part.inventory_entity,
    inventory_item_id: part.inventory_item_id,
    inventory_item_name: part.inventory_item_name,
    frozen_unit_cost: num2(part.frozen_unit_cost),
    frozen_extended_cost: num2(part.frozen_extended_cost),
    builder_data: part.builder_data || {},
    calculation_snapshot: part.calculation_snapshot || {},
    pricing_basis_snapshot: part.pricing_basis_snapshot || {},
    detail_overrides: part.detail_overrides || {},
    source_path: part.source_path
  };
  const me = await base44.auth.me().catch(() => null);
  const detachedBy = String(options.detachedBy || me?.full_name || me?.email || "").trim();
  const partPatch = {
    builder_sync_state: "detached_override",
    builder_detached_at: timestamp,
    builder_detached_reason: reason,
    builder_detached_by: detachedBy,
    builder_detached_snapshot: detachedSnapshot,
    reattach_candidate_id: part.inventory_item_id || part.original_inventory_item_id || "",
    reattach_candidate_name: part.inventory_item_name || part.part_name || "",
    price_state: "detached",
    last_price_check_at: timestamp,
    notes: `${part.notes ? `${part.notes}
` : ""}Detached from Builder for independent override. Frozen pricing retained.`
  };
  const changedParts = [{
    part_id: part.id,
    part_key: part.part_key,
    part_name: part.part_name,
    action: "detach_override",
    frozen_unit_cost: num2(part.frozen_unit_cost),
    frozen_extended_cost: num2(part.frozen_extended_cost),
    inventory_item_id: part.inventory_item_id || "",
    source_path: part.source_path || ""
  }];
  const builderPatch = {
    detached_part_count: detachedCount,
    needs_reattach_review: true,
    price_state: "detached_parts",
    last_price_check_at: timestamp,
    builder_version: num2(builder.builder_version, 1) + 1
  };
  const linePatch = {
    detached_part_count: detachedCount,
    needs_reattach_review: true,
    price_state: "detached_parts",
    last_price_check_at: timestamp
  };
  const revision = {
    builder_product_id: builder.id,
    estimate_id: builder.estimate_id || "",
    reason: "manual_adjustment",
    previous_total_cost: num2(builder.frozen_cost),
    new_total_cost: num2(builder.frozen_cost),
    previous_customer_price: num2(builder.frozen_customer_price, num2(builder.frozen_cost)),
    new_customer_price: num2(builder.frozen_customer_price, num2(builder.frozen_cost)),
    changed_parts: changedParts,
    builder_snapshot_before: builder.builder_snapshot || {},
    builder_snapshot_after: builder.builder_snapshot || {},
    price_snapshot_before: { total: num2(builder.frozen_cost), pricing_accepted: false },
    price_snapshot_after: { total: num2(builder.frozen_cost), pricing_accepted: false },
    notes: reason
  };
  const operationKey = `builder_detach_override:${builder.id}:${part.id}:${num2(builder.builder_version, 1)}:${builderMutationHash({
    estimate_updated_date: estimate.updated_date || "",
    part_updated_date: part.updated_date || "",
    reason,
    part_patch: partPatch
  })}`;
  const recoveryMarker = {
    key: operationKey,
    kind: "builder_detach_override",
    started_at: timestamp,
    estimate_id: estimate.id,
    estimate_line_id: line.line_id || builder.estimate_line_id || "",
    builder_product_id: builder.id,
    target_part_id: part.id,
    builder_updated_date_before: builder.updated_date || "",
    builder_version_before: num2(builder.builder_version, 1),
    part_acceptance_plan: {
      timestamp,
      part_updates: [{ part_id: part.id, expected_updated_date: part.updated_date || "", patch: partPatch }],
      changed_parts: changedParts,
      active_part_count: allParts.filter((row) => row.is_active !== false).length
    },
    builder_patch: builderPatch,
    line_patch: linePatch,
    revision
  };
  const marked = await markBuilderMutationPending({ estimate, builder, line, pending: recoveryMarker });
  await resumeBuilderMutation({
    estimateId: estimate.id,
    estimate: marked.markedEstimate,
    builder: marked.currentBuilder,
    parts: marked.currentParts,
    line: marked.markedLine,
    pending: marked.canonicalPending,
    applyPartPlan: applyBuilderPartPriceAcceptancePlan
  });
  return { ...part, ...partPatch };
}
function detachedOverrideChangesAlreadyApplied(part, changes = {}) {
  if (part?.builder_sync_state !== "detached_override") return false;
  if (changes.part_name !== void 0 && String(part.part_name || "") !== String(changes.part_name || "Part")) return false;
  if (changes.client_label !== void 0 && String(part.client_label || "") !== String(changes.client_label || "")) return false;
  if (changes.quantity !== void 0 && Math.abs(num2(part.quantity) - Math.max(0, num2(changes.quantity))) > 1e-6) return false;
  if (changes.unit !== void 0 && String(part.unit || "") !== String(changes.unit || "")) return false;
  if (changes.frozen_unit_cost !== void 0 && Math.abs(num2(part.frozen_unit_cost) - num2(changes.frozen_unit_cost)) > 1e-6) return false;
  if (changes.detail_overrides !== void 0 && !same(part.detail_overrides || {}, changes.detail_overrides || {})) return false;
  if (changes.notes !== void 0 && String(part.notes || "") !== String(changes.notes || "")) return false;
  if (changes.manual_cost_override_reason !== void 0 && String(part.manual_cost_override_reason || "") !== String(changes.manual_cost_override_reason || "")) return false;
  return true;
}
async function updateDetachedPartOverride(partId, changes = {}, options = {}) {
  const context = await loadPendingAwarePartMutationContext(
    partId,
    {
      ...options,
      isAlreadyComplete: ({ part: part2 }) => detachedOverrideChangesAlreadyApplied(part2, changes)
    },
    ["builder_detached_override_update"]
  );
  const { part, builder, estimate, line, pending, alreadyComplete } = context;
  if (pending) {
    const allParts2 = await loadAllEntityRows({ entity: staffEntities.BuilderPart, query: { builder_product_id: builder.id }, sort: "sort_order", label: "Builder Parts" });
    await resumeBuilderMutation({
      estimateId: estimate.id,
      estimate,
      builder,
      parts: allParts2,
      line,
      pending,
      applyPartPlan: applyBuilderPartPriceAcceptancePlan
    });
    const step = (pending.part_acceptance_plan?.part_updates || []).find((item) => item.part_id === part.id);
    return { ...part, ...step?.patch || {} };
  }
  if (alreadyComplete) return part;
  if (part.builder_sync_state !== "detached_override") {
    throw new Error("This Part must be detached from its Builder before it can be overridden independently.");
  }
  const allParts = await loadAllEntityRows({ entity: staffEntities.BuilderPart, query: { builder_product_id: builder.id }, sort: "sort_order", label: "Builder Parts" });
  if (!Array.isArray(allParts) || allParts.some((row) => row?.builder_product_id !== builder.id)) {
    throw new Error("Builder Parts could not be verified before updating this detached override.");
  }
  const previousExtended = num2(part.frozen_extended_cost);
  const quantity = changes.quantity !== void 0 ? Math.max(0, num2(changes.quantity)) : num2(part.quantity, 1);
  const frozenUnitCost = changes.frozen_unit_cost !== void 0 ? num2(changes.frozen_unit_cost) : num2(part.frozen_unit_cost);
  const nextExtended = quantity * frozenUnitCost;
  const delta = nextExtended - previousExtended;
  const timestamp = nowIso();
  const previousDetailOverrides = part.detail_overrides || {};
  const nextDetailOverrides = changes.detail_overrides !== void 0 ? { ...changes.detail_overrides || {} } : previousDetailOverrides;
  const partPatch = {
    part_name: changes.part_name !== void 0 ? String(changes.part_name || "Part") : part.part_name,
    client_label: changes.client_label !== void 0 ? String(changes.client_label || "") : part.client_label,
    quantity,
    unit: changes.unit !== void 0 ? String(changes.unit || "") : part.unit,
    frozen_unit_cost: frozenUnitCost,
    frozen_extended_cost: nextExtended,
    current_unit_cost: frozenUnitCost,
    current_extended_cost: nextExtended,
    manual_cost_override: true,
    manual_cost: nextExtended,
    manual_cost_override_reason: changes.manual_cost_override_reason !== void 0 ? String(changes.manual_cost_override_reason || "") : String(part.manual_cost_override_reason || ""),
    detail_overrides: nextDetailOverrides,
    price_state: "detached",
    price_delta: 0,
    price_delta_percent: 0,
    notes: changes.notes !== void 0 ? String(changes.notes || "") : part.notes,
    last_price_update_at: timestamp,
    last_price_check_at: timestamp
  };
  const previousProductCost = num2(builder.frozen_cost);
  const nextProductCost = previousProductCost + delta;
  const previousCustomerPrice = num2(builder.frozen_customer_price, previousProductCost);
  const nextCustomerPrice = previousCustomerPrice + delta;
  const changedParts = [{
    part_id: part.id,
    part_key: part.part_key,
    part_name: partPatch.part_name,
    action: "override_update",
    previous_quantity: num2(part.quantity, 1),
    new_quantity: quantity,
    previous_unit: part.unit || "",
    new_unit: partPatch.unit || "",
    previous_unit_cost: num2(part.frozen_unit_cost),
    new_unit_cost: frozenUnitCost,
    previous_extended_cost: previousExtended,
    new_extended_cost: nextExtended,
    delta,
    previous_detail_overrides: previousDetailOverrides,
    new_detail_overrides: nextDetailOverrides
  }];
  const builderPatch = {
    frozen_cost: nextProductCost,
    frozen_customer_price: nextCustomerPrice,
    price_state: "detached_parts",
    needs_reattach_review: true,
    last_price_update_at: timestamp,
    last_price_update_note: `Independent override updated for ${partPatch.part_name}.`,
    builder_version: num2(builder.builder_version, 1) + 1
  };
  const linePatch = {
    total_snapshot: num2(line.total_snapshot, previousProductCost) + delta,
    customer_price_snapshot: acceptedCustomerUnitPrice(line) + delta,
    live_customer_price_snapshot: liveCustomerUnitPrice(line) + delta,
    price_state: "detached_parts",
    needs_reattach_review: true,
    last_price_update_at: timestamp,
    last_price_check_at: timestamp
  };
  const revision = {
    builder_product_id: builder.id,
    estimate_id: builder.estimate_id || "",
    reason: "manual_adjustment",
    previous_total_cost: previousProductCost,
    new_total_cost: nextProductCost,
    previous_customer_price: previousCustomerPrice,
    new_customer_price: nextCustomerPrice,
    changed_parts: changedParts,
    builder_snapshot_before: builder.builder_snapshot || {},
    builder_snapshot_after: builder.builder_snapshot || {},
    price_snapshot_before: { total: previousProductCost, detached_override: true },
    price_snapshot_after: { total: nextProductCost, detached_override: true },
    notes: "Independent detached Part override updated. Builder synchronization remains disabled for this Part."
  };
  const operationKey = `builder_detached_override_update:${builder.id}:${part.id}:${num2(builder.builder_version, 1)}:${builderMutationHash({
    estimate_updated_date: estimate.updated_date || "",
    part_updated_date: part.updated_date || "",
    changes,
    next_product_cost: nextProductCost,
    next_customer_price: nextCustomerPrice
  })}`;
  const recoveryMarker = {
    key: operationKey,
    kind: "builder_detached_override_update",
    started_at: timestamp,
    estimate_id: estimate.id,
    estimate_line_id: line.line_id || builder.estimate_line_id || "",
    builder_product_id: builder.id,
    target_part_id: part.id,
    builder_updated_date_before: builder.updated_date || "",
    builder_version_before: num2(builder.builder_version, 1),
    part_acceptance_plan: {
      timestamp,
      part_updates: [{ part_id: part.id, expected_updated_date: part.updated_date || "", patch: partPatch }],
      changed_parts: changedParts,
      active_part_count: allParts.filter((row) => row.is_active !== false).length
    },
    builder_patch: builderPatch,
    line_patch: linePatch,
    revision
  };
  const marked = await markBuilderMutationPending({ estimate, builder, line, pending: recoveryMarker });
  await resumeBuilderMutation({
    estimateId: estimate.id,
    estimate: marked.markedEstimate,
    builder: marked.currentBuilder,
    parts: marked.currentParts,
    line: marked.markedLine,
    pending: marked.canonicalPending,
    applyPartPlan: applyBuilderPartPriceAcceptancePlan
  });
  return { ...part, ...partPatch };
}
function pathTokens(path) {
  return String(path || "").replace(/\[(\d+)\]/g, ".$1").split(".").map((token) => token.trim()).filter(Boolean);
}
function setAtPath(target, path, value) {
  const tokens = pathTokens(path);
  if (!tokens.length) return false;
  let cursor = target;
  for (let i = 0; i < tokens.length - 1; i += 1) {
    const token = tokens[i];
    if (cursor?.[token] === void 0 || cursor?.[token] === null) return false;
    cursor = cursor[token];
  }
  const last = tokens[tokens.length - 1];
  if (!cursor || typeof cursor !== "object") return false;
  cursor[last] = value;
  if (last === "inventory_item_id" && Object.prototype.hasOwnProperty.call(cursor, "inventory_id")) {
    cursor.inventory_id = value;
  } else if (last === "inventory_id" && Object.prototype.hasOwnProperty.call(cursor, "inventory_item_id")) {
    cursor.inventory_item_id = value;
  }
  return true;
}
function topLevelField(path) {
  return pathTokens(path)[0] || "";
}
async function reattachBuilderParts({ builderProductId, partIds = [], expectedEstimateUpdatedAt = "", expectedPartVersions = {} }) {
  if (!builderProductId || !partIds.length) {
    return { reattached: [], remainingDetached: await getDetachedBuilderParts(builderProductId) };
  }
  const builder = await staffEntities.BuilderProduct.get(builderProductId);
  if (!builder?.id || !builder.estimate_id) throw new Error("The Builder Product could not be verified against an estimate.");
  const estimate = await staffEntities.AllInOneEstimate.get(builder.estimate_id);
  if (!estimate) throw new Error("Estimate could not be loaded.");
  const line = estimateBuilderLine(estimate, builder.id);
  if (!line) throw new Error("This Product is no longer part of the estimate. Reload before reattaching Parts.");
  const existingPending = pendingBuilderMutation(line);
  if (existingPending) {
    if (existingPending.kind !== "builder_reattach_parts" || String(existingPending.builder_product_id || "") !== String(builder.id)) {
      throw new Error("Another Builder mutation is still being recovered for this Product. Resume that operation before reattaching Parts.");
    }
    const currentParts = await loadAllEntityRows({ entity: staffEntities.BuilderPart, query: { builder_product_id: builder.id }, sort: "sort_order", label: "Builder Parts" });
    await resumeBuilderMutation({
      estimateId: estimate.id,
      estimate,
      builder,
      parts: currentParts,
      line,
      pending: existingPending,
      applyPartPlan: applyBuilderPartPriceAcceptancePlan
    });
    return {
      reattached: existingPending.revision?.changed_parts || [],
      remainingDetached: await getDetachedBuilderParts(builder.id),
      builderProject: existingPending.patched_source || null,
      recovered: true
    };
  }
  const allParts = await loadAllEntityRows({ entity: staffEntities.BuilderPart, query: { builder_product_id: builder.id }, sort: "sort_order", label: "Builder Parts" });
  if (!Array.isArray(allParts) || allParts.some((part) => part?.builder_product_id !== builder.id)) {
    throw new Error("Builder Parts could not be verified before reattachment.");
  }
  const requestedIds = new Set(partIds);
  const requestedParts = allParts.filter((part) => requestedIds.has(part.id));
  if (requestedParts.length !== requestedIds.size) {
    throw new Error("One or more selected Parts no longer belong to this Product. Reload before reattaching.");
  }
  if (requestedParts.every((part) => !requiresBuilderReattach(part))) {
    return {
      reattached: requestedParts.map((part) => ({ part_id: part.id, part_key: part.part_key, part_name: part.part_name })),
      remainingDetached: await getDetachedBuilderParts(builder.id),
      builderProject: builder.source_entity && builder.source_project_id ? await staffEntities[builder.source_entity].get(builder.source_project_id).catch(() => null) : null,
      alreadyCompleted: true
    };
  }
  await assertEstimateProductMutationAllowed(estimate, { expectedUpdatedAt: expectedEstimateUpdatedAt });
  requestedParts.forEach((part) => assertEstimatorPartVersion(part, expectedPartVersions?.[part.id] || ""));
  if (!builder.source_entity || !builder.source_project_id) {
    throw new Error("This Builder no longer has an editable source project to reattach Parts to.");
  }
  const [source, catalogs] = await Promise.all([
    staffEntities[builder.source_entity].get(builder.source_project_id),
    loadBuilderCatalogs(builder.module_key, { strict: true })
  ]);
  if (!source) throw new Error("The Builder source project could not be loaded.");
  const detached = allParts.filter(requiresBuilderReattach).sort((a, b) => num2(a.sort_order) - num2(b.sort_order)).map((part) => ({ ...part, can_reattach: part.builder_sync_state === "detached_override" || !!part.reattach_candidate_id }));
  const selected = detached.filter((part) => requestedIds.has(part.id));
  if (selected.length !== requestedIds.size) {
    throw new Error("One or more selected Parts changed or are no longer detached. Reload the Product before reattaching.");
  }
  const beforeSnapshot = builder.builder_snapshot || source;
  const patchedSource = JSON.parse(JSON.stringify(source));
  const changedRoots = /* @__PURE__ */ new Set();
  const reattached = [];
  const selectedPatches = /* @__PURE__ */ new Map();
  for (const part of selected) {
    const builderOverride = part.builder_sync_state === "detached_override";
    if (builderOverride) {
      selectedPatches.set(part.id, {
        builder_sync_state: "linked",
        builder_detached_at: "",
        builder_detached_reason: "",
        builder_detached_by: "",
        detail_overrides: {},
        price_state: "changed"
      });
    } else {
      if (!part.reattach_candidate_id) throw new Error(`Part \u201C${part.part_name || "Part"}\u201D no longer has a verified reattach candidate.`);
      const candidateEntity = findEntity(catalogs, part.reattach_candidate_id, part.inventory_entity || "");
      const candidateRow = findRow(catalogs, candidateEntity, part.reattach_candidate_id);
      if (!candidateEntity || !candidateRow) {
        throw new Error(`The replacement Master Inventory record for Part \u201C${part.part_name || "Part"}\u201D could not be verified.`);
      }
      const changed = setAtPath(patchedSource, part.source_path, part.reattach_candidate_id);
      if (!changed) throw new Error(`Part \u201C${part.part_name || "Part"}\u201D could not be mapped back into the current Builder source record.`);
      const root = topLevelField(part.source_path);
      if (root) changedRoots.add(root);
      selectedPatches.set(part.id, { detail_overrides: {} });
    }
    reattached.push({
      part_id: part.id,
      part_key: part.part_key,
      part_name: part.part_name,
      reattach_type: builderOverride ? "builder_override" : "inventory_replacement",
      previous_inventory_item_id: part.inventory_item_id || part.original_inventory_item_id || "",
      current_inventory_item_id: part.reattach_candidate_id || part.inventory_item_id || "",
      previous_inventory_name: part.inventory_item_name || "",
      current_inventory_name: part.reattach_candidate_name || part.inventory_item_name || "",
      frozen_unit_cost: num2(part.frozen_unit_cost),
      frozen_extended_cost: num2(part.frozen_extended_cost),
      cleared_detail_overrides: part.detail_overrides || {},
      source_path: part.source_path
    });
  }
  const sourcePatch = {};
  changedRoots.forEach((root) => {
    sourcePatch[root] = patchedSource[root];
  });
  const inventoryRowsOverride = /* @__PURE__ */ new Map();
  for (const part of allParts) {
    if (part.builder_sync_state !== "manual_addon" || !part.inventory_entity || !part.inventory_item_id || part.manual_cost_override) continue;
    const row = await staffEntities[part.inventory_entity].get(part.inventory_item_id);
    if (!row) throw new Error(`${part.inventory_entity} inventory could not be verified for Part \u201C${part.part_name || "Part"}\u201D.`);
    inventoryRowsOverride.set(`${part.inventory_entity}:${part.inventory_item_id}`, row);
  }
  const existingPartsForSync = allParts.map(
    (part) => selectedPatches.has(part.id) ? { ...part, ...selectedPatches.get(part.id) } : part
  );
  const timestamp = nowIso();
  const plannedSummary = await syncBuilderParts({
    builderProduct: builder,
    sourceProject: patchedSource,
    acceptPrices: false,
    legacyMode: false,
    catalogsOverride: catalogs,
    strictCatalogs: true,
    existingPartsOverride: existingPartsForSync,
    inventoryRowsOverride,
    planOnly: true,
    planTimestamp: timestamp
  });
  const plannedPartUpdates = (plannedSummary.partWritePlan || []).map(
    (step) => step.operation !== "create" && selectedPatches.has(step.part_id) ? { ...step, patch: { ...selectedPatches.get(step.part_id), ...step.patch || {} } } : step
  );
  const remainingDetached = (plannedSummary.parts || []).filter(requiresBuilderReattach).sort((a, b) => num2(a.sort_order) - num2(b.sort_order)).map((part) => ({
    ...part,
    can_reattach: part.builder_sync_state === "detached_override" || !!part.reattach_candidate_id
  }));
  const builderPatch = {
    builder_snapshot: patchedSource,
    builder_snapshot_at: timestamp,
    builder_snapshot_source_updated_date: timestamp,
    part_count: plannedSummary.partCount,
    detached_part_count: remainingDetached.length,
    needs_reattach_review: remainingDetached.length > 0,
    price_state: remainingDetached.length > 0 ? "detached_parts" : "changed",
    last_price_check_at: timestamp,
    builder_version: num2(builder.builder_version, 1) + 1
  };
  const linePatch = {
    detached_part_count: remainingDetached.length,
    needs_reattach_review: remainingDetached.length > 0,
    price_state: remainingDetached.length > 0 ? "detached_parts" : "changed",
    last_price_check_at: timestamp
  };
  const revision = {
    builder_product_id: builder.id,
    estimate_id: builder.estimate_id || "",
    reason: "reattach",
    previous_total_cost: num2(builder.frozen_cost),
    new_total_cost: num2(builder.frozen_cost),
    previous_customer_price: num2(builder.frozen_customer_price, num2(builder.frozen_cost)),
    new_customer_price: num2(builder.frozen_customer_price, num2(builder.frozen_cost)),
    changed_parts: reattached,
    builder_snapshot_before: beforeSnapshot,
    builder_snapshot_after: patchedSource,
    price_snapshot_before: { total: num2(builder.frozen_cost), pricing_accepted: false },
    price_snapshot_after: { total: num2(builder.frozen_cost), pricing_accepted: false },
    notes: `Reattached ${reattached.length} Part${reattached.length === 1 ? "" : "s"}. Frozen pricing was preserved; a separate Update Price action is required to accept recalculated pricing.`
  };
  const operationKey = `builder_reattach_parts:${builder.id}:${num2(builder.builder_version, 1)}:${builderMutationHash({
    estimate_updated_date: estimate.updated_date || "",
    source_updated_date: source.updated_date || "",
    selected_parts: selected.map((part) => ({ id: part.id, updated_date: part.updated_date || "", candidate: part.reattach_candidate_id || "", state: part.builder_sync_state })),
    source_patch: sourcePatch,
    part_updates: plannedPartUpdates
  })}`;
  const recoveryMarker = {
    key: operationKey,
    kind: "builder_reattach_parts",
    started_at: timestamp,
    estimate_id: estimate.id,
    estimate_line_id: line.line_id || builder.estimate_line_id || "",
    builder_product_id: builder.id,
    target_part_ids: selected.map((part) => part.id),
    builder_updated_date_before: builder.updated_date || "",
    builder_version_before: num2(builder.builder_version, 1),
    source_entity: builder.source_entity,
    source_project_id: builder.source_project_id,
    source_updated_date_before: source.updated_date || "",
    source_patch: sourcePatch,
    patched_source: patchedSource,
    part_acceptance_plan: {
      timestamp,
      part_updates: plannedPartUpdates,
      changed_parts: reattached,
      active_part_count: plannedSummary.partCount
    },
    builder_patch: builderPatch,
    line_patch: linePatch,
    revision
  };
  const latestSource = await staffEntities[builder.source_entity].get(builder.source_project_id);
  if (!latestSource) throw new Error("The Builder source project could not be verified before starting reattachment.");
  if (source.updated_date && latestSource.updated_date && source.updated_date !== latestSource.updated_date) {
    throw new Error("The Builder source project changed in another session before reattachment started. No source or Part changes were written.");
  }
  const marked = await markBuilderMutationPending({ estimate, builder, pending: recoveryMarker });
  await resumeBuilderMutation({
    estimateId: estimate.id,
    estimate: marked.markedEstimate,
    builder: marked.currentBuilder,
    parts: marked.currentParts,
    line: marked.markedLine,
    pending: marked.canonicalPending,
    applyPartPlan: applyBuilderPartPriceAcceptancePlan
  });
  return {
    reattached,
    remainingDetached,
    builderProject: patchedSource
  };
}
export {
  acceptBuilderPartPrices,
  applyBuilderPartPriceAcceptancePlan,
  detachBuilderPartOverride,
  extractBuilderParts,
  getDetachedBuilderParts,
  loadBuilderCatalogs,
  loadVerifiedBuilderPartSyncInputs,
  pricingSnapshot,
  reattachBuilderParts,
  syncBuilderParts,
  updateDetachedPartOverride
};

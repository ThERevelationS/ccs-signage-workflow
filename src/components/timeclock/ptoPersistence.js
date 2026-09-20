import { base44 } from "@/api/base44Client";
import {
  expectedEntityFields,
  replaceEntityFieldsIfUnchanged,
} from "@/components/estimator/builder/builderEntityPersistence";

function normalize(value) {
  if (Array.isArray(value)) return value.map(normalize);
  if (!value || typeof value !== "object") return value;
  return Object.keys(value).sort().reduce((out, key) => {
    out[key] = normalize(value[key]);
    return out;
  }, {});
}

function sameValue(a, b) {
  return JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));
}

function fieldsMatch(record, data, fields) {
  return fields.every(field => sameValue(record?.[field], data?.[field]));
}

async function verifySingleMatch({ rows, label }) {
  if (!Array.isArray(rows)) throw new Error(`${label} lookup did not return a record list.`);
  if (rows.length > 1) throw new Error(`${label} found ${rows.length} matching records. No ambiguous record was changed; review the duplicates first.`);
  return rows[0] || null;
}

export async function createPendingTimeOffRequestIfAbsent({
  entity,
  data,
  label = "Time off request",
} = {}) {
  const userEmail = String(data?.user_email || "").trim().toLowerCase();
  if (!userEmail || typeof entity?.filter !== "function" || typeof entity?.create !== "function") {
    throw new Error(`${label} could not initialize its retry-safe create.`);
  }

  const query = {
    user_email: userEmail,
    request_type: data.request_type,
    start_date: data.start_date,
    end_date: data.end_date,
    status: "pending",
    archived_test_data: { $ne: true },
  };
  const desired = { ...data, user_email: userEmail, status: "pending" };
  const compareFields = ["user_email", "request_type", "start_date", "end_date", "hours_requested", "reason", "status"];

  const existing = await verifySingleMatch({ rows: await entity.filter(query), label });
  if (existing?.id) {
    if (!fieldsMatch(existing, desired, compareFields)) {
      throw new Error(`${label} already has a pending request for these dates/type with different details. Edit the existing request instead of creating another.`);
    }
    return { record: existing, status: "existing" };
  }

  let created = null;
  let createError = null;
  try {
    created = await entity.create(desired);
  } catch (error) {
    createError = error;
  }

  const afterRows = await entity.filter(query).catch(error => {
    if (createError) throw createError;
    throw error;
  });
  if (!Array.isArray(afterRows)) throw new Error(`${label} final verification did not return a record list.`);
  if (afterRows.length > 1) {
    throw new Error(`${label} was submitted concurrently more than once. No time-off record was deleted automatically; an admin must review the duplicate pending requests.`);
  }
  if (afterRows.length === 1) {
    const saved = afterRows[0];
    if (!fieldsMatch(saved, desired, compareFields)) {
      throw new Error(`${label} was created concurrently with different details. Reload and review the saved pending request.`);
    }
    return { record: saved, status: created?.id === saved.id ? "created" : "verified_existing" };
  }

  if (createError) throw createError;
  throw new Error(`${label} could not verify whether the request was created. Do not retry blindly; reload requests first.`);
}

export async function updatePendingTimeOffRequestIfUnchanged({
  entity,
  request,
  nextFields,
  label = "Time off request",
} = {}) {
  if (String(request?.status || "") !== "pending") {
    throw new Error(`${label} is no longer pending and cannot be edited from this screen.`);
  }
  return replaceEntityFieldsIfUnchanged({
    entity,
    id: request?.id,
    expectedUpdatedAt: request?.updated_date || "",
    expectedFields: expectedEntityFields(request, nextFields),
    nextFields,
    guardFields: { user_email: request?.user_email, status: "pending" },
    label,
  });
}

function requireAdminCapability(adminCapability, label) {
  const capability = String(adminCapability || "").trim();
  if (!capability) throw new Error(`${label} requires an active Admin Settings authorization.`);
  return capability;
}

async function invokePTOConfig(payload) {
  try {
    const response = await base44.functions.invoke("managePTOConfig", payload);
    return response?.data || response;
  } catch (error) {
    const wrapped = new Error(error?.response?.data?.error || error?.message || "PTO configuration could not be changed safely.");
    wrapped.retrySameRequest = error?.response?.data?.retry_same_request === true;
    wrapped.confirmedServerResponse = Boolean(error?.response);
    wrapped.status = Number(error?.response?.status || 0);
    throw wrapped;
  }
}

function newPTORequestId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `pto-assign-${Date.now()}-${Math.random().toString(36).slice(2, 14)}`;
}

function ptoAssignmentStorageKey(userEmail) {
  return `ccs_pto_balance_assign:${String(userEmail || "").trim().toLowerCase()}`;
}

function storedPTOAssignment(userEmail) {
  try {
    const raw = sessionStorage.getItem(ptoAssignmentStorageKey(userEmail));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const requestId = String(parsed?.request_id || "");
    return requestId.length >= 8 && requestId.length <= 128 && parsed?.payload
      ? { request_id: requestId, payload: parsed.payload }
      : null;
  } catch {
    return null;
  }
}

function persistPTOAssignment(userEmail, requestId, payload) {
  try { sessionStorage.setItem(ptoAssignmentStorageKey(userEmail), JSON.stringify({ request_id: requestId, payload })); } catch {}
}

function clearPTOAssignment(userEmail) {
  try { sessionStorage.removeItem(ptoAssignmentStorageKey(userEmail)); } catch {}
}

function shouldRetainPTOAssignment(error) {
  if (error?.retrySameRequest === true) return true;
  if (Number(error?.status || 0) >= 500) return true;
  if (error?.confirmedServerResponse === true) return false;
  return true;
}

function ptoPolicyDeleteStorageKey(policyId) {
  return `ccs_pto_policy_delete:${String(policyId || "").trim()}`;
}

function storedPTOPolicyDelete(policyId) {
  try {
    const raw = sessionStorage.getItem(ptoPolicyDeleteStorageKey(policyId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const requestId = String(parsed?.request_id || "");
    return requestId.length >= 8 && requestId.length <= 128 && parsed?.payload
      ? { request_id: requestId, payload: parsed.payload }
      : null;
  } catch {
    return null;
  }
}

function persistPTOPolicyDelete(policyId, requestId, payload) {
  try { sessionStorage.setItem(ptoPolicyDeleteStorageKey(policyId), JSON.stringify({ request_id: requestId, payload })); } catch {}
}

function clearPTOPolicyDelete(policyId) {
  try { sessionStorage.removeItem(ptoPolicyDeleteStorageKey(policyId)); } catch {}
}

function ptoPolicyUpdateStorageKey(policyId) {
  return `ccs_pto_policy_update:${String(policyId || "").trim()}`;
}

function storedPTOPolicyUpdate(policyId) {
  try {
    const raw = sessionStorage.getItem(ptoPolicyUpdateStorageKey(policyId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const requestId = String(parsed?.request_id || "");
    return requestId.length >= 8 && requestId.length <= 128 && parsed?.payload
      ? { request_id: requestId, payload: parsed.payload }
      : null;
  } catch {
    return null;
  }
}

function persistPTOPolicyUpdate(policyId, requestId, payload) {
  try { sessionStorage.setItem(ptoPolicyUpdateStorageKey(policyId), JSON.stringify({ request_id: requestId, payload })); } catch {}
}

function clearPTOPolicyUpdate(policyId) {
  try { sessionStorage.removeItem(ptoPolicyUpdateStorageKey(policyId)); } catch {}
}

const PTO_POLICY_CREATE_STORAGE_KEY = "ccs_pto_policy_create";

function storedPTOPolicyCreate() {
  try {
    const raw = sessionStorage.getItem(PTO_POLICY_CREATE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const requestId = String(parsed?.request_id || "");
    return requestId.length >= 8 && requestId.length <= 128 && parsed?.payload
      ? { request_id: requestId, payload: parsed.payload }
      : null;
  } catch {
    return null;
  }
}

function persistPTOPolicyCreate(requestId, payload) {
  try { sessionStorage.setItem(PTO_POLICY_CREATE_STORAGE_KEY, JSON.stringify({ request_id: requestId, payload })); } catch {}
}

function clearPTOPolicyCreate() {
  try { sessionStorage.removeItem(PTO_POLICY_CREATE_STORAGE_KEY); } catch {}
}

export async function createPTOPolicyIfAbsent({ data, adminCapability, label = "PTO policy" } = {}) {
  const payload = { action: "create", data };
  const stored = storedPTOPolicyCreate();
  if (stored && JSON.stringify(stored.payload) !== JSON.stringify(payload)) {
    throw new Error(`${label} has an earlier create whose outcome is still uncertain. Retry that preserved create before changing the policy settings.`);
  }

  const requestId = stored?.request_id || newPTORequestId();
  persistPTOPolicyCreate(requestId, payload);

  try {
    const result = await invokePTOConfig({
      ...payload,
      request_id: requestId,
      admin_capability: requireAdminCapability(adminCapability, label),
    });
    if (!result?.record?.id) throw new Error(`${label} create could not be verified.`);
    clearPTOPolicyCreate();
    return result;
  } catch (error) {
    if (!shouldRetainPTOAssignment(error)) clearPTOPolicyCreate();
    throw error;
  }
}

export async function updatePTOPolicyIfUnchanged({ policy, nextFields, adminCapability, label = "PTO policy" } = {}) {
  if (!policy?.id || !policy?.updated_date) throw new Error(`${label} is no longer loaded. Reload before saving.`);

  const payload = {
    action: "update",
    id: policy.id,
    expected_updated_date: policy.updated_date,
    next_fields: nextFields,
  };
  const stored = storedPTOPolicyUpdate(policy.id);
  if (stored && JSON.stringify(stored.payload) !== JSON.stringify(payload)) {
    throw new Error(`${label} has an earlier update whose outcome is still uncertain. Retry that preserved update before changing the policy again.`);
  }
  const requestId = stored?.request_id || newPTORequestId();
  persistPTOPolicyUpdate(policy.id, requestId, payload);

  try {
    const result = await invokePTOConfig({
      ...payload,
      request_id: requestId,
      admin_capability: requireAdminCapability(adminCapability, label),
    });
    if (!result?.record?.id) throw new Error(`${label} update could not be verified.`);
    clearPTOPolicyUpdate(policy.id);
    return result.record;
  } catch (error) {
    if (!shouldRetainPTOAssignment(error)) clearPTOPolicyUpdate(policy.id);
    throw error;
  }
}

export async function deletePTOPolicyIfUnused({ policy, adminCapability, label = "PTO policy" } = {}) {
  if (!policy?.id || !policy?.updated_date) throw new Error(`${label} is no longer loaded. Reload before deleting.`);

  const payload = {
    action: "delete",
    id: policy.id,
    expected_updated_date: policy.updated_date,
  };
  const stored = storedPTOPolicyDelete(policy.id);
  if (stored && JSON.stringify(stored.payload) !== JSON.stringify(payload)) {
    throw new Error(`${label} has an earlier deletion whose outcome is still uncertain. Retry that preserved deletion before using a different policy version.`);
  }
  const requestId = stored?.request_id || newPTORequestId();
  persistPTOPolicyDelete(policy.id, requestId, payload);

  try {
    const result = await invokePTOConfig({
      ...payload,
      request_id: requestId,
      admin_capability: requireAdminCapability(adminCapability, label),
    });
    if (result?.deleted !== true) throw new Error(`${label} deletion could not be verified.`);
    clearPTOPolicyDelete(policy.id);
    return result;
  } catch (error) {
    if (!shouldRetainPTOAssignment(error)) clearPTOPolicyDelete(policy.id);
    throw error;
  }
}

export async function assignPTOBalanceIfUnchanged({
  existingBalance,
  data,
  adminCapability,
  label = "Employee PTO balance",
} = {}) {
  const userEmail = String(data?.user_email || existingBalance?.user_email || "").trim().toLowerCase();
  const policyId = String(data?.policy_id || "").trim();
  if (!userEmail || !policyId) {
    throw new Error(`${label} requires an employee and PTO policy.`);
  }

  const payload = {
    action: "assign_balance",
    user_email: userEmail,
    policy_id: policyId,
    expected_updated_date: existingBalance?.updated_date || "",
  };
  const stored = storedPTOAssignment(userEmail);
  if (stored && JSON.stringify(stored.payload) !== JSON.stringify(payload)) {
    throw new Error(`${label} has an earlier assignment whose outcome is still uncertain. Retry that preserved assignment before choosing a different policy.`);
  }

  const requestId = stored?.request_id || newPTORequestId();
  persistPTOAssignment(userEmail, requestId, payload);

  try {
    const result = await invokePTOConfig({
      ...payload,
      request_id: requestId,
      admin_capability: requireAdminCapability(adminCapability, label),
    });
    if (!result?.record?.id) throw new Error(`${label} assignment could not be verified.`);
    clearPTOAssignment(userEmail);
    return result.record;
  } catch (error) {
    if (!shouldRetainPTOAssignment(error)) clearPTOAssignment(userEmail);
    throw error;
  }
}

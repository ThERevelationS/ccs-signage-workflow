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
    throw new Error(error?.response?.data?.error || error?.message || "PTO configuration could not be changed safely.");
  }
}

export async function createPTOPolicyIfAbsent({ data, adminCapability, label = "PTO policy" } = {}) {
  const result = await invokePTOConfig({
    action: "create",
    data,
    admin_capability: requireAdminCapability(adminCapability, label),
  });
  if (!result?.record?.id) throw new Error(`${label} create could not be verified.`);
  return result;
}

export async function updatePTOPolicyIfUnchanged({ policy, nextFields, adminCapability, label = "PTO policy" } = {}) {
  if (!policy?.id || !policy?.updated_date) throw new Error(`${label} is no longer loaded. Reload before saving.`);
  const result = await invokePTOConfig({
    action: "update",
    id: policy.id,
    expected_updated_date: policy.updated_date,
    next_fields: nextFields,
    admin_capability: requireAdminCapability(adminCapability, label),
  });
  if (!result?.record?.id) throw new Error(`${label} update could not be verified.`);
  return result.record;
}

export async function deletePTOPolicyIfUnused({ policy, adminCapability, label = "PTO policy" } = {}) {
  if (!policy?.id || !policy?.updated_date) throw new Error(`${label} is no longer loaded. Reload before deleting.`);
  return invokePTOConfig({
    action: "delete",
    id: policy.id,
    expected_updated_date: policy.updated_date,
    admin_capability: requireAdminCapability(adminCapability, label),
  });
}

export async function assignPTOBalanceIfUnchanged({
  entity,
  existingBalance,
  data,
  label = "Employee PTO balance",
} = {}) {
  const userEmail = String(data?.user_email || existingBalance?.user_email || "").trim().toLowerCase();
  if (!userEmail || typeof entity?.filter !== "function" || typeof entity?.create !== "function") {
    throw new Error(`${label} could not initialize its concurrency-safe assignment.`);
  }

  if (existingBalance?.id) {
    const nextFields = {
      policy_id: data.policy_id,
      balances: data.balances,
      floating_holidays_remaining: data.floating_holidays_remaining,
    };
    return replaceEntityFieldsIfUnchanged({
      entity,
      id: existingBalance.id,
      expectedUpdatedAt: existingBalance.updated_date || "",
      expectedFields: expectedEntityFields(existingBalance, nextFields),
      nextFields,
      guardFields: { user_email: existingBalance.user_email },
      label,
    });
  }

  const desired = { ...data, user_email: userEmail };
  const existing = await verifySingleMatch({ rows: await entity.filter({ user_email: userEmail }), label });
  if (existing?.id) {
    if (!fieldsMatch(existing, desired, Object.keys(desired))) {
      throw new Error(`${label} for ${userEmail} was created in another session with different values. Reload before assigning a policy.`);
    }
    return existing;
  }

  let createError = null;
  try {
    await entity.create(desired);
  } catch (error) {
    createError = error;
  }
  const afterRows = await entity.filter({ user_email: userEmail }).catch(error => {
    if (createError) throw createError;
    throw error;
  });
  const saved = await verifySingleMatch({ rows: afterRows, label });
  if (saved?.id) {
    if (!fieldsMatch(saved, desired, Object.keys(desired))) {
      throw new Error(`${label} for ${userEmail} was created concurrently with different values. Reload before changing it.`);
    }
    return saved;
  }
  if (createError) throw createError;
  throw new Error(`${label} could not verify whether the balance assignment was created.`);
}

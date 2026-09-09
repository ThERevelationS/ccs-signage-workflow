import {
  deleteEntityIfUnchanged,
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

export async function createPTOPolicyIfAbsent({ entity, data, label = "PTO policy" } = {}) {
  const name = String(data?.name || "").trim();
  if (!name || typeof entity?.filter !== "function" || typeof entity?.create !== "function") {
    throw new Error(`${label} could not initialize its retry-safe create.`);
  }
  const desired = { ...data, name };
  const existing = await verifySingleMatch({ rows: await entity.filter({ name }), label });
  if (existing?.id) {
    if (!fieldsMatch(existing, desired, Object.keys(desired))) {
      throw new Error(`${label} named "${name}" already exists with different settings. Edit the existing policy instead.`);
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
  const afterRows = await entity.filter({ name }).catch(error => {
    if (createError) throw createError;
    throw error;
  });
  const saved = await verifySingleMatch({ rows: afterRows, label });
  if (saved?.id) {
    if (!fieldsMatch(saved, desired, Object.keys(desired))) {
      throw new Error(`${label} named "${name}" was created concurrently with different settings. Reload before editing it.`);
    }
    return { record: saved, status: created?.id === saved.id ? "created" : "verified_existing" };
  }
  if (createError) throw createError;
  throw new Error(`${label} could not verify whether the policy was created.`);
}

export async function updatePTOPolicyIfUnchanged({ entity, policy, nextFields, label = "PTO policy" } = {}) {
  return replaceEntityFieldsIfUnchanged({
    entity,
    id: policy?.id,
    expectedUpdatedAt: policy?.updated_date || "",
    expectedFields: expectedEntityFields(policy, nextFields),
    nextFields,
    guardFields: { name: policy?.name },
    label,
  });
}

export async function deletePTOPolicyIfUnused({
  policyEntity,
  balanceEntity,
  policy,
  label = "PTO policy",
} = {}) {
  if (!policy?.id || typeof balanceEntity?.filter !== "function") {
    throw new Error(`${label} could not verify whether it is assigned to employees.`);
  }
  const assigned = await balanceEntity.filter({ policy_id: policy.id });
  if (!Array.isArray(assigned)) throw new Error(`${label} assignment lookup did not return a record list.`);
  if (assigned.length > 0) {
    throw new Error(`${label} is assigned to ${assigned.length} employee balance record${assigned.length === 1 ? "" : "s"}. Reassign those employees before deleting the policy.`);
  }
  return deleteEntityIfUnchanged({
    entity: policyEntity,
    record: policy,
    guardFields: { name: policy.name },
    label,
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

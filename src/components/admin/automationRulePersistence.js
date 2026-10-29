import { base44 } from "@/api/base44Client";

// Failures marked pre-dispatch are thrown before any request reaches the
// server. Callers can safely release write locks and surface the message;
// only post-dispatch failures need uncertain-outcome recovery.
function preDispatchError(message) {
  const error = new Error(message);
  error.automationPreDispatch = true;
  return error;
}

function requireCapability(adminCapability, label) {
  const capability = String(adminCapability || "").trim();
  if (!capability) {
    throw preDispatchError(`${label} requires a current Admin Settings authorization. Lock and unlock Admin Settings before retrying.`);
  }
  return capability;
}

async function invokeMutation(payload, label) {
  try {
    const response = await base44.functions.invoke("manageAutomationConfig", payload);
    const data = response?.data || response;
    if (data?.error) throw new Error(data.error);
    return data || {};
  } catch (error) {
    const message = error?.response?.data?.error || error?.message || `${label} could not be saved safely.`;
    throw new Error(message);
  }
}

export async function createAutomationRuleIfAbsent({ data, adminCapability, label = "Automation Rule" } = {}) {
  const name = String(data?.name || "").trim();
  if (!name) throw preDispatchError(`${label} requires a name.`);
  return invokeMutation({
    action: "automation_create",
    admin_capability: requireCapability(adminCapability, label),
    data: { ...data, name },
  }, label);
}

export async function updateAutomationRuleIfUnchanged({ record, nextFields, exactVersion = true, adminCapability, label = "Automation Rule" } = {}) {
  if (!record?.id) throw preDispatchError(`${label} is no longer loaded. Reload before saving.`);
  const capability = requireCapability(adminCapability, label);

  if (!exactVersion) {
    if (typeof record.enabled !== "boolean" || nextFields?.enabled !== !record.enabled) {
      throw preDispatchError(`${label} enabled-state change could not be verified locally.`);
    }
    const result = await invokeMutation({
      action: "automation_toggle",
      admin_capability: capability,
      id: record.id,
      expected_enabled: record.enabled,
    }, label);
    if (!result?.record?.id) throw new Error(`${label} enabled state could not be verified.`);
    return result.record;
  }

  // Keep a bounded in-record history so admins can see what changed and
  // restore a previous configuration from the rule card.
  const historyEntry = {
    at: new Date().toISOString(),
    snapshot: {
      name: record.name,
      triggers: record.triggers,
      actions: record.actions,
      enabled: record.enabled,
      priority: record.priority,
    },
  };
  const fieldsWithHistory = {
    ...(nextFields && typeof nextFields === "object" ? nextFields : {}),
    history: [...(Array.isArray(record.history) ? record.history : []), historyEntry].slice(-10),
  };
  const result = await invokeMutation({
    action: "automation_update",
    admin_capability: capability,
    id: record.id,
    expected_updated_date: String(record.updated_date || ""),
    next_fields: fieldsWithHistory,
  }, label);
  if (!result?.record?.id) throw new Error(`${label} update could not be verified.`);
  return result.record;
}

export async function deleteAutomationRuleIfUnchanged({ record, adminCapability, label = "Automation Rule" } = {}) {
  if (!record?.id) throw preDispatchError(`${label} is no longer loaded. Reload before deleting.`);
  return invokeMutation({
    action: "automation_delete",
    admin_capability: requireCapability(adminCapability, label),
    id: record.id,
    expected_updated_date: String(record.updated_date || ""),
  }, label);
}
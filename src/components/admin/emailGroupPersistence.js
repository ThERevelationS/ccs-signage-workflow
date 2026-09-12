import { base44 } from "@/api/base44Client";

function requireCapability(adminCapability, label) {
  const capability = String(adminCapability || "").trim();
  if (!capability) {
    throw new Error(`${label} requires a current Admin Settings authorization. Lock and unlock Admin Settings before retrying.`);
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

export async function createEmailGroupIfAbsent({ data, adminCapability, label = "Email group" } = {}) {
  const name = String(data?.name || "").trim();
  if (!name || !Array.isArray(data?.emails) || data.emails.length === 0) {
    throw new Error(`${label} requires a name and at least one email address.`);
  }
  return invokeMutation({
    action: "email_group_create",
    admin_capability: requireCapability(adminCapability, label),
    data: { ...data, name },
  }, label);
}

export async function updateEmailGroupIfUnchanged({ group, nextFields, adminCapability, label = "Email group" } = {}) {
  if (!group?.id) throw new Error(`${label} is no longer loaded. Reload before saving.`);
  const result = await invokeMutation({
    action: "email_group_update",
    admin_capability: requireCapability(adminCapability, label),
    id: group.id,
    expected_updated_date: String(group.updated_date || ""),
    next_fields: nextFields,
  }, label);
  if (!result?.record?.id) throw new Error(`${label} update could not be verified.`);
  return result.record;
}

export async function deleteEmailGroupIfUnused({ group, adminCapability, label = "Email group deletion" } = {}) {
  if (!group?.id) throw new Error(`${label} is no longer loaded. Reload before deleting.`);
  return invokeMutation({
    action: "email_group_delete",
    admin_capability: requireCapability(adminCapability, label),
    id: group.id,
    expected_updated_date: String(group.updated_date || ""),
  }, label);
}

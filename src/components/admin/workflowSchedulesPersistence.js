import { base44 } from "@/api/base44Client";

function preDispatchError(message) {
  const error = new Error(message);
  error.schedulePreDispatch = true;
  return error;
}

function requireCapability(adminCapability, label) {
  const capability = String(adminCapability || "").trim();
  if (!capability) {
    throw preDispatchError(`${label} requires a current Admin Settings authorization. Lock and unlock Admin Settings before retrying.`);
  }
  return capability;
}

async function invoke(payload, label) {
  try {
    const response = await base44.functions.invoke("manageWorkflowSchedules", payload);
    const data = response?.data || response;
    if (data?.error) {
      const error = new Error(data.error);
      error.code = data?.code || null;
      error.status = Number(data?.status || 0) || null;
      throw error;
    }
    return data || {};
  } catch (error) {
    if (error?.schedulePreDispatch || error?.code) throw error;
    const message = error?.response?.data?.error || error?.message || `${label} could not be completed safely.`;
    const wrapped = new Error(message);
    wrapped.code = error?.response?.data?.code || null;
    throw wrapped;
  }
}

export async function listWorkflowSchedules({ adminCapability } = {}) {
  const result = await invoke({
    action: "list",
    admin_capability: requireCapability(adminCapability, "Scheduled jobs"),
  }, "Scheduled jobs");
  return result?.rows || [];
}

export async function listWorkflowRuns({ workflowId, adminCapability } = {}) {
  if (!workflowId) throw preDispatchError("A job is required to load runs.");
  const result = await invoke({
    action: "runs",
    admin_capability: requireCapability(adminCapability, "Job runs"),
    workflow_id: workflowId,
  }, "Job runs");
  return result?.runs || [];
}

export async function updateWorkflowSchedule({ workflowId, cronExpression, timezone, expectedCron, expectedTimezone, requestId, adminCapability } = {}) {
  if (!workflowId) throw preDispatchError("A job is required to update its schedule.");
  const id = String(requestId || "").trim() || crypto.randomUUID();
  return invoke({
    action: "update_schedule",
    admin_capability: requireCapability(adminCapability, "Schedule update"),
    workflow_id: workflowId,
    cron_expression: cronExpression,
    timezone,
    expected_cron: expectedCron,
    expected_timezone: expectedTimezone,
    request_id: id,
  }, "Schedule update");
}

export async function setWorkflowStatus({ workflowId, desiredStatus, expectedStatus, requestId, adminCapability } = {}) {
  if (!workflowId) throw preDispatchError("A job is required to change its status.");
  const id = String(requestId || "").trim() || crypto.randomUUID();
  return invoke({
    action: "set_status",
    admin_capability: requireCapability(adminCapability, "Status change"),
    workflow_id: workflowId,
    desired_status: desiredStatus,
    expected_status: expectedStatus,
    request_id: id,
  }, "Status change");
}

export async function adoptExternalWorkflowChange({ workflowId, adminCapability } = {}) {
  if (!workflowId) throw preDispatchError("A job is required.");
  return invoke({
    action: "adopt_external",
    admin_capability: requireCapability(adminCapability, "Schedule sync"),
    workflow_id: workflowId,
  }, "Schedule sync");
}

export async function listWorkflowScheduleHistory({ workflowId, limit = 50, adminCapability } = {}) {
  const result = await invoke({
    action: "history",
    admin_capability: requireCapability(adminCapability, "Schedule history"),
    workflow_id: workflowId || undefined,
    limit,
  }, "Schedule history");
  return result?.rows || [];
}

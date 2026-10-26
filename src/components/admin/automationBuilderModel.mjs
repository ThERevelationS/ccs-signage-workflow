export const AUTOMATION_PRESETS = [
  { name: "Email admins when a permit is approved", trigger: "permit_approved", subject: "Permit approved: {{title}}" },
  { name: "Email admins about overdue orders", trigger: "order_date_needed_passed", subject: "Order overdue: {{customer_name}}" },
  { name: "Email admins about a new bug report", trigger: "feature_report_submitted", condition: { record_type: "bug" }, subject: "New bug report: {{record_title}}" },
  { name: "Email admins about a regulation alert", trigger: "regulation_alert_created", subject: "Regulation alert: {{jurisdiction_name}}" },
];

export function draftFromPreset(preset) {
  return {
    formData: { name: preset.name, enabled: false, priority: 0 },
    triggers: [{ trigger_type: preset.trigger, trigger_condition: { ...preset.condition }, logic: "or" }],
    actions: [{ action_type: "send_email", action_config: {
      recipients: [{ type: "all_admins" }], subject: preset.subject,
      body: "Please review this update. Changed by {{changed_by}} at {{timestamp}}.",
    } }],
  };
}

export function recordFilterFields(type = "") {
  if (type.startsWith("feature_report_")) return [
    ["record_type", "Report type", ["bug", "feature", "improvement"]],
    ["record_status", "Report status", ["open", "in_progress", "completed"]],
    ["record_priority", "Priority", ["low", "medium", "high", "critical"]],
  ];
  if (type.startsWith("sales_")) return [
    ["record_stage", "Opportunity stage", ["new", "qualified", "estimating", "quoted", "follow_up", "on_hold", "won", "lost"]],
    ["record_priority", "Priority", ["low", "normal", "high", "rush"]],
  ];
  if (type.startsWith("user_")) return [["record_role", "Account role", null]];
  if (type.startsWith("jurisdiction_")) return [
    ["record_state", "State (for example OH)", null],
    ["record_type", "Jurisdiction type", ["county", "city", "village", "township", "municipality"]],
  ];
  if (type === "regulation_alert_created") return [["record_severity", "Severity", ["low", "medium", "high", "critical"]]];
  if (type.startsWith("pending_import_") || type === "duplicate_detected") return [
    ["record_doc_type", "Import type", ["estimate", "invoice", "duplicate"]],
  ];
  return [];
}

export function destinationWorkOrderId(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  try {
    const url = new URL(text);
    if (!["http:", "https:"].includes(url.protocol)) return "";
    return url.searchParams.get("wo") || url.searchParams.get("id") || "";
  } catch {
    return /^[a-zA-Z0-9_-]+$/.test(text) ? text : "";
  }
}

export function draftProblems(triggers, actions, needsDestination = false) {
  const problems = [];
  if (!triggers?.length || triggers.some(t => !t?.trigger_type)) problems.push("Choose an event for every When row.");
  if (!actions?.length || actions.some(a => !a?.action_type)) problems.push("Choose an action for every Then row.");
  for (const trigger of triggers || []) {
    const c = trigger?.trigger_condition || {};
    if (c.min_quantity != null && c.max_quantity != null && Number(c.min_quantity) > Number(c.max_quantity)) {
      problems.push("Minimum quantity cannot be greater than maximum quantity.");
    }
  }
  for (const action of actions || []) {
    const c = action?.action_config || {};
    if (action.action_type === "send_email" && !(c.recipients || []).some(r =>
      ["all_admins", "assigned_user", "creator"].includes(r.type) || String(r.value || "").trim())) {
      problems.push("Choose who should receive the email.");
    }
    if (needsDestination && action.action_type === "send_email" && (c.recipients || []).some(r =>
      ["assigned_user", "creator"].includes(r.type))) {
      problems.push("For record events, choose an email address, email group, or all admins instead of a Work Order recipient.");
    }
    if (action.action_type === "add_task" && !String(c.task || "").trim()) problems.push("Enter the task text.");
    if (action.action_type === "add_note" && !String(c.note || "").trim()) problems.push("Enter the note text.");
    if (needsDestination && ["add_task", "add_note"].includes(action.action_type) && !destinationWorkOrderId(c.target_work_order_id)) {
      problems.push("Choose a destination Work Order by pasting its link or ID.");
    }
  }
  return [...new Set(problems)];
}

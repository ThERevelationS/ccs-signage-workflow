import {
  LEAD_SOURCE_ALIASES,
  reconcilePicklistOptions,
  smartsheetPersonLabelForUser,
} from "./smartsheetTranslationModel.js";
import { reviewedCustomAssigneeNames, resolveSmartsheetTaskAssignee } from "./smartsheetTaskAssigneeModel.js";

// Keep this aligned with the Sales Pipeline's missing-setting fallback.
export const DEFAULT_SALES_LEAD_SOURCES = Object.freeze([
  "Walk-in", "Phone", "Email", "Referral", "Website",
]);
export const ORDER_REQUEST_TYPES = Object.freeze([
  "Substrate", "Vinyl", "Supplies", "Other",
]);

function matchedColumn(result, fieldName) {
  if (result?.status !== "ready") return null;
  const field = result.analysis?.fields?.find((item) => item.field === fieldName);
  return field?.status === "matched" && field.matches?.length === 1 ? field.matches[0] : null;
}

function displayName(user) {
  return String(user?.full_name || "").trim();
}

export function buildSmartsheetVocabularyReview({
  liveMappingAnalysis,
  leadSources = DEFAULT_SALES_LEAD_SOURCES,
  leadSourcesSaved = false,
  taskDescriptions = [],
  authorizedUsers = [],
  customAssigneeSetting = null,
} = {}) {
  const sourceColumn = matchedColumn(liveMappingAnalysis?.sales, "lead_source");
  const taskColumn = matchedColumn(liveMappingAnalysis?.sales, "current_task_description");
  const ownerColumn = matchedColumn(liveMappingAnalysis?.sales, "current_task_assigned_to");
  const requestTypeColumn = matchedColumn(liveMappingAnalysis?.orders, "request_type");
  if (!sourceColumn || !taskColumn || !ownerColumn || !requestTypeColumn) {
    return { ready: false, reason: "Fresh matching columns are required for a vocabulary comparison." };
  }

  const source = reconcilePicklistOptions({
    base44Options: leadSources,
    smartsheetOptions: sourceColumn.options || [],
    aliases: LEAD_SOURCE_ALIASES,
  });
  const tasks = reconcilePicklistOptions({
    base44Options: taskDescriptions.map((item) => typeof item === "string" ? item : item?.text),
    smartsheetOptions: taskColumn.options || [],
  });
  const orderTypes = reconcilePicklistOptions({
    base44Options: ORDER_REQUEST_TYPES,
    smartsheetOptions: requestTypeColumn.options || [],
  });

  // A Smartsheet label is resolved only against an eligible, non-disabled
  // Base44 task-assignee. Unknown labels never become a guessed user.
  const eligibleUsers = authorizedUsers.filter((user) =>
    user?.is_active !== false &&
    displayName(user) &&
    Array.isArray(user.sales_roles) &&
    user.sales_roles.includes("Task Assigned")
  );
  const ownerOptions = Array.isArray(ownerColumn.options) ? ownerColumn.options : [];
  const customNames = reviewedCustomAssigneeNames(customAssigneeSetting?.setting_value, liveMappingAnalysis?.sales?.sheet?.id, ownerColumn.id);
  const confirmedCustomOwners = [];
  const resolvedOwners = [];
  const unresolvedOwners = [];
  const ambiguousOwners = [];
  const representedUserNames = new Set();

  for (const option of ownerOptions) {
    const resolved = resolveSmartsheetTaskAssignee(option, eligibleUsers, customNames);
    if (resolved.custom) {
      confirmedCustomOwners.push(resolved.name);
    } else if (resolved.user) {
      resolvedOwners.push({ option, full_name: displayName(resolved.user), match: resolved.state });
      representedUserNames.add(displayName(resolved.user).toLowerCase());
    } else if (resolved.state === "ambiguous") {
      ambiguousOwners.push({ option, candidates: resolved.candidates.map(displayName) });
    } else if (resolved.state === "unresolved") {
      unresolvedOwners.push(option);
    }
  }

  const base44OnlyOwners = eligibleUsers.filter(
    (user) => !representedUserNames.has(displayName(user).toLowerCase())
  ).map((user) => ({
    full_name: displayName(user),
    suggested_option: smartsheetPersonLabelForUser(user, ownerOptions, eligibleUsers),
  }));

  return {
    ready: true,
    source: { ...source, savedSetting: leadSourcesSaved, validated: sourceColumn.validation === true },
    tasks: { ...tasks, validated: taskColumn.validation === true },
    orderTypes: { ...orderTypes, validated: requestTypeColumn.validation === true },
    owners: {
      customNames,
      confirmedCustom: confirmedCustomOwners,
      resolved: resolvedOwners,
      unresolved: unresolvedOwners,
      ambiguous: ambiguousOwners,
      base44Only: base44OnlyOwners,
      validated: ownerColumn.validation === true,
    },
  };
}

export function smartsheetVocabularyReadyForBinding(review) {
  return Boolean(
    review?.ready &&
    review.source?.synchronized &&
    review.tasks?.synchronized &&
    review.orderTypes?.synchronized &&
    review.owners?.unresolved?.length === 0 &&
    review.owners?.ambiguous?.length === 0 &&
    (review.owners?.validated === false || review.owners?.base44Only?.length === 0)
  );
}

export function formatSmartsheetVocabularyReview(review) {
  if (!review?.ready) return "Vocabulary comparison unavailable; do not assume the option lists are synchronized.";
  const lines = [
    "BASE44 ↔ SMARTSHEET VOCABULARY REVIEW — READ ONLY",
    "Suggested additions are NOT saved or automatically approved.",
    review.source.savedSetting
      ? "Lead Source: saved Base44 options compared with live Smartsheet."
      : "Lead Source: no saved Base44 setting; Sales Pipeline fallback options compared with live Smartsheet.",
  ];
  for (const [name, section] of [
    ["Lead Source", review.source],
    ["Current Task Description", review.tasks],
    ["Order Request Type", review.orderTypes],
  ]) {
    lines.push(
      name + ": " + (section.synchronized ? "synchronized" : "differences found") +
      "; add to Base44: " + (section.addToBase44.join(", ") || "none") +
      "; add to Smartsheet: " + (section.addToSmartsheet.join(", ") || "none")
    );
  }
  lines.push(
    "Task Assigned: resolved: " + (review.owners.resolved.map((item) => item.option + " → " + item.full_name).join(", ") || "none"),
    "Task Assigned: confirmed custom labels (NOT user identities): " + ((review.owners.confirmedCustom || []).join(", ") || "none"),
    "Task Assigned: unreviewed Smartsheet labels (identity or custom-name confirmation required): " + (review.owners.unresolved.join(", ") || "none"),
    "Task Assigned: ambiguous labels (manual identity review): " +
      (review.owners.ambiguous.map((item) => item.option + " [" + item.candidates.join("/") + "]").join(", ") || "none"),
    "Task Assigned: active Base44 users absent from Smartsheet choices (suggested only): " +
      (review.owners.base44Only.map((item) => item.full_name + " [" + item.suggested_option + "]").join(", ") || "none"),
    "A label such as Lost or Completed Sale in Current Task is NOT an authoritative sales outcome.",
  );
  return lines.join("\n");
}
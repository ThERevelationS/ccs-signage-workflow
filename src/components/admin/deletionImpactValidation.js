// Validate the complete read-only deletion-impact contract before displaying
// it as a verified admin report. Unknown/incomplete schemas fail closed.
const HISTORY_ENTITIES = [
  "TimeEntry", "TimeClockAudit", "TimeOffRequest", "TimeClockBreak",
  "TimeClockWorkPause", "TimeClockCorrectionRequest", "TimeClockLaborSegment",
  "ImportJob",
];
const ACCOUNT_STATE_ENTITIES = [
  "TimeClockEmployeeState", "TimeClockBadge", "UserPTOBalance",
  "UserCalendarSettings", "UserCapacity", "UserCredential",
  "FleetDashboardPreference",
];
const OWNERSHIP_ENTITIES = [
  "AllInOneEstimate", "BuilderProduct", "BuilderPart", "BuilderPartGroup",
  "QuickProduct", "PartTemplate", "ProjectTemplate", "EstimateClipboardItem",
  "CustomerSummary", "FoundationProject", "ChannelLetterInstallation",
  "VinylProject", "CNCProject", "LaserProject", "MetalProject",
  "MaintenanceProject", "Project", "BrickStoneProject", "Report", "SaveColor",
];
const ASSIGNMENT_ENTITIES = ["WorkOrder", "GeneralTask", "CalendarEvent"];

const isObject = value => value !== null && typeof value === "object" && !Array.isArray(value);
const clean = value => typeof value === "string" ? value.trim() : "";
const email = value => clean(value).toLowerCase();
const isCount = value => Number.isSafeInteger(value) && value >= 0;
const invalid = () => new Error("Account deletion impact could not be verified safely. Reload the requests before reviewing.");

function validCountList(rows, requiredEntities) {
  if (!Array.isArray(rows) || rows.length !== requiredEntities.length) return false;
  const names = new Set();
  for (const row of rows) {
    if (!isObject(row) || !requiredEntities.includes(row.entity) ||
        names.has(row.entity) || !isCount(row.count)) return false;
    names.add(row.entity);
  }
  return names.size === requiredEntities.length;
}

/**
 * Reject malformed, partial, stale or cross-account results. Server-side
 * authorization remains mandatory; this guards admin presentation only.
 */
export function validateDeletionImpactReport(report, loadedRequest) {
  if (!isObject(report) || report.read_only !== true ||
      !isObject(loadedRequest) || !clean(loadedRequest.id) ||
      !clean(loadedRequest.updated_date) || !email(loadedRequest.user_email) ||
      !clean(loadedRequest.authorized_email_id)) throw invalid();

  const request = report.request;
  const target = report.target;
  if (!isObject(request) || !isObject(target) ||
      clean(request.id) !== clean(loadedRequest.id) ||
      clean(request.updated_date) !== clean(loadedRequest.updated_date) ||
      email(request.user_email) !== email(loadedRequest.user_email) ||
      clean(request.authorized_email_id) !== clean(loadedRequest.authorized_email_id) ||
      request.status !== loadedRequest.status ||
      email(target.email) !== email(loadedRequest.user_email) ||
      clean(target.authorized_email_id) !== clean(loadedRequest.authorized_email_id) ||
      typeof target.authorized_email_exists !== "boolean" ||
      !isCount(target.base44_user_count) ||
      !Array.isArray(target.base44_user_ids) ||
      !target.base44_user_ids.every(id => !!clean(id)) ||
      new Set(target.base44_user_ids).size !== target.base44_user_ids.length ||
      target.base44_user_ids.length !== target.base44_user_count) throw invalid();

  if (!validCountList(report.history, HISTORY_ENTITIES) ||
      !validCountList(report.account_state, ACCOUNT_STATE_ENTITIES) ||
      !validCountList(report.ownership, OWNERSHIP_ENTITIES) ||
      !isObject(report.assignments) ||
      Object.keys(report.assignments).length !== ASSIGNMENT_ENTITIES.length ||
      !ASSIGNMENT_ENTITIES.every(key => isCount(report.assignments[key])) ||
      !Array.isArray(report.blockers) ||
      !report.blockers.every(blocker => typeof blocker === "string" && !!clean(blocker))) {
    throw invalid();
  }
  return report;
}

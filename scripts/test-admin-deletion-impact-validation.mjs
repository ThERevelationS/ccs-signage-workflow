import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { validateDeletionImpactReport } from "../src/components/admin/deletionImpactValidation.js";

const history = ["TimeEntry", "TimeClockAudit", "TimeOffRequest", "TimeClockBreak",
  "TimeClockWorkPause", "TimeClockCorrectionRequest", "TimeClockLaborSegment", "ImportJob"];
const state = ["TimeClockEmployeeState", "TimeClockBadge", "UserPTOBalance",
  "UserCalendarSettings", "UserCapacity", "UserCredential", "FleetDashboardPreference"];
const ownership = ["AllInOneEstimate", "BuilderProduct", "BuilderPart", "BuilderPartGroup",
  "QuickProduct", "PartTemplate", "ProjectTemplate", "EstimateClipboardItem",
  "CustomerSummary", "FoundationProject", "ChannelLetterInstallation",
  "VinylProject", "CNCProject", "LaserProject", "MetalProject",
  "MaintenanceProject", "Project", "BrickStoneProject", "Report", "SaveColor"];
const rowList = names => names.map(entity => ({ entity, count: 0 }));
const request = {
  id: "synthetic-request-1",
  updated_date: "2026-10-10T10:00:00.000Z",
  user_email: "employee@example.invalid",
  authorized_email_id: "synthetic-authorized-1",
  status: "pending",
};
function validReport() {
  return {
    request: { ...request },
    target: {
      email: request.user_email, authorized_email_id: request.authorized_email_id,
      authorized_email_exists: true, base44_user_count: 1,
      base44_user_ids: ["synthetic-user-1"],
    },
    history: rowList(history),
    account_state: rowList(state),
    ownership: rowList(ownership),
    assignments: { WorkOrder: 2, GeneralTask: 0, CalendarEvent: 1 },
    blockers: ["Synthetic historical reference needs review"],
    read_only: true,
  };
}
const clone = value => structuredClone(value);
const mustReject = (label, mutate, loaded = request) => {
  const report = validReport();
  mutate(report);
  assert.throws(
    () => validateDeletionImpactReport(report, loaded),
    error => error instanceof Error && error.message.includes("could not be verified") &&
      !error.message.includes("employee@example.invalid"), label,
  );
};

test("Complete, identity-bound report returns unchanged, including valid zero counts", () => {
  const report = validReport();
  assert.equal(validateDeletionImpactReport(report, request), report);
  report.blockers = [];
  report.target.base44_user_count = 0;
  report.target.base44_user_ids = [];
  assert.equal(validateDeletionImpactReport(report, request), report);
});

test("Fail closed for missing, stale or cross-identity request/target", () => {
  mustReject("Wrong request id", r => { r.request.id = "other-request"; });
  mustReject("Newer request version", r => { r.request.updated_date = "2026-10-10T11:00:00Z"; });
  mustReject("Wrong request email", r => { r.request.user_email = "other@example.invalid"; });
  mustReject("Wrong target email", r => { r.target.email = "other@example.invalid"; });
  mustReject("Wrong authorized record", r => { r.target.authorized_email_id = "other"; });
  mustReject("Request authorized mapping mismatch", r => { r.request.authorized_email_id = "other"; });
  mustReject("Request changed status", r => { r.request.status = "processed"; });
  mustReject("Missing version on loaded request", () => {}, { ...request, updated_date: "" });
  mustReject("Missing request authorized identity", () => {}, { ...request, authorized_email_id: "" });
  mustReject("Invalid status", () => {}, { ...request, status: "unknown" });
});

test("Fail closed for incomplete/corrupt scan sections, without invented zero values", () => {
  mustReject("Missing history", r => { delete r.history; });
  mustReject("Missing account state", r => { r.account_state = null; });
  mustReject("Missing ownership count", r => { r.ownership.pop(); });
  mustReject("Duplicate entity", r => { r.history[0].entity = r.history[1].entity; });
  mustReject("Unknown entity", r => { r.history[0].entity = "UnexpectedEntity"; });
  mustReject("NaN count", r => { r.history[0].count = NaN; });
  mustReject("Negative count", r => { r.account_state[0].count = -1; });
  mustReject("String count", r => { r.ownership[0].count = "2"; });
  mustReject("Fractional count", r => { r.assignments.WorkOrder = 1.2; });
  mustReject("Infinite count", r => { r.assignments.WorkOrder = Infinity; });
  mustReject("Missing assignment category", r => { delete r.assignments.CalendarEvent; });
  mustReject("Bogus assignment category", r => { r.assignments.Unknown = 0; });
  mustReject("Missing blockers", r => { delete r.blockers; });
  mustReject("Object blocker", r => { r.blockers.push({ note: "bad" }); });
  mustReject("Partial target", r => { delete r.target.authorized_email_exists; });
  mustReject("Corrupt user count", r => { r.target.base44_user_count = -1; });
  mustReject("Inconsistent user IDs", r => { r.target.base44_user_ids = []; });
  mustReject("Duplicated user IDs", r => { r.target.base44_user_ids = ["synthetic-user-1", "synthetic-user-1"]; });
  mustReject("Untrimmed user ID", r => { r.target.base44_user_ids = [" synthetic-user-1"]; });
});

test("Fail closed for malformed root or missing read-only proof", () => {
  assert.throws(() => validateDeletionImpactReport(null, request), /could not be verified/);
  assert.throws(() => validateDeletionImpactReport([], request), /could not be verified/);
  mustReject("Missing read-only marker", r => { delete r.read_only; });
  mustReject("String read-only marker", r => { r.read_only = "true"; });
  mustReject("False marker", r => { r.read_only = false; });
});

test("Client proxy validates backend reply before returning impact to UI", () => {
  const source = readFileSync("src/components/admin/authorizedUserAdminPersistence.js", "utf8");
  assert.match(source, /import \{ validateDeletionImpactReport \} from "\.\/deletionImpactValidation\.js"/);
  assert.match(source, /return validateDeletionImpactReport\(result\.impact, request\)/);
  assert.match(source, /!request\?\.updated_date \|\| !request\?\.user_email \|\| !request\?\.authorized_email_id/);
});

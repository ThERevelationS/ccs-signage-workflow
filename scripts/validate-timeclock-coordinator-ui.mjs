// Synthetic-only Time Clock manager-coordinator diagnostics UI regression.
// No live Base44 data or production network requests.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { transformSync } from "esbuild";
import vm from "node:vm";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import TestRenderer, { act } from "react-test-renderer";

const require = createRequire(import.meta.url);
const uiPath = new URL("../src/components/timeclock/CorrectionCoordinatorDiagnostics.jsx", import.meta.url);
const source = readFileSync(uiPath, "utf8");
const compiled = transformSync(source, {
  loader: "jsx", format: "cjs", jsx: "automatic", target: "es2022",
}).code;
const calls = [];
let nextRequest = 0;
const invoke = (functionName, payload) => new Promise((resolve, reject) => {
  assert.equal(functionName, "timeClockAction");
  assert.equal(payload.action, "admin_correction_gate_diagnostics");
  assert.ok(payload.session_token);
  assert.equal(Object.keys(payload).sort().join(","), "action,session_token");
  calls.push({ resolve, reject, payload, request: ++nextRequest });
});
const icon = () => React.createElement("svg");
const Button = ({ children, onClick, disabled, type, ...rest }) => React.createElement(
  "button", { onClick, disabled, type, "aria-label": rest["aria-label"] }, children,
);
const Badge = ({ children }) => React.createElement("span", null, children);
const module = { exports: {} };
vm.runInNewContext(compiled, {
  module, exports: module.exports,
  require: (id) => ({
    "@/api/base44Client": { base44: { functions: { invoke } } },
    "lucide-react": {
      AlertTriangle: icon, CheckCircle2: icon, Clock3: icon, RefreshCw: icon, ShieldAlert: icon,
    },
    "@/components/ui/button": { Button },
    "@/components/ui/badge": { Badge },
  })[id] || require(id),
  console, Date, Promise, String, Object, Array, Number,
}, { filename: "synthetic-manager-coordinator-ui.js", timeout: 4000 });
const Panel = module.exports.default;
const View = module.exports.CorrectionCoordinatorDiagnosticsView;
assert.equal(typeof Panel, "function");
assert.equal(typeof View, "function");
const render = (props) => renderToStaticMarkup(React.createElement(View, props));

const readyHtml = render({ status: "success", result: {
  success: true, read_only: true, coordinator_state: "ready", record_count: 1,
}, checkedAt: "10/13/2026, 8:00 AM" });
assert.match(readyHtml, /Manager Correction Coordinator/);
assert.match(readyHtml, /One clean, idle company coordinator/);
assert.match(readyHtml, /Last checked/);
assert.doesNotMatch(readyHtml, /release lock/i);
assert.match(render({ status: "idle" }), /Not checked/);
assert.match(render({ status: "loading" }), /Checking the latest authoritative/);
assert.match(render({ status: "error", error: "Network failed" }), /Do not assume manager corrections are available/);

const heldData = {
  success: true, read_only: true, coordinator_state: "claimed",
  record_count: 1, claim_kind: "manager_review",
  request_id: "synthetic-review-claim",
  correction_request_id: "synthetic-review-request",
  correction_request_status: "reviewing", review_request_binding_matches: true,
  time_entry_id: "synthetic-entry-id", entry_found: true,
  entry_request_marker_matches: false, applied_entry_snapshot_matches: false,
  correction_audit: { count: 0, outcomes: [], ownership_matches: false },
  review_audit: { count: 1, outcomes: ["pending"], ownership_matches: true },
  attention: "Coordinator held. Inspect evidence.",
};
const heldHtml = render({ status: "success", result: heldData });
assert.match(heldHtml, /Needs investigation/);
assert.match(heldHtml, /synthetic-review-request/);
assert.match(heldHtml, /Pending|pending/);
assert.match(heldHtml, /ownership missing or inconsistent/);
assert.match(heldHtml, /A held claim is not safe to clear/);
assert.match(heldHtml, /Safe investigation steps/);
assert.match(heldHtml, /correction_review audit/);
assert.match(heldHtml, /linked Punch Exception/);
assert.match(heldHtml, /read-only investigation/i);
assert.doesNotMatch(heldHtml, /Release coordinator|Clear coordinator/);
const invalidHtml = render({ status: "success", result: {
  success: true, read_only: true, coordinator_state: "invalid_setup",
  record_count: 0, attention: "Exactly one company coordinator required",
} });
assert.match(invalidHtml, /Setup problem/);
assert.match(invalidHtml, /Exactly one company coordinator required/);
assert.match(invalidHtml, /Do not add another coordinator blindly/);
const invalidStateHtml = render({ status: "success", result: {
  success: true, read_only: true, coordinator_state: "invalid_state",
  record_count: 1, attention: "Malformed coordinator metadata",
} });
assert.match(invalidStateHtml, /do not change its status manually/);
const directHtml = render({ status: "success", result: {
  ...heldData, claim_kind: "direct_manager_correction",
} });
assert.match(directHtml, /Confirm the admin_correction audit/);
assert.doesNotMatch(directHtml, /linked Punch Exception/);
const escapedHtml = render({ status: "success", result: { ...heldData,
  attention: "<script>unsafe</script>" },
});
assert.doesNotMatch(escapedHtml, /<script>/);
assert.match(escapedHtml, /&lt;script&gt;/);
console.log("PASS coordinator diagnostics render ready, claimed, setup errors and safe evidence");

const clicked = [];
const investigateView = TestRenderer.create(React.createElement(View, {
  status: "success", result: heldData,
  availableEntryIds: ["synthetic-entry-id"],
  onViewShift: (id) => clicked.push(["shift", id]),
  onInspectAudits: (id) => clicked.push(["audit", id]),
}));
const investigateButtons = investigateView.root.findAllByType(Button);
assert.equal(investigateButtons.length, 3);
const viewShift = investigateButtons.find((item) =>
  String(item.props.children).includes("View shift details"));
const viewAudits = investigateButtons.find((item) =>
  String(item.props.children).includes("Inspect shift audit history"));
assert.ok(viewShift && viewAudits);
act(() => { viewShift.props.onClick(); viewAudits.props.onClick(); });
assert.deepEqual(clicked, [
  ["shift", "synthetic-entry-id"], ["audit", "synthetic-entry-id"],
]);
investigateView.unmount();
const unavailableShift = render({ status: "success", result: heldData,
  availableEntryIds: [], onViewShift() {}, onInspectAudits() {} });
assert.doesNotMatch(unavailableShift, /View shift details/);
assert.match(unavailableShift, /Inspect shift audit history/);
const unknownEntry = render({ status: "success",
  result: { ...heldData, time_entry_id: "", entry_found: false },
  availableEntryIds: [], onViewShift() {}, onInspectAudits() {} });
assert.doesNotMatch(unknownEntry, /Inspect shift audit history/);
assert.match(unknownEntry, /no available shift navigation/i);
const healthyNoActions = render({ status: "success", result: {
  success: true, read_only: true, coordinator_state: "ready", record_count: 1,
}, availableEntryIds: ["synthetic-entry-id"], onViewShift() {}, onInspectAudits() {} });
assert.doesNotMatch(healthyNoActions, /View shift details|Inspect shift audit history/);
console.log("PASS coordinator investigation steps and shift/audit navigation remain strictly read-only");

const adminSource = readFileSync(new URL("../src/components/timeclock/TimeClockAdmin.jsx", import.meta.url), "utf8");
assert.match(adminSource, /import CorrectionCoordinatorDiagnostics from/);
assert.match(adminSource, /<CorrectionCoordinatorDiagnostics[\s\S]*?sessionToken=\{sessionToken\}/);
assert.match(adminSource, /<TimeClockExceptionCenter/);
assert.ok(adminSource.indexOf("<CorrectionCoordinatorDiagnostics") <
  adminSource.indexOf("<TimeClockExceptionCenter"),
  "Coordinator must be visible before Needs Attention");
assert.match(adminSource, /availableEntryIds=\{timeEntries\.map\(\(entry\) => entry\.id\)\}/);
assert.match(adminSource, /onInspectAudits=\{\(entryId\) => \{[\s\S]*?mode: "integrity"/);
assert.match(adminSource, /onViewShift=\{\(entryId\) => \{[\s\S]*?setDetailEntry\(entry\)/);
assert.doesNotMatch(source, /base44\.entities\.TimeClockAdminCorrectionGate/);
assert.doesNotMatch(source, /action: ["'](?:release|reset|clear|recover)/);
console.log("PASS manager panel wired into Time Clock without client-side coordinator writes");

let renderer;
await act(async () => { renderer = TestRenderer.create(React.createElement(Panel, { sessionToken: "synthetic-admin-one" })); });
assert.equal(calls.length, 1);
assert.equal(calls[0].payload.session_token, "synthetic-admin-one");
assert.match(JSON.stringify(renderer.toJSON()), /Checking/);

await act(async () => { calls[0].resolve({ data: {
  success: true, read_only: true, coordinator_state: "ready", record_count: 1,
} }); });
assert.match(JSON.stringify(renderer.toJSON()), /One clean, idle company coordinator/);
console.log("PASS verified healthy coordinator status is shown only after server confirmation");

await act(async () => { renderer.update(React.createElement(Panel, { sessionToken: "synthetic-admin-two" })); });
assert.equal(calls.length, 2);
assert.equal(calls[1].payload.session_token, "synthetic-admin-two");
assert.doesNotMatch(JSON.stringify(renderer.toJSON()), /One clean, idle company coordinator/);
const pendingRefresh = renderer.root.findByProps({
  "aria-label": "Refresh manager correction coordinator status",
});
assert.equal(pendingRefresh.props.disabled, true,
  "Refresh is disabled while a server check is pending");
assert.equal(calls.length, 2);
await act(async () => { calls[1].resolve({ data: heldData }); });
assert.match(JSON.stringify(renderer.toJSON()), /Needs investigation/);
assert.match(JSON.stringify(renderer.toJSON()), /synthetic-review-claim/);

await act(async () => { renderer.root.findByProps({
  "aria-label": "Refresh manager correction coordinator status",
}).props.onClick(); });
assert.equal(calls.length, 3);
assert.doesNotMatch(JSON.stringify(renderer.toJSON()), /synthetic-review-claim/,
  "Refreshing must hide potentially outdated held-claim evidence");
await act(async () => { calls[2].reject(new Error("Synthetic server unavailable")); });
assert.match(JSON.stringify(renderer.toJSON()), /Check failed/);
assert.match(JSON.stringify(renderer.toJSON()), /Synthetic server unavailable/);
assert.doesNotMatch(JSON.stringify(renderer.toJSON()), /One clean, idle company coordinator/);
console.log("PASS refresh/error states fail closed without displaying stale health");

await act(async () => { renderer.update(React.createElement(Panel, { sessionToken: "synthetic-admin-three" })); });
assert.equal(calls.length, 4);
await act(async () => { renderer.update(React.createElement(Panel, { sessionToken: "synthetic-admin-four" })); });
assert.equal(calls.length, 5);
await act(async () => { calls[3].resolve({ data: {
  success: true, read_only: true, coordinator_state: "ready",
} }); });
assert.doesNotMatch(JSON.stringify(renderer.toJSON()), /One clean, idle company coordinator/,
  "Old session response must not overwrite new session data");
await act(async () => { calls[4].resolve({ data: heldData }); });
assert.match(JSON.stringify(renderer.toJSON()), /Needs investigation/);
await act(async () => { renderer.unmount(); });
console.log("PASS session switches invalidate old pending diagnostic responses");
console.log("PASS 4/4 Time Clock coordinator UI regression groups");

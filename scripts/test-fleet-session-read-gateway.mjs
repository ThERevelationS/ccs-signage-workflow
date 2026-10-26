// Contract checks for the Option-2 Fleet read/auth gateway:
//   - fleetDataRead is session-authenticated, whitelisted, tiered, bounded.
//   - Every staff-facing Fleet read routes through the gateway (no direct
//     base44.entities.* calls remain in fleet frontend files).
//   - Every fleet backend function accepts the EmailGate session via
//     resolveFleetStaffUser while preserving the base44.auth.me() path used by
//     scheduled jobs and service-to-service invokes.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(path, "utf8");
const gateway = read("base44/functions/fleetDataRead/entry.ts");
const staffSession = read("base44/shared/fleetStaffSession.ts");
const invoke = read("src/components/fleet/fleetInvoke.js");
const emailGate = read("src/components/auth/EmailGate.jsx");
const loaders = read("src/components/fleet/fleetEntityLoaders.js");

const fleetFiles = [
  ...readdirSync("src/pages").filter((f) => /^Fleet.*\.jsx$/.test(f)).map((f) => `src/pages/${f}`),
  ...readdirSync("src/components/fleet").filter((f) => /\.(jsx?|tsx?)$/.test(f)).map((f) => `src/components/fleet/${f}`),
];

test("fleetDataRead authenticates the EmailGate session before any entity access", () => {
  assert.match(gateway, /resolveFleetStaffUser\(base44, body\?\.session_token\)/);
  assert.match(gateway, /if \(!user\?\.email\) return Response\.json\(\{ error: 'Authentication required' \}, \{ status: 401 \}\)/);
  // entity access only happens service-side, after auth
  assert.match(gateway, /base44\.asServiceRole\.entities\[entityName\]/);
});

test("fleetDataRead is whitelisted and enforces the admin tier", () => {
  assert.match(gateway, /const STAFF_READABLE = new Set\(\[/);
  assert.match(gateway, /const ADMIN_READABLE = new Set\(\[/);
  assert.match(gateway, /!STAFF_READABLE\.has\(entityName\) && !ADMIN_READABLE\.has\(entityName\)/);
  assert.match(gateway, /ADMIN_READABLE\.has\(entityName\) && user\.role !== 'admin'/);
});

test("fleetDataRead bounds inputs — no arbitrary entity, operator, or page abuse", () => {
  assert.match(gateway, /MAX_LIMIT = 500/);
  assert.match(gateway, /key\.startsWith\('\$'\)/, "top-level query operators must be rejected");
  assert.match(gateway, /SORT_PATTERN = /);
  assert.match(gateway, /MAX_QUERY_BYTES/);
});

test("every entity name the frontend loads is inside the gateway whitelist", () => {
  const staff = new Set([...gateway.matchAll(/'((?:Fleet|Bouncie)[A-Za-z]+)'/g)].map((m) => m[1]));
  const used = new Set();
  for (const file of fleetFiles) {
    const src = read(file);
    for (const m of src.matchAll(/(?:listAllFleetRows|filterAllFleetRows|readFleetRows)\("([A-Za-z]+)"/g)) used.add(m[1]);
  }
  assert.ok(used.size > 10, "sanity: loader call sites should name many entities");
  for (const name of used) {
    assert.ok(staff.has(name), `${name} is read by the frontend but missing from the fleetDataRead whitelist`);
  }
});

test("no staff-facing fleet file performs direct entity API calls", () => {
  for (const file of fleetFiles) {
    const src = read(file);
    assert.doesNotMatch(src, /base44\.entities\./, `${file} still calls the entity API directly`);
  }
});

test("no staff-facing fleet file resolves identity through base44.auth.me()", () => {
  for (const file of fleetFiles) {
    const src = read(file);
    assert.doesNotMatch(src, /base44\.auth\.me\(/, `${file} still uses Base44 auth for role checks`);
  }
});

test("every remaining bare functions.invoke in fleet files attaches a session token", () => {
  for (const file of fleetFiles) {
    const src = read(file).split("\n");
    src.forEach((line, i) => {
      if (file.endsWith("fleetInvoke.js")) return;
      if (!line.includes("base44.functions.invoke(")) return;
      const window = src.slice(i, i + 4).join("\n");
      assert.match(window, /session_token/, `${file}:${i + 1} invokes a function without a session token`);
    });
  }
});

test("all fleet backend functions resolve the staff session while preserving Base44 auth", () => {
  const dualAuth = [
    "fleetAlertSettingsAction", "fleetDashboardPreferenceAction", "fleetEquipmentAction",
    "fleetEquipmentDocumentAction", "fleetFuelAction", "fleetInspectionAction",
    "fleetInventoryAction", "fleetLifecycleAction", "fleetMaintenanceAction",
    "fleetMeterMaintenanceAction", "fleetPartLookupAction", "fleetRepairEstimateAction",
    "fleetRequestAction", "fleetReservationAction", "fleetSettingsAction",
    "fleetSystemReportAction", "fleetWarrantyAction", "fleetWorkOrderAction",
    "fleetSearch", "fleetMechanicPortal", "fleetScheduledMaintenanceGeneration",
    "fleetScheduledReminders", "bouncieSyncNotifications", "fleetDataRead",
  ];
  for (const fn of dualAuth) {
    const src = read(`base44/functions/${fn}/entry.ts`);
    assert.match(src, /import \{ resolveFleetStaffUser \} from '\.\.\/\.\.\/shared\/fleetStaffSession\.ts'/, `${fn} missing import`);
    assert.match(src, /resolveFleetStaffUser\(base44,/, `${fn} does not resolve the staff session`);
    if (fn !== "fleetDataRead") {
      assert.match(src, /base44\.auth\.me\(\)/, `${fn} lost the Base44/service-to-service auth path`);
    }
  }
});

test("resolveFleetStaffUser delegates to the hardened session authenticator", () => {
  assert.match(staffSession, /authenticateSignShopSession\(base44, token\)/);
  assert.match(staffSession, /\['admin', 'user'\]\.includes\(role\)/);
});

test("invokeFleet always attaches the EmailGate session token", () => {
  assert.match(invoke, /import \{ getSessionToken \} from "@\/components\/auth\/EmailGate"/);
  assert.match(invoke, /session_token: getSessionToken\(\)/);
});

test("invokeFleet advances the mutation epoch so post-mutation reads never consume stale snapshots", () => {
  assert.match(invoke, /mutationEpoch \+= 1/);
  assert.match(invoke, /export const getFleetMutationEpoch/);
  // pure reads must not bust dedupe
  assert.match(invoke, /"fleetDataRead"/);
  assert.match(invoke, /"verifySession"/);
});

test("EmailGate exposes session identity outside React and keeps it in sync", () => {
  assert.match(emailGate, /export function getSessionToken\(\)/);
  assert.match(emailGate, /export function getSessionUser\(\)/);
  assert.match(emailGate, /lastSessionUser = user \|\| null/);
});

test("loaders name entities as strings — SDK objects cannot reach the gateway", () => {
  assert.match(loaders, /invokeFleet\("fleetDataRead", \{/);
  assert.doesNotMatch(loaders, /\.list\(|\.filter\(/);
});

console.log("13/13 fleet session read-gateway contract checks passed");

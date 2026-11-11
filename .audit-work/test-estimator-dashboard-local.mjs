// W-010 (DASH-10) — estimator dashboard local-only fixture.
// Read-only: the dashboard stays local — no provider/entity polling, no
// production writes, no secret exposure. Reuse a running instance if
// present; never stop/restart unrelated servers.
//
// Run: node .audit-work/test-estimator-dashboard-local.mjs

import { readFileSync, readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const gov = readFileSync(resolve(root, ".devin", "estimator-governance.md"), "utf8");

let pass = 0, fail = 0;
const check = (name, cond, detail = "") => {
  if (cond) { pass += 1; console.log(`  PASS ${name}`); }
  else { fail += 1; console.log(`  FAIL ${name} — ${detail}`); }
};

// ---- the governance doc carries the dashboard-is-local contract. ----
check("dashboard-is-local contract documented", /dashboard-is-local|dashboard.*local/i.test(gov));

// ---- the dashboard fixtures read the ledger only — no entity/provider
// polling or production-write code in the .audit-work test files. ----
const selfName = "test-estimator-dashboard-local.mjs"; // the self-scan would flag this file's own regex/comment text.
const dashboardFixtures = readdirSync(resolve(root, ".audit-work"))
  .filter((f) => /^test-estimator.*\.mjs$/.test(f) && f !== selfName);
const badFixture = dashboardFixtures.filter((f) => {
  const c = readFileSync(resolve(root, ".audit-work", f), "utf8");
  return /staffDataRead|staffEntityWrite|asServiceRole|base44\.(entities|integrations)\.|invoke\(|fetch\(.*base44|production/i.test(c);
});
check("dashboard fixtures are local/read-only (no entity polling or writes)", badFixture.length === 0,
  badFixture.join(",") || "none");

// ---- no secret exposure — the fixtures never read .env/token/secret. ----
const secretFixture = dashboardFixtures.filter((f) => {
  const c = readFileSync(resolve(root, ".audit-work", f), "utf8");
  return /\.env|api[_-]?key|secret|token|password|credential/i.test(c);
});
check("no secret exposure in the fixtures", secretFixture.length === 0,
  secretFixture.join(",") || "none");

console.log(`PASS estimator-dashboard-local: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

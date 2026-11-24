import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { transformSync } from "esbuild";

const source = readFileSync(
  new URL("../base44/functions/ensureCustomerSummary/entry.ts", import.meta.url),
  "utf8",
);
assert.match(source, /await authenticateSignShopSession\(base44, body\?\.session_token\)/);
assert.match(source, /const SourceProject = base44\.asServiceRole\.entities\[sourceEntityName\]/);
assert.match(source, /const Summary = base44\.asServiceRole\.entities\.CustomerSummary/);

const sourceValidation = source.indexOf("if (norm(sourceProject.client_name) !== normalizedName)");
const summaryServiceRole = source.indexOf("const Summary = base44.asServiceRole.entities.CustomerSummary");
const summaryWrite = source.indexOf("Summary.create({");
assert.ok(sourceValidation >= 0, "source project/customer association must be checked");
assert.ok(summaryServiceRole > sourceValidation, "service-role access is reached only after source authorization");
assert.ok(summaryWrite > summaryServiceRole, "CustomerSummary writes use the service-role entity");
assert.ok(!source.includes("base44.entities.CustomerSummary"), "request-user CustomerSummary entity is not used for persistence");

const transformed = transformSync(source.replace(/^import .*;\s*$/gm, ""), { loader: "ts", format: "cjs" }).code;
let handler;
let base44;
let staffUser = { id: "staff-user" };
const sandbox = {
  Deno: { serve: (fn) => { handler = fn; } },
  Response,
  console: { error: () => {} },
  setTimeout,
  createClientFromRequest: () => base44,
  withEntityRateLimitRetry: (client) => client,
  authenticateSignShopSession: async () => staffUser,
};
runInNewContext(transformed, sandbox);
const request = () => ({ json: async () => ({ session_token: "synthetic", client_name: "Acme", module: "channel_letter_installation", project_id: "project-1" }) });
function fixture(sourceGet) {
  const calls = { source: 0, userSource: 0, summary: 0 };
  const row = {
    id: "summary-1", updated_date: "v1", client_name: "Acme",
    summary_key: "customer_summary:v1:acme", estimate_number: "EST-1",
    linked_projects: [{ module: "channel_letter_installation", project_id: "project-1", project_name: "Test" }],
  };
  base44 = {
    auth: { me: async () => null },
    entities: { ChannelLetterInstallation: { get: async () => { calls.userSource++; throw new Error("RLS denied"); } } },
    asServiceRole: { entities: {
      ChannelLetterInstallation: { get: async (id) => { calls.source++; assert.equal(id, "project-1"); return sourceGet(); } },
      CustomerSummary: {
        list: async () => { calls.summary++; return [row]; },
        get: async () => row,
      },
    } },
  };
  return calls;
}
const found = { id: "project-1", client_name: "Acme", project_name: "Test", estimate_number: "EST-1" };
let calls = fixture(() => found);
let response = await handler(request());
assert.equal(response.status, 200);
assert.equal((await response.json()).summary.id, "summary-1");
assert.equal(calls.source, 1);
assert.equal(calls.userSource, 0);
assert.ok(calls.summary > 0);

for (const fault of [{ status: 404 }, { response: { status: 404 } }]) {
  calls = fixture(() => { throw Object.assign(new Error("missing"), fault); });
  response = await handler(request());
  assert.equal(response.status, 404);
  assert.equal(calls.summary, 0);
}
for (const status of [429, 503, 500]) {
  calls = fixture(() => { throw Object.assign(new Error("temporary read error"), { status }); });
  response = await handler(request());
  assert.equal(response.status, status);
  assert.notEqual(response.status, 404);
  assert.equal(calls.summary, 0);
}
calls = fixture(() => ({ ...found, client_name: "Other" }));
response = await handler(request());
assert.equal(response.status, 409);
assert.equal(calls.summary, 0);
staffUser = null;
calls = fixture(() => found);
response = await handler(request());
assert.equal(response.status, 401);
assert.equal(calls.source, 0);
console.log("PASS CustomerSummary service role, authenticated identity, 404-only missing, transient errors and client guard");
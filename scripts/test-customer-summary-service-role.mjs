import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(
  new URL("../base44/functions/ensureCustomerSummary/entry.ts", import.meta.url),
  "utf8",
);
assert.match(source, /await authenticateSignShopSession\(base44, body\?\.session_token\)/);
assert.match(source, /const SourceProject = base44\.entities\[sourceEntityName\]/);
assert.match(source, /const Summary = base44\.asServiceRole\.entities\.CustomerSummary/);

const sourceValidation = source.indexOf("if (norm(sourceProject.client_name) !== normalizedName)");
const summaryServiceRole = source.indexOf("const Summary = base44.asServiceRole.entities.CustomerSummary");
const summaryWrite = source.indexOf("Summary.create({");
assert.ok(sourceValidation >= 0, "source project/customer association must be checked");
assert.ok(summaryServiceRole > sourceValidation, "service-role access is reached only after source authorization");
assert.ok(summaryWrite > summaryServiceRole, "CustomerSummary writes use the service-role entity");
assert.ok(!source.includes("base44.entities.CustomerSummary"), "request-user CustomerSummary entity is not used for persistence");

console.log("PASS CustomerSummary service-role authorization contract (5 assertions)");

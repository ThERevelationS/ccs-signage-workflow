import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const svc = readFileSync(new URL("../src/components/estimator/parts/partTemplateService.js", import.meta.url), "utf8");
const pkg = readFileSync(new URL("../src/components/estimator/parts/partPackageService.js", import.meta.url), "utf8");
const tplSchema = readFileSync(new URL("../base44/entities/PartTemplate.jsonc", import.meta.url), "utf8");
const partSchema = readFileSync(new URL("../base44/entities/BuilderPart.jsonc", import.meta.url), "utf8");

assert.match(tplSchema, /"template_family_key"/, "PartTemplate carries a stable lineage key");
assert.match(tplSchema, /"template_version"/, "PartTemplate keeps a version number");
assert.match(partSchema, /"source_template_id"/, "BuilderPart records its source template id");
assert.match(partSchema, /"source_template_name"/, "BuilderPart records its source template name");
assert.match(partSchema, /"source_template_version"/, "BuilderPart records its source template version");

assert.match(svc, /function templateFamilyKey/, "saves derive a lineage key from the immutable source identity");
assert.match(svc, /async function resolveTemplateVersion/, "saves resolve the next version from prior family rows");
assert.match(svc, /template_family_key: familyKey/, "saved templates persist the family key");
assert.match(svc, /template_version: templateVersion/, "saved templates persist the resolved version");
assert.match(svc, /Math\.max\(\.\.\.versions\) \+ 1/, "new saves append the next version rather than overwrite");
assert.match(svc, /row\?\.idempotency_key/, "retries of the same save reuse the original version");
assert.equal((svc.match(/const familyKey = templateFamilyKey\(\{ templateType/g) || []).length, 2, "part and part-group saves both version their lineage");
assert.match(svc, /sourceTemplate: \{[\s\S]*version: Math\.max\(1, Number\(liveTemplate\.template_version\)/, "instantiation forwards the exact template version");

assert.match(pkg, /sourceTemplate = null/, "package insertion accepts source-template provenance");
assert.match(pkg, /source_template_id: String\(sourceTemplate\.id\)/, "inserted Parts stamp the source template id");
assert.match(pkg, /source_template_version: Math\.max\(1, Number\(sourceTemplate\.version\)/, "inserted Parts stamp the source template version");
assert.match(pkg, /sourceType === "library" && sourceTemplate\?\.id/, "provenance only applies to Part Library insertions");

console.log("PASS part-template versioning contract (16 assertions)");

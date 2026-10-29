// Contract test for the permitting picker + gateway write path.
// Asserts the picker's writes go through the staff gateway (not direct
// base44.entities), the allowlist covers the needed ops, and the resolver
// functions are rate-limit-wrapped.
import { readFileSync } from "node:fs";
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
let pass = 0, fail = 0;
const check = (name, ok) => { if (ok) pass++; else fail++; console.log(`${ok ? "PASS" : "FAIL"} ${name}`); };

const picker = read("src/components/permitting/LocalityPickerDialog.jsx");
const sew = read("base44/functions/staffEntityWrite/entry.ts");
const sdr = read("base44/functions/staffDataRead/entry.ts");

check("picker imports staffEntities", /import \{ staffEntities \}/.test(picker));
check("picker uses staffEntities.PermitLocality for draft create", /staffEntities\.PermitLocality/.test(picker));
check("picker uses staffEntities.JurisdictionProfile for repository", /staffEntities\.JurisdictionProfile/.test(picker));
check("picker does not call base44.entities for permitting entities", !/base44\.entities\.(PermitLocality|JurisdictionProfile|PermitLineItem)/.test(picker));
check("staffEntityWrite allows PermitLocality.create", sew.includes("PermitLocality: new Set(['create', 'update'])") || sew.includes("PermitLocality: new Set(['update', 'create'])"));
check("staffEntityWrite allows PermitLineItem update+delete", /PermitLineItem: new Set\(\[[^\]]*'update'[^\]]*'delete'[^\]]*\]\)/.test(sew));
check("staffEntityWrite admin-gates PermitLocality writes", /entityName === 'PermitLocality'[^}]*user\.role !== 'admin'/.test(sew));
check("staffDataRead allows PermitLocality", /'PermitLocality'/.test(sdr));
check("staffDataRead allows JurisdictionProfile", /'JurisdictionProfile'/.test(sdr));
check("staffDataRead allows PermitLineItem", /'PermitLineItem'/.test(sdr));
check("resolver wrapped with retry", /withEntityRateLimitRetry/.test(read("base44/functions/resolvePermittingAddress/entry.ts")));
check("findLocalityByAddress wrapped with retry", /withEntityRateLimitRetry/.test(read("base44/functions/findLocalityByAddress/entry.ts")));
check("permittingScanStatus wrapped with retry", /withEntityRateLimitRetry/.test(read("base44/functions/permittingScanStatus/entry.ts")));
check("staffDataRead wrapped with retry", /withEntityRateLimitRetry/.test(sdr));
check("staffEntityWrite wrapped with retry", /withEntityRateLimitRetry/.test(sew));
check("picker dedupes drafts via createPermitLocalityIfAbsent", /createPermitLocalityIfAbsent/.test(picker));
check("picker blocks non-admin draft create", /role!=="admin"|role !== "admin"/.test(picker));
check("picker handles canceled searches via searchVersion", /searchVersion/.test(picker));
check("PermitLocality dedupe respects jurisdiction_profile_id", sew.includes("jurisdiction_profile_id") && sew.includes("wantProfile"));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

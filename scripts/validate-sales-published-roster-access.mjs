import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const spreadsheet = readFileSync("src/components/sales/SalesPipelineSpreadsheet.jsx", "utf8");
const filterDialog = readFileSync("src/components/sales/CustomFilterDialog.jsx", "utf8");
const persistence = readFileSync("src/components/sales/salesFilterPersistence.js", "utf8");
const backend = readFileSync("base44/functions/manageSalesFilters/entry.ts", "utf8");
const authorizedSchema = readFileSync("base44/entities/AuthorizedEmail.jsonc", "utf8");

let checks = 0;
const check = (value, label) => { assert.ok(value, label); checks += 1; };
const count = (haystack, needle) => haystack.split(needle).length - 1;

check(authorizedSchema.includes('"data.email": "{{user.email}}"') &&
      authorizedSchema.includes('"role": "admin"'),
  "AuthorizedEmail frontend reads must remain RLS-restricted to self/admin");
check(backend.includes("authenticateSignShopSession(base44, body?.session_token)") &&
      backend.indexOf("authenticateSignShopSession(base44, body?.session_token)") < backend.indexOf("if (action === 'roster')"),
  "Sales roster backend action must authenticate the custom Sign Shop session before returning data");
check(backend.includes("base44.asServiceRole.entities.AuthorizedEmail") &&
      backend.includes("return Response.json({ users: await loadSalesRoster(AuthorizedEmail) });"),
  "Authenticated backend must read AuthorizedEmail through service role and return the limited Sales roster");
check(backend.includes("id: cleanText(row?.id, 200)") &&
      backend.includes("email: cleanEmail(row?.email)") &&
      backend.includes("full_name: cleanText(row?.full_name, 500)") &&
      backend.includes("sales_roles: Array.isArray(row?.sales_roles)") &&
      backend.includes("is_active: row?.is_active !== false"),
  "Sales roster response must contain only assignment-safe identity/role fields");
check(!backend.split("function salesRosterView")[1].split("async function loadSalesRoster")[0].match(/password|hr_data|face_descriptors|token/i),
  "Sales roster projection must not expose credential, HR, face, or token fields");

check(persistence.includes('action: "roster"') &&
      persistence.includes("session_token: requireSessionToken(sessionToken, label)") &&
      persistence.includes("if (!Array.isArray(result?.users))"),
  "Frontend Sales roster loader must use authenticated backend action and verify the response");

check(spreadsheet.includes('loadSalesPersonRosterSafely({ sessionToken, label: "Sales Pipeline authorized users" })'),
  "Published spreadsheet must load person identities through the authenticated Sales roster");
check(!spreadsheet.includes("base44.entities.AuthorizedEmail") &&
      !spreadsheet.includes("entity: AuthorizedEmail"),
  "Spreadsheet must not depend on RLS-protected direct AuthorizedEmail reads");
check(spreadsheet.includes("}, [recordScope, sessionToken]);"),
  "Spreadsheet roster/work-order load must rerun when the custom session token becomes available");
check(spreadsheet.includes("personValuesReferToSameUser(fieldValue, val, salesFilterUsersForField(field, users))"),
  "Custom Is/Equals user filters must still evaluate aliases against the authenticated roster");

check(filterDialog.includes('loadSalesPersonRosterSafely({ sessionToken, label: "Sales custom-filter users" })'),
  "Filter editor user choices must use the same authenticated Sales roster");
check(!filterDialog.includes("base44.entities.AuthorizedEmail") &&
      !filterDialog.includes("entity: AuthorizedEmail"),
  "Filter editor must not directly read the RLS-protected AuthorizedEmail entity");

same(count(spreadsheet, "AuthorizedEmail"), 0,
  "Spreadsheet must contain no remaining direct AuthorizedEmail dependency");
same(count(filterDialog, "AuthorizedEmail"), 0,
  "Filter dialog must contain no remaining direct AuthorizedEmail dependency");

function same(actual, expected, label) {
  assert.equal(actual, expected, label + "; expected " + expected + ", got " + actual);
  checks += 1;
}

console.log("Sales published roster access: " + checks + "/" + checks + " PASS.");

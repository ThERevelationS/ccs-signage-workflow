import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  canonicalSalesPersonRoster,
  salesPersonUsersForRole,
  buildSalesPersonSelectModel,
} from "../src/components/sales/salesPersonIdentity.mjs";
import { eligibleTaskAssignees } from "../src/components/admin/smartsheetTaskAssigneeModel.js";

let checks = 0;
const check = (condition, label) => { assert.ok(condition, label); checks += 1; };
const same = (actual, expected, label) => { assert.equal(actual, expected, label); checks += 1; };

const users = [
  { full_name: "Brett", email: "legacy-brett@example.com", sales_roles: ["Task Assigned", "Designer"] },
  { full_name: "Brett Heinlein", email: "brett@cincisigns.com", sales_roles: ["Estimator", "Project Manager"] },
  { full_name: "Brett Heinlein", email: "duplicate-brett@example.com", sales_roles: ["Office Administration"] },
  { full_name: "Twyla", email: "legacy-twyla@example.com", sales_roles: ["Task Assigned"] },
  { full_name: "Twyla Heinlein", email: "twyla@cincisigns.com", sales_roles: ["Estimator", "Project Manager"] },
  { full_name: "Alex", email: "alex@example.com", sales_roles: ["Task Assigned"] },
  { full_name: "Alex Smith", email: "alex.smith@example.com", sales_roles: ["Task Assigned"] },
  { full_name: "Alex Jones", email: "alex.jones@example.com", sales_roles: ["Task Assigned"] },
  { full_name: "Inactive Person", email: "inactive@example.com", is_active: false, sales_roles: ["Task Assigned"] },
];

const roster = canonicalSalesPersonRoster(users);
same(roster.filter((u) => u.full_name === "Brett Heinlein").length, 1,
  "Duplicate full-name Brett records must collapse to one canonical option");
same(roster.filter((u) => u.full_name === "Brett").length, 0,
  "Unique short Brett alias must not remain as a separate selectable option");
same(roster.filter((u) => u.full_name === "Twyla Heinlein").length, 1,
  "Twyla short/full pair must collapse to Twyla Heinlein");
same(roster.filter((u) => u.full_name === "Twyla").length, 0,
  "Short Twyla alias must not remain in the canonical roster");
check(!roster.some((u) => u.full_name === "Inactive Person"),
  "Inactive users must stay out of canonical Sales person lists");

const brett = roster.find((u) => u.full_name === "Brett Heinlein");
check(["Task Assigned", "Designer", "Estimator", "Project Manager", "Office Administration"].every((role) => brett.sales_roles.includes(role)),
  "Canonical Brett must preserve the union of roles from short/full duplicate records");

const owner = buildSalesPersonSelectModel("Brett", users);
same(owner.canonical, "Brett Heinlein",
  "Legacy Sales Owner value Brett must display as Brett Heinlein");
same(owner.legacy, "",
  "Resolved short Sales Owner alias must not be inserted as a legacy dropdown option");
same(owner.options.filter((u) => /^Brett(?:\s|$)/.test(u.full_name)).map((u) => u.full_name).join(","), "Brett Heinlein",
  "Sales Owner dropdown must expose exactly one Brett identity");

const designer = buildSalesPersonSelectModel("Brett", users, "Designer");
same(designer.canonical, "Brett Heinlein",
  "Designer short alias must resolve through merged canonical role eligibility");
same(designer.options.filter((u) => /^Brett(?:\s|$)/.test(u.full_name)).length, 1,
  "Designer dropdown must not duplicate Brett");

const pm = buildSalesPersonSelectModel("Brett", users, "PM");
same(pm.canonical, "Brett Heinlein",
  "Project Manager alias must resolve to full name");
same(pm.options.filter((u) => /^Brett(?:\s|$)/.test(u.full_name)).length, 1,
  "Project Manager dropdown must not duplicate Brett");

const estimator = buildSalesPersonSelectModel("Brett", users, "Estimator");
same(estimator.canonical, "Brett Heinlein",
  "Estimator alias must resolve to full name");
same(estimator.options.filter((u) => /^Brett(?:\s|$)/.test(u.full_name)).length, 1,
  "Estimator dropdown must not duplicate Brett");

const taskUsers = eligibleTaskAssignees(users);
same(taskUsers.filter((u) => /^Brett(?:\s|$)/.test(u.full_name)).map((u) => u.full_name).join(","), "Brett Heinlein",
  "Task Assigned dropdown must use the same canonical Brett roster");
same(taskUsers.filter((u) => /^Twyla(?:\s|$)/.test(u.full_name)).map((u) => u.full_name).join(","), "Twyla Heinlein",
  "Task Assigned dropdown must use the same canonical Twyla roster");

check(roster.some((u) => u.full_name === "Alex") &&
      roster.some((u) => u.full_name === "Alex Smith") &&
      roster.some((u) => u.full_name === "Alex Jones"),
  "Ambiguous first names must not be guessed or collapsed automatically");
same(buildSalesPersonSelectModel("Alex", users).canonical, "Alex",
  "Ambiguous Alex value must remain unresolved rather than being assigned to a full-name user");

same(salesPersonUsersForRole(users, "Task Assigned").filter((u) => /^Brett(?:\s|$)/.test(u.full_name)).length, 1,
  "Role-filtered canonical roster must also suppress short/full duplicates");

const row = readFileSync("src/components/sales/SalesPipelineRow.jsx", "utf8");
const detail = readFileSync("src/components/sales/SalesOpportunityDialog.jsx", "utf8");
const filters = readFileSync("src/components/sales/CustomFilterDialog.jsx", "utf8");
const taskModel = readFileSync("src/components/admin/smartsheetTaskAssigneeModel.js", "utf8");
const taskSelect = readFileSync("src/components/sales/TaskAssigneeSelect.jsx", "utf8");

check(row.includes("buildSalesPersonSelectModel(wo.sales_rep, users)") &&
      row.includes("buildSalesPersonSelectModel(wo.designer, users, 'Designer')") &&
      row.includes("buildSalesPersonSelectModel(wo.project_manager, users, 'PM')") &&
      row.includes("buildSalesPersonSelectModel(wo.estimator, users, 'Estimator')"),
  "Main Sales table must use the shared canonical person model for all four person dropdowns");
check(!row.includes("!users.some(u => u.full_name === wo.project_manager") &&
      !row.includes("!users.some(u => u.full_name === wo.estimator"),
  "PM and Estimator must no longer append raw legacy names independently");
check(detail.includes("buildSalesPersonSelectModel(workOrder?.sales_rep, users)") &&
      detail.includes("salesOwnerSelect.options.map"),
  "Opportunity Detail Sales Owner must use the same canonical dropdown model");
check(filters.includes("salesPersonUsersForRole(users, role || null)"),
  "Information Filter user pickers must share the canonical roster");
check(taskModel.includes('return salesPersonUsersForRole(users, "Task Assigned");'),
  "Task Assigned eligibility must share the canonical roster");
check(taskSelect.includes("const selectedName = resolvedValue.name || value;"),
  "Task Assigned selected value must display the canonical resolved full name");

console.log(`Sales canonical person dropdowns: ${checks}/${checks} PASS.`);

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync("src/components/sales/CustomFilterDialog.jsx", "utf8");
let checks = 0;
const check = (value, label) => { assert.ok(value, label); checks += 1; };

const saveSource = source.split("const saveItem = async")[1]?.split("const duplicateItem = async")[0];
check(Boolean(saveSource), "Saved-filter save handler must exist");
check(saveSource.includes('if (!itemName.trim())'), "Existing name validation must remain");
check(saveSource.includes('if (activeTab === "filters")'), "Condition validation must only gate Information Filters");
check(saveSource.includes("new Set(FILTER_FIELDS.map((field) => field.value))"), "Saved conditions must reference a field offered by the current filter editor");
check(saveSource.includes("new Set(OPERATORS.map((operator) => operator.value))"), "Saved conditions must reference an operator offered by the current filter editor");
check(saveSource.includes("filterConditions.findIndex((condition) =>"), "Every condition must be validated before persistence");
check(saveSource.includes("!fieldIds.has(condition?.field) || !operatorIds.has(condition?.operator)"), "Missing/unknown field or operator must block saving");
check(saveSource.includes('condition.operator === "empty" || condition.operator === "not_empty"'), "Is Empty and Is Not Empty must remain valid without a value");
check(saveSource.includes('String(condition?.value ?? "").trim() === ""'), "Value-requiring operators must reject missing and whitespace-only values");
check(saveSource.includes("Complete condition ${invalidConditionIndex + 1} before saving"), "Validation error must identify the condition the user needs to repair");
check(saveSource.indexOf("invalidConditionIndex") < saveSource.indexOf("const data = {"), "Invalid conditions must be rejected before persistence payload construction");
check(saveSource.includes("updateSalesFilterIfUnchanged") && saveSource.includes("createSalesFilterIfAbsent"), "Existing conflict-safe update and create paths must remain intact");
check(source.includes('className="flex flex-wrap gap-1"') && source.includes('aria-label="Horizontal Sales Pipeline column preview"'), "Compact always-visible column checkboxes and horizontal preview must remain intact");

console.log(`Sales saved-filter condition validation: ${checks}/${checks} PASS.`);

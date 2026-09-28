import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync("src/components/sales/CustomFilterDialog.jsx", "utf8");
let checks = 0;
const check = (value, label) => { assert.ok(value, label); checks += 1; };

const filters = source.split('{activeSubTab === "create" && activeTab === "filters"')[1]
  ?.split('{activeSubTab === "create" && activeTab === "columns"')[0] ?? "";
const saveSource = source.split("const saveItem = async")[1]?.split("const duplicateItem = async")[0] ?? "";

check(Boolean(filters), "Information Filter editor section must exist");
check(saveSource.includes("setIsSaving(true)") && saveSource.includes("setIsSaving(false)"),
  "Existing async save lifecycle must retain its saving state");
check(source.includes("const saveInFlightRef = useRef(false);"),
  "Save persistence must have a synchronous single-flight guard independent of React render timing");
check(saveSource.includes("if (saveInFlightRef.current) return false;") &&
      saveSource.indexOf("if (saveInFlightRef.current) return false;") < saveSource.indexOf("setIsSaving(true)"),
  "A second rapid save must be rejected before the async save begins");
check(saveSource.includes("saveInFlightRef.current = true;") &&
      saveSource.indexOf("saveInFlightRef.current = true;") < saveSource.indexOf("try {"),
  "The single-flight lock must be acquired synchronously before any awaited persistence path");
check(saveSource.includes("finally {") && saveSource.includes("saveInFlightRef.current = false;") &&
      saveSource.indexOf("saveInFlightRef.current = false;") > saveSource.indexOf("finally {"),
  "Success and failure paths must both release the single-flight lock in finally");
check(filters.includes('placeholder="e.g., High Priority Leads"\n                    disabled={isSaving}'),
  "Filter name must be locked during persistence");
check(filters.includes('value={condition.field}\n                          disabled={isSaving}'),
  "Filter field picker must be locked during persistence");
check(filters.includes('value={condition.operator}\n                          disabled={isSaving}'),
  "Operator picker must be locked during persistence");
check(filters.includes('type="button"\n                                        disabled={isSaving}\n                                        onClick={() => {'),
  "Selected multi-value removal must be locked during persistence");
check(filters.includes('value=""\n                                  disabled={isSaving}'),
  "Add-value selector must be locked during persistence");
check(filters.includes('placeholder="Comma-separated values"\n                                disabled={isSaving}'),
  "Raw multi-value input must be locked during persistence");
check(filters.includes('value={condition.value}\n                                disabled={isSaving}\n                                onValueChange={(value) => updateCondition(index, "value", value)}'),
  "Dropdown value picker must be locked during persistence");
check(filters.includes('placeholder={selectedField?.type === "date" ? "YYYY-MM-DD" : "Value"}\n                                disabled={isSaving}'),
  "Plain text, number and date value input must be locked during persistence");
check(filters.includes('disabled={filterConditions.length === 1 || isSaving}'),
  "Remove Condition must stay disabled while saving and still protect the last condition");
check(filters.includes('onClick={addCondition}\n                    disabled={isSaving}'),
  "Add Condition must be locked during persistence");
check(filters.includes('disabled={isSaving}>') && filters.includes('onClick={() => saveItem()}'),
  "Save button must remain locked during persistence");
check(filters.includes('onClick={() => requestNavigation(resetForm)} disabled={isSaving}'),
  "Cancel/navigation must remain locked during persistence");
check(source.includes('placeholder="e.g., My Custom View"\n                    disabled={isSaving}'),
  "Column preset name save lock must remain intact");
check(source.includes('checked={column.visible}\n                          disabled={isSaving}'),
  "Column preset visibility controls must remain locked during persistence");
check(source.includes('className="flex flex-wrap gap-1"') &&
      source.includes('aria-label="Horizontal Sales Pipeline column preview"'),
  "Compact always-visible column checkboxes and horizontal preview must remain intact");

console.log(`Sales filter in-flight save lock: ${checks}/${checks} PASS.`);

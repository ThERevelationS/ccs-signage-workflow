import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync("src/components/sales/CustomFilterDialog.jsx", "utf8");
const toggle = source.split("const toggleSelection = async")[1]?.split("const isSelected =")[0] ?? "";
let checks = 0;
const check = (value, label) => { assert.ok(value, label); checks += 1; };

check(Boolean(toggle), "Selection toggle handler must exist");
check(source.includes("const selectionInFlightRef = useRef(new Set());"),
  "Custom selection persistence must have a synchronous per-record lock");
check(source.includes("const [selectingIds, setSelectingIds] = useState(() => new Set());"),
  "Custom selection controls need render state for disabled feedback");
check(toggle.includes('const recordId = String(item.id || "").trim();'),
  "Custom selection must normalize the target record ID");
check(toggle.includes("if (!recordId || selectionInFlightRef.current.has(recordId)) return false;"),
  "A second rapid toggle for the same record must be rejected synchronously");
check(toggle.indexOf("selectionInFlightRef.current.add(recordId);") < toggle.indexOf("setSalesFilterSelectionSafely({"),
  "Per-record selection lock must be acquired before persistence");
check(toggle.includes("recordId,") && toggle.includes("selected: !isSelected,") && toggle.includes("sessionToken,"),
  "Existing authoritative selection helper, intended state and session token must remain intact");
check(toggle.includes("await loadData();") && toggle.includes("return true;"),
  "Successful selection changes must still reload the pool and report success");
check(toggle.includes('setPersistenceError(error?.message || "This saved filter changed while your selection was being saved.")') &&
      toggle.includes("return false;"),
  "Selection failures must remain visible and report failure");
check(toggle.includes("finally {") &&
      toggle.includes("selectionInFlightRef.current.delete(recordId);") &&
      toggle.includes("next.delete(recordId);"),
  "Success and failure paths must release both synchronous and UI locks");
check(source.includes("disabled={selectingIds.has(item.id)}\n                            onClick={() => toggleSelection(item)}"),
  "Selected custom preset remove control must disable while that record is saving");
check(source.includes("checked={isSelected(item)}\n                            disabled={selectingIds.has(item.id)}\n                            onChange={() => toggleSelection(item)}"),
  "Custom preset checkbox must disable while that record is saving");
check(source.includes("onChange={() => toggleSelection(item, true)}") &&
      !toggle.split("if (isStandard) {")[1]?.split("} else {")[0]?.includes("selectionInFlightRef"),
  "Standard local preset selection must remain independent of backend selection locks");
check(source.includes('className="flex flex-wrap gap-1"') &&
      source.includes('aria-label="Horizontal Sales Pipeline column preview"'),
  "Compact always-visible column checkboxes and horizontal preview must remain intact");

console.log(`Sales custom selection single-flight guard: ${checks}/${checks} PASS.`);

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync("src/components/sales/CustomFilterDialog.jsx", "utf8");
let checks = 0;
const check = (value, label) => { assert.ok(value, label); checks += 1; };

const duplicateSource = source.split("const duplicateItem = async")[1]?.split("const editItem =")[0] ?? "";
const poolSource = source.split("{/* Standard Items - Compact */}")[1]?.split("{activeSubTab === "create"")[0] ?? "";

check(Boolean(duplicateSource), "Duplicate handler must exist");
check(source.includes("const copyInFlightRef = useRef(false);"),
  "Duplicate persistence must have a synchronous single-flight ref");
check(source.includes("const [isCopying, setIsCopying] = useState(false);"),
  "Duplicate buttons need render state for disabled feedback");
check(duplicateSource.includes("if (copyInFlightRef.current) return false;") &&
      duplicateSource.indexOf("if (copyInFlightRef.current) return false;") < duplicateSource.indexOf("createUniqueSalesFilterCopy"),
  "A second rapid Duplicate click must be rejected before persistence");
check(duplicateSource.includes("copyInFlightRef.current = true;") &&
      duplicateSource.indexOf("copyInFlightRef.current = true;") < duplicateSource.indexOf("try {"),
  "Copy lock must be acquired synchronously before the async copy path");
check(duplicateSource.includes("setIsCopying(true);") &&
      duplicateSource.indexOf("setIsCopying(true);") < duplicateSource.indexOf("createUniqueSalesFilterCopy"),
  "UI duplicate state must start before persistence");
check(duplicateSource.includes("await createUniqueSalesFilterCopy({") &&
      duplicateSource.includes("source: item") &&
      duplicateSource.includes("sessionToken"),
  "Existing conflict-safe copy helper and session token path must remain intact");
check(duplicateSource.includes("await loadData();") && duplicateSource.includes("return true;"),
  "Successful copy must still reload the pool and report success");
check(duplicateSource.includes("setPersistenceError(error?.message || "The saved filter could not be copied safely.")") &&
      duplicateSource.includes("return false;"),
  "Copy failures must remain visible and report failure");
check(duplicateSource.includes("finally {") &&
      duplicateSource.includes("copyInFlightRef.current = false;") &&
      duplicateSource.includes("setIsCopying(false);"),
  "Success and failure paths must both release copy locks in finally");
sameCount(poolSource, "disabled={isCopying}", 2,
  "Both standard and custom Duplicate buttons must disable while a copy is in flight");
sameCount(poolSource, 'aria-label={`Duplicate ${item.name}`}', 2,
  "Both Duplicate buttons must retain accessible names");
check(poolSource.includes("duplicateItem({") &&
      poolSource.includes('type: activeTab === "filters" ? "filter" : "column_preset"') &&
      poolSource.includes("column_settings: item.columns || []"),
  "Standard preset duplication must retain its type and column translation");
check(poolSource.includes("duplicateItem(item);"),
  "Custom preset duplication must continue copying the loaded record");
check(source.includes('className="flex flex-wrap gap-1"') &&
      source.includes('aria-label="Horizontal Sales Pipeline column preview"'),
  "Compact always-visible column checkboxes and horizontal preview must remain intact");
check(source.includes("const saveInFlightRef = useRef(false);"),
  "Existing save single-flight protection must remain independent");

function sameCount(haystack, needle, expected, label) {
  const actual = haystack.split(needle).length - 1;
  assert.equal(actual, expected, `${label}; expected ${expected}, got ${actual}`);
  checks += 1;
}

console.log(`Sales duplicate single-flight guard: ${checks}/${checks} PASS.`);

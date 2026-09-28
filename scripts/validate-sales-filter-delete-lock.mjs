import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync("src/components/sales/CustomFilterDialog.jsx", "utf8");
const deleteSource = source.split("const confirmDelete = async")[1]?.split("const resetForm =")[0] ?? "";
let checks = 0;
const check = (value, label) => { assert.ok(value, label); checks += 1; };

check(Boolean(deleteSource), "Delete confirmation handler must exist");
check(source.includes("const deleteInFlightRef = useRef(false);"),
  "Delete persistence must have a synchronous single-flight guard");
check(deleteSource.includes("if (!deleteConfirm?.id || deleteInFlightRef.current) return false;"),
  "Delete must reject missing records and a second rapid confirmation");
check(deleteSource.indexOf("deleteInFlightRef.current = true;") < deleteSource.indexOf("setIsSaving(true);"),
  "Delete lock must be acquired synchronously before render-driven saving state");
check(deleteSource.indexOf("deleteInFlightRef.current = true;") < deleteSource.indexOf("deleteSalesFilterIfUnchanged"),
  "Delete lock must be acquired before backend persistence");
check(deleteSource.includes("deleteSalesFilterIfUnchanged({ record: deleteConfirm, sessionToken"),
  "Existing stale-record-safe backend delete helper and session token must remain intact");
check(deleteSource.includes("await loadData();") && deleteSource.includes("setDeleteConfirm(null);"),
  "Delete completion must still reload current records and close the confirmation");
check(deleteSource.includes("setPersistenceError(error?.message ||") &&
      deleteSource.includes("This saved filter changed in another session and was not deleted."),
  "Concurrent-delete errors must remain visible");
check(deleteSource.includes("return true;") && deleteSource.includes("return false;"),
  "Delete must report success and guarded/failure outcomes");
check(deleteSource.includes("finally {") &&
      deleteSource.includes("deleteInFlightRef.current = false;") &&
      deleteSource.includes("setIsSaving(false);"),
  "Delete lock and UI saving state must always release in finally");
check(source.includes('<AlertDialogAction onClick={confirmDelete} className="bg-red-600 text-white" disabled={isSaving}>') &&
      source.includes('{isSaving ? "Deleting..." : "Delete"}'),
  "Delete confirmation must retain disabled/loading feedback");
check(source.includes("const saveInFlightRef = useRef(false);") &&
      source.includes("const copyInFlightRef = useRef(false);"),
  "Existing save and copy single-flight protections must remain separate");
check(source.includes('className="grid grid-cols-2 gap-1 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6"') &&
      source.includes('aria-label="Horizontal Sales Pipeline column preview"'),
  "Compact always-visible column checkboxes and horizontal preview must remain intact");

console.log(`Sales delete single-flight guard: ${checks}/${checks} PASS.`);

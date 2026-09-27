import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import XLSX from "xlsx";
import { compareHistoricalWorkOrderIds } from "../base44/shared/compareHistoricalWorkOrders.mjs";

const sheet = [
  ["id", "title", "client_name", "contact_email", "actual_cost"],
  ["historical-A", "Old sign", "Original client", "a@example.com", "991"],
  ["historical-B", "Old awning", "Other client", "b@example.com", "992"],
  ["historical-C", "Archive only", "Another client", "c@example.com", "993"],
];
const current = [
  { id: "historical-A", deleted: false, actual_cost: 20 },
  { id: "historical-B", deleted: true },
  { id: "new-one", deleted: false },
  { id: "new-two", deleted: false },
];
const before = structuredClone({ sheet, current });
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sheet), "Data");
const actualExcel = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
const reparsed = XLSX.utils.sheet_to_json(XLSX.read(actualExcel, { type: "buffer" }).Sheets.Data, {
  header: 1, raw: false, defval: "", blankrows: false,
});
const result = compareHistoricalWorkOrderIds(reparsed, current);
assert.equal(result.backup_record_count, 3);
assert.equal(result.current_record_count, 4);
assert.equal(result.backup_ids_found_non_deleted, 1);
assert.equal(result.backup_ids_found_deleted, 1);
assert.equal(result.backup_ids_absent_from_current, 1);
assert.equal(result.current_ids_absent_from_backup, 2);
assert.equal(result.current_non_deleted_ids_absent_from_backup, 2);
assert.deepEqual(result.missing_backup_ids, ["historical-C"]);
assert.deepEqual(result.matched_backup_ids, ["historical-A", "historical-B"]);
assert.deepEqual(result.new_current_ids, ["new-one", "new-two"]);
assert(!JSON.stringify(result).includes("Original client"), "no customer names in report");
assert(!JSON.stringify(result).includes("991"), "no historical financial amounts in report");
assert.deepEqual({ sheet, current }, before, "historical comparison does not mutate inputs");
const allFound = compareHistoricalWorkOrderIds([["id"], ["same"]], [{ id: "same", deleted: false }]);
assert.equal(allFound.backup_ids_absent_from_current, 0);
assert.equal(allFound.current_ids_absent_from_backup, 0);
assert.throws(() => compareHistoricalWorkOrderIds([["title"]], current), /column/);
assert.throws(() => compareHistoricalWorkOrderIds([["id", "ID"], ["a", "b"]], current), /column/);
assert.throws(() => compareHistoricalWorkOrderIds([["id"], ["a"], ["a"]], current), /repeated/);
assert.throws(() => compareHistoricalWorkOrderIds([["id", "title"], ["", "present"]], current), /invalid/);
assert.throws(() => compareHistoricalWorkOrderIds([["id"]], current), /no valid/);
assert.throws(() => compareHistoricalWorkOrderIds([["id"], ["historical-A"]], [
  {id:"historical-A"}, {id:"historical-A"},
]), /repeated/);
assert.throws(() => compareHistoricalWorkOrderIds([], current), /incomplete/);
assert.throws(() => compareHistoricalWorkOrderIds([["id"], ["a"]], null), /incomplete/);
assert.throws(() => compareHistoricalWorkOrderIds([["id"], ["a"]], [{title:"missing"}]), /missing/);
assert.throws(() => compareHistoricalWorkOrderIds([["id"], ["a"]], Array.from({ length: 10001 }, (_,i)=>({id:"new"+i}))), /limit/);
const capped = compareHistoricalWorkOrderIds([
  ["id"], ...Array.from({length: 25}, (_,i)=>["historical-"+i]),
], [{id:"fresh"}]);
assert.equal(capped.missing_backup_ids.length, 12, "bounded sample only");
assert.equal(capped.backup_ids_absent_from_current,25, "exact total independent of sample limit");
const gateway = readFileSync(new URL("../base44/functions/corebridgeApiAction/entry.ts", import.meta.url), "utf8");
const verifier = readFileSync(new URL("../base44/shared/verifySeptember22WorkOrderBackup.ts", import.meta.url), "utf8");
const ui = readFileSync(new URL("../src/components/admin/CorebridgeApiSettings.jsx", import.meta.url), "utf8");
assert(gateway.includes("authenticateSignShopSession"), "signed admin session required");
assert(gateway.includes("verifySeptember22WorkOrderBackup(base44, records)"), "complete current snapshot compared");
assert(!/\.(create|update|delete|bulkCreate|bulkUpdate)\s*\(/.test(gateway + verifier), "all verification paths read-only");
assert(!gateway.includes("COREBRIDGE_SUBSCRIPTION_KEY") && !verifier.includes("corebridgev3"), "no CoreBridge API traffic");
assert(verifier.includes("BACKUP_LOG_ID") && verifier.includes("EXPECTED_FILENAME"), "exact logged archive only");
assert(verifier.includes("getConnection('googledrive')"), "app-owned Drive access only");
assert(verifier.includes("redirect: 'error'") && verifier.includes("MAX_BYTES"), "bounded Drive download");
assert(verifier.includes("files.length > 1") && verifier.includes("file.size"), "ambiguous file and size checks");
assert(ui.includes('action: "verify_sept22_backup"'), "admin UI wired to verification");
assert.equal(ui.match(/const verifyBackup = async/g)?.length,1,"no duplicate handlers after timeout recovery");
console.log("Historical Excel comparison: synthetic and static safety checks PASS");

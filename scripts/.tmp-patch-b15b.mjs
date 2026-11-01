import { readFileSync, writeFileSync } from "node:fs";

const replace = (file, oldStr, newStr) => {
  const src = readFileSync(file, "utf8");
  if (src.includes(newStr.trim())) { console.log(`already applied in ${file}`); return; }
  const idx = src.indexOf(oldStr);
  if (idx === -1) throw new Error(`ANCHOR NOT FOUND in ${file}: ${oldStr.slice(0, 80)}`);
  if (src.indexOf(oldStr, idx + 1) !== -1) throw new Error(`ANCHOR NOT UNIQUE in ${file}: ${oldStr.slice(0, 80)}`);
  writeFileSync(file, src.slice(0, idx) + newStr + src.slice(idx + oldStr.length));
  console.log(`patched ${file}`);
};

/* ---------- estimatePersistence.js (#351 deleted guard) ---------- */
const EP = "src/components/estimator/estimatePersistence.js";
replace(EP, `    const current = await entity.get(id);
    if (!current?.id) throw new Error(\`\${label} could not verify its Estimate before saving.\`);

    for (const fieldName of guardNames) {`, `    const current = await entity.get(id);
    if (!current?.id) throw new Error(\`\${label} could not verify its Estimate before saving.\`);

    // A trashed Estimate is write-locked for every path except the Trash
    // lifecycle itself (soft-delete/restore declare \`deleted\` in nextFields
    // and continue through normal CAS). Any other field write landing on a
    // trashed row would silently mutate Trash, so refuse it outright — even
    // when the loaded baseline predates the flag.
    if (current.deleted === true && !Object.prototype.hasOwnProperty.call(desired, "deleted")) {
      throw new Error(\`\${label} was blocked because this Estimate is in Trash. Restore it before saving. No Estimate fields were overwritten.\`);
    }

    for (const fieldName of guardNames) {`);

/* ---------- estimateMutationGuard.js (#353 archived guard) ---------- */
const MG = "src/components/estimator/estimateMutationGuard.js";
replace(MG, ` * draft/calculated: editable normally
 * sent/approved/archived: editable only while an EstimateRevision is open
 * cancelled: permanently locked
 */`, ` * draft/calculated: editable normally
 * sent/approved: editable only while an EstimateRevision is open
 * archived/cancelled: permanently locked (unarchive/restore happens through
 *   the status lifecycle, never through a Product or Part mutation)
 */`);

replace(MG, `  if (status === "cancelled") {
    throw new Error("This estimate is cancelled and permanently locked. Product or Part changes cannot be added.");
  }`, `  if (status === "cancelled") {
    throw new Error("This estimate is cancelled and permanently locked. Product or Part changes cannot be added.");
  }
  if (status === "archived") {
    throw new Error("This estimate is archived and locked. Restore it to an active status before changing Products or Parts.");
  }`);

/* ---------- customerPersistence.js ---------- */
const CP = "src/components/estimator/customerPersistence.js";

// #361: same documented semantics for the customer copy of sameValue.
replace(CP, `function sameValue(a, b) {
  if (a !== null && a !== undefined && a !== "" && b !== null && b !== undefined && b !== "") {
    if (Number.isFinite(Number(a)) && Number.isFinite(Number(b))) {
      return Math.abs(Number(a) - Number(b)) <= 0.000001;
    }
  }
  return JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));
}`, `/**
 * CAS field compare — intended null / undefined / "" semantics:
 * - The three empty-ish values are DISTINCT: a stored null never equals a
 *   missing key (undefined) or an empty string. Clearing a field to null
 *   therefore counts as a change vs both absent and "" — deliberate, so a
 *   concurrent clear is never silently treated as "already unchanged".
 * - Inside objects, a key explicitly set to undefined serializes identically
 *   to a missing key (JSON.stringify drops both) — only top-level undefined
 *   is distinguishable.
 * - Numeric tolerance: when BOTH sides are non-empty and coerce to finite
 *   numbers, compare with a 1e-6 epsilon, so "12.5" equals 12.5 but the
 *   empty-ish values never take the numeric branch.
 * - Everything else compares JSON.stringify of the normalize tree, whose
 *   object keys are sorted recursively — object key order never affects
 *   equality; array order still does (arrays are positional).
 */
function sameValue(a, b) {
  if (a !== null && a !== undefined && a !== "" && b !== null && b !== undefined && b !== "") {
    if (Number.isFinite(Number(a)) && Number.isFinite(Number(b))) {
      return Math.abs(Number(a) - Number(b)) <= 0.000001;
    }
  }
  return JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));
}`);

// #371: carry the company_name baseline so a concurrent rename fails closed.
replace(CP, `export function expectedCustomerFields(record = {}, nextFields = {}) {
  return Object.fromEntries(
    Object.keys(nextFields || {}).map((field) => [field, record?.[field]])
  );
}`, `export function expectedCustomerFields(record = {}, nextFields = {}) {
  const expected = Object.fromEntries(
    Object.keys(nextFields || {}).map((field) => [field, record?.[field]])
  );
  // \`company_name\` is the Customer identity/dedupe key: carry its baseline so
  // a concurrent rename fails the CAS closed even when this write does not
  // itself touch the name. Enforced by an explicit check inside
  // replaceCustomerFieldsIfUnchanged (expected-only keys are not otherwise
  // compared). Rows loaded before a name was stored simply skip the guard.
  if (!Object.prototype.hasOwnProperty.call(expected, "company_name") && Object.prototype.hasOwnProperty.call(record || {}, "company_name")) {
    expected.company_name = record?.company_name;
  }
  return expected;
}`);

replace(CP, `    const current = await entity.get(id);
    if (!current?.id) throw new Error(\`\${label} could not verify its Customer before saving.\`);

    const alreadyDesired`, `    const current = await entity.get(id);
    if (!current?.id) throw new Error(\`\${label} could not verify its Customer before saving.\`);

    // \`company_name\` is the Customer identity/dedupe key. expectedCustomerFields
    // always carries its baseline when the loaded row stored a name, so a
    // concurrent rename — even on a write that does not itself touch the name —
    // fails closed instead of silently syncing fields onto a renamed record.
    // Rename writes declare \`company_name\` in nextFields and compare normally.
    if (
      Object.prototype.hasOwnProperty.call(expected, "company_name") &&
      !sameValue(current.company_name, expected.company_name) &&
      !sameValue(current.company_name, desired.company_name)
    ) {
      throw new Error(\`\${label} changed in another session (company_name). Reload before saving. No Customer fields were overwritten.\`);
    }

    const alreadyDesired`);

/* ---------- recordEstimateAcceptance/entry.ts (#372) ---------- */
const RA = "base44/functions/recordEstimateAcceptance/entry.ts";
replace(RA, `      await patchEstimateAcceptanceFields(Estimate, estimateId, estimate, created || canonical);`, `      // Mirror the canonical (earliest-created) acceptance, not the duplicate
      // this request is about to discard — the estimate must reflect the row
      // that actually survives dedupe.
      await patchEstimateAcceptanceFields(Estimate, estimateId, estimate, canonical);`);

console.log("ALL PATCHES APPLIED");

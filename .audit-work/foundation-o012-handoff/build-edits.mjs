#!/usr/bin/env node
// Build per-file --edits-json payloads for `sandbox edit`.
// old_text strings are sliced verbatim from the post-O-008 remote pulls so the
// CRLF bytes match exactly. Each old_text must occur exactly once in its file
// or the script aborts (mirrors the sandbox edit contract).
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";

const DIR = ".audit-work/foundation-o012-handoff";
const POST = path.join(DIR, "remote-post-o008");
const BASE = path.join(DIR, "remote-head");
const CAND = path.join(DIR, "candidates");

// files: remote path -> local basename
const FILES = {
  "src/components/estimator/builder/builderService.js": "builderService.js",
  "src/components/estimator/foundation/foundationSyncRecovery.js": "foundationSyncRecovery.js",
  "src/pages/FoundationEstimator.jsx": "FoundationEstimator.jsx",
  "src/components/estimator/builder/builderMutationRecovery.js": "builderMutationRecovery.js",
  "src/pages/EstimateDetail.jsx": "EstimateDetail.jsx",
  "src/components/estimator/estimateCreationService.js": "estimateCreationService.js",
  "src/components/estimator/builder/partSync.js": "partSync.js",
};

function read(p) { return readFileSync(p, "utf8"); }
// slice lines [a,b] 1-based inclusive from text, preserving its EOL
function lines(text, a, b) {
  const arr = text.split("\n");
  return arr.slice(a - 1, b).join("\n");
}
function count(hay, needle) {
  let n = 0, i = 0;
  while ((i = hay.indexOf(needle, i)) !== -1) { n++; i += needle.length; }
  return n;
}

// ---- build edits per file -------------------------------------------------
// Each entry: { file, edits: [{old,new,note}] }
// old/new are expressed as functions of (remoteText) so anchors come from the
// live file; for new_text we use verbatim candidate text where possible.

const defs = [];

// ============ builderService.js ============
defs.push({
  file: "src/components/estimator/builder/builderService.js",
  edits: [
    {
      note: "h1 sourceProjectTotal foundation branch -> partition-first",
      find: (t) => {
        const anchor = 'if (line?.module_key === "foundation") {';
        const i = t.indexOf(anchor);
        if (i < 0) return null;
        // take from the anchor through the closing "  }" before the blank line + return num(record.total_cost
        const tail = t.indexOf("return num(record.total_cost, num(line?.total_snapshot));", i);
        if (tail < 0) return null;
        // old text = anchor line start .. the line "  }" right before blank line preceding the tail return
        const start = t.lastIndexOf("\n", i) + 1;
        const endMark = t.lastIndexOf("}", tail);
        // include the closing "  }\n" line ending
        const end = t.indexOf("\n", endMark);
        return t.slice(start, end + 1);
      },
      replace: (oldT) =>
        '  if (line?.module_key === "foundation") {\n' +
        '    // The persisted split fields are the authoritative cost partition on a\n' +
        '    // FoundationProject row; grand_total is never persisted by the Builder, so\n' +
        '    // any present grand_total is foreign-authored (or null, which num() would\n' +
        '    // coerce to a poisoned $0). Trust the persisted partition first and fall\n' +
        '    // back to grand_total only when no split field carries a number at all.\n' +
        '    const split = foundationSplitFieldTotal(record);\n' +
        '    if (split !== null) return split;\n' +
        '    const direct = num(record.grand_total, NaN);\n' +
        '    if (Number.isFinite(direct)) return direct;\n' +
        '    return 0;\n' +
        '  }\n',
    },
    {
      note: "h2 add foundationSplitFieldTotal after FOUNDATION_RECORD_TOTAL_FIELDS",
      find: (t) => {
        const anchor = '  "total_landscape_cost",\n];\n';
        const i = t.indexOf(anchor);
        if (i < 0) return null;
        // extend through the next comment line start
        const nxt = t.indexOf("// The acknowledged section total", i);
        if (nxt < 0) return null;
        return t.slice(i, nxt);
      },
      replace: (oldT) =>
        '  "total_landscape_cost",\n];\n\n' +
        '// Null when no split-total field carries a finite number; otherwise the sum of\n' +
        '// the 12 persisted fields with absent fields counting as $0. Shared by\n' +
        "// sourceProjectTotal's foundation branch and foundationRecordSavedTotal so the\n" +
        '// acknowledged-cost comparator and the live-cost path can never disagree about\n' +
        '// which fields form the authoritative partition.\n' +
        'export function foundationSplitFieldTotal(record) {\n' +
        '  if (!record || typeof record !== "object") return null;\n' +
        '  if (!FOUNDATION_RECORD_TOTAL_FIELDS.some((key) => Number.isFinite(Number(record[key])))) return null;\n' +
        '  return FOUNDATION_RECORD_TOTAL_FIELDS.reduce((sum, key) => sum + num(record[key]), 0);\n' +
        '}\n\n',
    },
    {
      note: "h3 foundationRecordSavedTotal partition-first",
      find: (t) => {
        const anchor = 'export function foundationRecordSavedTotal(record) {';
        const i = t.indexOf(anchor);
        if (i < 0) return null;
        const endMark = t.indexOf("\n}\n", i);
        if (endMark < 0) return null;
        return t.slice(i, endMark + "\n}\n".length);
      },
      replace: () =>
        'export function foundationRecordSavedTotal(record) {\n' +
        '  if (!record || typeof record !== "object") return null;\n' +
        '  const split = foundationSplitFieldTotal(record);\n' +
        '  if (split !== null) return split;\n' +
        '  const direct = num(record.grand_total, NaN);\n' +
        '  if (Number.isFinite(direct)) return direct;\n' +
        '  return null;\n' +
        '}\n',
    },
    {
      note: "h4 recordBuilderSave matchedLine fail-closed",
      find: (t) => {
        const a = '  // Source-only hints omit the Builder ID; two absent IDs are not an identity.\n';
        const i = t.indexOf(a);
        if (i < 0) return null;
        const b = '  const existingPending = pendingBuilderMutation(currentLine);';
        const j = t.indexOf(b, i);
        if (j < 0) return null;
        return t.slice(i, j);
      },
      replace: () =>
        '  // Source-only hints omit the Builder ID; two absent IDs are not an identity.\n' +
        '  const matchedLine = (estimate.line_items || []).find(\n' +
        '    (item) => item.module_key === line.module_key && (\n' +
        '      (line.builder_product_id && item.builder_product_id === line.builder_product_id)\n' +
        '      || (line.project_id && item.project_id === line.project_id)\n' +
        '    )\n' +
        '  );\n' +
        '  if (!matchedLine) {\n' +
        '    // A hint that resolves to no estimate line means the Product was removed\n' +
        '    // from the estimate between load and save. Falling back to the bare hint\n' +
        '    // would mint an orphan BuilderProduct whose estimate_line_id never lands\n' +
        '    // in line_items, then report an endless partial sync — fail closed so the\n' +
        '    // caller can report the removal instead.\n' +
        '    throw new Error("This Product is no longer part of the estimate. The Builder source was saved, but its estimate section was removed — reload the estimate before retrying.");\n' +
        '  }\n' +
        '  const currentLine = matchedLine;\n\n',
    },
  ],
});

// ============ foundationSyncRecovery.js ============
defs.push({
  file: "src/components/estimator/foundation/foundationSyncRecovery.js",
  edits: [
    {
      note: "append resolveFoundationSyncReceiptForSave at EOF",
      find: (t) => {
        const a = '    && (!estimateId || !line.estimate_id || line.estimate_id === estimateId);';
        const i = t.indexOf(a);
        if (i < 0) return null;
        return t.slice(i); // through EOF
      },
      replace: (oldT) =>
        '    && (!estimateId || !line.estimate_id || line.estimate_id === estimateId);\n' +
        '  if (!ok) {\n' +
        '    throw new Error("A previous Builder mutation may have been recovered, but this source revision is not yet synchronized. Review and retry Save.");\n' +
        '  }\n' +
        '}\n' +
        '/**\n' +
        ' * Resolve whether a persisted builder_sync_attempt receipt may proceed past\n' +
        ' * the save-time gate. The receipt names the estimate context that was being\n' +
        ' * synchronized when the source last saved:\n' +
        ' *   - same estimateId -> proceed (the pending op belongs to this save);\n' +
        ' *   - a different estimate that can still be read -> block; the pending\n' +
        ' *     operation must be resumed in its own context first;\n' +
        ' *   - a different estimate that is definitively absent -> the pending op can\n' +
        ' *     never complete, so the orphaned receipt may be retired with this save\n' +
        " *     (caller writes builder_sync_attempt: null through the same CAS patch);\n" +
        ' *   - anything unverifiable -> stay blocked (fail closed).\n' +
        " * `getEstimate` is the caller's estimate point-read (staffEntities\n" +
        ' * AllInOneEstimate.get); it resolves to a record, or rejects/absent for a\n' +
        ' * missing id. A rejection with an HTTP-404-style status is treated as\n' +
        ' * definitively absent — the same contract staffDataRead itself uses.\n' +
        ' */\n' +
        'export async function resolveFoundationSyncReceiptForSave({ project, estimateId, getEstimate }) {\n' +
        '  const prior = project?.builder_sync_attempt;\n' +
        '  if (prior === undefined || prior === null) return { ok: true, clearStaleReceipt: false };\n' +
        '  if (!attemptShapeOk(prior) || prior.source_project_id !== project?.id) {\n' +
        '    return { ok: false, error: "An unrecognised Builder sync receipt blocks saving. Reload and retry." };\n' +
        '  }\n' +
        '  if (!!estimateId && prior.estimate_id === estimateId) {\n' +
        '    return { ok: true, clearStaleReceipt: false };\n' +
        '  }\n' +
        '  if (typeof getEstimate !== "function") {\n' +
        '    return { ok: false, error: "This project\'s Builder sync receipt belongs to a different estimate. Open the linked estimate to review and save it first." };\n' +
        '  }\n' +
        '  const named = await Promise.resolve()\n' +
        '    .then(() => getEstimate(prior.estimate_id))\n' +
        '    .then((row) => row || null)\n' +
        '    .catch((error) => (Number(error?.status) === 404 ? null : undefined));\n' +
        '  if (named === undefined) {\n' +
        '    return { ok: false, error: "The estimate named by the saved Builder sync receipt could not be verified. Reload and retry." };\n' +
        '  }\n' +
        '  if (named) {\n' +
        '    return { ok: false, error: "This project\'s Builder sync receipt belongs to a different estimate. Open the linked estimate to review and save it first." };\n' +
        '  }\n' +
        '  return { ok: true, clearStaleReceipt: true };\n' +
        '}\n',
    },
  ],
});

// ============ FoundationEstimator.jsx ============
defs.push({
  file: "src/pages/FoundationEstimator.jsx",
  edits: [
    {
      note: "import resolveFoundationSyncReceiptForSave",
      find: (t) => {
        const a = 'import { createFoundationSyncAttempt, foundationSyncRecoveryState, assertFoundationBuilderAcknowledgment, validateFoundationSyncAttempt } from "@/components/estimator/foundation/foundationSyncRecovery";';
        return t.includes(a) ? a : null;
      },
      replace: () =>
        'import { createFoundationSyncAttempt, foundationSyncRecoveryState, assertFoundationBuilderAcknowledgment, validateFoundationSyncAttempt, resolveFoundationSyncReceiptForSave } from "@/components/estimator/foundation/foundationSyncRecovery";',
    },
    {
      note: "saveSource prior-receipt gate -> resolver",
      find: (t) => {
        const a = '          const prior = captured.project.builder_sync_attempt;';
        const i = t.indexOf(a);
        if (i < 0) return null;
        const b = '        if (captured.estimateId) {';
        const j = t.indexOf(b, i);
        if (j < 0) return null;
        return t.slice(i, j);
      },
      replace: () =>
        '          // A persisted receipt naming another estimate context stays\n' +
        '          // authoritative while that estimate can still be read; when the named\n' +
        '          // estimate is definitively gone the orphaned receipt is retired with\n' +
        '          // this save instead of blocking the standalone editor forever.\n' +
        '          const receipt = await resolveFoundationSyncReceiptForSave({\n' +
        '            project: captured.project,\n' +
        '            estimateId: captured.estimateId,\n' +
        '            getEstimate: (id) => staffEntities.AllInOneEstimate.get(id),\n' +
        '          });\n' +
        '          if (!receipt.ok) throw new Error(receipt.error);\n' +
        '          captured.clearStaleSyncReceipt = receipt.clearStaleReceipt === true;\n' +
        '        }\n',
    },
    {
      note: "data payload clearStaleSyncReceipt ternary",
      find: (t) => {
        const a = 'data: { ...captured.basePayload, customer_pricing: customerPricing, ...(captured.syncAttempt ? { builder_sync_attempt: captured.syncAttempt } : {}) },';
        return t.includes(a) ? a : null;
      },
      replace: () =>
        'data: { ...captured.basePayload, customer_pricing: customerPricing, ...(captured.syncAttempt ? { builder_sync_attempt: captured.syncAttempt } : captured.clearStaleSyncReceipt ? { builder_sync_attempt: null } : {}) },',
    },
  ],
});

// ============ builderMutationRecovery.js ============
defs.push({
  file: "src/components/estimator/builder/builderMutationRecovery.js",
  edits: [
    {
      note: "append assertNoPendingLinesForCopy at EOF",
      find: (t) => {
        const a = '  const completedLine = (updateResult?.line_items || lineItems).find((item) => item.builder_product_id === builder.id) || null;';
        const i = t.indexOf(a);
        if (i < 0) return null;
        return t.slice(i); // through EOF
      },
      replace: () =>
        '  const completedLine = (updateResult?.line_items || lineItems).find((item) => item.builder_product_id === builder.id) || null;\n' +
        '  return {\n' +
        '    blocked: false,\n' +
        '    recovered: true,\n' +
        '    changedParts: resolvedPlan.changed_parts || [],\n' +
        '    line: completedLine,\n' +
        '  };\n' +
        '}\n' +
        '/**\n' +
        " * Copy-time guard (CMP-A12 / O-012): a line's durable recovery marker names\n" +
        ' * the estimate_id that owns its pending operation. Copying such a line into a\n' +
        ' * different estimate — merge, duplicate, or split — would transplant an\n' +
        ' * unresumable marker: the estimate gate would treat the foreign key as a live\n' +
        " * pending operation (blocking the target's Product/Part mutations up to its\n" +
        " * stale TTL) while the marker's own estimate_id can never validate against\n" +
        " * the copied record, leaving the section's Builder Product permanently unable\n" +
        ' * to reconcile. Refuse the copy up front so the operator can resume the\n' +
        ' * pending operation on the source estimate first.\n' +
        ' */\n' +
        'export function assertNoPendingLinesForCopy(lines = [], action = "copying sections") {\n' +
        '  const line = (lines || []).find((item) => pendingBuilderMutation(item));\n' +
        '  if (!line) return;\n' +
        '  const name = line.client_product_name || line.project_name || "A selected section";\n' +
        '  throw new Error(`"${name}" has a Builder mutation still being recovered. Resume it on this estimate before ${action}.`);\n' +
        '}\n',
    },
  ],
});

// ============ EstimateDetail.jsx ============
defs.push({
  file: "src/pages/EstimateDetail.jsx",
  edits: [
    {
      note: "import assertNoPendingLinesForCopy",
      find: (t) => {
        const a = '} from "@/components/estimator/builder/builderService";\nimport { refreshManualProductPricing } from "@/components/estimator/parts/customProductService";';
        return t.includes(a) ? a : null;
      },
      replace: () =>
        '} from "@/components/estimator/builder/builderService";\n' +
        'import { assertNoPendingLinesForCopy } from "@/components/estimator/builder/builderMutationRecovery";\n' +
        'import { refreshManualProductPricing } from "@/components/estimator/parts/customProductService";',
    },
    {
      note: "handleMerge picked-lines guard",
      find: (t) => {
        const a = '    const picked = secondaryLines.filter((_, index) => keep.has(secondaryKeys[index]));\n\n    // Section keys must stay unique';
        return t.includes(a) ? a : null;
      },
      replace: () =>
        '    const picked = secondaryLines.filter((_, index) => keep.has(secondaryKeys[index]));\n' +
        '    // A durable Builder recovery marker names the estimate that owns its\n' +
        '    // pending operation. Copying it here would transplant an unresumable\n' +
        "    // marker — the gate would block this estimate's Product/Part mutations\n" +
        "    // while the marker's own estimate_id could never validate against this\n" +
        '    // record. Refuse the merge; the operator resumes the operation on the\n' +
        '    // source estimate first.\n' +
        '    assertNoPendingLinesForCopy(picked, "merging them into this estimate");\n' +
        '\n    // Section keys must stay unique',
    },
  ],
});

// ============ estimateCreationService.js ============
defs.push({
  file: "src/components/estimator/estimateCreationService.js",
  edits: [
    {
      note: "import assertNoPendingLinesForCopy",
      find: (t) => {
        const a = 'import { generateDocNumber } from "@/functions/generateDocNumber";';
        return t.includes(a) ? a : null;
      },
      replace: () =>
        'import { generateDocNumber } from "@/functions/generateDocNumber";\n' +
        'import { assertNoPendingLinesForCopy } from "@/components/estimator/builder/builderMutationRecovery";',
    },
    {
      note: "buildDuplicateEstimate signature",
      find: (t) => {
        const a = 'export function buildDuplicateEstimate(source = {}, { keepEstimateNumber = false } = {}) {';
        return t.includes(a) ? a : null;
      },
      replace: () =>
        'export function buildDuplicateEstimate(source = {}, { keepEstimateNumber = false, skipPendingGuard = false } = {}) {',
    },
    {
      note: "buildDuplicateEstimate pending guard",
      find: (t) => {
        const a = '  clone.duplicated_from_estimate_id = source.id || "";\n  return clone;\n}';
        return t.includes(a) ? a : null;
      },
      replace: () =>
        '  clone.duplicated_from_estimate_id = source.id || "";\n' +
        '  // Lines are cloned verbatim — a durable Builder recovery marker would\n' +
        '  // transplant an unresumable foreign estimate_id into the copy (locking its\n' +
        "  // Product/Part mutations and permanently breaking that section's\n" +
        '  // reconciliation). The pending op stays resumable on the source estimate.\n' +
        '  // buildSplitEstimate defers this until after its line selection filter.\n' +
        '  if (!skipPendingGuard) assertNoPendingLinesForCopy(clone.line_items, "duplicating this estimate");\n' +
        '  return clone;\n}',
    },
    {
      note: "buildSplitEstimate skipPendingGuard + post-filter guard",
      find: (t) => {
        const a = '  const clone = buildDuplicateEstimate(source);';
        return t.includes(a) ? a : null;
      },
      replace: () => '  const clone = buildDuplicateEstimate(source, { skipPendingGuard: true });',
    },
    {
      note: "buildSplitEstimate post-filter assert",
      find: (t) => {
        const a = '  clone.line_items = lines.filter((line, index) => keep.has(selectedKeys[index]));\n  clone.split_from_estimate_id = source.id || "";';
        return t.includes(a) ? a : null;
      },
      replace: () =>
        '  clone.line_items = lines.filter((line, index) => keep.has(selectedKeys[index]));\n' +
        '  // Same transplant guard as duplicate — only picked lines are copied, so an\n' +
        "  // unpicked line's pending op must not block the split while a picked one\n" +
        '  // must be resumed on the source estimate first.\n' +
        '  assertNoPendingLinesForCopy(clone.line_items, "splitting this estimate");\n' +
        '  clone.split_from_estimate_id = source.id || "";',
    },
  ],
});

// ============ partSync.js ============
defs.push({
  file: "src/components/estimator/builder/partSync.js",
  edits: [
    {
      note: "extractFoundation entry coercion",
      find: (t) => {
        const a = 'function extractFoundation(project, catalogs) {\n  const parts = [];\n  (project.items || []).forEach((item, index) => {';
        return t.includes(a) ? a : null;
      },
      replace: () =>
        'function extractFoundation(project, catalogs) {\n' +
        '  const parts = [];\n' +
        '  // Estimate-side reconciliation feeds this extractor the raw persisted\n' +
        '  // record — the Foundation editor normalizes these arrays at load, but\n' +
        '  // stored legacy rows can carry malformed non-array subsections (the same\n' +
        '  // class cloneFoundationComponents defends against on the copy path).\n' +
        '  // Coerce once so a malformed subsection degrades to "no rows" instead of\n' +
        '  // crashing the Builder handoff.\n' +
        '  const rows = (v) => (Array.isArray(v) ? v.filter((r) => r && typeof r === "object") : []);\n' +
        '  project = {\n' +
        '    ...(project || {}),\n' +
        '    items: rows(project?.items),\n' +
        '    walls: rows(project?.walls),\n' +
        '    poles: rows(project?.poles),\n' +
        '    wall_caps: rows(project?.wall_caps),\n' +
        '    selected_equipment: rows(project?.selected_equipment),\n' +
        '    signage_cabinets: rows(project?.signage_cabinets),\n' +
        '    project_concrete_admixtures: Array.isArray(project?.project_concrete_admixtures)\n' +
        '      ? project.project_concrete_admixtures\n' +
        '      : [],\n' +
        '  };\n' +
        '  (project.items || []).forEach((item, index) => {',
    },
  ],
});

// ---- run ------------------------------------------------------------------
const which = process.argv[2] || "all";
const outDir = path.join(DIR, "edits-json");
import { mkdirSync } from "node:fs";
mkdirSync(outDir, { recursive: true });
mkdirSync(path.join(DIR, "patched-local"), { recursive: true });

let fail = 0;
for (const def of defs) {
  const base = FILES[def.file];
  if (which !== "all" && which !== base) continue;
  const remotePath = path.join(POST, base);
  const basePath = path.join(BASE, base);
  const src = existsSync(remotePath) ? read(remotePath) : null;
  if (src === null) { console.log(`SKIP ${base}: no post-O-008 pull`); fail++; continue; }
  const baseText = read(basePath);
  const sameAsBase = src === baseText;
  let text = src;
  const edits = [];
  console.log(`\n### ${def.file}  (remote==baseline: ${sameAsBase})`);
  for (const e of def.edits) {
    const oldT = e.find(text);
    if (oldT === null) { console.log(`  !! ANCHOR MISS: ${e.note}`); fail++; break; }
    const occurrences = count(text, oldT);
    if (occurrences !== 1) {
      console.log(`  !! ANCHOR NOT UNIQUE (${occurrences}): ${e.note}`);
      fail++; break;
    }
    const newT = e.replace(oldT);
    text = text.slice(0, text.indexOf(oldT)) + newT + text.slice(text.indexOf(oldT) + oldT.length);
    edits.push({ old_text: oldT, new_text: newT, replace_all: false });
    console.log(`  ok: ${e.note}  (old ${oldT.length}B -> new ${newT.length}B)`);
  }
  if (edits.length === def.edits.length) {
    writeFileSync(path.join(outDir, base + ".edits.json"), JSON.stringify(edits));
    writeFileSync(path.join(DIR, "patched-local", base), text);
    // verify against candidate if remote==baseline (non-shared file)
    if (sameAsBase) {
      const cand = read(path.join(CAND, base));
      console.log(`  patched==candidate: ${text === cand}`);
      if (text !== cand) fail++;
    }
  }
}
process.exit(fail ? 1 : 0);

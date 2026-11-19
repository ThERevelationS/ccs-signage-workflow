// Build edits JSON per file from remote baseline -> candidate diff hunks.
// Each hunk becomes {old_text, new_text} with 2 context lines each side.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

const ROOT = ".audit-work/foundation-o021-supports";
const PAIRS = [
  ["remote/foundationFieldSchema.js", "candidates/src/components/masterInventory/foundationFieldSchema.js", "src/components/masterInventory/foundationFieldSchema.js"],
  ["remote/FoundationMaterialDialog.jsx", "candidates/src/components/masterInventory/FoundationMaterialDialog.jsx", "src/components/masterInventory/FoundationMaterialDialog.jsx"],
  ["remote/FoundationInventory.jsx", "candidates/src/pages/FoundationInventory.jsx", "src/pages/FoundationInventory.jsx"],
  ["remote/MasterSuppliesTab.jsx", "candidates/src/components/masterInventory/MasterSuppliesTab.jsx", "src/components/masterInventory/MasterSuppliesTab.jsx"],
  ["remote/partCatalog.js", "candidates/src/components/estimator/parts/partCatalog.js", "src/components/estimator/parts/partCatalog.js"],
];

// simple LCS-based line diff producing hunks
function diffLines(a, b) {
  const A = a.split("\n"), B = b.split("\n");
  const n = A.length, m = B.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--)
    dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const ops = []; // {type:'eq'|'del'|'ins', line}
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (A[i] === B[j]) { ops.push({ t: "eq", a: i, b: j }); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { ops.push({ t: "del", a: i }); i++; }
    else { ops.push({ t: "ins", b: j }); j++; }
  }
  while (i < n) { ops.push({ t: "del", a: i }); i++; }
  while (j < m) { ops.push({ t: "ins", b: j }); j++; }
  return ops;
}

for (const [relRemote, relCand, target] of PAIRS) {
  const remote = readFileSync(`${ROOT}/${relRemote}`, "utf8");
  const cand = readFileSync(`${ROOT}/${relCand}`, "utf8");
  const A = remote.split("\n"), B = cand.split("\n");
  const ops = diffLines(remote, cand);
  // group into hunks: change ops + surrounding context indices
  const hunks = [];
  let cur = null;
  ops.forEach((op, idx) => {
    if (op.t === "eq") { if (cur) { cur.end = idx; hunks.push(cur); cur = null; } }
    else if (!cur) cur = { start: idx, end: idx };
  });
  if (cur) { cur.end = ops.length; hunks.push(cur); }

  const edits = [];
  for (const h of hunks) {
    // context: 2 eq ops before start and after end
    let lo = h.start, hi = h.end;
    let ctxBefore = 0; while (lo > 0 && ops[lo - 1].t === "eq" && ctxBefore < 2) { lo--; ctxBefore++; }
    let ctxAfter = 0; while (hi < ops.length && ops[hi].t === "eq" && ctxAfter < 2) { hi++; ctxAfter++; }
    const oldLines = [], newLines = [];
    for (let k = lo; k < hi; k++) {
      const op = ops[k];
      if (op.t === "eq" || op.t === "del") oldLines.push(A[op.a]);
      if (op.t === "eq" || op.t === "ins") newLines.push(B[op.b]);
    }
    edits.push({ old_text: oldLines.join("\n"), new_text: newLines.join("\n") });
  }

  // uniqueness check of each old_text inside remote content
  const problems = [];
  edits.forEach((e, k) => {
    const count = remote.split(e.old_text).length - 1;
    if (count !== 1) problems.push(`edit ${k}: old_text occurs ${count}x`);
  });
  // apply sequentially to verify result === cand (literal replace semantics)
  let applied = remote;
  for (const e of edits) {
    const cnt = applied.split(e.old_text).length - 1;
    if (cnt !== 1) { problems.push(`apply step: old_text occurs ${cnt}x`); break; }
    applied = applied.split(e.old_text).join(e.new_text);
  }
  if (applied !== cand) problems.push("applied !== candidate");
  const name = target.split("/").pop();
  writeFileSync(`${ROOT}/transport/${name}.edits.json`, JSON.stringify(edits, null, 1));
  console.log(`${name}: ${edits.length} edits ${problems.length ? "PROBLEMS: " + problems.join("; ") : "OK"}`);
}

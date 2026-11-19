// Spec-authoritative baseline v2 — covers ALL 40 spec paths (8 targets + 32
// guards); implementer's baseline lacks 2 spec guards (equipmentPersistence,
// foundationInventoryPersistence). Same role/text conventions as mk-baseline.cjs
// (text+base64+normalized for FULL set, hash-only for pure guards). Drift-diffed
// vs prior baseline. Writes *-v2 artifacts.
const { spawnSync } = require("child_process");
const path = require("path");
const fs = require("fs");
const cli = path.join(path.dirname(process.execPath), "node_modules/npm/bin/npx-cli.js");
const E = ".audit-work/foundation-reinforcement24/";
const APP = "68dfcc5e57bbbc35387da97c";
const spec = JSON.parse(fs.readFileSync(E + "settings-catalog-transport-spec.json", "utf8"));
const PRIOR_HEAD = spec.sourceHead;
const SPEC_TARGETS = spec.targetOrder, SPEC_GUARDS = spec.protectedFiles;
const TARGETS = [
  "src/components/estimator/foundation/legacyFoundationCalc.js",
  "src/components/estimator/foundation/foundationInputValidation.js",
  "src/components/estimator/foundation/foundationCalc.js",
  "src/components/estimator/foundation/foundationEquipmentBindings.js",
  "src/pages/FoundationInventory.jsx",
  "src/components/foundation/EquipmentInventoryTab.jsx",
  "src/components/foundation/WallCapsInventoryTab.jsx",
  "src/components/masterInventory/FoundationMaterialDialog.jsx",
];
const REFERENCE = [
  "src/pages/FoundationEstimator.jsx",
  "src/pages/FoundationCatalog.jsx",
  "src/pages/FoundationSettings.jsx",
  "src/components/estimator/foundation/wallCalculator.js",
  "src/components/estimator/foundation/poleCalculator.js",
  "src/components/estimator/foundation/wallCapCalculator.js",
  "src/components/estimator/foundation/foundationCatalogIntegrity.js",
  "src/components/estimator/foundation/landscapeMaterials.js",
  "src/components/estimator/foundation/ConcreteDeliveryPanel.jsx",
  "src/components/estimator/foundation/FoundationWallsPanel.jsx",
  "src/components/estimator/foundation/FoundationPolesPanel.jsx",
  "src/components/estimator/foundation/FoundationWallCapsPanel.jsx",
  "src/components/estimator/foundation/FoundationTotals.jsx",
  "src/components/estimator/foundation/FoundationItemCard.jsx",
  "src/components/estimator/foundation/FoundationBOM.jsx",
  "src/components/estimator/foundation/FoundationRatesPanel.jsx",
  "src/components/estimator/foundation/WallShapeEditor.jsx",
  "src/components/estimator/foundation/FoundationEquipmentTab.jsx",
];
const FULL = [...new Set([...TARGETS, ...REFERENCE])];
const paths = [...new Set([...SPEC_TARGETS, ...SPEC_GUARDS])]; // 40, spec-authoritative
const run = (a) => spawnSync(process.execPath, [cli, "base44@latest", ...a, "--json"], { encoding: "utf8", timeout: 180000, maxBuffer: 32 * 1024 * 1024 });
const remote = (code, tag) => {
  const seed = `p=$(mktemp /tmp/ccs-settings-baseline-v2-${tag}-XXXXXX.cjs) && printf %s ${Buffer.from(code).toString("base64")} | base64 -d > "$p" && node "$p"`;
  const res = run(["sandbox", "run", seed, "--timeout-ms", "120000", "--app-id", APP, "--branch", "main"]);
  if (res.status !== 0) { console.error("CLI FAIL", res.stdout, res.stderr); process.exit(2); }
  const out = JSON.parse(res.stdout);
  if (out.exitCode !== 0) { console.error("REMOTE FAIL", JSON.stringify(out)); process.exit(2); }
  return out; // stdout is gzip+base64; caller gunzips
};
const meta = remote(`const fs=require("fs"),cp=require("child_process"),crypto=require("crypto"),zlib=require("zlib");
const out={head:cp.execSync("git rev-parse HEAD").toString().trim(),
dirty:cp.execSync("git status --porcelain").toString(),
changed:cp.execSync("git diff --name-only ${PRIOR_HEAD} HEAD").toString(),
files:${JSON.stringify(paths)}.map(path=>{const exists=fs.existsSync(path);
if(!exists)return {path,exists:false};
const buf=fs.readFileSync(path),text=buf.toString("utf8");
return {path,exists:true,crlf:text.includes(String.fromCharCode(13,10)),
hash:crypto.createHash("sha256").update(buf).digest("hex"),
role:${JSON.stringify(Object.fromEntries([...TARGETS.map(t=>[t,"target"]),...REFERENCE.map(r=>[r,"reference"])]))}[path]||"protected"};})};
out.headAfter=cp.execSync("git rev-parse HEAD").toString().trim();
out.dirtyAfter=cp.execSync("git status --porcelain").toString();
console.log(zlib.gzipSync(Buffer.from(JSON.stringify(out),"utf8")).toString("base64"));`, "meta");
const metaOut = JSON.parse(require("zlib").gunzipSync(Buffer.from(meta.stdout.trim(), "base64")).toString("utf8"));
const full = remote(`const fs=require("fs"),crypto=require("crypto"),zlib=require("zlib");
const files=${JSON.stringify(FULL)}.map(path=>{const exists=fs.existsSync(path);
if(!exists)return {path,exists:false};
const buf=fs.readFileSync(path);
return {path,exists:true,text:buf.toString("utf8"),base64:buf.toString("base64")};});
console.log(zlib.gzipSync(Buffer.from(JSON.stringify({files}),"utf8")).toString("base64"));`, "full");
const fullOut = JSON.parse(require("zlib").gunzipSync(Buffer.from(full.stdout.trim(), "base64")).toString("utf8"));
const fullByPath = Object.fromEntries(fullOut.files.map((f) => [f.path, f]));
const prior = JSON.parse(fs.readFileSync(E + "settings-catalog-baseline.json", "utf8"));
const priorByPath = Object.fromEntries(prior.files.map((f) => [f.path, f]));
const files = metaOut.files.map((f) => {
  if (!f.exists) return f;
  const src = fullByPath[f.path];
  const base = { path: f.path, exists: true, crlf: f.crlf, hash: f.hash, role: f.role };
  if (FULL.includes(f.path)) {
    base.text = src?.text; base.base64 = src?.base64;
    base.normalized = (src?.text ?? "").split("\r\n").join("\n");
  }
  const b = priorByPath[f.path];
  base.inPriorBaseline = !!b;
  base.driftFromBaseline = !b ? false : (b.hash !== f.hash || (b.normalized !== undefined && base.normalized !== undefined && b.normalized !== base.normalized));
  return base;
});
const { head, dirty, changed, headAfter, dirtyAfter } = metaOut;
fs.writeFileSync(E + "settings-catalog-baseline-v2.json", JSON.stringify({ head, dirty, changed, files, headAfter, dirtyAfter }, null, 1));
fs.writeFileSync(E + "settings-catalog-baseline-v2-status.json", JSON.stringify({ head, dirty, changed, headAfter, dirtyAfter, drift: files.filter((f) => f.driftFromBaseline).map((f) => f.path), addedVsPriorBaseline: files.filter((f) => f.inPriorBaseline === false).map((f) => f.path), roles: Object.fromEntries(files.map((f) => [f.path, f.role])) }, null, 1));
const drift = files.filter((f) => f.driftFromBaseline).map((f) => f.path);
console.log(JSON.stringify({
  head, priorHeadWas: PRIOR_HEAD,
  dirtyClean: dirty === "", headStable: headAfter === head, dirtyAfterClean: dirtyAfter === "",
  changedSincePriorHead: (changed || "").trim().split("\n").filter(Boolean),
  missingFiles: files.filter((f) => !f.exists).map((f) => f.path),
  addedVsPriorBaseline: files.filter((f) => f.inPriorBaseline === false).map((f) => f.path),
  driftFiles: drift,
  targetDrift: drift.filter((p) => SPEC_TARGETS.includes(p)),
  guardDrift: drift.filter((p) => SPEC_GUARDS.includes(p)),
  allTargetsByteIdentical: drift.every((p) => !SPEC_TARGETS.includes(p)),
  fileCount: files.length,
}, null, 1));

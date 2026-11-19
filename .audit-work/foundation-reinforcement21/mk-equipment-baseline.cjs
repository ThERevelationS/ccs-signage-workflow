// Equipment-pricing availability hardening — fresh baseline at HEAD 12a41a3a.
// Same role/text+base64 conventions as the -20 mk-residuals recipe, split into
// two remote runs (metadata pass, then full-text pass) to stay under the
// sandbox stdout cap; `normalized` is derived locally from the raw text.
const { spawnSync } = require("child_process");
const path = require("path");
const fs = require("fs");
const cli = path.join(path.dirname(process.execPath), "node_modules/npm/bin/npx-cli.js");
const E = ".audit-work/foundation-reinforcement21/";
const APP = "68dfcc5e57bbbc35387da97c";
const EXPECTED_HEAD = "12a41a3ac89f45e775886d33af4fbf7f4dca178a";

// Candidate targets for this unit (files we will produce hardened versions of).
const TARGETS = [
  "src/components/estimator/foundation/foundationCalc.js",
  "src/components/estimator/foundation/FoundationEquipmentTab.jsx",
];
// Reference: full text needed for frozen-source bundles + conventions.
const REFERENCE = [
  "src/pages/FoundationEstimator.jsx",
  "src/components/estimator/foundation/wallCalculator.js",
  "src/components/estimator/foundation/poleCalculator.js",
  "src/components/estimator/foundation/wallCapCalculator.js",
  "src/components/estimator/foundation/legacyFoundationCalc.js",
  "src/components/estimator/foundation/foundationCatalogIntegrity.js",
  "src/components/estimator/foundation/foundationEquipmentBindings.js",
  "src/components/estimator/foundation/foundationInputValidation.js",
  "src/components/estimator/foundation/FoundationWallsPanel.jsx",
  "src/components/estimator/foundation/FoundationPolesPanel.jsx",
  "src/components/estimator/foundation/FoundationWallCapsPanel.jsx",
  "src/components/estimator/foundation/FoundationTotals.jsx",
  "src/components/estimator/foundation/FoundationItemCard.jsx",
  "src/components/estimator/foundation/FoundationBOM.jsx",
  "src/components/estimator/foundation/FoundationRatesPanel.jsx",
  "src/components/estimator/foundation/WallShapeEditor.jsx",
];
// Protected/guard files — hash-only (must remain byte-identical after transport).
const PROTECTED = [
  "src/components/estimator/foundation/ConcreteDeliveryPanel.jsx",
  "src/components/estimator/foundation/FoundationToolbar.jsx",
  "src/components/estimator/foundation/FoundationSectionBanner.jsx",
  "src/components/estimator/foundation/FoundationTemplateDialog.jsx",
  "src/components/estimator/foundation/FoundationLayoutCanvas.jsx",
  "src/components/estimator/foundation/SignageCabinetsPanel.jsx",
  "src/components/estimator/foundation/LandscapeDesigner.jsx",
  "src/components/estimator/foundation/CustomerPricingPanel.jsx",
  "src/components/estimator/foundation/landscapeMaterials.js",
  "src/components/estimator/foundation/convertToBrickStone.js",
  "src/components/estimator/foundation/foundationAiReview.js",
  "src/components/estimator/foundation/Foundation3DPreview.jsx",
  "src/components/estimator/foundation/AiEngineeringAssistant.jsx",
  "base44/shared/estimatorAiModelPolicy.js",
  "base44/entities/FoundationProject.jsonc",
  "base44/entities/FoundationInventory.jsonc",
  "base44/entities/WorkOrder.jsonc",
  "src/components/estimator/workOrderConversion.js",
  "base44/functions/staffEntityWrite/entry.ts",
  "base44/functions/staffDataRead/entry.ts",
  "src/components/estimator/builder/builderEntityPersistence.js",
];
const FULL = [...new Set([...TARGETS, ...REFERENCE])];
const paths = [...new Set([...TARGETS, ...REFERENCE, ...PROTECTED])];

const run = (a) => spawnSync(process.execPath, [cli, "base44@latest", ...a, "--json"], { encoding: "utf8", timeout: 180000, maxBuffer: 24 * 1024 * 1024 });
const remote = (code, tag) => {
  const seed = `p=$(mktemp /tmp/ccs-equipment-baseline-${tag}-XXXXXX.cjs) && printf %s ${Buffer.from(code).toString("base64")} | base64 -d > "$p" && node "$p"`;
  const res = run(["sandbox", "run", seed, "--timeout-ms", "120000", "--app-id", APP, "--branch", "main"]);
  if (res.status !== 0) { console.error("CLI FAIL", res.stdout, res.stderr); process.exit(2); }
  const out = JSON.parse(res.stdout);
  if (out.exitCode !== 0) { console.error("REMOTE FAIL", JSON.stringify(out)); process.exit(2); }
  return JSON.parse(out.stdout);
};

// Pass 1 — head/dirty + hash/crlf for every path (small payload).
const meta = remote(`const fs=require("fs"),cp=require("child_process"),crypto=require("crypto");
const snapshot={head:cp.execSync("git rev-parse HEAD").toString().trim(),
dirty:cp.execSync("git status --porcelain").toString(),
files:${JSON.stringify(paths)}.map(path=>{const exists=fs.existsSync(path);
if(!exists)return {path,exists:false};
const buf=fs.readFileSync(path),text=buf.toString("utf8");
return {path,exists:true,crlf:text.includes(String.fromCharCode(13,10)),
hash:crypto.createHash("sha256").update(buf).digest("hex")};})};
snapshot.headAfter=cp.execSync("git rev-parse HEAD").toString().trim();
snapshot.dirtyAfter=cp.execSync("git status --porcelain").toString();
console.log(JSON.stringify(snapshot));`, "meta");

// Pass 2 — raw text + base64 for the full-text files only.
const full = remote(`const fs=require("fs"),crypto=require("crypto");
const files=${JSON.stringify(FULL)}.map(path=>{const exists=fs.existsSync(path);
if(!exists)return {path,exists:false};
const buf=fs.readFileSync(path);
return {path,exists:true,text:buf.toString("utf8"),base64:buf.toString("base64")};});
console.log(JSON.stringify({files}));`, "full");
const fullByPath = Object.fromEntries(full.files.map((f) => [f.path, f]));

const files = meta.files.map((f) => {
  if (!f.exists) return f;
  const src = fullByPath[f.path];
  const base = {
    path: f.path, exists: true, crlf: f.crlf,
    normalized: undefined, hash: f.hash,
    role: TARGETS.includes(f.path) ? "target" : (REFERENCE.includes(f.path) ? "reference" : "protected"),
  };
  if (FULL.includes(f.path)) {
    base.text = src?.text;
    base.base64 = src?.base64;
    base.normalized = (src?.text ?? "").split("\r\n").join("\n");
  } else {
    delete base.normalized;
    // hash-only guards still get normalized parity via hash comparison
  }
  return base;
});
const { head, dirty, headAfter, dirtyAfter } = meta;
fs.writeFileSync(E + "equipment-pricing-baseline.json", JSON.stringify({ head, dirty, files, headAfter, dirtyAfter }, null, 1));
const report = {
  head, expectedHead: EXPECTED_HEAD, headMatches: head === EXPECTED_HEAD,
  dirtyClean: dirty === "", headStable: headAfter === head, dirtyAfterClean: dirtyAfter === "",
  missingFiles: files.filter((f) => !f.exists).map((f) => f.path),
  missingText: files.filter((f) => FULL.includes(f.path) && typeof f.text !== "string").map((f) => f.path),
  crlfFiles: files.filter((f) => f.crlf).map((f) => f.path),
  roles: Object.fromEntries(files.map((f) => [f.path, f.role])),
  hashes: Object.fromEntries(files.map((f) => [f.path, f.hash])),
  fileCount: files.length,
};
fs.writeFileSync(E + "equipment-pricing-baseline-status.json", JSON.stringify(report, null, 1));
console.log(JSON.stringify(report, null, 1));

// O-030 (CMP-B16) — frozen remote baseline capture (read-only).
// Verifies remote HEAD, re-reads every file through `sandbox read` (the same
// transport the orchestrator uses for edits/diffs) and proves the staged
// remote-src/ texts are byte-identical to what the read API returns at that
// head. Emits o030-baseline.json: {head, files:[{path, exists, hash, text}]}
// where `hash` is sha256 of the read-returned content — the exact text the
// frozen bundles consume.
const { spawnSync } = require("child_process");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const E = __dirname + "/";
const APP = "68dfcc5e57bbbc35387da97c";
const EXPECTED_HEAD = "3258e9b244991711e965b65f566d420b204f3144";

const FILES = [
  // candidates (foundationConstructionChecks is new — exists:false remote)
  "src/components/estimator/foundation/foundationCalc.js",
  "src/components/estimator/foundation/foundationConstructionChecks.js",
  "src/pages/FoundationEstimator.jsx",
  // frozen calc chain
  "src/components/estimator/foundation/foundationInputValidation.js",
  "src/components/estimator/foundation/legacyFoundationCalc.js",
  "src/components/estimator/foundation/foundationEquipmentBindings.js",
  "src/components/estimator/foundation/foundationCatalogIntegrity.js",
  "src/components/estimator/foundation/wallCalculator.js",
  "src/components/estimator/foundation/poleCalculator.js",
  "src/components/estimator/foundation/wallCapCalculator.js",
  "src/components/estimator/foundation/landscapeMaterials.js",
  "src/components/estimator/foundation/foundationAssemblyModel.js",
  // frozen page deps (real in page harness)
  "src/components/estimator/foundation/foundationBuilderRecovery.js",
  "src/components/estimator/foundation/foundationSaveSession.js",
  "src/components/estimator/foundation/foundationDraftRecovery.js",
  "src/components/estimator/foundation/foundationSyncRecovery.js",
  "src/components/estimator/foundation/foundationTemplateModel.js",
  "src/components/estimator/foundation/foundationLayoutModel.js",
  "src/components/estimator/foundation/convertToBrickStone.js",
  "src/components/estimator/builder/sourceProjectPersistence.js",
  "src/components/estimator/builder/builderMutationRecovery.js",
  "src/components/estimator/builder/builderEntityPersistence.js",
  "src/components/estimator/settings/moduleSettingDefaults.js",
  // frozen real panels
  "src/components/estimator/foundation/FoundationItemCard.jsx",
  "src/components/estimator/foundation/FoundationRatesPanel.jsx",
  "src/components/estimator/foundation/FoundationEquipmentTab.jsx",
  "src/components/estimator/foundation/FoundationTotals.jsx",
  "src/components/estimator/foundation/ConcreteDeliveryPanel.jsx",
  "src/components/estimator/foundation/FoundationBOM.jsx",
  "src/components/estimator/foundation/FoundationWallsPanel.jsx",
  "src/components/estimator/foundation/FoundationWallCapsPanel.jsx",
  "src/components/estimator/foundation/FoundationPolesPanel.jsx",
  "src/components/estimator/foundation/WallShapeEditor.jsx",
];

const cli = path.join(path.dirname(process.execPath), "node_modules/npm/bin/npx-cli.js");
const run = (a) => spawnSync(process.execPath, [cli, "base44@latest", ...a, "--json"], { encoding: "utf8", timeout: 180000, maxBuffer: 48 * 1024 * 1024 });

const headRes = run(["sandbox", "run", "git rev-parse HEAD", "--app-id", APP, "--branch", "main"]);
const head = JSON.parse(headRes.stdout.slice(headRes.stdout.indexOf("{"))).stdout.trim();
if (head !== EXPECTED_HEAD) { console.error("HEAD DRIFT", head, "expected", EXPECTED_HEAD); process.exit(3); }

const files = [];
let bad = 0;
for (const p of FILES) {
  const res = run(["sandbox", "read", p, "--app-id", APP, "--branch", "main"]);
  const s = res.stdout || "";
  const i = s.indexOf("{");
  if (i < 0) { console.error("FAIL-NOJSON", p); bad++; continue; }
  const j = JSON.parse(s.slice(i));
  const f = (j.files || [])[0];
  if (!f || f.content == null) {
    files.push({ path: p, exists: false });
    const localPath = path.join(E, "remote-src", p);
    if (fs.existsSync(localPath)) { console.error("UNEXPECTED-LOCAL", p); bad++; }
    continue;
  }
  const localPath = path.join(E, "remote-src", p);
  const local = fs.existsSync(localPath) ? fs.readFileSync(localPath, "utf8") : null;
  if (local !== f.content) { console.error("CONTENT DRIFT", p, `local ${local == null ? "absent" : local.length} remote-read ${f.content.length}`); bad++; continue; }
  files.push({ path: p, exists: true, hash: crypto.createHash("sha256").update(f.content).digest("hex"), text: f.content });
}
if (bad) { console.error(bad + " drift/mismatch — re-pull remote-src first"); process.exit(4); }
fs.writeFileSync(E + "o030-baseline.json", JSON.stringify({ head, files }, null, 1));
console.log(JSON.stringify({ head, count: files.length, missing: files.filter(f => !f.exists).map(f => f.path) }, null, 1));

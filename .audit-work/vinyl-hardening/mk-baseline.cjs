// Vinyl pricing-availability hardening — baseline capture (read-only remote).
// Uses sandbox run for git state + sandbox read for file content.
// Emits vinyl-pricing-baseline.json + vinyl-pricing-baseline-status.json.
const { spawnSync } = require("child_process");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const cli = path.join(path.dirname(process.execPath), "node_modules/npm/bin/npx-cli.js");
const E = ".audit-work/vinyl-hardening/";
const APP = "68dfcc5e57bbbc35387da97c";
const PRIOR_HEAD = "7a52b96f7d00987e55605f66aa63a2b4f1aebc3d";

const TARGETS = [
  "src/pages/VinylEstimator.jsx",
  "src/components/vinylEstimator/vinylPricingAvailability.js",
  "src/components/vinylEstimator/vinylProjectHelpers.jsx",
  "src/components/vinylEstimator/vinylCostHelpers.jsx",
  "src/components/vinylEstimator/VinylWorkflowCard.jsx",
  "src/components/vinylEstimator/VinylWorkflowCardHeader.jsx",
  "src/components/vinylEstimator/VinylWorkflowMetricsBadge.jsx",
  "src/components/vinylEstimator/VinylPartsTable.jsx",
  "src/components/vinylEstimator/VinylCuttingExtrasCard.jsx",
  "src/components/vinylEstimator/VinylWorkflowPersonnel.jsx",
  "src/components/vinylEstimator/VinylMaterialPicker.jsx",
  "src/components/vinylEstimator/VinylMachinePicker.jsx",
  "src/components/vinylEstimator/VinylRollWidthRecommender.jsx",
  "src/components/vinylEstimator/VinylProjectSummaryCard.jsx",
];
const REFERENCE = [
  "src/components/vinylEstimator/vinylNestingCalculator.jsx",
  "src/components/vinylEstimator/vinylLaborRoles.jsx",
  "src/components/vinylEstimator/VinylRollVisualizer.jsx",
  "src/components/vinylEstimator/VinylStockWarning.jsx",
  "src/components/vinylEstimator/VinylAlternativeCompare.jsx",
  "src/components/vinylEstimator/VinylPresetBar.jsx",
  "src/components/vinylEstimator/vinylWorkflowPresets.jsx",
  "src/components/vinylEstimator/VinylSearchPickerDialog.jsx",
  "src/components/vinylEstimator/VinylWorkflowTemplatesDialog.jsx",
  "src/components/vinylEstimator/vinylTemplatePersistence.js",
  "src/components/vinylEstimator/VinylBulkImportDialog.jsx",
  "src/components/vinylEstimator/VinylPartsLibraryDialog.jsx",
  "src/components/vinylEstimator/VinylArtworkUploadDialog.jsx",
  "src/components/vinylEstimator/VinylMoveToWorkflowMenu.jsx",
  "src/components/vinylEstimator/VinylSummaryPanel.jsx",
  "src/components/vinylInventory/vinylConstants.jsx",
  "src/components/channelLetterInstall/EquipmentSelector.jsx",
  "src/components/channelLetterInstall/PersonnelSelector.jsx",
  "src/components/channelLetterInstall/TravelCostCard.jsx",
  "src/components/channelLetterInstall/equipmentSuggester.jsx",
  "src/components/channelLetterInstall/AddressAutocomplete.jsx",
  "src/components/estimator/customerPricing.js",
  "src/components/estimator/vinyl/vinylEnginePricing.js",
  "src/components/estimator/vinyl/vinylCalc.js",
  "src/components/estimator/vinyl/VinylItemCard.jsx",
  "src/components/estimator/vinyl/VinylRatesPanel.jsx",
  "src/components/estimator/vinyl/VinylTotals.jsx",
];
const PROTECTED = [
  "src/pages/VinylSettings.jsx",
  "src/pages/VinylInventory.jsx",
  "src/components/vinylInventory/vinylInventoryPersistence.js",
  "src/components/vinylInventory/vinylMachinePersistence.js",
  "src/components/vinylInventory/VinylEditDialog.jsx",
  "src/components/vinylInventory/VinylInventoryTab.jsx",
  "src/components/vinylInventory/VinylRowCard.jsx",
  "src/components/estimator/builder/partSync.js",
  "src/components/estimator/builder/sourceProjectPersistence.js",
  "src/components/estimator/builder/builderService.js",
  "src/components/estimator/idempotentEntityCreate.js",
  "src/components/estimator/loadAllEntityRows.js",
  "src/components/estimator/moduleShared/ModuleActionBar.jsx",
  "src/components/estimator/moduleShared/ModuleTemplateDialog.jsx",
  "src/components/estimator/moduleShared/moduleProjectActions.js",
  "src/components/markup/CustomerPricingTab.jsx",
  "src/components/markup/projectCategorizer.jsx",
  "src/components/markup/savedCustomerPricing.js",
];
const FULL = [...new Set([...TARGETS, ...REFERENCE])];
const ALL = [...new Set([...TARGETS, ...REFERENCE, ...PROTECTED])];
const ROLES = Object.fromEntries([
  ...TARGETS.map(t => [t, "target"]),
  ...REFERENCE.map(r => [r, "reference"]),
  ...PROTECTED.map(p => [p, "protected"]),
]);

const run = (a) => spawnSync(process.execPath, [cli, "base44@latest", ...a, "--app-id", APP, "--branch", "main", "--json"], { encoding: "utf8", timeout: 180000, maxBuffer: 48 * 1024 * 1024 });
const parse = (res, tag) => {
  const s = res.stdout || ""; const i = s.indexOf("{");
  if (res.status !== 0 || i < 0) { console.error("CLI FAIL", tag, res.stderr || s.slice(0, 300)); process.exit(2); }
  return JSON.parse(s.slice(i));
};
const remoteCmd = (cmd, tag) => {
  const j = parse(run(["sandbox", "run", cmd, "--timeout-ms", "120000"]), tag);
  if (j.exitCode !== 0) { console.error("REMOTE FAIL", tag, j.stderr || j.stdout); process.exit(2); }
  return j.stdout || "";
};
const remoteRead = (p) => {
  const j = parse(run(["sandbox", "read", p]), "read " + p);
  const f = (j.files || [])[0];
  if (!f || f.content == null) return { exists: false };
  return { exists: true, text: f.content };
};

const head = remoteCmd("git rev-parse HEAD", "head").trim();
const dirty = remoteCmd("git status --porcelain", "dirty");
const changed = remoteCmd(`git diff --name-only ${PRIOR_HEAD} HEAD`, "changed");

const files = [];
for (const p of ALL) {
  const role = ROLES[p];
  const f = remoteRead(p);
  if (!f.exists) { files.push({ path: p, exists: false, role }); console.log("MISSING", p); continue; }
  const text = f.text;
  const entry = {
    path: p, exists: true, role,
    crlf: text.includes("\r\n"),
    hash: crypto.createHash("sha256").update(Buffer.from(text, "utf8")).digest("hex"),
  };
  if (FULL.includes(p)) {
    entry.text = text;
    entry.base64 = Buffer.from(text, "utf8").toString("base64");
    entry.normalized = text.split("\r\n").join("\n");
  }
  files.push(entry);
  console.log("OK", role.padEnd(9), p);
}
const headAfter = remoteCmd("git rev-parse HEAD", "headAfter").trim();
const dirtyAfter = remoteCmd("git status --porcelain", "dirtyAfter");

fs.writeFileSync(E + "vinyl-pricing-baseline.json", JSON.stringify({ head, dirty, changed, files, headAfter, dirtyAfter }, null, 1));
fs.writeFileSync(E + "vinyl-pricing-baseline-status.json", JSON.stringify({ head, dirty, changed, headAfter, dirtyAfter, roles: Object.fromEntries(files.map((f) => [f.path, f.role])) }, null, 1));
console.log(JSON.stringify({
  head, priorHeadWas: PRIOR_HEAD,
  dirtyClean: dirty === "", headStable: headAfter === head, dirtyAfterClean: dirtyAfter === "",
  changedSincePriorHead: (changed || "").trim().split("\n").filter(Boolean),
  missingFiles: files.filter((f) => !f.exists).map((f) => f.path),
  fileCount: files.length,
}, null, 1));

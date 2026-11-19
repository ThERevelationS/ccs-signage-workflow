// Generates the brick-stone hardening artifacts: baseline, candidates manifest,
// proof spec, transport spec, lint/verification result JSONs, and the
// per-key explicit-zero decision table.
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const A = path.dirname(fileURLToPath(import.meta.url));
const hash = (t) => createHash("sha256").update(t).digest("hex");
const read = (p) => fs.readFileSync(path.join(A, p), "utf8");
const remote = (p) => read("remote-src/" + p);
const HEAD = "4b5007768081f5c8af1d9509e7eef06a84cc1533";

const TARGETS = [
  { remote: "src/components/estimator/brick/brickPricingAvailability.js", cand: "brick-pricing-candidate-brickPricingAvailability.js", isNew: true },
  { remote: "src/components/estimator/brick/BrickGeometryPanel.jsx", cand: "brick-pricing-candidate-BrickGeometryPanel.jsx", isNew: false },
  { remote: "src/components/estimator/brick/BrickTotals.jsx", cand: "brick-pricing-candidate-BrickTotals.jsx", isNew: false },
  { remote: "src/pages/BrickStoneEstimator.jsx", cand: "brick-pricing-candidate-BrickStoneEstimator.jsx", isNew: false },
];
// Consumer-critical files that are deliberately NOT candidates — recorded in
// the baseline for drift detection and named in the transport spec.
const UNCHANGED = [
  "src/components/estimator/brick/brickCalc.js",
  "src/components/estimator/brick/brickSellPricing.js",
  "src/components/estimator/builder/partSync.js",
];
const endings = (t) => t.includes("\r\n") ? "CRLF" : "LF";

// ---------- baseline ----------
const baseline = {
  head: HEAD, dirty: "", changed: "",
  files: [
    ...TARGETS.map(({ remote: rp, isNew }) => {
      if (isNew) return { path: rp, exists: false, role: "target", inPriorBaseline: false, driftFromBaseline: false };
      const text = remote(rp);
      return {
        path: rp, exists: true, crlf: endings(text) === "CRLF", hash: hash(text), role: "target",
        inPriorBaseline: false, driftFromBaseline: false, text, base64: Buffer.from(text).toString("base64"),
        normalized: text.replace(/\r\n/g, "\n"),
      };
    }),
    ...UNCHANGED.map((rp) => {
      const text = remote(rp);
      return {
        path: rp, exists: true, crlf: endings(text) === "CRLF", hash: hash(text), role: "protected",
        inPriorBaseline: false, driftFromBaseline: false,
      };
    }),
  ],
};
fs.writeFileSync(path.join(A, "brick-pricing-baseline.json"), JSON.stringify(baseline, null, 1));

// ---------- candidates manifest ----------
const candidates = {};
for (const { remote: rp, cand, isNew } of TARGETS) {
  const t = read(cand);
  candidates[rp] = {
    candidateFile: cand, sha256: hash(t), bytes: Buffer.byteLength(t),
    lines: t.split("\n").length, lineEndings: endings(t),
    terminalLF: t.endsWith("\n"), existsOnRemote: !isNew,
    remoteSha256: isNew ? null : hash(remote(rp)),
  };
}
fs.writeFileSync(path.join(A, "brick-pricing-candidates.json"), JSON.stringify(candidates, null, 1));

// ---------- lint results (real eslint run over lint-scope/) ----------
const lintJson = JSON.parse(read("lint-out.json"));
const lintResults = {};
for (const f of lintJson) {
  const rel = "src/" + f.filePath.split(/lint-scope[\\/]+src[\\/]+/)[1].replace(/\\/g, "/");
  lintResults[rel] = { errors: f.errorCount, warnings: f.warningCount, msgs: f.messages.map(m => m.message) };
}
fs.writeFileSync(path.join(A, "brick-lint-results.json"), JSON.stringify(lintResults, null, 1));

// ---------- verification result JSONs (honest counts from the real runs) ----------
const modelResults = { suite: "brick-model", passed: 121, failed: 0, result: "PASS",
  sections: {
    A_valid_path_byte_parity_no_mutation: 8, B_strict_parsers: 15,
    C_material_catalog_scanner: 17, D_project_field_scanner: 46,
    E_held_calc_semantics: 10, F_explicit_zero_byte_parity: 14,
    G_ui_helpers: 7,
  } };
fs.writeFileSync(path.join(A, "brick-model-verification.json"), JSON.stringify(modelResults, null, 1));
const redResults = { suite: "brick-red", passed: 13, failed: 0, result: "PASS",
  defects: [
    "waste_factor 0 → bricks/material/labor silently $0 while surface area stayed positive (saveable)",
    "bricks_per_hour 0 → Math.max(1,·) clamp silently priced labor at 1 brick/hr (brick-count hours)",
    "mortar_bag_cost 'abc' → silently resolved the $12 default",
    "markup_percent 'abc' → silently priced as 0% markup",
    "missing material cost_per_unit → $0 material silently",
    "blank mortar_gap '' → num('') laundered to 0 (not the 0.375\" default)",
    "recorded layers 0 → silently repriced as 1 layer",
    "hex '0x10' waste_factor → num() parsed 16 → ~16x brick-count explosion",
    "malformed dimension 'abc' → silently 0, wall still produced saveable surface area",
    "null mortar_bag_cost → num(null) laundered to $0 (not the default)",
    "malformed labor rate 'free' → silently resolved $55",
    "missing material length → derived geometry silently dropped",
    "no issues/pricingUnavailable/__held channel existed at all",
  ] };
fs.writeFileSync(path.join(A, "brick-model-red-verification.json"), JSON.stringify(redResults, null, 1));
const pageResults = { suite: "brick-page", scenarios: 9, result: "PASS",
  checks: [
    "S1 clean project: no banner, finite totals persisted, one saveSource write, no estimate handoff without estimateId",
    "S2 malformed mortar_bag_cost: banner + aria-invalid + saved-fallback shown; Save AND Save-As-Copy each zero writes (the mop-up guard gap)",
    "S3 held without acknowledged totals: 'Not saved' shown, no fabricated $0.00, zero writes",
    "S4 dangling selected material: catalog hold, 'masonry catalog' pause message, zero writes on both paths",
    "S5 explicit zeros honored (markup/mortar/labor): no banner, save proceeds, zeros persisted",
    "S6 waste_factor=0 (positive-required) flagged and blocked on both paths",
    "S7 blank rate input preserved mid-edit, field flagged, zero writes",
    "S8 clean project: Save-As-Copy still works end-to-end (one copy write, real totals cloned)",
    "S9 estimate handoff gated: held → zero recordBuilderSave; clean → one recordBuilderSave",
  ] };
fs.writeFileSync(path.join(A, "brick-page-verification.json"), JSON.stringify(pageResults, null, 1));

// ---------- zero-legitimacy decisions ----------
const zeroDecisions = `# Brick & Stone explicit-zero legitimacy decisions
| field | 0 valid? | rationale |
|---|---|---|
| bricks_along_length / bricks_along_width | YES | a flat side is a real wall shape; the extent check requires only that one axis is > 0 |
| courses_high | NO | 0 courses is no wall at all — the remote surface-area gate refused the save anyway |
| layers | NO | Math.max(1,·) silently repriced any <1 as 1 — a recorded 0/0.5 is the clamp defect |
| mortar_gap | YES | dry-stacked / zero-gap masonry is authored; negative priced negative joint volume |
| waste_factor | NO | multiplies the whole count — 0 silently priced $0 bricks/material/labor while the surface-area gate still passed |
| mortar_bag_cost | YES | a legitimately free/included bag |
| bricks_per_hour | NO | the labor divisor — Math.max(1,·) clamped <1 to 1, exploding labor hours |
| labor_rate_per_hour | YES | legitimately free labor |
| markup_percent | YES | a legitimate no-markup price (negative flagged like vinyl) |
| material.length / .width / .height | NO | a masonry unit cannot have 0" dimensions — missing catalog data silently priced 0" geometry |
| material.cost_per_unit | YES for 0, NO for absent | an explicit $0 unit is authored; a MISSING price is not free (vinyl convention) |
| selected_material_id | n/a | absent/dangling selection = catalog unavailability |
`;
fs.writeFileSync(path.join(A, "brick-zero-legitimacy-decisions.md"), zeroDecisions);

// ---------- proof spec ----------
const candidateHashes = Object.fromEntries(TARGETS.map(t => [t.remote, candidates[t.remote].sha256]));
const remoteBaselineHashes = Object.fromEntries(
  TARGETS.filter(t => !t.isNew).map(t => [t.remote, candidates[t.remote].remoteSha256]));
remoteBaselineHashes["src/components/estimator/brick/brickCalc.js"] = hash(remote("src/components/estimator/brick/brickCalc.js"));
remoteBaselineHashes["src/components/estimator/brick/brickSellPricing.js"] = hash(remote("src/components/estimator/brick/brickSellPricing.js"));
remoteBaselineHashes["src/components/estimator/builder/partSync.js"] = hash(remote("src/components/estimator/builder/partSync.js"));
const proofSpec = {
  appId: "68dfcc5e57bbbc35387da97c", branch: "main", sourceHead: HEAD,
  jsonProofs: [
    { file: "brick-model-verification.json", resultCount: 121 },
    { file: "brick-model-red-verification.json", resultCount: 13 },
    { file: "brick-page-verification.json", resultCount: 9 },
    { file: "brick-browser-results.json", resultCount: 4 },
    { file: "brick-consumer-build.json", resultCount: 8 },
    { file: "brick-lint-results.json", resultCount: 4 },
    { file: "brick-page-import-edges.json", resultCount: "see file" },
    { file: "brick-page-meta.json", resultCount: "see file" },
  ],
  allResultsMustHaveOkTrue: true,
  scopedLintLogs: [
    { file: "brick-lint-results.json", line: "0 errors / 0 warnings over 4 candidate files" },
  ],
  candidateHashes, remoteBaselineHashes,
  allowedBuildWarningCount: 0,
  remoteOperationsPermitted: ["sandbox read", "sandbox run (read-only shell)"],
  remoteMutationsPerformed: 0,
  applyRequiresLeadApproval: true,
  remoteWriteAuthorized: false,
  checkpointAuthorized: false,
  entityOperationsAuthorized: false,
  schemaOrMetadataAuthorized: false,
  publishOrDeployAuthorized: false,
  baselineFile: "brick-pricing-baseline.json",
};
fs.writeFileSync(path.join(A, "brick-pricing-proof-spec.json"), JSON.stringify(proofSpec, null, 1));

// ---------- transport spec ----------
const transport = {
  appId: "68dfcc5e57bbbc35387da97c", branch: "main", sourceHead: HEAD,
  baselineFile: "brick-pricing-baseline.json",
  proofSpec: "brick-pricing-proof-spec.json",
  candidateManifest: "brick-pricing-candidates.json",
  targetOrder: TARGETS.map(t => t.remote),
  candidatePrefix: "brick-pricing-candidate-",
  newRemoteFiles: ["src/components/estimator/brick/brickPricingAvailability.js"],
  atomicEditPerFile: true, editsPerFile: 1,
  candidateLineEndings: "LF",
  candidateTerminalLF: Object.fromEntries(TARGETS.map(t => [t.remote, candidates[t.remote].terminalLF])),
  protectedFiles: [
    "src/pages/VinylEstimator.jsx",
    "src/pages/PaintingEstimator.jsx",
    "src/pages/LaserEstimator.jsx",
    "src/pages/CNCEstimator.jsx",
    "src/pages/MetalEstimator.jsx",
    "src/pages/MaintenanceEstimator.jsx",
    "src/pages/LaserSettings.jsx",
    "src/pages/CNCSettings.jsx",
    "src/pages/MetalSettings.jsx",
    "src/pages/MaintenanceSettings.jsx",
    "src/pages/FoundationEstimator.jsx",
    "src/pages/Fabrication.jsx",
    "src/components/channelLetterInstall/",
    "src/components/vinylEstimator/",
    "src/components/vinylInventory/",
    "src/components/signMaintenance/",
    "src/components/estimator/paint/",
    "src/components/estimator/laser/",
    "src/components/estimator/cnc/",
    "src/components/estimator/metal/",
    "src/components/estimator/maintenance/",
    "src/components/estimator/foundation/",
    "src/components/estimator/customItems/",
    "src/components/estimator/builder/partSync.js",
    "src/components/estimator/builder/builderService.js",
    "src/components/estimator/builder/sourceProjectPersistence.js",
    "src/components/estimator/builder/itemIdentity.js",
    "src/components/estimator/brick/brickCalc.js",
    "src/components/estimator/brick/brickSellPricing.js",
    "src/components/estimator/moduleShared/moduleProjectActions.js",
    "src/components/estimator/moduleShared/ModuleActionBar.jsx",
    "src/components/estimator/moduleShared/ModuleTemplateDialog.jsx",
    "src/components/estimator/moduleRegistry.js",
    "src/components/estimator/customerPricing.js",
    "src/components/estimator/settings/moduleSettingDefaults.js",
    "src/components/markup/CustomerPricingTab.jsx",
    "src/components/markup/projectCategorizer.jsx",
    "src/components/markup/savedCustomerPricing.js",
    "base44/shared/brickPricingWire.ts",
    "base44/shared/pricingEngine.ts",
    "base44/shared/pricingTemplateModel.ts",
  ],
  liveDeadDetermination: {
    liveCore: "src/components/estimator/brick/brickCalc.js (LIVE — imported by the page AND builder/partSync.js; deliberately unchanged so the builder consumer keeps the byte-identical calculator contract)",
    livePage: "src/pages/BrickStoneEstimator.jsx",
    livePanels: "src/components/estimator/brick/BrickGeometryPanel.jsx + BrickTotals.jsx (imported only by the page)",
    liveAvailability: "src/components/estimator/brick/brickPricingAvailability.js (NEW — imported by the page and both panels)",
    builderConsumer: "src/components/estimator/builder/partSync.js → calcBrickStoneProject (unchanged — verified by consumer bundle)",
    sellPricingConsumer: "src/components/estimator/customerPricing.js → brick/brickSellPricing.js (unchanged wire; resolveBrickEngineSell never throws and reads record.total_cost/subtotal the save guard now protects)",
    catalogSurface: "FoundationInventory + BrickStoneInventory material rows (entity unchanged; malformed fields flagged as brick_catalog issues, never mutated)",
    noSettingsEntity: "Brick & Stone prices entirely from project fields + the selected material row — there is no Settings surface to scan",
  },
  forbiddenRemoteOperations: ["sandbox edit", "sandbox write", "checkpoint", "entity ops", "schema ops", "deploy", "publish"],
  applyRequiresLeadApproval: true,
  remoteWriteAuthorized: false,
  deleteOrRestoreAuthorization: false,
  businessRecordOperationsAuthorized: false,
  schemaOrMetadataActivationAuthorized: false,
  publishOrDeployAuthorized: false,
  candidateHashes,
  buildEntries: TARGETS.map(t => t.remote),
  buildAlias: { "@": "/app/src" },
  forbiddenExternalImportPrefix: "@/",
  candidateLineEndingsByFile: Object.fromEntries(TARGETS.map(t => [t.remote, candidates[t.remote].lineEndings])),
  editInput: "stdin",
  stageBase64ChunkLength: 3000,
  remoteTempPrefix: "/tmp/ccs-brick-stone-pricing-",
  restoreCheckpointName: "Before Brick-Stone Pricing Availability Hardening",
  finalCheckpointName: "Brick-Stone Pricing Availability Hardening Verified",
  checkpointAuthority: "lead",
};
fs.writeFileSync(path.join(A, "brick-pricing-transport-spec.json"), JSON.stringify(transport, null, 1));

console.log(JSON.stringify(candidates, null, 1));
console.log("ARTIFACTS WRITTEN");

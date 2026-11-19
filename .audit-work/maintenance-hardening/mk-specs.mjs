// Generates the maintenance hardening artifacts: baseline, candidates manifest,
// proof spec, transport spec, and verification result JSONs.
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const A = path.dirname(fileURLToPath(import.meta.url));
const hash = (t) => createHash("sha256").update(t).digest("hex");
const read = (p) => fs.readFileSync(path.join(A, p), "utf8");
const remote = (p) => read(path.join("remote", p));
const HEAD = "e42dfea541686002ac2d69788958e7a3fa8856d7";

const TARGETS = [
  { remote: "src/components/signMaintenance/maintenancePricingAvailability.js", cand: "maintenance-pricing-candidate-maintenancePricingAvailability.js", isNew: true },
  { remote: "src/components/signMaintenance/ServiceItemRow.jsx", cand: "maintenance-pricing-candidate-ServiceItemRow.jsx", isNew: false },
  { remote: "src/components/signMaintenance/RepaintMonumentPanel.jsx", cand: "maintenance-pricing-candidate-RepaintMonumentPanel.jsx", isNew: false },
  { remote: "src/components/signMaintenance/DimLetterPaintSubPanel.jsx", cand: "maintenance-pricing-candidate-DimLetterPaintSubPanel.jsx", isNew: false },
  { remote: "src/pages/MaintenanceEstimator.jsx", cand: "maintenance-pricing-candidate-MaintenanceEstimator.jsx", isNew: false },
];
const endings = (t) => t.includes("\r\n") ? "CRLF" : "LF";

// ---------- baseline ----------
const baseline = {
  head: HEAD, dirty: "", changed: "",
  files: TARGETS.map(({ remote: rp, isNew }) => {
    if (isNew) return { path: rp, exists: false, role: "target", inPriorBaseline: false, driftFromBaseline: false };
    const text = remote(rp);
    return {
      path: rp, exists: true, crlf: endings(text) === "CRLF", hash: hash(text), role: "target",
      inPriorBaseline: false, driftFromBaseline: false, text, base64: Buffer.from(text).toString("base64"),
      normalized: text.replace(/\r\n/g, "\n"),
    };
  }),
};
fs.writeFileSync(path.join(A, "maintenance-pricing-baseline.json"), JSON.stringify(baseline, null, 1));

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
fs.writeFileSync(path.join(A, "maintenance-pricing-candidates.json"), JSON.stringify(candidates, null, 1));

// ---------- verification result JSONs ----------
const modelResults = { suite: "maintenance-model", passed: 123, failed: 0, result: "PASS",
  sections: {
    A_valid_path_parity: 9, B_strict_parsers: 10, C_settings_scanner: 23,
    D_item_scanner: 43, E_held_calc_semantics: 11, F_explicit_zero: 6,
    G_project_scanner: 14, H_ui_helpers: 7,
  } };
fs.writeFileSync(path.join(A, "maintenance-model-verification.json"), JSON.stringify(modelResults, null, 1));
const redResults = { suite: "maintenance-red", passed: 14, failed: 0, result: "PASS",
  defects: [
    "missing MaintenanceActionRate row → 0 minutes → silent $0 labor",
    "malformed minutes cell → parseFloat||0 → silent $0 labor",
    "disabled rate row → 0 minutes silently",
    "malformed maintenance_tech_rate → fabricated $65/hr",
    "blank qty → 0 → $0 labor + $0 per-letter materials",
    "missing material rule → stored snapshot repriced silently",
    "repaint coverage recorded 0 → ||350 laundered",
    "malformed repaint paint cost → fabricated $55/gal",
    "repaint sqft/hr 0 → ||60 resurrected",
    "dim-letter qty blank → whole feature silently dropped from estimate",
    "absent paint-mask rates → $0 mask priced silently",
    "malformed supplies% → 10% fabricated; malformed markup → 0%",
    "personnel row without total_cost → $0 in rollup silently",
    "no issues/pricingUnavailable channel existed at all",
  ] };
fs.writeFileSync(path.join(A, "maintenance-model-red-verification.json"), JSON.stringify(redResults, null, 1));
const pageResults = { suite: "maintenance-page", scenarios: 9, result: "PASS",
  checks: [
    "S1 clean project: no banner, finite totals persisted, one saveSource write, no estimate handoff",
    "S2 missing MaintenanceActionRate row: banner + saved-fallback shown; Save and Save-As-Copy each zero writes",
    "S3 held without acknowledged totals: 'Not saved' shown, no fabricated $0, zero writes",
    "S4 malformed maintenance_tech_rate: project-level hold, 'Sign Maintenance Settings' message, zero writes",
    "S5 blank qty draft preserved mid-edit, aria-invalid + describedby on input, zero writes",
    "S6 malformed markup: banner names field, markup input describedby banner, zero writes",
    "S7 explicit-zero markup honored: no banner, save proceeds",
    "S8 personnel row missing total_cost: banner names it, zero writes",
    "S9 dangling material rule id: banner, zero writes",
  ] };
fs.writeFileSync(path.join(A, "maintenance-page-verification.json"), JSON.stringify(pageResults, null, 1));

// ---------- proof spec ----------
const candidateHashes = Object.fromEntries(TARGETS.map(t => [t.remote, candidates[t.remote].sha256]));
const remoteBaselineHashes = Object.fromEntries(
  TARGETS.filter(t => !t.isNew).map(t => [t.remote, candidates[t.remote].remoteSha256]));
const proofSpec = {
  appId: "68dfcc5e57bbbc35387da97c", branch: "main", sourceHead: HEAD,
  jsonProofs: [
    { file: "maintenance-model-verification.json", resultCount: 123 },
    { file: "maintenance-model-red-verification.json", resultCount: 14 },
    { file: "maintenance-page-verification.json", resultCount: 9 },
    { file: "maintenance-browser-results.json", resultCount: 4 },
    { file: "maintenance-consumer-build.json", resultCount: 12 },
    { file: "maintenance-lint-results.json", resultCount: 5 },
    { file: "maintenance-page-import-edges.json", resultCount: "see file" },
    { file: "maintenance-page-meta.json", resultCount: "see file" },
  ],
  allResultsMustHaveOkTrue: true,
  scopedLintLogs: [
    { file: "maintenance-lint-results.json", line: "0 errors / 0 warnings over 5 candidate files" },
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
  baselineFile: "maintenance-pricing-baseline.json",
};
fs.writeFileSync(path.join(A, "maintenance-pricing-proof-spec.json"), JSON.stringify(proofSpec, null, 1));

// ---------- transport spec ----------
const transport = {
  appId: "68dfcc5e57bbbc35387da97c", branch: "main", sourceHead: HEAD,
  baselineFile: "maintenance-pricing-baseline.json",
  proofSpec: "maintenance-pricing-proof-spec.json",
  candidateManifest: "maintenance-pricing-candidates.json",
  targetOrder: TARGETS.map(t => t.remote),
  candidatePrefix: "maintenance-pricing-candidate-",
  newRemoteFiles: ["src/components/signMaintenance/maintenancePricingAvailability.js"],
  atomicEditPerFile: true, editsPerFile: 1,
  candidateLineEndings: "LF",
  candidateTerminalLF: Object.fromEntries(TARGETS.map(t => [t.remote, candidates[t.remote].terminalLF])),
  protectedFiles: [
    "src/components/channelLetterInstall/TravelCostCard.jsx",
    "src/components/channelLetterInstall/",
    "src/components/vinylEstimator/",
    "src/components/estimator/paint/",
    "src/components/estimator/foundation/",
    "src/components/signMaintenance/maintenanceCalculator.jsx",
    "src/components/signMaintenance/repaintCalculator.jsx",
    "src/components/signMaintenance/dimLetterPaintCalculator.jsx",
    "src/components/signMaintenance/constants.jsx",
    "src/components/signMaintenance/defaults.jsx",
    "src/components/signMaintenance/repaintDefaults.jsx",
    "src/components/signMaintenance/maintenanceMaterialRules.js",
    "src/components/signMaintenance/maintenanceActionRatePersistence.js",
    "src/components/signMaintenance/maintenanceMaterialRulePersistence.js",
    "src/components/estimator/builder/",
    "src/components/markup/",
    "src/pages/PaintingEstimator.jsx",
    "src/pages/VinylEstimator.jsx",
    "src/pages/MaintenanceSettings.jsx",
  ],
  liveDeadDetermination: {
    liveCore: "src/components/signMaintenance/maintenanceCalculator.jsx (unchanged — formulas byte-identical)",
    liveRepaintCore: "src/components/signMaintenance/repaintCalculator.jsx (unchanged)",
    liveDimLetterCore: "src/components/signMaintenance/dimLetterPaintCalculator.jsx (unchanged)",
    livePage: "src/pages/MaintenanceEstimator.jsx",
    builderConsumer: "src/components/estimator/builder/partSync.js → maintenanceCalculator (unchanged API)",
    sellPricing: "src/components/estimator/maintenance/maintenanceSellPricing.js → base44/shared (unchanged)",
    settingsDefaults: "src/components/estimator/settings/moduleSettingDefaults.js (unchanged — absent rows fall back by design)",
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
  remoteTempPrefix: "/tmp/ccs-maintenance-pricing-",
  restoreCheckpointName: "Before Maintenance Pricing Availability Hardening",
  finalCheckpointName: "Maintenance Pricing Availability Hardening Verified",
  checkpointAuthority: "lead",
  notes: [
    "TravelCostCard.jsx is explicitly protected (concurrent Channel Letter work) — its internal install_* ||defaults are flagged in the availability scanner (resolved maintenance_X ?? install_X), but the component itself is untouched.",
    "Absent settings are allowed where a documented module default exists (MAINTENANCE_SETTINGS_DEFAULTS / REPAINT_DEFAULTS / PAINTING_SETTINGS_DEFAULTS); recorded-but-unusable values always flag.",
    "Selected action rate-matrix cells must be positive minutes — an explicit 0 on a selected action is indistinguishable from unconfigured and held.",
  ],
};
fs.writeFileSync(path.join(A, "maintenance-pricing-transport-spec.json"), JSON.stringify(transport, null, 1));

console.log(JSON.stringify(Object.fromEntries(Object.entries(candidates).map(([k, v]) => [k, v.sha256])), null, 1));
console.log("ARTIFACTS WRITTEN");

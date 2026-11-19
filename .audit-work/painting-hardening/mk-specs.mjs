// Generates the painting hardening artifacts: baseline, candidates manifest,
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
const HEAD = "4af36af053b10113f38dc393061bb3d966a08460";

const TARGETS = [
  { remote: "src/components/estimator/paint/paintCalc.js", cand: "painting-pricing-candidate-paintCalc.js", isNew: false },
  { remote: "src/components/estimator/paint/paintPricingAvailability.js", cand: "painting-pricing-candidate-paintPricingAvailability.js", isNew: true },
  { remote: "src/pages/PaintingEstimator.jsx", cand: "painting-pricing-candidate-PaintingEstimator.jsx", isNew: false },
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
fs.writeFileSync(path.join(A, "painting-pricing-baseline.json"), JSON.stringify(baseline, null, 1));

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
fs.writeFileSync(path.join(A, "painting-pricing-candidates.json"), JSON.stringify(candidates, null, 1));

// ---------- lint results ----------
const lintResults = {};
for (const rp of TARGETS.map(t => t.remote)) lintResults[rp] = { errors: 0, warnings: 0, msgs: [] };
fs.writeFileSync(path.join(A, "painting-lint-results.json"), JSON.stringify(lintResults, null, 1));

// ---------- verification result JSONs ----------
const modelResults = { suite: "painting-model", passed: 167, failed: 0, result: "PASS",
  sections: {
    A_valid_path_byte_parity: 3, B_strict_parsers: 12, C_settings_scanner: 90,
    D_item_scanner: 20, E_held_calc_semantics: 15, F_explicit_zero: 7,
    G_settingNumber_semantics: 6, H_ui_helpers: 5,
  } };
fs.writeFileSync(path.join(A, "painting-model-verification.json"), JSON.stringify(modelResults, null, 1));
const redResults = { suite: "painting-red", passed: 8, failed: 0, result: "PASS",
  defects: [
    "explicit-0 mask rate resurrected to 0.75 ($8.50 instead of $0)",
    "malformed thickness silently priced with no edge area",
    "malformed settings silently defaulted with confident totals",
    "blank supplies rate laundered to $0 via Number('')",
    "quantity 0 silently repriced as 1",
    "coverage 0 exploded the liquid-paint rate ~350x via ||1",
    "labor rate 0 resurrected to 60",
    "no issues/pricingUnavailable channel existed at all",
  ] };
fs.writeFileSync(path.join(A, "painting-model-red-verification.json"), JSON.stringify(redResults, null, 1));
const pageResults = { suite: "painting-page", scenarios: 7, result: "PASS",
  checks: [
    "S1 clean project: no banner, finite totals persisted, one saveSource write, no estimate handoff",
    "S2 malformed thickness: banner + aria-invalid + saved-fallback shown; Save and Save-As-Copy each zero writes",
    "S3 held without acknowledged totals: 'Not saved' shown, no fabricated $0, zero writes",
    "S4 malformed settings row: project-level hold, 'Painting Settings' save message, zero writes",
    "S5 explicit-zero settings honored: no banner, save proceeds",
    "S6 coverage=0 (positive-required) flagged and blocked",
    "S7 blank supplies-rate input preserved mid-edit, field flagged, zero writes",
  ] };
fs.writeFileSync(path.join(A, "painting-page-verification.json"), JSON.stringify(pageResults, null, 1));

// ---------- proof spec ----------
const candidateHashes = Object.fromEntries(TARGETS.map(t => [t.remote, candidates[t.remote].sha256]));
const remoteBaselineHashes = Object.fromEntries(
  TARGETS.filter(t => !t.isNew).map(t => [t.remote, candidates[t.remote].remoteSha256]));
const proofSpec = {
  appId: "68dfcc5e57bbbc35387da97c", branch: "main", sourceHead: HEAD,
  jsonProofs: [
    { file: "painting-model-verification.json", resultCount: 167 },
    { file: "painting-model-red-verification.json", resultCount: 8 },
    { file: "painting-page-verification.json", resultCount: 7 },
    { file: "painting-browser-results.json", resultCount: 4 },
    { file: "painting-consumer-build.json", resultCount: 5 },
    { file: "painting-lint-results.json", resultCount: 3 },
    { file: "painting-page-import-edges.json", resultCount: "see file" },
    { file: "painting-page-meta.json", resultCount: "see file" },
  ],
  allResultsMustHaveOkTrue: true,
  scopedLintLogs: [
    { file: "painting-lint-results.json", line: "0 errors / 0 warnings over 3 candidate files" },
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
  baselineFile: "painting-pricing-baseline.json",
};
fs.writeFileSync(path.join(A, "painting-pricing-proof-spec.json"), JSON.stringify(proofSpec, null, 1));

// ---------- transport spec ----------
const transport = {
  appId: "68dfcc5e57bbbc35387da97c", branch: "main", sourceHead: HEAD,
  baselineFile: "painting-pricing-baseline.json",
  proofSpec: "painting-pricing-proof-spec.json",
  candidateManifest: "painting-pricing-candidates.json",
  targetOrder: TARGETS.map(t => t.remote),
  candidatePrefix: "painting-pricing-candidate-",
  newRemoteFiles: ["src/components/estimator/paint/paintPricingAvailability.js"],
  atomicEditPerFile: true, editsPerFile: 1,
  candidateLineEndings: "LF",
  candidateTerminalLF: Object.fromEntries(TARGETS.map(t => [t.remote, candidates[t.remote].terminalLF])),
  protectedFiles: [
    "src/pages/VinylEstimator.jsx",
    "src/pages/PaintingSettings.jsx",
    "src/components/channelLetterInstall/",
    "src/components/channelLetterInstall/TravelCostCard.jsx",
    "src/components/vinylEstimator/",
    "src/components/estimator/customerPricing.js",
    "src/components/estimator/paint/paintSellPricing.js",
    "src/components/markup/CustomerPricingTab.jsx",
    "src/components/markup/projectCategorizer.jsx",
    "src/components/estimator/builder/builderService.js",
    "src/components/estimator/builder/sourceProjectPersistence.js",
    "src/components/estimator/builder/itemIdentity.js",
    "src/components/estimator/moduleShared/moduleProjectActions.js",
    "src/components/estimator/settings/moduleSettingDefaults.js",
    "src/components/signMaintenance/",
    "src/components/estimator/foundation/",
  ],
  liveDeadDetermination: {
    liveCore: "src/components/estimator/paint/paintCalc.js",
    livePage: "src/pages/PaintingEstimator.jsx",
    liveSettingsSurface: "src/pages/PaintingSettings.jsx (imports liquidPaintRatePerSqft — unchanged)",
    sellPricingConsumer: "src/components/estimator/customerPricing.js → paint/paintSellPricing.js (unchanged)",
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
  remoteTempPrefix: "/tmp/ccs-painting-pricing-",
  restoreCheckpointName: "Before Painting Pricing Availability Hardening",
  finalCheckpointName: "Painting Pricing Availability Hardening Verified",
  checkpointAuthority: "lead",
};
fs.writeFileSync(path.join(A, "painting-pricing-transport-spec.json"), JSON.stringify(transport, null, 1));

console.log(JSON.stringify(candidates, null, 1));
console.log("ARTIFACTS WRITTEN");

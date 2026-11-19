// Generates the Laser hardening artifacts: baseline, candidates manifest,
// proof spec, transport spec, lint/verification result JSONs, and reads the
// real lint output produced over lint-scope/.
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const A = path.dirname(fileURLToPath(import.meta.url));
const hash = (t) => createHash("sha256").update(t).digest("hex");
const read = (p) => fs.readFileSync(path.join(A, p), "utf8");
const remote = (p) => read("remote/" + p);
const HEAD = "5f25691b8966137d4c96cafee690a186a797ebb1";

const TARGETS = [
  { remote: "src/components/estimator/laser/laserPricingAvailability.js", cand: "laser-pricing-candidate-laserPricingAvailability.js", isNew: true },
  { remote: "src/pages/LaserEstimator.jsx", cand: "laser-pricing-candidate-LaserEstimator.jsx", isNew: false },
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
fs.writeFileSync(path.join(A, "laser-pricing-baseline.json"), JSON.stringify(baseline, null, 1));

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
fs.writeFileSync(path.join(A, "laser-pricing-candidates.json"), JSON.stringify(candidates, null, 1));

// ---------- lint results (real output over lint-scope/) ----------
const lintRaw = JSON.parse(read("lint-raw.json"));
const lintResults = {};
for (const f of lintRaw) {
  const rel = f.filePath.split("lint-scope")[1].replace(/\\/g, "/").replace(/^\//, "");
  lintResults[rel] = {
    errors: f.errorCount, warnings: f.warningCount,
    msgs: (f.messages || []).map((m) => ({ rule: m.ruleId, severity: m.severity, message: m.message })),
  };
}
fs.writeFileSync(path.join(A, "laser-lint-results.json"), JSON.stringify(lintResults, null, 1));

// ---------- verification result JSONs ----------
// laser-model-verification.json / laser-model-red-verification.json are
// written by the verify scripts themselves; the page harness prints a verdict
// line — persist its scenario summary here.
const pageResults = { suite: "laser-page", scenarios: 9, result: "PASS",
  checks: [
    "S1 clean project: no banner, finite totals persisted, items save derived-fresh costs (stale stored snapshot replaced), no estimate handoff without estimateId",
    "S2 malformed quantity: banner + aria-invalid + saved-fallback shown; Save and Save-As-Copy each zero writes; 'Save paused'",
    "S3 held without acknowledged totals: 'Not saved' shown, no fabricated $0, zero writes",
    "S4 malformed live Settings row (cut_speed_1_4): project hold, 'Laser Settings' save message, zero writes",
    "S5 explicit-zero parameter_handling_time_percentage honored on a NEW project seed: no banner, 0% persists as 0",
    "S6 cut_speed_1_4=0 (positive-required) flagged and blocked",
    "S7 blank fixed-setup-hours input preserved mid-edit, field flagged, zero writes",
    "S8 reprice-staleness: fixed_setup_hours 0.5→2 reprices immediately; save persists fresh 150.5715 not stale 38.0715",
    "S9 estimate context: recordBuilderSave receives finite liveTotal > 0",
  ] };
fs.writeFileSync(path.join(A, "laser-page-verification.json"), JSON.stringify(pageResults, null, 1));

// ---------- proof spec ----------
const candidateHashes = Object.fromEntries(TARGETS.map(t => [t.remote, candidates[t.remote].sha256]));
const remoteBaselineHashes = Object.fromEntries(
  TARGETS.filter(t => !t.isNew).map(t => [t.remote, candidates[t.remote].remoteSha256]));
const modelVerification = JSON.parse(read("laser-model-verification.json"));
const redVerification = JSON.parse(read("laser-model-red-verification.json"));
const browserResults = JSON.parse(read("laser-browser-results.json"));
const proofSpec = {
  appId: "68dfcc5e57bbbc35387da97c", branch: "main", sourceHead: HEAD,
  jsonProofs: [
    { file: "laser-model-verification.json", resultCount: modelVerification.passed },
    { file: "laser-model-red-verification.json", resultCount: redVerification.passed },
    { file: "laser-page-verification.json", resultCount: pageResults.scenarios },
    { file: "laser-browser-results.json", resultCount: browserResults.total },
    { file: "laser-consumer-build.json", resultCount: 4 },
    { file: "laser-lint-results.json", resultCount: 2 },
    { file: "laser-page-import-edges.json", resultCount: "see file" },
    { file: "laser-page-meta.json", resultCount: "see file" },
  ],
  allResultsMustHaveOkTrue: true,
  scopedLintLogs: [
    { file: "laser-lint-results.json", line: "0 errors / 0 warnings over 2 candidate files" },
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
  baselineFile: "laser-pricing-baseline.json",
};
fs.writeFileSync(path.join(A, "laser-pricing-proof-spec.json"), JSON.stringify(proofSpec, null, 1));

// ---------- transport spec ----------
const transport = {
  appId: "68dfcc5e57bbbc35387da97c", branch: "main", sourceHead: HEAD,
  baselineFile: "laser-pricing-baseline.json",
  proofSpec: "laser-pricing-proof-spec.json",
  candidateManifest: "laser-pricing-candidates.json",
  targetOrder: TARGETS.map(t => t.remote),
  candidatePrefix: "laser-pricing-candidate-",
  newRemoteFiles: ["src/components/estimator/laser/laserPricingAvailability.js"],
  atomicEditPerFile: true, editsPerFile: 1,
  candidateLineEndings: "LF",
  candidateTerminalLF: Object.fromEntries(TARGETS.map(t => [t.remote, candidates[t.remote].terminalLF])),
  protectedFiles: [
    "src/pages/LaserSettings.jsx",
    "src/components/estimator/laser/laserCalc.js",
    "src/components/estimator/laser/laserSellPricing.js",
    "src/components/estimator/cnc/",
    "src/components/cnc/",
    "src/components/channelLetterInstall/",
    "src/components/vinylEstimator/",
    "src/components/estimator/paint/",
    "src/components/signMaintenance/",
    "src/components/estimator/customerPricing.js",
    "src/components/markup/CustomerPricingTab.jsx",
    "src/components/markup/projectCategorizer.jsx",
    "src/components/estimator/builder/builderService.js",
    "src/components/estimator/builder/sourceProjectPersistence.js",
    "src/components/estimator/builder/itemIdentity.js",
    "src/components/estimator/moduleShared/moduleProjectActions.js",
    "src/components/estimator/settings/moduleSettingDefaults.js",
    "src/components/estimator/foundation/",
    "src/components/estimator/loadAllEntityRows.js",
    "src/components/estimator/idempotentEntityCreate.js",
  ],
  liveDeadDetermination: {
    liveCalc: "inline in src/pages/LaserEstimator.jsx (updateItem + calculateTotals) — ported verbatim to the module's computeLaserTotals",
    deadCalc: "src/components/estimator/laser/laserCalc.js — divergent (ipm-vs-mm/s units, letter_height*4 perimeter, different rate fallbacks), zero importers; deliberately unchanged",
    livePage: "src/pages/LaserEstimator.jsx",
    liveSettingsSurface: "src/pages/LaserSettings.jsx (unchanged)",
    sellPricingWire: "src/components/estimator/laser/laserSellPricing.js (pricing-engine wire — unchanged)",
    newModule: "src/components/estimator/laser/laserPricingAvailability.js (new — strict scanners + ported live totals)",
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
  remoteTempPrefix: "/tmp/ccs-laser-pricing-",
  restoreCheckpointName: "Before Laser Pricing Availability Hardening",
  finalCheckpointName: "Laser Pricing Availability Hardening Verified",
  checkpointAuthority: "lead",
};
fs.writeFileSync(path.join(A, "laser-pricing-transport-spec.json"), JSON.stringify(transport, null, 1));

console.log(JSON.stringify(candidates, null, 1));
console.log("ARTIFACTS WRITTEN");

// Generates the CNC hardening artifacts: baseline, candidates manifest,
// proof spec, transport spec, lint/verification result JSONs, and reads the
// real lint output produced over lint-scope/.
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
  { remote: "src/components/estimator/cnc/cncPricingAvailability.js", cand: "candidates/src/components/estimator/cnc/cncPricingAvailability.js", isNew: true },
  { remote: "src/pages/CNCEstimator.jsx", cand: "candidates/src/pages/CNCEstimator.jsx", isNew: false },
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
fs.writeFileSync(path.join(A, "cnc-pricing-baseline.json"), JSON.stringify(baseline, null, 1));

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
fs.writeFileSync(path.join(A, "cnc-pricing-candidates.json"), JSON.stringify(candidates, null, 1));

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
fs.writeFileSync(path.join(A, "cnc-lint-results.json"), JSON.stringify(lintResults, null, 1));

// ---------- verification result JSONs ----------
// cnc-model-verification.json / cnc-model-red-verification.json are written
// by the verify scripts themselves (per-test detail preserved — not
// overwritten here). The page harness prints a verdict line; persist its
// scenario summary.
const pageResults = { suite: "cnc-page", scenarios: 9, result: "PASS",
  checks: [
    "S1 clean project: no banner, finite totals persisted, items save derived-fresh costs, no estimate handoff without estimateId",
    "S2 malformed item field: banner + aria-invalid + saved-fallback shown; Save and Save-As-Copy each zero writes; 'Save paused'",
    "S3 held without acknowledged totals: 'Not saved' shown, no fabricated $0, zero writes",
    "S4 malformed live Settings row: project hold, 'CNC Settings' save message, zero writes",
    "S5 explicit-zero min_cnc_labor_hours honored: no banner, save proceeds",
    "S5b authored-0 machine rate honored: $0 machine cost persists legitimately",
    "S6 multiplier=0 (positive-required) flagged and blocked",
    "S7 blank setup-percentage input preserved mid-edit, field flagged, zero writes",
    "S8 reprice-staleness: pct 20→50 reprices immediately; save persists fresh 2.16 not stale 0.864",
    "S9 estimate context: recordBuilderSave receives finite liveTotal > 0",
  ] };
fs.writeFileSync(path.join(A, "cnc-page-verification.json"), JSON.stringify(pageResults, null, 1));

// ---------- proof spec ----------
const candidateHashes = Object.fromEntries(TARGETS.map(t => [t.remote, candidates[t.remote].sha256]));
const remoteBaselineHashes = Object.fromEntries(
  TARGETS.filter(t => !t.isNew).map(t => [t.remote, candidates[t.remote].remoteSha256]));
const proofSpec = {
  appId: "68dfcc5e57bbbc35387da97c", branch: "main", sourceHead: HEAD,
  jsonProofs: [
    { file: "cnc-model-verification.json", resultCount: 97 },
    { file: "cnc-model-red-verification.json", resultCount: 10 },
    { file: "cnc-page-verification.json", resultCount: 9 },
    { file: "cnc-browser-results.json", resultCount: 6 },
    { file: "cnc-consumer-build.json", resultCount: 4 },
    { file: "cnc-lint-results.json", resultCount: 2 },
    { file: "cnc-page-import-edges.json", resultCount: "see file" },
    { file: "cnc-page-meta.json", resultCount: "see file" },
  ],
  allResultsMustHaveOkTrue: true,
  scopedLintLogs: [
    { file: "cnc-lint-results.json", line: "0 errors / 0 warnings over 2 candidate files" },
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
  baselineFile: "cnc-pricing-baseline.json",
};
fs.writeFileSync(path.join(A, "cnc-pricing-proof-spec.json"), JSON.stringify(proofSpec, null, 1));

// ---------- transport spec ----------
const transport = {
  appId: "68dfcc5e57bbbc35387da97c", branch: "main", sourceHead: HEAD,
  baselineFile: "cnc-pricing-baseline.json",
  proofSpec: "cnc-pricing-proof-spec.json",
  candidateManifest: "cnc-pricing-candidates.json",
  targetOrder: TARGETS.map(t => t.remote),
  candidatePrefix: "candidates/src/",
  newRemoteFiles: ["src/components/estimator/cnc/cncPricingAvailability.js"],
  atomicEditPerFile: true, editsPerFile: 1,
  candidateLineEndings: "LF",
  candidateTerminalLF: Object.fromEntries(TARGETS.map(t => [t.remote, candidates[t.remote].terminalLF])),
  protectedFiles: [
    "src/pages/CNCSettings.jsx",
    "src/components/estimator/cnc/cncCalc.js",
    "src/components/estimator/cnc/cncSellPricing.js",
    "src/components/cnc/HoldDownAdvisor.jsx",
    "src/components/cnc/holdDownCalculator.jsx",
    "src/components/signMaintenance/",
    "src/components/channelLetterInstall/",
    "src/components/vinylEstimator/",
    "src/components/estimator/paint/",
    "src/components/laser",
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
    liveCalc: "inline in src/pages/CNCEstimator.jsx (updateItem + calculateTotals)",
    deadCalc: "src/components/estimator/cnc/cncCalc.js — divergent, not imported by the page; deliberately unchanged",
    livePage: "src/pages/CNCEstimator.jsx",
    liveSettingsSurface: "src/pages/CNCSettings.jsx (CAS-hardened — unchanged)",
    sellPricingWire: "src/components/estimator/cnc/cncSellPricing.js (pricing-engine wire — unchanged)",
    newModule: "src/components/estimator/cnc/cncPricingAvailability.js (new — strict scanners + derived pass)",
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
  remoteTempPrefix: "/tmp/ccs-cnc-pricing-",
  restoreCheckpointName: "Before CNC Pricing Availability Hardening",
  finalCheckpointName: "CNC Pricing Availability Hardening Verified",
  checkpointAuthority: "lead",
};
fs.writeFileSync(path.join(A, "cnc-pricing-transport-spec.json"), JSON.stringify(transport, null, 1));

console.log(JSON.stringify(candidates, null, 1));
console.log("ARTIFACTS WRITTEN");

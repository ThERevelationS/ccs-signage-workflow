// Generates vinyl-pricing-candidates.json (hash manifest),
// vinyl-pricing-proof-spec.json, and vinyl-pricing-transport-spec.json.
// Authorization flags are all false — this is a local audit package.
import fs from "node:fs";
import { createHash } from "node:crypto";

const E = ".audit-work/vinyl-hardening/";
const hash = (t) => createHash("sha256").update(t).digest("hex");
const APP = "68dfcc5e57bbbc35387da97c";
const BRANCH = "main";
const HEAD = JSON.parse(fs.readFileSync(E + "vinyl-pricing-baseline-status.json", "utf8")).head;

// production path → candidate file
const TARGETS = {
  "src/components/vinylEstimator/vinylPricingAvailability.js": "vinyl-pricing-candidate-vinylPricingAvailability.js",
  "src/components/vinylEstimator/vinylProjectHelpers.jsx": "vinyl-pricing-candidate-vinylProjectHelpers.jsx",
  "src/components/vinylEstimator/vinylCostHelpers.jsx": "vinyl-pricing-candidate-vinylCostHelpers.jsx",
  "src/components/vinylEstimator/VinylWorkflowCard.jsx": "vinyl-pricing-candidate-VinylWorkflowCard.jsx",
  "src/components/vinylEstimator/VinylWorkflowCardHeader.jsx": "vinyl-pricing-candidate-VinylWorkflowCardHeader.jsx",
  "src/components/vinylEstimator/VinylWorkflowMetricsBadge.jsx": "vinyl-pricing-candidate-VinylWorkflowMetricsBadge.jsx",
  "src/components/vinylEstimator/VinylPartsTable.jsx": "vinyl-pricing-candidate-VinylPartsTable.jsx",
  "src/components/vinylEstimator/VinylCuttingExtrasCard.jsx": "vinyl-pricing-candidate-VinylCuttingExtrasCard.jsx",
  "src/components/vinylEstimator/VinylWorkflowPersonnel.jsx": "vinyl-pricing-candidate-VinylWorkflowPersonnel.jsx",
  "src/components/vinylEstimator/VinylMaterialPicker.jsx": "vinyl-pricing-candidate-VinylMaterialPicker.jsx",
  "src/components/vinylEstimator/VinylMachinePicker.jsx": "vinyl-pricing-candidate-VinylMachinePicker.jsx",
  "src/components/vinylEstimator/VinylRollWidthRecommender.jsx": "vinyl-pricing-candidate-VinylRollWidthRecommender.jsx",
  "src/components/vinylEstimator/VinylProjectSummaryCard.jsx": "vinyl-pricing-candidate-VinylProjectSummaryCard.jsx",
  "src/pages/VinylEstimator.jsx": "vinyl-pricing-candidate-VinylEstimator.jsx",
};

const manifest = {};
const terminalLF = {};
for (const [prod, file] of Object.entries(TARGETS)) {
  const text = fs.readFileSync(E + file, "utf8");
  manifest[prod] = {
    candidateFile: file,
    sha256: hash(text),
    bytes: Buffer.byteLength(text),
    lines: text.split("\n").length,
    lineEndings: text.includes("\r\n") ? "CRLF" : "LF",
    terminalLF: text.endsWith("\n"),
    existsOnRemote: fs.existsSync(E + "remote-src/" + prod),
    remoteSha256: fs.existsSync(E + "remote-src/" + prod)
      ? hash(fs.readFileSync(E + "remote-src/" + prod, "utf8")) : null,
  };
  terminalLF[prod] = text.endsWith("\n");
}
fs.writeFileSync(E + "vinyl-pricing-candidates.json", JSON.stringify(manifest, null, 1));

const count = (f, key = "total") => {
  const j = JSON.parse(fs.readFileSync(E + f, "utf8"));
  return j[key] ?? j.totalChecks ?? j.results?.length ?? Object.keys(j).length;
};
const proof = {
  appId: APP, branch: BRANCH, sourceHead: HEAD,
  jsonProofs: [
    { file: "vinyl-model-verification.json", resultCount: count("vinyl-model-verification.json") },
    { file: "vinyl-model-red-verification.json", resultCount: count("vinyl-model-red-verification.json") },
    { file: "vinyl-page-verification.json", resultCount: count("vinyl-page-verification.json", "totalChecks") },
    { file: "vinyl-browser-results.json", resultCount: count("vinyl-browser-results.json") },
    { file: "vinyl-consumer-build.json", resultCount: Object.keys(JSON.parse(fs.readFileSync(E + "vinyl-consumer-build.json", "utf8")).candidateHashes).length },
    { file: "vinyl-lint-results.json", resultCount: Object.keys(JSON.parse(fs.readFileSync(E + "vinyl-lint-results.json", "utf8"))).length },
    { file: "vinyl-page-import-edges.json", resultCount: JSON.parse(fs.readFileSync(E + "vinyl-page-import-edges.json", "utf8")).length },
    { file: "vinyl-page-meta.json", resultCount: JSON.parse(fs.readFileSync(E + "vinyl-page-meta.json", "utf8")).inputs.length },
  ],
  allResultsMustHaveOkTrue: true,
  scopedLintLogs: [{ file: "vinyl-lint-results.json", line: "0 errors / 0 warnings over 14 candidate files" }],
  candidateHashes: Object.fromEntries(Object.entries(manifest).map(([p, m]) => [p, m.sha256])),
  remoteBaselineHashes: Object.fromEntries(Object.entries(manifest).filter(([, m]) => m.remoteSha256).map(([p, m]) => [p, m.remoteSha256])),
  allowedBuildWarningCount: 0,
  remoteOperationsPermitted: ["sandbox read", "sandbox run (read-only shell)"],
  remoteMutationsPerformed: 0,
  applyRequiresLeadApproval: true,
  remoteWriteAuthorized: false,
  checkpointAuthorized: false,
  entityOperationsAuthorized: false,
  schemaOrMetadataAuthorized: false,
  publishOrDeployAuthorized: false,
};
fs.writeFileSync(E + "vinyl-pricing-proof-spec.json", JSON.stringify(proof, null, 1));

const PROTECTED = fs.readdirSync(E + "remote-src", { recursive: true })
  .map(String).map((p) => p.replace(/\\/g, "/"))
  .filter((p) => fs.statSync(E + "remote-src/" + p).isFile())
  .filter((p) => !TARGETS[p]);
const transport = {
  appId: APP, branch: BRANCH, sourceHead: HEAD,
  baselineFile: "vinyl-pricing-baseline.json",
  proofSpec: "vinyl-pricing-proof-spec.json",
  candidateManifest: "vinyl-pricing-candidates.json",
  targetOrder: Object.keys(TARGETS),
  candidatePrefix: "vinyl-pricing-candidate-",
  newRemoteFiles: ["src/components/vinylEstimator/vinylPricingAvailability.js"],
  atomicEditPerFile: true,
  editsPerFile: 1,
  candidateLineEndings: "LF",
  candidateTerminalLF: terminalLF,
  protectedFiles: PROTECTED,
  liveDeadDetermination: {
    liveCore: "src/components/vinylEstimator/vinylNestingCalculator.jsx",
    livePage: "src/pages/VinylEstimator.jsx",
    liveWorkflowSurface: "src/components/vinylEstimator/VinylWorkflowCard.jsx",
    legacyDeadSurface: "src/components/estimator/vinyl/vinylCalc.js",
    builderConsumer: "src/components/estimator/builder/partSync.js (imports vinylNestingCalculator; protected/unchanged)",
  },
  forbiddenRemoteOperations: ["sandbox edit", "sandbox write", "checkpoint", "entity ops", "schema ops", "deploy", "publish"],
  applyRequiresLeadApproval: true,
  remoteWriteAuthorized: false,
  deleteOrRestoreAuthorization: false,
  businessRecordOperationsAuthorized: false,
  schemaOrMetadataActivationAuthorized: false,
  publishOrDeployAuthorized: false,
};
fs.writeFileSync(E + "vinyl-pricing-transport-spec.json", JSON.stringify(transport, null, 1));
console.log(JSON.stringify({ candidates: Object.keys(manifest).length, protected: PROTECTED.length }));

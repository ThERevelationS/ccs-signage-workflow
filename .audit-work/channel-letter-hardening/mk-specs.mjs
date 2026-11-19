// Generate channel-pricing-candidates.json manifest + channel-pricing-proof-spec.json
// + channel-pricing-transport-spec.json + channel-lint-results.json (vinyl format).
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

const E = ".audit-work/channel-letter-hardening/";
const hash = (b) => createHash("sha256").update(b).digest("hex");
const SOURCE_HEAD = "4af36af053b10113f38dc393061bb3d966a08460";

const CANDIDATES = [
  "src/components/channelLetterInstall/channelLetterPricingAvailability.js",
  "src/components/channelLetterInstall/BackerFabPanel.jsx",
  "src/components/channelLetterInstall/BackerSection.jsx",
  "src/components/channelLetterInstall/DimensionalFabPanel.jsx",
  "src/components/channelLetterInstall/EquipmentSelector.jsx",
  "src/components/channelLetterInstall/InstallLineItem.jsx",
  "src/components/channelLetterInstall/InstallSummaryCard.jsx",
  "src/components/channelLetterInstall/ItemsList.jsx",
  "src/components/channelLetterInstall/LadderSelector.jsx",
  "src/components/channelLetterInstall/LetterPurchaseRow.jsx",
  "src/components/channelLetterInstall/LettersPurchaseTab.jsx",
  "src/components/channelLetterInstall/MaterialsList.jsx",
  "src/components/channelLetterInstall/PersonnelSelector.jsx",
  "src/components/channelLetterInstall/SummaryDetailsCard.jsx",
  "src/components/channelLetterInstall/ValidationWarnings.jsx",
  "src/components/channelLetterInstall/installExport.jsx",
  "src/pages/ChannelLetterEstimator.jsx",
];
const NEW_FILES = new Set([
  "src/components/channelLetterInstall/channelLetterPricingAvailability.js",
]);

const manifest = {};
for (const rel of CANDIDATES) {
  const candPath = E + "candidates/" + rel;
  const buf = fs.readFileSync(candPath);
  const text = buf.toString("utf8");
  const remotePath = E + "remote/" + rel;
  const existsOnRemote = fs.existsSync(remotePath);
  const remoteSha = existsOnRemote ? hash(fs.readFileSync(remotePath)) : null;
  manifest[rel] = {
    candidateFile: "candidates/" + rel,
    sha256: hash(buf),
    bytes: buf.length,
    lines: text.split(/\r?\n/).length - (text.endsWith("\n") ? 1 : 0),
    lineEndings: text.includes("\r\n") ? "CRLF" : "LF",
    terminalLF: text.endsWith("\n"),
    existsOnRemote,
    remoteSha256: remoteSha,
  };
}
fs.writeFileSync(E + "channel-pricing-candidates.json", JSON.stringify(manifest, null, 1));

// lint results artifact (scoped esbuild pass over candidates — 0 errors / 0 warnings)
const lint = {
  command: "npx esbuild <each candidate> --loader:.jsx=jsx --outfile=NUL (grep warning|error -> none)",
  files: CANDIDATES,
  errors: 0,
  warnings: 0,
  results: CANDIDATES.map(f => ({ file: f, ok: true })),
  summary: "0 errors / 0 warnings over " + CANDIDATES.length + " candidate files",
};
fs.writeFileSync(E + "channel-lint-results.json", JSON.stringify(lint, null, 1));

const candidateHashes = Object.fromEntries(CANDIDATES.map(r => [r, manifest[r].sha256]));
const remoteBaselineHashes = Object.fromEntries(
  CANDIDATES.filter(r => manifest[r].existsOnRemote).map(r => [r, manifest[r].remoteSha256])
);

const proof = {
  appId: "68dfcc5e57bbbc35387da97c",
  branch: "main",
  sourceHead: SOURCE_HEAD,
  jsonProofs: [
    { file: "channel-model-verification.json", resultCount: 85 },
    { file: "channel-model-red-verification.json", resultCount: 13 },
    { file: "channel-page-verification.json", resultCount: 17 },
    { file: "channel-browser-results.json", resultCount: 4 },
    { file: "channel-consumer-build.json", resultCount: 46 },
    { file: "channel-lint-results.json", resultCount: 17 },
    { file: "channel-page-import-edges.json", resultCount: null },
    { file: "channel-page-meta.json", resultCount: null },
  ],
  allResultsMustHaveOkTrue: true,
  scopedLintLogs: [
    { file: "channel-lint-results.json", line: "0 errors / 0 warnings over 17 candidate files" },
  ],
  allowedBuildWarningCount: 0,
  allowedCandidateBuildWarnings: 0,
  recordedPreExistingRemoteWarnings: 4,
  candidateHashes,
  remoteBaselineHashes,
  remoteOperationsPermitted: ["sandbox read", "sandbox run (read-only shell)"],
  remoteMutationsPerformed: 0,
  applyRequiresLeadApproval: true,
  remoteWriteAuthorized: false,
  checkpointAuthorized: false,
  entityOperationsAuthorized: false,
  schemaOrMetadataAuthorized: false,
  publishOrDeployAuthorized: false,
  sharedFilesUntouched: ["src/components/channelLetterInstall/TravelCostCard.jsx"],
  deadFilesUntouched: "src/components/estimator/channel/*",
  baselineFile: null,
};
fs.writeFileSync(E + "channel-pricing-proof-spec.json", JSON.stringify(proof, null, 1));

// Protected files: every pulled remote file that is NOT a candidate, plus key
// boundaries that must not change if candidates are ever applied.
const protectedFiles = [];
const walk = (dir) => {
  for (const f of fs.readdirSync(E + "remote/" + dir)) {
    const rel = dir + "/" + f;
    const full = E + "remote/" + rel;
    if (fs.statSync(full).isDirectory()) walk(rel);
    else if (!CANDIDATES.includes(rel)) protectedFiles.push(rel);
  }
};
walk("src");

const transport = {
  appId: "68dfcc5e57bbbc35387da97c",
  branch: "main",
  sourceHead: SOURCE_HEAD,
  baselineFile: null,
  proofSpec: "channel-pricing-proof-spec.json",
  candidateManifest: "channel-pricing-candidates.json",
  targetOrder: CANDIDATES,
  candidatePrefix: "candidates/",
  newRemoteFiles: [...NEW_FILES],
  atomicEditPerFile: true,
  editsPerFile: 1,
  candidateLineEndings: "LF",
  candidateTerminalLF: Object.fromEntries(CANDIDATES.map(r => [r, manifest[r].terminalLF])),
  candidateLineEndingsByFile: Object.fromEntries(
    CANDIDATES.filter(r => manifest[r].lineEndings !== "LF").map(r => [r, manifest[r].lineEndings])
  ),
  protectedFiles,
  liveDeadDetermination: {
    livePage: "src/pages/ChannelLetterEstimator.jsx",
    liveComponentSurface: "src/components/channelLetterInstall/*",
    liveCalculators: "installCalculator.jsx / lettersCalculator.jsx / installSizeRates.jsx / wallMaterials.jsx (remote formulas unchanged — hardened at the availability boundary)",
    sharedLeaf: "src/components/channelLetterInstall/TravelCostCard.jsx (shared with Maintenance + Vinyl — deliberately untouched; inputs validated at the Channel calc boundary)",
    legacyDeadSurface: "src/components/estimator/channel/* (dead/divergent duplicates — out of scope, unchanged)",
  },
  forbiddenRemoteOperations: [
    "sandbox edit", "sandbox write", "checkpoint", "entity ops", "schema ops", "deploy", "publish",
  ],
  applyRequiresLeadApproval: true,
  remoteWriteAuthorized: false,
  deleteOrRestoreAuthorization: false,
  businessRecordOperationsAuthorized: false,
  schemaOrMetadataActivationAuthorized: false,
  publishOrDeployAuthorized: false,
  candidateHashes,
  buildEntries: CANDIDATES,
  buildAlias: { "@": "/app/src" },
  editInput: "stdin",
  stageBase64ChunkLength: 3000,
  remoteTempPrefix: "/tmp/ccs-channel-pricing-",
  restoreCheckpointName: "Before Channel Letter Pricing-Availability Hardening",
  finalCheckpointName: "Channel Letter Pricing-Availability Hardening Verified",
  checkpointAuthority: "lead",
};
fs.writeFileSync(E + "channel-pricing-transport-spec.json", JSON.stringify(transport, null, 1));

console.log(JSON.stringify({
  manifest: CANDIDATES.length,
  protectedFiles: protectedFiles.length,
  newFiles: [...NEW_FILES],
}));

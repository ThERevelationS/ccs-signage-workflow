// Generates the metal hardening artifacts: baseline, candidates manifest,
// proof spec, transport spec — cloning the painting spec format with the
// Metal targets, this task's remote HEAD, and the measured verification
// result files produced by the harnesses.
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const A = path.dirname(fileURLToPath(import.meta.url));
const hash = (t) => createHash("sha256").update(t).digest("hex");
const read = (p) => fs.readFileSync(path.join(A, p), "utf8");
const remote = (p) => read("remote/" + p);
const HEAD = "5f25691b8966137d4c96cafee690a186a797ebb1"; // verified via `sandbox run "git rev-parse HEAD"`; remote/src/pages/MetalEstimator.jsx re-pulled at this HEAD and confirmed byte-identical to the frozen baseline copy

const TARGETS = [
  { remote: "src/components/estimator/metal/metalPricingAvailability.js", cand: "candidates/src/components/estimator/metal/metalPricingAvailability.js", isNew: true },
  { remote: "src/pages/MetalEstimator.jsx", cand: "candidates/src/pages/MetalEstimator.jsx", isNew: false },
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
fs.writeFileSync(path.join(A, "metal-pricing-baseline.json"), JSON.stringify(baseline, null, 1));

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
fs.writeFileSync(path.join(A, "metal-pricing-candidates.json"), JSON.stringify(candidates, null, 1));

// ---------- verification result JSONs (measured — already written) ----------
const model = JSON.parse(read("metal-model-verification.json"));
const red = JSON.parse(read("metal-red-verification.json"));
const page = JSON.parse(read("metal-page-verification.json"));
const browser = JSON.parse(read("metal-browser-results.json"));
const consumer = JSON.parse(read("metal-consumer-build.json"));
const lint = JSON.parse(read("metal-lint-results.json"));

// ---------- proof spec ----------
const candidateHashes = Object.fromEntries(TARGETS.map(t => [t.remote, candidates[t.remote].sha256]));
const remoteBaselineHashes = Object.fromEntries(
  TARGETS.filter(t => !t.isNew).map(t => [t.remote, candidates[t.remote].remoteSha256]));
const proofSpec = {
  appId: "68dfcc5e57bbbc35387da97c", branch: "main", sourceHead: HEAD,
  jsonProofs: [
    { file: "metal-model-verification.json", resultCount: model.passed },
    { file: "metal-red-verification.json", resultCount: red.passed },
    { file: "metal-page-verification.json", resultCount: page.scenarios },
    { file: "metal-browser-results.json", resultCount: browser.total },
    { file: "metal-consumer-build.json", resultCount: Object.keys(consumer.inputs).length },
    { file: "metal-lint-results.json", resultCount: Object.keys(lint).length },
    { file: "metal-page-import-edges.json", resultCount: "see file" },
    { file: "metal-page-meta.json", resultCount: "see file" },
    { file: "metal-zero-legitimacy-decisions.md", resultCount: "see file" },
    { file: "MetalEstimator.diff", resultCount: "see file" },
  ],
  allResultsMustHaveOkTrue: true,
  scopedLintLogs: [
    { file: "metal-lint-results.json", line: "0 errors / 0 warnings over 2 candidate files" },
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
  baselineFile: "metal-pricing-baseline.json",
};
fs.writeFileSync(path.join(A, "metal-pricing-proof-spec.json"), JSON.stringify(proofSpec, null, 1));

// ---------- transport spec ----------
const transport = {
  appId: "68dfcc5e57bbbc35387da97c", branch: "main", sourceHead: HEAD,
  baselineFile: "metal-pricing-baseline.json",
  proofSpec: "metal-pricing-proof-spec.json",
  candidateManifest: "metal-pricing-candidates.json",
  targetOrder: TARGETS.map(t => t.remote),
  candidatePrefix: "candidates/",
  newRemoteFiles: ["src/components/estimator/metal/metalPricingAvailability.js"],
  atomicEditPerFile: true, editsPerFile: 1,
  candidateLineEndings: "LF",
  candidateTerminalLF: Object.fromEntries(TARGETS.map(t => [t.remote, candidates[t.remote].terminalLF])),
  protectedFiles: [
    // own + sibling settings surfaces (unchanged — settingsSaveGuard CAS writes)
    "src/pages/MetalSettings.jsx",
    "src/pages/PaintingSettings.jsx",
    "src/pages/VinylSettings.jsx",
    "src/pages/LaserSettings.jsx",
    "src/pages/CNCSettings.jsx",
    "src/pages/FoundationSettings.jsx",
    "src/pages/MaintenanceSettings.jsx",
    "src/pages/EstimatorSettings.jsx",
    // sibling estimator pages (out of scope)
    "src/pages/Estimator.jsx",
    "src/pages/VinylEstimator.jsx",
    "src/pages/PaintingEstimator.jsx",
    "src/pages/ChannelLetterEstimator.jsx",
    "src/pages/LaserEstimator.jsx",
    "src/pages/CNCEstimator.jsx",
    "src/pages/BrickStoneEstimator.jsx",
    "src/pages/CustomItemsEstimator.jsx",
    "src/pages/FoundationEstimator.jsx",
    "src/pages/MaintenanceEstimator.jsx",
    // other module component dirs
    "src/components/channelLetterInstall/",
    "src/components/vinylEstimator/",
    "src/components/estimator/vinyl/",
    "src/components/estimator/paint/",
    "src/components/estimator/laser/",
    "src/components/estimator/cnc/",
    "src/components/estimator/brick/",
    "src/components/estimator/channel/",
    "src/components/estimator/customItems/",
    "src/components/estimator/maintenance/",
    "src/components/estimator/aio/",
    "src/components/estimator/home/",
    "src/components/estimator/parts/",
    "src/components/estimator/products/",
    "src/components/signMaintenance/",
    // metal dir: ONLY metalSellPricing.js is pre-existing — protected inside our own dir
    "src/components/estimator/metal/metalSellPricing.js",
    // shared deps imported by the hardened page (unchanged)
    "src/components/estimator/customerPricing.js",
    "src/components/markup/CustomerPricingTab.jsx",
    "src/components/markup/projectCategorizer.jsx",
    "src/components/markup/savedCustomerPricing.js",
    "src/components/estimator/builder/builderService.js",
    "src/components/estimator/builder/sourceProjectPersistence.js",
    "src/components/estimator/builder/itemIdentity.js",
    "src/components/estimator/idempotentEntityCreate.js",
    "src/components/staff/staffEntities.js",
    "src/components/estimator/moduleShared/moduleProjectActions.js",
    "src/components/estimator/moduleShared/ModuleActionBar.jsx",
    "src/components/estimator/moduleShared/ModuleTemplateDialog.jsx",
    "src/components/estimator/settings/moduleSettingDefaults.js",
    "src/components/estimator/settings/settingsSaveGuard.js",
    "src/components/estimator/settings/SettingsTransferBar.jsx",
    "src/components/estimator/loadAllEntityRows.js",
    "src/components/estimator/moduleRegistry.js",
    "src/components/estimator/aio/InlineProductEditor.jsx",
    "src/components/estimator/foundation/",
    "src/api/gatedEntities.js",
    "src/App.jsx",
  ],
  liveDeadDetermination: {
    liveCore: "inline calculation inside src/pages/MetalEstimator.jsx (updateItem derive + calculateTotals/getProjectCalculations — hardened in place)",
    livePage: "src/pages/MetalEstimator.jsx",
    liveSettingsSurface: "src/pages/MetalSettings.jsx (writes via saveSettingsRowsSafely → replaceEntityFieldsIfUnchanged CAS — unchanged)",
    absentCalcModule: "src/components/estimator/metal/metalCalc.js does not exist (re-confirmed via remote test -f at HEAD 5f25691b — no dead calc file)",
    absentModuleDir: "src/components/metalFabrication/ does not exist (re-confirmed via remote test -d at HEAD 5f25691b)",
    sellPricingWire: "src/components/estimator/metal/metalSellPricing.js — live engine wire, passthrough-safe; unchanged",
    settingsDefaults: "src/components/estimator/settings/moduleSettingDefaults.js (unchanged — absent rows fall back by design)",
    consumers: "src/App.jsx, src/components/estimator/moduleRegistry.js, src/components/estimator/aio/InlineProductEditor.jsx (unchanged)",
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
  remoteTempPrefix: "/tmp/ccs-metal-pricing-",
  restoreCheckpointName: "Before Metal Pricing Availability Hardening",
  finalCheckpointName: "Metal Pricing Availability Hardening Verified",
  checkpointAuthority: "lead",
};
fs.writeFileSync(path.join(A, "metal-pricing-transport-spec.json"), JSON.stringify(transport, null, 1));

console.log(JSON.stringify(candidates, null, 1));
console.log("ARTIFACTS WRITTEN");

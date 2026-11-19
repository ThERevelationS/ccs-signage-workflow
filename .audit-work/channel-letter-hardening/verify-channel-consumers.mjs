// Channel Letter hardening — consumer bundle check.
// Bundles the hardened channelLetterInstall candidate surface + the candidate
// ChannelLetterEstimator page against the frozen remote source tree, treating
// out-of-scope boundaries (@/api, entities, ui primitives, other estimator
// modules, untouched shared leaves) as external. Fails on any missing frozen
// import inside the in-scope tree, any warning originating in a candidate
// file, or any unexpected import edge — so candidates cannot quietly depend
// on held local work. Pre-existing remote warnings (duplicate JSX attrs in
// untouched files) are recorded, not failed.
import esbuild from "esbuild";
import path from "node:path";
import assert from "node:assert/strict";
import fs from "node:fs";
import { E, hash, frozenSources } from "./channel-frozen.mjs";

const sources = frozenSources(); // remote-pulled + candidate overlay
// Also freeze the remaining remote channelLetterInstall siblings so relative
// imports (TravelCostCard, AIScopeWriterModal, BoomLiftReachChart, materials
// constants/helpers, etc.) resolve to real remote source instead of externals.
const REMOTE_DIR = E + "remote/src/components/channelLetterInstall/";
for (const f of fs.readdirSync(REMOTE_DIR)) {
  const key = "/app/src/components/channelLetterInstall/" + f;
  if (!sources.has(key)) sources.set(key, fs.readFileSync(REMOTE_DIR + f, "utf8"));
}
const CANDIDATE_NAMES = new Set([
  "channelLetterPricingAvailability.js", "BackerFabPanel.jsx", "BackerSection.jsx",
  "DimensionalFabPanel.jsx", "EquipmentSelector.jsx", "InstallLineItem.jsx",
  "InstallSummaryCard.jsx", "ItemsList.jsx", "LadderSelector.jsx",
  "LetterPurchaseRow.jsx", "LettersPurchaseTab.jsx", "MaterialsList.jsx",
  "PersonnelSelector.jsx", "SummaryDetailsCard.jsx", "ValidationWarnings.jsx",
  "installExport.jsx", "ChannelLetterEstimator.jsx",
]);
const C = "/app/src/components/channelLetterInstall/";
const entry = "/app/consumer-entry.js";
sources.set(entry, `
  export { calcChannelProject, channelProjectIssues, channelNumber,
    channelNonNegativeNumber, channelPositiveNumber, channelDraftValue,
    hasChannelCostSnapshot, issuesForField, hasIssueFor }
    from "${C}channelLetterPricingAvailability.js";
  export { buildSummaryText, downloadCSV } from "${C}installExport.jsx";
  export { default as BackerFabPanel } from "${C}BackerFabPanel.jsx";
  export { default as BackerSection } from "${C}BackerSection.jsx";
  export { default as DimensionalFabPanel } from "${C}DimensionalFabPanel.jsx";
  export { default as EquipmentSelector } from "${C}EquipmentSelector.jsx";
  export { default as InstallLineItem } from "${C}InstallLineItem.jsx";
  export { default as InstallSummaryCard } from "${C}InstallSummaryCard.jsx";
  export { default as ItemsList } from "${C}ItemsList.jsx";
  export { default as LadderSelector } from "${C}LadderSelector.jsx";
  export { default as LetterPurchaseRow } from "${C}LetterPurchaseRow.jsx";
  export { default as LettersPurchaseTab } from "${C}LettersPurchaseTab.jsx";
  export { default as MaterialsList } from "${C}MaterialsList.jsx";
  export { default as PersonnelSelector } from "${C}PersonnelSelector.jsx";
  export { default as SummaryDetailsCard } from "${C}SummaryDetailsCard.jsx";
  export { default as ValidationWarnings } from "${C}ValidationWarnings.jsx";
  export { default as ChannelLetterEstimator } from "/app/src/pages/ChannelLetterEstimator.jsx";
`);

const loaded = {};
const plug = { name: "frozen", setup(b) {
  b.onResolve({ filter: /.*/ }, (a) => {
    let base;
    if (a.path.startsWith("/app/")) base = a.path;
    else if (a.path.startsWith("@/")) base = "/app/src/" + a.path.slice(2);
    else if (a.path.startsWith(".")) base = path.posix.resolve(path.posix.dirname(a.importer), a.path);
    else return { external: true }; // package import
    const resolved = [base, base + ".js", base + ".jsx"].find((p) => sources.has(p));
    if (!resolved) {
      // In-scope paths must resolve — a miss means the candidate depends on
      // held local work. Out-of-scope boundaries are external, including the
      // unpulled network/visual leaves the page harness stubs explicitly.
      const KNOWN_UNPULLED_LEAVES = new Set([
        "/app/src/components/channelLetterInstall/AddressAutocomplete",
        "/app/src/components/channelLetterInstall/AddressAutocomplete.jsx",
      ]);
      const inScope = base.startsWith("/app/src/components/channelLetterInstall/")
        || base.startsWith("/app/src/pages/ChannelLetterEstimator");
      if (KNOWN_UNPULLED_LEAVES.has(base) || !inScope) return { external: true };
      throw Error("Missing frozen source; held local work forbidden: " + a.path + " (imported by " + a.importer + ")");
    }
    return { path: resolved, namespace: "frozen" };
  });
  b.onLoad({ filter: /.*/, namespace: "frozen" }, (a) => {
    const contents = sources.get(a.path);
    loaded[a.path] = hash(contents);
    return { contents, loader: a.path.endsWith(".jsx") ? "jsx" : "js" };
  });
}};

const build = await esbuild.build({
  entryPoints: [entry], bundle: true, format: "esm", platform: "browser", write: false,
  plugins: [plug], loader: { ".js": "jsx", ".jsx": "jsx" }, jsx: "automatic",
  metafile: true, logLevel: "silent",
});
const candidateWarnings = [], remoteWarnings = [];
for (const w of build.warnings) {
  const f = w.location?.file || "";
  (CANDIDATE_NAMES.has(f.split("/").pop()) ? candidateWarnings : remoteWarnings)
    .push({ file: f, text: w.text });
}
assert.deepEqual(candidateWarnings, [], "candidate-file warnings: " + JSON.stringify(candidateWarnings));
const edges = [];
for (const [out, info] of Object.entries(build.metafile.outputs))
  for (const imp of info.imports || []) edges.push({ output: out, ...imp });
const externals = [...new Set(edges.filter(e => e.external).map(e => e.path))];
const ALLOWED_EXTERNAL = [
  /^react(-dom)?(\/.*)?$/, /^scheduler(\/.*)?$/, /^react-router-dom$/,
  /^lucide-react$/, /^@hello-pangea\/dnd$/, /^recharts(\/.*)?$/, /^date-fns(\/.*)?$/,
  /^@\/api\//, /^@\/entities\//, /^@\/lib\//, /^@\/utils$/,
  /^@\/components\/ui\//, /^@\/components\/auth\//,
  /^@\/components\/estimator\//, /^@\/components\/markup\//,
  /^@\/components\/customerSummary\//, /^@\/components\/signMaintenance\//,
  /^@\/components\/vinylEstimator\//, /^@\/components\/ClientSearchInput$/,
  /^@\/components\/UnsavedChangesContext$/,
  /^@\/components\/channelLetterInstall\/AddressAutocomplete$/,
  /base44\/shared\//, // raw relative ../../base44/shared/* specifiers stay raw
];
const bad = externals.filter(p => !ALLOWED_EXTERNAL.some(re => re.test(p)));
assert.deepEqual(bad, [], "unexpected external edges: " + JSON.stringify(bad));
const candLoaded = Object.fromEntries(
  [...CANDIDATE_NAMES].map(n => [n, loaded[n === "ChannelLetterEstimator.jsx" ? "/app/src/pages/" + n : C + n]])
);
fs.writeFileSync(E + "channel-consumer-build.json", JSON.stringify({
  inputs: Object.keys(build.metafile.inputs), loaded, candidateHashes: candLoaded,
  externals, remoteWarnings,
}, null, 2));
console.log(JSON.stringify({
  inputs: Object.keys(build.metafile.inputs).length,
  candidates: CANDIDATE_NAMES.size,
  externals: externals.length,
  remoteWarnings: remoteWarnings.length,
}));

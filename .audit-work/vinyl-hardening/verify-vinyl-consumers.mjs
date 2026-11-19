// Vinyl hardening — consumer bundle check.
// Bundles the hardened vinyl module/component surface with frozen remote
// sources + candidates, treating out-of-scope boundaries (entities, staff,
// ui primitives, shared channel-letter/markup modules) as external. Fails on
// any missing frozen import, build warning, or unexpected import edge so the
// candidate set can't quietly depend on held local work.
import esbuild from "esbuild";
import path from "node:path";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createHash } from "node:crypto";

const E = ".audit-work/vinyl-hardening/";
const hash = (t) => createHash("sha256").update(t).digest("hex");
const remoteSrc = (p) => fs.readFileSync(E + "remote-src/" + p, "utf8");
const candidate = (n) => fs.readFileSync(E + n, "utf8");

const V = "/app/src/components/vinylEstimator/";
const sources = new Map();
const REMOTE_FILES = [
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
  "src/components/vinylInventory/vinylConstants.jsx",
];
for (const f of REMOTE_FILES) sources.set("/app/" + f, remoteSrc(f));
const CANDIDATES = {
  "vinylPricingAvailability.js": "vinyl-pricing-candidate-vinylPricingAvailability.js",
  "vinylProjectHelpers.jsx": "vinyl-pricing-candidate-vinylProjectHelpers.jsx",
  "vinylCostHelpers.jsx": "vinyl-pricing-candidate-vinylCostHelpers.jsx",
  "VinylWorkflowCard.jsx": "vinyl-pricing-candidate-VinylWorkflowCard.jsx",
  "VinylWorkflowCardHeader.jsx": "vinyl-pricing-candidate-VinylWorkflowCardHeader.jsx",
  "VinylWorkflowMetricsBadge.jsx": "vinyl-pricing-candidate-VinylWorkflowMetricsBadge.jsx",
  "VinylPartsTable.jsx": "vinyl-pricing-candidate-VinylPartsTable.jsx",
  "VinylCuttingExtrasCard.jsx": "vinyl-pricing-candidate-VinylCuttingExtrasCard.jsx",
  "VinylWorkflowPersonnel.jsx": "vinyl-pricing-candidate-VinylWorkflowPersonnel.jsx",
  "VinylMaterialPicker.jsx": "vinyl-pricing-candidate-VinylMaterialPicker.jsx",
  "VinylMachinePicker.jsx": "vinyl-pricing-candidate-VinylMachinePicker.jsx",
  "VinylRollWidthRecommender.jsx": "vinyl-pricing-candidate-VinylRollWidthRecommender.jsx",
  "VinylProjectSummaryCard.jsx": "vinyl-pricing-candidate-VinylProjectSummaryCard.jsx",
};
for (const [name, file] of Object.entries(CANDIDATES))
  sources.set(V + name, candidate(file));

const entry = "/app/consumer-entry.js";
sources.set(entry, `
  export { calcVinylWorkflow, vinylWorkflowIssues, vinylProjectInputIssues,
    vinylMaterialIssues, vinylNumber, vinylNonNegativeNumber, vinylPositiveNumber,
    hasVinylCostSnapshot, vinylDraftValue, issuesForField, hasIssueFor }
    from "${V}vinylPricingAvailability.js";
  export { rollupVinylProject, sumWorkflowField, blankWorkflow, blankVinylProject, migrateProject }
    from "${V}vinylProjectHelpers.jsx";
  export { computeWorkflowMetrics, computeStockUsage, computePerPartCosts,
    computeAlternativeVinylCost, computeLifetimeWarning } from "${V}vinylCostHelpers.jsx";
  export { calculateVinylProject } from "${V}vinylNestingCalculator.jsx";
  export { default as VinylWorkflowCard } from "${V}VinylWorkflowCard.jsx";
  export { default as VinylWorkflowCardHeader } from "${V}VinylWorkflowCardHeader.jsx";
  export { default as VinylWorkflowMetricsBadge } from "${V}VinylWorkflowMetricsBadge.jsx";
  export { default as VinylPartsTable } from "${V}VinylPartsTable.jsx";
  export { default as VinylCuttingExtrasCard } from "${V}VinylCuttingExtrasCard.jsx";
  export { default as VinylWorkflowPersonnel } from "${V}VinylWorkflowPersonnel.jsx";
  export { default as VinylMaterialPicker } from "${V}VinylMaterialPicker.jsx";
  export { default as VinylMachinePicker } from "${V}VinylMachinePicker.jsx";
  export { default as VinylRollWidthRecommender } from "${V}VinylRollWidthRecommender.jsx";
  export { default as VinylProjectSummaryCard } from "${V}VinylProjectSummaryCard.jsx";
  export { default as VinylRollVisualizer } from "${V}VinylRollVisualizer.jsx";
  export { default as VinylStockWarning } from "${V}VinylStockWarning.jsx";
  export { default as VinylAlternativeCompare } from "${V}VinylAlternativeCompare.jsx";
`);

const loaded = {};
const plug = { name: "frozen", setup(b) {
  b.onResolve({ filter: /.*/ }, (a) => {
    let base;
    if (a.path.startsWith("/app/")) base = a.path;
    else if (a.path.startsWith(".")) base = path.posix.resolve(path.posix.dirname(a.importer), a.path);
    else return { external: true };
    const resolved = [base, base + ".js", base + ".jsx"].find((p) => sources.has(p));
    if (!resolved) {
      // Out-of-scope boundary — mark external rather than fail, but record it.
      if (a.path.startsWith("@/") || a.path.startsWith("/app/src/components/ui/")
        || a.path.startsWith("/app/src/api/") || a.path.startsWith("/app/src/entities/")
        || a.path.startsWith("/app/src/components/staff/")
        || a.path.startsWith("/app/src/components/estimator/")
        || a.path.startsWith("/app/src/components/markup/")
        || a.path.startsWith("/app/src/components/channelLetterInstall/")) {
        return { external: true };
      }
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
  entryPoints: [entry], bundle: true, format: "esm", platform: "node", write: false,
  plugins: [plug], loader: { ".js": "jsx", ".jsx": "jsx" }, jsx: "automatic",
  metafile: true, logLevel: "silent",
});
assert.deepEqual(build.warnings, [], "consumer bundle warnings");
const edges = [];
for (const [out, info] of Object.entries(build.metafile.outputs))
  for (const imp of info.imports || []) edges.push({ output: out, ...imp });
const externals = [...new Set(edges.filter(e => e.external).map(e => e.path))];
const ALLOWED_EXTERNAL = [
  /^react(-dom)?(\/.*)?$/, /^scheduler(\/.*)?$/, /^react-router-dom$/,
  /^lucide-react$/, /^@\/api\//, /^@\/components\/ui\//, /^@\/components\/staff\//,
  /^@\/entities\//, /^@\/components\/estimator\//, /^@\/components\/markup\//,
  /^@\/components\/channelLetterInstall\//, /^@\/components\/vinylInventory\//,
];
const bad = externals.filter(p => !ALLOWED_EXTERNAL.some(re => re.test(p)));
assert.deepEqual(bad, [], "unexpected external edges: " + JSON.stringify(bad));
const candLoaded = Object.fromEntries(Object.keys(CANDIDATES).map(n => [n, loaded[V + n]]));
fs.writeFileSync(E + "vinyl-consumer-build.json", JSON.stringify({
  inputs: Object.keys(build.metafile.inputs),
  loaded, candidateHashes: candLoaded, externals,
}, null, 2));
console.log(JSON.stringify({ inputs: Object.keys(build.metafile.inputs).length, candidates: Object.keys(candLoaded).length, externals: externals.length }));

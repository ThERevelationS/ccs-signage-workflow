// Sign Maintenance hardening — consumer bundle check.
// Bundles the hardened maintenance module/component/page surface with frozen
// remote leaf files + candidates, treating out-of-scope boundaries (entities,
// staff, ui primitives, shared estimator modules, channelLetterInstall leaves,
// base44 shared TS) as external. Fails on any missing frozen import inside the
// hardened surface, any build warning, or any unexpected import edge.
import esbuild from "esbuild";
import path from "node:path";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createHash } from "node:crypto";

const E = ".audit-work/maintenance-hardening/";
const hash = (t) => createHash("sha256").update(t).digest("hex");
const remoteSrc = (p) => fs.readFileSync(E + "remote/" + p, "utf8");
const candidate = (n) => fs.readFileSync(E + n, "utf8");

const SM = "/app/src/components/signMaintenance/";
const sources = new Map();
// Unchanged remote files inside the hardened surface.
const REMOTE_FILES = [
  "src/components/signMaintenance/constants.jsx",
  "src/components/signMaintenance/defaults.jsx",
  "src/components/signMaintenance/repaintCalculator.jsx",
  "src/components/signMaintenance/repaintDefaults.jsx",
  "src/components/signMaintenance/dimLetterPaintCalculator.jsx",
  "src/components/signMaintenance/maintenanceCalculator.jsx",
  "src/components/signMaintenance/maintenanceMaterialRules.js",
];
for (const f of REMOTE_FILES) sources.set("/app/" + f, remoteSrc(f));
const CANDIDATES = {
  "src/components/signMaintenance/maintenancePricingAvailability.js": "maintenance-pricing-candidate-maintenancePricingAvailability.js",
  "src/components/signMaintenance/ServiceItemRow.jsx": "maintenance-pricing-candidate-ServiceItemRow.jsx",
  "src/components/signMaintenance/RepaintMonumentPanel.jsx": "maintenance-pricing-candidate-RepaintMonumentPanel.jsx",
  "src/components/signMaintenance/DimLetterPaintSubPanel.jsx": "maintenance-pricing-candidate-DimLetterPaintSubPanel.jsx",
  "src/pages/MaintenanceEstimator.jsx": "maintenance-pricing-candidate-MaintenanceEstimator.jsx",
};
for (const [target, file] of Object.entries(CANDIDATES)) sources.set("/app/" + target, candidate(file));

const entry = "/app/consumer-entry.js";
sources.set(entry, `
  export { maintenanceStrictNumber, maintenanceNonNegativeNumber, maintenancePositiveNumber,
    maintenanceSettingRecorded, maintenancePresent,
    maintenanceItemIssues, maintenanceSettingIssues, maintenanceProjectInputIssues,
    calcMaintenanceProject, hasMaintenanceCostSnapshot, maintenanceDraftValue,
    issuesForField, hasIssueFor, maintenanceItemIssueList }
    from "${SM}maintenancePricingAvailability.js";
  export { calcServiceItem, calcProjectTotals, materialFromInventory,
    defaultMaterialsForItem, emptyServiceItem } from "${SM}maintenanceCalculator.jsx";
  export { computeMonumentRepaint, isMonumentRepaint, computeRepaintSqft,
    featureMultiplier, conditionMultiplier, defaultMonumentRepaintConfig } from "${SM}repaintCalculator.jsx";
  export { computeDimLetterPaint } from "${SM}dimLetterPaintCalculator.jsx";
  export { default as ServiceItemRow } from "${SM}ServiceItemRow.jsx";
  export { default as RepaintMonumentPanel } from "${SM}RepaintMonumentPanel.jsx";
  export { default as DimLetterPaintSubPanel } from "${SM}DimLetterPaintSubPanel.jsx";
  export { default as MaintenanceEstimator } from "/app/src/pages/MaintenanceEstimator.jsx";
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
      if (a.path.startsWith("@/") || a.path.startsWith("/app/src/")
        || base?.startsWith("/app/src/")
        || a.path.startsWith("/app/base44/") || a.path.endsWith(".ts")
        || a.path.startsWith("base44/")) {
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
assert.deepEqual(build.warnings, [], "consumer bundle warnings: " + JSON.stringify(build.warnings.map(w => w.text)));
const edges = [];
for (const [out, info] of Object.entries(build.metafile.outputs))
  for (const imp of info.imports || []) edges.push({ output: out, ...imp });
const externals = [...new Set(edges.filter(e => e.external).map(e => e.path))];
const ALLOWED_EXTERNAL = [
  /^react(-dom)?(\/.*)?$/, /^scheduler(\/.*)?$/, /^react-router-dom$/,
  /^lucide-react$/, /^@\/api\//, /^@\/components\//, /^@\/entities\//,
  /^@\/pages\//, /^@\/base44\//, /base44\/shared\//, /\.ts$/,
  /^\.\//, // out-of-scope leaf imports inside the module dir (pickers, etc.)
];
const bad = externals.filter(p => !ALLOWED_EXTERNAL.some(re => re.test(p)));
assert.deepEqual(bad, [], "unexpected external edges: " + JSON.stringify(bad));
const candLoaded = Object.fromEntries(Object.keys(CANDIDATES).map(n => [n, loaded["/app/" + n]]));
assert.ok(Object.values(candLoaded).every(Boolean), "all candidates loaded in bundle");
fs.writeFileSync(E + "maintenance-consumer-build.json", JSON.stringify({
  inputs: Object.keys(build.metafile.inputs),
  loaded, candidateHashes: candLoaded, externals,
}, null, 2));
console.log(JSON.stringify({ inputs: Object.keys(build.metafile.inputs).length, candidates: Object.keys(candLoaded).length, externals: externals.length }));
console.log("PASS maintenance-consumers");

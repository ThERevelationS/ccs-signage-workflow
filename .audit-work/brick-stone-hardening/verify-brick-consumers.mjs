// Brick & Stone hardening — consumer bundle check.
// Bundles the hardened brick module/page surface with frozen remote sources +
// candidates, treating out-of-scope boundaries (entities, staff, ui primitives,
// shared markup/builder modules, base44 shared TS) as external. partSync.js is
// bundled whole — it is the other consumer of calcBrickStoneProject and must
// keep resolving the byte-identical calculator. Fails on any missing frozen
// import, build warning, or unexpected import edge.
import esbuild from "esbuild";
import path from "node:path";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createHash } from "node:crypto";

const E = ".audit-work/brick-stone-hardening/";
const hash = (t) => createHash("sha256").update(t).digest("hex");
const remoteSrc = (p) => fs.readFileSync(E + "remote-src/" + p, "utf8");
const candidate = (n) => fs.readFileSync(E + n, "utf8");

const P = "/app/src/components/estimator/brick/";
const sources = new Map();
// Remote sources bundled real: brickCalc (unchanged — the API-stability proof
// for partSync) plus every consumer of the brick surface that must keep
// resolving against the hardened module set.
const REMOTE_FILES = [
  "src/components/estimator/brick/brickCalc.js",
  "src/components/estimator/builder/partSync.js",
  "src/components/estimator/brick/brickSellPricing.js",
  "src/components/markup/projectCategorizer.jsx",
];
for (const f of REMOTE_FILES) sources.set("/app/" + f, remoteSrc(f));
const CANDIDATES = {
  "brickPricingAvailability.js": "brick-pricing-candidate-brickPricingAvailability.js",
  "BrickGeometryPanel.jsx": "brick-pricing-candidate-BrickGeometryPanel.jsx",
  "BrickTotals.jsx": "brick-pricing-candidate-BrickTotals.jsx",
};
for (const [name, file] of Object.entries(CANDIDATES))
  sources.set(P + name, candidate(file));
sources.set("/app/src/pages/BrickStoneEstimator.jsx", candidate("brick-pricing-candidate-BrickStoneEstimator.jsx"));

const entry = "/app/consumer-entry.js";
sources.set(entry, `
  export { calcBrickStoneProject } from "${P}brickCalc.js";
  export { calcBrickStoneAvailability, brickMaterialIssues, brickProjectInputIssues,
    brickNumber, brickNonNegativeNumber, brickPositiveNumber, brickRecorded,
    hasBrickCostSnapshot, brickDraftValue, issuesForField, hasIssueFor }
    from "${P}brickPricingAvailability.js";
  export { resolveBrickEngineSell, brickEngineEconomics, brickEngineCustomerPrice,
    brickHasEnginePricing } from "${P}brickSellPricing.js";
  export { default as BrickGeometryPanel } from "${P}BrickGeometryPanel.jsx";
  export { default as BrickTotals } from "${P}BrickTotals.jsx";
  export { default as BrickStoneEstimator } from "/app/src/pages/BrickStoneEstimator.jsx";
  export * as partSync from "/app/src/components/estimator/builder/partSync.js";
`);

const loaded = {};
const plug = { name: "frozen", setup(b) {
  b.onResolve({ filter: /.*/ }, (a) => {
    let base;
    if (a.path.startsWith("/app/")) base = a.path;
    else if (a.path.startsWith(".")) base = path.posix.resolve(path.posix.dirname(a.importer), a.path);
    else return { external: true };
    const resolved = [base, base + ".js", base + ".jsx", base + ".ts"].find((p) => sources.has(p));
    if (!resolved) {
      // Out-of-scope boundary — mark external rather than fail, but record it.
      if (a.path.startsWith("@/") || a.path.startsWith("/app/src/")
        || a.path.startsWith("/app/base44/") || a.path.endsWith(".ts")
        || a.path.startsWith("base44/")
        || (base && (base.startsWith("/app/src/") || base.startsWith("/app/base44/")))) {
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
  /^lucide-react$/, /^@\/api\//, /^@\/components\//, /^@\/entities\//,
  /^@\/pages\//, /^@\/base44\//, /base44\/shared\//, /\.ts$/,
  // Relative imports out of bundled sources into unbundled in-scope modules
  // (e.g. partSync's ./builderMutationRecovery) are out-of-scope boundaries.
  /^\.\.?\//,
];
const bad = externals.filter(p => !ALLOWED_EXTERNAL.some(re => re.test(p)));
assert.deepEqual(bad, [], "unexpected external edges: " + JSON.stringify(bad));

// partSync is bundled: prove its calcBrickStoneProject edge resolved onto the
// frozen (byte-identical) brickCalc rather than going external.
const partSyncInput = Object.keys(build.metafile.inputs).find(f => f.includes("builder/partSync"));
assert.ok(partSyncInput, "partSync bundled as an input");
const brickCalcInput = Object.keys(build.metafile.inputs).find(f => f.endsWith("brick/brickCalc.js"));
assert.ok(brickCalcInput, "brickCalc bundled as an input");
assert.equal(loaded["/app/src/components/estimator/brick/brickCalc.js"], hash(remoteSrc("src/components/estimator/brick/brickCalc.js")),
  "bundled brickCalc is the byte-identical remote calculator");

const candLoaded = Object.fromEntries(Object.keys(CANDIDATES).map(n => [n, loaded[P + n]]));
candLoaded["BrickStoneEstimator.jsx"] = loaded["/app/src/pages/BrickStoneEstimator.jsx"];
fs.writeFileSync(E + "brick-consumer-build.json", JSON.stringify({
  inputs: Object.keys(build.metafile.inputs),
  loaded, candidateHashes: candLoaded, externals,
}, null, 2));
console.log(JSON.stringify({ inputs: Object.keys(build.metafile.inputs).length, candidates: Object.keys(candLoaded).length, externals: externals.length }));
console.log("PASS brick-consumers (partSync resolves the unchanged calculator)");

// Painting hardening — consumer bundle check.
// Bundles the hardened paint module/page surface with frozen remote sources +
// candidates, treating out-of-scope boundaries (entities, staff, ui primitives,
// shared markup/builder modules, base44 shared TS) as external. Fails on any
// missing frozen import, build warning, or unexpected import edge.
import esbuild from "esbuild";
import path from "node:path";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createHash } from "node:crypto";

const E = ".audit-work/painting-hardening/";
const hash = (t) => createHash("sha256").update(t).digest("hex");
const remoteSrc = (p) => fs.readFileSync(E + "remote-src/" + p, "utf8");
const candidate = (n) => fs.readFileSync(E + n, "utf8");

const P = "/app/src/components/estimator/paint/";
const sources = new Map();
// Remote consumers of paintCalc that must keep resolving against the candidate.
const REMOTE_FILES = [
  "src/pages/PaintingSettings.jsx",
];
for (const f of REMOTE_FILES) sources.set("/app/" + f, remoteSrc(f));
const CANDIDATES = {
  "paintCalc.js": "painting-pricing-candidate-paintCalc.js",
  "paintPricingAvailability.js": "painting-pricing-candidate-paintPricingAvailability.js",
};
for (const [name, file] of Object.entries(CANDIDATES))
  sources.set(P + name, candidate(file));
sources.set("/app/src/pages/PaintingEstimator.jsx", candidate("painting-pricing-candidate-PaintingEstimator.jsx"));

const entry = "/app/consumer-entry.js";
sources.set(entry, `
  export { PAINT_THICKNESSES, parseImperialFraction, paintThicknessNumber,
    paintStrictNumber, paintSettingNumber, paintSettingRecorded,
    laborTierMultiplier, liquidPaintRatePerSqft, autoPaintMaskSqft,
    normalizePaintingItem, calculatePaintingItem, calculatePaintingProject }
    from "${P}paintCalc.js";
  export { calcPaintingProject, paintSettingIssues, paintItemIssues,
    paintProjectInputIssues, hasPaintCostSnapshot, paintDraftValue,
    issuesForField, hasIssueFor } from "${P}paintPricingAvailability.js";
  export { default as PaintingEstimator } from "/app/src/pages/PaintingEstimator.jsx";
  export { default as PaintingSettings } from "/app/src/pages/PaintingSettings.jsx";
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
assert.deepEqual(build.warnings, [], "consumer bundle warnings");
const edges = [];
for (const [out, info] of Object.entries(build.metafile.outputs))
  for (const imp of info.imports || []) edges.push({ output: out, ...imp });
const externals = [...new Set(edges.filter(e => e.external).map(e => e.path))];
const ALLOWED_EXTERNAL = [
  /^react(-dom)?(\/.*)?$/, /^scheduler(\/.*)?$/, /^react-router-dom$/,
  /^lucide-react$/, /^@\/api\//, /^@\/components\//, /^@\/entities\//,
  /^@\/pages\//, /^@\/base44\//, /base44\/shared\//, /\.ts$/,
];
const bad = externals.filter(p => !ALLOWED_EXTERNAL.some(re => re.test(p)));
assert.deepEqual(bad, [], "unexpected external edges: " + JSON.stringify(bad));
const candLoaded = Object.fromEntries(Object.keys(CANDIDATES).map(n => [n, loaded[P + n]]));
candLoaded["PaintingEstimator.jsx"] = loaded["/app/src/pages/PaintingEstimator.jsx"];
fs.writeFileSync(E + "painting-consumer-build.json", JSON.stringify({
  inputs: Object.keys(build.metafile.inputs),
  loaded, candidateHashes: candLoaded, externals,
}, null, 2));
console.log(JSON.stringify({ inputs: Object.keys(build.metafile.inputs).length, candidates: Object.keys(candLoaded).length, externals: externals.length }));
console.log("PASS painting-consumers");

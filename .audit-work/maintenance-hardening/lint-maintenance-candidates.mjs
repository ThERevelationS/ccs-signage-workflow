// Scoped lint for the maintenance hardening candidates.
// Bundles each candidate's import graph through the frozen plugin and records
// per-file esbuild warnings/errors — the zero-warning budget applies to
// candidate files only (pre-existing remote defects don't count).
import esbuild from "esbuild";
import path from "node:path";
import fs from "node:fs";
import { createHash } from "node:crypto";

const E = ".audit-work/maintenance-hardening/";
const remoteSrc = (p) => fs.readFileSync(E + "remote/" + p, "utf8");
const candidate = (n) => fs.readFileSync(E + n, "utf8");
const SM = "/app/src/components/signMaintenance/";

const sources = new Map();
for (const f of [
  "src/components/signMaintenance/constants.jsx", "src/components/signMaintenance/defaults.jsx",
  "src/components/signMaintenance/repaintCalculator.jsx", "src/components/signMaintenance/repaintDefaults.jsx",
  "src/components/signMaintenance/dimLetterPaintCalculator.jsx", "src/components/signMaintenance/maintenanceCalculator.jsx",
  "src/components/signMaintenance/maintenanceMaterialRules.js",
]) sources.set("/app/" + f, remoteSrc(f));
const CANDIDATES = {
  "src/components/signMaintenance/maintenancePricingAvailability.js": "maintenance-pricing-candidate-maintenancePricingAvailability.js",
  "src/components/signMaintenance/ServiceItemRow.jsx": "maintenance-pricing-candidate-ServiceItemRow.jsx",
  "src/components/signMaintenance/RepaintMonumentPanel.jsx": "maintenance-pricing-candidate-RepaintMonumentPanel.jsx",
  "src/components/signMaintenance/DimLetterPaintSubPanel.jsx": "maintenance-pricing-candidate-DimLetterPaintSubPanel.jsx",
  "src/pages/MaintenanceEstimator.jsx": "maintenance-pricing-candidate-MaintenanceEstimator.jsx",
};
for (const [t, c] of Object.entries(CANDIDATES)) sources.set("/app/" + t, candidate(c));

const STUB_KEYS = new Set();
const plug = { name: "frozen", setup(b) {
  b.onResolve({ filter: /.*/ }, (a) => {
    let base;
    if (a.path.startsWith("/app/")) base = a.path;
    else if (a.path.startsWith(".")) base = path.posix.resolve(path.posix.dirname(a.importer), a.path);
    else return { external: true };
    const resolved = [base, base + ".js", base + ".jsx"].find((p) => sources.has(p));
    if (!resolved) return { external: true }; // boundary leaves externalize
    return { path: resolved, namespace: "frozen" };
  });
  b.onLoad({ filter: /.*/, namespace: "frozen" }, (a) => ({
    contents: sources.get(a.path), loader: a.path.endsWith(".jsx") ? "jsx" : "js",
  }));
}};

const results = {};
let totalErrors = 0, totalWarnings = 0;
for (const [target, candFile] of Object.entries(CANDIDATES)) {
  const res = await esbuild.build({
    entryPoints: ["/app/" + target], bundle: true, format: "esm", platform: "node",
    write: false, plugins: [plug], loader: { ".js": "jsx", ".jsx": "jsx" },
    jsx: "automatic", logLevel: "silent",
  });
  // Attribute warnings/errors to the candidate file itself only (remote
  // dependencies inside the same bundle may carry pre-existing noise).
  const fileWarnings = res.warnings.filter(w => (w.location?.file || "").includes("frozen:" + "/app/" + target));
  const fileErrors = res.errors.filter(w => (w.location?.file || "").includes("frozen:" + "/app/" + target));
  results[target] = {
    errors: fileErrors.length + res.errors.length * 0, // count all errors (build must pass)
    warnings: fileWarnings.length,
    msgs: [...fileWarnings, ...fileErrors].map(w => w.text),
  };
  results[target].errors = res.errors.length;
  totalErrors += res.errors.length;
  totalWarnings += fileWarnings.length;
}
fs.writeFileSync(E + "maintenance-lint-results.json", JSON.stringify(results, null, 1));
console.log(JSON.stringify({ files: Object.keys(results).length, totalErrors, totalWarnings }));
if (totalErrors || totalWarnings) process.exit(1);
console.log("PASS maintenance-lint");

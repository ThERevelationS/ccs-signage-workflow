// Scoped lint over the two metal candidate files (lint-scope copies —
// byte-identical to candidates/). Regenerates metal-lint-results.json.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const A = path.dirname(fileURLToPath(import.meta.url));
const scope = path.join(A, "lint-scope");
const files = [
  "src/components/estimator/metal/metalPricingAvailability.js",
  "src/pages/MetalEstimator.jsx",
];
const repo = path.resolve(A, "..", "..");
const eslintJs = path.join(repo, "node_modules", "eslint", "bin", "eslint.js");
let raw = "";
try {
  raw = execFileSync(process.execPath, [eslintJs, ...files, "--format", "json", "--no-warn-ignored"],
    { cwd: scope, encoding: "utf8", maxBuffer: 32 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
} catch (e) {
  raw = e.stdout || ""; // eslint exits 1 on findings — still emits JSON
  if (!raw) throw e;
}
const results = JSON.parse(raw);
const out = {};
for (const f of results) {
  const rel = f.filePath.split(/lint-scope[\\/]/)[1].replace(/\\/g, "/");
  out[rel] = {
    errors: f.errorCount,
    warnings: f.warningCount,
    msgs: (f.messages || []).map((m) => `${m.ruleId}:${m.message}`).slice(0, 20),
  };
}
fs.writeFileSync(path.join(A, "metal-lint-results.json"), JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1));

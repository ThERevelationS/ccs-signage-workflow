// Masonry dimensions — browser proof (5 modes x 2 viewports; single candidate: dimensions wallCalculator).
// triplets from that specification, origin-exact route guard,
// in-page fetch/XHR traps, full __M before/after deepEqual.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import * as esbuild from "esbuild";

const DIR = ".audit-work/foundation-reinforcement18/";
const SPEC = JSON.parse(fs.readFileSync(DIR + "masonry-outline-flow-proof-spec.json", "utf8"));
const seed = JSON.parse(fs.readFileSync(DIR + SPEC.fixtureArtifact, "utf8")).fixture;
const hash = (t) => createHash("sha256").update(t).digest("hex");
const read = (n) => JSON.parse(fs.readFileSync(DIR + n, "utf8"));

// ---------- frozen source map ----------
const sources = new Map();
for (const artifact of ["wall-cap-physical-source.json", "wall-cap-geometry-remote-validation.json", "masonry-material-pole-source.json", "masonry-rates-panel-source.json"])
  for (const f of read(artifact).files) sources.set("/app/" + f.path, f.content);
const scopeArt = read(SPEC.sourceArtifact);
assert.equal(scopeArt.head, SPEC.sourceHead, "source artifact head");
for (const f of scopeArt.files)
  sources.set("/app/" + f.path, f.text ?? f.normalized);

sources.set("/app/src/components/estimator/foundation/wallCalculator.js", fs.readFileSync(DIR + "masonry-outline-candidate-wallCalculator.js", "utf8"));
sources.set("/app/src/components/estimator/foundation/FoundationWallsPanel.jsx", fs.readFileSync(DIR + "masonry-outline-candidate-FoundationWallsPanel.jsx", "utf8"));
sources.set("/app/src/components/estimator/foundation/WallShapeEditor.jsx", fs.readFileSync(DIR + "masonry-outline-candidate-WallShapeEditor.jsx", "utf8"));
assert.equal(hash(sources.get("/app/src/components/estimator/foundation/wallCalculator.js")), SPEC.candidateHash, "calc candidate");
assert.equal(hash(sources.get("/app/src/components/estimator/foundation/FoundationWallsPanel.jsx")), SPEC.appliedPanelHash, "applied Panel");
assert.equal(hash(sources.get("/app/src/components/estimator/foundation/FoundationBOM.jsx")), "688323df8427d019f1b9da8371b4f6a30f65d24963fb913589ce84ae93fc5432", "applied BOM");
assert.equal(hash(sources.get("/app/src/components/estimator/foundation/foundationCalc.js")), "74d8b5a0ff5dd7d677c9e060879298f673530bfb7b15e83c7a16d45dc8fd9747", "applied calc");
assert.equal(hash(sources.get("/app/src/components/estimator/foundation/foundationCatalogIntegrity.js")), "702f1405b1cae1256da4eda2e7ed4d50085a5be1b4cd3324cf232a84938eca4e", "applied catalog");
for (const rel of ["components/ui/button.jsx", "components/ui/input.jsx", "lib/utils.js"])
  sources.set("/app/src/" + rel, fs.readFileSync("src/" + rel, "utf8"));
assert.equal(hash(sources.get("/app/src/components/estimator/foundation/WallShapeEditor.jsx")), SPEC.candidateEditorHash, "outline editor candidate");
const entry = "/app/masonry-browser-entry.jsx";
sources.set(entry, fs.readFileSync(DIR + "masonry-outline-browser-fixture.jsx", "utf8"));

const loaded = {};
const plug = { name: "frozen", setup(b) {
  b.onResolve({ filter: /.*/ }, (a) => {
    let base;
    if (a.path.startsWith("/app/")) base = a.path;
    else if (a.path.startsWith("@/")) base = "/app/src/" + a.path.slice(2);
    else if (a.path.startsWith(".")) {
      if (!a.importer.startsWith("/app")) return null;
      base = path.posix.resolve(path.posix.dirname(a.importer), a.path);
    } else return null;
    const resolved = [base, base + ".js", base + ".jsx"].find((p) => sources.has(p));
    if (!resolved) throw Error("Missing frozen source; held local work forbidden: " + a.path + " from " + a.importer);
    return { path: resolved, namespace: "frozen" };
  });
  b.onLoad({ filter: /.*/, namespace: "frozen" }, (a) => {
    const contents = sources.get(a.path);
    loaded[a.path] = hash(contents);
    return { contents, loader: a.path.endsWith(".jsx") ? "jsx" : "js", resolveDir: path.resolve(".") };
  });
}};
const build = await esbuild.build({
  entryPoints: [entry], bundle: true, platform: "browser", format: "esm",
  write: false, metafile: true, logLevel: "silent", jsx: "automatic",
  plugins: [plug],
});
assert.deepEqual(build.warnings, []);
assert.ok(loaded["/app/src/components/estimator/foundation/wallCalculator.js"]);
assert.ok(!Object.keys(build.metafile.inputs).some((f) => /base44Client/.test(f)), "no SDK in bundle");
const importEdges = [];
for (const [out, info] of Object.entries(build.metafile.outputs))
  for (const imp of info.imports || []) importEdges.push({ output: out, ...imp });
assert.deepEqual(importEdges, [], "fully bundled — no external import edges");
fs.writeFileSync(DIR + "masonry-outline-browser-meta.json", JSON.stringify({ inputs: Object.keys(build.metafile.inputs), loaded, importEdges }, null, 2));

// ---------- CSS ----------
const css = spawnSync(process.execPath, ["node_modules/tailwindcss/lib/cli.js",
  "-i", "src/index.css", "-o", DIR + "masonry-outline-browser.css",
  "--content", [DIR + "masonry-outline-browser-fixture.jsx",
    DIR + "masonry-height-candidate-FoundationWallsPanel.jsx",
    DIR + "masonry-material-candidate-FoundationBOM.jsx",
    "src/components/ui/button.jsx", "src/components/ui/input.jsx"].join(",")],
  { encoding: "buffer" });
fs.writeFileSync(DIR + "masonry-outline-browser-css-log.txt", Buffer.concat([css.stdout, css.stderr || Buffer.alloc(0)]));
assert.equal(css.status, 0, "tailwind build failed");

// ---------- fixture server ----------
const html = `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/app.css"></head>
<body><div id="root"></div>
<script>window.__SEED=${JSON.stringify(seed).replace(/</g, "\\u003c")};</script>
<script type="module" src="/bundle.js"></script></body></html>`;
const server = http.createServer((req, res) => {
  if (req.url === "/" || req.url.startsWith("/?")) { res.setHeader("content-type", "text/html"); res.end(html); }
  else if (req.url === "/app.css") { res.setHeader("content-type", "text/css"); res.end(fs.readFileSync(DIR + "masonry-outline-browser.css")); }
  else if (req.url === "/bundle.js") { res.setHeader("content-type", "text/javascript"); res.end(build.outputFiles[0].contents); }
  else res.end("");
});
await new Promise((r) => server.listen(62111, "127.0.0.1", r));
const port = 62111;
const baseOrigin = `http://127.0.0.1:${port}`;
fs.writeFileSync(DIR + "masonry-outline-browser-runtime.json",
  JSON.stringify({ port, pid: process.pid, startedAt: new Date().toISOString() }, null, 2));

setInterval(()=>{},60000);

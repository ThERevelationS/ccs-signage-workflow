import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import * as esbuild from "esbuild";

const dir = ".audit-work/foundation-reinforcement18/";
const foundation = "/app/src/components/estimator/foundation/";
const read = name => JSON.parse(fs.readFileSync(dir + name, "utf8"));
const hash = text => createHash("sha256").update(text).digest("hex");

export async function loadMasonryFixtureModule(entry = "foundationCalc.js", candidate = true) {
  const sources = new Map();
  for (const file of read("wall-cap-geometry-sandbox-final-scope.json").files)
    sources.set("/app/" + file.path, file.text ?? file.normalized);
  for (const artifact of [
    "wall-cap-physical-source.json",
    "wall-cap-geometry-remote-validation.json",
    "masonry-material-pole-source.json",
  ]) for (const file of read(artifact).files) sources.set("/app/" + file.path, file.content);
  if (candidate) for (const name of ["wallCalculator.js", "foundationCalc.js", "foundationCatalogIntegrity.js"])
    sources.set(foundation + name, fs.readFileSync(dir + "masonry-material-candidate-" + name, "utf8"));
  const loaded = {};
  const build = await esbuild.build({
    entryPoints: [foundation + entry], bundle: true, platform: "node", format: "cjs",
    write: false, metafile: true, logLevel: "silent",
    plugins: [{
      name: "exact-sandbox-source",
      setup(builder) {
        builder.onResolve({ filter: /.*/ }, args => {
          const base = args.path.startsWith("/app/")
            ? args.path
            : args.path.startsWith(".") ? path.posix.resolve(path.posix.dirname(args.importer), args.path) : null;
          const resolved = base && [base, base + ".js", base + ".jsx"].find(p => sources.has(p));
          if (!resolved) throw Error("Missing frozen source; do not use held local work: " + args.path);
          return { path: resolved, namespace: "sandbox-source" };
        });
        builder.onLoad({ filter: /.*/, namespace: "sandbox-source" }, args => {
          const contents = sources.get(args.path);
          loaded[args.path] = hash(contents);
          return { contents, loader: args.path.endsWith(".jsx") ? "jsx" : "js" };
        });
      },
    }],
  });
  assert.deepEqual(build.warnings, []);
  assert.equal(build.outputFiles.length, 1);
  for (const output of Object.values(build.metafile.outputs)) assert.deepEqual(output.imports, []);
  assert.ok(loaded[foundation + entry]);
  const module = { exports: {} };
  new Function("module", "exports", build.outputFiles[0].text)(module, module.exports);
  return { api: module.exports, loaded, warnings: build.warnings, metafile: build.metafile };
}

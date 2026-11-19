import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { build } from "esbuild";

const DIR = path.resolve(".audit-work/foundation-o029-cutschedule");
const TREE = `${DIR}/candidate-tree-src`;
const OUT = `${DIR}/verify`;
const stubsDir = `${OUT}/stubs`;
const require_ = createRequire(path.resolve("package.json"));
const uiModules = ["badge", "button", "card", "dialog", "input", "label", "select", "tabs"];
const alias = {
  "@": TREE,
  ...Object.fromEntries(uiModules.map(m => [`@/components/ui/${m}`, `${stubsDir}/ui.js`])),
  "react": `${TREE}/react-stub.js`,
  "react/jsx-runtime": `${stubsDir}/jsx-runtime.js`,
  "lucide-react": `${stubsDir}/lucide-react.js`,
  "three": `${stubsDir}/three.js`,
  "react-router-dom": `${stubsDir}/react-router-dom.js`,
  "react-dom": `${TREE}/react-stub.js`,
};

const EXTS = ["", ".js", ".jsx", ".ts", ".tsx", ".json", ".mjs", ".cjs"];
const isFile = p => { try { return fs.statSync(p).isFile(); } catch { return false; } };
const isDir = p => { try { return fs.statSync(p).isDirectory(); } catch { return false; } };
const tryResolveFs = base => {
  for (const e of EXTS) if (isFile(base + e)) return base + e;
  if (isDir(base)) {
    for (const e of EXTS.slice(1)) { const f = tryResolveFs(path.join(base, "index" + e)); if (f) return f; }
  }
  return null;
};

const missingExternal = {
  name: "missing-external",
  setup(b) {
    b.onResolve({ filter: /.*/ }, (args) => {
      if (args.kind === "entry-point") return undefined;
      let spec = args.path;
      for (const [k, v] of Object.entries(alias)) {
        if (spec === k) { spec = v; break; }
        if (spec.startsWith(k + "/")) { spec = v + spec.slice(k.length); break; }
      }
      if (spec.startsWith(".") || path.isAbsolute(spec)) {
        const f = tryResolveFs(path.isAbsolute(spec) ? spec : path.resolve(args.resolveDir, spec));
        return f ? { path: f } : { path: args.path, external: true };
      }
      try { return { path: require_.resolve(spec, { paths: [args.resolveDir, process.cwd()] }) }; }
      catch { return { path: spec, external: true }; }
    });
  },
};

const t0 = Date.now();
try {
  const result = await build({
    entryPoints: [`${TREE}/pages/FoundationEstimator.jsx`],
    bundle: true, platform: "node", format: "esm",
    outfile: `${OUT}/page.bundle.mjs`,
    loader: { ".jsx": "jsx" }, jsx: "automatic",
    plugins: [missingExternal], logLevel: "silent",
  });
  console.log(`built in ${Date.now() - t0}ms — errors: ${result.errors.length}, warnings: ${result.warnings.length}`);
  console.log("PASS page-compile-standalone");
} catch (e) {
  for (const err of (e.errors || []).slice(0, 40)) {
    console.log("ERR:", err.text, "|", err.location ? `${err.location.file}:${err.location.line}` : "");
    for (const n of (err.notes || []).slice(0, 3)) console.log("   note:", n.text);
  }
  process.exit(1);
}

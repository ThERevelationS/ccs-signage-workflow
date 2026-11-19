// esbuild bundler for the O-008u harness.
//   - `@/x` resolves into testtree/src (real files) or testtree/stubs
//   - `react` aliases to the seeding shim; react/jsx-runtime + react-dom stay
//     external so the REAL installed modules run at test time
const esbuild = require("esbuild");
const path = require("path");
const fs = require("fs");

const ROOT = __dirname;
const TESTTREE = path.join(ROOT, "testtree");
const STUBS = path.join(TESTTREE, "stubs");

const atAlias = {
  name: "at-alias",
  setup(build) {
    build.onResolve({ filter: /^@\// }, (args) => {
      const rel = args.path.slice(2); // strip "@/"
      // Every @/components/ui/<x> import resolves to the combined ui stub.
      if (rel.startsWith("components/ui/")) {
        return { path: path.join(STUBS, "ui.jsx") };
      }
      // Known stubbed modules.
      const stubMap = {
        "api/base44Client": "base44Client.js",
        "components/staff/staffEntities": "staffEntities.js",
        "components/estimator/loadAllEntityRows": "loadAllEntityRows.js",
        "components/estimator/builder/builderEntityPersistence": "builderEntityPersistence.js",
      };
      if (stubMap[rel]) return { path: path.join(STUBS, stubMap[rel]) };
      // Otherwise resolve inside testtree/src (js, jsx — try both).
      for (const ext of ["", ".js", ".jsx"]) {
        const p = path.join(TESTTREE, "src", rel + ext);
        if (fs.existsSync(p)) return { path: p };
      }
      return { path: path.join(STUBS, "ui.jsx") }; // fail-soft to ui stub
    });
    build.onResolve({ filter: /^lucide-react$/ }, () => ({ path: path.join(STUBS, "lucide.jsx") }));
    build.onResolve({ filter: /^react-router-dom$/ }, () => ({ path: path.join(STUBS, "reactRouterDom.jsx") }));
    build.onResolve({ filter: /^react$/ }, () => ({ path: path.join(STUBS, "react-shim.mjs") }));
  },
};

esbuild
  .build({
    entryPoints: [
      path.join(ROOT, "test-o008u-remaining.jsx"),
      path.join(ROOT, "debug-render.jsx"),
    ],
    outExtension: { ".js": ".bundle.mjs" },
    bundle: true,
    format: "esm",
    platform: "node",
    jsx: "automatic",
    plugins: [atAlias],
    external: ["react/jsx-runtime", "react-dom", "react-dom/server", "node:*"],
    outdir: path.join(ROOT, "testtree"),
    logLevel: "warning",
  })
  .then(() => console.log("BUNDLE OK"))
  .catch((e) => {
    console.error(e.message || e);
    process.exit(1);
  });

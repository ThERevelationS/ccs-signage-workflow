// Build the O-035 verification bundle from the STAGING tree (remote pulls +
// candidates — local src/ is never read). Emits scene-editops-bundle.mjs.
const esbuild = require("esbuild");
const path = require("path");
const fs = require("fs");

const STAGE = path.resolve(__dirname, "staging-src");
const ENTRY = path.join(__dirname, "staging-entry.js");

fs.writeFileSync(
  ENTRY,
  `export * as ops from "@/components/estimator/foundation/foundationSceneEditOps.js";
export * as selection from "@/components/estimator/foundation/foundationSceneSelection.js";
export * as input from "@/components/estimator/foundation/foundationSceneInput.js";
export * as model from "@/components/estimator/foundation/foundationLayoutModel.js";
export * as transforms from "@/components/estimator/foundation/foundationSceneTransforms.js";
export * as history from "@/components/estimator/foundation/foundationSceneHistory.js";
`
);

esbuild
  .build({
    entryPoints: [ENTRY],
    bundle: true,
    format: "esm",
    platform: "node",
    outfile: path.join(__dirname, "scene-editops-bundle.mjs"),
    alias: { "@": STAGE },
    loader: { ".js": "jsx", ".jsx": "jsx" },
    logLevel: "warning",
    metafile: true,
  })
  .then((r) => {
    fs.writeFileSync(
      path.join(__dirname, "bundle-metafile.json"),
      JSON.stringify(Object.keys(r.metafile.inputs), null, 1)
    );
    console.log("bundle ok:", Object.keys(r.metafile.inputs).length, "inputs");
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });

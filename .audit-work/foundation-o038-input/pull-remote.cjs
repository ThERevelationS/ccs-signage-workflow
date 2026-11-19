// Pull remote files into remote-src/ for the O-038/O-039 evidence pack.
// Usage: node pull-remote.cjs
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const APP = "68dfcc5e57bbbc35387da97c";
const BRANCH = "main";
const OUT = path.join(__dirname, "remote-src");

const FILES = [
  "src/components/estimator/foundation/FoundationLayoutCanvas.jsx",
  "src/components/estimator/foundation/foundationLayoutModel.js",
  "src/components/estimator/foundation/foundationAssemblyModel.js",
  "src/components/estimator/foundation/foundationGeometryInputs.js",
  "src/components/estimator/foundation/Foundation3DPreview.jsx",
  "src/components/estimator/foundation/WallShapeEditor.jsx",
];

for (const rel of FILES) {
  const raw = execFileSync(
    `npx base44@latest sandbox read "${rel}" --app-id ${APP} --branch ${BRANCH} --json`,
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, shell: true }
  );
  const parsed = JSON.parse(raw);
  // sandbox read --json returns either {path, content, exists} or an array thereof
  const entries = Array.isArray(parsed) ? parsed : parsed.files || [parsed];
  for (const entry of entries) {
    const p = entry.path || rel;
    const dest = path.join(OUT, p.replace(/\//g, "__"));
    if (entry.exists === false) {
      fs.writeFileSync(dest + ".missing", JSON.stringify(entry, null, 2));
      console.log("MISSING", p);
      continue;
    }
    const content = entry.content ?? entry.text ?? "";
    fs.writeFileSync(dest, content);
    console.log("WROTE", p, content.length, "bytes");
  }
}

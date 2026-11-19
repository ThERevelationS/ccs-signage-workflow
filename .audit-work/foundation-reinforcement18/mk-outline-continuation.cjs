const { spawnSync } = require("child_process");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const cli = path.join(path.dirname(process.execPath), "node_modules/npm/bin/npx-cli.js");
const E = ".audit-work/foundation-reinforcement18/";
const APP = "68dfcc5e57bbbc35387da97c";
const run = (a) => spawnSync(process.execPath, [cli, "base44@latest", ...a, "--json"], { encoding: "utf8", timeout: 180000, maxBuffer: 16 * 1024 * 1024 });
const sh = (cmd) => {
  const b64 = Buffer.from(cmd).toString("base64");
  return JSON.parse(run(["sandbox", "run", `echo ${b64} | base64 -d | bash`, "--timeout-ms", "30000", "--app-id", APP, "--branch", "main"]).stdout);
};
// file list = dimensions scope paths + WallShapeEditor
const prior = JSON.parse(fs.readFileSync(E + "masonry-dimensions-sandbox-final-scope.json", "utf8"));
const paths = prior.files.map((f) => f.path);
if (!paths.includes("src/components/estimator/foundation/WallShapeEditor.jsx"))
  paths.push("src/components/estimator/foundation/WallShapeEditor.jsx");
const priorByPath = Object.fromEntries(prior.files.map((f) => [f.path, f]));

const out = {};
out.head = sh("git rev-parse HEAD").stdout.trim();
out.dirty = sh("git status --porcelain").stdout;
out.changed = sh(`git diff --name-only ${out.head} HEAD`).stdout;
out.files = [];
for (const p of paths) {
  const r = sh(`test -f '${p}' && base64 -w0 '${p}' || true`);
  const b64 = r.stdout.trim();
  const text = b64 ? Buffer.from(b64, "base64").toString("utf8") : "";
  const normalized = text.replace(/\r\n/g, "\n");
  const f = { path: p, exists: !!b64, crlf: text.includes("\r"), normalized, hash: crypto.createHash("sha256").update(text).digest("hex"), text, base64: b64 };
  const before = priorByPath[p];
  if (before) f.driftFromBaseline = before.hash !== f.hash;
  out.files.push(f);
}
out.headAfter = sh("git rev-parse HEAD").stdout.trim();
out.dirtyAfter = sh("git status --porcelain").stdout;
try {
  const s = JSON.parse(run(["api", "fetch", "GET", `/api/apps/${APP}`]).stdout);
  out.app = { id: s.id, name: s.name, status: s.status?.state, git_repo_pending: s.git_repo_pending, dev_environment_enabled: s.dev_environment_enabled };
} catch (e) { out.app = "FAIL"; }
const { head, dirty, changed, headAfter, dirtyAfter, app } = out;
fs.writeFileSync(E + "masonry-outline-continuation-source.json", JSON.stringify({ head, dirty, changed, files: out.files, headAfter, dirtyAfter }, null, 1));
fs.writeFileSync(E + "masonry-outline-continuation-status.json", JSON.stringify({ head, dirty, changed, headAfter, dirtyAfter, app, drift: out.files.filter((f) => f.driftFromBaseline).map((f) => f.path) }, null, 1));
console.log(JSON.stringify({ head, dirty: dirty.length, changed, drift: out.files.filter((f) => f.driftFromBaseline).map((f) => f.path), app }));

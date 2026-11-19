// Pull remote files into the working tree and record each as the edit base.
// usage (from repo root or .audit-work): node .audit-work/pull-unit.cjs <repoRelPath...>
const fs = require("fs"), path = require("path");
const { readRemote, writeBase, h } = require("./sandbox-io.cjs");
const ROOT = path.resolve(__dirname, "..");
for (const p of process.argv.slice(2)) {
  const remote = readRemote(p);
  if (remote == null) { console.log(`MISSING-REMOTE ${p}`); process.exitCode = 1; continue; }
  const dest = path.join(ROOT, p);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, remote, "utf8");
  writeBase(p, remote);
  console.log(`PULLED ${p} base=${h(remote)}`);
}

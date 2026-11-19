// Guarded transport: write one local file to the Base44 sandbox ONLY if the
// remote still equals the base the local edit started from (compare-and-swap).
// usage: node transport-unit.cjs <localPath> <remotePath> [--new]
//   --new  : the file must NOT exist remotely yet (creating a new file)
// Refuses (exit 2) when: no recorded base (run pull-unit.cjs first), or the
// remote changed since the pull. Never overwrites remote work it has not seen.
const fs = require("fs");
const { run, APP, norm, h, readRemote, readBase, writeBase } = require("./sandbox-io.cjs");
const args = process.argv.slice(2);
const isNew = args.includes("--new");
const [localPath, remotePath] = args.filter(a => a !== "--new");
const content = fs.readFileSync(localPath, "utf8");
const current = readRemote(remotePath);
if (isNew) {
  if (current != null) { console.log(`REFUSED ${remotePath}: --new but the file exists remotely (remote=${h(current)}). Pull it first.`); process.exit(2); }
} else {
  const base = readBase(remotePath);
  if (current == null) { console.log(`REFUSED ${remotePath}: missing remotely; use --new to create it.`); process.exit(2); }
  if (base == null) { console.log(`REFUSED ${remotePath}: no recorded base. Run: node .audit-work/pull-unit.cjs ${remotePath} and re-apply the edit.`); process.exit(2); }
  if (norm(current) !== norm(base)) { console.log(`REFUSED ${remotePath}: remote changed since pull (base=${h(base)} remote=${h(current)}). Re-pull, re-apply, re-verify.`); process.exit(2); }
  if (norm(current) === norm(content)) { console.log(`UNCHANGED ${remotePath} (local == remote)`); process.exit(0); }
}
try { run(["sandbox", "write", remotePath, "--app-id", APP, "--branch", "main", "--json", "--overwrite"], content); }
catch (e) { console.log("WRITE-THREW (checking if it landed):", String(e.message).slice(0, 120)); }
const after = readRemote(remotePath);
const match = after != null && norm(after) === norm(content);
if (match) writeBase(remotePath, after);
console.log(`READBACK ${match ? "EXACT" : "MISMATCH"} ${remotePath} local=${h(content)} remote=${after == null ? "missing" : h(after)}`);
process.exit(match ? 0 : 1);

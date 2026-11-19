// Pull remote files into remote-src/ preserving paths. Read-only.
const { spawnSync } = require("child_process");
const path = require("path");
const fs = require("fs");
const E = ".audit-work/foundation-reinforcement24/";
const APP = "68dfcc5e57bbbc35387da97c";
const FILES = process.argv.slice(2);
if (!FILES.length) { console.error("usage: node pull-remote.cjs <path> [path...]"); process.exit(2); }
const outRoot = path.join(E, "remote-src");
for (const p of FILES) {
  const res = spawnSync("npx", ["base44@latest", "sandbox", "read", p, "--app-id", APP, "--branch", "main", "--json"], { encoding: "utf8", timeout: 180000, maxBuffer: 32 * 1024 * 1024, shell: true });
  let s = res.stdout || "";
  const i = s.indexOf("{");
  if (i < 0) { console.error("FAIL-NOJSON", p, (res.stderr || "").slice(-200)); continue; }
  let j;
  try { j = JSON.parse(s.slice(i)); } catch (e) { console.error("FAIL-PARSE", p, e.message); continue; }
  const f = (j.files || [])[0];
  if (!f || f.content == null) { console.error("FAIL-EMPTY", p, JSON.stringify(j).slice(0, 200)); continue; }
  const dest = path.join(outRoot, p);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, f.content);
  const lines = f.content.split("\n").length;
  console.log("OK", p, lines + " lines", f.content.length + " chars");
}

// Remote command helper: node rc.cjs "<shell command>" -> prints remote stdout
const { spawnSync } = require("child_process");
const path = require("path");
const APP = "68dfcc5e57bbbc35387da97c";
const cli = path.join(path.dirname(process.execPath), "node_modules/npm/bin/npx-cli.js");
const cmd = process.argv[2];
if (!cmd) { console.error("usage: node rc.cjs <cmd>"); process.exit(2); }
const res = spawnSync(process.execPath, [cli, "base44@latest", "sandbox", "run", cmd, "--timeout-ms", "120000", "--app-id", APP, "--branch", "main", "--json"], { encoding: "utf8", timeout: 180000, maxBuffer: 32 * 1024 * 1024 });
let s = res.stdout || "";
const i = s.indexOf("{");
if (i < 0) { console.error("NOJSON", s.slice(0, 300), res.stderr); process.exit(1); }
let j;
try { j = JSON.parse(s.slice(i)); } catch (e) { console.error("PARSE", e.message, s.slice(0, 200)); process.exit(1); }
if (j.exitCode !== 0) { process.stdout.write(j.stdout || ""); process.stderr.write(j.stderr || ""); console.error("REMOTE-EXIT", j.exitCode); process.exit(1); }
process.stdout.write(j.stdout || "");

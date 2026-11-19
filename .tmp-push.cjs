const { spawnSync } = require("child_process");
const fs = require("fs");
const CLI = "C:\\Users\\BrettHeinlein\\AppData\\Local\\npm-cache\\_npx\\ebe492f4494510c0\\node_modules\\base44\\bin\\run.js";
const paths = process.argv.slice(2);
let failed = 0;
for (const p of paths) {
  const res = spawnSync("node", [CLI, "sandbox", "write", p, "--overwrite",
    "--app-id", "68dfcc5e57bbbc35387da97c", "--branch", "main", "--json"],
    { input: fs.readFileSync(p), encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const out = (res.stdout || "").trim();
  const ok = res.status === 0 && out.includes(p);
  console.log((ok ? "OK   " : "FAIL ") + p);
  if (!ok) { failed = 1; console.log((res.stderr || "").slice(-800)); console.log(out.slice(-800)); }
}
process.exit(failed);

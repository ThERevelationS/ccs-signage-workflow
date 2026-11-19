// usage: node drift-check.cjs <relPath...>  — compares local vs remote (CRLF-normalized)
const { execFileSync } = require("child_process");
const fs = require("fs");
const APP = "68dfcc5e57bbbc35387da97c";
const norm = v => v.split("\r\n").join("\n").replace(/\n+$/, "");
for (const p of process.argv.slice(2)) {
  let rb;
  try { rb = execFileSync("cmd.exe", ["/c", "npx", "base44@latest", "sandbox", "read", p, "--app-id", APP, "--branch", "main", "--json"], { encoding: "utf8", timeout: 120000, maxBuffer: 64 << 20 }); }
  catch (e) { console.log(p, "READ-FAILED"); continue; }
  const j = JSON.parse(rb.slice(rb.indexOf("{")));
  const rec = (j.files || []).find(r => r.path === p);
  if (!rec) { console.log(p, "REMOTE-MISSING"); continue; }
  const l = norm(fs.readFileSync(p, "utf8")).split("\n"), r = norm(rec.content).split("\n");
  const diffs = [];
  for (let i = 0; i < Math.max(l.length, r.length); i++) if (l[i] !== r[i]) diffs.push(i + 1);
  console.log(p, diffs.length ? `DIFF ${diffs.length} lines (first ${diffs.slice(0, 5).join(",")}) local=${l.length} remote=${r.length}` : "SAME");
}

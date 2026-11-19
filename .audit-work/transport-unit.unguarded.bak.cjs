// Transport one local file to the Base44 sandbox with exact readback.
// usage: node transport-unit.cjs <localPath> <remotePath>
const { execFileSync } = require("child_process");
const fs = require("fs");
const crypto = require("crypto");
const APP = "68dfcc5e57bbbc35387da97c";
const [localPath, remotePath] = process.argv.slice(2);
const content = fs.readFileSync(localPath, "utf8");
const run = (args, input) => execFileSync("cmd.exe",
  ["/c", "npx", "base44@latest", ...args],
  { encoding: "utf8", timeout: 120000, input });
let out;
try {
  out = run(["sandbox", "write", remotePath, "--app-id", APP, "--branch", "main", "--json", "--overwrite"], content);
} catch (e) {
  console.log("WRITE-THREW (checking if it landed):", String(e.message).slice(0, 160));
}
if (out) console.log("write-out:", out.slice(out.indexOf("{"), out.indexOf("}") + 1) || out.slice(0, 200));
// readback
const rb = run(["sandbox", "read", remotePath, "--app-id", APP, "--branch", "main", "--json"]);
const parsed = JSON.parse(rb.slice(rb.indexOf("{")));
const rec = (parsed.files || []).find(r => r.path === remotePath);
if (!rec) { console.log("READBACK: file missing"); process.exit(1); }
const h = c => crypto.createHash("sha256").update(c).digest("hex").slice(0, 16);
const norm = v => v.split("\r\n").join("\n");
const match = norm(rec.content) === norm(content);
console.log(`READBACK ${match ? "EXACT" : "MISMATCH"} local=${h(content)} remote=${h(rec.content)} bytes=${rec.content.length}`);
process.exit(match ? 0 : 1);

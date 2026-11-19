// Shared Base44 sandbox I/O + base-snapshot store for the guarded transports.
const { execFileSync } = require("child_process");
const fs = require("fs"), path = require("path"), crypto = require("crypto");
const APP = "68dfcc5e57bbbc35387da97c";
const BASES = path.join(__dirname, ".bases");
const run = (args, input) => execFileSync("cmd.exe", ["/c", "npx", "base44@latest", ...args],
  { encoding: "utf8", timeout: 180000, input, maxBuffer: 256 << 20 });
const norm = v => v.split("\r\n").join("\n").replace(/\n+$/, "");
const h = c => crypto.createHash("sha256").update(norm(c)).digest("hex").slice(0, 16);
function readRemote(p) {
  const rb = run(["sandbox", "read", p, "--app-id", APP, "--branch", "main", "--json"]);
  const rec = (JSON.parse(rb.slice(rb.indexOf("{"))).files || []).find(r => r.path === p);
  return rec ? rec.content : null; // null = file does not exist remotely
}
const basePath = p => path.join(BASES, p);
const readBase = p => fs.existsSync(basePath(p)) ? fs.readFileSync(basePath(p), "utf8") : null;
function writeBase(p, content) { fs.mkdirSync(path.dirname(basePath(p)), { recursive: true }); fs.writeFileSync(basePath(p), content, "utf8"); }
module.exports = { APP, run, norm, h, readRemote, readBase, writeBase };

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const raw = fs.readFileSync(".tmp-remote-md5.txt", "utf8");
const parsed = JSON.parse("{" + raw.trimStart().replace(/^\s*\{?\s*/, ""));
const remote = {};
for (const line of parsed.stdout.split("\n")) {
  const m = line.trim().match(/^([0-9a-f]{32})\s+(.+)$/);
  if (m) remote[m[2]] = m[1];
}
console.log("remote files: " + Object.keys(remote).length);
const md5 = (f) => crypto.createHash("md5").update(fs.readFileSync(f)).digest("hex");
const walk = (dir, out = []) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(jsx|js|mjs)$/.test(e.name)) out.push(p.replace(/\\/g, "/"));
  }
  return out;
};
const local = walk("src");
const diff = local.filter((p) => !remote[p] || remote[p] !== md5(p));
const missing = Object.keys(remote).filter((p) => !fs.existsSync(p));
console.log("local:" + local.length + " differing:" + diff.length + " missing:" + missing.length);
[...diff, ...missing].slice(0, 60).forEach((p) => console.log("  " + p));
fs.writeFileSync(".tmp-drift.txt", [...diff, ...missing].join("\n"));

const fs = require("fs");
const dir = "base44/entities";
const open = [], missing = [], scoped = [], backendOnly = [], other = [];
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".jsonc"))) {
  const s = fs.readFileSync(`${dir}/${f}`, "utf8");
  const m = s.match(/"rls"\s*:\s*\{([\s\S]*?)\n  \}/);
  if (!m) { missing.push(f); continue; }
  const rm = m[1].match(/"read"\s*:\s*(\{[^}]*\}|\[\s*\])/s);
  if (!rm) { missing.push(f + " (no read key)"); continue; }
  const read = rm[1].replace(/\s+/g, " ");
  if (/^"read"\s*:\s*\{\s*\}/.test(m[1]) || /"read"\s*:\s*\{\s*\}/.test(m[1])) open.push(f);
  else if (/backend_only/.test(read)) backendOnly.push(f);
  else if (/\$or|data\.|user\.email/.test(read)) scoped.push(f + " :: " + read.slice(0, 140));
  else other.push(f + " :: " + read.slice(0, 140));
}
console.log(`== OPEN read (${open.length})`); open.forEach((x) => console.log("  " + x));
console.log(`== scoped read (${scoped.length})`); scoped.slice(0, 15).forEach((x) => console.log("  " + x));
console.log(`== other read (${other.length})`); other.slice(0, 15).forEach((x) => console.log("  " + x));
console.log(`== backend-only read: ${backendOnly.length}, missing rls: ${missing.length}`);
missing.slice(0, 15).forEach((x) => console.log("  MISSING " + x));

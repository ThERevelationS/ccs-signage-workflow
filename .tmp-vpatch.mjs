import fs from "node:fs";
const f = "scripts/validate-opportunity-workspace.mjs";
let s = fs.readFileSync(f, "utf8").replace(/\r\n/g, "\n");
const old = `assert.match(entry, /work_orders: \(Array\.isArray\(wos\)/, 'global search must include work orders');`;
const nu = `assert.match(entry, /work_orders:\s*(?:mergeLegacy\([^)]*,\s*)?\(Array\.isArray\(wos\)/, 'global search must include work orders');`;
if (!s.includes(old)) { console.error("MISS"); process.exit(1); }
fs.writeFileSync(f, s.replace(old, nu));
console.log("PATCHED");

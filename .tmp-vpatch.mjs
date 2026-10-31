import fs from "node:fs";
const f = "scripts/validate-opportunity-workspace.mjs";
let s = fs.readFileSync(f, "utf8").replace(/\r\n/g, "\n");
const B = String.fromCharCode(92); // backslash, no escaping games
const old = `assert.match(entry, /work_orders: ${B}${B}(Array${B}${B}.isArray${B}${B}(wos${B}${B})/, 'global search must include work orders');`;
const nu = `assert.match(entry, /work_orders:${B}s*(?:mergeLegacy${B}([^)]*,${B}s*)?${B}(Array${B}.isArray${B}(wos${B})/, 'global search must include work orders');`;
if (!s.includes(old)) { console.error("MISS", JSON.stringify(s.split("\n").find(l => l.includes("work_orders:")))); process.exit(1); }
fs.writeFileSync(f, s.replace(old, nu));
console.log("PATCHED");

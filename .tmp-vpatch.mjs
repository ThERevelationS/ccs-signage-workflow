import fs from "node:fs";
const f = "scripts/validate-opportunity-workspace.mjs";
let s = fs.readFileSync(f, "utf8").replace(/\r\n/g, "\n");
const line = s.split("\n").find(l => l.includes("work_orders:") && l.includes("assert.match"));
console.error("LINE-BYTES:", JSON.stringify(line));
// Replace with a correct regex: single-escaped parens, mergeLegacy-tolerant.
const nu = "assert.match(entry, /work_orders:\s*(?:mergeLegacy\([^)]*,\s*)?\(Array\.isArray\(wos\)/, 'global search must include work orders');";
if (!line) { console.error("no assert line"); process.exit(1); }
fs.writeFileSync(f, s.replace(line, nu));
console.log("PATCHED");

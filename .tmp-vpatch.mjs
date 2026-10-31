import fs from "node:fs";
const f = "scripts/validate-opportunity-workspace.mjs";
let s = fs.readFileSync(f, "utf8").replace(/\r\n/g, "\n");
const B = String.fromCharCode(92);
const line = s.split("\n").find(l => l.includes("work_orders:") && l.includes("assert.match"));
if (!line) { console.error("no assert line"); process.exit(1); }
const nu = "assert.match(entry, /work_orders:" + B + "s*(?:mergeLegacy" + B + "([^)]*," + B + "s*)?" + B + "(Array" + B + ".isArray" + B + "(wos" + B + ")/, 'global search must include work orders');";
fs.writeFileSync(f, s.replace(line, nu));
console.log("PATCHED:", nu);

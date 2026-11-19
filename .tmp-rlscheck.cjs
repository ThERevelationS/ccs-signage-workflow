const fs = require("fs");
const strip = (s) => (s.charCodeAt(0) === 0xfeff ? s.slice(1) : s);
const open = [], locked = [], weird = [];
for (const f of [".tmp-rls-b1.json", ".tmp-rls-b2.json"]) {
  for (const file of JSON.parse(strip(fs.readFileSync(f, "utf8"))).files) {
    const c = file.content;
    const m = c.match(/"read"\s*:\s*(\{\s*\})/);
    if (m) { open.push({ path: file.path, content: c, exact: m[0] }); continue; }
    const r = c.match(/"read"\s*:\s*(\{[^}]*\})/s);
    if (r) locked.push(file.path + " :: " + r[1].replace(/\s+/g, " ").slice(0, 110));
    else weird.push(file.path);
  }
}
console.log("OPEN:", open.length); open.forEach((o) => console.log("  " + o.path + "  [" + JSON.stringify(o.exact) + "]"));
console.log("LOCKED:", locked.length); locked.forEach((x) => console.log("  " + x));
console.log("NO-READ-RULE:", weird.length); weird.forEach((x) => console.log("  " + x));
fs.writeFileSync(".tmp-open-entities.json", JSON.stringify(open.map((o) => o.path)));

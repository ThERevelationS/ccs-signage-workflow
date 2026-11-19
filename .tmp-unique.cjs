const fs = require("fs");
const strip = (s) => (s.charCodeAt(0) === 0xfeff ? s.slice(1) : s);
for (const f of [".tmp-rls-b1.json", ".tmp-rls-b2.json"]) {
  for (const file of JSON.parse(strip(fs.readFileSync(f, "utf8"))).files) {
    const hits = file.content.match(/"read"\s*:\s*\{\s*\}/g) || [];
    if (hits.length) {
      const fls = file.content.includes('"fls"');
      console.log(file.path, "count=" + hits.length, "hasFLS=" + fls);
    }
  }
}

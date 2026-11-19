const fs = require("fs");
const strip = (s) => (s.charCodeAt(0) === 0xfeff ? s.slice(1) : s);
for (const f of fs.readdirSync(".").filter((x) => x.startsWith(".tmp-ent-"))) {
  const j = JSON.parse(strip(fs.readFileSync(f, "utf8"))).files[0];
  const i = j.content.indexOf('"rls"');
  console.log("===", j.path);
  console.log(i >= 0 ? j.content.slice(i, i + 700) : "(no rls block)");
}

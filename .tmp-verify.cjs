const fs = require("fs"), c = require("crypto");
const strip = (s) => (s.charCodeAt(0) === 0xfeff ? s.slice(1) : s);
const h = (s) => c.createHash("sha256").update(strip(s).replace(/\r\n/g, "\n")).digest("hex").slice(0, 12);
for (const f of fs.readdirSync(".").filter((x) => x.startsWith(".tmp-verify-") && x.endsWith(".json"))) {
  const remote = JSON.parse(strip(fs.readFileSync(f, "utf8"))).files[0];
  const local = fs.readFileSync(remote.path, "utf8");
  console.log(remote.path, h(local) === h(remote.content) ? "MATCH" : "MISMATCH");
}

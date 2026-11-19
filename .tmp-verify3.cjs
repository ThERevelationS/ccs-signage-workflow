const fs = require("fs"), c = require("crypto");
const strip = (s) => (s.charCodeAt(0) === 0xfeff ? s.slice(1) : s);
const norm = (s) => strip(s).replace(/\r\n/g, "\n");
const h = (s) => c.createHash("sha256").update(s).digest("hex").slice(0, 12);
for (const f of fs.readdirSync(".").filter((x) => x.startsWith(".tmp-verify2-") && x.endsWith(".json"))) {
  const remote = JSON.parse(strip(fs.readFileSync(f, "utf8"))).files[0];
  const local = norm(fs.readFileSync(remote.path, "utf8"));
  const direct = norm(remote.content);
  const redecoded = norm(Buffer.from(remote.content, "latin1").toString("utf8"));
  const d = h(local) === h(direct), r = h(local) === h(redecoded);
  console.log(remote.path, d ? "MATCH(direct)" : r ? "MATCH(latin1-redecode)" : "MISMATCH");
}

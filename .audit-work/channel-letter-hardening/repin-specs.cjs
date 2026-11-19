// Re-pin sourceHead (+ baselineFile, unchanged name) in transport + proof specs.
// Usage: node repin-specs.cjs <newHead>
const fs = require("fs");
const E = ".audit-work/channel-letter-hardening/";
const head = process.argv[2];
if (!/^[0-9a-f]{40}$/.test(head || "")) { console.error("bad head"); process.exit(2); }
for (const f of ["channel-pricing-transport-spec.json", "channel-pricing-proof-spec.json"]) {
  const j = JSON.parse(fs.readFileSync(E + f, "utf8"));
  const old = j.sourceHead;
  j.sourceHead = head;
  fs.writeFileSync(E + f, JSON.stringify(j, null, 1) + "\n");
  console.log(f, old, "->", head);
}

// Re-pin sourceHead + baselineFile in transport + proof specs.
// Usage: node repin-brick-specs.cjs <newHead> <baselineFile>
const fs = require("fs");
const E = ".audit-work/brick-stone-hardening/";
const head = process.argv[2], baseline = process.argv[3];
if (!/^[0-9a-f]{40}$/.test(head || "")) { console.error("bad head"); process.exit(2); }
if (!/^brick-pricing-baseline.+\.json$/.test(baseline || "")) { console.error("bad baseline file"); process.exit(2); }
for (const f of ["brick-pricing-transport-spec.json", "brick-pricing-proof-spec.json"]) {
  const j = JSON.parse(fs.readFileSync(E + f, "utf8"));
  const oldH = j.sourceHead, oldB = j.baselineFile;
  j.sourceHead = head;
  j.baselineFile = baseline;
  fs.writeFileSync(E + f, JSON.stringify(j, null, 1) + "\n");
  console.log(f, "sourceHead", oldH, "->", head, "| baselineFile", oldB, "->", baseline);
}

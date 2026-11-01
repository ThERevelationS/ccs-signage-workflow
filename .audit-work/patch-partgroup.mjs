// Patch builderPartGroupPersistence.js: add cleanString normalization to
// sameValue — identical convention to builderPartPersistence.js (#375).
import fs from "node:fs";

const path = "src/components/estimator/builder/builderPartGroupPersistence.js";
const src = fs.readFileSync(path, "utf8");

const HEADER = `// String fields can differ only by stray or repeated whitespace; normalize
// whitespace (but not case) so stored rows match their create payloads.
const cleanString = (value) => String(value ?? "").trim().replace(/\\s+/g, " ");

`;

const ANCHOR_TOP = `function comparable(value) {`;
const ANCHOR_CMP = `  if (!emptyA && !emptyB && Number.isFinite(Number(a)) && Number.isFinite(Number(b))) {
    return Math.abs(Number(a) - Number(b)) <= 0.000001;
  }
  return JSON.stringify(comparable(a)) === JSON.stringify(comparable(b));`;

const REPL_CMP = `  if (!emptyA && !emptyB && Number.isFinite(Number(a)) && Number.isFinite(Number(b))) {
    return Math.abs(Number(a) - Number(b)) <= 0.000001;
  }
  if (typeof a === "string" && typeof b === "string") {
    return cleanString(a) === cleanString(b);
  }
  return JSON.stringify(comparable(a)) === JSON.stringify(comparable(b));`;

if (src.includes("cleanString")) {
  console.log("ALREADY PATCHED — cleanString present");
  process.exit(0);
}
if (!src.startsWith(ANCHOR_TOP)) throw new Error("top anchor mismatch — file changed since pull");
if (!src.includes(ANCHOR_CMP)) throw new Error("sameValue anchor mismatch — file changed since pull");

const out = HEADER + src.replace(ANCHOR_CMP, REPL_CMP);
fs.writeFileSync(path, out);
console.log("PATCHED", path, "bytes", out.length);

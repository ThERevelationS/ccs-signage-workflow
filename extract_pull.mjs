// Extract files from a sandbox-read JSON capture that may have leading log lines.
// Usage: node extract_pull.mjs <capture.json> [outdir]
import fs from "node:fs";
import path from "node:path";

const inFile = process.argv[2];
const outdir = process.argv[3] || "remote_pull";
const raw = fs.readFileSync(inFile, "utf8");
const start = raw.indexOf("{");
if (start < 0) {
  console.error("no JSON found in", inFile);
  process.exit(1);
}
const j = JSON.parse(raw.slice(start));
for (const f of j.files || []) {
  const dest = path.join(outdir, f.path);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, f.content ?? "");
  console.log(f.path, (f.content || "").length);
}

// Pull remote sandbox files to .remote/ mirror for local analysis.
// Usage: node scripts/pull-remote.mjs <path1> [path2] ...
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const APP_ID = "68dfcc5e57bbbc35387da97c";
const BRANCH = "main";
const files = process.argv.slice(2);
if (!files.length) { console.error("no files"); process.exit(1); }

for (let i = 0; i < files.length; i += 8) {
  const batch = files.slice(i, i + 8);
  let out;
  try {
    out = execFileSync("npx", ["base44@latest", "sandbox", "read", ...batch, "--app-id", APP_ID, "--branch", BRANCH, "--json"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, shell: true });
  } catch (e) {
    console.error("BATCH FAIL", batch.join(","), e.message?.slice(0, 200));
    continue;
  }
  // strip possible non-JSON prefix lines
  const start = out.indexOf("{");
  const parsed = JSON.parse(out.slice(start));
  for (const f of parsed.files || []) {
    const dest = join(".remote", f.path);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, f.content ?? "");
    console.log("pulled", f.path, (f.content ?? "").length, "chars");
  }
}

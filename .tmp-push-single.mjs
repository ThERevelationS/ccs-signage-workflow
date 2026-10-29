// Pushes one file via POST /api/apps/{app}/coding/write (single-file write w/ backend redeploy).
// usage: node .tmp-push-single.mjs <remote_path> <local_path>
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const RUN = "C:\\Users\\BrettHeinlein\\AppData\\Local\\npm-cache\\_npx\\ebe492f4494510c0\\node_modules\\base44\\bin\\run.js";
const APP = "68dfcc5e57bbbc35387da97c";
const [filePath, local] = process.argv.slice(2);
writeFileSync(".tmp-push-single-body.json", JSON.stringify({
  file_path: filePath,
  content: readFileSync(local, "utf8"),
}));
const res = spawnSync(process.execPath, [
  RUN, "api", "fetch", "POST", `/api/apps/${APP}/coding/write`,
  "--body", "@.tmp-push-single-body.json",
], { encoding: "utf8", timeout: 300000 });
process.stdout.write(res.stdout || "");
process.stderr.write(res.stderr || "");
process.exit(res.status ?? (res.error ? 1 : 0));

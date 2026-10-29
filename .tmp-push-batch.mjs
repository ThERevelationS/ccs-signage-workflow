// Pushes files to Base44 via POST /api/apps/{app}/coding/write-batch (frontend files only).
// usage: node .tmp-push-batch.mjs <pairs.json>   where pairs = [{file_path, local}]
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const RUN = "C:\\Users\\BrettHeinlein\\AppData\\Local\\npm-cache\\_npx\\ebe492f4494510c0\\node_modules\\base44\\bin\\run.js";
const APP = "68dfcc5e57bbbc35387da97c";
const pairs = JSON.parse(readFileSync(process.argv[2], "utf8"));
const files = pairs.map(p => ({ file_path: p.file_path, content: readFileSync(p.local, "utf8") }));
writeFileSync(".tmp-push-batch-body.json", JSON.stringify({ files }));
const res = spawnSync(process.execPath, [
  RUN, "api", "fetch", "POST", `/api/apps/${APP}/coding/write-batch`,
  "--body", "@.tmp-push-batch-body.json",
], { encoding: "utf8", timeout: 300000 });
process.stdout.write(res.stdout || "");
process.stderr.write(res.stderr || "");
process.exit(res.status ?? (res.error ? 1 : 0));

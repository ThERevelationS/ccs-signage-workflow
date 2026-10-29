// Pushes a full file to Base44 via POST /api/apps/{app}/coding/write.
// usage: node .tmp-push.mjs <app-path> <local-content-file>
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const RUN = "C:\\Users\\BrettHeinlein\\AppData\\Local\\npm-cache\\_npx\\ebe492f4494510c0\\node_modules\\base44\\bin\\run.js";
const APP = "68dfcc5e57bbbc35387da97c";
const [appPath, contentFile] = process.argv.slice(2);
const body = JSON.stringify({ file_path: appPath, content: readFileSync(contentFile, "utf8") });
writeFileSync(".tmp-push-body.json", body);
const res = spawnSync(process.execPath, [
  RUN, "api", "fetch", "POST", `/api/apps/${APP}/coding/write`,
  "--body", "@.tmp-push-body.json",
], { encoding: "utf8", timeout: 180000 });
process.stdout.write(res.stdout || "");
process.stderr.write(res.stderr || "");
process.exit(res.status ?? (res.error ? 1 : 0));

import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const RUN = "C:\\Users\\BrettHeinlein\\AppData\\Local\\npm-cache\\_npx\\ebe492f4494510c0\\node_modules\\base44\\bin\\run.js";
const APP = "68dfcc5e57bbbc35387da97c";
const names = ["googleDriveAuth"];

for (const name of names) {
  const code = readFileSync(`base44/functions/${name}/entry.ts`, "utf8");
  writeFileSync(".tmp-redeploy-body.json", JSON.stringify({ code }));
  const res = spawnSync(process.execPath, [
    RUN, "api", "fetch", "POST",
    `/api/apps/${APP}/coding/redeploy-function/${name}`,
    "--body", "@.tmp-redeploy-body.json",
  ], { encoding: "utf8", timeout: 120000 });
  const out = (res.stdout || "").slice(0, 200);
  const ok = res.status === 0 && !out.includes('"error"');
  console.log(`${name}: ${ok ? "DEPLOYED" : out}`);
}


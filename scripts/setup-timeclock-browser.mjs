// Test-only tooling. Install outside the app tree; never alter app dependencies
// or connect to Base44 records. Run from the repository root.
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";

const runtimeDir = path.join(tmpdir(), "timeclock-browser-check");
const version = "1.64.1";

function run(command, args) {
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`Browser setup failed with exit status ${result.status}`);
  }
}

run(process.platform === "win32" ? "npm.cmd" : "npm", [
  "install", "--prefix", runtimeDir, "--no-audit", "--no-fund",
  `playwright@${version}`,
]);
run(process.execPath, [
  path.join(runtimeDir, "node_modules/playwright/cli.js"),
  "install", "chromium",
]);
console.log("Time Clock browser runtime ready: " + runtimeDir);
console.log("Run: node scripts/test-timeclock-pay-period-browser.mjs");

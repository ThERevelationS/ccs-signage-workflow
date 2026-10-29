// Applies a JSON edits payload (or writes a file) to the Base44 sandbox,
// piping raw UTF-8 bytes so non-ASCII characters survive PowerShell.
// usage: node .tmp-apply.mjs edit <app-path> <payload.json> [--dry-run]
//        node .tmp-apply.mjs write <app-path> <local-file> [--overwrite]
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const RUN = "C:\\Users\\BrettHeinlein\\AppData\\Local\\npm-cache\\_npx\\ebe492f4494510c0\\node_modules\\base44\\bin\\run.js";
const [mode, appPath, payload, ...flags] = process.argv.slice(2);
const cmd = mode === "write" ? "write" : "edit";
const args = [RUN, "sandbox", cmd, appPath,
  "--app-id", "68dfcc5e57bbbc35387da97c", "--branch", "main", "--json", ...flags];
const res = spawnSync(process.execPath, args, {
  input: readFileSync(payload),
  encoding: "utf8",
  timeout: 120000,
});
process.stdout.write(res.stdout || "");
process.stderr.write(res.stderr || "");
process.exit(res.status ?? (res.error ? 1 : 0));

// Pull remote sandbox files into .ui-pass/ mirror. Usage: node pull.mjs <path...>
import { execSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url));
const APP = "68dfcc5e57bbbc35387da97c";
const paths = process.argv.slice(2);
if (!paths.length) { console.error("no paths"); process.exit(1); }

const cmd = [
  "npx base44@latest sandbox read",
  ...paths.map((p) => `"${p}"`),
  "--app-id", APP, "--branch", "main", "--json",
].join(" ");
const out = execSync(cmd, {
  encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "inherit"],
});

const j = JSON.parse(out);
for (const f of j.files) {
  if (f.error) { console.error("ERR", f.path, f.error.code || f.error); continue; }
  const dest = join(ROOT, f.path);
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, f.content, "utf8");
  console.log("pulled", f.path, f.content.length, "chars");
}

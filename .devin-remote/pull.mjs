// pull remote sandbox files to .devin-remote tree. Usage: node pull.mjs <path1> [path2 ...]
import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const APP_ID = "68dfcc5e57bbbc35387da97c";
const OUT = ".devin-remote";
const paths = process.argv.slice(2);
if (!paths.length) { console.error("usage: node pull.mjs <path...>"); process.exit(1); }

const quoted = paths.map((p) => `"${p}"`).join(" ");
const raw = execSync(`npx base44@latest sandbox read ${quoted} --app-id ${APP_ID} --branch main --json`, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, shell: "cmd.exe" });
const start = raw.indexOf("{");
const j = JSON.parse(raw.slice(start));
for (const f of j.files || []) {
  const dest = join(OUT, f.path);
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, f.content ?? "");
  console.log("pulled", f.path, (f.content || "").length, "bytes", f.truncated ? "TRUNCATED" : "");
}

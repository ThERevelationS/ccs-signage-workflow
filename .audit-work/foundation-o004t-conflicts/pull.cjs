// Pull remote files into remote/ via sandbox read --json, extracting .files[0].content.
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const APP = "68dfcc5e57bbbc35387da97c";
const BRANCH = "main";
const outDir = path.join(__dirname, "remote");

const files = process.argv.slice(2);
for (const f of files) {
  const raw = execSync(
    `npx base44@latest sandbox read "${f}" --app-id ${APP} --branch ${BRANCH} --json`,
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, shell: "cmd.exe" }
  );
  const start = raw.indexOf("{");
  const json = JSON.parse(raw.slice(start));
  const entry = json.files && json.files[0];
  if (!entry || typeof entry.content !== "string") {
    console.error(`NO CONTENT for ${f}:`, JSON.stringify(json).slice(0, 400));
    process.exitCode = 1;
    continue;
  }
  const dest = path.join(outDir, path.basename(f));
  fs.writeFileSync(dest, entry.content);
  console.log(`${f} -> ${dest} (${entry.totalLines} lines, truncated=${entry.truncated})`);
}

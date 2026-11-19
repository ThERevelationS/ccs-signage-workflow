const { execSync } = require("child_process");
const fs = require("fs");
const cli = "C:\\\\Users\\\\BrettHeinlein\\\\AppData\\\\Local\\\\npm-cache\\\\_npx\\\\ebe492f4494510c0\\\\node_modules\\\\base44\\\\bin\\\\run.js";
const files = [
  "src/components/estimator/EstimateActivityPanel.jsx",
  "src/components/layout/NavPageLink.jsx",
  "src/components/admin/AdminSettingsSearch.jsx",
];
for (const p of files) {
  const raw = execSync(`node "${cli}" sandbox read ${p} --app-id 68dfcc5e57bbbc35387da97c --branch main --json`, { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
  const start = raw.indexOf("{");
  const data = JSON.parse(raw.slice(start));
  const content = data.files?.[0]?.content;
  if (!content) { console.log("EMPTY " + p); continue; }
  fs.mkdirSync(require("path").dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
  console.log("OK " + p + " " + content.length + "b");
}

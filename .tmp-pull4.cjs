const { execSync } = require("child_process");
const fs = require("fs");
const cli = "C:\\\\Users\\\\BrettHeinlein\\\\AppData\\\\Local\\\\npm-cache\\\\_npx\\\\ebe492f4494510c0\\\\node_modules\\\\base44\\\\bin\\\\run.js";
const files = [
  "src/components/layout/NavFlyoutMenu.jsx",
  "src/components/layout/PageLoading.jsx",
  "src/components/layout/SidebarNavGroup.jsx",
  "src/components/layout/navPreferences.js",
];
for (const p of files) {
  try {
    const raw = execSync(`node "${cli}" sandbox read ${p} --app-id 68dfcc5e57bbbc35387da97c --branch main --json`, { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
    const data = JSON.parse(raw.slice(raw.indexOf("{")));
    const content = data.files?.[0]?.content;
    if (!content) { console.log("EMPTY " + p); continue; }
    fs.writeFileSync(p, content);
    console.log("OK " + p + " " + content.length + "b");
  } catch (e) { console.log("FAIL " + p + " " + String(e.message).slice(0, 80)); }
}

const { execSync } = require("child_process");
const fs = require("fs");
const cli = "C:\\\\Users\\\\BrettHeinlein\\\\AppData\\\\Local\\\\npm-cache\\\\_npx\\\\ebe492f4494510c0\\\\node_modules\\\\base44\\\\bin\\\\run.js";
const pull = (p) => {
  const raw = execSync(`node "${cli}" sandbox read ${p} --app-id 68dfcc5e57bbbc35387da97c --branch main --json`, { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
  const data = JSON.parse(raw.slice(raw.indexOf("{")));
  const c = data.files?.[0]?.content;
  if (!c) { console.log("EMPTY " + p); return; }
  fs.writeFileSync(p, c);
  console.log("OK " + p + " " + c.length + "b");
};
pull("src/components/markup/projectCategorizer.jsx");

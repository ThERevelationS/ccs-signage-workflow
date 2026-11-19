const { spawnSync } = require("child_process");
const CLI = "C:\\Users\\BrettHeinlein\\AppData\\Local\\npm-cache\\_npx\\ebe492f4494510c0\\node_modules\\base44\\bin\\run.js";
const paths = JSON.parse(require("fs").readFileSync(".tmp-open-entities.json", "utf8"));
const NEW = `"read": {
      "$or": [
        {
          "user_condition": {
            "role": "admin"
          }
        },
        {
          "user_condition": {
            "role": "user"
          }
        }
      ]
    }`;
const edits = JSON.stringify([{ old_text: '"read": {}', new_text: NEW }]);
let failed = 0;
for (const p of paths) {
  const res = spawnSync("node", [CLI, "sandbox", "edit", p,
    "--app-id", "68dfcc5e57bbbc35387da97c", "--branch", "main", "--json"],
    { input: edits, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, timeout: 90000 });
  const out = (res.stdout || "") + (res.stderr || "");
  const ok = res.status === 0 && !/"error"/.test(out);
  console.log((ok ? "OK   " : "FAIL ") + p);
  if (!ok) { failed++; console.log(out.slice(-500)); }
}
console.log(`\n${paths.length - failed}/${paths.length} edits applied`);
process.exit(failed ? 1 : 0);

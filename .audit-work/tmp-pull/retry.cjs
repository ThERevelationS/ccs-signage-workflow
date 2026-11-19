const { execSync } = require("child_process");
const fs = require("fs");
const files = fs.readFileSync(".audit-work/tmp-pull/retry-list.txt","utf8").trim().split("\n");
const results = [];
for (const f of files) {
  try {
    const out = execSync(`node "${f}"`, { cwd: "D:/DevinProjects/ccs-signage-workflow-clean", timeout: 90000, encoding: "utf8", stdio: ["pipe","pipe","pipe"] });
    results.push(`PASS ${f}  | ${out.trim().split("\n").slice(-1)[0].slice(0,80)}`);
  } catch (e) {
    const out = (e.stdout||"") + (e.stderr||"");
    const lines = out.trim().split("\n").filter(l=>/FAIL|Error|error|assert/i.test(l)).slice(0,2);
    results.push(`FAIL ${f}  | ${lines.join(" || ").slice(0,140)}`);
  }
}
fs.writeFileSync(".audit-work/tmp-pull/retry-results.txt", results.join("\n"));
console.log(results.filter(r=>r.startsWith("PASS")).length + " PASS / " + results.filter(r=>r.startsWith("FAIL")).length + " FAIL of " + files.length);

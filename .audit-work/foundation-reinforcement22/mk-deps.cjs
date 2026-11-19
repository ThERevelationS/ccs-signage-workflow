// Cabinets/landscape — page-dependency source capture (real, non-stubbed
// modules the page bundle needs beyond the baseline texts). Read-only.
const { spawnSync } = require("child_process");
const path = require("path");
const fs = require("fs");
const cli = path.join(path.dirname(process.execPath), "node_modules/npm/bin/npx-cli.js");
const E = ".audit-work/foundation-reinforcement22/";
const APP = "68dfcc5e57bbbc35387da97c";
const PATHS = [
  "src/components/estimator/foundation/foundationBuilderRecovery.js",
  "src/components/estimator/foundation/foundationDraftRecovery.js",
  "src/components/estimator/foundation/foundationSaveSession.js",
  "src/components/estimator/foundation/foundationSyncRecovery.js",
  "src/components/estimator/foundation/foundationTemplateModel.js",
  "src/components/estimator/foundation/foundationLayoutModel.js",
  "src/components/estimator/foundation/convertToBrickStone.js",
  "src/components/estimator/builder/sourceProjectPersistence.js",
  "src/components/estimator/builder/builderMutationRecovery.js",
  "src/components/estimator/builder/builderEntityPersistence.js",
];
const run = (a) => spawnSync(process.execPath, [cli, "base44@latest", ...a, "--json"], { encoding: "utf8", timeout: 180000, maxBuffer: 24 * 1024 * 1024 });
const code = `const fs=require("fs"),cp=require("child_process"),crypto=require("crypto");
const out={head:cp.execSync("git rev-parse HEAD").toString().trim(),
files:${JSON.stringify(PATHS)}.map(path=>{const exists=fs.existsSync(path);
if(!exists)return {path,exists:false};
const buf=fs.readFileSync(path),text=buf.toString("utf8");
return {path,exists:true,content:text,hash:crypto.createHash("sha256").update(buf).digest("hex")};})};
console.log(JSON.stringify(out));`;
const seed = `p=$(mktemp /tmp/ccs-cabland-deps-XXXXXX.cjs) && printf %s ${Buffer.from(code).toString("base64")} | base64 -d > "$p" && node "$p"`;
const res = run(["sandbox", "run", seed, "--timeout-ms", "120000", "--app-id", APP, "--branch", "main"]);
if (res.status !== 0) { console.error("CLI FAIL", res.stdout, res.stderr); process.exit(2); }
const out = JSON.parse(res.stdout);
if (out.exitCode !== 0) { console.error("REMOTE FAIL", JSON.stringify(out)); process.exit(2); }
const snap = JSON.parse(out.stdout);
fs.writeFileSync(E + "cabinets-landscape-dependency-source.json", JSON.stringify(snap, null, 1));
console.log(JSON.stringify({ head: snap.head, missing: snap.files.filter(f => !f.exists).map(f => f.path), count: snap.files.length }, null, 1));

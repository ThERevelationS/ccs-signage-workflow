// Watch remote HEAD + dirty + latest commits; watch sibling artifact dirs.
const { spawnSync } = require("child_process");
const path = require("path"); const fs = require("fs");
const cli = path.join(path.dirname(process.execPath), "node_modules/npm/bin/npx-cli.js");
const APP = "68dfcc5e57bbbc35387da97c";
const SIB = ["maintenance-hardening","cnc-hardening","metal-hardening"];
const SIBPATHS = /signMaintenance|estimator\/cnc|estimator\/metal|MaintenanceEstimator|CNCEstimator|MetalEstimator/;
const log = (m) => { const line = new Date().toISOString().slice(11,19) + " " + m; console.log(line); fs.appendFileSync(".audit-work/laser-hardening/laser-head-poller.log", new Date().toISOString() + " " + m + "\n"); };
function remoteHead() {
  const seed = `git rev-parse HEAD && echo ---DIRTY--- && git status --porcelain && echo ---LOG--- && git log --name-only -2 --format=%H`;
  const r = spawnSync(process.execPath,[cli,"base44@latest","sandbox","run",seed,"--timeout-ms","60000","--app-id",APP,"--branch","main","--json"],{encoding:"utf8",timeout:120000});
  try { return JSON.parse(r.stdout); } catch { return { error: String(r.stdout).slice(0,200) + " | " + String(r.stderr).slice(0,200) }; }
}
function sibActivity() {
  const out = [];
  for (const d of SIB) {
    const dir = ".audit-work/" + d + "/";
    const recent = fs.readdirSync(dir).map(f => ({ f, t: fs.statSync(dir+f).mtimeMs }))
      .filter(x => Date.now() - x.t < 20*60*1000 && /sandbox|approval|checkpoint|baseline/.test(x.f))
      .sort((a,b)=>b.t-a.t).slice(0,3);
    for (const x of recent) out.push(d + "/" + x.f + "@" + new Date(x.t).toISOString().slice(11,19));
  }
  return out;
}
const cycles = parseInt(process.argv[2] || "6", 10);
(async () => {
  for (let i = 0; i < cycles; i++) {
    const r = remoteHead();
    if (r.error) { log(`poll${i}: CLI-ERR ${r.error}`); }
    else {
      const out = r.stdout || "";
      const head = out.split("\n")[0];
      const dirty = (out.split("---DIRTY---")[1]||"").split("---LOG---")[0].trim();
      const logPart = (out.split("---LOG---")[1]||"").trim();
      const sibTouched = logPart.split("\n").filter(l => SIBPATHS.test(l));
      log(`poll${i}: head=${head.slice(0,9)} dirty=${dirty === "" ? "clean" : JSON.stringify(dirty.slice(0,160))} sibTouchedInLast2Commits=${JSON.stringify(sibTouched)} sibArtifacts=${JSON.stringify(sibActivity())}`);
    }
    if (i < cycles - 1) await new Promise(r2 => setTimeout(r2, 75000));
  }
})();

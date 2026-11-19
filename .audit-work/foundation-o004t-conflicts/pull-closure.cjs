// Pull the remote import closure of seed files into remote-src/ preserving paths.
// Iterates: scan pulled files for `from "x"`/`import "x"` specifiers, resolve
// relative + `@/` (src/) paths, pull missing, repeat until stable.
// Read-only against the sandbox. Node-only files (no browser/React needed).
const { spawnSync } = require("child_process");
const path = require("path");
const fs = require("fs");

const E = __dirname + "/";
const APP = "68dfcc5e57bbbc35387da97c";
const outRoot = path.join(E, "remote-src");
const EXTS = ["", ".js", ".jsx", ".ts", ".tsx"];
const IDX = ["/index.js", "/index.jsx", "/index.ts", "/index.tsx"];

const seeds = process.argv.slice(2);
if (!seeds.length) { console.error("usage: node pull-closure.cjs <path>..."); process.exit(2); }

const have = new Set();
const pulled = new Set();
const failed = new Set();

const destFor = (p) => path.join(outRoot, p);
const exists = (p) => fs.existsSync(destFor(p));
const resolveLocal = (base) => {
  for (const ext of EXTS) { if (exists(base + ext)) return base + ext; }
  for (const idx of IDX) { if (exists(base + idx)) return base + idx; }
  return null;
};

function pull(remotePath) {
  const res = spawnSync("npx", ["base44@latest", "sandbox", "read", remotePath, "--app-id", APP, "--branch", "main", "--json"], {
    encoding: "utf8", timeout: 180000, maxBuffer: 32 * 1024 * 1024, shell: true,
  });
  const s = res.stdout || "";
  const i = s.indexOf("{");
  if (i < 0) { failed.add(remotePath); console.error("FAIL-NOJSON", remotePath); return null; }
  let j;
  try { j = JSON.parse(s.slice(i)); } catch { failed.add(remotePath); console.error("FAIL-PARSE", remotePath); return null; }
  const f = (j.files || [])[0];
  if (!f || f.content == null) { failed.add(remotePath); console.error("FAIL-EMPTY", remotePath); return null; }
  const dest = destFor(remotePath);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, f.content);
  pulled.add(remotePath);
  console.log("OK", remotePath, `${f.totalLines}L`);
  return f.content;
}

const SPEC_RE = /(?:import|export)[^'"]*?from\s+["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']|require\(\s*["']([^"']+)["']/g;
const depsOf = (content) => {
  const out = [];
  let m;
  while ((m = SPEC_RE.exec(content))) out.push(m[1] || m[2] || m[3]);
  return out;
};

const resolveDep = (importer, spec) => {
  if (spec.startsWith("@/")) return "src/" + spec.slice(2);
  if (spec.startsWith("./") || spec.startsWith("../")) {
    return path.posix.normalize(path.posix.join(path.posix.dirname(importer), spec));
  }
  return null; // bare package — external
};

// seed
for (const s of seeds) {
  const resolved = resolveLocal(s) || s;
  if (!exists(resolved)) pull(resolved);
  have.add(resolveLocal(s) || resolved);
}

let progressed = true;
let rounds = 0;
while (progressed && rounds < 12) {
  progressed = false;
  rounds += 1;
  for (const f of [...have]) {
    const content = fs.readFileSync(destFor(f), "utf8");
    for (const spec of depsOf(content)) {
      const base = resolveDep(f, spec);
      if (!base) continue;
      let resolved = resolveLocal(base);
      if (!resolved) {
        // try pulling candidates in order
        for (const ext of EXTS) {
          const cand = base + ext;
          if (failed.has(cand)) continue;
          const got = pull(cand);
          if (got !== null) { resolved = cand; break; }
        }
        if (!resolved) {
          for (const idx of IDX) {
            const cand = base + idx;
            if (failed.has(cand)) continue;
            const got = pull(cand);
            if (got !== null) { resolved = cand; break; }
          }
        }
        if (!resolved) { console.error("UNRESOLVED", spec, "from", f); continue; }
      }
      if (!have.has(resolved)) { have.add(resolved); progressed = true; }
    }
  }
}
console.log(`\nClosure: ${have.size} files in remote-src (${pulled.size} pulled this run, ${failed.size} failed)`);

// O-030 browser proof — 4 modes x 2 viewports; real calcProject candidate
// chain drives the page's diagnostics region markup (catalog alert / input
// alert / construction-checks status) plus ConcreteDeliveryPanel,
// FoundationItemCard and FoundationBOM. Origin-exact route guard, in-page
// fetch/XHR traps, __M stability, no SDK, no network, no writes — candidates
// are local audit artifacts only.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { createHash } from "node:crypto";
import * as esbuild from "esbuild";

const DIR = ".audit-work/foundation-o030-diagnostics/";
const SPEC = JSON.parse(fs.readFileSync(DIR + "o030-flow-proof-spec.json", "utf8"));
const seed = JSON.parse(fs.readFileSync(DIR + SPEC.fixtureArtifact, "utf8")).fixture;
const hash = (t) => createHash("sha256").update(t).digest("hex");

// ---------- frozen source map ----------
const baseline = JSON.parse(fs.readFileSync(DIR + SPEC.sourceArtifact, "utf8"));
assert.equal(baseline.head, SPEC.sourceHead, "baseline head");
const sources = new Map();
for (const f of baseline.files)
  if (f.text !== undefined) sources.set("/app/" + f.path, f.text);
const F = "/app/src/components/estimator/foundation/";
for (const [name, file] of Object.entries(SPEC.candidates)) {
  if (name === "FoundationEstimator.jsx") continue; // page is proven by the page harness; fixture mirrors its diagnostics markup
  sources.set(F + name, fs.readFileSync(DIR + file, "utf8"));
}
for (const [name, h] of Object.entries(SPEC.candidateHashes)) {
  if (name === "FoundationEstimator.jsx") continue;
  assert.equal(hash(sources.get(F + name)), h, "candidate " + name);
}
for (const rel of ["components/ui/input.jsx", "lib/utils.js"])
  sources.set("/app/src/" + rel, fs.readFileSync("src/" + rel, "utf8"));
const entry = "/app/o030-browser-entry.jsx";
sources.set(entry, fs.readFileSync(DIR + "o030-browser-fixture.jsx", "utf8"));

// lucide-react stub: every icon name imported anywhere in the frozen set.
const stubContents = (stubPath) => {
  const names = new Set();
  const escaped = stubPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  for (const text of sources.values()) {
    const re = new RegExp("import\\s*\\{([^}]*)\\}\\s*from\\s*[\"']" + escaped + "[\"']", "g");
    for (const m of text.matchAll(re))
      for (const raw of m[1].split(",")) {
        const n = raw.trim().split(/\s+as\s+/)[0].trim();
        if (n) names.add(n);
      }
  }
  return "export default ()=>null;\n" + [...names].map((n) => `export const ${n}=()=>null;`).join("\n");
};
const STUB_PREFIX = ["lucide-react"];

const loaded = {};
const plug = { name: "frozen", setup(b) {
  b.onResolve({ filter: /.*/ }, (a) => {
    if (STUB_PREFIX.some((k) => a.path.startsWith(k))) return { path: "s:" + a.path, namespace: "s" };
    let base;
    if (a.path.startsWith("/app/")) base = a.path;
    else if (a.path.startsWith("@/")) base = "/app/src/" + a.path.slice(2);
    else if (a.path.startsWith(".")) {
      if (!a.importer.startsWith("/app")) return null;
      base = path.posix.resolve(path.posix.dirname(a.importer), a.path);
    } else return null;
    const resolved = [base, base + ".js", base + ".jsx"].find((p) => sources.has(p));
    if (!resolved) throw Error("Missing frozen source; held local work forbidden: " + a.path + " from " + a.importer);
    return { path: resolved, namespace: "frozen" };
  });
  b.onLoad({ filter: /.*/, namespace: "s" }, (a) => ({
    contents: stubContents(a.path.slice(2)), loader: "jsx", resolveDir: path.resolve(".") }));
  b.onLoad({ filter: /.*/, namespace: "frozen" }, (a) => {
    const contents = sources.get(a.path);
    loaded[a.path] = hash(contents);
    return { contents, loader: a.path.endsWith(".jsx") ? "jsx" : "js", resolveDir: path.resolve(".") };
  });
}};
const build = await esbuild.build({
  entryPoints: [entry], bundle: true, platform: "browser", format: "esm",
  write: false, metafile: true, logLevel: "silent", jsx: "automatic",
  plugins: [plug],
});
assert.deepEqual(build.warnings, []);
for (const name of ["foundationConstructionChecks.js", "foundationCalc.js"])
  assert.equal(loaded[F + name], SPEC.candidateHashes[name], "candidate loaded " + name);
assert.ok(!Object.keys(build.metafile.inputs).some((f) => /base44Client/.test(f)), "no SDK in bundle");
const importEdges = [];
for (const [out, info] of Object.entries(build.metafile.outputs))
  for (const imp of info.imports || []) importEdges.push({ output: out, ...imp });
assert.deepEqual(importEdges, [], "fully bundled — no external import edges");
fs.writeFileSync(DIR + "o030-browser-meta.json", JSON.stringify({ inputs: Object.keys(build.metafile.inputs), loaded, importEdges }, null, 2));

// ---------- CSS ----------
const { spawnSync } = await import("node:child_process");
const css = spawnSync(process.execPath, ["node_modules/tailwindcss/lib/cli.js",
  "-i", "src/index.css", "-o", DIR + "o030-browser.css",
  "--content", [DIR + "o030-browser-fixture.jsx",
    DIR + "o030-candidate-foundationCalc.js",
    DIR + "o030-candidate-foundationConstructionChecks.js",
    DIR + "remote-src/src/components/estimator/foundation/ConcreteDeliveryPanel.jsx",
    DIR + "remote-src/src/components/estimator/foundation/FoundationItemCard.jsx",
    DIR + "remote-src/src/components/estimator/foundation/FoundationBOM.jsx",
    "src/components/ui/input.jsx"].join(",")],
  { encoding: "buffer" });
fs.writeFileSync(DIR + "o030-browser-css-log.txt", Buffer.concat([css.stdout, css.stderr || Buffer.alloc(0)]));
assert.equal(css.status, 0, "tailwind build failed");

// ---------- fixture server ----------
const html = `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/app.css"></head>
<body><div id="root"></div>
<script>window.__SEED=${JSON.stringify(seed).replace(/</g, "\\u003c")};</script>
<script type="module" src="/bundle.js"></script></body></html>`;
const server = http.createServer((req, res) => {
  if (req.url === "/" || req.url.startsWith("/?")) { res.setHeader("content-type", "text/html"); res.end(html); }
  else if (req.url === "/app.css") { res.setHeader("content-type", "text/css"); res.end(fs.readFileSync(DIR + "o030-browser.css")); }
  else if (req.url === "/bundle.js") { res.setHeader("content-type", "text/javascript"); res.end(build.outputFiles[0].contents); }
  else res.end("");
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const port = server.address().port;
const baseOrigin = `http://127.0.0.1:${port}`;
fs.writeFileSync(DIR + "o030-browser-runtime.json",
  JSON.stringify({ port, pid: process.pid, startedAt: new Date().toISOString() }, null, 2));

// ---------- browser ----------
const { chromium } = await import("playwright-core");
const browser = await chromium.launch({
  executablePath: "C:/Users/BrettHeinlein/AppData/Local/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-win64/chrome-headless-shell.exe",
  args: ["--disable-gpu", "--no-sandbox"] });
const results = [];
const check = async (id, fn) => {
  try { await fn(); results.push({ id, ok: true }); console.log("ok " + id); }
  catch (e) { results.push({ id, ok: false, error: String(e.stack || e).slice(0, 900) }); console.log("FAIL " + id + " :: " + String(e.message || e).slice(0, 300)); }
};

const MODES = [
  { id: "advisory-spoil", expectAlerts: 0,
    codes: ["excavation_spoil_unaccounted"],
    texts: ["Construction checks — verify before build", "spoil"] },
  { id: "advisory-set", expectAlerts: 0,
    codes: ["excavation_spoil_unaccounted", "excavation_equipment_unpriced",
      "forming_without_finishing", "admixture_rebar_corrosion",
      "admixture_set_pace_conflict", "mix_admixture_pace_conflict"],
    texts: ["Construction checks — verify before build", "corrode", "retard"] },
  { id: "advisory-bagged", expectAlerts: 0,
    codes: ["excavation_spoil_unaccounted", "admixtures_without_ready_mix"],
    texts: ["Construction checks — verify before build", "bagged"] },
  { id: "blocked-advisory", expectAlerts: 1, expectBlocked: true,
    codes: ["forming_without_finishing"],
    texts: ["Construction checks — verify before build"],
    alertTexts: ["Design input required"] },
];
const VIEWS = [{ width: 1280, height: 900 }, { width: 390, height: 844 }];

for (const mode of MODES) for (const vp of VIEWS) {
  const caseId = mode.id + " " + vp.width;
  await check(caseId, async () => {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    const page = await ctx.newPage();
    const externalUrls = [], consoleErrors = [], keyWarnings = [];
    await ctx.addInitScript(() => {
      window.__netOps = { fetch: 0, xhr: 0 };
      window.fetch = () => { window.__netOps.fetch++; throw new Error("Unexpected network access in o030 browser proof"); };
      const X = window.XMLHttpRequest;
      window.XMLHttpRequest = function () { window.__netOps.xhr++; throw new Error("Unexpected XHR in o030 browser proof"); };
    });
    await page.route("**/*", (route) => {
      const u = new URL(route.request().url());
      if (u.origin === baseOrigin) return route.continue();
      externalUrls.push(u.href); return route.abort();
    });
    page.on("console", (m) => {
      if (m.type() === "error") consoleErrors.push(m.text());
      if (/same key|duplicate key/i.test(m.text())) keyWarnings.push(m.text());
    });
    page.on("pageerror", (e) => consoleErrors.push(String(e)));
    await page.goto(`${baseOrigin}/?case=${mode.id}`, { waitUntil: "networkidle" });
    await page.waitForSelector('[data-testid="delivery-panel"]', { timeout: 10000 });
    await page.waitForSelector('[data-testid="item-card-0"]', { timeout: 10000 });

    const before = await page.evaluate("window.__M");
    const warningsEl = page.locator('[data-testid="construction-warnings"]');
    const alertCount = await page.locator('[role="alert"]').count();
    assert.equal(alertCount, mode.expectAlerts, "alert count " + caseId);

    // The advisory surface renders only when warnings exist.
    assert.equal(await warningsEl.count(), mode.codes.length ? 1 : 0, "warnings surface " + caseId);
    const statusText = await warningsEl.innerText();
    for (const t of mode.texts) assert.ok(statusText.includes(t), "status text: " + t + " in " + statusText.slice(0, 400));
    const liCount = await warningsEl.locator("li").count();
    assert.equal(liCount, mode.codes.length, "warning li count " + caseId + " got " + liCount);

    // Codes come straight from the calc channel — same list, same order.
    assert.deepEqual((before.constructionWarnings || []).map((w) => w.code), mode.codes, "codes " + caseId);

    // Advisory text never appears inside an alert role.
    const alertText = alertCount ? await page.locator('[role="alert"]').first().innerText() : "";
    if (alertCount) {
      for (const t of mode.alertTexts || []) assert.ok(alertText.includes(t), "alert text: " + t + " in " + alertText.slice(0, 400));
      for (const w of before.constructionWarnings) assert.ok(!alertText.includes(w.message), "warning not in alert " + w.code);
      assert.equal(Boolean(before.pricingUnavailable), true, "blocked mode flags " + caseId);
      assert.equal(before.itemPricing[0].available, false, "held item pricing " + caseId);
      assert.ok(before.constructionWarnings.length > 0, "advisories still render beside an alert " + caseId);
    } else {
      assert.equal(Boolean(before.pricingUnavailable), false, "advisory mode not blocked " + caseId);
      assert.equal(before.itemPricing[0].available, true, "item pricing live " + caseId);
      assert.ok(Number.isFinite(before.totals.grand_total), "grand_total finite " + caseId);
    }

    // Layout: no horizontal overflow
    const overflow = await page.evaluate("document.documentElement.scrollWidth > window.innerWidth");
    assert.equal(overflow, false, "no horizontal overflow at " + vp.width);

    const png = DIR + `o030-browser-${mode.id}-${vp.width}.png`;
    await page.screenshot({ path: png, fullPage: true });

    const after = await page.evaluate("window.__M");
    assert.deepEqual(after, before, "full __M stable");
    assert.equal(after.writes, 0, "no writes");

    const netOps = await page.evaluate("window.__netOps");
    assert.equal(netOps.fetch, 0); assert.equal(netOps.xhr, 0);
    assert.equal(externalUrls.length, 0, "external urls " + externalUrls.slice(0, 2).join(","));
    assert.equal(consoleErrors.length, 0, "console errors: " + consoleErrors.slice(0, 2).join("|"));
    assert.equal(keyWarnings.length, 0, "duplicate keys");
    fs.writeFileSync(DIR + `o030-browser-${mode.id}-${vp.width}-snapshot.json`,
      JSON.stringify({ mode: mode.id, width: vp.width, before, after, writes: after.writes, netOps, externalUrls, consoleErrors, keyWarnings }, null, 2));
    await ctx.close();
  });
}
await browser.close();
await new Promise((r) => server.close(r));
fs.writeFileSync(DIR + "o030-browser-verification.json", JSON.stringify(results, null, 2));
const failed = results.filter((r) => !r.ok);
console.log(failed.length ? `FAIL o030-browser ${results.length - failed.length}/${results.length}` : `PASS o030-browser ${results.length}/${results.length}`);
process.exit(failed.length ? 1 : 0);

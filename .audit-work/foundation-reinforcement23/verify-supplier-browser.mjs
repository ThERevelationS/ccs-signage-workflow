// Supplier-defaults availability hardening — browser proof (7 modes x 2
// viewports; 3 candidates). Mirrors the equipment/masonry browser recipes:
// origin-exact route guard, in-page fetch/XHR traps, BOM delivery row + banner
// assertions, disabled catalog controls under the hold, __M stability.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import * as esbuild from "esbuild";

const DIR = ".audit-work/foundation-reinforcement23/";
const SPEC = JSON.parse(fs.readFileSync(DIR + "supplier-defaults-flow-proof-spec.json", "utf8"));
const seed = JSON.parse(fs.readFileSync(DIR + SPEC.fixtureArtifact, "utf8")).fixture;
const hash = (t) => createHash("sha256").update(t).digest("hex");
const read = (n) => JSON.parse(fs.readFileSync(DIR + n, "utf8"));

// ---------- frozen source map ----------
const sources = new Map();
for (const f of read(SPEC.dependencyArtifact).files) sources.set("/app/" + f.path, f.content);
const scopeArt = read(SPEC.sourceArtifact);
assert.equal(scopeArt.head, SPEC.sourceHead, "source artifact head");
for (const f of scopeArt.files)
  if (f.text !== undefined) sources.set("/app/" + f.path, f.text);
const F = "/app/src/components/estimator/foundation/";
for (const [name, file] of Object.entries(SPEC.candidates))
  sources.set(F + name, fs.readFileSync(DIR + file, "utf8"));
for (const [name, h] of Object.entries(SPEC.candidateHashes))
  assert.equal(hash(sources.get(F + name)), h, "candidate " + name);
for (const rel of ["components/ui/button.jsx", "components/ui/card.jsx", "components/ui/select.jsx",
    "components/ui/checkbox.jsx", "components/ui/badge.jsx", "components/ui/label.jsx",
    "components/ui/input.jsx", "lib/utils.js"])
  sources.set("/app/src/" + rel, fs.readFileSync("src/" + rel, "utf8"));
const entry = "/app/supplier-browser-entry.jsx";
sources.set(entry, fs.readFileSync(DIR + "supplier-defaults-browser-fixture.jsx", "utf8"));

const loaded = {};
const plug = { name: "frozen", setup(b) {
  b.onResolve({ filter: /.*/ }, (a) => {
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
for (const [name, h] of Object.entries(SPEC.candidateHashes))
  assert.equal(loaded[F + name], h, "candidate loaded " + name);
assert.ok(!Object.keys(build.metafile.inputs).some((f) => /base44Client/.test(f)), "no SDK in bundle");
const importEdges = [];
for (const [out, info] of Object.entries(build.metafile.outputs))
  for (const imp of info.imports || []) importEdges.push({ output: out, ...imp });
assert.deepEqual(importEdges, [], "fully bundled — no external import edges");
fs.writeFileSync(DIR + "supplier-browser-meta.json", JSON.stringify({ inputs: Object.keys(build.metafile.inputs), loaded, importEdges }, null, 2));

// ---------- CSS ----------
const css = spawnSync(process.execPath, ["node_modules/tailwindcss/lib/cli.js",
  "-i", "src/index.css", "-o", DIR + "supplier-defaults-browser.css",
  "--content", [DIR + "supplier-defaults-browser-fixture.jsx",
    DIR + "supplier-defaults-candidate-ConcreteDeliveryPanel.jsx",
    DIR + "supplier-defaults-candidate-foundationCalc.js",
    DIR + "supplier-defaults-candidate-legacyFoundationCalc.js",
    "src/components/ui/button.jsx", "src/components/ui/card.jsx", "src/components/ui/select.jsx",
    "src/components/ui/checkbox.jsx", "src/components/ui/badge.jsx", "src/components/ui/label.jsx",
    "src/components/ui/input.jsx",
    DIR + "remote-src/src/components/estimator/foundation/FoundationBOM.jsx"].join(",")],
  { encoding: "buffer" });
fs.writeFileSync(DIR + "supplier-defaults-browser-css-log.txt", Buffer.concat([css.stdout, css.stderr || Buffer.alloc(0)]));
assert.equal(css.status, 0, "tailwind build failed");

// ---------- fixture server ----------
const html = `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/app.css"></head>
<body><div id="root"></div>
<script>window.__SEED=${JSON.stringify(seed).replace(/</g, "\\u003c")};</script>
<script type="module" src="/bundle.js"></script></body></html>`;
const server = http.createServer((req, res) => {
  if (req.url === "/" || req.url.startsWith("/?")) { res.setHeader("content-type", "text/html"); res.end(html); }
  else if (req.url === "/app.css") { res.setHeader("content-type", "text/css"); res.end(fs.readFileSync(DIR + "supplier-defaults-browser.css")); }
  else if (req.url === "/bundle.js") { res.setHeader("content-type", "text/javascript"); res.end(build.outputFiles[0].contents); }
  else res.end("");
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const port = server.address().port;
const baseOrigin = `http://127.0.0.1:${port}`;
fs.writeFileSync(DIR + "supplier-defaults-browser-runtime.json",
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

for (const mode of SPEC.browserModes) for (const vp of SPEC.viewports) {
  const caseId = mode.id + " " + vp.width;
  await check(caseId, async () => {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    const page = await ctx.newPage();
    const externalUrls = [], consoleErrors = [], keyWarnings = [];
    await ctx.addInitScript(() => {
      window.__netOps = { fetch: 0, xhr: 0 };
      window.fetch = () => { window.__netOps.fetch++; throw new Error("Unexpected network access in supplier browser proof"); };
      const X = window.XMLHttpRequest;
      window.XMLHttpRequest = function () { window.__netOps.xhr++; throw new Error("Unexpected XHR in supplier browser proof"); };
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

    const panel = page.locator('[data-testid="delivery-panel"]');
    const bom = page.locator('[data-testid="bom"]');
    const panelText = await panel.innerText();
    const bomText = await bom.innerText();
    const before = await page.evaluate("window.__M");

    // Panel assertions (scoped)
    for (const t of mode.panelTexts || []) assert.ok(panelText.includes(t), "panel text: " + t + " in " + panelText.slice(0, 300));
    const savedNotice = panelText.includes("Saved amounts (not current pricing)");
    assert.equal(savedNotice, Boolean(mode.pricingUnavailable), "saved notice " + mode.id);

    // Catalog controls are disabled while held — no silent re-selection.
    const mixSelect = panel.locator("select").first();
    assert.equal(await mixSelect.isDisabled(), Boolean(mode.pricingUnavailable), "mix select disabled " + mode.id);
    const admixBoxes = panel.locator('input[type="checkbox"]');
    const boxCount = await admixBoxes.count();
    if (mode.pricingUnavailable) {
      for (let i = 0; i < boxCount; i++)
        assert.ok(await admixBoxes.nth(i).isDisabled(), "admix checkbox " + i + " disabled");
    } else assert.ok(boxCount > 0, "admix checkboxes render when available");

    // BOM: the delivery row is the only row; it flips to the saved form and
    // "Not saved" cells when nothing is acknowledged.
    const trs = bom.locator("tbody tr");
    assert.equal(await trs.count(), 1, "bom row count " + mode.id);
    if (mode.bomRow) {
      const tds = trs.nth(0).locator("td");
      assert.deepEqual(
        [await tds.nth(0).innerText(), await tds.nth(1).innerText(), await tds.nth(2).innerText()],
        mode.bomRow, "bom delivery row " + mode.id);
    }
    const bannerVisible = bomText.includes("Pricing unavailable");
    assert.equal(bannerVisible, Boolean(mode.pricingUnavailable), "BOM banner " + mode.id);
    assert.equal(Boolean(before.pricingUnavailable), Boolean(mode.pricingUnavailable), "__M flag " + mode.id);

    // Supplier issue codes land in the merged catalog gate once.
    if (mode.catalogIssueCodes) {
      const issues = before.catalogIssues || [];
      for (const c of mode.catalogIssueCodes) {
        assert.equal(issues.filter((x) => x.code === c).length, 1, "exactly one " + c + " got " + JSON.stringify(issues));
        assert.ok(issues.some((x) => x.code === c && x.kind === "concrete_delivery"), c + " tagged concrete_delivery");
      }
      assert.equal(before.delivery.pricingUnavailable, true, "delivery held " + mode.id);
      assert.ok((before.itemPricing || []).every((x) => x.available !== false), "delivery issue does not block the item card");
    }

    // Item inputs are unaffected — only supplier availability is held.
    assert.equal(before.totals.total_excavation_cost, 88.88888888888889, "items still price under the hold");

    // Layout: no horizontal overflow
    const overflow = await page.evaluate("document.documentElement.scrollWidth > window.innerWidth");
    assert.equal(overflow, false, "no horizontal overflow at " + vp.width);

    const png = DIR + `supplier-defaults-browser-${mode.id}-${vp.width}.png`;
    await page.screenshot({ path: png, fullPage: true });

    const after = await page.evaluate("window.__M");
    assert.deepEqual(after, before, "full __M stable");
    assert.equal(after.writes, 0, "no writes");

    const netOps = await page.evaluate("window.__netOps");
    assert.equal(netOps.fetch, 0); assert.equal(netOps.xhr, 0);
    assert.equal(externalUrls.length, 0, "external urls " + externalUrls.slice(0, 2).join(","));
    assert.equal(consoleErrors.length, 0, "console errors: " + consoleErrors.slice(0, 2).join("|"));
    assert.equal(keyWarnings.length, 0, "duplicate keys");
    fs.writeFileSync(DIR + `supplier-defaults-browser-${mode.id}-${vp.width}-snapshot.json`,
      JSON.stringify({ mode: mode.id, width: vp.width, before, after, writes: after.writes, netOps, externalUrls, consoleErrors, keyWarnings }, null, 2));
    await ctx.close();
  });
}
await browser.close();
assert.equal(results.length, SPEC.browserCaseCount, "case count " + SPEC.browserCaseCount);
const okCount = results.filter((r) => r.ok).length;
fs.writeFileSync(DIR + "supplier-defaults-browser-verification.json", JSON.stringify({ results, port, pid: process.pid }, null, 2));
console.log(`supplier-browser passed=${okCount} failed=${results.length - okCount}`);
server.close();
if (okCount !== results.length) process.exit(1);

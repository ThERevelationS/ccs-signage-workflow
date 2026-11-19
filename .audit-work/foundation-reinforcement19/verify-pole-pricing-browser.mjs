// Pole-pricing availability — browser proof (6 modes x 2 viewports; 5 candidates).
// Mirrors the masonry-outline browser recipe: origin-exact route guard,
// in-page fetch/XHR traps, BOM triplets, aria linkage, __M stability.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import * as esbuild from "esbuild";

const DIR = ".audit-work/foundation-reinforcement19/";
const SPEC = JSON.parse(fs.readFileSync(DIR + "pole-pricing-flow-proof-spec.json", "utf8"));
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
  if (name !== "FoundationEstimator.jsx")
    sources.set(F + name, fs.readFileSync(DIR + file, "utf8"));
for (const [name, h] of Object.entries(SPEC.candidateHashes))
  if (name !== "FoundationEstimator.jsx")
    assert.equal(hash(sources.get(F + name)), h, "candidate " + name);
for (const rel of ["components/ui/button.jsx", "components/ui/input.jsx", "lib/utils.js"])
  sources.set("/app/src/" + rel, fs.readFileSync("src/" + rel, "utf8"));
const entry = "/app/pole-browser-entry.jsx";
sources.set(entry, fs.readFileSync(DIR + "pole-pricing-browser-fixture.jsx", "utf8"));

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
  if (name !== "FoundationEstimator.jsx")
    assert.equal(loaded[F + name], h, "candidate loaded " + name);
assert.ok(!Object.keys(build.metafile.inputs).some((f) => /base44Client/.test(f)), "no SDK in bundle");
const importEdges = [];
for (const [out, info] of Object.entries(build.metafile.outputs))
  for (const imp of info.imports || []) importEdges.push({ output: out, ...imp });
assert.deepEqual(importEdges, [], "fully bundled — no external import edges");
fs.writeFileSync(DIR + "pole-pricing-browser-meta.json", JSON.stringify({ inputs: Object.keys(build.metafile.inputs), loaded, importEdges }, null, 2));

// ---------- CSS ----------
const css = spawnSync(process.execPath, ["node_modules/tailwindcss/lib/cli.js",
  "-i", "src/index.css", "-o", DIR + "pole-pricing-browser.css",
  "--content", [DIR + "pole-pricing-browser-fixture.jsx",
    DIR + "pole-pricing-candidate-FoundationPolesPanel.jsx",
    DIR + "pole-pricing-candidate-FoundationBOM.jsx",
    DIR + "pole-pricing-candidate-foundationCalc.js",
    "src/components/ui/button.jsx", "src/components/ui/input.jsx"].join(",")],
  { encoding: "buffer" });
fs.writeFileSync(DIR + "pole-pricing-browser-css-log.txt", Buffer.concat([css.stdout, css.stderr || Buffer.alloc(0)]));
assert.equal(css.status, 0, "tailwind build failed");

// ---------- fixture server ----------
const html = `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/app.css"></head>
<body><div id="root"></div>
<script>window.__SEED=${JSON.stringify(seed).replace(/</g, "\\u003c")};</script>
<script type="module" src="/bundle.js"></script></body></html>`;
const server = http.createServer((req, res) => {
  if (req.url === "/" || req.url.startsWith("/?")) { res.setHeader("content-type", "text/html"); res.end(html); }
  else if (req.url === "/app.css") { res.setHeader("content-type", "text/css"); res.end(fs.readFileSync(DIR + "pole-pricing-browser.css")); }
  else if (req.url === "/bundle.js") { res.setHeader("content-type", "text/javascript"); res.end(build.outputFiles[0].contents); }
  else res.end("");
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const port = server.address().port;
const baseOrigin = `http://127.0.0.1:${port}`;
fs.writeFileSync(DIR + "pole-pricing-browser-runtime.json",
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
      window.fetch = () => { window.__netOps.fetch++; throw new Error("Unexpected network access in pole browser proof"); };
      const X = window.XMLHttpRequest;
      window.XMLHttpRequest = function () { window.__netOps.xhr++; throw new Error("Unexpected XHR in pole browser proof"); };
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
    await page.waitForSelector('[data-testid="poles-panel"]', { timeout: 10000 });

    const panel = page.locator('[data-testid="poles-panel"]');
    const bom = page.locator('[data-testid="bom"]');
    const panelText = await panel.innerText();
    const bomText = await bom.innerText();
    const before = await page.evaluate("window.__M");

    // Panel assertions (scoped)
    for (const t of mode.panelTexts || []) assert.ok(panelText.includes(t), "panel text: " + t);
    const savedNotice = panelText.includes("Saved amounts (not current pricing)");
    assert.equal(savedNotice, Boolean(mode.pricingUnavailable), "saved notice " + mode.id);

    // BOM exact rows
    const expectedRows = mode.bomRows;
    assert.ok(expectedRows, "row spec " + mode.id);
    const trs = bom.locator("tbody tr");
    assert.equal(await trs.count(), expectedRows.length, "bom row count");
    for (let i = 0; i < expectedRows.length; i++) {
      const tds = trs.nth(i).locator("td");
      assert.equal(await tds.count(), 3, "row td count " + i);
      const actual = [];
      for (let j = 0; j < 3; j++) actual.push(await tds.nth(j).innerText());
      assert.deepEqual(actual, expectedRows[i], "bom row " + i);
    }
    if (mode.forbiddenAmount) assert.ok(!bomText.includes(mode.forbiddenAmount) && !panelText.includes(mode.forbiddenAmount), "forbidden " + mode.forbiddenAmount);
    const bannerVisible = bomText.includes("Pricing unavailable");
    assert.equal(bannerVisible, Boolean(mode.pricingUnavailable), "BOM banner " + mode.id);
    assert.equal(Boolean(before.pricingUnavailable), Boolean(mode.pricingUnavailable), "__M flag " + mode.id);

    // pole diagnostics: issue codes in __M
    if (mode.poleIssueCodes) {
      const codes = (before.catalogIssues || []).map((x) => x.code);
      for (const c of mode.poleIssueCodes) assert.ok(codes.includes(c), "pole issue " + c + " got " + codes);
    }
    // aria linkage on the invalid field + rendered diagnostic
    if (mode.invalidField) {
      const field = page.locator(mode.invalidField.selector).nth(mode.invalidField.nth || 0);
      assert.equal(await field.getAttribute("aria-invalid"), "true", "aria-invalid on " + mode.invalidField.selector);
      const did = await field.getAttribute("aria-describedby");
      assert.equal(did, mode.invalidField.describedBy, "aria-describedby target");
      const diag = page.locator("#" + mode.invalidField.describedBy);
      assert.ok(await diag.isVisible(), "diagnostic visible");
      assert.ok((await diag.innerText()).trim().length > 0, "diagnostic text");
    }

    // invalid draft: blank height input preserves "" (never 0), holds, blocks
    if (mode.heightInteraction) {
      const height = panel.locator('input[aria-label="Pole 1 height above grade (inches)"]');
      const calcBefore = { project: before.project, poles: before.poles, totals: before.totals, catalogIssues: before.catalogIssues };
      await height.fill("");
      const m2 = await page.evaluate("window.__M");
      assert.equal(m2.project.poles[0].height_inches, "", "blank preserved, never coerced to 0");
      assert.equal(m2.poles[0].pole_cost, 999, "held acknowledged pole_cost");
      assert.equal(m2.pricingUnavailable, true, "banner flag after invalid draft");
      assert.equal(await height.getAttribute("aria-invalid"), "true", "height aria-invalid");
      assert.equal(await height.getAttribute("aria-describedby"), "pole-0-pricing");
      const diag = page.locator("#pole-0-pricing");
      assert.ok((await diag.innerText()).includes("height"), "height diagnostic text");
      const banner = page.locator('[data-testid="bom"] >> text=Pricing unavailable').first();
      assert.ok(await banner.isVisible(), "BOM banner appears after invalid draft");
      // re-enter a valid number to confirm recovery to live pricing
      await height.fill("120");
      const m3 = await page.evaluate("window.__M");
      assert.equal(m3.project.poles[0].height_inches, 120, "number stored as number");
      assert.equal(m3.poles[0].pole_cost, 250, "repriced after repair");
      assert.equal(m3.pricingUnavailable, false, "banner cleared");
    }

    // Layout: padding >= 12px on td edges; no horizontal overflow
    const pads = await page.evaluate(() => {
      const tds = [...document.querySelectorAll('[data-testid="bom"] tbody td')].slice(0, 3);
      return tds.map((el) => ({ pl: getComputedStyle(el).paddingLeft, pr: getComputedStyle(el).paddingRight }));
    });
    assert.ok(parseFloat(pads[0].pr) >= 12, "material td right padding " + pads[0].pr);
    assert.ok(parseFloat(pads[1].pr) >= 12, "qty td right padding " + pads[1].pr);
    assert.ok(parseFloat(pads[2].pl) >= 12, "cost td left padding " + pads[2].pl);
    const overflow = await page.evaluate("document.documentElement.scrollWidth > window.innerWidth");
    assert.equal(overflow, false, "no horizontal overflow at " + vp.width);

    const png = DIR + `pole-pricing-browser-${mode.id}-${vp.width}.png`;
    await page.screenshot({ path: png, fullPage: true });

    const after = await page.evaluate("window.__M");
    if (mode.heightInteraction) {
      for (const k of ["savedProject", "inventory", "settings", "mode", "writes"])
        assert.deepEqual(after[k], before[k], "stable " + k);
    } else assert.deepEqual(after, before, "full __M stable");
    assert.equal(after.writes, 0, "no writes");

    const netOps = await page.evaluate("window.__netOps");
    assert.equal(netOps.fetch, 0); assert.equal(netOps.xhr, 0);
    assert.equal(externalUrls.length, 0, "external urls " + externalUrls.slice(0, 2).join(","));
    assert.equal(consoleErrors.length, 0, "console errors: " + consoleErrors.slice(0, 2).join("|"));
    assert.equal(keyWarnings.length, 0, "duplicate keys");
    fs.writeFileSync(DIR + `pole-pricing-browser-${mode.id}-${vp.width}-snapshot.json`,
      JSON.stringify({ mode: mode.id, width: vp.width, before, after, writes: after.writes, netOps, externalUrls, consoleErrors, keyWarnings }, null, 2));
    await ctx.close();
  });
}
await browser.close();
assert.equal(results.length, SPEC.browserCaseCount, "case count " + SPEC.browserCaseCount);
const okCount = results.filter((r) => r.ok).length;
fs.writeFileSync(DIR + "pole-pricing-browser-verification.json", JSON.stringify({ results, port, pid: process.pid }, null, 2));
console.log(`pole-pricing-browser passed=${okCount} failed=${results.length - okCount}`);
if (okCount !== results.length) { server.close(); process.exit(1); }

// Masonry dimensions — browser proof (5 modes x 2 viewports; single candidate: dimensions wallCalculator).
// triplets from that specification, origin-exact route guard,
// in-page fetch/XHR traps, full __M before/after deepEqual.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import * as esbuild from "esbuild";

const DIR = ".audit-work/foundation-reinforcement18/";
const SPEC = JSON.parse(fs.readFileSync(DIR + "masonry-dimensions-flow-proof-spec.json", "utf8"));
const seed = JSON.parse(fs.readFileSync(DIR + SPEC.fixtureArtifact, "utf8")).fixture;
const innerFixture = JSON.parse(fs.readFileSync(DIR + SPEC.innerFixtureArtifact, "utf8")).rows.find((r) => r.name === SPEC.innerFixtureRowName).fixture;
const hash = (t) => createHash("sha256").update(t).digest("hex");
const read = (n) => JSON.parse(fs.readFileSync(DIR + n, "utf8"));

// ---------- frozen source map ----------
const sources = new Map();
for (const artifact of ["wall-cap-physical-source.json", "wall-cap-geometry-remote-validation.json", "masonry-material-pole-source.json", "masonry-rates-panel-source.json"])
  for (const f of read(artifact).files) sources.set("/app/" + f.path, f.content);
const scopeArt = read(SPEC.sourceArtifact);
assert.equal(scopeArt.head, SPEC.sourceHead, "source artifact head");
for (const f of scopeArt.files)
  sources.set("/app/" + f.path, f.text ?? f.normalized);

sources.set("/app/src/components/estimator/foundation/wallCalculator.js", fs.readFileSync(DIR + SPEC.candidateCalculator, "utf8"));
assert.equal(hash(sources.get("/app/src/components/estimator/foundation/wallCalculator.js")), SPEC.candidateHash, "calc candidate");
assert.equal(hash(sources.get("/app/src/components/estimator/foundation/FoundationWallsPanel.jsx")), SPEC.appliedPanelHash, "applied Panel");
assert.equal(hash(sources.get("/app/src/components/estimator/foundation/FoundationBOM.jsx")), "688323df8427d019f1b9da8371b4f6a30f65d24963fb913589ce84ae93fc5432", "applied BOM");
assert.equal(hash(sources.get("/app/src/components/estimator/foundation/foundationCalc.js")), "74d8b5a0ff5dd7d677c9e060879298f673530bfb7b15e83c7a16d45dc8fd9747", "applied calc");
assert.equal(hash(sources.get("/app/src/components/estimator/foundation/foundationCatalogIntegrity.js")), "702f1405b1cae1256da4eda2e7ed4d50085a5be1b4cd3324cf232a84938eca4e", "applied catalog");
for (const rel of ["components/ui/button.jsx", "components/ui/input.jsx", "lib/utils.js"])
  sources.set("/app/src/" + rel, fs.readFileSync("src/" + rel, "utf8"));
sources.set("/app/src/components/estimator/foundation/WallShapeEditor.jsx",
  'export default function WallShapeEditor(){ return null; }\n');
const entry = "/app/masonry-browser-entry.jsx";
sources.set(entry, fs.readFileSync(DIR + "masonry-dimensions-browser-fixture.jsx", "utf8"));

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
assert.ok(loaded["/app/src/components/estimator/foundation/wallCalculator.js"]);
assert.ok(!Object.keys(build.metafile.inputs).some((f) => /base44Client/.test(f)), "no SDK in bundle");
const importEdges = [];
for (const [out, info] of Object.entries(build.metafile.outputs))
  for (const imp of info.imports || []) importEdges.push({ output: out, ...imp });
assert.deepEqual(importEdges, [], "fully bundled — no external import edges");
fs.writeFileSync(DIR + "masonry-dimensions-browser-meta.json", JSON.stringify({ inputs: Object.keys(build.metafile.inputs), loaded, importEdges }, null, 2));

// ---------- CSS ----------
const css = spawnSync(process.execPath, ["node_modules/tailwindcss/lib/cli.js",
  "-i", "src/index.css", "-o", DIR + "masonry-dimensions-browser.css",
  "--content", [DIR + "masonry-dimensions-browser-fixture.jsx",
    DIR + "masonry-height-candidate-FoundationWallsPanel.jsx",
    DIR + "masonry-material-candidate-FoundationBOM.jsx",
    "src/components/ui/button.jsx", "src/components/ui/input.jsx"].join(",")],
  { encoding: "buffer" });
fs.writeFileSync(DIR + "masonry-dimensions-browser-css-log.txt", Buffer.concat([css.stdout, css.stderr || Buffer.alloc(0)]));
assert.equal(css.status, 0, "tailwind build failed");

// ---------- fixture server ----------
const html = `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/app.css"></head>
<body><div id="root"></div>
<script>window.__SEED=${JSON.stringify(seed).replace(/</g, "\\u003c")};window.__INNER=${JSON.stringify(innerFixture)};</script>
<script type="module" src="/bundle.js"></script></body></html>`;
const server = http.createServer((req, res) => {
  if (req.url === "/" || req.url.startsWith("/?")) { res.setHeader("content-type", "text/html"); res.end(html); }
  else if (req.url === "/app.css") { res.setHeader("content-type", "text/css"); res.end(fs.readFileSync(DIR + "masonry-dimensions-browser.css")); }
  else if (req.url === "/bundle.js") { res.setHeader("content-type", "text/javascript"); res.end(build.outputFiles[0].contents); }
  else res.end("");
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const port = server.address().port;
const baseOrigin = `http://127.0.0.1:${port}`;
fs.writeFileSync(DIR + "masonry-dimensions-browser-runtime.json",
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
      window.fetch = () => { window.__netOps.fetch++; throw new Error("Unexpected network access in masonry browser proof"); };
      const X = window.XMLHttpRequest;
      window.XMLHttpRequest = function () { window.__netOps.xhr++; throw new Error("Unexpected XHR in masonry browser proof"); };
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
    await page.waitForSelector('[data-testid="walls-panel"]', { timeout: 10000 });

    const panel = page.locator('[data-testid="walls-panel"]');
    const bom = page.locator('[data-testid="bom"]');
    const panelText = await panel.innerText();
    const bomText = await bom.innerText();
    const before = await page.evaluate("window.__M");

    // Panel assertions (scoped)
    if (mode.wallAmount) {
      const totalSpan = panel.locator(".whitespace-nowrap.font-bold").first();
      assert.ok((await totalSpan.innerText()).includes(mode.wallAmount), "panel amount " + mode.wallAmount);
      const ws = await totalSpan.evaluate((el) => getComputedStyle(el).whiteSpace);
      assert.equal(ws, "nowrap", "panel amount nowrap");
    }
    for (const t of mode.panelExactTexts || []) assert.ok(panelText.includes(t), "panel text: " + t);
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
    if (mode.bomForbiddenText) assert.ok(!bomText.includes(mode.bomForbiddenText), "forbidden bom name " + mode.bomForbiddenText);
    if (mode.forbiddenAmount) assert.ok(!bomText.includes(mode.forbiddenAmount) && !panelText.includes(mode.forbiddenAmount), "forbidden " + mode.forbiddenAmount);
    const bannerVisible = bomText.includes("Pricing unavailable");
    assert.equal(bannerVisible, Boolean(mode.pricingUnavailable), "BOM banner " + mode.id);
    assert.equal(Boolean(before.pricingUnavailable), Boolean(mode.pricingUnavailable), "__M flag " + mode.id);

    // actual input values
    if (mode.heightValue !== undefined) {
      const inp = page.locator('input[aria-label="Wall height (in)"]').first();
      assert.ok(await inp.count(), "height input present");
      assert.equal(await inp.inputValue(), mode.heightValue, "height value " + mode.id);
    }
    if (mode.internalHeightValue !== undefined) {
      const inp = page.locator('input[aria-label="Internal wall height (in)"]').first();
      assert.ok(await inp.count(), "internal height input present");
      assert.equal(await inp.inputValue(), mode.internalHeightValue, "internal height value " + mode.id);
    }
    // aria-invalid + describedby → visible field-specific diagnostics
    for (const aria of [mode.invalidInput].filter(Boolean)) {
      const sel = page.locator(`[aria-label="${aria}"]`).first();
      assert.ok(await sel.count(), aria + " select");
      assert.equal(await sel.getAttribute("aria-invalid"), "true", aria + " aria-invalid");
      const did = await sel.getAttribute("aria-describedby");
      assert.ok(did, aria + " aria-describedby");
      const diag = page.locator("#" + did);
      assert.ok(await diag.isVisible(), aria + " diagnostic visible");
      const dText = await diag.innerText();
      for (const t of mode.diagnosticTexts || []) assert.ok(dText.includes(t), aria + " diagnostic text " + t + " in " + dText.slice(0, 120));
    }
    if (mode.dimensionIssueCount) {
      const dimCodes = ["wall_unit_length_inches_unavailable", "wall_unit_width_inches_unavailable", "wall_unit_height_inches_unavailable"];
      const seen = (before.catalogIssues || []).filter((i) => dimCodes.includes(i.code));
      assert.equal(new Set(seen.map((i) => i.code)).size, mode.dimensionIssueCount, "distinct dimension issues " + mode.id);
    }
    // valid-strings: select badMaterialId → header 408 without saving, select original → 57
    if (mode.id === "valid-strings") {
      const sel = page.locator('select[aria-label="Wall material"]').first();
      await sel.selectOption("synthetic-invalid-dimensions");
      const bad = await panel.locator(".whitespace-nowrap.font-bold").first().innerText();
      assert.ok(bad.includes("$408.00"), "invalid select holds 408 got " + bad);
      await sel.selectOption(before.project.walls[0].materialId);
      const back = await panel.locator(".whitespace-nowrap.font-bold").first().innerText();
      assert.ok(back.includes("$57.00"), "restore 57 got " + back);
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

    const png = DIR + `masonry-dimensions-browser-${mode.id}-${vp.width}.png`;
    await page.screenshot({ path: png, fullPage: true });

    const after = await page.evaluate("window.__M");
    assert.deepEqual(after, before, "full __M stable");
    assert.equal(after.writes, 0, "no writes");

    const netOps = await page.evaluate("window.__netOps");
    assert.equal(netOps.fetch, 0); assert.equal(netOps.xhr, 0);
    assert.equal(externalUrls.length, 0, "external urls " + externalUrls.slice(0, 2).join(","));
    assert.equal(consoleErrors.length, 0, "console errors: " + consoleErrors.slice(0, 2).join("|"));
    assert.equal(keyWarnings.length, 0, "duplicate keys");
    fs.writeFileSync(DIR + `masonry-dimensions-browser-${mode.id}-${vp.width}-snapshot.json`,
      JSON.stringify({ mode: mode.id, width: vp.width, before, after, writes: after.writes, netOps, externalUrls, consoleErrors, keyWarnings }, null, 2));
    await ctx.close();
  });
}
await browser.close();
assert.equal(results.length, SPEC.browserCaseCount, "case count " + SPEC.browserCaseCount);
const okCount = results.filter((r) => r.ok).length;
fs.writeFileSync(DIR + "masonry-dimensions-browser-verification.json", JSON.stringify({ results, port, pid: process.pid }, null, 2));
console.log(`masonry-browser passed=${okCount} failed=${results.length - okCount}`);
if (okCount !== results.length) { server.close(); process.exit(1); }

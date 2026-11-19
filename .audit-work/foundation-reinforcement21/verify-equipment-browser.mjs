// Equipment-pricing availability hardening — browser proof (6 modes x 2
// viewports; 2 candidates). Mirrors the masonry/pole browser recipes:
// origin-exact route guard, in-page fetch/XHR traps, BOM row + banner
// assertions, aria linkage on the invalid field, blank-draft semantics,
// __M stability.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import * as esbuild from "esbuild";

const DIR = ".audit-work/foundation-reinforcement21/";
const SPEC = JSON.parse(fs.readFileSync(DIR + "equipment-pricing-flow-proof-spec.json", "utf8"));
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
const entry = "/app/equipment-browser-entry.jsx";
sources.set(entry, fs.readFileSync(DIR + "equipment-pricing-browser-fixture.jsx", "utf8"));

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
fs.writeFileSync(DIR + "equipment-browser-meta.json", JSON.stringify({ inputs: Object.keys(build.metafile.inputs), loaded, importEdges }, null, 2));

// ---------- CSS ----------
const css = spawnSync(process.execPath, ["node_modules/tailwindcss/lib/cli.js",
  "-i", "src/index.css", "-o", DIR + "equipment-pricing-browser.css",
  "--content", [DIR + "equipment-pricing-browser-fixture.jsx",
    DIR + "equipment-pricing-candidate-FoundationEquipmentTab.jsx",
    DIR + "equipment-pricing-candidate-foundationCalc.js",
    "src/components/ui/button.jsx", "src/components/ui/card.jsx", "src/components/ui/select.jsx",
    "src/components/ui/checkbox.jsx", "src/components/ui/badge.jsx", "src/components/ui/label.jsx",
    "src/components/ui/input.jsx",
    DIR + "remote-src/src/components/estimator/foundation/FoundationBOM.jsx"].join(",")],
  { encoding: "buffer" });
fs.writeFileSync(DIR + "equipment-pricing-browser-css-log.txt", Buffer.concat([css.stdout, css.stderr || Buffer.alloc(0)]));
assert.equal(css.status, 0, "tailwind build failed");

// ---------- fixture server ----------
const html = `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/app.css"></head>
<body><div id="root"></div>
<script>window.__SEED=${JSON.stringify(seed).replace(/</g, "\\u003c")};</script>
<script type="module" src="/bundle.js"></script></body></html>`;
const server = http.createServer((req, res) => {
  if (req.url === "/" || req.url.startsWith("/?")) { res.setHeader("content-type", "text/html"); res.end(html); }
  else if (req.url === "/app.css") { res.setHeader("content-type", "text/css"); res.end(fs.readFileSync(DIR + "equipment-pricing-browser.css")); }
  else if (req.url === "/bundle.js") { res.setHeader("content-type", "text/javascript"); res.end(build.outputFiles[0].contents); }
  else res.end("");
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const port = server.address().port;
const baseOrigin = `http://127.0.0.1:${port}`;
fs.writeFileSync(DIR + "equipment-pricing-browser-runtime.json",
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
      window.fetch = () => { window.__netOps.fetch++; throw new Error("Unexpected network access in equipment browser proof"); };
      const X = window.XMLHttpRequest;
      window.XMLHttpRequest = function () { window.__netOps.xhr++; throw new Error("Unexpected XHR in equipment browser proof"); };
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
    await page.waitForSelector('[data-testid="equipment-panel"]', { timeout: 10000 });

    const panel = page.locator('[data-testid="equipment-panel"]');
    const bom = page.locator('[data-testid="bom"]');
    const panelText = await panel.innerText();
    const bomText = await bom.innerText();
    const before = await page.evaluate("window.__M");

    // Panel assertions (scoped)
    for (const t of mode.panelTexts || []) assert.ok(panelText.includes(t), "panel text: " + t);
    const savedNotice = panelText.includes("Saved amounts (not current pricing)");
    assert.equal(savedNotice, Boolean(mode.pricingUnavailable), "saved notice " + mode.id);

    // BOM: equipment never lists rows — only the concrete delivery row; the
    // pricing-unavailable banner flips with the shared issue gate.
    const trs = bom.locator("tbody tr");
    assert.equal(await trs.count(), 1, "bom row count — equipment has no rows");
    const tds = trs.nth(0).locator("td");
    assert.deepEqual(
      [await tds.nth(0).innerText(), await tds.nth(1).innerText(), await tds.nth(2).innerText()],
      ["Ready-mix concrete (delivered)", "0.75 CY", "$330.75"], "bom delivery row");
    for (const forbidden of ["excavator", "bucket", "tooth", "compactor", "grapple"])
      assert.ok(!bomText.includes(forbidden), "equipment name absent from BOM: " + forbidden);
    const bannerVisible = bomText.includes("Pricing unavailable");
    assert.equal(bannerVisible, Boolean(mode.pricingUnavailable), "BOM banner " + mode.id);
    assert.equal(Boolean(before.pricingUnavailable), Boolean(mode.pricingUnavailable), "__M flag " + mode.id);

    // Equipment issue codes in the merged catalog gate
    if (mode.equipmentIssueCodes) {
      const codes = (before.catalogIssues || []).map((x) => x.code);
      for (const c of mode.equipmentIssueCodes) assert.ok(codes.includes(c), "equipment issue " + c + " got " + codes);
      const eqAvail = (before.equipmentPricing || []).map((x) => x.available);
      assert.ok(eqAvail.includes(false), "equipmentPricing unavailable row");
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

    // Duration draft interactions: blank keeps the ported default and stays
    // valid; a negative draft is stored verbatim and holds acknowledged
    // amounts; repair re-prices. (Malformed strings cannot be typed into a
    // number input in a real browser — that vector is proven in the
    // page/model harnesses against stored data.)
    if (mode.durationInteraction) {
      const duration = panel.locator('input[aria-label="Rental duration"]').first();
      const calcBefore = { project: before.project, equipment: before.equipment, totals: before.totals, catalogIssues: before.catalogIssues };
      await duration.fill("");
      const m2 = await page.evaluate("window.__M");
      assert.equal(m2.project.selected_equipment[0].rental_duration, "", "blank preserved, never coerced");
      assert.equal(m2.equipment[0].equipment_cost, 340, "blank uses default one-period duration");
      assert.equal(m2.pricingUnavailable, false, "blank stays valid");
      assert.equal(await duration.getAttribute("aria-invalid"), null, "no aria-invalid for blank");
      await duration.fill("-2");
      const m3 = await page.evaluate("window.__M");
      assert.equal(m3.project.selected_equipment[0].rental_duration, -2, "negative draft preserved verbatim");
      assert.equal(m3.equipment[0].equipment_cost, 680, "held acknowledged equipment_cost");
      assert.equal(m3.pricingUnavailable, true, "banner flag after invalid draft");
      assert.equal(await duration.getAttribute("aria-invalid"), "true", "duration aria-invalid");
      assert.equal(await duration.getAttribute("aria-describedby"), "equipment-0-pricing");
      const diag = page.locator("#equipment-0-pricing");
      assert.ok((await diag.innerText()).includes("rental duration"), "duration diagnostic text");
      const banner = page.locator('[data-testid="equipment-panel"] >> text=Pricing unavailable').first();
      assert.ok(await banner.isVisible(), "tab banner appears after invalid draft");
      await duration.fill("2");
      const m4 = await page.evaluate("window.__M");
      assert.equal(m4.project.selected_equipment[0].rental_duration, 2, "number stored as number");
      assert.equal(m4.equipment[0].equipment_cost, 680, "repriced after repair");
      assert.equal(m4.pricingUnavailable, false, "banner cleared");
    }

    // Layout: no horizontal overflow
    const overflow = await page.evaluate("document.documentElement.scrollWidth > window.innerWidth");
    assert.equal(overflow, false, "no horizontal overflow at " + vp.width);

    const png = DIR + `equipment-pricing-browser-${mode.id}-${vp.width}.png`;
    await page.screenshot({ path: png, fullPage: true });

    const after = await page.evaluate("window.__M");
    if (mode.durationInteraction) {
      for (const k of ["savedProject", "inventory", "settings", "mode", "writes"])
        assert.deepEqual(after[k], before[k], "stable " + k);
    } else assert.deepEqual(after, before, "full __M stable");
    assert.equal(after.writes, 0, "no writes");

    const netOps = await page.evaluate("window.__netOps");
    assert.equal(netOps.fetch, 0); assert.equal(netOps.xhr, 0);
    assert.equal(externalUrls.length, 0, "external urls " + externalUrls.slice(0, 2).join(","));
    assert.equal(consoleErrors.length, 0, "console errors: " + consoleErrors.slice(0, 2).join("|"));
    assert.equal(keyWarnings.length, 0, "duplicate keys");
    fs.writeFileSync(DIR + `equipment-pricing-browser-${mode.id}-${vp.width}-snapshot.json`,
      JSON.stringify({ mode: mode.id, width: vp.width, before, after, writes: after.writes, netOps, externalUrls, consoleErrors, keyWarnings }, null, 2));
    await ctx.close();
  });
}
await browser.close();
assert.equal(results.length, SPEC.browserCaseCount, "case count " + SPEC.browserCaseCount);
const okCount = results.filter((r) => r.ok).length;
fs.writeFileSync(DIR + "equipment-pricing-browser-verification.json", JSON.stringify({ results, port, pid: process.pid }, null, 2));
console.log(`equipment-browser passed=${okCount} failed=${results.length - okCount}`);
server.close();
if (okCount !== results.length) process.exit(1);

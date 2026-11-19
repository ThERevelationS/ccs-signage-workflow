// Cabinets/landscape pricing-availability hardening — browser proof (6 modes x
// 2 viewports; 7 candidates). Mirrors the -21 recipe: origin-exact route guard,
// in-page fetch/XHR traps, BOM row + banner assertions, aria linkage on the
// invalid field, blank-draft semantics, __M stability.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import * as esbuild from "esbuild";

const DIR = ".audit-work/foundation-reinforcement22/";
const SPEC = JSON.parse(fs.readFileSync(DIR + "cabinets-landscape-flow-proof-spec.json", "utf8"));
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
for (const [rel, meta] of Object.entries(SPEC.candidates))
  sources.set("/app/" + rel, fs.readFileSync(DIR + meta.file, "utf8"));
for (const [rel, meta] of Object.entries(SPEC.candidates))
  assert.equal(hash(sources.get("/app/" + rel)), meta.hash, "candidate " + rel);
for (const rel of ["components/ui/input.jsx", "lib/utils.js"])
  sources.set("/app/src/" + rel, fs.readFileSync("src/" + rel, "utf8"));
const entry = "/app/cabland-browser-entry.jsx";
sources.set(entry, fs.readFileSync(DIR + "cabinets-landscape-browser-fixture.jsx", "utf8"));

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
// The panel fixture bundles the calc layer + both panels; the page and the
// assembly model are proven by the page harness / model checks instead.
const BROWSER_CANDIDATES = Object.keys(SPEC.candidates).filter((rel) =>
  rel.startsWith("src/components/estimator/foundation/") && rel !== "src/components/estimator/foundation/foundationAssemblyModel.js");
for (const rel of BROWSER_CANDIDATES)
  assert.equal(loaded["/app/" + rel], SPEC.candidates[rel].hash, "candidate loaded " + rel);
assert.ok(!Object.keys(build.metafile.inputs).some((f) => /base44Client/.test(f)), "no SDK in bundle");
const importEdges = [];
for (const [out, info] of Object.entries(build.metafile.outputs))
  for (const imp of info.imports || []) importEdges.push({ output: out, ...imp });
assert.deepEqual(importEdges, [], "fully bundled — no external import edges");
fs.writeFileSync(DIR + "cabinets-landscape-browser-meta.json", JSON.stringify({ inputs: Object.keys(build.metafile.inputs), loaded, importEdges }, null, 2));

// ---------- CSS ----------
const css = spawnSync(process.execPath, ["node_modules/tailwindcss/lib/cli.js",
  "-i", "src/index.css", "-o", DIR + "cabinets-landscape-browser.css",
  "--content", [DIR + "cabinets-landscape-browser-fixture.jsx",
    DIR + "cabinets-landscape-candidate-SignageCabinetsPanel.jsx",
    DIR + "cabinets-landscape-candidate-LandscapeDesigner.jsx",
    "src/components/ui/input.jsx",
    DIR + "remote-src/src/components/estimator/foundation/FoundationBOM.jsx"].join(",")],
  { encoding: "buffer" });
fs.writeFileSync(DIR + "cabinets-landscape-browser-css-log.txt", Buffer.concat([css.stdout, css.stderr || Buffer.alloc(0)]));
assert.equal(css.status, 0, "tailwind build failed");

// ---------- fixture server ----------
const html = `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/app.css"></head>
<body><div id="root"></div>
<script>window.__SEED=${JSON.stringify(seed).replace(/</g, "\\u003c")};</script>
<script type="module" src="/bundle.js"></script></body></html>`;
const server = http.createServer((req, res) => {
  if (req.url === "/" || req.url.startsWith("/?")) { res.setHeader("content-type", "text/html"); res.end(html); }
  else if (req.url === "/app.css") { res.setHeader("content-type", "text/css"); res.end(fs.readFileSync(DIR + "cabinets-landscape-browser.css")); }
  else if (req.url === "/bundle.js") { res.setHeader("content-type", "text/javascript"); res.end(build.outputFiles[0].contents); }
  else res.end("");
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const port = server.address().port;
const baseOrigin = `http://127.0.0.1:${port}`;
fs.writeFileSync(DIR + "cabinets-landscape-browser-runtime.json",
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
      window.fetch = () => { window.__netOps.fetch++; throw new Error("Unexpected network access in cabinets browser proof"); };
      const X = window.XMLHttpRequest;
      window.XMLHttpRequest = function () { window.__netOps.xhr++; throw new Error("Unexpected XHR in cabinets browser proof"); };
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
    await page.waitForSelector('[data-testid="cabinets-panel"]', { timeout: 10000 });

    const cabinets = page.locator('[data-testid="cabinets-panel"]');
    const landscape = page.locator('[data-testid="landscape-panel"]');
    const section = page.locator('[data-testid="section-totals"]');
    const bom = page.locator('[data-testid="bom"]');
    const cabinetText = await cabinets.innerText();
    const landscapeText = await landscape.innerText();
    const sectionText = await section.innerText();
    const bomText = await bom.innerText();
    const before = await page.evaluate("window.__M");

    // Scoped panel texts
    for (const t of mode.cabinetTexts || []) assert.ok(cabinetText.includes(t), "cabinet text: " + t);
    for (const t of mode.landscapeTexts || []) assert.ok(landscapeText.includes(t), "landscape text: " + t);
    for (const t of mode.sectionTexts || []) assert.ok(sectionText.includes(t), "section text: " + t);
    const savedNotice = cabinetText.includes("Saved amounts only");
    assert.equal(savedNotice, Boolean((mode.issueCodes || []).some((c) => c.startsWith("signage_cabinet"))),
      "cabinet saved notice " + mode.id);
    assert.equal(Boolean(before.pricingUnavailable), Boolean(mode.pricingUnavailable), "__M flag " + mode.id);
    const paused = sectionText.includes("Estimate handoff paused");
    assert.equal(paused, Boolean(mode.pricingUnavailable), "handoff paused " + mode.id);

    // BOM: cabinets/landscape never list rows — the pole row + concrete
    // delivery row only; the pricing-unavailable banner flips on the shared gate.
    const trs = bom.locator("tbody tr");
    assert.equal(await trs.count(), mode.bomRows ?? 2, "bom row count");
    const bannerVisible = bomText.includes("Pricing unavailable");
    assert.equal(bannerVisible, Boolean(mode.pricingUnavailable), "BOM banner " + mode.id);
    assert.ok(bomText.includes("Steel pole 4x4"), "pole row present");
    for (const forbidden of ["cabinet", "grass", "Landscape"])
      assert.ok(!bomText.toLowerCase().includes(forbidden.toLowerCase()), "no " + forbidden + " rows in BOM");

    // Issue codes in the merged input gate
    if (mode.issueCodes) {
      const codes = (before.inputIssues || []).map((x) => x.code);
      for (const c of mode.issueCodes) assert.ok(codes.includes(c), "issue " + c + " got " + codes);
    }

    // aria linkage on the invalid field + rendered diagnostic
    if (mode.invalidField) {
      const field = page.locator(mode.invalidField.selector).first();
      assert.equal(await field.getAttribute("aria-invalid"), "true", "aria-invalid on " + mode.invalidField.selector);
      const did = await field.getAttribute("aria-describedby");
      assert.equal(did, mode.invalidField.describedBy, "aria-describedby target");
      const diag = page.locator("#" + mode.invalidField.describedBy);
      assert.ok(await diag.isVisible(), "diagnostic visible");
      assert.ok((await diag.innerText()).trim().length > 0, "diagnostic text");
    }

    // Quantity draft interaction on the valid mode: blank keeps the ported
    // one-cabinet default and stays valid; 0 holds; repair reprices.
    // (Malformed strings cannot be typed into a number input in a real
    // browser — that vector is proven in the page/model harnesses.)
    if (mode.cabinetQtyInteraction) {
      const qty = cabinets.locator('input[data-cabinet-field="quantity"]').first();
      const m0 = await page.evaluate("window.__M");
      await qty.fill("");
      const m1 = await page.evaluate("window.__M");
      assert.equal(m1.project.signage_cabinets[0].quantity, "", "blank preserved, never coerced");
      assert.equal(m1.totals.total_signage_cabinet_cost, 350 + 250, "blank uses ported single-cabinet default");
      assert.equal(m1.pricingUnavailable, false, "blank stays valid");
      assert.equal(await qty.getAttribute("aria-invalid"), null, "no aria-invalid for blank");
      await qty.fill("0");
      const m2 = await page.evaluate("window.__M");
      assert.equal(m2.project.signage_cabinets[0].quantity, 0, "zero stored verbatim");
      assert.equal(m2.totals.total_signage_cabinet_cost, 950, "held acknowledged cabinet total");
      assert.equal(m2.pricingUnavailable, true, "blocked after zero draft");
      assert.equal(await qty.getAttribute("aria-invalid"), "true", "qty aria-invalid");
      assert.equal(await qty.getAttribute("aria-describedby"), "signage-cabinet-0-pricing");
      const diag = page.locator("#signage-cabinet-0-pricing");
      assert.ok((await diag.innerText()).includes("positive quantity"), "qty diagnostic text");
      await qty.fill("3");
      const m3 = await page.evaluate("window.__M");
      assert.equal(m3.project.signage_cabinets[0].quantity, 3, "numeric draft stored as number");
      assert.equal(m3.totals.total_signage_cabinet_cost, 1050 + 250, "repriced after repair");
      assert.equal(m3.pricingUnavailable, false, "block cleared");
      assert.deepEqual(m3.savedProject, m0.savedProject, "savedProject untouched by edits");
    }

    // Cell-size draft interaction on the missing-size mode: typing a size
    // reprices the painted grid; clearing re-holds it.
    if (mode.cellSizeInteraction) {
      const cell = landscape.locator('input[data-landscape-field="cell_size_inches"]');
      assert.equal(await cell.count(), 1, "cell-size input mounted");
      assert.equal(await cell.inputValue(), "", "missing size renders blank, never guessed-12");
      await cell.fill("12");
      const m1 = await page.evaluate("window.__M");
      assert.equal(m1.project.landscape.cell_size_inches, 12, "size stored as number");
      assert.equal(m1.totals.total_landscape_cost, 15.5, "repriced at 12in cells");
      assert.equal(m1.pricingUnavailable, false, "block cleared");
      await cell.fill("");
      const m2 = await page.evaluate("window.__M");
      assert.equal(m2.project.landscape.cell_size_inches, "", "blank preserved verbatim");
      assert.equal(m2.totals.total_landscape_cost, 15.5, "held acknowledged landscape total");
      assert.equal(m2.pricingUnavailable, true, "re-blocked on blank");
      assert.equal(await cell.getAttribute("aria-invalid"), "true", "aria-invalid on blank");
      await cell.fill("24");
      const m3 = await page.evaluate("window.__M");
      assert.equal(m3.totals.total_landscape_cost, 62, "repriced at 24in cells");
      assert.equal(m3.pricingUnavailable, false, "repaired");
    }

    // Layout: no horizontal overflow
    const overflow = await page.evaluate("document.documentElement.scrollWidth > window.innerWidth");
    assert.equal(overflow, false, "no horizontal overflow at " + vp.width);

    const png = DIR + `cabinets-landscape-browser-${mode.id}-${vp.width}.png`;
    await page.screenshot({ path: png, fullPage: true });

    const after = await page.evaluate("window.__M");
    for (const k of ["savedProject", "inventory", "settings", "mode", "writes"])
      assert.deepEqual(after[k], before[k], "stable " + k);
    assert.equal(after.writes, 0, "no writes");

    const netOps = await page.evaluate("window.__netOps");
    assert.equal(netOps.fetch, 0); assert.equal(netOps.xhr, 0);
    assert.equal(externalUrls.length, 0, "external urls " + externalUrls.slice(0, 2).join(","));
    assert.equal(consoleErrors.length, 0, "console errors: " + consoleErrors.slice(0, 2).join("|"));
    assert.equal(keyWarnings.length, 0, "duplicate keys");
    fs.writeFileSync(DIR + `cabinets-landscape-browser-${mode.id}-${vp.width}-snapshot.json`,
      JSON.stringify({ mode: mode.id, width: vp.width, before, after, writes: after.writes, netOps, externalUrls, consoleErrors, keyWarnings }, null, 2));
    await ctx.close();
  });
}
await browser.close();
assert.equal(results.length, SPEC.browserCaseCount, "case count " + SPEC.browserCaseCount);
const okCount = results.filter((r) => r.ok).length;
fs.writeFileSync(DIR + "cabinets-landscape-browser-verification.json", JSON.stringify({ results, port, pid: process.pid }, null, 2));
console.log(`cabland-browser passed=${okCount} failed=${results.length - okCount}`);
server.close();
if (okCount !== results.length) process.exit(1);

import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { build } from "esbuild";
import { chromium } from "playwright-core";

const DIR = ".audit-work/foundation-reinforcement18/";
const built = await build({
  entryPoints: [DIR + "wall-cap-pricing-browser-fixture.jsx"], bundle: true, write: false,
  platform: "browser", format: "esm", jsx: "automatic", metafile: true, alias: { "@": path.resolve("src") },
});
const inputs = Object.keys(built.metafile.inputs);
for (const file of ["FoundationWallCapsPanel.jsx", "FoundationTotals.jsx", "FoundationBOM.jsx",
  "foundationCalc.js", "foundationCatalogIntegrity.js", "wallCapCalculator.js"]) assert.ok(inputs.some(input => input.endsWith(file)));
assert.ok(!inputs.some(input => /base44Client\.js|node_modules\/@base44/.test(input)));
fs.writeFileSync(DIR + "wall-cap-pricing-browser-meta.json", JSON.stringify(built.metafile, null, 2));
const css = fs.readFileSync(DIR + "wall-cap-pricing-browser.css", "utf8"), js = built.outputFiles[0].text;
const html = '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"></head><body><div id="root"></div><script type="module" src="/fixture.js"></script></body></html>';
const server = http.createServer((request, response) => {
  const name = new URL(request.url, "http://127.0.0.1").pathname;
  if (name === "/favicon.ico") { response.writeHead(204); response.end(); return; }
  const content = { "/fixture.js": ["text/javascript", js], "/fixture.css": ["text/css", css] }[name] || ["text/html", html];
  response.writeHead(200, { "Content-Type": content[0] }); response.end(content[1]);
});
await new Promise(done => server.listen(0, "127.0.0.1", done));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({
  executablePath: "C:/Users/BrettHeinlein/AppData/Local/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-win64/chrome-headless-shell.exe",
});
const results = [];
try {
  for (const [mode, cost, blocked] of [["saved", 21, true], ["unknown", null, true], ["zero", 0, false], ["current", 25, false]])
    for (const width of [1280, 390]) {
      const context = await browser.newContext({ viewport: { width, height: 1100 } }), page = await context.newPage();
      const telemetry = { errors: [], pageErrors: [], requestFailures: [], external: [] };
      page.on("console", message => { if (message.type() === "error") telemetry.errors.push(message.text()); });
      page.on("pageerror", error => telemetry.pageErrors.push(String(error)));
      page.on("requestfailed", request => telemetry.requestFailures.push(request.url()));
      await page.route("**/*", async route => {
        if (new URL(route.request().url()).origin !== origin) {
          telemetry.external.push(route.request().url()); await route.abort(); return;
        }
        await route.continue();
      });
      let snapshot, screenshot = DIR + `wall-cap-pricing-browser-${mode}-${width}.png`;
      try {
        await page.goto(origin + "/?mode=" + mode, { waitUntil: "networkidle" });
        await page.getByRole("heading", { name: "Wall Caps", exact: true }).waitFor();
        snapshot = await page.evaluate(() => window.__wallCapPricingInspect());
        assert.equal(snapshot.sourceUnchanged, true); assert.equal(snapshot.length, 18);
        assert.equal(snapshot.total, cost); assert.equal(snapshot.grandTotal, cost); assert.equal(snapshot.capCost, cost);
        assert.equal(snapshot.issues.length > 0, blocked);
        assert.equal(snapshot.groups[0].qty, 1); assert.equal(snapshot.groups[0].cost, cost);
        const panel = page.getByTestId("cap-panel"), totals = page.getByTestId("totals-panel"), bom = page.getByTestId("bom-panel");
        assert.equal(await panel.getByText("Saved amounts (not current pricing)", { exact: true }).count(), blocked ? 1 : 0);
        if (cost === null) {
          assert.ok(!(await panel.innerText()).includes("$0.00"));
          await panel.getByText("Not saved", { exact: true }).waitFor();
          const capRow = totals.locator("div.flex.justify-between").filter({ has: page.getByText("Wall caps", { exact: true }) });
          assert.match(await capRow.innerText(), /Not saved/);
          const materialRow = bom.locator("tr").filter({ hasText: "Acknowledged cap" });
          assert.match(await materialRow.innerText(), /Not saved/);
        } else {
          await panel.getByText(`$${cost.toFixed(2)}`, { exact: true }).waitFor();
        }
        assert.equal(await totals.getByText("Pricing unavailable", { exact: true }).count(), blocked ? 1 : 0);
        assert.equal(await bom.getByText("Pricing unavailable", { exact: true }).count(), blocked ? 1 : 0);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "No phone/page overflow");
        assert.equal(await panel.locator("input[type=number]").inputValue(), "18");
        assert.ok(await panel.locator("h2").evaluate(node => getComputedStyle(node).fontWeight >= 600), "Real component styles must be present");
        for (const entries of Object.values(telemetry)) assert.deepEqual(entries, []);
        await page.screenshot({ path: screenshot, fullPage: true });
        results.push({ mode, width, ok: true, snapshot, screenshot, telemetry }); console.log("ok", mode, width);
      } catch (error) {
        await page.screenshot({ path: screenshot, fullPage: true }).catch(() => {});
        results.push({ mode, width, ok: false, error: error.stack, snapshot, screenshot, telemetry });
        console.error("FAIL", mode, width, error.message);
      } finally { await context.close(); }
    }
} finally { await browser.close(); await new Promise(done => server.close(done)); }
fs.writeFileSync(DIR + "wall-cap-pricing-browser-verification.json", JSON.stringify({
  results, syntheticOnly: true, realStorageVerified: false, sdkCalls: 0,
}, null, 2) + "\n");
if (results.some(result => !result.ok)) process.exitCode = 1;

import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { build } from "esbuild";
import { chromium } from "playwright-core";

const DIR = ".audit-work/foundation-reinforcement18/";
const built = await build({
  entryPoints: [DIR + "foundation-ai-review-browser-fixture.jsx"], bundle: true, write: false,
  platform: "browser", format: "esm", jsx: "automatic", metafile: true,
  define: { "process.env.NODE_ENV": '"development"' },
  plugins: [{ name: "offline-no-paid-ai", setup(builder) {
    builder.onResolve({ filter: /^@\/api\/base44Client$/ }, args => ({ path: args.path, namespace: "offline" }));
    builder.onLoad({ filter: /.*/, namespace: "offline" }, () => ({
      contents: "export const base44={integrations:{Core:{InvokeLLM:request=>window.__foundationAiNative.invoke(request)}}};",
      loader: "js",
    }));
  } }],
});
const inputs = Object.keys(built.metafile.inputs);
for (const filename of ["AiEngineeringAssistant.jsx", "foundationAiReview.js", "base44/shared/estimatorAiModelPolicy.js"])
  assert.ok(inputs.some(input => input.endsWith(filename)));
assert.ok(inputs.some(input => input.includes("react-markdown")));
assert.ok(!inputs.some(input => /base44Client\.js|node_modules\/@base44/.test(input)));
fs.writeFileSync(DIR + "foundation-ai-review-browser-meta.json", JSON.stringify(built.metafile, null, 2) + "\n");
const js = built.outputFiles[0].text, css = fs.readFileSync(DIR + "foundation-ai-review-browser.css", "utf8");
const html = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"></head><body><div id="root"></div><script type="module" src="/fixture.js"></script></body></html>';
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
  for (const mode of ["success", "stale", "unmount", "legacy", "invalid"]) for (const width of [1280, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } }), page = await context.newPage();
    const telemetry = { errors: [], pageErrors: [], external: [], requestFailures: [] };
    page.on("console", message => { if (message.type() === "error") telemetry.errors.push(message.text()); });
    page.on("pageerror", error => telemetry.pageErrors.push(String(error)));
    page.on("requestfailed", request => telemetry.requestFailures.push(request.url()));
    await page.route("**/*", async route => {
      if (new URL(route.request().url()).origin !== origin) {
        telemetry.external.push(route.request().url()); await route.abort(); return;
      }
      await route.continue();
    });
    let screenshot, snapshot;
    try {
      await page.goto(origin + "/?mode=" + mode, { waitUntil: "networkidle" });
      await page.getByRole("heading", { name: "AI Preliminary Review" }).waitFor();
      snapshot = await page.evaluate(() => window.__foundationAiNativeInspect());
      assert.ok(snapshot.setups >= 2 && snapshot.cleanups >= 1, "Actual React StrictMode effect replay must occur");
      assert.equal(snapshot.calls.length, 0, "Mount/replay never invokes a paid model");
      await page.getByText(/not structural calculations or approval/).waitFor();
      if (mode === "legacy") {
        await page.getByText("Historical / unverified AI note", { exact: true }).waitFor();
        await page.getByText("Saved historical note. Engineering has not been verified.", { exact: true }).waitFor();
      } else {
        await page.getByRole("button", { name: "Review Foundation Inputs", exact: true }).click();
        await page.waitForFunction(() => window.__foundationAiNative.calls.length === 1);
        if (mode === "stale" || mode === "unmount") {
          await page.getByRole("button", { name: mode === "stale" ? "Change Foundation Depth" : "Unmount Assistant", exact: true }).click();
          await page.evaluate(() => window.__foundationAiNative.resolve());
        }
        if (mode === "success") {
          await page.waitForFunction(() => window.__foundationAiNative.patches.length === 1);
          await page.getByText("Preliminary review", { exact: true }).waitFor();
          assert.equal(await page.getByRole("button", { name: "Review Foundation Inputs", exact: true }).isEnabled(), true);
          const links = await page.locator("a").evaluateAll(nodes => nodes.map(node => node.getAttribute("href")));
          assert.ok(links.every(href => !href || !/^javascript:/i.test(href)));
        }
        if (mode === "stale") await page.getByRole("alert").filter({ hasText: "design changed" }).waitFor();
        if (mode === "invalid") await page.getByRole("alert").filter({ hasText: "unexpected fields" }).waitFor();
        if (mode === "unmount") {
          assert.equal(await page.getByRole("heading", { name: "AI Preliminary Review" }).count(), 0);
          await page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
        }
      }
      snapshot = await page.evaluate(() => window.__foundationAiNativeInspect());
      assert.equal(snapshot.financialUnchanged, true);
      assert.equal(snapshot.engineeringApproved, false); assert.equal(snapshot.procurementReady, false);
      assert.equal(snapshot.scriptExecuted, false);
      assert.equal(snapshot.calls.length, mode === "legacy" ? 0 : 1);
      assert.equal(snapshot.patches.length, mode === "success" ? 1 : 0);
      if (mode !== "legacy") assert.equal(snapshot.calls[0].model, "gpt_6_sol");
      if (mode === "success") {
        assert.deepEqual(Object.keys(snapshot.patches[0]).sort(), ["ai_engineering_data", "ai_engineering_recommendation"]);
        assert.equal(snapshot.aiMetadata.engineering_approved, false);
      }
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      if (mode !== "unmount") assert.ok(await page.locator("h3").evaluate(node => getComputedStyle(node).fontSize === "13px"));
      for (const entries of Object.values(telemetry)) assert.deepEqual(entries, []);
      screenshot = DIR + `foundation-ai-review-browser-${mode}-${width}.png`;
      await page.screenshot({ path: screenshot, fullPage: true });
      results.push({ mode, width, ok: true, snapshot, screenshot, telemetry }); console.log("ok", mode, width);
    } catch (error) {
      screenshot ||= DIR + `foundation-ai-review-browser-${mode}-${width}-failed.png`;
      await page.screenshot({ path: screenshot, fullPage: true }).catch(() => {});
      snapshot ||= await page.evaluate(() => window.__foundationAiNativeInspect()).catch(() => null);
      results.push({ mode, width, ok: false, error: error.stack, snapshot, screenshot, telemetry });
      console.error("FAIL", mode, width, error.message);
    } finally { await context.close(); }
  }
} finally { await browser.close(); await new Promise(done => server.close(done)); }
fs.writeFileSync(DIR + "foundation-ai-review-browser-verification.json", JSON.stringify({
  results, syntheticOnly: true, actualModelCalled: false, realStorageVerified: false,
  engineeringApproved: false, financialValuesApplied: false,
}, null, 2) + "\n");
if (results.some(result => !result.ok)) process.exitCode = 1;

import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { createHash } from "node:crypto";
import { build } from "esbuild";
import { chromium } from "playwright-core";

const DIR = ".audit-work/foundation-reinforcement18/";
const OUTPUT = process.env.WALL_CAP_GEOMETRY_BROWSER_OUTPUT || "wall-cap-geometry-browser";
const ROOT = "src/components/estimator/foundation/";
const scope = JSON.parse(fs.readFileSync(DIR + "wall-cap-sandbox-after-checkpoint-scope.json", "utf8"));
assert.equal(scope.head, "e1fbae8e8bc2162a5bd184b0cc4ccc2dfbe78f3b");
const overrides = {};
for (const name of ["foundationCatalogIntegrity.js", "FoundationBOM.jsx", "FoundationTotals.jsx", "legacyFoundationCalc.js"]) {
  const captured = scope.files.find(file => file.path === ROOT + name);
  assert.ok(captured?.exists); overrides[captured.path] = captured.normalized;
}
const remote = JSON.parse(fs.readFileSync(DIR + "wall-cap-geometry-remote-validation.json", "utf8"));
assert.equal(remote.files.length, 2);
for (const file of remote.files) {
  assert.ok(["foundationInputValidation.js", "foundationEquipmentBindings.js"].some(name => file.path === ROOT + name));
  assert.ok(!file.error && typeof file.content === "string" && file.content.length > 0);
  overrides[file.path] = file.content;
}
for (const name of ["wallCapCalculator.js", "foundationCalc.js"])
  overrides[ROOT + name] = fs.readFileSync(DIR + "wall-cap-geometry-candidate-" + name, "utf8");
overrides[ROOT + "FoundationWallCapsPanel.jsx"] = fs.readFileSync(ROOT + "FoundationWallCapsPanel.jsx", "utf8");
const sha = text => createHash("sha256").update(text).digest("hex");
const loaded = {};
const built = await build({
  entryPoints: [DIR + "wall-cap-geometry-browser-fixture.jsx"], bundle: true, write: false,
  platform: "browser", format: "esm", jsx: "automatic", metafile: true, alias: { "@": path.resolve("src") },
  plugins: [{ name: "reviewed-foundation-sources", setup(b) {
    b.onLoad({ filter: /\.(jsx?|tsx?)$/ }, args => {
      const key = path.relative(process.cwd(), args.path).split(path.sep).join("/");
      if (!Object.hasOwn(overrides, key)) return;
      loaded[key] = sha(overrides[key]);
      return { contents: overrides[key], resolveDir: path.dirname(args.path), loader: key.endsWith(".jsx") ? "jsx" : "js" };
    });
  } }],
});
assert.deepEqual(Object.keys(loaded).sort(), Object.keys(overrides).sort());
for (const [file, source] of Object.entries(overrides)) assert.equal(loaded[file], sha(source));
const inputs = Object.keys(built.metafile.inputs);
assert.ok(!inputs.some(input => /base44Client\.js|node_modules\/@base44|foundationReinforcement/.test(input)));
for (const file of Object.keys(overrides)) assert.equal(inputs.filter(input => input.endsWith(file)).length, 1);
assert.deepEqual(built.warnings, []);
fs.writeFileSync(DIR + OUTPUT + "-meta.json", JSON.stringify({ metafile: built.metafile, loaded }, null, 2));
const css = fs.readFileSync(DIR + OUTPUT + ".css", "utf8"), js = built.outputFiles[0].text;
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
const cases = [
  ["saved", 21, true, "18"], ["unknown", null, true, "18"],
  ["zero", 0, false, "18"], ["current", 25, false, "18"],
  ["oversize", 21, true, "49"], ["stock_unknown", 21, true, "18"],
  ["cut_unknown", 21, true, ""], ["legacy", 25, false, "18"],
];
const layoutRed = process.env.WALL_CAP_GEOMETRY_LAYOUT_RED === "1";
const selectedCases = layoutRed ? cases.filter(([name]) => name === "unknown") : cases;
const widths = layoutRed ? [390] : [1280, 390];
try {
  for (const [mode, cost, blocked, inputValue] of selectedCases) for (const width of widths) {
    const context = await browser.newContext({ viewport: { width, height: 1100 } }), page = await context.newPage();
    const telemetry = { errors: [], pageErrors: [], requestFailures: [], external: [], unexpectedLocal: [] };
    page.on("console", message => { if (message.type() === "error") telemetry.errors.push(message.text()); });
    page.on("pageerror", error => telemetry.pageErrors.push(String(error)));
    page.on("requestfailed", request => telemetry.requestFailures.push(request.url()));
    await page.route("**/*", async route => {
      if (new URL(route.request().url()).origin !== origin) {
        telemetry.external.push(route.request().url()); await route.abort(); return;
      }
      if (!["/", "/fixture.js", "/fixture.css", "/favicon.ico"].includes(new URL(route.request().url()).pathname)) {
        telemetry.unexpectedLocal.push(route.request().url()); await route.abort(); return;
      }
      await route.continue();
    });
    let initial, final;
    const screenshots = [];
    const capture = async (suffix, verifyLayout = true) => {
      if (verifyLayout) {
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "No page overflow");
        const spacing = await page.getByTestId("cap-panel").locator("span.font-bold.text-gray-900").evaluate(node => {
          const stock = node.parentElement.parentElement.querySelector(":scope > span").getBoundingClientRect();
          const cost = node.getBoundingClientRect();
          return { horizontal: cost.left - stock.right, vertical: cost.top - stock.bottom,
            costHeight: cost.height, lineHeight: parseFloat(getComputedStyle(node).lineHeight) };
        });
        assert.ok(spacing.horizontal >= 8 || spacing.vertical >= 8, "Stock and cost need visible separation");
        assert.ok(spacing.costHeight <= spacing.lineHeight + 0.5, "A cost or Not saved must stay on one line");
      }
      const file = DIR + `${OUTPUT}-${mode}-${width}-${suffix}.png`;
      await page.screenshot({ path: file, fullPage: true }); screenshots.push(file);
    };
    const inspect = () => page.evaluate(() => window.__wallCapGeometryInspect());
    try {
      await page.goto(origin + "/?mode=" + mode, { waitUntil: "networkidle" });
      const panel = page.getByTestId("cap-panel"), cut = panel.getByRole("spinbutton", { name: "Cap 1 cut length (inches)", exact: true });
      await page.getByRole("heading", { name: "Wall Caps", exact: true }).waitFor();
      initial = await inspect();
      assert.equal(initial.sourceUnchanged, true); assert.equal(initial.actualBusinessWrites, 0);
      assert.equal(initial.capCost, cost); assert.equal(initial.total, cost); assert.equal(initial.grandTotal, cost);
      assert.equal(initial.blocked, blocked); assert.equal(initial.groups[0].qty, 1); assert.equal(initial.groups[0].cost, cost);
      assert.equal(initial.edits, 0); assert.equal(initial.writes, 0);
      assert.equal(await cut.inputValue(), inputValue);
      assert.equal(await page.getByTestId("synthetic-save").isDisabled(), blocked);
      assert.equal(await panel.getByText("Saved amounts (not current pricing)", { exact: true }).count(), blocked ? 1 : 0);
      for (const section of ["totals-panel", "bom-panel"])
        assert.equal(await page.getByTestId(section).getByText("Pricing unavailable", { exact: true }).count(), blocked ? 1 : 0);
      if (cost === null) {
        assert.ok(!(await panel.innerText()).includes("$0.00"));
        await panel.getByText("Not saved", { exact: true }).waitFor();
        const row = page.getByTestId("bom-panel").locator("tr").filter({ hasText: "Acknowledged cap" });
        assert.match(await row.innerText(), /Not saved/);
      } else await panel.getByText(`$${cost.toFixed(2)}`, { exact: true }).waitFor();
      const moneyStyle = await panel.locator("span.font-bold.text-gray-900").evaluate(node => getComputedStyle(node).fontSize);
      assert.equal(moneyStyle, await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize) * 0.75 + "px"), "Actual footer CSS");
      assert.equal(await cut.evaluate(node => getComputedStyle(node).borderTopWidth), "1px", "Actual Input CSS");
      if (["oversize", "cut_unknown"].includes(mode)) assert.equal(await cut.getAttribute("aria-invalid"), "true");
      if (mode === "stock_unknown") {
        assert.equal(initial.selectedStock, null); assert.equal(initial.stock, 48); assert.equal(initial.rawCost, 25);
        assert.ok((await panel.innerText()).includes("Saved stock length:"));
      }
      if (mode === "cut_unknown") { assert.equal(initial.rawCut, ""); assert.equal(initial.legacyCut, 18); }
      if (mode === "oversize") { assert.equal(initial.rawCost, 25); assert.equal(initial.savedCost, 21); }
      if (mode === "legacy") assert.equal(initial.canonicalOwn, false);
      await capture("initial");
      if (mode === "current") {
        await panel.getByLabel("Cap material", { exact: true }).selectOption("inventory-long");
        await page.waitForFunction(() => window.__wallCapGeometryInspect().selectedStock === 96);
        assert.equal((await inspect()).rawCut, 18); assert.equal((await inspect()).capCost, 25);
        await panel.getByLabel("Cap material", { exact: true }).selectOption("inventory-short");
        await page.waitForFunction(() => window.__wallCapGeometryInspect().blocked);
        let state = await inspect();
        assert.equal(state.rawCut, 18); assert.equal(state.capCost, 21); assert.equal(state.stock, 48);
        assert.equal(state.groups[0].qty, 1); assert.equal(await cut.getAttribute("aria-invalid"), "true");
        assert.ok((await panel.innerText()).includes("selected stock length (12 in)"));
        await page.getByTestId("synthetic-save").evaluate(node => node.click());
        assert.equal((await inspect()).writes, 0);
        await capture("shorter-stock");
        await cut.fill(""); await page.waitForFunction(() => window.__wallCapGeometryInspect().rawCut === "");
        assert.equal((await inspect()).capCost, 21); assert.equal(await cut.inputValue(), "");
        await capture("cleared");
        await cut.fill("12"); await page.waitForFunction(() => !window.__wallCapGeometryInspect().blocked);
        state = await inspect(); assert.equal(state.capCost, 30); assert.equal(state.rawCutType, "number");
        assert.equal(state.groups[0].qty, 1);
        await page.getByTestId("synthetic-save").click();
        await page.waitForFunction(() => window.__wallCapGeometryInspect().writes === 1);
        assert.equal((await inspect()).savedCost, 30);
        await cut.fill("13"); await page.waitForFunction(() => window.__wallCapGeometryInspect().blocked);
        state = await inspect(); assert.equal(state.capCost, 30); assert.equal(state.savedCost, 30);
        assert.equal(state.writes, 1); assert.equal(state.rawCut, 13);
        await capture("new-acknowledgment");
      } else if (mode === "legacy") {
        await panel.getByLabel("Cap material", { exact: true }).selectOption("inventory-long");
        await page.waitForFunction(() => window.__wallCapGeometryInspect().selectedStock === 96);
        let state = await inspect(); assert.equal(state.canonicalOwn, false); assert.equal(state.legacyCut, 18);
        await cut.fill("12.5"); await page.waitForFunction(() => window.__wallCapGeometryInspect().rawCut === 12.5);
        state = await inspect(); assert.equal(state.canonicalOwn, true); assert.equal(state.rawCutType, "number");
        assert.equal(state.legacyCut, 18); assert.equal(state.capCost, 25); assert.equal(state.groups[0].qty, 1);
        await capture("edited");
      }
      final = await inspect(); assert.equal(final.sourceUnchanged, true); assert.equal(final.actualBusinessWrites, 0);
      for (const entries of Object.values(telemetry)) assert.deepEqual(entries, []);
      results.push({ mode, width, ok: true, initial, final, screenshots, telemetry }); console.log("ok", mode, width);
    } catch (error) {
      await capture("failure", false).catch(() => {});
      results.push({ mode, width, ok: false, error: error.stack, initial, final, screenshots, telemetry });
      console.error("FAIL", mode, width, error.message);
    } finally { await context.close(); }
  }
} finally { await browser.close(); await new Promise(done => server.close(done)); }
fs.writeFileSync(DIR + OUTPUT + "-verification.json", JSON.stringify({
  results, syntheticOnly: true, realStorageVerified: false, actualBusinessWrites: 0, sdkCalls: 0,
}, null, 2) + "\n");
if (results.some(result => !result.ok)) process.exitCode = 1;

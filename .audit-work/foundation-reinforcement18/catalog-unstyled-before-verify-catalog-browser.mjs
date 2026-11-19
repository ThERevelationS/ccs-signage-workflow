import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { build } from "esbuild";
import { chromium } from "playwright-core";

const DIR = ".audit-work/foundation-reinforcement18/";
const stubs = {
  "@/api/base44Client": `export const base44={entities:{FoundationInventory:{async get(id){
    const env=window.__catalogMetaBrowser;env.calls.push(["get",id]);if(id!==env.record.id)throw Error("Unexpected identity");return structuredClone(env.record);
  }}}};`,
  "@/components/staff/staffEntities": `export const staffEntities={FoundationInventory:{}};`,
  "@/components/estimator/builder/builderEntityPersistence": `
    export const expectedEntityFields=(row,data)=>Object.fromEntries(Object.keys(data).map(key=>[key,row[key]]));
    export async function replaceEntityFieldsIfUnchanged(args){window.__catalogMetaBrowser.calls.push(["replace",structuredClone(args.nextFields)]);}
    export function deleteEntityIfUnchanged(){throw Error("Unexpected delete");}`,
  "@/components/masterInventory/inventoryPersistence": `export async function createInventoryRecordWithRecovery(args){
    window.__catalogMetaBrowser.calls.push(["create",structuredClone(args.data)]);
  }`,
  "@/components/estimator/loadAllEntityRows": `export function loadAllEntityRows(){throw Error("Unexpected collection read");}`,
  "@/components/foundation/EquipmentInventoryTab": "export default function Component(){return null;}",
  "@/components/foundation/WallCapsInventoryTab": "export default function Component(){return null;}",
};
stubs["./inventoryPersistence"] = stubs["@/components/masterInventory/inventoryPersistence"];
const built = await build({
  entryPoints: [DIR + "catalog-browser-fixture.jsx"], bundle: true, write: false, outdir: "out", platform: "browser",
  format: "esm", jsx: "automatic", alias: { "@": path.resolve("src") }, metafile: true,
  plugins: [{ name: "offline-catalog-boundaries", setup(builder) {
    builder.onResolve({ filter: /.*/ }, args => stubs[args.path] ? { path: args.path, namespace: "offline" } : null);
    builder.onLoad({ filter: /.*/, namespace: "offline" }, args => ({ contents: stubs[args.path], loader: "js", resolveDir: process.cwd() }));
    builder.onLoad({ filter: /[\\/]src[\\/]pages[\\/]FoundationInventory\.jsx$/ }, args => ({
      contents: fs.readFileSync(args.path, "utf8") + "\nexport { GenericItemForm };\n", loader: "jsx",
    }));
  } }],
});
const inputs = Object.keys(built.metafile.inputs);
for (const file of ["src/components/masterInventory/FoundationMaterialDialog.jsx", "src/pages/FoundationInventory.jsx",
  "src/components/estimator/foundation/FoundationReinforcementCatalogMetadataFields.jsx",
  "src/components/estimator/foundation/foundationReinforcementCatalogMetadata.js",
  "src/components/estimator/foundation/ReinforcementDraftField.jsx", "src/components/ui/dialog.jsx", "src/components/ui/input.jsx"])
  assert.ok(inputs.includes(file), "Actual module required: " + file);
assert.ok(!inputs.some(file => file.includes("base44Client.js") || file.includes("node_modules/@base44/")));
fs.writeFileSync(DIR + "catalog-browser-meta.json", JSON.stringify(built.metafile, null, 2) + "\n");
const js = built.outputFiles.find(file => file.path.endsWith(".js")).text;
fs.writeFileSync(DIR + "catalog-browser-bundle.js", js);
const css = fs.readFileSync(DIR + "page-browser.css", "utf8");
const html = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"></head><body><div id="root"></div><script type="module" src="/fixture.js"></script></body></html>';
const server = http.createServer((request, response) => {
  const file = { "/fixture.js": ["text/javascript", js], "/fixture.css": ["text/css", css] }[request.url];
  if (file) { response.writeHead(200, { "Content-Type": file[0] }); response.end(file[1]); return; }
  if (request.url === "/favicon.ico") { response.writeHead(204); response.end(); return; }
  response.writeHead(request.url?.startsWith("/?mode=") ? 200 : 404, { "Content-Type": "text/html; charset=utf-8" }); response.end(html);
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({
  executablePath: "C:/Users/BrettHeinlein/AppData/Local/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-win64/chrome-headless-shell.exe",
});
const results = [];
const D = "Nominal bar diameter (in)", W = "Weight (lb/ft)";
const calls = page => page.evaluate(() => window.__catalogMetaBrowser.calls);
async function check(mode, width) {
  const context = await browser.newContext({ viewport: { width, height: 1000 } }), page = await context.newPage();
  const telemetry = { pageErrors: [], consoleErrors: [], externalRequests: [], requestFailures: [] };
  page.on("pageerror", error => telemetry.pageErrors.push(String(error)));
  page.on("console", message => { if (message.type() === "error") telemetry.consoleErrors.push(message.text()); });
  page.on("requestfailed", request => telemetry.requestFailures.push(request.url()));
  page.on("dialog", dialog => { telemetry.pageErrors.push("Unexpected dialog: " + dialog.message()); return dialog.dismiss(); });
  await page.route("**/*", route => {
    const url = new URL(route.request().url());
    if (url.origin === origin && ["/", "/fixture.js", "/fixture.css", "/favicon.ico"].includes(url.pathname)) return route.continue();
    telemetry.externalRequests.push(url.href); return route.abort();
  });
  try {
    await page.goto(origin + "/?mode=" + mode, { waitUntil: "networkidle" });
    const scope = mode === "legacy" ? page.locator("main") : page.getByRole("dialog");
    const diameter = scope.getByLabel(D, { exact: true }), weight = scope.getByLabel(W, { exact: true });
    const save = scope.getByRole("button", { name: "Save", exact: true });
    await weight.waitFor(); assert.equal(await weight.getAttribute("inputmode"), "decimal");
    assert.ok(await scope.getByRole("heading", { name: "Preliminary reinforcement metadata", exact: true })
      .evaluate(element => parseFloat(getComputedStyle(element.parentElement).paddingTop) > 0), "Actual styled metadata section");
    if (mode === "new") {
      assert.equal(await diameter.inputValue(), ""); assert.equal(await weight.inputValue(), "");
      assert.equal(await weight.getAttribute("placeholder"), "Not recorded");
      await scope.getByLabel("Name", { exact: true }).fill("Synthetic new bar");
      await page.screenshot({ path: DIR + `catalog-browser-new-${width}.png`, fullPage: true });
      await save.click(); await page.waitForFunction(() => window.__catalogMetaBrowser.saved === 1);
      const first = (await calls(page)).filter(call => call[0] === "create");
      assert.equal(first.length, 1); assert.equal(Object.hasOwn(first[0][1], "rebar_diameter_inches"), false);
      assert.equal(Object.hasOwn(first[0][1], "rebar_weight_lb_per_ft"), false);
      await diameter.fill(".5"); await weight.fill(".668"); await save.click();
      await page.waitForFunction(() => window.__catalogMetaBrowser.saved === 2);
      const second = (await calls(page)).filter(call => call[0] === "create")[1][1];
      assert.equal(second.rebar_diameter_inches, 0.5); assert.equal(second.rebar_weight_lb_per_ft, 0.668);
      assert.equal(second.material_type, "rebar"); assert.equal(second.material_name, "Synthetic new bar");
    } else {
      assert.equal(await diameter.inputValue(), "0.5"); assert.equal(await weight.inputValue(), "0.668");
      await weight.fill("0"); assert.equal(await save.isDisabled(), true);
      assert.ok(await scope.getByRole("alert").count() > 0); assert.deepEqual(await calls(page), []);
      if (mode === "dialog") await page.screenshot({ path: DIR + `catalog-browser-invalid-${width}.png`, fullPage: true });
      await weight.fill("unfinished"); assert.equal(await save.isDisabled(), true); assert.deepEqual(await calls(page), []);
      await diameter.fill(".5"); await weight.fill(".668"); assert.equal(await weight.inputValue(), ".668");
      await save.click();
      if (mode === "dialog") await page.waitForFunction(() => window.__catalogMetaBrowser.saved === 1);
      const kind = mode === "legacy" ? "legacy" : "replace";
      const first = (await calls(page)).filter(call => call[0] === kind);
      assert.equal(first.length, 1); assert.equal(first[0][1].rebar_diameter_inches, 0.5); assert.equal(first[0][1].rebar_weight_lb_per_ft, 0.668);
      assert.equal(first[0][1].cost_per_unit, 2); assert.equal(first[0][1].unit, "lf");
      if (mode === "legacy") await page.screenshot({ path: DIR + `catalog-browser-legacy-${width}.png`, fullPage: true });
      await weight.fill(""); await save.click();
      if (mode === "dialog") await page.waitForFunction(() => window.__catalogMetaBrowser.saved === 2);
      const second = (await calls(page)).filter(call => call[0] === kind)[1][1];
      assert.equal(second.rebar_weight_lb_per_ft, null); assert.equal(second.rebar_diameter_inches, 0.5);
    }
    assert.equal(await page.evaluate(() => JSON.stringify(window.__catalogMetaBrowser.record) === window.__catalogMetaBrowser.baseline), true);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), "No full-page horizontal overflow");
    if (mode !== "legacy") assert.ok(await scope.evaluate(element => element.scrollWidth <= element.clientWidth + 1), "No dialog horizontal overflow");
    for (const value of Object.values(telemetry)) assert.deepEqual(value, []);
    results.push({ mode, width, ok: true, telemetry }); console.log("ok", mode, width);
  } catch (error) {
    await page.screenshot({ path: DIR + `catalog-browser-FAIL-${mode}-${width}.png`, fullPage: true });
    results.push({ mode, width, ok: false, error: String(error.stack), telemetry }); console.error("FAIL", mode, width, error.message);
  } finally { await context.close(); }
}
try { for (const width of [1440, 390]) for (const mode of ["dialog", "new", "legacy"]) await check(mode, width); }
finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
fs.writeFileSync(DIR + "catalog-browser-verification.json", JSON.stringify({
  mockedIO: true, realBase44StorageVerified: false, explicitNullClearReadbackVerified: false, results,
}, null, 2) + "\n");
const failed = results.filter(result => !result.ok).length;
console.log(`Catalog browser: ${results.length - failed}/${results.length}; failed=${failed}`);
process.exitCode = failed ? 1 : 0;

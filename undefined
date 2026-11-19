import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { build } from "esbuild";
import { chromium } from "playwright-core";

const DIR = ".audit-work/foundation-reinforcement18/";
const forbidden = name => `export function ${name}(){globalThis.__foundationBrowser.forbidden.push(${JSON.stringify(name)});throw Error("Forbidden offline operation: ${name}");}`;
const dummy = "export default function Component(){return null;}";
const stubs = {
  "react-router-dom": `import React from"react";export const Link=({to,children,...props})=>React.createElement("a",{...props,href:to},children);
    export const useNavigate=()=>url=>window.__foundationBrowser.nav.push(url);`,
  "@/components/auth/EmailGate": `export const useAuth=()=>({currentUser:{id:"synthetic-owner"}});`,
  "@/components/markup/projectCategorizer": forbidden("categorizeFoundationProject"),
  "@/components/markup/savedCustomerPricing": forbidden("calculateSavedCustomerPricing"),
  "@/components/markup/CustomerPricingTab": dummy,
  "@/components/estimator/builder/builderService": forbidden("recordBuilderSave") + `export const foundationRecordSavedTotal=r=>{if(!r||typeof r!=='object')return null;const f=['total_concrete_cost','total_rebar_cost','total_excavation_cost','total_forming_materials_cost','total_labor_cost','total_wall_cost','total_pole_cost','total_pole_painting_cost','total_equipment_cost','total_wall_cap_cost','total_signage_cabinet_cost','total_landscape_cost'];if(f.some(k=>Number.isFinite(+r[k])))return f.reduce((t,k)=>t+(Number.isFinite(+r[k])?+r[k]:0),0);return Number.isFinite(+r.grand_total)?+r.grand_total:null;};`,
  "@/components/estimator/estimateMutationGuard": forbidden("assertEstimateProductMutationAllowed"),
  "@/lib/loadAllEntityRows": `export async function loadAllEntityRows({entity}){
    const env=window.__foundationBrowser;env.calls.push(["load",entity.tag]);
    if(entity.tag==="FoundationInventory")return structuredClone(env.inventory);
    if(["Settings","LaborServiceInventory"].includes(entity.tag))return [];
    throw Error("Unexpected collection read "+entity.tag);
  }`,
  "@/components/estimator/loadAllEntityRows": `export async function loadAllEntityRows({entity}){
    const env=window.__foundationBrowser;env.calls.push(["load",entity.tag]);
    if(entity.tag==="FoundationInventory")return structuredClone(env.inventory);
    if(["Settings","LaborServiceInventory"].includes(entity.tag))return [];
    throw Error("Unexpected collection read "+entity.tag);
  }`,
  "@/components/estimator/idempotentEntityCreate": `let n=0;export const newCreationRequestKey=prefix=>prefix+"-"+(++n);${forbidden("ensureIdempotentEntityCreate")}`,
  "@/components/estimator/foundation/convertToBrickStone": forbidden("convertFoundationToBrickStone"),
  "@/components/estimator/moduleShared/moduleProjectActions": forbidden("createEstimateReadOnlyShareLink"),
  "@/components/staff/staffEntities": `export const staffEntities={
    FoundationProject:{
      async get(id){const env=window.__foundationBrowser;env.calls.push(["get",id]);if(id!==env.row.id)throw Error("Wrong source identity");return structuredClone(env.row);},
      async updateMany(query,update){const env=window.__foundationBrowser;env.calls.push(["updateMany",structuredClone(query),structuredClone(update)]);
        if(env.row.id!==query.id||env.row.updated_date!==query.updated_date)return{updated:0};
        env.version++;env.row=JSON.parse(JSON.stringify({...env.row,...update.$set,updated_date:"2026-11-07T12:00:0"+env.version+".000Z"}));return{updated:1};}
    },
    FoundationInventory:{tag:"FoundationInventory"},Settings:{tag:"Settings"},LaborServiceInventory:{tag:"LaborServiceInventory"},
    AllInOneEstimate:{get(){window.__foundationBrowser.forbidden.push("estimate.get");throw Error("Unexpected linked estimate read");}}
  };`,
};
for (const name of ["FoundationRatesPanel", "FoundationEquipmentTab", "ConcreteDeliveryPanel", "FoundationWallsPanel",
  "FoundationWallCapsPanel", "FoundationPolesPanel", "FoundationSectionBanner", "AiEngineeringAssistant", "Foundation3DPreview",
  "FoundationTemplateDialog", "FoundationLayoutCanvas", "SignageCabinetsPanel", "LandscapeDesigner", "CustomerPricingPanel",
  "FoundationAiIntake", "FoundationPhotoIntake"])
  stubs["@/components/estimator/foundation/" + name] = dummy;
stubs["@/components/estimator/foundation/foundationBuilderRecovery"] = `
  export async function loadFoundationBuilderRecovery({estimateId}){
    if(estimateId)throw Error("Unlinked page regression must not attempt linked Builder recovery.");
    return null;
  }
  export function verifyFoundationRecoverySource(){throw Error("Unlinked page regression must not verify a linked recovery.");}`;
stubs["@/components/estimator/foundation/FoundationSyncConflictDialog"] =
  `export const useFoundationSyncConflict=()=>({conflicts:[],dismiss(){},report(){}});`+
  `export const useFoundationBuilderSyncRetry=()=>({retry(){},retrying:false,lastError:null});`+
  `export const FoundationSyncRetryAction=()=>null;export default ()=>null;`;
const built = await build({
  entryPoints: [DIR + "page-browser-fixture.jsx"], bundle: true, write: false, outdir: "out",
  platform: "browser", format: "esm", jsx: "automatic", alias: { "@": path.resolve("src") }, metafile: true,
  plugins: [{ name: "offline-page-network-boundaries", setup(builder) {
    builder.onResolve({ filter: /.*/ }, args => stubs[args.path] ? { path: args.path, namespace: "offline" } : null);
    builder.onLoad({ filter: /.*/, namespace: "offline" }, args => ({
      contents: stubs[args.path], loader: "js", resolveDir: process.cwd(),
    }));
  } }],
});
const inputs = Object.keys(built.metafile.inputs);
for (const file of ["src/pages/FoundationEstimator.jsx", "src/components/estimator/foundation/FoundationToolbar.jsx",
  "src/components/estimator/foundation/FoundationItemCard.jsx", "src/components/estimator/foundation/FoundationReinforcementProposalPanel.jsx",
  "src/components/estimator/foundation/useFoundationReinforcementEditor.js",
  "src/components/estimator/foundation/foundationReinforcementEditorSession.js", "src/components/estimator/foundation/foundationCalc.js",
  "src/components/estimator/foundation/FoundationBOM.jsx", "src/components/estimator/builder/sourceProjectPersistence.js",
  "src/components/ui/tabs.jsx", "src/components/ui/input.jsx"])
  assert.ok(inputs.includes(file), "Actual module required: " + file);
const sdkLeaks = inputs.filter(file => file.includes("base44Client") || file.includes("node_modules/@base44/"));
if (sdkLeaks.length) console.log("sdk-boundary leaks:", sdkLeaks.slice(0, 8).join(", "));
assert.ok(!sdkLeaks.length);
fs.writeFileSync(DIR + "page-browser-meta.json", JSON.stringify(built.metafile, null, 2) + "\n");
const js = built.outputFiles.find(file => file.path.endsWith(".js")).text;
fs.writeFileSync(DIR + "page-browser-bundle.js", js);
const css = fs.readFileSync(DIR + "page-browser.css", "utf8");
const html = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"></head><body><div id="root"></div><script type="module" src="/fixture.js"></script></body></html>';
const server = http.createServer((request, response) => {
  const file = { "/fixture.js": ["text/javascript", js], "/fixture.css": ["text/css", css] }[request.url];
  if (file) { response.writeHead(200, { "Content-Type": file[0] }); response.end(file[1]); return; }
  if (request.url === "/favicon.ico") { response.writeHead(204); response.end(); return; }
  response.writeHead(request.url?.startsWith("/?id=browser-source") ? 200 : 404, { "Content-Type": "text/html; charset=utf-8" });
  response.end(html);
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({
  executablePath: "C:/Users/BrettHeinlein/AppData/Local/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-win64/chrome-headless-shell.exe",
});
const results = [];
const panel = page => page.getByText("Reinforcement proposal", { exact: true }).locator("../..");
const total = page => page.getByText(/^Total: /);
const accept = page => page.getByRole("button", { name: "Accept Proposal", exact: true });
const refresh = page => page.getByRole("button", { name: "Refresh Preview", exact: true });
const prelim = page => page.getByLabel("I understand this is preliminary only, not engineering approval.", { exact: true });
async function settleText(locator, text) {
  await locator.filter({ hasText: text }).waitFor();
  assert.equal((await locator.innerText()).trim(), text);
}
async function ready(page) {
  await refresh(page).click();
  assert.equal(await accept(page).isDisabled(), true);
  for (const [label, expected] of [["Saved steel", "$262.80"], ["Current steel", "$252.80"], ["Proposed steel", "$112.00"],
    ["Current section", "$834.80"], ["Proposed section", "$694.00"], ["Section delta", "$-140.80"]]) {
    const row = panel(page).getByText(label, { exact: true }).locator("..");
    assert.ok((await row.innerText()).includes(expected), label + " must display its own exact amount");
  }
  await prelim(page).check();
  const labels = panel(page).locator("label").filter({ hasText: /^Acknowledge warning: / });
  assert.ok(await labels.count() > 0);
  for (let index = 0; index < await labels.count(); index += 1) await labels.nth(index).locator('input[type="checkbox"]').check();
  assert.equal(await accept(page).isDisabled(), true);
  await refresh(page).click();
  await page.waitForFunction(() => [...document.querySelectorAll("button")].find(button => button.textContent.trim() === "Accept Proposal")?.disabled === false);
}
async function check(name, width, run) {
  const context = await browser.newContext({ viewport: { width, height: 1000 } }), page = await context.newPage();
  const telemetry = { pageErrors: [], consoleErrors: [], externalRequests: [], requestFailures: [] };
  page.on("pageerror", error => telemetry.pageErrors.push(String(error)));
  page.on("console", message => { if (message.type() === "error") telemetry.consoleErrors.push(message.text()); });
  page.on("requestfailed", request => telemetry.requestFailures.push(request.url()));
  page.on("dialog", dialog => dialog.accept());
  await page.route("**/*", route => {
    const url = new URL(route.request().url());
    if (url.origin === origin && ["/", "/fixture.js", "/fixture.css", "/favicon.ico"].includes(url.pathname)) return route.continue();
    telemetry.externalRequests.push(url.href); return route.abort();
  });
  try {
    await page.goto(origin + "/?id=browser-source", { waitUntil: "networkidle" });
    await page.getByRole("heading", { name: "Edit Concrete | Masonry | Poles Estimate", exact: true }).waitFor();
    await panel(page).waitFor();
    assert.ok(await panel(page).evaluate(element => parseFloat(getComputedStyle(element).paddingTop) > 0));
    await settleText(total(page), "Total: $834.80");
    await run(page);
    assert.equal(await page.evaluate(() => JSON.stringify(window.__foundationBrowser.baseline) === window.__foundationBrowser.baselineJSON), true);
    assert.deepEqual(await page.evaluate(() => window.__foundationBrowser.forbidden), []);
    for (const value of Object.values(telemetry)) assert.deepEqual(value, []);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), "No full-page horizontal overflow");
    results.push({ name, width, ok: true, telemetry });
    console.log("ok", name, width);
  } catch (error) {
    const layout = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth,
      elements: [...document.body.querySelectorAll("*")].map(element => {
        const bounds = element.getBoundingClientRect();
        return { tag: element.tagName, className: typeof element.className === "string" ? element.className : "",
          left: bounds.left, right: bounds.right, width: bounds.width, text: element.textContent?.slice(0, 180) };
      }).filter(element => element.right > document.documentElement.clientWidth + 1).slice(-60),
    }));
    await page.screenshot({ path: DIR + `page-browser-FAIL-${name}-${width}.png`, fullPage: true });
    results.push({ name, width, ok: false, error: String(error.stack), telemetry, layout });
    console.error("FAIL", name, width, error.message);
  } finally { await context.close(); }
}
try {
  for (const width of [1440, 390]) {
    await check("accept-undo-save-bom", width, async page => {
      await ready(page);
      assert.equal(await page.evaluate(() => window.__foundationBrowser.calls.filter(call => call[0] === "updateMany").length), 0);
      await page.screenshot({ path: DIR + `page-browser-preview-${width}.png`, fullPage: true });
      await accept(page).click(); await settleText(total(page), "Total: $694.00");
      await page.getByText(/Version 2 reinforcement uses the accepted design/).waitFor();
      assert.equal(await page.getByLabel("Rebar size", { exact: true }).count(), 0);
      await page.getByRole("button", { name: "Undo", exact: true }).click(); await settleText(total(page), "Total: $834.80");
      assert.equal(await page.getByLabel("Rebar size", { exact: true }).count(), 1);
      assert.equal(await accept(page).count(), 1); assert.equal(await accept(page).isDisabled(), true);
      await page.getByRole("button", { name: "Redo", exact: true }).click(); await settleText(total(page), "Total: $694.00");
      assert.equal(await page.evaluate(() => window.__foundationBrowser.calls.filter(call => call[0] === "updateMany").length), 0);
      await page.screenshot({ path: DIR + `page-browser-accepted-${width}.png`, fullPage: true });
      await page.getByRole("button", { name: "Save", exact: true }).click();
      await page.getByText(/^All changes saved/).waitFor();
      const data = await page.evaluate(() => window.__foundationBrowser);
      assert.equal(data.calls.filter(call => call[0] === "updateMany").length, 1);
      const item = data.row.items[0];
      assert.equal(item.reinforcement_calculation_version, 2); assert.equal(item.reinforcement_acceptance.component_id, "one");
      assert.equal(item.reinforcement_acceptance.source_id, "browser-source"); assert.equal(item.reinforcement_acceptance.engineering_approved, false);
      assert.equal(Math.round(item.rebar_material_cost * 100), 4000); assert.equal(Math.round(item.rebar_labor_cost * 100), 7200);
      assert.equal(item.rebar_geometry_feet, 20); assert.equal(Object.hasOwn(item, "reinforcement_proposal"), false);
      await page.getByRole("tab", { name: "Bill of Materials", exact: true }).click();
      const rows = page.getByRole("tabpanel").locator("tbody > tr");
      assert.equal(await rows.count(), 3);
      for (const [label, quantity, cost] of [
        ["Ready-mix concrete (delivered)", "1 CY", "$381.00"],
        ["Foundation one - Synthetic (material)", "20 LF physical / 20 LF priced", "$40.00"],
        ["Foundation one - reinforcement labor", "1.2 hr", "$72.00"],
      ]) {
        const matches = [];
        for (let index = 0; index < await rows.count(); index += 1) {
          const text = await rows.nth(index).locator("td").first().evaluate(element => element.firstChild.textContent.trim());
          if (text === label) matches.push(index);
        }
        assert.equal(matches.length, 1, label); const cells = rows.nth(matches[0]).locator("td");
        assert.equal((await cells.nth(1).innerText()).trim(), quantity); assert.equal((await cells.nth(2).innerText()).trim(), cost);
      }
      const subtotal = page.getByText("Listed cost subtotal", { exact: true }).locator("..");
      assert.ok((await subtotal.innerText()).includes("$493.00"));
      await page.screenshot({ path: DIR + `page-browser-bom-${width}.png`, fullPage: true });
    });
    await check("invalid-draft-reload-restore", width, async page => {
      await ready(page);
      await panel(page).getByLabel("Cover side (in)", { exact: true }).fill("-unfinished");
      await settleText(total(page), "Total: $834.80");
      await page.reload({ waitUntil: "networkidle" });
      await page.getByRole("button", { name: "Restore browser draft", exact: true }).waitFor();
      await page.getByRole("button", { name: "Restore browser draft", exact: true }).click();
      assert.equal(await panel(page).getByLabel("Cover side (in)", { exact: true }).inputValue(), "-unfinished");
      assert.equal(await prelim(page).isChecked(), false); assert.equal(await accept(page).isDisabled(), true);
      await refresh(page).click(); assert.equal(await accept(page).isDisabled(), true);
      await settleText(total(page), "Total: $834.80");
      assert.equal(await page.evaluate(() => window.__foundationBrowser.calls.filter(call => call[0] === "updateMany").length), 0);
      await page.screenshot({ path: DIR + `page-browser-recovered-${width}.png`, fullPage: true });
    });
  }
} finally {
  await browser.close(); await new Promise(resolve => server.close(resolve));
}
fs.writeFileSync(DIR + "page-browser-verification.json", JSON.stringify({ synthetic: true, mockedIO: true, realBase44StorageVerified: false, results }, null, 2) + "\n");
const failed = results.filter(result => !result.ok).length;
console.log(`Foundation page browser: ${results.length - failed}/${results.length}; failed=${failed}`);
process.exitCode = failed ? 1 : 0;

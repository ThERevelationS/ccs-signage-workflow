// Isolated real-Chromium acceptance for the real repair-estimate dialog.
// All Base44 requests are synthetic in-memory responses; outside requests are blocked.
import assert from "node:assert/strict";
import { mkdtemp, writeFile, symlink, copyFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";

const appRoot = process.cwd();
const playwrightPath = process.env.FLEET_PLAYWRIGHT_PATH || "/tmp/fleet-browser-check/node_modules/playwright/index.mjs";
const { chromium } = await import(playwrightPath);
const scratch = await mkdtemp(path.join(tmpdir(), "fleet-repair-estimate-browser-"));
const source = path.join(appRoot, "scripts/fleet-browser-harness");
let vite, browser, passed = 0;
try {
  await symlink(path.join(appRoot, "node_modules"), path.join(scratch, "node_modules"), "dir");
  const css = (await readdir(path.join(appRoot, "dist/assets"))).find(name => name.endsWith(".css"));
  if (!css) throw new Error("Run npm run build before browser acceptance.");
  await copyFile(path.join(appRoot, "dist/assets", css), path.join(scratch, "styles.css"));
  await writeFile(path.join(scratch, "index.html"),
    "<!doctype html><html><head><meta charset='UTF-8'><meta name='viewport' content='width=device-width,initial-scale=1'><link rel='stylesheet' href='/styles.css'></head><body><div id='root'></div><script type='module' src='/main.jsx'></script></body></html>");
  await writeFile(path.join(scratch, "main.jsx"), [
    'import React from "react";',
    'import { createRoot } from "react-dom/client";',
    'import { MemoryRouter } from "react-router-dom";',
    'import FleetWorkOrders from "/@fs/app/src/pages/FleetWorkOrders.jsx";',
    'createRoot(document.getElementById("root")).render(<MemoryRouter><FleetWorkOrders /></MemoryRouter>);',
  ].join("\n"));

  // Wrap the established Fleet browser fixture without changing its existing suite.
  await writeFile(path.join(scratch, "mockEstimate.js"), [
    'import { base44 as original, createPageUrl } from "/@fs/app/scripts/fleet-browser-harness/mockBase44.js";',
    'export { createPageUrl };',
    'const clone = value => JSON.parse(JSON.stringify(value));',
    'let revision = 0;',
    'const state = { actions: [], estimates: {}, failNextSubmit: false, hideOnSubmit: false };',
    'window.__fleetEstimateFixture = state;',
    'export const base44 = { ...original, functions: { ...original.functions, async invoke(name, payload) {',
    ' if (name !== "fleetRepairEstimateAction") return original.functions.invoke(name,payload);',
    ' state.actions.push({ name, payload: clone(payload) });',
    ' const id = payload.work_order_id;',
    ' if (payload.action === "get") return {data:{estimate:clone(state.estimates[id] || null)}};',
    ' if (payload.action === "save") {',
    '   const row = {...clone(payload.estimate), id:"estimate-"+id, work_order_id:id, status:"draft",',
    '     approval_required:true, updated_date:"synthetic-revision-"+(++revision)};',
    '   state.estimates[id]=row; return {data:{estimate:clone(row)}};',
    ' }',
    ' if (payload.action === "submit") {',
    '   if (state.failNextSubmit) {state.failNextSubmit=false; throw new Error("Synthetic submit transport error");}',
    '   const row = {...state.estimates[id], status:"submitted",updated_date:"synthetic-revision-"+(++revision)};',
    '   state.estimates[id]=row;',
    '   if (state.hideOnSubmit) window.__fleetBrowserFixture.orders.find(w=>w.id===id).status="completed";',
    '   return {data:{estimate:clone(row),auto_approved:false}};',
    ' }',
    ' if (payload.action === "decide") {',
    '   const row = {...state.estimates[id], status:payload.decision,updated_date:"synthetic-revision-"+(++revision)};',
    '   state.estimates[id]=row; return {data:{estimate:clone(row)}};',
    ' }',
    ' throw new Error("Unexpected synthetic repair-estimate action: "+payload.action);',
    '}}};',
  ].join("\n"));

  vite = await createServer({
    configFile: false, root: scratch, plugins: [react()],
    resolve: { alias: [
      { find: "@/api/base44Client", replacement: path.join(scratch, "mockEstimate.js") },
      { find: "@/utils", replacement: path.join(source, "mockBase44.js") },
      { find: "@/components/fleet/FleetModuleNav", replacement: path.join(source, "mockComponents.jsx") },
      { find: /^@\//, replacement: path.join(appRoot, "src") + "/" },
    ] },
    server: { host:"127.0.0.1",port:0,strictPort:false,fs:{allow:[appRoot,scratch]} },
    logLevel:"error",
  });
  await vite.listen();
  const origin = "http://127.0.0.1:" + vite.httpServer.address().port;
  browser = await chromium.launch({headless:true,args:["--no-sandbox"]});

  async function run(name, width, scenario) {
    const page = await browser.newPage({viewport:{width,height:width<500?844:900}});
    const errors = [], outside = [];
    page.on("pageerror", e=>errors.push(e.message));
    page.on("request", request => {
      if (request.url().startsWith("http") && !request.url().startsWith(origin)) outside.push(request.url());
    });
    await page.route("**/*",route=>{
      const url=route.request().url();
      return url.startsWith("http") && !url.startsWith(origin) ? route.abort("blockedbyclient") : route.continue();
    });
    try {
      await page.goto(origin,{waitUntil:"networkidle"});
      await page.locator("#fleet-work-order-toggle-wo-open").waitFor();
      await scenario(page);
      assert.deepEqual(errors, [], "No browser runtime errors");
      assert.deepEqual(outside, [], "No outside network requests");
      passed++; console.log("PASS " + name);
    } finally { await page.close(); }
  }
  async function openEstimate(page) {
    await page.locator("#fleet-work-order-toggle-wo-open").click();
    await page.getByRole("button",{name:"Estimate / Approval"}).click();
    const dialog=page.getByRole("dialog",{name:"Repair Estimate & Approval"});
    await dialog.getByRole("button",{name:"Save Draft"}).waitFor();
    return dialog;
  }
  const focusedRole = (page,role) => page.waitForFunction(r=>document.activeElement?.getAttribute("role")===r,role);

  await run("Desktop: acknowledged draft plus failed refresh keeps retry and keyboard focus",1440,async page=>{
    const dialog=await openEstimate(page);
    await page.evaluate(()=>{window.__fleetBrowserFixture.failNextWorkOrderList=true;});
    await dialog.getByRole("button",{name:"Save Draft"}).click();
    const warning=dialog.getByRole("alert");
    await warning.waitFor();
    assert.match(await warning.innerText(),/Draft saved.*could not refresh.*do not repeat/);
    assert.match(await dialog.getByRole("status").innerText(),/draft saved/);
    await focusedRole(page,"alert");
    await page.keyboard.press("Tab");
    assert.equal(await dialog.getByRole("button",{name:"Close repair estimate"})
      .evaluate(el=>document.activeElement===el),true,"Tab remains trapped after warning focus");
    await dialog.getByRole("button",{name:"Close repair estimate"}).click();
    await dialog.waitFor({state:"hidden"});
    const retry=page.getByRole("button",{name:"Retry refresh"});
    await retry.waitFor();
    assert.equal(await retry.evaluate(el=>document.activeElement===el),true,"Focus moves to retry");
    assert.equal(await page.evaluate(()=>window.__fleetEstimateFixture.actions.filter(a=>a.payload.action==="save").length),1);
    await retry.click();
    await page.waitForFunction(()=>document.activeElement?.getAttribute("aria-label")==="Filter by work order status");
    assert.equal(await page.evaluate(()=>window.__fleetEstimateFixture.actions.filter(a=>a.payload.action==="save").length),1);
  });

  await run("Desktop: Save & Submit announces result; Tab and Escape remain safe",1440,async page=>{
    const dialog=await openEstimate(page);
    await dialog.getByRole("button",{name:"Save & Submit"}).click();
    await dialog.getByRole("status").getByText(/submitted for approval/).waitFor();
    await focusedRole(page,"status");
    await page.keyboard.press("Tab");
    assert.equal(await dialog.getByRole("button",{name:"Close repair estimate"})
      .evaluate(el=>document.activeElement===el),true);
    await page.keyboard.press("Escape");
    await dialog.waitFor({state:"hidden"});
    await page.waitForFunction(()=>document.activeElement?.dataset?.fleetEstimateOpen==="wo-open");
    assert.deepEqual(await page.evaluate(()=>window.__fleetEstimateFixture.actions.map(a=>a.payload.action)),
      ["get","save","submit"]);
  });

  await run("Desktop: approval removes decision buttons without stranding focus",1440,async page=>{
    const dialog=await openEstimate(page);
    await dialog.getByRole("button",{name:"Save & Submit"}).click();
    await dialog.getByRole("button",{name:"Approve",exact:true}).click();
    await dialog.getByRole("status").getByText(/Estimate approved/).waitFor();
    await focusedRole(page,"status");
    assert.equal(await dialog.getByRole("button",{name:"Approve",exact:true}).count(),0);
    await page.keyboard.press("Tab");
    assert.equal(await dialog.getByRole("button",{name:"Close repair estimate"})
      .evaluate(el=>document.activeElement===el),true);
  });

  await run("Mobile: submitted estimate filtered out returns focus to status filter",390,async page=>{
    const dialog=await openEstimate(page);
    await page.evaluate(()=>{window.__fleetEstimateFixture.hideOnSubmit=true;});
    await dialog.getByRole("button",{name:"Save & Submit"}).click();
    await dialog.getByRole("status").getByText(/submitted for approval/).waitFor();
    await dialog.getByRole("button",{name:"Close repair estimate"}).click();
    await dialog.waitFor({state:"hidden"});
    await page.waitForFunction(()=>document.activeElement?.getAttribute("aria-label")==="Filter by work order status");
    assert.match(await page.getByRole("status").innerText(),/no longer matches/);
  });

  await run("Desktop: uncertain submit preserves draft and requires status check",1440,async page=>{
    const dialog=await openEstimate(page);
    await page.evaluate(()=>{window.__fleetEstimateFixture.failNextSubmit=true;});
    await dialog.getByRole("button",{name:"Save & Submit"}).click();
    await dialog.getByRole("status").getByText(/draft saved; submission could not be confirmed/).waitFor();
    await focusedRole(page,"status");
    assert.equal(await page.evaluate(()=>window.__fleetEstimateFixture.estimates["wo-open"].status),"draft");
    assert.deepEqual(await page.evaluate(()=>window.__fleetEstimateFixture.actions.map(a=>a.payload.action)),
      ["get","save","submit"]);
  });
  console.log("REPAIR_ESTIMATE_BROWSER_PASS="+passed);
} finally {
  if(browser) await browser.close();
  if(vite) await vite.close();
  await rm(scratch,{recursive:true,force:true});
}

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
    `import { AuthProvider } from "/@fs/${appRoot.replace(/\\/g, "/")}/src/components/auth/EmailGate.jsx";`,
    `import FleetWorkOrders from "/@fs/${appRoot.replace(/\\/g, "/")}/src/pages/FleetWorkOrders.jsx";`,
    'localStorage.setItem("sss_session_token", "synthetic-session");',
    'createRoot(document.getElementById("root")).render(<AuthProvider><MemoryRouter><FleetWorkOrders /></MemoryRouter></AuthProvider>);',
  ].join("\n"));

  // Wrap the established Fleet browser fixture without changing its existing suite.
  await writeFile(path.join(scratch, "mockEstimate.js"), [
    `import { base44 as original, createPageUrl } from "/@fs/${appRoot.replace(/\\/g, "/")}/scripts/fleet-browser-harness/mockBase44.js";`,
    'export { createPageUrl };',
    'const clone = value => JSON.parse(JSON.stringify(value));',
    'let revision = 0;',
    'const state = { actions: [], estimates: {}, failNextSubmit: false, submitThenLoseAck: false, failNextDecision: false, decisionThenLoseAck: false, failNextGet: false, delayNextGetMs: 0, hideOnSubmit: false };',
    'window.__fleetEstimateFixture = state;',
    'export const base44 = { ...original, functions: { ...original.functions, async invoke(name, payload) {',
    ' if (name !== "fleetRepairEstimateAction") return original.functions.invoke(name,payload);',
    ' state.actions.push({ name, payload: clone(payload) });',
    ' const id = payload.work_order_id;',
    ' if (payload.action === "get") {if (state.failNextGet) {state.failNextGet=false; throw new Error("Synthetic estimate load failure");} const snapshot=clone(state.estimates[id] || null); if (state.delayNextGetMs) {const delay=state.delayNextGetMs;state.delayNextGetMs=0;await new Promise(resolve=>setTimeout(resolve,delay));} return {data:{estimate:snapshot}};}',
    ' if (payload.action === "save") {',
    '   const row = {...clone(payload.estimate), id:"estimate-"+id, work_order_id:id, status:"draft",',
    '     approval_required:true, updated_date:"synthetic-revision-"+(++revision)};',
    '   state.estimates[id]=row; return {data:{estimate:clone(row)}};',
    ' }',
    ' if (payload.action === "submit") {',
    '   if (state.failNextSubmit) {state.failNextSubmit=false; throw new Error("Synthetic submit transport error");}',
    '   const row = {...state.estimates[id], status:"submitted",updated_date:"synthetic-revision-"+(++revision)};',
    '   state.estimates[id]=row;',
    '   if (state.submitThenLoseAck) {state.submitThenLoseAck=false; throw new Error("Synthetic lost submit acknowledgment");}',
    '   if (state.hideOnSubmit) window.__fleetBrowserFixture.orders.find(w=>w.id===id).status="completed";',
    '   return {data:{estimate:clone(row),auto_approved:false}};',
    ' }',
    ' if (payload.action === "decide") {',
    '   if (state.failNextDecision) {state.failNextDecision=false; throw new Error("Synthetic decision transport error");}',
    '   const row = {...state.estimates[id], status:payload.decision,decision_notes:payload.decision_notes||"",updated_date:"synthetic-revision-"+(++revision)};',
    '   state.estimates[id]=row;',
    '   if (state.decisionThenLoseAck) {state.decisionThenLoseAck=false; throw new Error("Synthetic lost decision acknowledgment");}',
    '   return {data:{estimate:clone(row)}};',
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
    server: { host:"127.0.0.1",port:0,strictPort:false,fs:{allow:[appRoot,scratch],strict:false} },
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
  // Focus is applied through deferred effects; evaluate-then-assert races the
  // apply. Wait until the element is actually focused before asserting.
  const expectFocused = async (page,locator,message) => {
    await page.waitForFunction(el=>document.activeElement===el,await locator.elementHandle());
    assert.equal(await locator.evaluate(el=>document.activeElement===el),true,message);
  };

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
    await expectFocused(page,dialog.getByRole("button",{name:"Close repair estimate"}),"Tab remains trapped after warning focus");
    await dialog.getByRole("button",{name:"Close repair estimate"}).click();
    await dialog.waitFor({state:"hidden"});
    const retry=page.getByRole("button",{name:"Retry refresh"});
    await retry.waitFor();
    await expectFocused(page,retry,"Focus moves to retry");
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
    await expectFocused(page,dialog.getByRole("button",{name:"Close repair estimate"}));
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
    await expectFocused(page,dialog.getByRole("button",{name:"Close repair estimate"}));
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
  await run("Desktop: failed GET blocks all estimate mutations until retry succeeds",1440,async page=>{
    await page.locator("#fleet-work-order-toggle-wo-open").click();
    await page.evaluate(()=>{window.__fleetEstimateFixture.failNextGet=true;});
    await page.getByRole("button",{name:"Estimate / Approval"}).click();
    const dialog=page.getByRole("dialog",{name:"Repair Estimate & Approval"});
    const retry=dialog.getByRole("button",{name:"Retry loading estimate"});
    await retry.waitFor();
    assert.match(await dialog.getByRole("alert").innerText(),/Retry loading before making changes/);
    assert.equal(await dialog.getByRole("button",{name:"Save Draft"}).count(),0);
    await expectFocused(page,retry);
    await page.keyboard.press("Enter");
    await dialog.getByRole("button",{name:"Save Draft"}).waitFor();
    await expectFocused(page,dialog.getByRole("button",{name:"Close repair estimate"}),"Focus returns to a surviving control after retry");
    assert.deepEqual(await page.evaluate(()=>window.__fleetEstimateFixture.actions.map(a=>a.payload.action)),
      ["get","get"],"Failed loading cannot create an estimate");
  });

  await run("Mobile: failed GET allows safe Escape and a clean reopen",390,async page=>{
    await page.locator("#fleet-work-order-toggle-wo-open").click();
    await page.evaluate(()=>{window.__fleetEstimateFixture.failNextGet=true;});
    await page.getByRole("button",{name:"Estimate / Approval"}).click();
    const dialog=page.getByRole("dialog",{name:"Repair Estimate & Approval"});
    await dialog.getByRole("button",{name:"Retry loading estimate"}).waitFor();
    await page.keyboard.press("Escape");
    await dialog.waitFor({state:"hidden"});
    await page.waitForFunction(()=>document.activeElement?.dataset?.fleetEstimateOpen==="wo-open");
    await page.getByRole("button",{name:"Estimate / Approval"}).click();
    await dialog.getByRole("button",{name:"Save Draft"}).waitFor();
    assert.equal(await dialog.getByRole("alert").count(),0);
    assert.deepEqual(await page.evaluate(()=>window.__fleetEstimateFixture.actions.map(a=>a.payload.action)),
      ["get","get"]);
  });

  await run("Desktop: uncertain submit and failed status GET never replay save or submit",1440,async page=>{
    const dialog=await openEstimate(page);
    await page.evaluate(()=>{window.__fleetEstimateFixture.failNextSubmit=true;});
    await dialog.getByRole("button",{name:"Save & Submit"}).click();
    const check=dialog.getByRole("button",{name:"Check current server status"});
    await check.waitFor();
    assert.equal(await dialog.getByRole("button",{name:"Save & Submit"}).count(),0);
    assert.equal(await dialog.getByRole("spinbutton",{name:"Labor hours"}).isDisabled(),true);
    await page.evaluate(()=>{window.__fleetEstimateFixture.failNextGet=true;});
    await check.click();
    await dialog.getByRole("alert").getByText(/Submission remains unconfirmed/).waitFor();
    await expectFocused(page,check);
    assert.equal(await dialog.getByRole("button",{name:"Save Draft"}).count(),0);
    await check.click();
    await dialog.getByRole("status").getByText(/Server confirms this estimate remains a draft/).waitFor();
    await dialog.getByRole("button",{name:"Save & Submit"}).waitFor();
    await focusedRole(page,"status");
    assert.deepEqual(await page.evaluate(()=>window.__fleetEstimateFixture.actions.map(a=>a.payload.action)),
      ["get","save","submit","get","get"]);
  });

  await run("Desktop: lost acknowledgment after committed submit reconciles as submitted",1440,async page=>{
    const dialog=await openEstimate(page);
    await page.evaluate(()=>{window.__fleetEstimateFixture.submitThenLoseAck=true;});
    await dialog.getByRole("button",{name:"Save & Submit"}).click();
    const check=dialog.getByRole("button",{name:"Check current server status"});
    await check.waitFor();
    assert.equal(await page.evaluate(()=>window.__fleetEstimateFixture.estimates["wo-open"].status),"submitted");
    await check.click();
    await dialog.getByRole("status").getByText(/Server confirms this estimate is submitted/).waitFor();
    await dialog.getByRole("button",{name:"Approve",exact:true}).waitFor();
    assert.equal(await dialog.getByRole("button",{name:"Save & Submit"}).count(),0);
    assert.deepEqual(await page.evaluate(()=>window.__fleetEstimateFixture.actions.map(a=>a.payload.action)),
      ["get","save","submit","get"]);
  });

  await run("Desktop: conflicting draft version keeps uncertain submission blocked",1440,async page=>{
    const dialog=await openEstimate(page);
    await page.evaluate(()=>{window.__fleetEstimateFixture.failNextSubmit=true;});
    await dialog.getByRole("button",{name:"Save & Submit"}).click();
    const check=dialog.getByRole("button",{name:"Check current server status"});
    await check.waitFor();
    await page.evaluate(()=>{window.__fleetEstimateFixture.estimates["wo-open"].updated_date="concurrent-synthetic-version";});
    await check.click();
    await dialog.getByRole("alert").getByText(/cannot be reconciled/).waitFor();
    assert.equal(await dialog.getByRole("button",{name:"Save & Submit"}).count(),0);
    await expectFocused(page,check);
    assert.deepEqual(await page.evaluate(()=>window.__fleetEstimateFixture.actions.map(a=>a.payload.action)),
      ["get","save","submit","get"]);
  });

  await run("Desktop: an old in-flight GET cannot overwrite a reopened estimate",1440,async page=>{
    await page.locator("#fleet-work-order-toggle-wo-open").click();
    await page.evaluate(()=>{window.__fleetEstimateFixture.delayNextGetMs=350;});
    await page.getByRole("button",{name:"Estimate / Approval"}).click();
    const dialog=page.getByRole("dialog",{name:"Repair Estimate & Approval"});
    await dialog.getByRole("status",{name:"Loading repair estimate"}).waitFor();
    await dialog.getByRole("button",{name:"Close repair estimate"}).click();
    await dialog.waitFor({state:"hidden"});
    await page.evaluate(()=>{
      window.__fleetEstimateFixture.estimates["wo-open"]={
        id:"estimate-wo-open",work_order_id:"wo-open",status:"submitted",
        updated_date:"synthetic-reopened-version",estimated_total:280,approval_required:true,
      };
    });
    await page.getByRole("button",{name:"Estimate / Approval"}).click();
    await dialog.getByRole("button",{name:"Approve",exact:true}).waitFor();
    await page.waitForTimeout(450);
    assert.equal(await dialog.getByRole("button",{name:"Save & Submit"}).count(),0);
    assert.equal(await dialog.getByRole("button",{name:"Approve",exact:true}).count(),1);
    assert.match(await dialog.innerText(),/submitted/i);
    assert.deepEqual(await page.evaluate(()=>window.__fleetEstimateFixture.actions.map(a=>a.payload.action)),
      ["get","get"]);
  });

  await run("Desktop: lost approval acknowledgment reconciles without repeating the decision",1440,async page=>{
    const dialog=await openEstimate(page);
    await dialog.getByRole("button",{name:"Save & Submit"}).click();
    await dialog.getByRole("button",{name:"Approve",exact:true}).waitFor();
    await page.evaluate(()=>{window.__fleetEstimateFixture.decisionThenLoseAck=true;});
    await dialog.getByRole("button",{name:"Approve",exact:true}).click();
    const check=dialog.getByRole("button",{name:"Check approval decision status"});
    await check.waitFor();
    assert.equal(await page.evaluate(()=>window.__fleetEstimateFixture.estimates["wo-open"].status),"approved");
    assert.equal(await dialog.getByRole("button",{name:"Approve",exact:true}).isDisabled(),true);
    assert.equal(await page.evaluate(()=>window.__fleetEstimateFixture.actions.filter(a=>a.payload.action==="decide").length),1);
    await check.click();
    await dialog.getByRole("status").getByText(/Server confirms the estimate is approved/).waitFor();
    assert.equal(await dialog.getByRole("button",{name:"Approve",exact:true}).count(),0);
    assert.equal(await page.evaluate(()=>window.__fleetEstimateFixture.actions.filter(a=>a.payload.action==="decide").length),1);
    assert.deepEqual(await page.evaluate(()=>window.__fleetEstimateFixture.actions.map(a=>a.payload.action)),
      ["get","save","submit","decide","get"]);
  });

  await run("Desktop: uncommitted decision is unlocked only after server verification",1440,async page=>{
    const dialog=await openEstimate(page);
    await dialog.getByRole("button",{name:"Save & Submit"}).click();
    await dialog.getByRole("button",{name:"Reject",exact:true}).waitFor();
    await page.evaluate(()=>{window.__fleetEstimateFixture.failNextDecision=true;});
    await dialog.getByRole("button",{name:"Reject",exact:true}).click();
    const check=dialog.getByRole("button",{name:"Check approval decision status"});
    await check.waitFor();
    assert.equal(await dialog.getByRole("button",{name:"Reject",exact:true}).isDisabled(),true);
    await check.click();
    await dialog.getByRole("status").getByText(/approval decision was not recorded/).waitFor();
    assert.equal(await dialog.getByRole("button",{name:"Reject",exact:true}).isEnabled(),true);
    assert.equal(await page.evaluate(()=>window.__fleetEstimateFixture.actions.filter(a=>a.payload.action==="decide").length),1);
    await dialog.getByRole("button",{name:"Reject",exact:true}).click();
    await dialog.getByRole("status").getByText(/Estimate rejected/).waitFor();
    assert.equal(await page.evaluate(()=>window.__fleetEstimateFixture.actions.filter(a=>a.payload.action==="decide").length),2);
  });

  await run("Desktop: failed decision-status GET keeps approval actions blocked",1440,async page=>{
    const dialog=await openEstimate(page);
    await dialog.getByRole("button",{name:"Save & Submit"}).click();
    await page.evaluate(()=>{window.__fleetEstimateFixture.failNextDecision=true;});
    await dialog.getByRole("button",{name:"Request Changes",exact:true}).click();
    const check=dialog.getByRole("button",{name:"Check approval decision status"});
    await check.waitFor();
    await page.evaluate(()=>{window.__fleetEstimateFixture.failNextGet=true;});
    await check.click();
    await dialog.getByRole("alert").getByText(/decision remains unconfirmed; do not repeat it/i).waitFor();
    await expectFocused(page,check);
    assert.equal(await dialog.getByRole("button",{name:"Approve",exact:true}).isDisabled(),true);
    assert.equal(await dialog.getByRole("button",{name:"Request Changes",exact:true}).isDisabled(),true);
    assert.equal(await dialog.getByRole("button",{name:"Reject",exact:true}).isDisabled(),true);
    assert.equal(await page.evaluate(()=>window.__fleetEstimateFixture.actions.filter(a=>a.payload.action==="decide").length),1);
  });

  await run("Desktop: concurrent estimate change keeps an uncertain decision fail-closed",1440,async page=>{
    const dialog=await openEstimate(page);
    await dialog.getByRole("button",{name:"Save & Submit"}).click();
    await page.evaluate(()=>{window.__fleetEstimateFixture.failNextDecision=true;});
    await dialog.getByRole("button",{name:"Approve",exact:true}).click();
    const check=dialog.getByRole("button",{name:"Check approval decision status"});
    await check.waitFor();
    await page.evaluate(()=>{
      window.__fleetEstimateFixture.estimates["wo-open"].updated_date="synthetic-concurrent-decision-version";
    });
    await check.click();
    await dialog.getByRole("alert").getByText(/changed while the approval response was uncertain/i).waitFor();
    await expectFocused(page,check);
    assert.equal(await dialog.getByRole("button",{name:"Approve",exact:true}).isDisabled(),true);
    assert.equal(await page.evaluate(()=>window.__fleetEstimateFixture.actions.filter(a=>a.payload.action==="decide").length),1);
  });

  console.log("REPAIR_ESTIMATE_BROWSER_PASS="+passed);
} finally {
  if(browser) await browser.close();
  if(vite) await vite.close();
  await rm(scratch,{recursive:true,force:true});
}

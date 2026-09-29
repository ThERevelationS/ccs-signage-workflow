// Isolated real-Chromium acceptance for /FleetMechanic repair-estimate recovery.
// All Base44 responses are synthetic browser-memory fixtures. No production records are read or written.
import assert from "node:assert/strict";
import { mkdtemp, writeFile, symlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";

const appRoot = process.cwd();
const playwrightPath = process.env.FLEET_PLAYWRIGHT_PATH || "/tmp/fleet-browser-check/node_modules/playwright/index.mjs";
const { chromium } = await import(playwrightPath);
const scratch = await mkdtemp(path.join(tmpdir(), "fleet-mechanic-estimate-browser-"));
let vite, browser, passed = 0;

try {
  await symlink(path.join(appRoot, "node_modules"), path.join(scratch, "node_modules"), "dir");
  await writeFile(path.join(scratch, "index.html"),
    "<!doctype html><html><head><meta charset='UTF-8'><meta name='viewport' content='width=device-width,initial-scale=1'></head><body><div id='root'></div><script type='module' src='/main.jsx'></script></body></html>");
  await writeFile(path.join(scratch, "main.jsx"), [
    'import React from "react";',
    'import { createRoot } from "react-dom/client";',
    'import FleetMechanic from "/@fs/app/src/pages/FleetMechanic.jsx";',
    'createRoot(document.getElementById("root")).render(<FleetMechanic />);',
  ].join("\n"));

  await writeFile(path.join(scratch, "mockBase44.js"), [
    'const clone = value => JSON.parse(JSON.stringify(value));',
    'let revision = 0;',
    'const workOrder = {id:"wo-mechanic",work_order_number:"WO-SYNTH-MECH",title:"Synthetic mechanic repair",description:"Synthetic recovery fixture",type:"repair",status:"open",priority:"medium",equipment_id:"eq-mechanic",updated_date:"wo-rev-1",parts_used:[],fluids_used:[],before_photos:[],problem_photos:[],after_photos:[],approval_block:{blocked:false,reason:""}};',
    'const workOrder2 = {id:"wo-other",work_order_number:"WO-SYNTH-OTHER",title:"Second synthetic repair",description:"Second modal fixture",type:"repair",status:"open",priority:"low",equipment_id:"eq-other",updated_date:"wo-other-rev-1",parts_used:[],fluids_used:[],before_photos:[],problem_photos:[],after_photos:[],approval_block:{blocked:false,reason:""}};',
    'const secondEstimate = {id:"estimate-other",work_order_id:workOrder2.id,status:"draft",visibility:"mechanic",estimated_labor_hours:1.5,labor_rate:95,misc_total:0,parts_estimate:[],fluids_estimate:[],notes:"Second work order draft",updated_date:"estimate-other-rev-1"};',
    'const state = {actions:[],estimate:null,owner:"none",failNextBootstrap:false,saveThenLoseAck:false,adminWinsOnSave:false,loseAckAndFailRefresh:false,submitThenLoseAck:false,concurrentDraftOnSubmit:false,ccsTakesOwnershipOnSubmit:false,statusChangesOnSubmit:"",deferNextBootstrap:false,releaseDeferredBootstrap:null};',
    'window.__fleetMechanicEstimateFixture = state;',
    'const publicEstimate = () => {',
    ' const rows=[clone(secondEstimate)];',
    ' if (!state.estimate) return rows;',
    ' if (state.owner === "mechanic") return [{...clone(state.estimate),visibility:"mechanic"},...rows];',
    ' if (state.owner === "other") return [{work_order_id:workOrder.id,visibility:"other_mechanic",status:"managed"},...rows];',
    ' if (state.owner === "conflict") return [{work_order_id:workOrder.id,visibility:"conflict",status:"conflict"},...rows];',
    ' return [{work_order_id:workOrder.id,visibility:"ccs_managed",status:"managed"},...rows];',
    '};',
    'const bootstrap = () => ({success:true,portal:{name:"Synthetic Mechanic",capabilities:{estimates:true}},active_work_orders:[clone(workOrder),clone(workOrder2)],recent_completed:[],equipment:[{id:"eq-mechanic",name:"Synthetic Fleet Van",status:"operational"},{id:"eq-other",name:"Second Synthetic Van",status:"operational"}],tasks:[],repair_estimates:publicEstimate()});',
    'export const base44 = {functions:{async invoke(name,payload){',
    ' if (name !== "fleetMechanicPortal") throw new Error("Unexpected synthetic function: "+name);',
    ' state.actions.push(clone(payload));',
    ' if (payload.action === "bootstrap") {',
    '   if (state.failNextBootstrap) {state.failNextBootstrap=false; throw new Error("Synthetic bootstrap unavailable");}',
    '   if (state.deferNextBootstrap) {const snapshot=bootstrap();state.deferNextBootstrap=false;return await new Promise(resolve=>{state.releaseDeferredBootstrap=()=>{state.releaseDeferredBootstrap=null;resolve({data:snapshot});};});}',
    '   return {data:bootstrap()};',
    ' }',
    ' if (payload.action === "estimate_save") {',
    '   if (state.adminWinsOnSave) {state.owner="ccs";state.estimate={id:"estimate-admin",work_order_id:workOrder.id,status:"draft",updated_date:"admin-rev-1"};return {data:{error:"CCS or another mechanic already manages the estimate for this work order."}};}',
    '   const row={...clone(payload.estimate),id:"estimate-mechanic",work_order_id:workOrder.id,status:"draft",approval_required:true,updated_date:"estimate-rev-"+(++revision)};',
    '   state.estimate=row;state.owner="mechanic";',
    '   if (state.loseAckAndFailRefresh) {state.loseAckAndFailRefresh=false;state.failNextBootstrap=true;throw new Error("Synthetic lost first-save acknowledgment");}',
    '   if (state.saveThenLoseAck) {state.saveThenLoseAck=false;throw new Error("Synthetic lost first-save acknowledgment");}',
    '   return {data:{success:true,estimate:clone(row)}};',
    ' }',
    ' if (payload.action === "estimate_submit") {',
    '   if (!state.estimate || state.owner !== "mechanic") return {data:{error:"CCS or another mechanic already manages the estimate for this work order."}};',
    '   if (state.concurrentDraftOnSubmit) {state.concurrentDraftOnSubmit=false;state.estimate={...state.estimate,estimated_labor_hours:8.75,notes:"Concurrent server draft",status:"changes_requested",updated_date:"estimate-rev-"+(++revision)};return {data:{error:"Mechanic Fleet repair estimate changed since it was loaded. Refresh before saving."}};}',
    '   if (state.ccsTakesOwnershipOnSubmit) {state.ccsTakesOwnershipOnSubmit=false;state.owner="ccs";state.estimate={id:"estimate-admin",work_order_id:workOrder.id,status:"draft",updated_date:"admin-rev-"+(++revision)};return {data:{error:"CCS or another mechanic already manages the estimate for this work order."}};}',
    '   if (state.statusChangesOnSubmit) {const next=state.statusChangesOnSubmit;state.statusChangesOnSubmit="";state.estimate={...state.estimate,status:next,updated_date:"estimate-rev-"+(++revision)};return {data:{error:"Only a draft or changes-requested estimate can be submitted."}};}',
    '   const row={...state.estimate,status:"submitted",updated_date:"estimate-rev-"+(++revision)};',
    '   state.estimate=row;',
    '   if (state.submitThenLoseAck) {state.submitThenLoseAck=false;throw new Error("Synthetic lost submit acknowledgment");}',
    '   return {data:{success:true,estimate:clone(row),auto_approved:false}};',
    ' }',
    ' throw new Error("Unexpected synthetic action: "+payload.action);',
    '}}};',
  ].join("\n"));

  vite = await createServer({
    configFile:false,
    root:scratch,
    plugins:[react()],
    resolve:{alias:[
      {find:"@/api/base44Client",replacement:path.join(scratch,"mockBase44.js")},
      {find:/^@\//,replacement:path.join(appRoot,"src")+"/"},
    ]},
    server:{host:"127.0.0.1",port:0,strictPort:false,fs:{allow:[appRoot,scratch]}},
    logLevel:"error",
  });
  await vite.listen();
  const origin = "http://127.0.0.1:" + vite.httpServer.address().port;
  browser = await chromium.launch({headless:true,args:["--no-sandbox"]});

  async function run(name,width,scenario) {
    const page = await browser.newPage({viewport:{width,height:width<500?844:900}});
    const runtimeErrors = [], outside = [];
    page.on("pageerror", error => runtimeErrors.push(error.message));
    page.on("request", request => {
      if (request.url().startsWith("http") && !request.url().startsWith(origin)) outside.push(request.url());
    });
    await page.route("**/*", route => {
      const url = route.request().url();
      return url.startsWith("http") && !url.startsWith(origin) ? route.abort("blockedbyclient") : route.continue();
    });
    try {
      await page.goto(origin + "/#synthetic-mechanic-token",{waitUntil:"networkidle"});
      await page.getByText("WO-SYNTH-MECH",{exact:true}).waitFor();
      await page.getByText("WO-SYNTH-MECH",{exact:true}).locator("xpath=ancestor::button[1]").click();
      await page.getByRole("button",{name:"Save Draft"}).waitFor();
      await scenario(page);
      assert.deepEqual(runtimeErrors,[],"No browser runtime errors");
      assert.deepEqual(outside,[],"No outside network requests");
      passed++;
      console.log("PASS " + name);
    } finally {
      await page.close();
    }
  }

  const actionNames = page => page.evaluate(() => window.__fleetMechanicEstimateFixture.actions.map(row => row.action));

  await run("Desktop: lost first-save acknowledgement reloads server draft before retry",1440,async page => {
    await page.getByLabel("Estimated labor hours").fill("3.5");
    await page.getByLabel("Labor rate / hr").fill("125");
    await page.evaluate(() => { window.__fleetMechanicEstimateFixture.saveThenLoseAck = true; });
    await page.getByRole("button",{name:"Save Draft"}).click();
    await page.getByText(/Current server estimate reloaded as draft.*Nothing was resubmitted automatically/i).waitFor();
    assert.equal(await page.getByLabel("Estimated labor hours").inputValue(),"3.5");
    assert.equal(await page.getByLabel("Labor rate / hr").inputValue(),"125");
    assert.equal(await page.getByRole("button",{name:"Save Draft"}).count(),1);
    assert.equal(await page.getByRole("button",{name:"Submit Estimate"}).count(),1);
    assert.deepEqual(await actionNames(page),["bootstrap","estimate_save","bootstrap"]);
  });

  await run("Desktop: admin ownership conflict refreshes and permanently hides mechanic mutations",1440,async page => {
    await page.evaluate(() => { window.__fleetMechanicEstimateFixture.adminWinsOnSave = true; });
    await page.getByRole("button",{name:"Save Draft"}).click();
    await page.getByText(/CCS is managing an internal repair estimate/i).waitFor();
    assert.equal(await page.getByRole("button",{name:"Save Draft"}).count(),0);
    assert.equal(await page.getByRole("button",{name:"Submit Estimate"}).count(),0);
    assert.deepEqual(await actionNames(page),["bootstrap","estimate_save","bootstrap"]);
  });

  await run("Mobile: failed ownership refresh locks quote until explicit server check",390,async page => {
    await page.getByLabel("Estimated labor hours").fill("2.25");
    await page.evaluate(() => { window.__fleetMechanicEstimateFixture.loseAckAndFailRefresh = true; });
    await page.getByRole("button",{name:"Save Draft"}).click();
    const recovery = page.getByRole("alert");
    await recovery.getByText(/Current server ownership must be checked/i).waitFor();
    assert.equal(await page.getByRole("button",{name:"Save Draft"}).count(),0);
    assert.equal(await page.getByRole("button",{name:"Submit Estimate"}).count(),0);
    assert.equal(await page.getByLabel("Estimated labor hours").isDisabled(),true);
    assert.deepEqual(await actionNames(page),["bootstrap","estimate_save","bootstrap"]);

    await recovery.getByRole("button",{name:"Check Current Server State"}).click();
    await page.getByText(/Current server estimate reloaded as draft.*Nothing was resubmitted automatically/i).waitFor();
    assert.equal(await page.getByLabel("Estimated labor hours").inputValue(),"2.25");
    assert.equal(await page.getByRole("button",{name:"Save Draft"}).count(),1);
    assert.equal(await page.getByRole("button",{name:"Submit Estimate"}).count(),1);
    assert.deepEqual(await actionNames(page),["bootstrap","estimate_save","bootstrap","bootstrap"]);
  });

  await run("Desktop: lost submit acknowledgement reconciles committed submitted status without replay",1440,async page => {
    await page.getByLabel("Estimated labor hours").fill("4");
    await page.getByLabel("Labor rate / hr").fill("140");
    await page.evaluate(() => { window.__fleetMechanicEstimateFixture.submitThenLoseAck = true; });
    await page.getByRole("button",{name:"Submit Estimate"}).click();
    await page.getByText(/Current server estimate reloaded as submitted.*Nothing was resubmitted automatically/i).waitFor();
    await page.getByText(/Submitted to CCS and waiting for an approval decision/i).waitFor();
    assert.equal(await page.getByRole("button",{name:"Save Draft"}).count(),0);
    assert.equal(await page.getByRole("button",{name:"Submit Estimate"}).count(),0);
    assert.deepEqual(await actionNames(page),["bootstrap","estimate_save","estimate_submit","bootstrap"]);
  });

  await run("Desktop: concurrent draft change before submit reloads authoritative mechanic version",1440,async page => {
    await page.getByLabel("Estimated labor hours").fill("4.5");
    await page.evaluate(() => { window.__fleetMechanicEstimateFixture.concurrentDraftOnSubmit = true; });
    await page.getByRole("button",{name:"Submit Estimate"}).click();
    await page.getByText(/Current server estimate reloaded as changes requested.*Nothing was resubmitted automatically/i).waitFor();
    assert.equal(await page.getByLabel("Estimated labor hours").inputValue(),"8.75");
    assert.equal(await page.getByLabel("Estimate notes").inputValue(),"Concurrent server draft");
    assert.equal(await page.getByRole("button",{name:"Save Draft"}).count(),1);
    assert.equal(await page.getByRole("button",{name:"Submit Estimate"}).count(),1);
    assert.deepEqual(await actionNames(page),["bootstrap","estimate_save","estimate_submit","bootstrap"]);
  });

  await run("Desktop: ownership transfer between draft save and submit becomes read-only after verification",1440,async page => {
    await page.evaluate(() => { window.__fleetMechanicEstimateFixture.ccsTakesOwnershipOnSubmit = true; });
    await page.getByRole("button",{name:"Submit Estimate"}).click();
    await page.getByText(/CCS is managing an internal repair estimate/i).waitFor();
    assert.equal(await page.getByRole("button",{name:"Save Draft"}).count(),0);
    assert.equal(await page.getByRole("button",{name:"Submit Estimate"}).count(),0);
    assert.deepEqual(await actionNames(page),["bootstrap","estimate_save","estimate_submit","bootstrap"]);
  });

  await run("Mobile: status change between draft save and submit reloads approved server state",390,async page => {
    await page.evaluate(() => { window.__fleetMechanicEstimateFixture.statusChangesOnSubmit = "approved"; });
    await page.getByRole("button",{name:"Submit Estimate"}).click();
    await page.getByText(/Current server estimate reloaded as approved.*Nothing was resubmitted automatically/i).waitFor();
    await page.getByText(/CCS Fleet has approved this estimate/i).waitFor();
    assert.equal(await page.getByRole("button",{name:"Save Draft"}).count(),0);
    assert.equal(await page.getByRole("button",{name:"Submit Estimate"}).count(),0);
    assert.deepEqual(await actionNames(page),["bootstrap","estimate_save","estimate_submit","bootstrap"]);
  });

  await run("Desktop: older global refresh cannot overwrite newer ownership recovery",1440,async page => {
    await page.evaluate(() => { window.__fleetMechanicEstimateFixture.deferNextBootstrap = true; });
    await page.getByRole("button",{name:"Refresh"}).click();
    await page.waitForFunction(() => typeof window.__fleetMechanicEstimateFixture.releaseDeferredBootstrap === "function");
    await page.evaluate(() => { window.__fleetMechanicEstimateFixture.adminWinsOnSave = true; });
    await page.getByRole("button",{name:"Save Draft"}).click();
    await page.getByText(/CCS is managing an internal repair estimate/i).waitFor();
    await page.evaluate(() => window.__fleetMechanicEstimateFixture.releaseDeferredBootstrap());
    await page.waitForTimeout(50);
    assert.equal(await page.getByText(/CCS is managing an internal repair estimate/i).count(),1);
    assert.equal(await page.getByRole("button",{name:"Save Draft"}).count(),0);
    assert.equal(await page.getByRole("button",{name:"Submit Estimate"}).count(),0);
    assert.deepEqual(await actionNames(page),["bootstrap","bootstrap","estimate_save","bootstrap"]);
  });

  await run("Mobile: late recovery for closed job cannot clobber newly opened estimate form",390,async page => {
    await page.getByLabel("Estimated labor hours").fill("7.25");
    await page.evaluate(() => { const s=window.__fleetMechanicEstimateFixture;s.deferNextBootstrap=true;s.saveThenLoseAck=true; });
    await page.getByRole("button",{name:"Save Draft"}).click();
    await page.waitForFunction(() => typeof window.__fleetMechanicEstimateFixture.releaseDeferredBootstrap === "function");
    await page.locator("button:has(svg.lucide-x)").first().click();
    await page.getByText("WO-SYNTH-OTHER",{exact:true}).locator("xpath=ancestor::button[1]").click();
    assert.equal(await page.getByLabel("Estimated labor hours").inputValue(),"1.5");
    await page.evaluate(() => window.__fleetMechanicEstimateFixture.releaseDeferredBootstrap());
    await page.waitForTimeout(50);
    assert.equal(await page.getByText("WO-SYNTH-OTHER",{exact:true}).count(),1);
    assert.equal(await page.getByLabel("Estimated labor hours").inputValue(),"1.5");
    assert.equal(await page.getByText(/Repair estimate request could not be confirmed/i).count(),0);
    assert.deepEqual(await actionNames(page),["bootstrap","estimate_save","bootstrap"]);
  });

  console.log("Fleet mechanic repair-estimate browser acceptance: " + passed + "/9 PASS");
} finally {
  if (browser) await browser.close().catch(() => {});
  if (vite) await vite.close().catch(() => {});
  await rm(scratch,{recursive:true,force:true}).catch(() => {});
}

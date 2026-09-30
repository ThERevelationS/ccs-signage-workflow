// Isolated real-Chromium acceptance for /FleetMechanic Start Work and Save Progress recovery.
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
const scratch = await mkdtemp(path.join(tmpdir(), "fleet-mechanic-work-browser-"));
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
    'let revision = 1;',
    'const state = {actions:[],loseStartAck:false,loseSaveAck:false,failNextMutationStatus:false,staleNextSave:false,photoWrites:0,receipt:null,work:{id:"wo-work",work_order_number:"WO-SYNTH-WORK",title:"Synthetic work recovery",description:"Synthetic mechanic work mutation fixture",type:"repair",status:"open",priority:"medium",equipment_id:"eq-work",updated_date:"wo-rev-1",actual_hours:"",corrective_action:"",notes:"",parts_used:[],fluids_used:[],before_photos:[],problem_photos:[],after_photos:[],approval_block:{blocked:false,reason:""}}};',
    'window.__fleetMechanicWorkFixture = state;',
    'const work = () => clone(state.work);',
    'const bootstrap = () => ({success:true,portal:{name:"Synthetic Mechanic",capabilities:{estimates:false}},active_work_orders:[work()],recent_completed:[],equipment:[{id:"eq-work",name:"Synthetic Fleet Van",status:"operational"}],tasks:[],repair_estimates:[]});',
    'const receiptFor = payload => state.receipt && state.receipt.action===payload.mutation_action && state.receipt.requestId===payload.request_id ? state.receipt : null;',
    'const applyStart = payload => { state.work={...state.work,status:"in_progress",started_date:"2026-09-29",updated_date:"wo-rev-"+(++revision)}; state.receipt={action:"start",requestId:payload.request_id,status:"applied"}; };',
    'const applySave = payload => {',
    ' const note=String(payload.mechanic_note||"").trim();',
    ' const appended=note ? "[Mechanic – Synthetic Mechanic]\\n"+note : "";',
    ' const urls=(payload.photos||[]).map(()=> "https://synthetic.invalid/photo-"+(++state.photoWrites)+".jpg");',
    ' state.work={...state.work,actual_hours:payload.actual_hours===""?state.work.actual_hours:Number(payload.actual_hours),corrective_action:String(payload.corrective_action||""),notes:[state.work.notes,appended].filter(Boolean).join("\\n\\n"),after_photos:[...(state.work.after_photos||[]),...urls],updated_date:"wo-rev-"+(++revision)};',
    ' state.receipt={action:"save",requestId:payload.request_id,status:"applied"};',
    '};',
    'export const base44 = {functions:{async invoke(name,payload){',
    ' if(name!=="fleetMechanicPortal") throw new Error("Unexpected synthetic function: "+name);',
    ' state.actions.push(clone(payload));',
    ' if(payload.action==="bootstrap") return {data:bootstrap()};',
    ' if(payload.action==="start"){ applyStart(payload); if(state.loseStartAck){state.loseStartAck=false;throw new Error("Synthetic lost Start Work acknowledgement");} return {data:{success:true,request_id:payload.request_id,work_order:work()}}; }',
    ' if(payload.action==="save"){',
    '   if(state.staleNextSave){state.staleNextSave=false;state.work={...state.work,updated_date:"wo-rev-"+(++revision)};return {data:{error:"This Fleet work order changed since it was opened. Refresh before saving."}};}',
    '   applySave(payload);',
    '   if(state.loseSaveAck){state.loseSaveAck=false;throw new Error("Synthetic lost Save Progress acknowledgement");}',
    '   return {data:{success:true,request_id:payload.request_id,work_order:work()}};',
    ' }',
    ' if(payload.action==="mutation_status"){',
    '   if(state.failNextMutationStatus){state.failNextMutationStatus=false;throw new Error("Synthetic mutation status unavailable");}',
    '   const receipt=receiptFor(payload);',
    '   return {data:{success:true,status:receipt?.status||"not_found",request_id:payload.request_id,work_order:work()}};',
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
      await page.goto(origin + "/#synthetic-mechanic-token-abcdefghijklmnopqrstuvwxyz0123456789",{waitUntil:"networkidle"});
      await page.getByText("WO-SYNTH-WORK",{exact:true}).waitFor();
      await page.getByText("WO-SYNTH-WORK",{exact:true}).locator("xpath=ancestor::button[1]").click();
      await page.getByRole("button",{name:"Save Progress"}).waitFor();
      await scenario(page);
      assert.deepEqual(runtimeErrors,[],"No browser runtime errors");
      assert.deepEqual(outside,[],"No outside network requests");
      passed++;
      console.log("PASS " + name);
    } finally {
      await page.close();
    }
  }

  const actions = page => page.evaluate(() => window.__fleetMechanicWorkFixture.actions);
  const actionNames = async page => (await actions(page)).map(row => row.action);

  await run("Desktop: lost Start Work acknowledgement verifies applied state without replay",1440,async page => {
    await page.evaluate(() => { window.__fleetMechanicWorkFixture.loseStartAck = true; });
    await page.getByRole("button",{name:"Mark Work Started"}).click();
    await page.getByText(/Work started\. CCS Fleet confirmed the interrupted request/i).waitFor();
    assert.equal(await page.getByRole("button",{name:"Mark Work Started"}).count(),0);
    assert.deepEqual(await actionNames(page),["bootstrap","start","mutation_status"]);
    const rows = await actions(page);
    assert.equal(rows[1].request_id,rows[2].request_id,"Status verification must use the original Start Work request id");
    assert.equal(await page.evaluate(() => window.__fleetMechanicWorkFixture.work.status),"in_progress");
  });

  await run("Desktop: lost Save Progress acknowledgement clears one applied note and photo without replay",1440,async page => {
    await page.getByLabel("Labor hours").fill("2.5");
    await page.getByLabel("Corrective action / work performed").fill("Replaced synthetic belt");
    await page.getByLabel("Add mechanic note").fill("Synthetic note should appear once");
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=","base64");
    await page.locator('input[type="file"]').setInputFiles({name:"synthetic.png",mimeType:"image/png",buffer:png});
    await page.locator('img[src^="blob:"]').waitFor();
    await page.evaluate(() => { window.__fleetMechanicWorkFixture.loseSaveAck = true; });
    await page.getByRole("button",{name:"Save Progress"}).click();
    await page.getByText(/Progress saved\. CCS Fleet confirmed the interrupted request without replaying it/i).waitFor();
    assert.equal(await page.getByLabel("Add mechanic note").inputValue(),"");
    assert.equal(await page.locator('img[src^="blob:"]').count(),0);
    assert.deepEqual(await actionNames(page),["bootstrap","save","mutation_status"]);
    const rows = await actions(page);
    assert.equal(rows[1].request_id,rows[2].request_id,"Status verification must use the original Save Progress request id");
    const state = await page.evaluate(() => window.__fleetMechanicWorkFixture);
    assert.equal((state.work.notes.match(/Synthetic note should appear once/g)||[]).length,1);
    assert.equal(state.work.after_photos.length,1);
    assert.equal(state.photoWrites,1);
  });

  await run("Mobile: failed Save verification stays locked across global Refresh until explicit status check",390,async page => {
    await page.getByLabel("Add mechanic note").fill("Keep this draft until verified");
    await page.evaluate(() => {
      const state=window.__fleetMechanicWorkFixture;
      state.loseSaveAck=true;
      state.failNextMutationStatus=true;
    });
    await page.getByRole("button",{name:"Save Progress"}).click();
    const recovery = page.getByRole("alert");
    await recovery.getByText(/Current server state must be checked/i).waitFor();
    assert.equal(await page.getByLabel("Add mechanic note").inputValue(),"Keep this draft until verified");
    assert.equal(await page.getByLabel("Add mechanic note").isDisabled(),true);
    assert.equal(await page.getByRole("button",{name:"Save Progress"}).isDisabled(),true);
    assert.equal(await page.getByRole("button",{name:"Close work order"}).isDisabled(),true);

    await page.getByRole("button",{name:"Refresh"}).click();
    await page.waitForFunction(() => window.__fleetMechanicWorkFixture.actions.filter(row => row.action==="bootstrap").length === 2);
    assert.equal(await recovery.count(),1,"Global Refresh must not clear uncertain mutation lock");
    assert.equal(await page.getByLabel("Add mechanic note").inputValue(),"Keep this draft until verified");
    assert.equal(await page.getByRole("button",{name:"Save Progress"}).isDisabled(),true);

    await recovery.getByRole("button",{name:"Check Current Server State"}).click();
    await page.getByText(/Progress saved\. CCS Fleet confirmed the interrupted request without replaying it/i).waitFor();
    assert.equal(await page.getByLabel("Add mechanic note").inputValue(),"");
    assert.equal(await page.getByRole("button",{name:"Save Progress"}).isEnabled(),true);
    assert.equal(await page.getByRole("button",{name:"Close work order"}).isEnabled(),true);
    assert.deepEqual(await actionNames(page),["bootstrap","save","mutation_status","bootstrap","mutation_status"]);
    const state = await page.evaluate(() => window.__fleetMechanicWorkFixture);
    assert.equal((state.work.notes.match(/Keep this draft until verified/g)||[]).length,1);
  });

  await run("Desktop: stale Save confirmed not applied keeps draft for deliberate retry without auto-save",1440,async page => {
    await page.getByLabel("Add mechanic note").fill("Still unsaved after conflict");
    await page.evaluate(() => { window.__fleetMechanicWorkFixture.staleNextSave = true; });
    await page.getByRole("button",{name:"Save Progress"}).click();
    await page.getByText(/server confirms this request was not applied/i).waitFor();
    assert.equal(await page.getByLabel("Add mechanic note").inputValue(),"Still unsaved after conflict");
    assert.equal(await page.getByLabel("Add mechanic note").isEnabled(),true);
    assert.equal(await page.getByRole("button",{name:"Save Progress"}).isEnabled(),true);
    assert.deepEqual(await actionNames(page),["bootstrap","save","mutation_status"]);
    const state = await page.evaluate(() => window.__fleetMechanicWorkFixture);
    assert.equal(state.work.notes,"");
  });

  console.log("Fleet mechanic work recovery browser acceptance: " + passed + "/4 PASS");
} finally {
  if (browser) await browser.close().catch(() => {});
  if (vite) await vite.close().catch(() => {});
  await rm(scratch,{recursive:true,force:true}).catch(() => {});
}

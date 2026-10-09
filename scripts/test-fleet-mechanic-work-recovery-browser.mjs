// Isolated real-Chromium acceptance for /FleetMechanic Start Work and Save Progress recovery.
// All Base44 responses are synthetic fixtures; localStorage emulates only the fake server across tabs.
// The actual Fleet mechanic app never stores its server receipts, notes, or photos in localStorage.
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
    'const state = {actions:[],delayNextBootstrap:false,bootstrapWaiting:false,releaseBootstrap:null,bootstrapSnapshotOnRelease:false,delayNextStartAck:false,failDelayedStartAck:false,startAckWaiting:false,releaseStartAck:null,delayNextSaveAck:false,failDelayedSaveAck:false,saveAckWaiting:false,releaseSaveAck:null,startPermission:true,savePermission:true,loseStartAck:false,loseSaveAck:false,failNextMutationStatus:false,staleNextSave:false,postCommitStart403:false,postCommitSave403:false,accessDenied:false,scopeRemoved:false,photoWrites:0,receipt:null,work:{id:"wo-work",work_order_number:"WO-SYNTH-WORK",title:"Synthetic work recovery",description:"Synthetic mechanic work mutation fixture",type:"repair",status:"open",priority:"medium",equipment_id:"eq-work",updated_date:"wo-rev-1",actual_hours:"",corrective_action:"",notes:"",parts_used:[],fluids_used:[],before_photos:[],problem_photos:[],after_photos:[],approval_block:{blocked:false,reason:""}}};',
    'const persisted=JSON.parse(localStorage.getItem("synthetic-fleet-server")||"null"); if(persisted)Object.assign(state,{work:persisted.work,receipt:persisted.receipt,photoWrites:persisted.photoWrites,startPermission:persisted.startPermission,savePermission:persisted.savePermission,scopeRemoved:persisted.scopeRemoved,accessDenied:persisted.accessDenied});',
    'const persist=()=>localStorage.setItem("synthetic-fleet-server",JSON.stringify({work:state.work,receipt:state.receipt,photoWrites:state.photoWrites,startPermission:state.startPermission,savePermission:state.savePermission,scopeRemoved:state.scopeRemoved,accessDenied:state.accessDenied}));',
    'state.setAuthorization=patch=>{Object.assign(state,patch);persist();};',
    'window.__fleetMechanicWorkFixture = state;',
    'const work = () => clone(state.work);',
    'const bootstrap = () => ({success:true,portal:{name:"Synthetic Mechanic",capabilities:{start:state.startPermission,save:state.savePermission,estimates:false}},active_work_orders:state.scopeRemoved?[]:[work()],recent_completed:[],equipment:state.scopeRemoved?[]:[{id:"eq-work",name:"Synthetic Fleet Van",status:"operational"}],tasks:[],repair_estimates:[]});',
    'const receiptFor = payload => state.receipt && state.receipt.action===payload.mutation_action && state.receipt.requestId===payload.request_id ? state.receipt : null;',
    'const saveFingerprint = payload => JSON.stringify({actual_hours:String(payload.actual_hours??"").trim(),corrective_action:String(payload.corrective_action||"").trim(),mechanic_note:String(payload.mechanic_note||"").trim(),photos:(payload.photos||[]).map(photo=>({type:photo.type,data:photo.data}))});',
    'const applyStart = payload => { state.work={...state.work,status:"in_progress",started_date:"2026-09-29",updated_date:"wo-rev-"+(++revision)}; state.receipt={action:"start",requestId:payload.request_id,status:"applied"}; persist(); };',
    'const applySave = payload => {',
    ' const note=String(payload.mechanic_note||"").trim();',
    ' const appended=note ? "[Mechanic – Synthetic Mechanic]\\n"+note : "";',
    ' const urls=(payload.photos||[]).map(()=> {state.photoWrites++;return "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";});',
    ' state.work={...state.work,actual_hours:payload.actual_hours===""?state.work.actual_hours:Number(payload.actual_hours),corrective_action:String(payload.corrective_action||""),notes:[state.work.notes,appended].filter(Boolean).join("\\n\\n"),after_photos:[...(state.work.after_photos||[]),...urls],updated_date:"wo-rev-"+(++revision)};',
    ' state.receipt={action:"save",requestId:payload.request_id,status:"applied",savedPayload:saveFingerprint(payload),workUpdatedDate:state.work.updated_date}; persist();',
    '};',
    'export const base44 = {functions:{async invoke(name,payload){',
    ' if(name!=="fleetMechanicPortal") throw new Error("Unexpected synthetic function: "+name);',
    ' state.actions.push(clone(payload));',
    ' if(payload.action==="bootstrap"){ if(state.accessDenied)return {data:{error:"This mechanic portal link is invalid, expired, or revoked."}}; let snapshot=bootstrap(); if(state.delayNextBootstrap){ state.delayNextBootstrap=false; state.bootstrapWaiting=true; await new Promise(resolve=>{ state.releaseBootstrap=resolve; }); state.bootstrapWaiting=false; if(state.bootstrapSnapshotOnRelease){state.bootstrapSnapshotOnRelease=false;snapshot=bootstrap();} } return {data:snapshot}; }',
    ' if(payload.action==="start"){ if(!state.startPermission)return {data:{error:"This mechanic link is not allowed to perform that action."}}; applyStart(payload); if(state.postCommitStart403){state.postCommitStart403=false;state.accessDenied=true;return {data:{error:"This mechanic link changed after the Fleet operation may have been committed. No Fleet result data was returned. Check current server state with CCS before retrying."}};} if(state.loseStartAck){state.loseStartAck=false;throw new Error("Synthetic lost Start Work acknowledgement");} const response={data:{success:true,request_id:payload.request_id,work_order:work()}}; if(state.delayNextStartAck){state.delayNextStartAck=false;state.startAckWaiting=true;await new Promise(resolve=>{state.releaseStartAck=resolve;});state.startAckWaiting=false;if(state.failDelayedStartAck){state.failDelayedStartAck=false;throw new Error("Synthetic delayed Start acknowledgement failure");}} return response; }',
    ' if(payload.action==="save"){',
    '   if(!state.savePermission)return {data:{error:"This mechanic link is not allowed to perform that action."}};',
    '   if(state.staleNextSave){state.staleNextSave=false;state.work={...state.work,updated_date:"wo-rev-"+(++revision)};return {data:{error:"This Fleet work order changed since it was opened. Refresh before saving."}};}',
    '   if(state.receipt?.action==="save" && state.receipt?.status==="applied" && state.receipt?.workUpdatedDate===state.work.updated_date && state.receipt?.savedPayload===saveFingerprint(payload))return {data:{success:true,already_applied:true,request_id:payload.request_id,work_order:work()}};',
    '   applySave(payload);',
    '   if(state.postCommitSave403){state.postCommitSave403=false;state.accessDenied=true;return {data:{error:"This mechanic link changed after the Fleet operation may have been committed. No Fleet result data was returned. Check current server state with CCS before retrying."}};}',
    '   if(state.loseSaveAck){state.loseSaveAck=false;throw new Error("Synthetic lost Save Progress acknowledgement");}',
    '   const response={data:{success:true,request_id:payload.request_id,work_order:work()}}; if(state.delayNextSaveAck){state.delayNextSaveAck=false;state.saveAckWaiting=true;await new Promise(resolve=>{state.releaseSaveAck=resolve;});state.saveAckWaiting=false;if(state.failDelayedSaveAck){state.failDelayedSaveAck=false;throw new Error("Synthetic delayed Save acknowledgement failure");}} return response;',
    ' }',
    ' if(payload.action==="mutation_status"){',
    '   if(state.accessDenied || state.scopeRemoved)return {data:{error:"This mechanic portal link is invalid, expired, revoked, or outside its current equipment scope."}};',
    '   if((payload.mutation_action==="start"&&!state.startPermission)||(payload.mutation_action==="save"&&!state.savePermission))return {data:{error:"This mechanic link is not allowed to verify that action."}};',
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
    if (process.env.FLEET_CASE_MATCH && !name.includes(process.env.FLEET_CASE_MATCH)) return;
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

  await run("Desktop: post-commit Start 403 locks the job and never replays Start Work",1440,async page => {
    await page.evaluate(() => { window.__fleetMechanicWorkFixture.postCommitStart403 = true; });
    await page.getByRole("button",{name:"Mark Work Started"}).click();
    const recovery = page.getByRole("alert");
    await recovery.getByText(/Current server state must be checked/i).waitFor();
    await page.getByText(/may have been committed/i).waitFor();
    assert.equal(await page.getByRole("button",{name:"Mark Work Started"}).isDisabled(),true);
    assert.equal(await page.getByRole("button",{name:"Close work order"}).isDisabled(),true);
    assert.deepEqual(await actionNames(page),["bootstrap","start","mutation_status"]);
    assert.equal(await page.evaluate(() => window.__fleetMechanicWorkFixture.work.status),"in_progress","server-side Start must remain committed");
    await recovery.getByRole("button",{name:"Check Current Server State"}).click();
    await page.getByText(/Current server state could not be verified/i).waitFor();
    assert.deepEqual(await actionNames(page),["bootstrap","start","mutation_status","mutation_status"],"explicit reconciliation may retry status only, never Start Work");
    assert.equal((await actionNames(page)).filter(name=>name==="start").length,1);
  });

  await run("Mobile: post-commit Save 403 keeps the draft locked and never replays Save Progress",390,async page => {
    await page.getByLabel("Add mechanic note").fill("Committed once but response blocked");
    await page.evaluate(() => { window.__fleetMechanicWorkFixture.postCommitSave403 = true; });
    await page.getByRole("button",{name:"Save Progress"}).click();
    const recovery = page.getByRole("alert");
    await recovery.getByText(/Current server state must be checked/i).waitFor();
    await page.getByText(/may have been committed/i).waitFor();
    assert.equal(await page.getByLabel("Add mechanic note").inputValue(),"Committed once but response blocked");
    assert.equal(await page.getByLabel("Add mechanic note").isDisabled(),true);
    assert.equal(await page.getByRole("button",{name:"Save Progress"}).isDisabled(),true);
    assert.deepEqual(await actionNames(page),["bootstrap","save","mutation_status"]);
    const before = await page.evaluate(() => window.__fleetMechanicWorkFixture.work.notes);
    assert.equal((before.match(/Committed once but response blocked/g)||[]).length,1,"server-side Save must remain committed exactly once");
    await recovery.getByRole("button",{name:"Check Current Server State"}).click();
    await page.getByText(/Current server state could not be verified/i).waitFor();
    assert.deepEqual(await actionNames(page),["bootstrap","save","mutation_status","mutation_status"],"explicit reconciliation may retry status only, never Save Progress");
    assert.equal((await actionNames(page)).filter(name=>name==="save").length,1);
    const after = await page.evaluate(() => window.__fleetMechanicWorkFixture.work.notes);
    assert.equal((after.match(/Committed once but response blocked/g)||[]).length,1);
  });

  await run("Desktop: successful narrowed-scope refresh closes the open out-of-scope job",1440,async page => {
    await page.getByLabel("Add mechanic note").fill("Local sensitive draft");
    await page.evaluate(() => { window.__fleetMechanicWorkFixture.scopeRemoved = true; });
    await page.getByRole("button",{name:"Refresh"}).click();
    await page.waitForFunction(() => window.__fleetMechanicWorkFixture.actions.filter(row => row.action==="bootstrap").length === 2);
    assert.equal(await page.getByRole("heading",{name:"Synthetic work recovery",exact:true}).count(),0,"out-of-scope modal must close after successful bootstrap");
    assert.equal(await page.getByText("WO-SYNTH-WORK",{exact:true}).count(),0,"out-of-scope work order must disappear from the list");
    assert.equal(await page.getByLabel("Add mechanic note").count(),0,"out-of-scope local draft must no longer be visible");
    assert.deepEqual(await actionNames(page),["bootstrap","bootstrap"]);
  });

  await run("Desktop: Start and Save capability refreshes immediately govern the open modal",1440,async page => {
    await page.getByLabel("Labor hours").fill("8.5");
    await page.getByLabel("Corrective action / work performed").fill("Unsaved local corrective action");
    await page.getByLabel("Add mechanic note").fill("Unsaved local mechanic note");
    await page.evaluate(() => { const s=window.__fleetMechanicWorkFixture;s.work={...s.work,actual_hours:1.25,corrective_action:"Server value before capability changes"}; });
    await page.getByRole("button",{name:"Refresh"}).click();
    await page.waitForFunction(() => window.__fleetMechanicWorkFixture.actions.filter(row => row.action==="bootstrap").length === 2);
    assert.equal(await page.getByLabel("Labor hours").inputValue(),"8.5","unchanged Save permission must preserve legitimate unsaved progress");
    assert.equal(await page.getByRole("button",{name:"Mark Work Started"}).count(),1);
    assert.equal(await page.getByRole("button",{name:"Save Progress"}).count(),1);

    await page.evaluate(() => { window.__fleetMechanicWorkFixture.startPermission=false; });
    await page.getByRole("button",{name:"Refresh"}).click();
    await page.waitForFunction(() => window.__fleetMechanicWorkFixture.actions.filter(row => row.action==="bootstrap").length === 3);
    assert.equal(await page.getByRole("button",{name:"Mark Work Started"}).count(),0,"Start control must disappear when permission is removed");
    await page.getByText(/does not currently allow starting work/i).waitFor();
    assert.equal(await page.getByRole("button",{name:"Save Progress"}).count(),1,"Save remains available when its permission is unchanged");
    assert.equal(await page.getByLabel("Labor hours").inputValue(),"8.5");

    await page.evaluate(() => { window.__fleetMechanicWorkFixture.startPermission=true; });
    await page.getByRole("button",{name:"Refresh"}).click();
    await page.getByRole("button",{name:"Mark Work Started"}).waitFor();

    await page.evaluate(() => {
      const s=window.__fleetMechanicWorkFixture;
      s.work={...s.work,actual_hours:2.75,corrective_action:"Authoritative server progress after Save removal"};
      s.savePermission=false;
    });
    await page.getByRole("button",{name:"Refresh"}).click();
    await page.waitForFunction(() => window.__fleetMechanicWorkFixture.actions.filter(row => row.action==="bootstrap").length === 5);
    assert.equal(await page.getByRole("button",{name:"Save Progress"}).count(),0,"Save control must disappear when permission is removed");
    assert.equal(await page.getByLabel("Labor hours").isDisabled(),true);
    assert.equal(await page.getByLabel("Corrective action / work performed").isDisabled(),true);
    assert.equal(await page.getByLabel("Add mechanic note").isDisabled(),true);
    assert.equal(await page.locator('input[type="file"]').isDisabled(),true);
    assert.equal(await page.getByLabel("Labor hours").inputValue(),"2.75","Save removal must reseed from fresh server state");
    assert.equal(await page.getByLabel("Corrective action / work performed").inputValue(),"Authoritative server progress after Save removal");
    assert.equal(await page.getByLabel("Add mechanic note").inputValue(),"","stale unsaved note must be purged when Save permission changes");

    await page.evaluate(() => {
      const s=window.__fleetMechanicWorkFixture;
      s.work={...s.work,actual_hours:4.5,corrective_action:"Newest authoritative server progress"};
      s.savePermission=true;
    });
    await page.getByRole("button",{name:"Refresh"}).click();
    await page.getByRole("button",{name:"Save Progress"}).waitFor();
    assert.equal(await page.getByLabel("Labor hours").isEnabled(),true);
    assert.equal(await page.getByLabel("Labor hours").inputValue(),"4.5","restored Save permission must use newest server state");
    assert.equal(await page.getByLabel("Corrective action / work performed").inputValue(),"Newest authoritative server progress");
    assert.equal(await page.getByLabel("Add mechanic note").inputValue(),"");
    const names=await actionNames(page);
    assert.equal(names.filter(name=>name==="start").length,0,"capability refresh must never invoke Start");
    assert.equal(names.filter(name=>name==="save").length,0,"capability refresh must never invoke Save");
  });

  await run("Desktop: Start recovery stays locked when permission is removed and restored",1440,async page => {
    await page.evaluate(() => {
      const s=window.__fleetMechanicWorkFixture;
      s.loseStartAck=true;
      s.failNextMutationStatus=true;
    });
    await page.getByRole("button",{name:"Mark Work Started"}).click();
    const recovery=page.getByRole("alert");
    await recovery.getByText(/Current server state must be checked/i).waitFor();
    const originalId=(await actions(page)).find(row=>row.action==="start").request_id;
    await page.evaluate(() => { window.__fleetMechanicWorkFixture.startPermission=false; });
    await page.getByRole("button",{name:"Refresh"}).click();
    await page.waitForFunction(() => window.__fleetMechanicWorkFixture.actions.filter(row=>row.action==="bootstrap").length===2);
    assert.equal(await recovery.count(),1);
    assert.equal(await page.getByRole("button",{name:"Mark Work Started"}).count(),0);
    assert.equal(await page.getByRole("button",{name:"Close work order"}).isDisabled(),true);
    await recovery.getByRole("button",{name:"Check Current Server State"}).click();
    await page.getByText(/not allowed to verify that action/i).waitFor();
    assert.equal(await recovery.count(),1,"Disallowed status must fail closed");
    await page.evaluate(() => { window.__fleetMechanicWorkFixture.startPermission=true; });
    await page.getByRole("button",{name:"Refresh"}).click();
    await page.waitForFunction(() => window.__fleetMechanicWorkFixture.actions.filter(row=>row.action==="bootstrap").length===3);
    assert.equal(await recovery.count(),1,"Capability restoration must not settle Start recovery");
    assert.equal(await page.getByRole("button",{name:"Close work order"}).isDisabled(),true);
    await recovery.getByRole("button",{name:"Check Current Server State"}).click();
    await page.getByText(/Work started\. CCS Fleet confirmed the interrupted request/i).waitFor();
    const operations=await actions(page);
    assert.equal(operations.filter(row=>row.action==="start").length,1,"Start must not replay");
    assert.ok(operations.filter(row=>row.action==="mutation_status").every(row=>row.request_id===originalId));
    assert.equal(await page.getByRole("button",{name:"Close work order"}).isEnabled(),true);
  });

  await run("Mobile: Save recovery purges stale draft and photos across permission changes",390,async page => {
    await page.getByLabel("Labor hours").fill("3.25");
    await page.getByLabel("Corrective action / work performed").fill("Original saved repair");
    await page.getByLabel("Add mechanic note").fill("Sensitive draft during recovery");
    const png=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=","base64");
    await page.locator('input[type="file"]').setInputFiles({name:"synthetic.png",mimeType:"image/png",buffer:png});
    await page.locator('img[src^="blob:"]').waitFor();
    await page.evaluate(() => {
      const s=window.__fleetMechanicWorkFixture;
      s.loseSaveAck=true;
      s.failNextMutationStatus=true;
    });
    await page.getByRole("button",{name:"Save Progress"}).click();
    const recovery=page.getByRole("alert");
    await recovery.getByText(/Current server state must be checked/i).waitFor();
    const originalId=(await actions(page)).find(row=>row.action==="save").request_id;
    await page.evaluate(() => { window.__fleetMechanicWorkFixture.savePermission=false; });
    await page.getByRole("button",{name:"Refresh"}).click();
    await page.waitForFunction(() => window.__fleetMechanicWorkFixture.actions.filter(row=>row.action==="bootstrap").length===2);
    await page.getByText(/Current server state must be checked/i).waitFor();
    assert.equal(await recovery.count(),1,"Capability removal must not settle Save recovery");
    assert.equal(await page.getByLabel("Labor hours").inputValue(),"3.25","Reseed must use server state");
    assert.equal(await page.getByLabel("Corrective action / work performed").inputValue(),"Original saved repair");
    assert.equal(await page.getByLabel("Add mechanic note").inputValue(),"","Stale note must be purged");
    assert.equal(await page.locator('img[src^="blob:"]').count(),0,"Unsaved photo previews must be purged");
    assert.equal(await page.getByLabel("Add mechanic note").isDisabled(),true);
    assert.equal(await page.getByRole("button",{name:"Save Progress"}).count(),0);
    await recovery.getByRole("button",{name:"Check Current Server State"}).click();
    await page.getByText(/not allowed to verify that action/i).waitFor();
    assert.equal(await recovery.count(),1,"Disallowed Save verification must remain locked");
    await page.evaluate(() => { window.__fleetMechanicWorkFixture.savePermission=true; });
    await page.getByRole("button",{name:"Refresh"}).click();
    await page.getByRole("button",{name:"Save Progress"}).waitFor();
    assert.equal(await recovery.count(),1,"Capability restoration must not settle Save recovery");
    assert.equal(await page.getByRole("button",{name:"Save Progress"}).isDisabled(),true);
    assert.equal(await page.getByLabel("Add mechanic note").inputValue(),"");
    assert.equal(await page.locator('img[src^="blob:"]').count(),0);
    await recovery.getByRole("button",{name:"Check Current Server State"}).click();
    await page.getByText(/Progress saved\. CCS Fleet confirmed the interrupted request without replaying it/i).waitFor();
    assert.equal(await page.getByLabel("Add mechanic note").inputValue(),"");
    assert.equal(await page.locator('img[src^="blob:"]').count(),0);
    const operations=await actions(page);
    assert.equal(operations.filter(row=>row.action==="save").length,1,"Save must not replay");
    assert.ok(operations.filter(row=>row.action==="mutation_status").every(row=>row.request_id===originalId));
    const final=await page.evaluate(() => window.__fleetMechanicWorkFixture);
    assert.equal((final.work.notes.match(/Sensitive draft during recovery/g)||[]).length,1);
    assert.equal(final.photoWrites,1,"Photo upload must run exactly once");
    assert.equal(await page.getByRole("button",{name:"Save Progress"}).isEnabled(),true);
  });

  await run("Mobile: delayed photo conversion cannot restore a draft after Save revocation during recovery",390,async page => {
    await page.evaluate(() => {
      const original=window.createImageBitmap;
      window.createImageBitmap=async (...args) => {
        await new Promise(resolve => { window.__releaseFleetPhotoDecode=resolve; });
        return original(...args);
      };
    });
    const png=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=","base64");
    await page.locator('input[type="file"]').setInputFiles({name:"late.png",mimeType:"image/png",buffer:png});
    await page.waitForFunction(() => typeof window.__releaseFleetPhotoDecode==="function");
    await page.getByLabel("Add mechanic note").fill("Request awaiting verification");
    await page.evaluate(() => {
      const s=window.__fleetMechanicWorkFixture;
      s.loseSaveAck=true;
      s.failNextMutationStatus=true;
    });
    await page.getByRole("button",{name:"Save Progress"}).click();
    const recovery=page.getByRole("alert");
    await recovery.getByText(/Current server state must be checked/i).waitFor();
    await page.evaluate(() => { window.__fleetMechanicWorkFixture.savePermission=false; });
    await page.getByRole("button",{name:"Refresh"}).click();
    await page.waitForFunction(() => window.__fleetMechanicWorkFixture.actions.filter(row=>row.action==="bootstrap").length===2);
    assert.equal(await recovery.count(),1);
    assert.equal(await page.getByLabel("Add mechanic note").inputValue(),"");
    await page.evaluate(() => window.__releaseFleetPhotoDecode());
    await page.waitForTimeout(300);
    assert.equal(await page.locator('img[src^="blob:"]').count(),0,"An in-flight image conversion must not resurrect purged photos");
    await page.evaluate(() => { window.__fleetMechanicWorkFixture.savePermission=true; });
    await page.getByRole("button",{name:"Refresh"}).click();
    await page.getByRole("button",{name:"Save Progress"}).waitFor();
    assert.equal(await recovery.count(),1);
    assert.equal(await page.locator('img[src^="blob:"]').count(),0);
    await recovery.getByRole("button",{name:"Check Current Server State"}).click();
    await page.getByText(/Progress saved\. CCS Fleet confirmed the interrupted request without replaying it/i).waitFor();
    assert.equal(await page.locator('img[src^="blob:"]').count(),0);
    assert.equal((await actionNames(page)).filter(name=>name==="save").length,1);
  });

  await run("Desktop: late photo processing cannot repopulate a job removed from equipment scope",1440,async page => {
    await page.evaluate(() => {
      const original=window.createImageBitmap;
      window.createImageBitmap=async (...args) => {
        await new Promise(resolve => { window.__releaseScopedFleetPhoto=resolve; });
        return original(...args);
      };
    });
    const png=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=","base64");
    await page.locator('input[type="file"]').setInputFiles({name:"out-of-scope.png",mimeType:"image/png",buffer:png});
    await page.waitForFunction(() => typeof window.__releaseScopedFleetPhoto==="function");
    await page.evaluate(() => { window.__fleetMechanicWorkFixture.scopeRemoved=true; });
    await page.getByRole("button",{name:"Refresh"}).click();
    await page.waitForFunction(() => window.__fleetMechanicWorkFixture.actions.filter(row=>row.action==="bootstrap").length===2);
    assert.equal(await page.getByRole("heading",{name:"Synthetic work recovery",exact:true}).count(),0);
    await page.evaluate(() => window.__releaseScopedFleetPhoto());
    await page.waitForTimeout(300);
    await page.evaluate(() => { window.__fleetMechanicWorkFixture.scopeRemoved=false; });
    await page.getByRole("button",{name:"Refresh"}).click();
    await page.getByText("WO-SYNTH-WORK",{exact:true}).waitFor();
    await page.getByText("WO-SYNTH-WORK",{exact:true}).locator("xpath=ancestor::button[1]").click();
    assert.equal(await page.locator('img[src^="blob:"]').count(),0,"Previous out-of-scope photo must never be restored in a new job session");
    assert.deepEqual(await actionNames(page),["bootstrap","bootstrap","bootstrap"],"No mechanic mutation may be replayed");
  });


  await run("Desktop: older bootstrap snapshot cannot overwrite applied Save recovery",1440,async page => {
    await page.getByLabel("Add mechanic note").fill("Newer committed overlapping note");
    await page.evaluate(() => { const s=window.__fleetMechanicWorkFixture; s.delayNextBootstrap=true; });
    await page.getByRole("button",{name:"Refresh"}).click();
    await page.waitForFunction(() => window.__fleetMechanicWorkFixture.bootstrapWaiting);
    await page.evaluate(() => { window.__fleetMechanicWorkFixture.loseSaveAck=true; });
    await page.getByRole("button",{name:"Save Progress"}).click();
    await page.getByText(/Progress saved\. CCS Fleet confirmed the interrupted request/i).waitFor();
    await page.getByText("Newer committed overlapping note").waitFor();
    await page.evaluate(() => window.__fleetMechanicWorkFixture.releaseBootstrap());
    await page.waitForFunction(() => !window.__fleetMechanicWorkFixture.bootstrapWaiting);
    await page.waitForTimeout(120);
    assert.equal(await page.getByText("Newer committed overlapping note").count(),1,"Older refresh must not remove newer saved notes");
    assert.equal(await page.getByLabel("Add mechanic note").inputValue(),"");
    assert.equal(await page.getByRole("button",{name:"Close work order"}).isEnabled(),true);
    assert.deepEqual(await actionNames(page),["bootstrap","bootstrap","save","mutation_status"]);
    const state=await page.evaluate(() => window.__fleetMechanicWorkFixture);
    assert.equal((state.work.notes.match(/Newer committed overlapping note/g)||[]).length,1,"Save must not be replayed");
  });

  await run("Mobile: stale bootstrap cannot clear uncertain Start or bypass removed access",390,async page => {
    await page.evaluate(() => { const s=window.__fleetMechanicWorkFixture; s.delayNextBootstrap=true; });
    await page.getByRole("button",{name:"Refresh"}).click();
    await page.waitForFunction(() => window.__fleetMechanicWorkFixture.bootstrapWaiting);
    await page.evaluate(() => {
      const s=window.__fleetMechanicWorkFixture;
      s.loseStartAck=true;
      s.failNextMutationStatus=true;
    });
    await page.getByRole("button",{name:"Mark Work Started"}).click();
    const recovery=page.getByRole("alert");
    await recovery.getByText(/Current server state must be checked/i).waitFor();
    await page.evaluate(() => {
      const s=window.__fleetMechanicWorkFixture;
      s.startPermission=false;
      s.releaseBootstrap();
    });
    await page.waitForFunction(() => !window.__fleetMechanicWorkFixture.bootstrapWaiting);
    await page.waitForTimeout(120);
    assert.equal(await recovery.count(),1,"Older refresh cannot release uncertain mutation");
    assert.equal(await page.getByRole("button",{name:"Close work order"}).isDisabled(),true);
    await recovery.getByRole("button",{name:"Check Current Server State"}).click();
    await page.getByText(/not allowed to verify that action/i).waitFor();
    assert.equal(await recovery.count(),1,"Removed permission must deny status check");
    await page.evaluate(() => { window.__fleetMechanicWorkFixture.startPermission=true; });
    await page.getByRole("button",{name:"Refresh"}).click();
    await page.waitForFunction(() => window.__fleetMechanicWorkFixture.actions.filter(row=>row.action==="bootstrap").length===3);
    assert.equal(await recovery.count(),1,"Permission restoration cannot itself settle recovery");
    await recovery.getByRole("button",{name:"Check Current Server State"}).click();
    await page.getByText(/Work started\. CCS Fleet confirmed the interrupted request/i).waitFor();
    assert.equal(await page.getByRole("button",{name:"Close work order"}).isEnabled(),true);
    const actions=await actionNames(page);
    assert.equal(actions.filter(name=>name==="start").length,1,"Start must never replay");
    assert.equal(actions.filter(name=>name==="mutation_status").length,3);
  });


  await run("Desktop: delayed successful Start response cannot restore out-of-scope job",1440,async page => {
    await page.evaluate(() => {
      const s=window.__fleetMechanicWorkFixture;
      s.delayNextBootstrap=true;
      s.bootstrapSnapshotOnRelease=true;
      s.delayNextStartAck=true;
    });
    await page.getByRole("button",{name:"Refresh"}).click();
    await page.waitForFunction(() => window.__fleetMechanicWorkFixture.bootstrapWaiting);
    await page.getByRole("button",{name:"Mark Work Started"}).click();
    await page.waitForFunction(() => window.__fleetMechanicWorkFixture.startAckWaiting);
    await page.evaluate(() => {
      const s=window.__fleetMechanicWorkFixture;
      s.scopeRemoved=true;
      s.releaseBootstrap();
    });
    await page.getByText("No active Fleet maintenance jobs right now.").waitFor();
    assert.equal(await page.getByRole("button",{name:"Close work order"}).count(),0);
    await page.evaluate(() => window.__fleetMechanicWorkFixture.releaseStartAck());
    await page.waitForFunction(() => !window.__fleetMechanicWorkFixture.startAckWaiting);
    await page.waitForTimeout(160);
    assert.equal(await page.getByText("WO-SYNTH-WORK",{exact:true}).count(),0,"Delayed Start acknowledgment must not restore scoped-out work");
    assert.equal(await page.getByRole("button",{name:"Close work order"}).count(),0,"Scope-revoked modal must stay closed");
    await page.evaluate(() => { window.__fleetMechanicWorkFixture.scopeRemoved=false; });
    await page.getByRole("button",{name:"Refresh"}).click();
    await page.getByText("WO-SYNTH-WORK",{exact:true}).waitFor();
    const s=await page.evaluate(() => window.__fleetMechanicWorkFixture);
    assert.equal(s.work.status,"in_progress");
    assert.equal(s.actions.filter(row=>row.action==="start").length,1,"Never replay Start after restoring scope");
  });

  await run("Mobile: delayed successful Save response cannot restore scoped-out note or job",390,async page => {
    await page.getByLabel("Add mechanic note").fill("Committed before access narrowed");
    await page.getByLabel("Labor hours").fill("4.5");
    await page.evaluate(() => {
      const s=window.__fleetMechanicWorkFixture;
      s.delayNextBootstrap=true;
      s.bootstrapSnapshotOnRelease=true;
      s.delayNextSaveAck=true;
    });
    await page.getByRole("button",{name:"Refresh"}).click();
    await page.waitForFunction(() => window.__fleetMechanicWorkFixture.bootstrapWaiting);
    await page.getByRole("button",{name:"Save Progress"}).click();
    await page.waitForFunction(() => window.__fleetMechanicWorkFixture.saveAckWaiting);
    await page.evaluate(() => {
      const s=window.__fleetMechanicWorkFixture;
      s.scopeRemoved=true;
      s.releaseBootstrap();
    });
    await page.getByText("No active Fleet maintenance jobs right now.").waitFor();
    await page.evaluate(() => window.__fleetMechanicWorkFixture.releaseSaveAck());
    await page.waitForFunction(() => !window.__fleetMechanicWorkFixture.saveAckWaiting);
    await page.waitForTimeout(160);
    assert.equal(await page.getByText("WO-SYNTH-WORK",{exact:true}).count(),0,"Delayed Save acknowledgment must not expose out-of-scope work");
    assert.equal(await page.getByText("Committed before access narrowed").count(),0,"Late response must not expose scoped-out note");
    assert.equal(await page.getByRole("button",{name:"Close work order"}).count(),0);
    await page.evaluate(() => { window.__fleetMechanicWorkFixture.scopeRemoved=false; });
    await page.getByRole("button",{name:"Refresh"}).click();
    await page.getByText("WO-SYNTH-WORK",{exact:true}).waitFor();
    await page.getByText("WO-SYNTH-WORK",{exact:true}).locator("xpath=ancestor::button[1]").click();
    await page.getByText("Committed before access narrowed").waitFor();
    assert.equal(await page.getByLabel("Add mechanic note").inputValue(),"","New session must not retain stale note draft");
    const s=await page.evaluate(() => window.__fleetMechanicWorkFixture);
    assert.equal(s.work.actual_hours,4.5);
    assert.equal((s.work.notes.match(/Committed before access narrowed/g)||[]).length,1);
    assert.equal(s.actions.filter(row=>row.action==="save").length,1,"Never replay Save after restoring scope");
  });

  await run("Desktop: newer authorized refresh keeps late Save acknowledgement locked until receipt verification",1440,async page => {
    await page.getByLabel("Add mechanic note").fill("Single authorized overlapping note");
    await page.evaluate(() => {
      const s=window.__fleetMechanicWorkFixture;
      s.delayNextBootstrap=true;
      s.bootstrapSnapshotOnRelease=true;
      s.delayNextSaveAck=true;
    });
    await page.getByRole("button",{name:"Refresh"}).click();
    await page.waitForFunction(() => window.__fleetMechanicWorkFixture.bootstrapWaiting);
    await page.getByRole("button",{name:"Save Progress"}).click();
    await page.waitForFunction(() => window.__fleetMechanicWorkFixture.saveAckWaiting);
    await page.evaluate(() => window.__fleetMechanicWorkFixture.releaseBootstrap());
    await page.locator("p.whitespace-pre-wrap").filter({hasText:"Single authorized overlapping note"}).waitFor();
    await page.waitForFunction(() => !window.__fleetMechanicWorkFixture.bootstrapWaiting);
    await page.evaluate(() => window.__fleetMechanicWorkFixture.releaseSaveAck());
    await page.waitForFunction(() => !window.__fleetMechanicWorkFixture.saveAckWaiting);
    const recovery=page.getByRole("alert");
    await page.getByText(/A newer Fleet portal refresh completed/i).waitFor();
    assert.equal(await recovery.count(),1,"Superseded Save must require explicit receipt verification");
    assert.equal(await page.getByRole("button",{name:"Save Progress"}).isDisabled(),true,"Save must not be replayable before receipt verification");
    assert.equal(await page.getByRole("button",{name:"Close work order"}).isDisabled(),true);
    await recovery.getByRole("button",{name:"Check Current Server State"}).click();
    await page.getByText(/Progress saved\. CCS Fleet confirmed the interrupted request without replaying it/i).waitFor();
    assert.equal(await page.getByRole("button",{name:"Save Progress"}).isEnabled(),true);
    assert.equal(await page.getByLabel("Add mechanic note").inputValue(),"");
    const state=await page.evaluate(() => window.__fleetMechanicWorkFixture);
    assert.equal(state.actions.filter(row=>row.action==="save").length,1,"No duplicate Save");
    assert.equal(state.actions.filter(row=>row.action==="mutation_status").length,1);
    assert.equal((state.work.notes.match(/Single authorized overlapping note/g)||[]).length,1);
  });

  await run("Desktop: delayed failed Start acknowledgement stays scoped out and reconciles after access returns",1440,async page => {
    await page.evaluate(() => {
      const s=window.__fleetMechanicWorkFixture;
      s.delayNextBootstrap=true;
      s.bootstrapSnapshotOnRelease=true;
      s.delayNextStartAck=true;
      s.failDelayedStartAck=true;
    });
    await page.getByRole("button",{name:"Refresh"}).click();
    await page.waitForFunction(() => window.__fleetMechanicWorkFixture.bootstrapWaiting);
    await page.getByRole("button",{name:"Mark Work Started"}).click();
    await page.waitForFunction(() => window.__fleetMechanicWorkFixture.startAckWaiting);
    const startId=(await actions(page)).find(row=>row.action==="start").request_id;
    await page.evaluate(() => {
      const s=window.__fleetMechanicWorkFixture;
      s.scopeRemoved=true;
      s.releaseBootstrap();
    });
    await page.getByText("No active Fleet maintenance jobs right now.").waitFor();
    await page.evaluate(() => window.__fleetMechanicWorkFixture.releaseStartAck());
    await page.waitForFunction(() => window.__fleetMechanicWorkFixture.actions.filter(row=>row.action==="mutation_status").length===1);
    await page.waitForTimeout(150);
    assert.equal(await page.getByText("WO-SYNTH-WORK",{exact:true}).count(),0,"Rejected acknowledgement must not re-expose out-of-scope work");
    assert.equal(await page.getByRole("button",{name:"Close work order"}).count(),0);
    const denied=(await actions(page)).filter(row=>row.action==="mutation_status");
    assert.equal(denied[0].request_id,startId,"Failure reconciliation must use the original Start request");
    await page.evaluate(() => { window.__fleetMechanicWorkFixture.scopeRemoved=false; });
    await page.getByRole("button",{name:"Refresh"}).click();
    await page.getByText("WO-SYNTH-WORK",{exact:true}).waitFor();
    await page.getByText("WO-SYNTH-WORK",{exact:true}).locator("xpath=ancestor::button[1]").click();
    const recovery=page.getByRole("alert");
    await recovery.getByText(/Current server state must be checked/i).waitFor();
    assert.equal(await page.getByRole("button",{name:"Close work order"}).isDisabled(),true,"Recovery lock must survive scope removal");
    await recovery.getByRole("button",{name:"Check Current Server State"}).click();
    await page.getByText(/Work started\. CCS Fleet confirmed the interrupted request/i).waitFor();
    assert.equal(await page.getByRole("button",{name:"Close work order"}).isEnabled(),true);
    const current=await page.evaluate(() => window.__fleetMechanicWorkFixture);
    assert.equal(current.work.status,"in_progress");
    assert.equal(current.actions.filter(row=>row.action==="start").length,1,"Start must never replay");
    assert.equal(current.actions.filter(row=>row.action==="mutation_status").length,2);
  });

  await run("Mobile: delayed failed Save acknowledgement never leaks scoped-out note or replays upload",390,async page => {
    await page.getByLabel("Labor hours").fill("5");
    await page.getByLabel("Add mechanic note").fill("Unique delayed failure work note");
    await page.evaluate(() => {
      const s=window.__fleetMechanicWorkFixture;
      s.delayNextBootstrap=true;
      s.bootstrapSnapshotOnRelease=true;
      s.delayNextSaveAck=true;
      s.failDelayedSaveAck=true;
    });
    await page.getByRole("button",{name:"Refresh"}).click();
    await page.waitForFunction(() => window.__fleetMechanicWorkFixture.bootstrapWaiting);
    await page.getByRole("button",{name:"Save Progress"}).click();
    await page.waitForFunction(() => window.__fleetMechanicWorkFixture.saveAckWaiting);
    const saveId=(await actions(page)).find(row=>row.action==="save").request_id;
    await page.evaluate(() => {
      const s=window.__fleetMechanicWorkFixture;
      s.scopeRemoved=true;
      s.releaseBootstrap();
    });
    await page.getByText("No active Fleet maintenance jobs right now.").waitFor();
    await page.evaluate(() => window.__fleetMechanicWorkFixture.releaseSaveAck());
    await page.waitForFunction(() => window.__fleetMechanicWorkFixture.actions.filter(row=>row.action==="mutation_status").length===1);
    await page.waitForTimeout(150);
    assert.equal(await page.getByText("WO-SYNTH-WORK",{exact:true}).count(),0);
    assert.equal(await page.getByText("Unique delayed failure work note").count(),0,"Scoped-out note must never reappear");
    assert.equal(await page.getByRole("button",{name:"Close work order"}).count(),0);
    const denied=(await actions(page)).filter(row=>row.action==="mutation_status");
    assert.equal(denied[0].request_id,saveId);
    await page.evaluate(() => { window.__fleetMechanicWorkFixture.scopeRemoved=false; });
    await page.getByRole("button",{name:"Refresh"}).click();
    await page.getByText("WO-SYNTH-WORK",{exact:true}).waitFor();
    await page.getByText("WO-SYNTH-WORK",{exact:true}).locator("xpath=ancestor::button[1]").click();
    const recovery=page.getByRole("alert");
    await recovery.getByText(/Current server state must be checked/i).waitFor();
    assert.equal(await page.getByLabel("Add mechanic note").inputValue(),"","New session must not resurrect unsaved note draft");
    assert.equal(await page.getByRole("button",{name:"Save Progress"}).isDisabled(),true);
    await recovery.getByRole("button",{name:"Check Current Server State"}).click();
    await page.getByText(/Progress saved\. CCS Fleet confirmed the interrupted request without replaying it/i).waitFor();
    assert.equal(await page.getByLabel("Add mechanic note").inputValue(),"");
    const current=await page.evaluate(() => window.__fleetMechanicWorkFixture);
    assert.equal(current.work.actual_hours,5);
    assert.equal((current.work.notes.match(/Unique delayed failure work note/g)||[]).length,1);
    assert.equal(current.actions.filter(row=>row.action==="save").length,1,"Save must never replay");
    assert.equal(current.actions.filter(row=>row.action==="mutation_status").length,2);
  });


  await run("Desktop: delayed failed Start acknowledgement stays locked across Start permission removal and restoration",1440,async page => {
    await page.evaluate(() => {
      const s=window.__fleetMechanicWorkFixture;
      s.delayNextBootstrap=true;
      s.bootstrapSnapshotOnRelease=true;
      s.delayNextStartAck=true;
      s.failDelayedStartAck=true;
    });
    await page.getByRole("button",{name:"Refresh"}).click();
    await page.waitForFunction(() => window.__fleetMechanicWorkFixture.bootstrapWaiting);
    await page.getByRole("button",{name:"Mark Work Started"}).click();
    await page.waitForFunction(() => window.__fleetMechanicWorkFixture.startAckWaiting);
    const originalId=(await actions(page)).find(row=>row.action==="start").request_id;
    await page.evaluate(() => {
      const s=window.__fleetMechanicWorkFixture;
      s.startPermission=false;
      s.releaseBootstrap();
    });
    await page.getByRole("button",{name:"Mark Work Started"}).waitFor({state:"detached"});
    await page.evaluate(() => window.__fleetMechanicWorkFixture.releaseStartAck());
    const recovery=page.getByRole("alert");
    await page.getByText(/not allowed to verify that action/i).waitFor();
    assert.equal(await recovery.count(),1,"Revoked Start permission must keep uncertain recovery locked");
    assert.equal(await page.getByRole("button",{name:"Close work order"}).isDisabled(),true);
    await recovery.getByRole("button",{name:"Check Current Server State"}).click();
    await page.waitForFunction(() => window.__fleetMechanicWorkFixture.actions.filter(row=>row.action==="mutation_status").length===2);
    assert.equal(await recovery.count(),1,"Repeated verification while Start is revoked must still fail closed");
    await page.evaluate(() => { window.__fleetMechanicWorkFixture.startPermission=true; });
    await page.getByRole("button",{name:"Refresh"}).click();
    await page.getByRole("button",{name:"Close work order"}).waitFor();
    assert.equal(await recovery.count(),1,"Permission restoration must not release Start recovery");
    assert.equal(await page.getByRole("button",{name:"Close work order"}).isDisabled(),true);
    await recovery.getByRole("button",{name:"Check Current Server State"}).click();
    await page.getByText(/Work started\. CCS Fleet confirmed the interrupted request/i).waitFor();
    assert.equal(await page.getByRole("button",{name:"Close work order"}).isEnabled(),true);
    const state=await page.evaluate(() => window.__fleetMechanicWorkFixture);
    assert.equal(state.work.status,"in_progress");
    assert.equal(state.actions.filter(row=>row.action==="start").length,1,"Start must not replay");
    const verifies=state.actions.filter(row=>row.action==="mutation_status");
    assert.equal(verifies.length,3);
    assert.ok(verifies.every(row=>row.request_id===originalId),"Every verification must reuse the original request ID");
  });

  await run("Mobile: delayed failed Save acknowledgement purges draft and stays locked across Save permission changes",390,async page => {
    await page.getByLabel("Labor hours").fill("6.75");
    await page.getByLabel("Corrective action / work performed").fill("Committed before Save permission was narrowed");
    await page.getByLabel("Add mechanic note").fill("Single note after permission recovery");
    const png=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=","base64");
    await page.locator('input[type="file"]').setInputFiles({name:"delayed-permission.png",mimeType:"image/png",buffer:png});
    await page.locator('img[src^="blob:"]').waitFor();
    await page.evaluate(() => {
      const s=window.__fleetMechanicWorkFixture;
      s.delayNextBootstrap=true;
      s.bootstrapSnapshotOnRelease=true;
      s.delayNextSaveAck=true;
      s.failDelayedSaveAck=true;
    });
    await page.getByRole("button",{name:"Refresh"}).click();
    await page.waitForFunction(() => window.__fleetMechanicWorkFixture.bootstrapWaiting);
    await page.getByRole("button",{name:"Save Progress"}).click();
    await page.waitForFunction(() => window.__fleetMechanicWorkFixture.saveAckWaiting);
    const originalId=(await actions(page)).find(row=>row.action==="save").request_id;
    await page.evaluate(() => {
      const s=window.__fleetMechanicWorkFixture;
      s.savePermission=false;
      s.releaseBootstrap();
    });
    await page.getByLabel("Add mechanic note").waitFor({state:"visible"});
    await page.getByRole("button",{name:"Save Progress"}).waitFor({state:"detached"});
    assert.equal(await page.getByLabel("Add mechanic note").inputValue(),"","Save permission removal must purge local note");
    assert.equal(await page.locator('img[src^="blob:"]').count(),0,"Save permission removal must purge unsaved photo preview");
    await page.evaluate(() => window.__fleetMechanicWorkFixture.releaseSaveAck());
    const recovery=page.getByRole("alert");
    await page.getByText(/not allowed to verify that action/i).waitFor();
    assert.equal(await recovery.count(),1);
    assert.equal(await page.getByRole("button",{name:"Close work order"}).isDisabled(),true);
    await recovery.getByRole("button",{name:"Check Current Server State"}).click();
    await page.waitForFunction(() => window.__fleetMechanicWorkFixture.actions.filter(row=>row.action==="mutation_status").length===2);
    assert.equal(await recovery.count(),1,"Revoked Save cannot confirm a previously committed request");
    await page.evaluate(() => { window.__fleetMechanicWorkFixture.savePermission=true; });
    await page.getByRole("button",{name:"Refresh"}).click();
    await page.getByRole("button",{name:"Save Progress"}).waitFor();
    assert.equal(await recovery.count(),1,"Save restoration must not unlock without verification");
    assert.equal(await page.getByRole("button",{name:"Save Progress"}).isDisabled(),true);
    assert.equal(await page.getByLabel("Add mechanic note").inputValue(),"");
    assert.equal(await page.locator('img[src^="blob:"]').count(),0);
    await recovery.getByRole("button",{name:"Check Current Server State"}).click();
    await page.getByText(/Progress saved\. CCS Fleet confirmed the interrupted request without replaying it/i).waitFor();
    assert.equal(await page.getByRole("button",{name:"Save Progress"}).isEnabled(),true);
    const state=await page.evaluate(() => window.__fleetMechanicWorkFixture);
    assert.equal(state.work.actual_hours,6.75);
    assert.equal((state.work.notes.match(/Single note after permission recovery/g)||[]).length,1);
    assert.equal(state.photoWrites,1,"Photo must be uploaded only once");
    assert.equal(state.actions.filter(row=>row.action==="save").length,1,"Save must not replay");
    const verifies=state.actions.filter(row=>row.action==="mutation_status");
    assert.equal(verifies.length,3);
    assert.ok(verifies.every(row=>row.request_id===originalId));
  });

  await run("Desktop: delayed successful Start acknowledgement cannot bypass newer revoked Start permission",1440,async page => {
    await page.evaluate(() => {
      const s=window.__fleetMechanicWorkFixture;
      s.delayNextBootstrap=true;
      s.bootstrapSnapshotOnRelease=true;
      s.delayNextStartAck=true;
    });
    await page.getByRole("button",{name:"Refresh"}).click();
    await page.waitForFunction(() => window.__fleetMechanicWorkFixture.bootstrapWaiting);
    await page.getByRole("button",{name:"Mark Work Started"}).click();
    await page.waitForFunction(() => window.__fleetMechanicWorkFixture.startAckWaiting);
    const originalId=(await actions(page)).find(row=>row.action==="start").request_id;
    await page.evaluate(() => {
      const s=window.__fleetMechanicWorkFixture;
      s.startPermission=false;
      s.releaseBootstrap();
    });
    await page.getByRole("button",{name:"Mark Work Started"}).waitFor({state:"detached"});
    await page.evaluate(() => window.__fleetMechanicWorkFixture.releaseStartAck());
    await page.getByText(/A newer Fleet portal refresh completed/i).waitFor();
    const recovery=page.getByRole("alert");
    assert.equal(await recovery.count(),1,"Later Start revocation must require explicit receipt verification");
    assert.equal(await page.getByRole("button",{name:"Close work order"}).isDisabled(),true);
    assert.equal(await page.getByRole("button",{name:"Mark Work Started"}).count(),0);
    await recovery.getByRole("button",{name:"Check Current Server State"}).click();
    await page.getByText(/not allowed to verify that action/i).waitFor();
    assert.equal(await recovery.count(),1,"Revoked Start permission must deny status verification");
    await page.evaluate(() => { window.__fleetMechanicWorkFixture.startPermission=true; });
    await page.getByRole("button",{name:"Refresh"}).click();
    await page.getByRole("button",{name:"Close work order"}).waitFor();
    assert.equal(await recovery.count(),1,"Restored capability alone cannot unlock Start");
    assert.equal(await page.getByRole("button",{name:"Close work order"}).isDisabled(),true);
    await recovery.getByRole("button",{name:"Check Current Server State"}).click();
    await page.getByText(/Work started\. CCS Fleet confirmed the interrupted request/i).waitFor();
    assert.equal(await page.getByRole("button",{name:"Close work order"}).isEnabled(),true);
    const state=await page.evaluate(() => window.__fleetMechanicWorkFixture);
    assert.equal(state.work.status,"in_progress");
    assert.equal(state.actions.filter(row=>row.action==="start").length,1,"No Start replay");
    const checks=state.actions.filter(row=>row.action==="mutation_status");
    assert.equal(checks.length,2);
    assert.ok(checks.every(row=>row.request_id===originalId));
  });

  await run("Mobile: successful delayed Save stays locked if permission changes twice before acknowledgement",390,async page => {
    await page.getByLabel("Labor hours").fill("7.5");
    await page.getByLabel("Add mechanic note").fill("Single delayed success note");
    const png=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=","base64");
    await page.locator('input[type="file"]').setInputFiles({name:"delayed-success.png",mimeType:"image/png",buffer:png});
    await page.locator('img[src^="blob:"]').waitFor();
    await page.evaluate(() => {
      const s=window.__fleetMechanicWorkFixture;
      s.delayNextBootstrap=true;
      s.bootstrapSnapshotOnRelease=true;
      s.delayNextSaveAck=true;
    });
    await page.getByRole("button",{name:"Refresh"}).click();
    await page.waitForFunction(() => window.__fleetMechanicWorkFixture.bootstrapWaiting);
    await page.getByRole("button",{name:"Save Progress"}).click();
    await page.waitForFunction(() => window.__fleetMechanicWorkFixture.saveAckWaiting);
    const originalId=(await actions(page)).find(row=>row.action==="save").request_id;
    await page.evaluate(() => {
      const s=window.__fleetMechanicWorkFixture;
      s.savePermission=false;
      s.releaseBootstrap();
    });
    await page.getByRole("button",{name:"Save Progress"}).waitFor({state:"detached"});
    assert.equal(await page.getByLabel("Add mechanic note").inputValue(),"","Revocation must purge local note");
    assert.equal(await page.locator('img[src^="blob:"]').count(),0,"Revocation must purge photo previews");
    await page.evaluate(() => {
      const s=window.__fleetMechanicWorkFixture;
      s.savePermission=true;
      s.releaseSaveAck();
    });
    await page.getByText(/A newer Fleet portal refresh completed/i).waitFor();
    const recovery=page.getByRole("alert");
    assert.equal(await recovery.count(),1,"Re-enabled server action must not implicitly confirm older Save");
    assert.equal(await page.getByRole("button",{name:"Save Progress"}).count(),0,"Client cannot infer restoration until refreshed");
    assert.equal(await page.getByRole("button",{name:"Close work order"}).isDisabled(),true);
    await page.getByRole("button",{name:"Refresh"}).click();
    await page.getByRole("button",{name:"Save Progress"}).waitFor();
    assert.equal(await page.getByRole("button",{name:"Save Progress"}).isDisabled(),true,"Refresh restores capability, not permission to replay");
    assert.equal(await recovery.count(),1);
    assert.equal(await page.getByLabel("Add mechanic note").inputValue(),"");
    assert.equal(await page.locator('img[src^="blob:"]').count(),0);
    await recovery.getByRole("button",{name:"Check Current Server State"}).click();
    await page.getByText(/Progress saved\. CCS Fleet confirmed the interrupted request without replaying it/i).waitFor();
    assert.equal(await page.getByRole("button",{name:"Save Progress"}).isEnabled(),true);
    const state=await page.evaluate(() => window.__fleetMechanicWorkFixture);
    assert.equal(state.work.actual_hours,7.5);
    assert.equal((state.work.notes.match(/Single delayed success note/g)||[]).length,1);
    assert.equal(state.photoWrites,1,"One uploaded image only");
    assert.equal(state.actions.filter(row=>row.action==="save").length,1,"Save cannot be replayed");
    const checks=state.actions.filter(row=>row.action==="mutation_status");
    assert.equal(checks.length,1);
    assert.equal(checks[0].request_id,originalId);
  });

  await run("Desktop: reload during delayed successful Start restores locked receipt check",1440,async page => {
    await page.evaluate(()=>{window.__fleetMechanicWorkFixture.delayNextStartAck=true;});
    await page.getByRole("button",{name:"Mark Work Started"}).click();
    await page.waitForFunction(()=>window.__fleetMechanicWorkFixture.startAckWaiting===true);
    const initial=await actions(page);
    const requestId=initial.find(row=>row.action==="start").request_id;
    const marker=await page.evaluate(()=>Object.entries(sessionStorage).find(([key])=>key.startsWith("ccs_fleet_mechanic_pending_v1"))?.[1]||"");
    assert.equal(JSON.parse(marker).requestId,requestId);
    assert.equal(marker.includes("synthetic-mechanic-token"),false,"Recovery marker must not store bearer tokens");
    await page.reload({waitUntil:"networkidle"});
    const recovery=page.getByRole("alert");
    await recovery.getByText(/Current server state must be checked/i).waitFor();
    assert.equal(await page.getByRole("button",{name:"Close work order"}).isDisabled(),true);
    assert.equal(await page.getByRole("button",{name:"Save Progress"}).isDisabled(),true);
    assert.deepEqual(await actionNames(page),["bootstrap"],"Reload must not replay an uncertain Start");
    await recovery.getByRole("button",{name:"Check Current Server State"}).click();
    await page.getByText(/Work started\. CCS Fleet confirmed the interrupted request/i).waitFor();
    const checked=await actions(page);
    assert.equal(checked[1].request_id,requestId,"Reconciliation must retain the original request id");
    assert.equal(await page.evaluate(()=>Object.keys(sessionStorage).filter(key=>key.startsWith("ccs_fleet_mechanic_pending_v1")).length),0,"Confirmed receipt must clear its marker");
    assert.equal(await page.evaluate(()=>window.__fleetMechanicWorkFixture.work.status),"in_progress");
  });

  await run("Mobile: reload during delayed Save does not duplicate notes or uploads",390,async page => {
    await page.getByLabel("Add mechanic note").fill("Single note after reload");
    await page.getByLabel("Labor hours").fill("3.5");
    const png=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=","base64");
    await page.locator('input[type="file"]').setInputFiles({name:"reload-photo.png",mimeType:"image/png",buffer:png});
    await page.locator('img[src^="blob:"]').waitFor();
    await page.evaluate(()=>{window.__fleetMechanicWorkFixture.delayNextSaveAck=true;});
    await page.getByRole("button",{name:"Save Progress"}).click();
    await page.waitForFunction(()=>window.__fleetMechanicWorkFixture.saveAckWaiting===true);
    const requestId=(await actions(page)).find(row=>row.action==="save").request_id;
    await page.reload({waitUntil:"networkidle"});
    const recovery=page.getByRole("alert");
    await recovery.getByText(/Current server state must be checked/i).waitFor();
    assert.equal(await page.getByLabel("Add mechanic note").inputValue(),"","Notes must not be copied to browser storage");
    assert.equal(await page.getByRole("button",{name:"Save Progress"}).isDisabled(),true);
    await recovery.getByRole("button",{name:"Check Current Server State"}).click();
    await page.getByText(/Progress saved\. CCS Fleet confirmed the interrupted request without replaying it/i).waitFor();
    const fixture=await page.evaluate(()=>window.__fleetMechanicWorkFixture);
    assert.equal(fixture.actions.filter(row=>row.action==="save").length,0,"Reload must not repeat Save");
    assert.equal(fixture.actions.find(row=>row.action==="mutation_status").request_id,requestId);
    assert.equal((fixture.work.notes.match(/Single note after reload/g)||[]).length,1);
    assert.equal(fixture.work.actual_hours,3.5);
    assert.equal(fixture.photoWrites,1,"Photo must be uploaded once despite reload");
    assert.equal(fixture.work.after_photos.length,1);
  });

  await run("Desktop: interrupted Start marker stays isolated across different bearer links",1440,async page => {
    await page.evaluate(()=>{window.__fleetMechanicWorkFixture.delayNextStartAck=true;});
    await page.getByRole("button",{name:"Mark Work Started"}).click();
    await page.waitForFunction(()=>window.__fleetMechanicWorkFixture.startAckWaiting===true);
    await page.goto(origin+"/#different-mechanic-token-abcdefghijklmnopqrstuvwxyz0123456789",{waitUntil:"networkidle"});
    await page.reload({waitUntil:"networkidle"});
    await page.getByText("WO-SYNTH-WORK",{exact:true}).first().waitFor();
    assert.equal(await page.getByRole("alert").count(),0,"A different bearer link cannot inherit the previous recovery marker");
    await page.goto(origin+"/#synthetic-mechanic-token-abcdefghijklmnopqrstuvwxyz0123456789",{waitUntil:"networkidle"});
    await page.reload({waitUntil:"networkidle"});
    await page.getByRole("alert").getByText(/Current server state must be checked/i).waitFor();
    assert.deepEqual(await actionNames(page),["bootstrap"],"Returning to original link must not replay Start");
  });

  await run("Desktop: blocked recovery storage prevents dispatch entirely",1440,async page => {
    await page.evaluate(()=>{
      const native=Storage.prototype.setItem;
      Storage.prototype.setItem=function(key,value){
        if(String(key).startsWith("ccs_fleet_mechanic_pending_v1"))throw new Error("Synthetic quota failure");
        return native.call(this,key,value);
      };
    });
    await page.getByRole("button",{name:"Mark Work Started"}).click();
    await page.getByText(/Start Work was not sent/i).waitFor();
    assert.deepEqual(await actionNames(page),["bootstrap"],"Storage failure must not send an untracked mutation");
  });

  const recoveryMarkerCount = page => page.evaluate(() => Object.keys(sessionStorage).filter(key=>key.startsWith("ccs_fleet_mechanic_pending_v1")).length);
  const changeGrant = (page,patch) => page.evaluate(patch => window.__fleetMechanicWorkFixture.setAuthorization(patch),patch);
  const preparePending = async (page,action) => {
    await page.evaluate(action => {window.__fleetMechanicWorkFixture[action==="start"?"delayNextStartAck":"delayNextSaveAck"]=true;},action);
    await page.getByRole("button",{name:action==="start"?"Mark Work Started":"Save Progress"}).click();
    await page.waitForFunction(action=>window.__fleetMechanicWorkFixture[action==="start"?"startAckWaiting":"saveAckWaiting"]===true,action);
    return (await actions(page)).find(row=>row.action===action).request_id;
  };
  const verifyNoReplay = async (page,action) => {
    const log=await actions(page);
    assert.equal(log.filter(row=>row.action===action).length,0,"Reload must not replay the interrupted mutation");
  };

  await run("Desktop: reload after Start permission removed keeps receipt locked until restored",1440,async page => {
    const requestId=await preparePending(page,"start");
    await changeGrant(page,{startPermission:false});
    await page.reload({waitUntil:"networkidle"});
    const alert=page.getByRole("alert");
    await alert.getByText(/Current server state must be checked/i).waitFor();
    assert.equal(await page.getByRole("button",{name:"Save Progress"}).isDisabled(),true);
    await alert.getByRole("button",{name:"Check Current Server State"}).click();
    await page.getByText(/Current server state could not be verified/i).waitFor();
    assert.equal(await recoveryMarkerCount(page),1,"Denied receipt check cannot clear evidence");
    await verifyNoReplay(page,"start");
    await changeGrant(page,{startPermission:true});
    await page.getByRole("button",{name:"Refresh"}).click();
    assert.equal(await alert.count(),1,"Refresh cannot unlock recovery");
    await alert.getByRole("button",{name:"Check Current Server State"}).click();
    await page.getByText(/Work started\. CCS Fleet confirmed the interrupted request/i).waitFor();
    assert.equal((await actions(page)).filter(row=>row.action==="mutation_status").length,2);
    assert.equal((await actions(page)).filter(row=>row.action==="mutation_status").every(row=>row.request_id===requestId),true);
    await verifyNoReplay(page,"start");
    assert.equal(await recoveryMarkerCount(page),0);
  });

  await run("Mobile: reload after Save permission removed cannot disclose receipt until restored",390,async page => {
    await page.getByLabel("Add mechanic note").fill("Permission removed while saving");
    const requestId=await preparePending(page,"save");
    await changeGrant(page,{savePermission:false});
    await page.reload({waitUntil:"networkidle"});
    const alert=page.getByRole("alert");
    await alert.getByText(/Current server state must be checked/i).waitFor();
    assert.equal(await page.getByRole("button",{name:"Save Progress"}).count(),0);
    assert.equal(await page.getByLabel("Add mechanic note").isDisabled(),true);
    await alert.getByRole("button",{name:"Check Current Server State"}).click();
    await page.getByText(/Current server state could not be verified/i).waitFor();
    assert.equal(await recoveryMarkerCount(page),1);
    await changeGrant(page,{savePermission:true});
    await page.getByRole("button",{name:"Refresh"}).click();
    await page.getByRole("button",{name:"Save Progress"}).waitFor();
    assert.equal(await page.getByRole("button",{name:"Save Progress"}).isDisabled(),true);
    await alert.getByRole("button",{name:"Check Current Server State"}).click();
    await page.getByText(/Progress saved\. CCS Fleet confirmed the interrupted request without replaying it/i).waitFor();
    const fixture=await page.evaluate(()=>window.__fleetMechanicWorkFixture);
    assert.equal((fixture.work.notes.match(/Permission removed while saving/g)||[]).length,1);
    assert.equal(fixture.actions.filter(row=>row.action==="mutation_status").every(row=>row.request_id===requestId),true);
    await verifyNoReplay(page,"save");
    assert.equal(await recoveryMarkerCount(page),0);
  });

  await run("Mobile: reload after equipment scope removal hides job until rescope and receipt check",390,async page => {
    await page.getByLabel("Add mechanic note").fill("Scoped-out durable note");
    const requestId=await preparePending(page,"save");
    await changeGrant(page,{scopeRemoved:true});
    await page.reload({waitUntil:"networkidle"});
    await page.getByText(/An interrupted mechanic update requires CCS review/i).waitFor();
    assert.equal(await page.getByText("WO-SYNTH-WORK",{exact:true}).count(),0);
    assert.equal(await page.getByText(/Scoped-out durable note/i).count(),0);
    assert.equal(await page.getByRole("button",{name:"Check Current Server State"}).count(),0);
    assert.equal(await recoveryMarkerCount(page),1);
    assert.deepEqual(await actionNames(page),["bootstrap"]);
    await changeGrant(page,{scopeRemoved:false});
    await page.reload({waitUntil:"networkidle"});
    const alert=page.getByRole("alert");
    await alert.getByText(/Current server state must be checked/i).waitFor();
    assert.equal(await page.getByRole("button",{name:"Save Progress"}).isDisabled(),true);
    await alert.getByRole("button",{name:"Check Current Server State"}).click();
    await page.getByText(/Progress saved\. CCS Fleet confirmed the interrupted request without replaying it/i).waitFor();
    assert.equal((await actions(page)).find(row=>row.action==="mutation_status").request_id,requestId);
    await verifyNoReplay(page,"save");
    assert.equal(await recoveryMarkerCount(page),0);
  });

  await run("Desktop: revoked link reload rejects bootstrap while preserving original receipt marker",1440,async page => {
    const requestId=await preparePending(page,"start");
    await changeGrant(page,{accessDenied:true});
    await page.reload({waitUntil:"networkidle"});
    await page.getByRole("heading",{name:"Mechanic link unavailable"}).waitFor();
    assert.equal(await page.getByText("WO-SYNTH-WORK",{exact:true}).count(),0);
    assert.equal(await page.getByRole("button",{name:"Check Current Server State"}).count(),0);
    assert.equal(await recoveryMarkerCount(page),1);
    assert.deepEqual(await actionNames(page),["bootstrap"]);
    await changeGrant(page,{accessDenied:false});
    await page.reload({waitUntil:"networkidle"});
    const alert=page.getByRole("alert");
    await alert.getByText(/Current server state must be checked/i).waitFor();
    await alert.getByRole("button",{name:"Check Current Server State"}).click();
    await page.getByText(/Work started\. CCS Fleet confirmed the interrupted request/i).waitFor();
    assert.equal((await actions(page)).find(row=>row.action==="mutation_status").request_id,requestId);
    await verifyNoReplay(page,"start");
    assert.equal(await recoveryMarkerCount(page),0);
  });

  console.log("Fleet mechanic work recovery browser acceptance: " + (process.env.FLEET_CASE_MATCH ? passed + " filtered PASS" : passed + "/31 PASS"));
} finally {
  if (browser) await browser.close().catch(() => {});
  if (vite) await vite.close().catch(() => {});
  await rm(scratch,{recursive:true,force:true}).catch(() => {});
}

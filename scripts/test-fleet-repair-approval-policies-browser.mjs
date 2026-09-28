// Isolated Chromium acceptance for the real Fleet repair approval policy component.
// All Base44 responses are synthetic in-memory data; outside requests are blocked.
import assert from "node:assert/strict";
import { mkdtemp, writeFile, symlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";

const appRoot = process.cwd();
const playwrightPath = process.env.FLEET_PLAYWRIGHT_PATH || "/tmp/fleet-browser-check/node_modules/playwright/index.mjs";
const { chromium } = await import(playwrightPath);
const scratch = await mkdtemp(path.join(tmpdir(), "fleet-repair-policy-browser-"));
let vite, browser, passed = 0;

try {
  await symlink(path.join(appRoot, "node_modules"), path.join(scratch, "node_modules"), "dir");
  await writeFile(path.join(scratch, "index.html"),
    "<!doctype html><html><head><meta charset='UTF-8'><meta name='viewport' content='width=device-width,initial-scale=1'></head><body><div id='root'></div><script type='module' src='/main.jsx'></script></body></html>");
  await writeFile(path.join(scratch, "main.jsx"), [
    'import React from "react";',
    'import { createRoot } from "react-dom/client";',
    'import FleetRepairApprovalPolicies from "/@fs/app/src/components/fleet/FleetRepairApprovalPolicies.jsx";',
    'createRoot(document.getElementById("root")).render(<FleetRepairApprovalPolicies />);',
  ].join("\n"));

  await writeFile(path.join(scratch, "mockPolicy.js"), [
    'const clone = value => JSON.parse(JSON.stringify(value));',
    'let revision = 1, created = 0;',
    'const initial = {id:"policy-1",name:"Manager",approval_tier:"Manager",minimum_amount:0,maximum_amount:0,approval_required:true,enabled:true,notes:"",sort_order:0,creation_key:"seed-policy",updated_date:"v1"};',
    'const state = {actions:[],policies:[clone(initial)],failNextList:false,createThenLoseAck:false,failNextUpdate:false,updateThenLoseAck:false,deleteThenLoseAck:false};',
    'window.__fleetPolicyFixture = state;',
    'const conflict = message => {const err=new Error(message);err.response={status:409};return err;};',
    'export const base44 = {functions:{async invoke(name,payload){',
    ' if(name!=="fleetRepairEstimateAction") throw new Error("Unexpected function: "+name);',
    ' state.actions.push(clone(payload));',
    ' if(payload.action==="policy_list"){if(state.failNextList){state.failNextList=false;throw new Error("Synthetic policy list failure");}return {data:{success:true,policies:clone(state.policies)}};}',
    ' if(payload.action==="policy_create"){let row=state.policies.find(p=>p.creation_key===payload.creation_key);if(!row){row={...clone(payload.policy),id:"policy-created-"+(++created),creation_key:payload.creation_key,updated_date:"v"+(++revision)};state.policies.push(row);}if(state.createThenLoseAck){state.createThenLoseAck=false;throw new Error("Synthetic lost create acknowledgment");}return {data:{success:true,policy:clone(row)}};}',
    ' if(payload.action==="policy_update"){const index=state.policies.findIndex(p=>p.id===payload.id);if(index<0)throw conflict("Synthetic policy missing");const current=state.policies[index];if(current.updated_date!==payload.expected_updated_date)throw conflict("Synthetic policy changed");if(state.failNextUpdate){state.failNextUpdate=false;throw new Error("Synthetic update transport failure");}const row={...current,...clone(payload.policy),id:current.id,creation_key:current.creation_key,updated_date:"v"+(++revision)};state.policies[index]=row;if(state.updateThenLoseAck){state.updateThenLoseAck=false;throw new Error("Synthetic lost update acknowledgment");}return {data:{success:true,policy:clone(row)}};}',
    ' if(payload.action==="policy_delete"){const index=state.policies.findIndex(p=>p.id===payload.id);if(index<0)return {data:{success:true,deleted:true,reused:true}};const current=state.policies[index];if(current.updated_date!==payload.expected_updated_date)throw conflict("Synthetic policy changed after confirmation");state.policies.splice(index,1);if(state.deleteThenLoseAck){state.deleteThenLoseAck=false;throw new Error("Synthetic lost delete acknowledgment");}return {data:{success:true,deleted:true}};}',
    ' throw new Error("Unexpected policy action: "+payload.action);',
    '}}};',
  ].join("\n"));

  vite = await createServer({
    configFile:false, root:scratch, plugins:[react()],
    resolve:{alias:[
      {find:"@/api/base44Client",replacement:path.join(scratch,"mockPolicy.js")},
      {find:/^@\//,replacement:path.join(appRoot,"src")+"/"},
    ]},
    server:{host:"127.0.0.1",port:0,strictPort:false,fs:{allow:[appRoot,scratch]}},
    logLevel:"error",
  });
  await vite.listen();
  const origin = "http://127.0.0.1:" + vite.httpServer.address().port;
  browser = await chromium.launch({headless:true,args:["--no-sandbox"]});

  async function run(name,width,scenario){
    const page=await browser.newPage({viewport:{width,height:width<500?844:900}});
    const errors=[],outside=[];
    page.on("pageerror",e=>errors.push(e.message));
    page.on("request",request=>{if(request.url().startsWith("http")&&!request.url().startsWith(origin))outside.push(request.url());});
    await page.route("**/*",route=>{const url=route.request().url();return url.startsWith("http")&&!url.startsWith(origin)?route.abort("blockedbyclient"):route.continue();});
    try{
      await page.goto(origin,{waitUntil:"networkidle"});
      await page.getByRole("button",{name:"Add Threshold"}).waitFor();
      await page.waitForFunction(()=>!document.querySelector('button[disabled]')?.textContent?.includes("Add Threshold"));
      await scenario(page);
      assert.deepEqual(errors,[],"No browser runtime errors");
      assert.deepEqual(outside,[],"No outside network requests");
      passed++; console.log("PASS "+name);
    }finally{await page.close();}
  }
  async function openCreate(page){
    const add=page.getByRole("button",{name:"Add Threshold"});
    await add.click();
    const dialog=page.getByRole("dialog",{name:"Add Approval Threshold"});
    await dialog.waitFor();
    await page.waitForFunction(()=>document.activeElement?.getAttribute("placeholder")==="Manager approval");
    return dialog;
  }
  async function openEdit(page){
    await page.getByRole("button",{name:"Edit",exact:true}).click();
    const dialog=page.getByRole("dialog",{name:"Edit Approval Threshold"});
    await dialog.waitFor();
    return dialog;
  }
  const actions=(page,action)=>page.evaluate(a=>window.__fleetPolicyFixture.actions.filter(x=>x.action===a),action);

  await run("Desktop: editor traps focus, Escape closes, and opener regains focus",1440,async page=>{
    const dialog=await openCreate(page);
    const save=dialog.getByRole("button",{name:"Save Threshold"});
    await save.focus();
    await page.keyboard.press("Tab");
    assert.equal(await dialog.getByRole("button",{name:"Close"}).evaluate(el=>document.activeElement===el),true);
    await page.keyboard.press("Escape");
    await dialog.waitFor({state:"hidden"});
    await page.waitForFunction(()=>[...document.querySelectorAll("button")].some(button=>button.textContent?.trim()==="Add Threshold"&&document.activeElement===button));
    assert.equal(await page.getByRole("button",{name:"Add Threshold"}).evaluate(el=>document.activeElement===el),true);
  });

  await run("Desktop: lost create acknowledgment reconciles by stable creation identity",1440,async page=>{
    const dialog=await openCreate(page);
    await dialog.getByLabel("Policy name").fill("Director");
    await page.evaluate(()=>{window.__fleetPolicyFixture.createThenLoseAck=true;});
    await dialog.getByRole("button",{name:"Save Threshold"}).click();
    const check=dialog.getByRole("button",{name:"Check save status"});
    await check.waitFor();
    assert.equal(await dialog.getByLabel("Policy name").isDisabled(),true);
    assert.equal((await actions(page,"policy_create")).length,1);
    const key=(await actions(page,"policy_create"))[0].creation_key;
    assert.match(key,/^fleet-policy-/);
    await check.click();
    await dialog.waitFor({state:"hidden"});
    await page.getByRole("status").getByText(/new threshold was saved/i).waitFor();
    assert.equal((await actions(page,"policy_create")).length,1);
    assert.equal(await page.evaluate(()=>window.__fleetPolicyFixture.policies.filter(p=>p.creation_key.startsWith("fleet-policy-")).length),1);
  });

  await run("Desktop: uncommitted update unlocks only after a read-only status check",1440,async page=>{
    const dialog=await openEdit(page);
    await dialog.getByLabel("Policy name").fill("Manager Updated");
    await page.evaluate(()=>{window.__fleetPolicyFixture.failNextUpdate=true;});
    await dialog.getByRole("button",{name:"Save Threshold"}).click();
    const check=dialog.getByRole("button",{name:"Check save status"});
    await check.waitFor();
    assert.equal(await dialog.getByLabel("Policy name").isDisabled(),true);
    await check.click();
    await page.waitForFunction(()=>!document.querySelector('input[placeholder="Manager approval"]')?.disabled);
    assert.equal(await dialog.getByLabel("Policy name").inputValue(),"Manager Updated");
    assert.equal((await actions(page,"policy_update")).length,1);
    await dialog.getByRole("button",{name:"Save Threshold"}).click();
    await dialog.waitFor({state:"hidden"});
    const updates=await actions(page,"policy_update");
    assert.equal(updates.length,2);
    assert.equal(updates[0].expected_updated_date,"v1");
    assert.equal(updates[1].expected_updated_date,"v1");
  });

  await run("Desktop: committed update with lost acknowledgment is never replayed",1440,async page=>{
    const dialog=await openEdit(page);
    await dialog.getByLabel("Notes").fill("Needs director review");
    await page.evaluate(()=>{window.__fleetPolicyFixture.updateThenLoseAck=true;});
    await dialog.getByRole("button",{name:"Save Threshold"}).click();
    const check=dialog.getByRole("button",{name:"Check save status"});
    await check.waitFor();
    await check.click();
    await dialog.waitFor({state:"hidden"});
    await page.getByRole("status").getByText(/threshold update is present/i).waitFor();
    assert.equal((await actions(page,"policy_update")).length,1);
    assert.equal(await page.evaluate(()=>window.__fleetPolicyFixture.policies[0].notes),"Needs director review");
  });

  await run("Mobile: lost toggle acknowledgment blocks all writes until reconciled",390,async page=>{
    await page.evaluate(()=>{window.__fleetPolicyFixture.updateThenLoseAck=true;});
    await page.getByRole("button",{name:"Disable"}).click();
    const check=page.getByRole("button",{name:"Check policy status"});
    await check.waitFor();
    assert.equal(await page.getByRole("button",{name:"Add Threshold"}).isDisabled(),true);
    assert.equal(await page.getByRole("button",{name:"Edit",exact:true}).isDisabled(),true);
    assert.equal((await actions(page,"policy_update")).length,1);
    await check.click();
    await page.getByRole("status").getByText(/is now disabled/i).waitFor();
    assert.equal((await actions(page,"policy_update")).length,1);
    await page.waitForFunction(()=>[...document.querySelectorAll("button")].some(button=>button.textContent?.trim()==="Add Threshold"&&document.activeElement===button));
    assert.equal(await page.getByRole("button",{name:"Add Threshold"}).evaluate(el=>document.activeElement===el),true);
  });

  await run("Desktop: lost delete acknowledgment reconciles absence without a second delete",1440,async page=>{
    await page.getByRole("button",{name:"Delete Manager"}).click();
    const confirm=page.getByRole("alertdialog");
    await confirm.waitFor();
    await page.evaluate(()=>{window.__fleetPolicyFixture.deleteThenLoseAck=true;});
    await confirm.getByRole("button",{name:"Delete Threshold"}).click();
    await confirm.waitFor({state:"hidden"});
    const check=page.getByRole("button",{name:"Check policy status"});
    await check.waitFor();
    const deletes=await actions(page,"policy_delete");
    assert.equal(deletes.length,1);
    assert.equal(deletes[0].expected_updated_date,"v1");
    await check.click();
    await page.getByRole("status").getByText(/threshold is deleted/i).waitFor();
    assert.equal((await actions(page,"policy_delete")).length,1);
  });

  await run("Desktop: stale delete confirmation cannot remove a concurrently changed threshold",1440,async page=>{
    await page.getByRole("button",{name:"Delete Manager"}).click();
    const confirm=page.getByRole("alertdialog");
    await page.evaluate(()=>{window.__fleetPolicyFixture.policies[0].updated_date="v2";window.__fleetPolicyFixture.policies[0].notes="Concurrent edit";});
    await confirm.getByRole("button",{name:"Delete Threshold"}).click();
    await confirm.waitFor({state:"hidden"});
    await page.getByRole("alert").getByText(/changed after confirmation/i).waitFor();
    assert.equal(await page.evaluate(()=>window.__fleetPolicyFixture.policies.length),1);
    const deletes=await actions(page,"policy_delete");
    assert.equal(deletes.length,1);
    assert.equal(deletes[0].expected_updated_date,"v1");
    assert.equal(await page.getByRole("button",{name:"Check policy status"}).count(),0);
  });

  await run("Desktop: confirmed update plus list-refresh failure exposes retry, not resave",1440,async page=>{
    const dialog=await openEdit(page);
    await dialog.getByLabel("Notes").fill("Refresh isolation");
    await page.evaluate(()=>{window.__fleetPolicyFixture.failNextList=true;});
    await dialog.getByRole("button",{name:"Save Threshold"}).click();
    await dialog.waitFor({state:"hidden"});
    const retry=page.getByRole("button",{name:"Retry refresh"});
    await retry.waitFor();
    assert.equal((await actions(page,"policy_update")).length,1);
    await retry.click();
    assert.equal((await actions(page,"policy_update")).length,1);
    await page.waitForFunction(()=>[...document.querySelectorAll("button")].some(button=>button.textContent?.trim()==="Add Threshold"&&document.activeElement===button));
    assert.equal(await page.getByRole("button",{name:"Add Threshold"}).evaluate(el=>document.activeElement===el),true);
  });

  console.log("REPAIR_APPROVAL_POLICY_BROWSER_PASS="+passed);
} finally {
  if(browser) await browser.close();
  if(vite) await vite.close();
  await rm(scratch,{recursive:true,force:true});
}

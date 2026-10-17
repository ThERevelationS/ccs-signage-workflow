// Real SIPS Template Builder unsaved-navigation acceptance in isolated Chromium.
// All templates, saved checklist rows, and data readers are synthetic and read-only.
import assert from "node:assert/strict";
import { mkdtemp, symlink, readdir, writeFile, copyFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";

const root=process.cwd();
const scratch=await mkdtemp(path.join(tmpdir(),"sips-unsaved-navigation-"));
const {chromium}=await import(process.env.SIPS_PLAYWRIGHT_PATH ||
 "/tmp/sips-browser-check/node_modules/playwright/index.mjs");
let vite, browser, passed=0;

async function run(name, origin, viewport, work) {
 const context=await browser.newContext({viewport});
 const page=await context.newPage();
 const errors=[];
 page.on("pageerror", err=>errors.push(err.message));
 page.on("request", request=>{
   if (request.url().startsWith("http")&&!request.url().startsWith(origin))
     errors.push("Forbidden external request: "+request.url());
 });
 page.route("**/*",route=>route.request().url().startsWith("http")&&!route.request().url().startsWith(origin)
   ?route.abort("blockedbyclient"):route.continue());
 try {
   await page.goto(origin,{waitUntil:"networkidle"});
   await page.getByRole("heading",{name:"Checklist Builder"}).waitFor();
   await work(page);
   assert.deepEqual(errors,[],"No runtime errors or outside-origin requests");
   assert.deepEqual(await page.evaluate(()=>window.__savedRows),[
     {id:"saved-1",text:"Completed installation",status:"Completed",approved_by:"Supervisor"},
   ],"Saved answers stay unchanged");
   assert.equal(await page.evaluate(()=>window.__writeAttempts),0,"No synthetic or actual persistence writes");
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,
     "No unexpected phone horizontal overflow");
   console.log("PASS "+name);
   passed++;
 } finally { await context.close(); }
}
const navDialog=page=>page.getByRole("alertdialog",{name:"Discard unsaved checklist edits?"});
async function optionEditor(page,name) {
 await page.getByRole("tab",{name:"Checklist Options"}).click();
 await page.getByRole("button",{name:"Edit checklist option "+name}).click();
}
async function productEditor(page,name) {
 await page.getByRole("tab",{name:"Product Checklists"}).click();
 await page.getByRole("button",{name:"Edit product checklist "+name}).click();
}
async function canceled(dialog) {
 await dialog.getByRole("button",{name:"Keep editing"}).click();
 await dialog.waitFor({state:"hidden"});
}
async function confirmSwitch(dialog) {
 await dialog.getByRole("button",{name:"Discard and switch"}).click();
 await dialog.waitFor({state:"hidden"});
}

try {
 await symlink(path.join(root,"node_modules"),path.join(scratch,"node_modules"),"dir");
 const assets=await readdir(path.join(root,"dist/assets"));
 const css=assets.find(a=>a.endsWith(".css"));
 if(!css) throw Error("Build production CSS first");
 await copyFile(path.join(root,"dist/assets",css),path.join(scratch,"styles.css"));
 await writeFile(path.join(scratch,"index.html"),
  '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">' +
  '<link rel="stylesheet" href="/styles.css"></head><body><div id="root"></div><script type="module" src="/main.jsx"></script></body></html>');
 await writeFile(path.join(scratch,"mockClient.js"),[
  'export const base44={entities:{',
  ' ChecklistSubItem:{fixtureKind:"option"},AuthorizedEmail:{fixtureKind:"users"},',
  ' GlobalSettings:{fixtureKind:"setting"}',
  '}};',
 ].join("\n"));
 await writeFile(path.join(scratch,"mockReaders.js"),[
  'export async function loadAllEntityRows({entity}){',
  ' if(entity.fixtureKind==="users")return [];',
  ' if(entity.fixtureKind==="option")return [',
  '  {id:"safety",name:"Safety Review",order:0,applies_to_product_types:["Cabinet Sign"]},',
  '  {id:"permit",name:"Permit Review",order:1,applies_to_product_types:["Cabinet Sign"]} ];',
  ' throw Error("Unexpected entity read");',
  '}',
  'export async function loadSingleGlobalSetting({settingKey}){',
  ' const settings={',
  '  productTypes:{items:["Cabinet Sign","Monument"]},',
  '  productTypeTemplates:{',
  '    "Cabinet Sign":{items:[{id:"base-1",text:"Build cabinet"}]},',
  '    Monument:{items:[{id:"base-2",text:"Build monument"}]}',
  '  },',
  '  subTemplateItems:{',
  '    safety:{items:[{id:"safety-1",text:"Inspect safety"}]},',
  '    permit:{items:[{id:"permit-1",text:"Check permit"}]}',
  '  }, dropdownConditions:{items:[]},',
  ' };',
  ' if(!(settingKey in settings))throw Error("Unknown setting: "+settingKey);',
  ' return {id:settingKey,setting_key:settingKey,setting_value:settings[settingKey]};',
  '}',
  'export async function saveGlobalSettingValueIfUnchanged(){',
  ' window.__writeAttempts++;throw Error("Fixture forbids persistence");',
  '}',
 ].join("\n"));
 await writeFile(path.join(scratch,"main.jsx"),[
  'import React from "react"; import {createRoot} from "react-dom/client";',
  'import TemplateBuilder from "/@fs'+path.join(root,"src/components/sips/TemplateBuilder.jsx")+'";',
  'window.__savedRows=[{id:"saved-1",text:"Completed installation",status:"Completed",approved_by:"Supervisor"}];',
  'window.__writeAttempts=0;window.__closeCount=0;window.__applyCount=0;',
  'function Fixture(){const [open,setOpen]=React.useState(true);',
  'return <>{open&&<TemplateBuilder isOpen={true} isAdmin={true} existingChecklist={window.__savedRows}',
  'onClose={()=>{window.__closeCount++;setOpen(false)}}',
  'onApplyTemplate={()=>{window.__applyCount++}} />}</>;}',
  'createRoot(document.getElementById("root")).render(<Fixture/>);',
 ].join("\n"));
 vite=await createServer({
  configFile:false,root:scratch,plugins:[react()],
  resolve:{alias:[
   {find:"@/api/base44Client",replacement:path.join(scratch,"mockClient.js")},
   {find:"@/components/estimator/loadAllEntityRows",replacement:path.join(scratch,"mockReaders.js")},
   {find:"@/components/permitting/permitGlobalSettingsPersistence",replacement:path.join(scratch,"mockReaders.js")},
   {find:/^@\//,replacement:path.join(root,"src")+"/"},
  ]},
  server:{host:"127.0.0.1",port:0,fs:{allow:[root,scratch]}},logLevel:"error",
 });
 await vite.listen();
 const origin="http://127.0.0.1:"+vite.httpServer.address().port;
 browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
 for(const [label,viewport] of [
  ["Desktop",{width:1366,height:900}],
  ["320px phone",{width:320,height:568}],
 ]) {
  await run(label+": option editor switch preserves drafts on cancel, discards only after confirmation",
   origin,viewport,async page=>{
    await optionEditor(page,"Safety Review");
    await page.getByRole("textbox",{name:"New checklist option item"}).fill("Draft safety task");
    await page.getByRole("button",{name:"Add checklist item",exact:true}).click();
    await page.getByRole("button",{name:"Save checklist option"}).waitFor();
    await page.getByRole("button",{name:"Edit checklist option Permit Review"}).click();
    const dialog=navDialog(page);
    await dialog.waitFor();
    assert.match(await dialog.innerText(),/Switching to “Permit Review”/);
    await canceled(dialog);
    await page.getByRole("button",{name:"Save checklist option"}).waitFor();
    await page.getByRole("button",{name:"Edit checklist item Draft safety task"}).waitFor();
    await page.getByRole("button",{name:"Edit checklist option Permit Review"}).click();
    await confirmSwitch(navDialog(page));
    await page.getByRole("textbox",{name:"New checklist option item"}).waitFor();
    await page.getByRole("button",{name:"Edit checklist item Check permit"}).waitFor();
    await page.getByRole("button",{name:"Edit checklist option Safety Review"}).click();
    assert.equal(await page.getByRole("button",{name:"Edit checklist item Draft safety task"}).count(),0,
      "Discard must restore last-saved Safety Review checklist");
    assert.equal(await page.evaluate(()=>window.__closeCount),0);
   });
  await run(label+": product editor switch safeguards new checklist rows",origin,viewport,async page=>{
    await productEditor(page,"Cabinet Sign");
    await page.getByRole("textbox",{name:"New product checklist item"}).fill("Draft cabinet test");
    await page.getByRole("button",{name:"Add product checklist item"}).click();
    await page.getByRole("button",{name:"Save product checklist"}).waitFor();
    await page.getByRole("button",{name:"Edit product checklist Monument"}).click();
    const dialog=navDialog(page);
    await dialog.waitFor();
    await canceled(dialog);
    await page.getByRole("button",{name:"Edit checklist item Draft cabinet test"}).waitFor();
    await page.getByRole("button",{name:"Edit product checklist Monument"}).click();
    await confirmSwitch(navDialog(page));
    await page.getByRole("button",{name:"Edit checklist item Build monument"}).waitFor();
    await page.getByRole("button",{name:"Edit product checklist Cabinet Sign"}).click();
    assert.equal(await page.getByRole("button",{name:"Edit checklist item Draft cabinet test"}).count(),0);
   });
  await run(label+": tab changes require confirmation for unfinished checklist text",origin,viewport,async page=>{
    await optionEditor(page,"Safety Review");
    const input=page.getByRole("textbox",{name:"New checklist option item"});
    await input.fill("Still typing draft");
    await page.getByRole("tab",{name:"Select & Apply"}).click();
    const dialog=navDialog(page);
    await dialog.waitFor();
    assert.match(await dialog.innerText(),/Switching tabs/);
    await canceled(dialog);
    assert.equal(await input.inputValue(),"Still typing draft");
    await page.getByRole("tab",{name:"Select & Apply"}).click();
    await confirmSwitch(navDialog(page));
    await page.getByRole("tab",{name:"Checklist Options"}).click();
    await page.getByRole("textbox",{name:"New checklist option item"}).waitFor();
    assert.equal(await page.getByRole("textbox",{name:"New checklist option item"}).inputValue(),"");
    assert.equal(await page.getByRole("button",{name:"Edit checklist item Still typing draft"}).count(),0);
   });
  await run(label+": closing with an unfinished name is cancelable and requires discard confirmation",
   origin,viewport,async page=>{
    await page.getByRole("tab",{name:"Checklist Options"}).click();
    const input=page.getByPlaceholder("New checklist option...");
    await input.fill("Unpublished option draft");
    await page.getByRole("button",{name:"Close",exact:true}).click();
    const dialog=navDialog(page);
    await dialog.waitFor();
    assert.match(await dialog.innerText(),/Closing the builder/);
    await canceled(dialog);
    assert.equal(await input.inputValue(),"Unpublished option draft");
    assert.equal(await page.evaluate(()=>window.__closeCount),0);
    await page.getByRole("button",{name:"Close",exact:true}).click();
    await dialog.getByRole("button",{name:"Discard and close"}).click();
    await page.getByRole("heading",{name:"Checklist Builder"}).waitFor({state:"hidden"});
    assert.equal(await page.evaluate(()=>window.__closeCount),1);
   });
 }
 console.log("PASS "+passed+" isolated Chromium SIPS Template Builder unsaved-navigation scenarios (read-only)");
} finally {
 await browser?.close();
 await vite?.close();
 await rm(scratch,{recursive:true,force:true});
}

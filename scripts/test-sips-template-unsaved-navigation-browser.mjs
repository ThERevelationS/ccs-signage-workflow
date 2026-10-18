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
async function pendingSave(page, count) {
 await page.waitForFunction(expected=>window.__saveCalls?.length===expected &&
   window.__pendingSaves?.length===1,count);
}
async function settleSave(page, outcome="resolve") {
 await page.evaluate(result=>{
   const next=window.__pendingSaves.shift();
   if (!next) throw Error("Missing held synthetic save");
   if (result==="reject") next.reject("Synthetic concurrent update blocked");
   else next.resolve();
 },outcome);
}
async function assertBlockedNavigation(page, otherEditor, otherTab, busyLabel) {
 const busy=page.getByRole("button",{name:busyLabel});
 await busy.waitFor();
 assert.equal(await busy.isDisabled(),true,"Save button must be disabled while pending");
 // Programmatic click models a same-tick duplicate activation: disabled
 // buttons and the synchronous save ref both prevent repeat requests.
 await busy.evaluate(element=>element.click());
 assert.equal(await page.evaluate(()=>window.__saveCalls.length),1,"No duplicate save while pending");
 const notice=page.getByRole("alertdialog",{name:"Checklist save in progress"});
 for (const action of [
   ()=>page.getByRole("button",{name:otherEditor}).click(),
   ()=>page.getByRole("tab",{name:otherTab}).click(),
   ()=>page.getByRole("button",{name:"Close",exact:true}).click(),
 ]) {
   await action();
   await notice.waitFor();
   assert.match(await notice.innerText(),/Finish saving your checklist before switching editors/);
   await notice.getByRole("button",{name:"OK"}).click();
   await notice.waitFor({state:"hidden"});
 }
 assert.equal(await page.evaluate(()=>window.__closeCount),0,"Cannot close during a save");
 assert.equal(await page.evaluate(()=>window.__saveCalls.length),1);
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
  ' if(window.__failNextTemplateReload){window.__failNextTemplateReload=false;throw Error("Synthetic reload network failure");}',
  ' const updated=window.__remoteTemplateSettings?.[settingKey] || settings[settingKey];',
  ' if(window.__pauseTemplateReload && settingKey==="subTemplateItems"){',
  '  window.__pauseTemplateReload=false;',
  '  return new Promise((resolve,reject)=>window.__pendingTemplateReads.push({',
  '   resolve(){resolve({id:settingKey,setting_key:settingKey,setting_value:updated});},',
  '   reject(){reject(Error("Synthetic delayed reload failed"));},',
  '  }));',
  ' }',
  ' return {id:settingKey,setting_key:settingKey,setting_value:updated};',
  '}',
  'export async function saveGlobalSettingValueIfUnchanged(){',
  ' window.__writeAttempts++;throw Error("Fixture forbids persistence");',
  '}',
 ].join("\n"));
 await writeFile(path.join(scratch,"mockPersistence.js"),[
  "// A controlled pending promise for the real Template Builder save handler.",
  "// No Base44 or other remote persistence is loaded.",
  "export function saveSettingMapEntryIfUnchanged({settingRecord,entryKey,nextEntry}){",
  " const savedDraft=JSON.parse(JSON.stringify(nextEntry));",
  " window.__saveCalls.push({entryKey,items:savedDraft.items});",
  " return new Promise((resolve,reject)=>window.__pendingSaves.push({",
  "  resolve(){window.__settledSaves.push({entryKey,items:savedDraft.items});resolve({",
  "   ...settingRecord,setting_value:{...settingRecord.setting_value,[entryKey]:savedDraft},",
  "  });},",
  "  reject(message){reject(Error(message));},",
  " }));",
  "}",
  'export function createChecklistSubItemIfAbsent(){throw Error("Unexpected fixture create");}',
  'export function deleteChecklistSubItemIfUnchanged(){throw Error("Unexpected fixture delete");}',
  'export function reorderChecklistSubItemsIfUnchanged(){throw Error("Unexpected fixture reorder");}',
  'export function updateChecklistSubItemIfUnchanged(){throw Error("Unexpected fixture update");}',
 ].join("\n"));
 await writeFile(path.join(scratch,"main.jsx"),[
  'import React from "react"; import {createRoot} from "react-dom/client";',
  'import TemplateBuilder from "/@fs'+path.join(root,"src/components/sips/TemplateBuilder.jsx")+'";',
  'window.__savedRows=[{id:"saved-1",text:"Completed installation",status:"Completed",approved_by:"Supervisor"}];',
  'window.__writeAttempts=0;window.__closeCount=0;window.__applyCount=0;',
  'window.__saveCalls=[];window.__pendingSaves=[];window.__settledSaves=[];',
  'window.__remoteTemplateSettings={};window.__failNextTemplateReload=false;',
  'window.__pauseTemplateReload=false;window.__pendingTemplateReads=[];',
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
   {find:"./templateBuilderPersistence",replacement:path.join(scratch,"mockPersistence.js")},
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
  await run(label+": pending option save blocks editor, tab, close and duplicate submits",
   origin,viewport,async page=>{
    await optionEditor(page,"Safety Review");
    await page.getByRole("textbox",{name:"New checklist option item"}).fill("Saved after hold");
    await page.getByRole("button",{name:"Add checklist item",exact:true}).click();
    await page.getByRole("button",{name:"Save checklist option"}).click();
    await pendingSave(page,1);
    await assertBlockedNavigation(page,"Edit checklist option Permit Review","Select & Apply","Saving checklist option");
    await page.getByRole("button",{name:"Edit checklist item Saved after hold"}).waitFor();
    await settleSave(page);
    await page.getByRole("button",{name:"Checklist option saved"}).waitFor();
    assert.equal(await page.evaluate(()=>window.__settledSaves.length),1);
    assert.equal(await page.evaluate(()=>window.__settledSaves[0].items.some(item=>item.text==="Saved after hold")),true);
    await page.getByRole("button",{name:"Edit checklist option Permit Review"}).click();
    await page.getByRole("button",{name:"Edit checklist item Check permit"}).waitFor();
    assert.equal(await navDialog(page).count(),0,"Clean post-save editor switch needs no discard");
   });
  await run(label+": edits during option save stay dirty after older save settles",
   origin,viewport,async page=>{
    await optionEditor(page,"Safety Review");
    await page.getByRole("textbox",{name:"New checklist option item"}).fill("First snapshot");
    await page.getByRole("button",{name:"Add checklist item",exact:true}).click();
    await page.getByRole("button",{name:"Save checklist option"}).click();
    await pendingSave(page,1);
    await page.getByRole("textbox",{name:"New checklist option item"}).fill("Newer unsaved edit");
    await page.getByRole("button",{name:"Add checklist item",exact:true}).click();
    await settleSave(page);
    await page.getByRole("button",{name:"Save checklist option"}).waitFor();
    const snapshots=await page.evaluate(()=>({sent:window.__saveCalls[0].items,
      saved:window.__settledSaves[0].items}));
    assert.deepEqual(snapshots.sent,snapshots.saved);
    assert.equal(snapshots.sent.some(item=>item.text==="Newer unsaved edit"),false,
      "Older save must not incorrectly include the newer draft");
    await page.getByRole("button",{name:"Edit checklist item Newer unsaved edit"}).waitFor();
    await page.getByRole("tab",{name:"Select & Apply"}).click();
    const dialog=navDialog(page);
    await dialog.waitFor();
    await canceled(dialog);
    await page.getByRole("button",{name:"Edit checklist item Newer unsaved edit"}).waitFor();
    await page.getByRole("button",{name:"Save checklist option"}).click();
    await pendingSave(page,2);
    await settleSave(page);
    await page.getByRole("button",{name:"Checklist option saved"}).waitFor();
    assert.equal(await page.evaluate(()=>window.__settledSaves[1].items.some(item=>item.text==="Newer unsaved edit")),true);
    assert.equal(await page.evaluate(()=>window.__saveCalls.length),2,"Only requested retries saved");
   });
  await run(label+": reload after conflicted option save requires explicit discard and refreshes current editor",
   origin,viewport,async page=>{
    await optionEditor(page,"Safety Review");
    await page.getByRole("textbox",{name:"New checklist option item"}).fill("Old local option draft");
    await page.getByRole("button",{name:"Add checklist item",exact:true}).click();
    await page.getByRole("button",{name:"Save checklist option"}).click();
    await pendingSave(page,1);
    await settleSave(page,"reject");
    await page.getByText("Synthetic concurrent update blocked").waitFor();
    await page.evaluate(()=>{window.__remoteTemplateSettings.subTemplateItems={
      safety:{items:[{id:"remote-safety",text:"Other user saved safety review"}]},
      permit:{items:[{id:"permit-1",text:"Check permit"}]}};});
    await page.getByRole("button",{name:"Reload latest"}).click();
    const prompt=page.getByRole("alertdialog",{name:"Discard edits and reload latest templates?"});
    await prompt.waitFor();
    assert.match(await prompt.innerText(),/will discard unsaved checklist edits/);
    await prompt.getByRole("button",{name:"Keep editing"}).click();
    await prompt.waitFor({state:"hidden"});
    await page.getByRole("button",{name:"Edit checklist item Old local option draft"}).waitFor();
    await page.getByRole("button",{name:"Save checklist option"}).waitFor();
    await page.getByRole("button",{name:"Reload latest"}).click();
    await prompt.getByRole("button",{name:"Discard edits & reload latest"}).click();
    await page.getByRole("button",{name:"Edit checklist item Other user saved safety review"}).waitFor();
    assert.equal(await page.getByRole("button",{name:"Edit checklist item Old local option draft"}).count(),0);
    assert.equal(await page.getByRole("button",{name:"Save checklist option"}).count(),0,
      "A fresh remote editor must not remain marked dirty or allow stale retry");
    assert.equal(await page.getByText("Synthetic concurrent update blocked").count(),0);
    assert.equal(await page.evaluate(()=>window.__saveCalls.length),1,
      "Reload is read-only and never writes the stale checklist");
   });
  await run(label+": failed confirmed reload keeps unfinished product draft and conflict visible",
   origin,viewport,async page=>{
    await productEditor(page,"Cabinet Sign");
    await page.getByRole("textbox",{name:"New product checklist item"}).fill("Protected on reload failure");
    await page.getByRole("button",{name:"Add product checklist item"}).click();
    await page.getByRole("button",{name:"Save product checklist"}).click();
    await pendingSave(page,1);
    await settleSave(page,"reject");
    await page.getByText("Synthetic concurrent update blocked").waitFor();
    await page.evaluate(()=>{window.__failNextTemplateReload=true;});
    await page.getByRole("button",{name:"Reload latest"}).click();
    const prompt=page.getByRole("alertdialog",{name:"Discard edits and reload latest templates?"});
    await prompt.getByRole("button",{name:"Discard edits & reload latest"}).click();
    await page.getByText("Synthetic reload network failure").waitFor();
    await page.getByRole("button",{name:"Edit checklist item Protected on reload failure"}).waitFor();
    await page.getByRole("button",{name:"Save product checklist"}).waitFor();
    assert.equal(await page.evaluate(()=>window.__saveCalls.length),1);
    await page.evaluate(()=>{window.__remoteTemplateSettings.productTypeTemplates={
      "Cabinet Sign":{items:[{id:"remote-cabinet",text:"Concurrent fresh cabinet setup"}]},
      Monument:{items:[{id:"base-2",text:"Build monument"}]}};});
    await page.getByRole("button",{name:"Reload latest"}).click();
    await prompt.getByRole("button",{name:"Discard edits & reload latest"}).click();
    await page.getByRole("button",{name:"Edit checklist item Concurrent fresh cabinet setup"}).waitFor();
    assert.equal(await page.getByRole("button",{name:"Edit checklist item Protected on reload failure"}).count(),0);
    assert.equal(await page.evaluate(()=>window.__saveCalls.length),1);
   });
  await run(label+": held reload traps keyboard, protects drafts and restores heading on success",
   origin,viewport,async page=>{
    await optionEditor(page,"Safety Review");
    const draft=page.getByRole("textbox",{name:"New checklist option item"});
    await draft.fill("Local draft must not be changed during reload");
    await page.getByRole("button",{name:"Add checklist item",exact:true}).click();
    await page.getByRole("button",{name:"Save checklist option"}).click();
    await pendingSave(page,1);
    await settleSave(page,"reject");
    await page.getByText("Synthetic concurrent update blocked").waitFor();
    await page.evaluate(()=>{
      window.__pauseTemplateReload=true;
      window.__remoteTemplateSettings.subTemplateItems={
        safety:{items:[{id:"remote-safety",text:"Fresh safety review after reload"}]},
        permit:{items:[{id:"permit-1",text:"Check permit"}]}
      };
    });
    await page.getByRole("button",{name:"Reload latest"}).click();
    await page.getByRole("alertdialog",{name:"Discard edits and reload latest templates?"})
      .getByRole("button",{name:"Discard edits & reload latest"}).click();
    const busy=page.getByRole("alertdialog",{name:"Reloading latest checklist templates…"});
    await busy.waitFor();
    await page.waitForFunction(()=>window.__pendingTemplateReads.length===1);
    assert.equal(await page.locator('[inert]').count()>0,true,"Editable Builder becomes inert");
    for (const key of ["Tab","Shift+Tab","Escape","Tab"]) {
      await page.keyboard.press(key);
      assert.equal(await page.evaluate(()=>
        document.activeElement?.closest('[role="alertdialog"]')?.textContent?.includes("Reloading latest checklist templates")),true,
        "Focus must stay in the reload modal for "+key);
      assert.equal(await busy.isVisible(),true,"Escape/Tab cannot dismiss a pending reload");
    }
    await page.keyboard.type("DO-NOT-EDIT");
    assert.equal(await page.locator('input[aria-label="New checklist option item"]').inputValue(),"",
      "The inert editor cannot receive typed text during reload");
    assert.equal(await page.evaluate(()=>window.__saveCalls.length),1,"Reload does not resubmit");
    assert.equal(await page.evaluate(()=>window.__closeCount),0,"No close during reload");
    await page.evaluate(()=>window.__pendingTemplateReads.shift().resolve());
    await busy.waitFor({state:"hidden"});
    await page.getByRole("button",{name:"Edit checklist item Fresh safety review after reload"}).waitFor();
    await page.waitForFunction(()=>document.activeElement?.textContent==="Checklist Builder");
    assert.equal(await page.locator('[inert]').count(),0,"Builder is editable after reload");
    assert.equal(await page.evaluate(()=>window.__saveCalls.length),1,"No additional save emitted");
   });
  await run(label+": failed held reload retains draft and restores focus to retry",
   origin,viewport,async page=>{
    await productEditor(page,"Cabinet Sign");
    await page.getByRole("textbox",{name:"New product checklist item"}).fill("Preserve draft after delayed failure");
    await page.getByRole("button",{name:"Add product checklist item"}).click();
    await page.getByRole("button",{name:"Save product checklist"}).click();
    await pendingSave(page,1);
    await settleSave(page,"reject");
    await page.getByText("Synthetic concurrent update blocked").waitFor();
    await page.evaluate(()=>{window.__pauseTemplateReload=true;});
    await page.getByRole("button",{name:"Reload latest"}).click();
    await page.getByRole("alertdialog",{name:"Discard edits and reload latest templates?"})
      .getByRole("button",{name:"Discard edits & reload latest"}).click();
    const busy=page.getByRole("alertdialog",{name:"Reloading latest checklist templates…"});
    await busy.waitFor();
    await page.waitForFunction(()=>window.__pendingTemplateReads.length===1);
    await page.keyboard.press("Escape");
    await page.keyboard.press("Tab");
    assert.equal(await busy.isVisible(),true,"Pending modal remains visible");
    assert.equal(await page.evaluate(()=>
      document.activeElement?.closest('[role="alertdialog"]')?.textContent?.includes("Reloading latest checklist templates")),true);
    await page.evaluate(()=>window.__pendingTemplateReads.shift().reject());
    await busy.waitFor({state:"hidden"});
    await page.getByText("Synthetic delayed reload failed").waitFor();
    await page.getByRole("button",{name:"Edit checklist item Preserve draft after delayed failure"}).waitFor();
    await page.getByRole("button",{name:"Save product checklist"}).waitFor();
    await page.waitForFunction(()=>document.activeElement?.textContent==="Reload latest");
    assert.equal(await page.locator('[inert]').count(),0);
    assert.equal(await page.evaluate(()=>window.__saveCalls.length),1);
   });
  await run(label+": failed product save releases lock and safely allows retry",
   origin,viewport,async page=>{
    await productEditor(page,"Cabinet Sign");
    await page.getByRole("textbox",{name:"New product checklist item"}).fill("Pending cabinet proof");
    await page.getByRole("button",{name:"Add product checklist item"}).click();
    await page.getByRole("button",{name:"Save product checklist"}).click();
    await pendingSave(page,1);
    await assertBlockedNavigation(page,"Edit product checklist Monument","Select & Apply","Saving product checklist");
    await settleSave(page,"reject");
    await page.getByText("Synthetic concurrent update blocked").waitFor();
    await page.getByRole("button",{name:"Save product checklist"}).waitFor();
    await page.getByRole("button",{name:"Edit checklist item Pending cabinet proof"}).waitFor();
    await page.getByRole("button",{name:"Save product checklist"}).click();
    await pendingSave(page,2);
    await settleSave(page);
    await page.getByRole("button",{name:"Product checklist saved"}).waitFor();
    assert.equal(await page.evaluate(()=>window.__settledSaves.length),1);
    assert.equal(await page.evaluate(()=>window.__settledSaves[0].items.some(item=>item.text==="Pending cabinet proof")),true);
   });
 }
 console.log("PASS "+passed+" isolated Chromium SIPS Template Builder unsaved-navigation scenarios (synthetic save only)");
} finally {
 await browser?.close();
 await vite?.close();
 await rm(scratch,{recursive:true,force:true});
}

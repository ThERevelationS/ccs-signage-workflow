import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import {
  NEW_WORKORDER_PROTECTED_SYNC_FIELDS,
  stripInheritedWorkOrderSyncIdentity,
} from "../src/components/workflow/workOrderCreationIdentity.mjs";

let checks = 0;
const yes = (condition, message) => { assert.ok(condition, message); checks++; };
const equal = (actual, expected, message) => {
  assert.deepEqual(JSON.parse(JSON.stringify(actual)), expected, message);
  checks++;
};
const persistence = readFileSync("src/components/workflow/workOrderPersistence.js", "utf8");
const form = readFileSync("src/components/workflow/WorkOrderForm.jsx", "utf8");
const ctx = {
  base44: {entities: {WorkOrder: {}}},
  saveTrackedFields(){throw Error("Unrelated tracked-field save");},
  stripInheritedWorkOrderSyncIdentity,
};
runInNewContext(
  persistence.replace(/^import .*;\s*$/gm, "").replace(/^export /gm, "") +
    "\nglobalThis.api = {updateWorkOrderFromLoadedSnapshot, sanitizeWorkOrderFormPatch};",
  ctx, {timeout:3000},
);
const {updateWorkOrderFromLoadedSnapshot, sanitizeWorkOrderFormPatch} = ctx.api;
yes(persistence.includes("stripInheritedWorkOrderSyncIdentity(sanitizeWorkOrderFormPatch(formData))"),
  "WorkOrder edit uses protected sync-field stripping at its actual write boundary.");
yes(form.includes("...workOrder") && form.includes("onSave?.(submitData)"),
  "Full WorkOrder edit draft receives the loaded record and forwards a complete form.");
yes(Object.hasOwn(sanitizeWorkOrderFormPatch({smartsheet_row_id:"123"}),"smartsheet_row_id"),
  "Generic form sanitizer is unchanged; edit-specific boundary removes protected values.");

const protectedNow = {
  smartsheet_sheet_id:"8702703019812740",
  smartsheet_row_id:"999333",
  smartsheet_parent_row_id:"112233",
  smartsheet_last_synced_at:"2026-10-13T14:00:00Z",
  smartsheet_sync_snapshot:{title:"Current remote value"},
  smartsheet_create_attempt:{state:"already_verified",row_id:"999333"},
  sales_import_source_id:"authoritative-key",
  sales_import_last_synced_at:"2026-10-13T14:00:00Z",
  sales_import_snapshot:{description:"Authoritative"},
};
const protectedStale = {
  smartsheet_sheet_id:"old-sheet",
  smartsheet_row_id:"old-row",
  smartsheet_parent_row_id:"old-parent",
  smartsheet_last_synced_at:"2026-09-01T11:00:00Z",
  smartsheet_sync_snapshot:{title:"Old stale remote value"},
  smartsheet_create_attempt:{state:"uncertain",row_id:"old-row"},
  sales_import_source_id:"old-key",
  sales_import_last_synced_at:"2026-09-01T11:00:00Z",
  sales_import_snapshot:{description:"Stale"},
};
const current = {
  id:"test-workorder",updated_date:"version-2",deleted:false,
  title:"Original title",description:"Original job",client_name:"Cincinnati Client",
  notes:[{text:"Existing note"}],
  ...protectedNow,
};
const baseLine = structuredClone(current);
const formDraft = {...structuredClone(current),...protectedStale,title:"Edited title",
  description:"Updated signage job",notes:[{text:"Existing note"},{text:"New job note"}]};
let stored = structuredClone(current);
let lastQuery = null;
let lastPatch = null;
let mode = "normal";
let updates = 0;
const entity = {
  async updateMany(query, mutation) {
    updates++;
    lastQuery = query;
    lastPatch = structuredClone(mutation.$set);
    if (stored.id !== query.id || stored.updated_date !== query.updated_date ||
        stored.deleted === true) return {updated:0};
    stored = {...stored,...lastPatch,updated_date:"version-after-save"};
    if (mode === "ack-lost") throw Error("ACK lost after successful update");
    return {updated:1};
  },
  async get(id) {return stored.id === id ? structuredClone(stored) : null;},
};
ctx.base44.entities.WorkOrder = entity;
const saved = await updateWorkOrderFromLoadedSnapshot({
  workOrder:baseLine,formData:formDraft,label:"Synthetic edit",
});
equal(lastQuery,{id:"test-workorder",updated_date:"version-2",deleted:{$ne:true}},
  "Edit retains exact WorkOrder version and trash-safe conditional update.");
yes(updates===1,"A complete form edit performs one conditional write.");
for (const field of NEW_WORKORDER_PROTECTED_SYNC_FIELDS) {
  yes(!Object.hasOwn(lastPatch,field),"Edit mutation excludes sync-owned field "+field);
  equal(saved[field],protectedNow[field],"Edit preserves latest authoritative "+field);
}
yes(saved.title==="Edited title" && saved.description==="Updated signage job" &&
  saved.notes.length===2 && saved.client_name==="Cincinnati Client",
  "Ordinary form business fields and notes continue saving normally.");
equal(baseLine,current,"Loaded WorkOrder is not modified by the edit.");
equal(formDraft.smartsheet_create_attempt,protectedStale.smartsheet_create_attempt,
  "Original form draft is not mutated by the safeguard.");

stored = {...structuredClone(current),updated_date:"version-3"};
updates = 0;
await assert.rejects(
  updateWorkOrderFromLoadedSnapshot({
    workOrder:baseLine,formData:{...formDraft,title:"A different edit"},label:"Stale edit"
  }),
  /changed in another session/,
  "Stale form version still blocks conflicting business field edits.");
checks++;
yes(updates===1 && stored.title==="Original title" && stored.smartsheet_row_id==="999333",
  "Version conflict does not overwrite job fields or Smartsheet ownership.");

stored = {...structuredClone(current)};
mode = "ack-lost";
updates = 0;
const recovered = await updateWorkOrderFromLoadedSnapshot({
  workOrder:baseLine,formData:{...formDraft,title:"Recovered job edit"},
  label:"ACK-lost edit"
});
yes(recovered.title==="Recovered job edit" && updates===1,
  "Lost acknowledgment still recovers an already committed edit without retrying a write.");
for (const field of NEW_WORKORDER_PROTECTED_SYNC_FIELDS) {
  equal(recovered[field],protectedNow[field],
    "Recovered edit retains the latest sync-owned "+field);
}

stored = {...structuredClone(current)};
mode = "normal";
const injected = await updateWorkOrderFromLoadedSnapshot({
  workOrder:baseLine,
  formData:{title:"No inherited Smartsheet identity",smartsheet_row_id:"new-claim",
    smartsheet_sheet_id:"new-sheet",sales_import_source_id:"fake-import"},
  label:"No injection edit"
});
yes(injected.smartsheet_row_id===protectedNow.smartsheet_row_id &&
  injected.smartsheet_sheet_id===protectedNow.smartsheet_sheet_id &&
  injected.sales_import_source_id===protectedNow.sales_import_source_id,
  "Even explicitly supplied sync identities cannot be changed via normal edit form.");
const pages = ["Estimating","Design","Fabrication","Production","InstallationDeliver"];
for (const page of pages) {
  const source = readFileSync("src/pages/"+page+".jsx","utf8");
  yes(source.includes("updateWorkOrderFromLoadedSnapshot("),
    page+" ordinary WorkOrder editing uses the same protected save boundary.");
}
console.log("Sales Phase 5Y existing WorkOrder edit sync-identity safety: "+checks+"/"+checks+" PASS.");

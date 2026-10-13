import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import {
  NEW_WORKORDER_PROTECTED_SYNC_FIELDS,
  stripInheritedWorkOrderSyncIdentity,
} from "../src/components/workflow/workOrderCreationIdentity.mjs";

let checks = 0;
const yes = (value, label) => { assert.ok(value, label); checks++; };
const eq = (a, b, label) => { assert.deepEqual(JSON.parse(JSON.stringify(a)), b, label); checks++; };

const sourceRecord = {
  id: "original-workorder",
  created_date: "2026-09-01T00:00:00Z",
  updated_date: "2026-10-01T00:00:00Z",
  created_by: "original@example.com",
  title: "Duplicate Example",
  client_name: "Real Customer",
  customer_id: "customer-123",
  description: "Separate sign project",
  current_stage: "sales",
  in_pipeline: true,
  estimate_amount: 1234.56,
  notes: [{text: "Keep work context"}],
  smartsheet_sheet_id: "8702703019812740",
  smartsheet_row_id: "99887766",
  smartsheet_parent_row_id: "77553311",
  smartsheet_last_synced_at: "2026-10-01T10:00:00Z",
  smartsheet_sync_snapshot: {"123": "Original"},
  smartsheet_create_attempt: {status: "linked", row_id: "99887766"},
  sales_import_source_id: "original-import-key",
  sales_import_last_synced_at: "2026-10-01T10:00:00Z",
  sales_import_snapshot: {title: "Original"},
};
const before = structuredClone(sourceRecord);
const draft = stripInheritedWorkOrderSyncIdentity(sourceRecord);
for (const field of NEW_WORKORDER_PROTECTED_SYNC_FIELDS) {
  yes(!Object.hasOwn(draft,field), "New WorkOrder cannot inherit " + field);
}
yes(draft.customer_id === "customer-123" && draft.client_name === "Real Customer",
  "Customer link and business name are preserved.");
yes(draft.estimate_amount === 1234.56 && draft.description === "Separate sign project",
  "Quote and job fields are retained rather than being rebuilt.");
eq(sourceRecord,before,"Sanitizer never mutates the original live WorkOrder.");
eq(stripInheritedWorkOrderSyncIdentity(draft),draft,"Sanitizer is repeatable for a new WorkOrder.");
eq(stripInheritedWorkOrderSyncIdentity(null),{},"Null input safely becomes an empty new-record payload.");

const persistenceSource = readFileSync("src/components/workflow/workOrderPersistence.js","utf8");
const code = persistenceSource.replace(/^import .*;\s*$/gm,"").replace(/^export /gm,"") +
  "\nglobalThis.testExports = {createWorkOrderWithRecovery, sanitizeWorkOrderFormPatch};";
const mock = {base44:{entities:{WorkOrder:{}}},saveTrackedFields(){throw Error("Unexpected save");},
  stripInheritedWorkOrderSyncIdentity};
runInNewContext(code,mock,{timeout:3000});
const {createWorkOrderWithRecovery,sanitizeWorkOrderFormPatch} = mock.testExports;
yes(persistenceSource.includes("stripInheritedWorkOrderSyncIdentity(sanitizeWorkOrderFormPatch(data || {}))"),
  "Production create helper strips protected identities before any create or match lookup.");
yes(Object.hasOwn(sanitizeWorkOrderFormPatch(sourceRecord),"smartsheet_row_id"),
  "Existing edit-form patch behavior remains independent of new-record sanitizer.");

let records = [], creations = 0, lastCreate = null;
const entity = {
  async filter(query) {return records.filter(row => row.title === query.title);},
  async create(payload) {
    creations++;
    lastCreate = structuredClone(payload);
    const record = {id:"fresh-"+creations,...payload};
    records.push(record);
    return record;
  },
  async get(id) {return records.find(row => row.id === id) || null;},
};
const result = await createWorkOrderWithRecovery({entity,data:sourceRecord,label:"Duplicated Work Order"});
yes(result.status === "created" && result.record.id === "fresh-1",
  "Actual new-record create flow commits a separate WorkOrder.");
yes(creations === 1,"Successful create issues exactly one API write.");
for (const field of NEW_WORKORDER_PROTECTED_SYNC_FIELDS) {
  yes(!Object.hasOwn(lastCreate,field),"Actual create payload lacks " + field);
}
yes(!Object.hasOwn(lastCreate,"id") && !Object.hasOwn(lastCreate,"updated_date"),
  "Original system identity is also excluded.");
yes(lastCreate.customer_id === sourceRecord.customer_id &&
  lastCreate.title === sourceRecord.title && lastCreate.notes[0].text === sourceRecord.notes[0].text,
  "Duplicate preserves ordinary project, customer, and note data.");

records=[]; creations=0;
const uncertainEntity = {
  async filter(query) {return records.filter(row => row.title === query.title);},
  async create(payload) {
    creations++;
    records.push({id:"created-ack-lost",...payload});
    throw new Error("Network ACK lost after create");
  },
};
const recovered = await createWorkOrderWithRecovery({
  entity:uncertainEntity,data:sourceRecord,label:"Duplicated Work Order",
});
yes(recovered.status === "recovered" && recovered.record.id === "created-ack-lost" && creations === 1,
  "Lost create acknowledgment recovers by read-back, without reissuing a create.");
for (const field of NEW_WORKORDER_PROTECTED_SYNC_FIELDS) {
  yes(!Object.hasOwn(recovered.record,field),"Uncertain-create recovery also omits " + field);
}

const form = readFileSync("src/components/workflow/WorkOrderForm.jsx","utf8");
const sales = readFileSync("src/components/sales/SalesPipelineSpreadsheet.jsx","utf8");
const details = readFileSync("src/components/workflow/WorkOrderDetailsDialog.jsx","utf8");
yes(form.includes("...dataWithoutId") && form.includes("onSave?.(submitData)"),
  "Real duplicate form currently carries original fields to its onSave call.");
yes(sales.includes("setDuplicateData({ ...wo })") &&
  sales.includes("createWorkOrderWithRecovery({"),
  "Sales Duplicate Client workflow is protected at the actual create boundary.");
yes(details.includes('label: "Duplicated Work Order"'),
  "Full WorkOrder Details duplicate route uses the same guarded helper.");

console.log("Sales Phase 5X new WorkOrder identity protection: "+checks+"/"+checks+" PASS.");

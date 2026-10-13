import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../base44/functions/fleetMechanicPortal/entry.ts", import.meta.url), "utf8");
const committedGuardSource = await readFile(new URL("../base44/shared/fleetMechanicCommittedResponse.ts", import.meta.url), "utf8");
const handlerStart = source.indexOf("Deno.serve(async (req) => {");
assert.ok(handlerStart >= 0, "fleetMechanicPortal request handler must be present");

const between = (startText, endText, from = handlerStart) => {
  const start = source.indexOf(startText, from);
  assert.ok(start >= 0, `missing source boundary: ${startText}`);
  const end = source.indexOf(endText, start + startText.length);
  assert.ok(end > start, `missing source boundary: ${endText}`);
  return source.slice(start, end);
};

test("mutation status revalidates the live Start/Save grant before receipt reads", () => {
  const currentLoad = source.indexOf("const current = await WorkOrder.get(id)", handlerStart);
  const receiptBoundary = source.indexOf("const Receipt = base44.asServiceRole.entities.FleetOperationReceipt;", currentLoad);
  assert.ok(currentLoad >= 0 && receiptBoundary > currentLoad);
  const preReceipt = source.slice(currentLoad, receiptBoundary);
  assert.match(preReceipt, /if \(action === 'mutation_status'\)[\s\S]*requireCurrentMechanicGrant\(Access,String\(grant\.id \|\| ''\),statusMutationAction,String\(current\.equipment_id \|\| ''\)\)/);
});

test("mutation status denies removed Start or Save permission before reading receipts", () => {
  const grantValidation = source.indexOf("const grant = await validateGrant(Access,body?.token);",handlerStart);
  const receiptRead = source.indexOf("const Receipt = base44.asServiceRole.entities.FleetOperationReceipt;",grantValidation);
  assert.ok(grantValidation >= 0 && receiptRead > grantValidation);
  const beforeReceipt = source.slice(grantValidation,receiptRead);
  assert.match(beforeReceipt,/if \(action === 'mutation_status'\)[\s\S]*!allowed\.has\(statusMutationAction\)[\s\S]*status:403/);
  assert.match(beforeReceipt,/else if \(!allowed\.has\(action\)\)/);
  assert.ok(beforeReceipt.indexOf("!allowed.has(statusMutationAction)") < beforeReceipt.indexOf("const WorkOrder ="),"revoked action must fail before Fleet record access");
});

test("every mutation-status work-order payload rereads the latest Fleet row and rechecks its scope", () => {
  const currentLoad = source.indexOf("const current = await WorkOrder.get(id)",handlerStart);
  const receiptBoundary = source.indexOf("const Receipt = base44.asServiceRole.entities.FleetOperationReceipt;",currentLoad);
  const block = between("if (action === 'mutation_status') {", "\n\n    let mechanicMutation",receiptBoundary);
  assert.equal(block.includes("work_order:sanitizeWorkOrder("), false, "mutation_status must not directly emit work-order state");
  assert.match(block, /const statusWorkOrderResponse = async[\s\S]*const latest = await WorkOrder\.get\(id\)\.catch\(\(\)=>null\);/, "status responses must use a final Fleet work-order read");
  assert.match(block, /return mechanicWorkOrderResponse\(Access,String\(grant\.id \|\| ''\),statusMutationAction,latest,payload,init\);/, "the final live grant check must use the freshly read equipment scope");
  assert.ok((block.match(/await statusWorkOrderResponse\(/g) || []).length >= 10, "all status outcomes with work-order data must await the latest-row scoped response");
  assert.match(block, /if \(isMechanicAccessChangedError\(error\)\) throw error;/, "live authorization failures must escape recovery handling");
  assert.equal(/await mechanicWorkOrderResponse\(/.test(block), false, "status outcomes must not bypass the latest-row wrapper");
});

test("idempotent Start/Save retry and recovery reads revalidate before returning work-order state", () => {
  const retryBlock = between("if (MECHANIC_MUTATION_TYPES[action]) {", "\n\n    if (!ACTIVE.has(current.status))");
  assert.match(retryBlock, /await mechanicWorkOrderResponse\(Access,String\(grant\.id \|\| ''\),action,current,/);
  assert.match(retryBlock, /await mechanicWorkOrderResponse\(Access,String\(grant\.id \|\| ''\),receiptAction,updated,/);
  assert.match(retryBlock, /if \(isMechanicAccessChangedError\(error\)\) throw error;/);

  const startBlock = between("if (action === 'start') {", "\n\n    if (action === 'save') {");
  assert.match(startBlock, /await mechanicWorkOrderResponse\(Access,String\(grant\.id \|\| ''\),'start',fresh,/);
  assert.match(startBlock, /await mechanicWorkOrderResponse\(Access,String\(grant\.id \|\| ''\),'start',fresh \|\| current,/);

  const saveBlock = between("if (action === 'save') {", "\n\n    return json\(\{error:'Unsupported mechanic portal action\.'\}");
  assert.match(saveBlock, /await mechanicWorkOrderResponse\(Access,String\(grant\.id \|\| ''\),'save',fresh,/);
  assert.match(saveBlock, /await mechanicWorkOrderResponse\(Access,String\(grant\.id \|\| ''\),'save',fresh \|\| current,/);
});

test("primary Start/Save success acknowledgements revalidate after durable receipt application", () => {
  const startBlock = between("if (action === 'start') {", "\n\n    if (action === 'save') {");
  const saveBlock = between("if (action === 'save') {", "\n\n    return json\(\{error:'Unsupported mechanic portal action\.'\}");
  assert.match(startBlock, /markMechanicReceiptApplied\(Receipt,receipt,updated,false\);[\s\S]*await mechanicCommittedWorkOrderResponse\(Access,String\(grant\.id \|\| ''\),'start',updated,/);
  assert.match(saveBlock, /markMechanicReceiptApplied\(Receipt,receipt,updated,false\);[\s\S]*resolveReusedUploadReceipt\(Receipt,receipt\);[\s\S]*await mechanicCommittedWorkOrderResponse\(Access,String\(grant\.id \|\| ''\),'save',updated,/);
  assert.match(startBlock, /catch \(error\) \{\n        if \(isMechanicAccessChangedError\(error\)\) throw error;/);
  assert.match(saveBlock, /catch \(error\) \{\n        if \(isMechanicAccessChangedError\(error\)\) throw error;/);
});

test("repair-estimate Save/Submit revalidate after commit before returning financial details", () => {
  const estimateBlock = between("if (action === 'estimate_save' || action === 'estimate_submit') {", "\n\n    if (action === 'start') {");
  assert.match(estimateBlock, /await mechanicCommittedEstimateResponse\(Access,String\(grant\.id \|\| ''\),'estimate_save',String\(current\.equipment_id \|\| ''\),estimate,/);
  assert.match(estimateBlock, /updateFleetRecordIfCurrent\([\s\S]*await Log\.create\([\s\S]*await mechanicCommittedEstimateResponse\(Access,String\(grant\.id \|\| ''\),'estimate_submit',String\(current\.equipment_id \|\| ''\),updated,/);
  assert.equal(/return json\(\{success:true,estimate:sanitizeEstimate/.test(estimateBlock), false, "committed estimates must not bypass the final grant check");
});

test("post-commit authorization failures warn against blind replay", () => {
  const helperStart = committedGuardSource.indexOf("function mechanicCommittedResponseAccessChangedError()");
  const helperEnd = committedGuardSource.indexOf("\n\nexport async function requireCurrentMechanicGrantForCommittedResponse", helperStart);
  assert.ok(helperStart >= 0 && helperEnd > helperStart);
  const helper = committedGuardSource.slice(helperStart, helperEnd);
  assert.match(helper, /may have been committed/);
  assert.match(helper, /Check current server state with CCS before retrying/);
  assert.match(helper, /FLEET_MECHANIC_ACCESS_REVOKED/);
});

test("bootstrap publishes live Start/Save/estimate capabilities from the current grant", () => {
  const payloadStart = source.indexOf("async function portalPayload(");
  const payloadEnd = source.indexOf("\n\nfunction decodePhotos", payloadStart);
  assert.ok(payloadStart >= 0 && payloadEnd > payloadStart);
  const block = source.slice(payloadStart,payloadEnd);
  assert.match(block, /currentActions = new Set\(Array\.isArray\(currentGrant\?\.allowed_actions\)[\s\S]*\['bootstrap','start','save'\]\)/);
  assert.match(block, /const canStart = currentActions\.has\('start'\);/);
  assert.match(block, /const canSave = currentActions\.has\('save'\);/);
  assert.match(block, /const canEstimate = currentActions\.has\('estimate_submit'\);/);
  assert.match(block, /capabilities:\{start:canStart,save:canSave,estimates:canEstimate\}/);
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../base44/functions/fleetMechanicPortal/entry.ts", import.meta.url), "utf8");

const between = (startText, endText, from = 0) => {
  const start = source.indexOf(startText, from);
  assert.ok(start >= 0, `missing source boundary: ${startText}`);
  const end = source.indexOf(endText, start + startText.length);
  assert.ok(end > start, `missing source boundary: ${endText}`);
  return source.slice(start, end);
};

test("mutation status revalidates the live Start/Save grant before receipt reads", () => {
  const currentLoad = source.indexOf("const current = await WorkOrder.get(id)");
  const receiptBoundary = source.indexOf("const Receipt = base44.asServiceRole.entities.FleetOperationReceipt;", currentLoad);
  assert.ok(currentLoad >= 0 && receiptBoundary > currentLoad);
  const preReceipt = source.slice(currentLoad, receiptBoundary);
  assert.match(preReceipt, /if \(action === 'mutation_status'\)[\s\S]*requireCurrentMechanicGrant\(Access,String\(grant\.id \|\| ''\),statusMutationAction,String\(current\.equipment_id \|\| ''\)\)/);
});

test("every mutation-status work-order payload is protected by a final live grant recheck", () => {
  const block = between("if (action === 'mutation_status') {\n      const requestId", "\n\n    let mechanicMutation");
  assert.equal(block.includes("work_order:sanitizeWorkOrder("), false, "mutation_status must not directly emit work-order state");
  assert.ok((block.match(/await mechanicWorkOrderResponse\(/g) || []).length >= 8, "all status outcomes with work-order data must use the guarded response helper");
  assert.match(block, /if \(isMechanicAccessChangedError\(error\)\) throw error;/, "live authorization failures must escape recovery handling");
  assert.equal(/return mechanicWorkOrderResponse\(/.test(block), false, "guarded responses must be awaited so the outer handler can return 403");
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

test("primary Start/Save mutation acknowledgements remain on their existing path", () => {
  const startBlock = between("if (action === 'start') {", "\n\n    if (action === 'save') {");
  const saveBlock = between("if (action === 'save') {", "\n\n    return json\(\{error:'Unsupported mechanic portal action\.'\}");
  assert.match(startBlock, /return json\(\{success:true,request_id:mechanicMutation\.requestId,work_order:sanitizeWorkOrder\(updated\)\}\);/);
  assert.match(saveBlock, /return json\(\{success:true,request_id:mechanicMutation\.requestId,work_order:sanitizeWorkOrder\(updated\)\}\);/);
});

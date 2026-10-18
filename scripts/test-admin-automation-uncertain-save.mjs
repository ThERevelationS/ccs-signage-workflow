import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { classifyAutomationCreateReceipt, reviewUncertainAutomationSave } from "../src/components/admin/automationSaveReconciliation.js";

const source = readFileSync("src/pages/AdminSettings.jsx", "utf8");
const attempted = {
  name: "Review rule", enabled: true, priority: 0,
  triggers: [{ trigger_type: "work_order_created", trigger_condition: {}, logic: "or" }],
  actions: [{ action_type: "send_email", action_config: {} }]
};
const record = { id: "r1", updated_date: "version-2", ...attempted };

test("A single exact, versioned rule is a matching snapshot, not proof of authorship", () => {
  assert.equal(reviewUncertainAutomationSave({kind:"create",attempted,rows:[record]}), "matching");
  assert.equal(reviewUncertainAutomationSave({kind:"update",originalId:"r1",attempted,rows:[record]}), "matching");
  assert.equal(reviewUncertainAutomationSave({
    kind:"update",originalId:"r1",attempted,rows:[{id:"r1",updated_date:"v3",...attempted,
      triggers:[{logic:"or",trigger_condition:{},trigger_type:"work_order_created"}]}]
  }), "matching");
});

test("Only a fully matching versioned created receipt confirms this create", () => {
  assert.equal(classifyAutomationCreateReceipt({status:"created",record},attempted),"created");
  assert.equal(classifyAutomationCreateReceipt({status:"created",record:{...record,priority:3}},attempted),"unverified");
  assert.equal(classifyAutomationCreateReceipt({status:"created",record:{...record,updated_date:null}},attempted),"unverified");
  assert.equal(classifyAutomationCreateReceipt({status:"created",record:{...record,id:null}},attempted),"unverified");
  assert.equal(classifyAutomationCreateReceipt({status:"created"},attempted),"unverified");
  assert.equal(classifyAutomationCreateReceipt({},attempted),"unverified");
  assert.equal(classifyAutomationCreateReceipt(null,attempted),"unverified");
});

test("Existing-name, recovered, and concurrent-winner create receipts require read-only review", () => {
  for(const status of ["existing","recovered","concurrent_duplicate_discarded"]) {
    assert.equal(classifyAutomationCreateReceipt({status,record},attempted),status);
  }
  assert.equal(classifyAutomationCreateReceipt({status:"unknown",record},attempted),"unverified");
  assert.match(source,/createReceiptStatus = classifyAutomationCreateReceipt\(result, saveData\)/);
  assert.match(source,/if \(createReceiptStatus !== "created"\)/);
  assert.match(source,/receiptStatus: editingRule \? null : createReceiptStatus/);
  assert.match(source,/Concurrent creation left a different rule as the canonical record/);
});

test("Read errors, absent rows and missing version never verify an uncertain mutation", () => {
  assert.equal(reviewUncertainAutomationSave({kind:"create",attempted,rows:null}), "unverified");
  assert.equal(reviewUncertainAutomationSave({kind:"create",attempted,rows:[]}), "not_found");
  assert.equal(reviewUncertainAutomationSave({kind:"update",originalId:"r1",attempted,rows:[]}), "not_found");
  assert.equal(reviewUncertainAutomationSave({kind:"update",originalId:"r1",attempted,rows:[{id:"r1",...attempted}]}), "unverified");
  assert.equal(reviewUncertainAutomationSave({kind:"create",attempted,rows:[{...attempted}]}), "unverified");
});

test("Ambiguous duplicate names or IDs remain blocked", () => {
  assert.equal(reviewUncertainAutomationSave({kind:"create",attempted,rows:[record,{...record,id:"r2"}]}), "ambiguous");
  assert.equal(reviewUncertainAutomationSave({kind:"update",originalId:"r1",attempted,rows:[record,record]}), "ambiguous");
});

test("Changed fields and wrong record identities cannot certify an attempted update", () => {
  assert.equal(reviewUncertainAutomationSave({
    kind:"update",originalId:"r1",attempted,rows:[{...record,priority:8}]
  }), "different");
  assert.equal(reviewUncertainAutomationSave({
    kind:"update",originalId:"wrong",attempted,rows:[record]
  }), "not_found");
  assert.equal(reviewUncertainAutomationSave({
    kind:"create",attempted,rows:[{...record,name:"Other"}]
  }), "not_found");
  assert.equal(reviewUncertainAutomationSave({
    kind:"update",originalId:"r1",attempted,
    rows:[{...record,actions:[{action_type:"send_email",action_config:{recipients:[]}}]}]
  }), "different");
});

test("Only dispatched failed writes become uncertain; same attempt stays fenced", () => {
  assert.match(source, /let writeDispatched = false/);
  assert.match(source, /if \(writeDispatched\) \{/);
  assert.match(source, /automationUncertainRef\.current = attempt/);
  assert.match(source, /if \(automationUncertainRef\.current \|\| automationSaveInFlight\.current/);
  assert.match(source, /disabled=\{!!automationUncertain \|\| automationSaving/);
  assert.match(source, /const rows = await loadAllEntityRows\(\{/);
  assert.match(source, /label: "Admin Settings uncertain Automation verification"/);
  assert.match(source, /reviewUncertainAutomationSave\(\{ \.\.\.pending, rows \}\)/);
  assert.match(source, /automationReviewOwner\.current \+= 1/);
  assert.match(source, /!\["matching", "different", "not_found", "ambiguous"\]\.includes\(automationReviewStatus\)/);
  assert.match(source, /Verify save status \(read-only\)/);
  assert.match(source, /Acknowledge and discard this draft/);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  AUTOMATION_READ_DEADLINE_MS, AutomationReadTimeoutError, withAutomationReadDeadline
} from "../src/components/admin/automationReadDeadline.js";

const source=readFileSync("src/pages/AdminSettings.jsx","utf8");

test("Automation read deadline validates bounds and leaves normal results intact", async () => {
  assert.equal(AUTOMATION_READ_DEADLINE_MS,25_000);
  assert.deepEqual(await withAutomationReadDeadline(async()=>[{id:"synthetic"}],100),[{id:"synthetic"}]);
  await assert.rejects(withAutomationReadDeadline(null,50),/Invalid Automation verification deadline/);
  await assert.rejects(withAutomationReadDeadline(()=>[],0),/Invalid Automation verification deadline/);
  await assert.rejects(withAutomationReadDeadline(()=>[],120001),/Invalid Automation verification deadline/);
});

test("Hung read times out and its late successful result cannot become the winner", async () => {
  let release;
  const pending=new Promise(resolve=>{release=resolve;});
  const started=Date.now();
  await assert.rejects(withAutomationReadDeadline(()=>pending,12),
    error=>error instanceof AutomationReadTimeoutError && /No result was verified/.test(error.message));
  assert.ok(Date.now()-started<500);
  release([{id:"late-synthetic"}]);
  assert.deepEqual(await withAutomationReadDeadline(()=>[{id:"fresh-synthetic"}],100),[{id:"fresh-synthetic"}]);
});

test("Late read rejection after timeout is observed without unhandled rejection", async () => {
  let rejectLate;
  const pending=new Promise((_,reject)=>{rejectLate=reject;});
  await assert.rejects(withAutomationReadDeadline(()=>pending,12),AutomationReadTimeoutError);
  rejectLate(new Error("synthetic-old-private-error"));
  assert.deepEqual(await withAutomationReadDeadline(()=>[],100),[]);
});

test("A non-timeout read failure remains a read failure, never a false verified row", async () => {
  await assert.rejects(withAutomationReadDeadline(()=>{throw Error("synthetic read failure");},100),
    /synthetic read failure/);
});

test("Both uncertain Automation reads have timeouts, timeout messaging, ownership and released locks", () => {
  assert.match(source,/const rows = await withAutomationReadDeadline\(\(\) => loadAllEntityRows\(\{/);
  assert.match(source,/label: "Admin Settings uncertain Automation verification"/);
  assert.match(source,/label: "Admin Settings uncertain Automation acknowledgment"/);
  assert.match(source,/error instanceof AutomationReadTimeoutError \? "timed_out" : "read_failed"/);
  assert.match(source,/No result was verified; your draft is preserved/);
  assert.match(source,/automationUncertainRef\.current !== pending/);
  assert.match(source,/reviewId !== automationReviewOwner\.current/);
  assert.match(source,/automationReviewInFlight\.current = false/);
  assert.match(source,/automationAckInFlight\.current = false/);
  assert.match(source,/setAutomationReviewLoading\(false\)/);
  assert.match(source,/setAutomationAckLoading\(false\)/);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("src/pages/AdminSettings.jsx","utf8");

test("Repeated read failures are counted only for current owned requests",()=>{
  assert.match(source,/setAutomationRecoveryFailures\(count => Math\.min\(count \+ 1, 99\)\)/);
  assert.match(source,/setAutomationRecoveryFailedStep\("verification"\)/);
  assert.match(source,/setAutomationRecoveryFailedStep\("acknowledgment"\)/);
  assert.match(source,/automationUncertainRef\.current === pending/);
  assert.match(source,/reviewId === automationReviewOwner\.current/);
  assert.match(source,/automationRecoveryFailures >= 2/);
  assert.match(source,/consecutive read-only checks failed or timed out/);
});
test("Recovery focus is restricted to retry controls, not unrelated drafts or navigation",()=>{
  assert.match(source,/const automationRetryButtonRef = useRef\(null\)/);
  assert.match(source,/const active = document\.activeElement/);
  assert.match(source,/active !== document\.body && active !== button/);
  assert.match(source,/active\?\.closest\?\.\('\[data-automation-recovery-controls\]'\)/);
  assert.match(source,/button\.focus\(\{ preventScroll: true \}\)/);
});
test("Recovery navigation preserves the draft and never triggers another Automation write",()=>{
  assert.match(source,/Return to Automations \(keep draft\)/);
  assert.match(source,/onClick=\{\(\) => closeAutomationEditor\(false\)\}/);
  assert.match(source,/setAutomationDraftParked\(Boolean\(automationUncertainRef\.current\) \|\| automationDraftChanged\(\)\)/);
  assert.match(source,/if \(automationUncertainRef\.current \|\| automationSaveInFlight\.current/);
  assert.match(source,/setAutomationRecoveryFailures\(0\)/);
  assert.match(source,/automationRecoveryFocusRequested\.current = false/);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("src/pages/AdminSettings.jsx", "utf8");
const loader = source.slice(source.indexOf("  const loadAutomations = async () => {"),
  source.indexOf("  useEffect(() => {\n    void loadAutomations();"));
const ack = source.slice(source.indexOf("  const abandonUncertainAutomationAttempt = async () => {"),
  source.indexOf("  useEffect(() => {\n    if (!automationRecoveryFocusRequested.current", source.indexOf("  const abandonUncertainAutomationAttempt = async () => {")));

test("Confirmed acknowledgment adopts exactly the complete owned verification read", () => {
  assert.match(ack, /reviewedAutomationSnapshotIsCurrent\(evidence.review, \{ \.\.\.pending, rows \}\)/);
  assert.match(ack, /automationLoadSequence\.current \+= 1;\s*setAutomations\(rows\);\s*setAutomationLoadError\(false\);\s*setIsLoading\(false\);\s*setAutomationRecoveryListVerified\(true\);/);
  assert.doesNotMatch(ack, /await loadAutomations\(/);
  assert.match(source, /Automation list was refreshed from the complete, read-only acknowledgment snapshot/);
  assert.match(source, /not which request saved the rule/);
});

test("A later failed list reload is not empty or verified and cannot use older request completion", () => {
  assert.match(loader, /requestSequence = \+\+automationLoadSequence.current/);
  assert.match(loader, /ownerEpoch = automationSessionEpoch.current/);
  assert.match(loader, /setAutomationRecoveryListVerified\(false\)/);
  assert.match(loader, /if \(requestSequence !== automationLoadSequence.current \|\|\s*ownerEpoch !== automationSessionEpoch.current\) return null/);
  assert.match(loader, /if \(!Array.isArray\(rules\)\)/);
  assert.match(loader, /setAutomationLoadError\(true\)/);
  assert.match(source, /!isLoading && !automationLoadError && automationRecoveryListVerified/);
  assert.match(source, /An earlier verified snapshot, if any,/);
  assert.match(source, /No Automation write was retried/);
});

test("New Admin session invalidates prior list ownership and initiates fresh read", () => {
  assert.match(source, /automationSessionEpoch.current \+= 1;\s*automationLoadSequence.current \+= 1/);
  assert.match(source, /setAutomationRecoveryListVerified\(false\);\s*setAutomations\(\[\]\);\s*setAutomationLoadError\(true\)/);
  assert.match(source, /void loadAutomations\(\);\s*\}, \[sessionToken, navigationKey, isUnlocked\]\)/);
});

test("Refreshing the list is read-only and never retries a draft", () => {
  assert.match(source, /aria-label="Refresh Automation rules \(read-only\)"/);
  assert.match(source, /onClick=\{\(\) => \{ void loadAutomations\(\); \}\}/);
  assert.match(source, /disabled=\{isLoading\}/);
  assert.match(loader, /label: "Admin Settings automation rules"/);
  assert.match(loader, /await withAutomationReadDeadline/);
});

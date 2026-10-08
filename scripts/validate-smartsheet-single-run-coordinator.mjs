import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const backend = readFileSync("base44/functions/smartsheetSyncAction/entry.ts", "utf8");

let checks = 0;
const check = (value, label) => { assert.ok(value, label); checks += 1; };
const count = (needle) => backend.split(needle).length - 1;

check(backend.includes("async function loadSingleSyncStatusRecord"),
  "Backend must use one explicit sync-status coordinator record");
check(backend.includes("matches.length !== 1") &&
      backend.includes("Exactly one coordinator record is required before starting a sync."),
  "Missing or duplicate status coordinators must fail closed");

check(backend.includes("async function claimSyncRun") &&
      backend.includes("if (current?.status === 'running' && !abandoned)"),
  "A new sync must reject an already-running coordinator");
check(backend.includes("existing Order sync is stale and must be closed for review") &&
      backend.includes("Another Smartsheet sync is already running."),
  "Active and stale-running states must produce explicit lock messages");
check(backend.includes("{ id: record.id, setting_key: 'smartsheetSyncStatus', updated_date: record.updated_date }") &&
      backend.includes("Another Smartsheet sync claimed the coordinator first."),
  "Run claim must use optimistic concurrency on the singleton status record");
check(backend.includes("verified?.setting_value?.started_at !== status?.started_at") &&
      backend.includes("verified?.setting_value?.action !== status?.action"),
  "Run claim must be read back and verified by run identity");

check(backend.includes("async function assertSyncRunOwnership") &&
      backend.includes("This Smartsheet sync no longer owns the active run coordinator."),
  "Write paths must fail closed after losing coordinator ownership");
check(backend.includes("record?.setting_value?.status !== 'running'") &&
      backend.includes("cleanText(record?.setting_value?.started_at, 80) !== cleanText(startedAt, 80)"),
  "Run-scoped status writes must require both running state and matching started_at");
check(!backend.includes("saveSyncStatus(base44"),
  "No unscoped sync-status writes may remain");

check(count("await claimInvocationRun({") >= 3,
  "Full sync, Order Save & Sync, and Sales Save & Sync must all claim the coordinator through invocation-scoped ownership");
check(count("assertRunOwnership: async () => assertSyncRunOwnership") >= 4,
  "Targeted Order, targeted Sales, full Order and full Sales push paths must all assert ownership");

check(backend.includes("options: { assertRunOwnership?: () => Promise<void> | void } = {}") &&
      count("if (typeof options?.assertRunOwnership === 'function') await options.assertRunOwnership();") >= 7,
  "Pull and push mutation batches must assert ownership before production writes");
check(backend.includes("const pullResult = await pullDataset(base44, token, dataset, profile, config, {") &&
      backend.includes("assertRunOwnership: async () => assertSyncRunOwnership(base44, runStartedAt)"),
  "Full pull must receive the active run ownership guard");

check(backend.includes("const safeStatus = [400, 401, 403, 409, 429, 502, 503]"),
  "Coordinator conflicts must surface as HTTP 409 instead of generic 500");

check(backend.includes("let claimedRunStartedAt = ''") &&
      backend.includes("claimedRunStartedAt = cleanText(status?.started_at, 80)"),
  "Only an invocation that successfully claimed a run may own cleanup authority");
check(backend.includes("if (base44Instance && claimedRunStartedAt)") &&
      backend.includes("cleanText(matches[0]?.setting_value?.started_at, 80) === claimedRunStartedAt"),
  "Finally cleanup must be scoped to the exact run claimed by that invocation");
check(!backend.includes("if (base44Instance) {\n      try {\n        const record = await base44Instance.asServiceRole.entities.GlobalSettings.filter({ setting_key: 'smartsheetSyncStatus' });"),
  "Read-only/status invocations must never globally fail an unrelated active coordinator");

console.log("Smartsheet single-run coordinator safety: " + checks + "/" + checks + " PASS.");

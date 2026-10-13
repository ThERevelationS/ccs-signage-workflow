// Read-only, pre-publication Time Clock gate.
// Runs local synthetic suites and source/schema checks only.
// It never invokes a live Base44 function, edits production rows, or deploys.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const read = (relative) => readFileSync(join(root, relative), 'utf8');
const requiredEntities = [
  'TimeEntry', 'TimeClockEmployeeState', 'TimeClockBreak', 'TimeClockWorkPause',
  'TimeClockLaborSegment', 'TimeClockAudit', 'TimeClockCorrectionRequest',
  'TimeClockPunchException', 'TimeClockPayPeriod', 'TimeClockBadge',
  'TimeClockPayPeriodCreateGate', 'TimeClockAdminCorrectionGate',
];
for (const name of requiredEntities) {
  const schema = JSON.parse(read(`base44/entities/${name}.jsonc`));
  assert.equal(schema.name, name);
  for (const operation of ['create', 'update', 'delete']) {
    assert.equal(schema.rls?.[operation]?.user_condition?.role, 'timeclock_backend_only',
      `${name}.${operation} must be backend-only`);
  }
}
console.log(`PASS ${requiredEntities.length} Time Clock schemas have backend-only write permissions`);

const periodGate = JSON.parse(read('base44/entities/TimeClockPayPeriodCreateGate.jsonc'));
const managerGate = JSON.parse(read('base44/entities/TimeClockAdminCorrectionGate.jsonc'));
for (const gate of [periodGate, managerGate]) {
  assert.deepEqual(gate.properties.scope.enum, ['company']);
  assert.deepEqual(gate.properties.status.enum, ['idle', 'creating']);
  assert.equal(gate.rls.read.user_condition.role, 'timeclock_backend_only');
  for (const field of ['request_id', 'payload_hash', 'claim_token', 'started_at']) {
    assert.ok(gate.properties[field], `${gate.name} is missing coordinator binding field ${field}`);
  }
}
assert.ok(managerGate.properties.time_entry_id);
console.log('PASS both coordinator schemas retain singleton contract and backend-only access');

const backend = read('base44/functions/timeClockAction/entry.ts');
for (const action of [
  'clock_in', 'clock_out', 'work_pause_start', 'work_pause_resume',
  'submit_correction_request', 'review_correction_request',
  'recover_missed_clock_in', 'pay_period_create', 'pay_period_status',
  'admin_set_entry_approval', 'admin_correction_gate_diagnostics',
]) {
  assert.ok(backend.includes(`action === '${action}'`), `Missing authoritative backend action ${action}`);
}
assert.match(backend, /claimAdminCorrectionGate\(/);
assert.match(backend, /releaseManagerReviewDecisionGate\(/);
const diagnosticIndex = backend.indexOf("if (action === 'admin_correction_gate_diagnostics')");
const recoveryIndex = backend.indexOf('let state = await ensureState(stateEntity, target)', diagnosticIndex);
assert.ok(diagnosticIndex > 0 && recoveryIndex > diagnosticIndex,
  'Coordinator diagnostics must remain ahead of employee-state recovery and writes');
console.log('PASS authoritative Time Clock action and correction-coordinator recovery wiring');

const timeClockPage = read('src/pages/TimeClock.jsx');
const adminPage = read('src/pages/AdminSettings.jsx');
const manager = read('src/components/timeclock/TimeClockAdmin.jsx');
const quickClock = read('src/components/timeclock/QuickClockSection.jsx');
for (const path of [
  'src/components/timeclock/ClockOutDialog.jsx',
  'src/components/timeclock/WorkPauseOverlay.jsx',
  'src/components/timeclock/MissedPunchResolutionDialog.jsx',
  'src/components/timeclock/LateClockInReviewDialog.jsx',
  'src/components/timeclock/CorrectionCoordinatorDiagnostics.jsx',
]) read(path);
assert.match(timeClockPage, /<QuickClockSection/);
assert.match(timeClockPage, /<WorkPauseOverlay/);
assert.match(quickClock, /timeClockAction/);
assert.match(adminPage, /const isAdmin = currentUser\?\.role === "admin"/);
assert.match(adminPage, /\{isAdmin && \([\s\S]*?<AdminPanelContent value="timeclock">/);
assert.match(adminPage, /<TimeClockAdmin \/>/);
assert.match(manager, /<PayPeriodManager/);
assert.match(manager, /<CorrectionRequestAdminPanel/);
assert.match(manager, /<CorrectionCoordinatorDiagnostics/);
assert.match(manager, /<TimeClockAuditTrail/);
console.log('PASS employee and administrator source routes, including admin-only management access');

const scriptsDir = join(root, 'scripts');
const scripts = readdirSync(scriptsDir).filter((name) =>
  /^validate-timeclock-.*\.mjs$/.test(name)).sort();
assert.ok(scripts.length >= 10, 'Expected at least ten Time Clock regression suites');
let totalPassSummaries = 0;
for (const script of scripts) {
  const outcome = spawnSync(process.execPath, [join(scriptsDir, script)], {
    cwd: root, encoding: 'utf8', timeout: 150_000, maxBuffer: 12 * 1024 * 1024,
  });
  if (outcome.status !== 0 || outcome.error) {
    const details = [outcome.stdout, outcome.stderr, String(outcome.error || '')].filter(Boolean).join('\n');
    throw new Error(`${script} FAILED (${outcome.status}):\n${details.slice(-5000)}`);
  }
  const lines = outcome.stdout.split(/\r?\n/).filter(Boolean);
  const summary = lines.findLast((line) => /^PASS \d+\/\d+ /.test(line));
  assert.ok(summary, `${script} did not emit a validated scenario count`);
  const count = summary.match(/^PASS (\d+)\/(\d+) /);
  assert.equal(Number(count[1]), Number(count[2]), `${script} has failed scenarios`);
  totalPassSummaries += Number(count[1]);
  console.log(`PASS ${script}: ${count[1]}/${count[2]}`);
}
console.log(`PASS ${scripts.length} Time Clock suites covering ${totalPassSummaries} synthetic and renderer scenarios/groups`);
console.log('NOT VERIFIED: real browser acceptance, remote deployment, and two-session live concurrency');
console.log('NOT PERMITTED: production punches, payroll test writes, coordinator mutations, or publishing');
console.log('PASS Time Clock read-only pre-publication source and synthetic validation');

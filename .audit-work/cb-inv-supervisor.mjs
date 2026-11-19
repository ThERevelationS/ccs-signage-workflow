import { existsSync, openSync, closeSync, unlinkSync, readFileSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';

const statePath = '.audit-work/cb-inv-state.json';
const planPath = '.audit-work/cb-inv-plan.json';
const lockPath = '.audit-work/cb-inv-supervisor.lock';
const read = (path) => JSON.parse(readFileSync(path, 'utf8'));
const counts = () => {
  const plan = read(planPath);
  const state = read(statePath);
  return {
    invoice_targets: Object.keys(state.ids.Invoice).length,
    expected_invoices: plan.invoices.length,
    payment_targets: Object.keys(state.ids.Payment).length,
    expected_payments: plan.payments.length + plan.refunds.length,
    ambiguous: state.ambiguous.length,
    pending: !!state.pending,
  };
};
if (process.argv.includes('--dry-run')) {
  console.log(JSON.stringify({ sequence: ['reconcile', 'apply', 'reconcile', 'verify'], state: counts() }));
  process.exit(0);
}
if (existsSync('.audit-work/cb-inv-import.lock')) throw new Error('An import lock already exists; inspect before starting.');
const lock = openSync(lockPath, 'wx');
writeFileSync(lock, JSON.stringify({ pid: process.pid, started_at: new Date().toISOString() }));
async function run(mode, label) {
  const stdout = openSync(`.audit-work/cb-inv-${label}.out`, 'wx');
  const stderr = openSync(`.audit-work/cb-inv-${label}.err`, 'wx');
  console.log(JSON.stringify({ event: 'start', mode, label, at: new Date().toISOString(), state: counts() }));
  const code = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['.audit-work/cb-inv-import.mjs', mode], { stdio: ['ignore', stdout, stderr], windowsHide: true });
    child.once('error', reject);
    child.once('exit', (status, signal) => resolve(status ?? `signal:${signal}`));
  }).finally(() => { closeSync(stdout); closeSync(stderr); });
  console.log(JSON.stringify({ event: 'exit', mode, label, code, at: new Date().toISOString(), state: counts() }));
  if (code !== 0) throw new Error(`${label} failed with ${code}; inspect its logs.`);
}
try {
  await run('reconcile', 'supervisor-initial-reconcile');
  for (let pass = 1; pass <= 3; pass++) {
    await run('apply', `supervisor-apply-${pass}`);
    await run('reconcile', `supervisor-reconcile-${pass}`);
    const status = counts();
    if (!status.pending && !status.ambiguous && status.invoice_targets === status.expected_invoices && status.payment_targets === status.expected_payments) {
      await run('verify', 'supervisor-final-verify');
      console.log(JSON.stringify({ event: 'complete', at: new Date().toISOString(), state: counts() }));
      process.exitCode = 0;
      break;
    }
    if (pass === 3) throw new Error(`Import still incomplete after ${pass} passes: ${JSON.stringify(status)}`);
  }
} finally {
  closeSync(lock);
  unlinkSync(lockPath);
}

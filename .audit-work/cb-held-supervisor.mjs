import { existsSync, openSync, closeSync, readFileSync, writeFileSync, copyFileSync, unlinkSync } from 'node:fs';
import { spawn } from 'node:child_process';

const supervisorLock = '.audit-work/cb-held-supervisor.lock';
const estimateLock = '.audit-work/cb-held-estimate.lock';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const read = (path) => JSON.parse(readFileSync(path, 'utf8'));
if (existsSync(supervisorLock)) throw new Error('Held supervisor lock exists.');
const lock = openSync(supervisorLock, 'wx');
writeFileSync(lock, JSON.stringify({ pid: process.pid, at: new Date().toISOString() }));
async function run(label, args) {
  const output = openSync(`.audit-work/cb-held-${label}.out`, 'wx');
  const error = openSync(`.audit-work/cb-held-${label}.err`, 'wx');
  console.log(JSON.stringify({ event: 'start', label, at: new Date().toISOString() }));
  const exit = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { stdio: ['ignore', output, error], windowsHide: true });
    child.once('error', reject);
    child.once('exit', (code, signal) => resolve(code ?? `signal:${signal}`));
  }).finally(() => { closeSync(output); closeSync(error); });
  console.log(JSON.stringify({ event: 'exit', label, exit, at: new Date().toISOString() }));
  if (exit !== 0) throw new Error(`${label} failed; inspect its logs and locks.`);
}
try {
  if (!existsSync(estimateLock)) throw new Error('Expected running estimate worker lock.');
  const estimatePid = read(estimateLock).pid;
  while (true) {
    try { process.kill(estimatePid, 0); } catch (error) { if (error.code === 'ESRCH') break; throw error; }
    await sleep(10000);
  }
  if (existsSync(estimateLock)) throw new Error('Estimate worker failed or stopped; inspect its lock and state.');
  const estimatePlan = read('.audit-work/cb-held-estimate-plan.json');
  const estimateState = read('.audit-work/cb-held-estimate-state.json');
  if (estimateState.pending || estimateState.conflicts.length || Object.keys(estimateState.complete).length !== estimatePlan.counts.pending) {
    throw new Error('Estimate links incomplete; inspect state.');
  }
  await run('invoice-plan', ['.audit-work/cb-held-inv-plan.mjs', '--apply']);
  for (let pass = 1; pass <= 3; pass++) {
    await run(`invoice-apply-${pass}`, ['.audit-work/cb-inv-import.mjs', 'apply']);
    await run(`invoice-reconcile-${pass}`, ['.audit-work/cb-inv-import.mjs', 'reconcile']);
    const state = read('.audit-work/cb-inv-state.json');
    const plan = read('.audit-work/cb-inv-plan.json');
    if (!state.pending && !state.ambiguous.length && Object.keys(state.ids.Invoice).length === plan.invoices.length &&
        Object.keys(state.ids.Payment).length === plan.payments.length + plan.refunds.length) break;
    if (pass === 3) throw new Error('Invoice state still incomplete after 3 passes.');
  }
  if (existsSync('.audit-work/cb-inv-verify.before-held.json')) throw new Error('Historical invoice verification snapshot already exists.');
  copyFileSync('.audit-work/cb-inv-verify.json', '.audit-work/cb-inv-verify.before-held.json');
  await run('invoice-verify', ['.audit-work/cb-inv-import.mjs', 'verify']);
  await run('workorder-estimate-plan', ['.audit-work/cb-pipe-cust-from-est.mjs']);
  await run('workorder-estimate-apply', ['.audit-work/cb-pipe-cust-apply.mjs']);
  await run('workorder-estimate-verify', ['.audit-work/cb-pipe-links-verify.mjs', 'estimate']);
  await run('leads-apply', ['.audit-work/cb-pipe-leads-apply.mjs']);
  await run('leads-verify', ['.audit-work/cb-pipe-links-verify.mjs', 'lead']);
  console.log(JSON.stringify({ event: 'complete', at: new Date().toISOString() }));
} finally {
  closeSync(lock);
  unlinkSync(supervisorLock);
}

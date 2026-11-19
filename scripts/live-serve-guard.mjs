#!/usr/bin/env node
// Dashboard supervisor — keeps live-serve.tmp.mjs alive. If the server exits
// for any reason (crash, EPERM, OOM) it respawns after a short delay. Meant to
// be launched DETACHED (Start-Process) so it survives the spawning session —
// that's what kept killing the dashboard between restarts.
import { spawn } from 'node:child_process';
import { appendFileSync } from 'node:fs';

const LOG = '.audit-work/dash-guard.log';
const log = (m) => { try { appendFileSync(LOG, `${new Date().toISOString()} ${m}\n`); } catch {} };

let backoff = 1000;
const start = () => {
  const child = spawn(process.execPath, ['scripts/live-serve.tmp.mjs'], { windowsHide: true, stdio: ['ignore', 'inherit', 'inherit'] });
  log(`spawned dashboard pid=${child.pid}`);
  child.on('exit', (code, sig) => {
    log(`dashboard exited code=${code} sig=${sig} — respawning in ${backoff}ms`);
    setTimeout(start, backoff);
    backoff = Math.min(backoff * 2, 60000);
  });
  child.on('spawn', () => { backoff = 1000; });
};
log('guard online');
start();

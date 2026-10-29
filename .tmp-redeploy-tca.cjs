const { spawnSync } = require('child_process');
const fs = require('fs');
const RUN = 'C:/Users/BrettHeinlein/AppData/Local/npm-cache/_npx/ebe492f4494510c0/node_modules/base44/bin/run.js';
const APP = '68dfcc5e57bbbc35387da97c';

// 1) Read the updated remote entry.ts
const read = spawnSync(process.execPath, [RUN, 'sandbox', 'read', 'base44/functions/timeClockAction/entry.ts', '--app-id', APP, '--branch', 'main', '--json'], { encoding: 'utf8', timeout: 180000, maxBuffer: 64 * 1024 * 1024 });
const data = JSON.parse(read.stdout);
const code = data.files[0].content;
const hasGate = code.includes("const isManagerSession = actor.role === 'admin';");
console.log('remote lines:', data.files[0].totalLines, '| gate present:', hasGate);
if (!hasGate) { console.log('GATE MISSING — aborting'); process.exit(1); }

// 2) Redeploy the function with that exact source
fs.writeFileSync('.tmp-tca-body.json', JSON.stringify({ code }));
const dep = spawnSync(process.execPath, [RUN, 'api', 'fetch', 'POST', `/api/apps/${APP}/coding/redeploy-function/timeClockAction`, '--body', '@.tmp-tca-body.json'], { encoding: 'utf8', timeout: 300000, maxBuffer: 64 * 1024 * 1024 });
const out = dep.stdout || '';
console.log(out.includes('"error"') ? out.slice(0, 400) : 'DEPLOYED (updated ' + (JSON.parse(out).updated_date || '?') + ')');

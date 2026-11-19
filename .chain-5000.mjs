// Chain: fixture pool -> merge -> seeded shuffle -> ALL pooled items ->
// wait for the current validation run to exit -> launch the live validation.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { execSync, spawn } from 'node:child_process';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const busyBuild = () => {
  try {
    const out = execSync(`powershell -Command "Get-CimInstance Win32_Process -Filter \\"Name='node.exe'\\" | Where-Object { \\$_.CommandLine -match 'build-business-address-fixture' } | Measure-Object | Select-Object -ExpandProperty Count"`, { encoding: 'utf8' }).trim();
    return out !== '0' && out !== '';
  } catch { return false; }
};
// fire when the builder signals done, or when it was seen running and then vanished (crash → fall back to the live pool file)
let sawBuild = busyBuild();
while (!(existsSync('.fixture-business-5000-src.json') || existsSync('.fixture-build-done'))) {
  await sleep(60000);
  if (busyBuild()) sawBuild = true;
  else if (sawBuild) break;
}
await sleep(5000); // let the writer finish flushing

const pool = new Set();
try { for (const x of JSON.parse(readFileSync('.fixture-business-5000-src.json', 'utf8'))) pool.add(x); } catch {}
try { for (const l of readFileSync('.fixture-pool-live.jsonl', 'utf8').trim().split('\n')) pool.add(JSON.parse(l).address); } catch {}
try { for (const x of JSON.parse(readFileSync('.fixture-business-1000-src.json', 'utf8'))) pool.add(x); } catch {}
const all = [...pool];
let s = 987654;
const rnd = () => ((s = (s * 1103515245 + 12345) >>> 0) / 4294967296);
for (let i = all.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [all[i], all[j]] = [all[j], all[i]]; }
writeFileSync('.fixture-business-all.json', JSON.stringify(all, null, 1));
console.log(`fixture: ${all.length} pooled addresses — running ALL of them`);

const busy = () => {
  try {
    const out = execSync(`powershell -Command "Get-CimInstance Win32_Process -Filter \\"Name='node.exe'\\" | Where-Object { \\$_.CommandLine -match 'permitting-address-validation' } | Measure-Object | Select-Object -ExpandProperty Count"`, { encoding: 'utf8' }).trim();
    return out !== '0' && out !== '';
  } catch { return false; }
};
while (busy()) await sleep(60000);

const child = spawn('node', ['scripts/permitting-address-validation.mjs', '--file', '.fixture-business-all.json', '--limit', String(all.length), '--workers', '3', '--json', '.validation-all.json', '--events', '.live-events.jsonl'], {
  env: { ...process.env, PERMIT_AUTO_LOGIN: '1' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
const { openSync, writeSync } = await import('node:fs');
const fd = openSync('.validation-all.log', 'a');
child.stdout.on('data', (d) => writeSync(fd, d));
child.stderr.on('data', (d) => writeSync(fd, d));
child.unref();
console.log(`all-addresses (${all.length}) live validation launched`);

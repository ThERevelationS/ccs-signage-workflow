// Read-only transport checks via latest-cli.cjs. JSON parsed here ONLY for checks.
const fs = require('fs');
const crypto = require('crypto');
const latest = require('./latest-cli.cjs');
const OUT = '.audit-work/foundation-equipment13/remote-sync';
const APP = '68dfcc5e57bbbc35387da97c';
const results = [];
const run = (name, args, check) => {
  try {
    const stdout = latest(args);
    const j = JSON.parse(stdout.slice(stdout.indexOf('{'), stdout.lastIndexOf('}') + 1));
    fs.writeFileSync(`${OUT}/transport-${name}.json`, stdout);
    const ok = check ? check(j) : true;
    results.push({ name, ok, exit: 0 });
    console.log(ok ? 'ok' : 'FAIL', name);
  } catch (e) {
    results.push({ name, ok: false, error: String(e.message).slice(0, 300) });
    console.log('FAIL', name, '-', String(e.message).slice(0, 300));
  }
};

run('whoami', ['whoami', '--app-id', APP, '--json'],
  j => j.output === 'Logged in as: brettheinlein1@gmail.com');

run('git-status', ['sandbox', 'run', 'git status --porcelain', '--timeout-ms', '120000', '--app-id', APP, '--branch', 'main', '--json'],
  j => j.exitCode === 0 && j.truncated !== true && String(j.stdout || '').trim() === '');

run('bindings-read', ['sandbox', 'read', 'src/components/estimator/foundation/foundationEquipmentBindings.js', '--app-id', APP, '--branch', 'main', '--json'],
  j => {
    const f = j.files?.[0];
    return f?.error?.code === 'NOT_FOUND';
  });

run('page-read', ['sandbox', 'read', 'src/pages/FoundationEstimator.jsx', '--app-id', APP, '--branch', 'main', '--json'],
  j => {
    const f = j.files?.[0];
    if (!f || f.error || f.content === undefined) return false;
    const lf = f.content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const expected = '051cbe9895097e5c64cc80286beef8c0653219560b273710db2f9ea0c3dc67ba';
    return [lf, lf.replace(/\n$/, ''), lf + '\n'].some(body =>
      crypto.createHash('sha256').update(body).digest('hex') === expected);
  });

fs.writeFileSync(`${OUT}/transport-results.json`, JSON.stringify(results, null, 1));
const wrapperHash = crypto.createHash('sha256').update(fs.readFileSync(`${OUT}/latest-cli.cjs`)).digest('hex');
fs.writeFileSync(`${OUT}/wrapper-hash.txt`, wrapperHash);
const fails = results.filter(r => !r.ok);
console.log(`transport checks=${results.length} failed=${fails.length}`);
process.exit(fails.length ? 1 : 0);

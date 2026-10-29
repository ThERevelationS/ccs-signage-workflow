const fs = require('fs');
for (const f of ['test-timeclock-quickclock-browser', 'test-timeclock-pay-period-browser']) {
  const p = 'scripts/' + f + '.mjs';
  let t = fs.readFileSync(p, 'utf8');
  if (!t.includes('pathToFileURL')) {
    t = t.replace('const root = process.cwd();',
      'const root = process.cwd();\nconst { pathToFileURL } = await import("node:url");');
  }
  t = t.replace(
    'path.join(tmpdir(), "timeclock-browser-check/node_modules/playwright/index.mjs")',
    'pathToFileURL(path.join(tmpdir(), "timeclock-browser-check/node_modules/playwright/index.mjs")).href'
  );
  fs.writeFileSync(p, t);
  console.log(f + ' patched');
}

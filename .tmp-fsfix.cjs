const fs = require('fs');
for (const f of ['test-timeclock-quickclock-browser', 'test-timeclock-pay-period-browser', 'test-timeclock-admin-browser', 'test-timeclock-timeoff-browser']) {
  const p = 'scripts/' + f + '.mjs';
  let t = fs.readFileSync(p, 'utf8');
  if (t.includes('fs: { allow:') && !t.includes('strict: false')) {
    t = t.replace('fs: { allow:', 'fs: { strict: false, allow:');
    fs.writeFileSync(p, t);
    console.log(f + ' patched');
  } else {
    console.log(f + ' skipped');
  }
}

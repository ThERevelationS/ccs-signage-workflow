const fs = require('fs');
const checks = [
  ['.tmp-remote/v-src_components_timeclock_MissedClockInDialog.jsx.json', 'src/components/timeclock/MissedClockInDialog.jsx'],
  ['.tmp-remote/v-src_components_timeclock_QuickClockSection.jsx.json', 'src/components/timeclock/QuickClockSection.jsx'],
  ['.tmp-remote/v-src_index.css.json', 'src/index.css'],
];
for (const [remote, local] of checks) {
  const r = JSON.parse(fs.readFileSync(remote, 'utf8')).content || '';
  const l = fs.readFileSync(local, 'utf8');
  console.log(`${local}: remote=${r.length} local=${l.length} ${r === l ? 'IDENTICAL' : 'DIFFERS'}`);
}

const fs = require('fs');
for (const f of ['session-load-fencing', 'session-security', 'unresolved-routing', 'work-pause-overlay-ui']) {
  const t = JSON.parse(fs.readFileSync(`.tmp-remote/v-${f}.json`, 'utf8')).content || '';
  fs.writeFileSync(`.tmp-remote/v-${f}.mjs`, t);
  const tail = t.split('\n').filter((l) => /console\.log/.test(l));
  console.log(`=== ${f} ===`);
  tail.slice(-5).forEach((l) => console.log('  ' + l.trim()));
  // check for work_pause refs to removed QCS paths
  const pauselines = t.split('\n').filter((l) => /onStartWorkPause|work_pause_start|handleStartWorkPause|ClockOutDialog/.test(l));
  if (pauselines.length) { console.log('  pause/dialog refs:'); pauselines.forEach((l) => console.log('    ' + l.trim())); }
}

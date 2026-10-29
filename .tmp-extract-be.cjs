const fs = require('fs');
const t = fs.readFileSync('.tmp-merged/entry-timeclock.ts', 'utf8');
const lines = t.split('\n');
lines.forEach((l, i) => {
  if (/function .*[Tt]racker|normalizeTrackerPrefs|TRACKER_/.test(l)) console.log((i + 1) + ': ' + l.trim().substring(0, 140));
});
const i = t.indexOf("if (action === 'time_tracker_prefs_update')");
const j = t.indexOf('if (action ===', i + 30);
console.log('prefs_update starts ~line', t.substring(0, i).split('\n').length, 'next action at line', t.substring(0, j).split('\n').length, ':', t.substring(j, j + 80).trim());
const k = t.indexOf("if (action === 'work_pause_report_missed')");
const m = t.indexOf('if (action ===', k + 30);
console.log('wprm starts ~line', t.substring(0, k).split('\n').length, 'next action at line', t.substring(0, m).split('\n').length, ':', t.substring(m, m + 80).trim());
const s = t.indexOf("if (action === 'time_tracker_snapshot'");
console.log('tracker block starts line', t.substring(0, s).split('\n').length);

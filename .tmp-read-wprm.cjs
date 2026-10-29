const t = require('fs').readFileSync('base44/functions/timeClockAction/entry.ts', 'utf8');
const j = t.indexOf("if (action === 'work_pause_report_missed')");
console.log(t.substring(j, j + 3400));

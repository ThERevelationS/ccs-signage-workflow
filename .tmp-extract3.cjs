const fs = require('fs');
const cur = fs.readFileSync('base44/functions/timeClockAction/entry.ts', 'utf8');
for (const k of ['companyWeekStartKey', 'breakSummaryForEntry', 'workPauseSummaryForEntry', 'dateKeyInCompanyTime', 'minutesOfDayInCompanyTime']) {
  console.log(k + ': ' + (cur.split(k).length - 1));
}
const mer = fs.readFileSync('.tmp-merged/entry-timeclock.ts', 'utf8');
const lines = mer.split('\n');
// print merged 1368-1440 to see if companyWeekStartKey + friends are tracker additions
console.log(lines.slice(1367, 1445).map((l, i) => (1368 + i) + ': ' + l).join('\n'));

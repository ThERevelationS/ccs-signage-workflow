const fs = require('fs');
const r = (JSON.parse(fs.readFileSync('.tmp-remote/qcs-v7.json', 'utf8')).content) || '';
const l = fs.readFileSync('src/components/timeclock/QuickClockSection.jsx', 'utf8');
const anchor = '        {!authoritativeTransition && !punchResolution && !isRecognizing && !showClockOut && (';
console.log('remote anchor count:', r.split(anchor).length - 1);
console.log('remote has summary:', r.includes("You're clocked in"));
console.log('remote len:', r.length, '| local len:', l.length);

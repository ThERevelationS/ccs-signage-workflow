const fs = require('fs');
const r = (JSON.parse(fs.readFileSync('.tmp-remote/qcs-final.json', 'utf8')).content) || '';
const l = fs.readFileSync('src/components/timeclock/QuickClockSection.jsx', 'utf8');
const rn = r.replace(/\r\n/g, '\n'), ln = l.replace(/\r\n/g, '\n');
console.log('normalized identical:', rn === ln);
console.log('summary card:', r.includes("You're clocked in"));
console.log('no auto-open comment:', r.includes('Status loads never auto-open'));
console.log('pending recovery reopen:', r.includes('pendingClockOut.entryId === String(status.entry.id)'));

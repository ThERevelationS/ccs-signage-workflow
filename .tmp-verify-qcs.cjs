const fs = require('fs');
const r = (JSON.parse(fs.readFileSync('.tmp-remote/qcs-v8.json', 'utf8')).content) || '';
const l = fs.readFileSync('src/components/timeclock/QuickClockSection.jsx', 'utf8');
const rn = r.replace(/\r\n/g, '\n');
const ln = l.replace(/\r\n/g, '\n');
console.log('normalized identical:', rn === ln);
console.log('summary occurrences:', r.split("You're clocked in").length - 1);
const gate = '!(selectedUser && activeEntry) && (';
console.log('gate-with-condition count:', r.split(gate).length - 1);

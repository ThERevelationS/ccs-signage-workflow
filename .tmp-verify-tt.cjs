const fs = require('fs');
const r = JSON.parse(fs.readFileSync('.tmp-remote/tt-final.json', 'utf8')).content || '';
const l = fs.readFileSync('src/components/timeclock/TimeTracker.jsx', 'utf8');
console.log('normalized identical:', r.replace(/\r\n/g, '\n') === l.replace(/\r\n/g, '\n'));
console.log('salary gate gone:', !r.includes('employment_type === "salary"'));

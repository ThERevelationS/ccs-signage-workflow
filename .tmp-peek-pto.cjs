const fs = require('fs');
const t = fs.readFileSync('src/components/timeclock/PTOBalanceView.jsx', 'utf8');
console.log(t.split('\n').filter(l => /import /.test(l)).slice(0, 20).join('\n'));
const v = fs.readFileSync('scripts/validate-timeclock-read-scope-fencing.mjs', 'utf8');
const lines = v.split('\n');
const i = lines.findIndex(l => /uiMocks|componentMocks|mock\('@/.test(l));
console.log('=== mock map region ===');
console.log(lines.slice(i - 2, i + 40).join('\n'));

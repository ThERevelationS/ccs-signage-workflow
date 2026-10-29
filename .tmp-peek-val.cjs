const t = require('fs').readFileSync('scripts/validate-timeclock-pay-period-recovery.mjs', 'utf8');
const lines = t.split('\n');
const i = lines.findIndex(l => /const setup = |function setup/.test(l));
console.log(lines.slice(i, i + 55).join('\n'));
console.log('=== employee def ===');
const j = lines.findIndex(l => /const employee = /.test(l));
console.log(lines.slice(j, j + 14).join('\n'));
console.log('=== tail ===');
console.log(lines.slice(-12).join('\n'));

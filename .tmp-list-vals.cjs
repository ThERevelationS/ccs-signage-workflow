const fs = require('fs');
const t = fs.readFileSync('C:/Users/BRETTH~1/AppData/Local/Temp/devin.exe-overflows/shell-8db9b8-ed7a01881e00cb1a/content.txt', 'utf8');
const m = t.match(/"stdout":\s*"([^"]*)/);
if (!m) { console.log('no stdout'); process.exit(1); }
const files = m[1].split('\\n').filter((l) => /^validate-timeclock/.test(l)).sort();
console.log(files.join('\n'));

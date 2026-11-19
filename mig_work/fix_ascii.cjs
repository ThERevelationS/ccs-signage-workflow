const fs = require('fs');
const p = 'scripts/test-migration-ui.mjs';
let c = fs.readFileSync(p, 'utf8');
// Replace the literal U+FEFF char inside the test string with the 6-char escape
// sequence so the file is pure ASCII but the parsed BOM test still works.
c = c.split(String.fromCharCode(0xFEFF)).join('\\uFEFF');
fs.writeFileSync(p, c);
const bad = [...c].filter((ch) => ch.charCodeAt(0) > 127).length;
console.log('remaining non-ascii:', bad);
const line = c.split('\n').find((l) => l.includes('id,val'));
console.log(line);

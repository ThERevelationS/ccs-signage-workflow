import fs from 'node:fs';
let s = fs.readFileSync('scripts/test-nav-wiring.mjs', 'utf8');
const BS = '\'.repeat(2);
const old = 'new RegExp(`import' + BS + 's+${name}' + BS + 'b`)';
const neu = 'new RegExp(`(import' + BS + 's+${name}' + BS + 'b|const' + BS + 's+${name}' + BS + 's*=)`)';
if (s.includes(old)) { fs.writeFileSync('scripts/test-nav-wiring.mjs', s.split(old).join(neu)); console.log('nav patched'); }
else { const i = s.indexOf('RegExp(`import'); console.log('NOT FOUND, ctx:', s.slice(i, i + 90)); }

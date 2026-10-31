import fs from 'node:fs';
let s = fs.readFileSync('scripts/test-nav-wiring.mjs', 'utf8');
const re = /!new RegExp\(`import\+\s\+\$\{name\}\+b`\)/;
const m = s.match(re);
if (!m) { console.log('no match'); const i = s.indexOf('RegExp(`import'); console.log(JSON.stringify(s.slice(i, i + 90))); process.exit(0); }
const replacement = '!new RegExp(`(import\\s+${name}\\b|const\\s+${name}\\s*=)`)';
s = s.replace(re, replacement);
fs.writeFileSync('scripts/test-nav-wiring.mjs', s);
console.log('nav patched:', m[0], '->', replacement);

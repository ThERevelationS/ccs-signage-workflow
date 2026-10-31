import fs from 'node:fs';
let s = fs.readFileSync('scripts/test-nav-wiring.mjs', 'utf8');
const re = /!new RegExp\(`import\+s\+\$\{name\}\+b`\)/;
const m = s.match(re);
if (!m) { console.log('no match'); process.exit(1); }
const replacement = '!new RegExp(`(import\\s+${name}\\b|const\\s+${name}\\s*=)`)';
s = s.replace(re, replacement);
fs.writeFileSync('scripts/test-nav-wiring.mjs', s);
console.log('nav patched');

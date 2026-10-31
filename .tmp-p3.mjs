import fs from 'node:fs';
let s = fs.readFileSync('scripts/test-nav-wiring.mjs', 'utf8');
const oldFrag = '!new RegExp(`import\\s+${name}\\b`)';
const newFrag = '!new RegExp(`(import\\s+${name}\\b|const\\s+${name}\\s*=)`)';
if (s.includes(oldFrag)) { fs.writeFileSync('scripts/test-nav-wiring.mjs', s.replace(oldFrag, newFrag)); console.log('nav patched'); }
else { const i = s.indexOf('RegExp(`import'); console.log('context:', JSON.stringify(s.slice(i, i+80))); }

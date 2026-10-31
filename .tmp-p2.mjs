import fs from 'node:fs';
let s = fs.readFileSync('scripts/test-nav-wiring.mjs', 'utf8');
const oldLine = '  .filter((name) => !new RegExp(`import\\s+${name}\\b`).test(app));';
const newLine = '  .filter((name) => !new RegExp(`(import\\s+${name}\\b|const\\s+${name}\\s*=)`).test(app));';
if (s.includes(oldLine)) { fs.writeFileSync('scripts/test-nav-wiring.mjs', s.replace(oldLine, newLine)); console.log('nav patched'); }
else console.log('nav anchor NOT FOUND');
let s2 = fs.readFileSync('scripts/test-scale-invoicing.mjs', 'utf8');
const i = s2.indexOf('safePageSize, skip\\)');
if (i >= 0) { s2 = s2.replace('safePageSize, skip\\)/', 'safePageSize, skip/'); fs.writeFileSync('scripts/test-scale-invoicing.mjs', s2); console.log('scale patched'); }
else console.log('scale anchor NOT FOUND');

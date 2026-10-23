const fs = require('fs');
const f = '/app/node_modules/vite/dist/node/chunks/dep-Bu492Fnd.js';
let s = fs.readFileSync(f, 'utf8');
const marker = 'Parse error ${g}:';
const i = s.indexOf(marker);
if (i < 0) { console.log('marker not found'); process.exit(1); }
const start = s.lastIndexOf('`', i);
const end = s.indexOf('`', i) + 1;
const newExpr = '`Parse error ${g} idx=${C.e()} ctx=${JSON.stringify(E.slice(Math.max(0,C.e()-200),C.e()+200))}`';
s = s.slice(0, start) + newExpr + s.slice(end);
fs.writeFileSync(f, s);
console.log('patched OK');

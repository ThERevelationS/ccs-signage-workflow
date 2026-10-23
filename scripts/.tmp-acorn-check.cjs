const fs = require('fs');
const acorn = require('/app/node_modules/acorn');
const file = process.argv[2];
const code = fs.readFileSync(file,'utf8');
try {
  acorn.parse(code, { ecmaVersion: 'latest', sourceType: 'module', allowReturnOutsideFunction: true });
  console.log('ACORN OK - valid ESM');
} catch (e) {
  console.log('ACORN ERROR:', e.message);
  const pos = typeof e.pos === 'number' ? e.pos : -1;
  console.log('pos', pos);
  if (pos >= 0) console.log('CONTEXT:', JSON.stringify(code.slice(Math.max(0,pos-500), pos+500)));
}

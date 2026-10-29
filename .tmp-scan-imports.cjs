const fs = require('fs');
const files = ['pto.json', 'tcsd.json', 'fed.json'];
const val = fs.readFileSync('.tmp-remote/v-rsf.mjs', 'utf8');
// Mocked ids in validator: keys of uiMocks + extraMocks per loadComponent call
const mocked = new Set();
for (const m of val.matchAll(/'(@\/[^']+|[a-z][a-z0-9-]*)':\s*[{]/g)) mocked.add(m[1]);
for (const m of val.matchAll(/'(lucide-react|date-fns|react|react-dom|@\/api\/base44Client)'/g)) mocked.add(m[1]);
console.log('mocked ids:', [...mocked].join(', '));
for (const f of files) {
  const content = JSON.parse(fs.readFileSync('.tmp-remote/' + f, 'utf8')).content || '';
  const ids = [...content.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
  const missing = ids.filter((id) => !id.startsWith('.') && !mocked.has(id) && id !== 'react' && id !== 'react-dom');
  console.log('\n' + f + ' imports:', ids.filter((i) => !i.startsWith('.')).join(', '));
  console.log(f + ' MISSING:', missing.join(', ') || 'none');
}

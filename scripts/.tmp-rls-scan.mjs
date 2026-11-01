import fs from 'fs'; import path from 'path';
const dir = 'base44/entities';
const open = [], absent = [], gated = [];
for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.jsonc'))) {
  try {
    const c = fs.readFileSync(path.join(dir, f), 'utf8').replace(/\/\/.*$/gm, '');
    const j = JSON.parse(c);
    const r = (j.rls || {}).read;
    const name = f.replace(/\.jsonc$/, '');
    if (r === undefined) absent.push(name);
    else if (typeof r === 'object' && r !== null && Object.keys(r).length === 0) open.push(name);
    else gated.push(name + (JSON.stringify(r).includes('backend_only') ? '(backend)' : ''));
  } catch (e) { console.log('PARSE-FAIL', f); }
}
console.log('OPEN(read:{}):', open.join(', '));
console.log('ABSENT:', absent.join(', '));
console.log('GATED count:', gated.length, '|', gated.slice(0, 40).join(', '));

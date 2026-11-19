// Scan catch blocks that return a default/empty value (swallow-to-default candidates).
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', 'remote');
function walk(d, out = []) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(jsx?|mjs|cjs)$/.test(e.name)) out.push(p);
  }
  return out;
}
const files = walk(ROOT);
const hits = [];
for (const f of files) {
  const rel = path.relative(ROOT, f).replace(/\\/g, '/');
  const lines = fs.readFileSync(f, 'utf8').split('\n');
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/catch\s*(\([^)]*\))?\s*\{/);
    if (!m) continue;
    const braceIdx = lines[i].indexOf('{', m.index + m[0].length - 1);
    let rest = lines[i].slice(braceIdx + 1);
    let depth = 1;
    for (const ch of rest) { if (ch === '{') depth++; else if (ch === '}') depth--; }
    const body = [rest]; let j = i;
    while (depth > 0 && j + 1 < lines.length) {
      j++; const l = lines[j]; body.push(l);
      for (const ch of l) { if (ch === '{') depth++; else if (ch === '}') depth--; }
    }
    const code = body.join('\n')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*/g, '');
    if (/return\s+(\[\s*\]|null|false|\{\s*\}|undefined|0)\s*;?\s*\}?\s*$/.test(code.trim())
        && !/(throw|set[A-Z]|alert|window\.alert)/.test(code)) {
      hits.push(rel + ':' + (i + 1) + ' RETURN-DEFAULT: ' + code.replace(/\s+/g, ' ').trim().slice(0, 120));
    }
    i = j;
  }
}
console.log(hits.join('\n') || 'NONE');

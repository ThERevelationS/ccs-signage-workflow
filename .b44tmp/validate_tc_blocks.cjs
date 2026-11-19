const { readFileSync } = require('fs');
const entry = readFileSync('timeClockAction_remote.ts', 'utf8');
const ENTITY_READ = /\b(?:[A-Z][A-Za-z0-9_]*|\w*[Ee]ntity|entities(?:\.[A-Z][A-Za-z0-9_]*|\[[^\]]*\]))\s*\.\s*(filter|list)\s*\(/g;
function splitTopLevel(a) {
  const p = []; let d = 0, s = 0;
  for (let i = 0; i < a.length; i++) {
    const c = a[i];
    if (c === '"' || c === "'" || c === '`') {
      const q = c; i++;
      while (i < a.length && a[i] !== q) { if (a[i] === '\\') i++; i++; }
      continue;
    }
    if ('([{'.includes(c)) d++;
    else if (')]}'.includes(c)) d--;
    else if (c === ',' && d === 0) { p.push(a.slice(s, i)); s = i + 1; }
  }
  p.push(a.slice(s));
  return p;
}
function findReads(src) {
  const out = []; let m; ENTITY_READ.lastIndex = 0;
  while ((m = ENTITY_READ.exec(src))) {
    const open = src.indexOf('(', m.index + m[0].lastIndexOf('('));
    let d = 0, end = -1;
    for (let i = open; i < src.length; i++) {
      const c = src[i];
      if (c === '"' || c === "'" || c === '`') {
        const q = c; i++;
        while (i < src.length && src[i] !== q) { if (src[i] === '\\') i++; i++; }
        continue;
      }
      if (c === '(') d++;
      else if (c === ')') { d--; if (d === 0) { end = i; break; } }
    }
    if (end === -1) break;
    out.push({ method: m[1], args: src.slice(open + 1, end), call: src.slice(m.index, end + 1) });
    ENTITY_READ.lastIndex = end + 1;
  }
  return out;
}
function underLimited(src) {
  const out = [];
  for (const { method, args, call } of findReads(src)) {
    if (/creation_request_key/.test(args)) continue;
    if (/\blimit\b/.test(args)) continue;
    const parts = splitTopLevel(args).map(p => p.trim());
    const has = method === 'filter' ? parts.length >= 3 && parts[2] !== '' : parts.length >= 2 && parts[1] !== '';
    if (has) continue;
    out.push(call.slice(0, 160));
  }
  return out;
}
const marks = [];
const re = /if \(action === ["']([a-z_0-9]+)["']\) \{/g;
let m;
while ((m = re.exec(entry))) marks.push({ name: m[1], start: m.index });
const blocks = {};
marks.forEach((mk, i) => { blocks[mk.name] = entry.slice(mk.start, marks[i + 1] ? marks[i + 1].start : entry.length); });
const check = ['payroll_export', 'labor_vs_estimate', 'overtime_cost_report', 'differential_hours_report', 'buddy_punch_report', 'device_usage_report', 'break_compliance_report', 'pause_reason_rollup', 'crew_view', 'list_timeclock_audit'];
for (const a of check) {
  const b = blocks[a];
  if (!b) { console.log(a, ': MISSING BLOCK'); continue; }
  console.log('==', a, '==');
  const u = underLimited(b);
  if (u.length) u.forEach(x => console.log('  FLAG:', x));
  else console.log('  clean');
}
console.log('-- whole file under-limited (excluding unique-key probes) --');
underLimited(entry).forEach(x => console.log('  ', x));

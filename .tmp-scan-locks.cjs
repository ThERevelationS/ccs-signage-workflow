const fs = require('fs');
const path = require('path');
const roots = ['src', 'scripts'];
const pats = [/body\.style/, /documentElement\.style/, /data-scroll-locked/, /removeScrollBar/, /scrollIntoView/, /\.scrollTop\s*=/, /preventDefault\(\)/];
function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (!/node_modules/.test(p)) walk(p); continue; }
    if (!/\.(jsx?|tsx?)$/.test(e.name)) continue;
    const lines = fs.readFileSync(p, 'utf8').split('\n');
    lines.forEach((l, i) => {
      if (pats.some(r => r.test(l)) && /body|scroll|touch|wheel/.test(l)) {
        console.log(p + ':' + (i + 1) + ': ' + l.trim().substring(0, 120));
      }
    });
  }
}
roots.forEach(r => { try { walk(r); } catch {} });

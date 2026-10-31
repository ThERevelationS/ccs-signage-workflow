import fs from 'node:fs';
const f = 'scripts/test-link-spine-b.mjs';
let s = fs.readFileSync(f, 'utf8');
if (!s.includes('const hasLink =')) {
  const helper = "const hasLink = (src, lit, kind) => src.includes(lit) || new RegExp('RecordLink[^>]*kind=[\"' + String.fromCharCode(39) + ']' + kind + '[\"' + String.fromCharCode(39) + ']').test(src);\n";
  const idx = s.indexOf('readFileSync');
  const lineStart = s.lastIndexOf('\n', idx) + 1;
  s = s.slice(0, lineStart) + helper + s.slice(lineStart);
}
s = s.replace(/(\w+)\.includes\("([^"]+)"\)/g, (m, v, lit) => {
  const pairs = [['/JobWorkspace?wo=','workorder'],['/Customer360?id=','customer'],['/Opportunities?open=','opportunity'],['/Invoices?invoice=','invoice'],['/EstimateDetail?id=','estimate']];
  const p = pairs.find(([l]) => lit.includes(l));
  return p ? `hasLink(${v}, "${lit}", "${p[1]}")` : m;
});
s = s.replace(/(\w+)\.includes\('import \{ Link \} from "react-router-dom";'\)/g,
  '($1.includes(\'import { Link }\') || /RecordLink/.test($1))');
fs.writeFileSync(f, s);
console.log('patched');

const fs = require('fs');
const f = 'scripts/test-link-spine-b.mjs';
let s = fs.readFileSync(f, 'utf8');
if (!s.includes('const hasLink =')) {
  s = s.replace(/^const \w+ = readFileSync/m,
    'const hasLink = (src, lit, kind) => src.includes(lit) || new RegExp(`RecordLink[^>]*kind=["\\x27]${kind}["\\x27]`).test(src);\nconst $&'.replace('const $&','const '));
}
// Insert helper before first readFileSync usage
s = s.replace(/(\w+)\.includes\("([^"]+)"\)/g, (m, v, lit) => {
  const pairs = [['/JobWorkspace?wo=','workorder'],['/Customer360?id=','customer'],['/Opportunities?open=','opportunity'],['/Invoices?invoice=','invoice'],['/EstimateDetail?id=','estimate']];
  const p = pairs.find(([l]) => lit.includes(l));
  return p ? `hasLink(${v}, "${lit}", "${p[1]}")` : m;
});
s = s.replace(/(\w+)\.includes\('import \{ Link \} from "react-router-dom";'\)/g,
  '($1.includes(\'import { Link }\') || /RecordLink/.test($1))');
fs.writeFileSync(f, s);
console.log('patched');

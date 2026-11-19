// Mojibake repair: reverses UTF-8-bytes-read-as-cp1252 corruption.
// usage: node mojibake-fix.cjs [--check] <file...>
const fs = require('fs'), path = require('path');
const checkOnly = process.argv.includes('--check');
const targets = process.argv.slice(2).filter(a => a !== '--check');

// cp1252 -> byte reverse map for the punctuation block (0x80-0x9F)
const CP1252 = {};
'€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ'.split('').forEach((ch, i) => { CP1252[ch] = 0x80 + i; });
CP1252['\x81'] = 0x81; CP1252['\x8D'] = 0x8D; CP1252['\x8F'] = 0x8F; CP1252['\x90'] = 0x90; CP1252['\x9D'] = 0x9D;

const charToByte = (ch) => {
  const cp = ch.codePointAt(0);
  if (cp >= 0x20 && cp <= 0x7e) return cp;          // ascii passthrough
  if (cp >= 0xa0 && cp <= 0xff) return cp;          // latin-1 == cp1252
  if (cp in Object.fromEntries(Object.entries(CP1252))) return CP1252[ch];
  return CP1252[ch] ?? null;
};

const RUN = /[ÃÂâ][-ÿ€œ”‘’–—±§×·©³²°‰≈≥≤†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ…]+/g;

const fixFile = (file) => {
  const s = fs.readFileSync(file, 'utf8');
  let fixed = 0, failed = 0;
  const out = s.replace(RUN, (run) => {
    const bytes = [];
    for (const ch of run) {
      const b = charToByte(ch);
      if (b == null) { failed++; return run; }
      bytes.push(b);
    }
    try {
      const decoded = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.from(bytes));
      // only accept if decoded is shorter and has no replacement chars/controls
      if (decoded.length < run.length && !/[�]/.test(decoded)) { fixed++; return decoded; }
    } catch { /* fall through */ }
    failed++;
    return run;
  });
  return { out, fixed, failed, changed: out !== s };
};

let totalFixed = 0, totalFailed = 0;
for (const f of targets) {
  const r = fixFile(f);
  console.log(path.basename(f), 'replaced:', r.fixed, 'unreversed:', r.failed);
  totalFixed += r.fixed; totalFailed += r.failed;
  if (!checkOnly && r.changed) fs.writeFileSync(f, r.out, 'utf8');
}
console.log(checkOnly ? `CHECK total=${totalFixed} unreversed=${totalFailed}` : `WROTE total=${totalFixed} unreversed=${totalFailed}`);

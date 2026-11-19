// Correct mojibake repair: reverses UTF-8 bytes mis-decoded as Windows-1252.
// Token-based: a UTF-8 lead char (C2-F4) followed by exactly the number of
// continuation chars (cp1252 byte 0x80-0xBF) its lead byte requires; strict
// UTF-8 decode; anything that does not decode stays untouched (fail closed).
const fs = require('fs');
const HI = { 0x80:'\u20AC',0x82:'\u201A',0x83:'\u0192',0x84:'\u201E',0x85:'\u2026',0x86:'\u2020',0x87:'\u2021',0x88:'\u02C6',0x89:'\u2030',0x8A:'\u0160',0x8B:'\u2039',0x8C:'\u0152',0x8E:'\u017D',0x91:'\u2018',0x92:'\u2019',0x93:'\u201C',0x94:'\u201D',0x95:'\u2022',0x96:'\u2013',0x97:'\u2014',0x98:'\u02DC',0x99:'\u2122',0x9A:'\u0161',0x9B:'\u203A',0x9C:'\u0153',0x9E:'\u017E',0x9F:'\u0178' };
const REV = new Map(Object.entries(HI).map(([b, ch]) => [ch, Number(b)]));
for (const b of [0x81, 0x8D, 0x8F, 0x90, 0x9D]) REV.set(String.fromCharCode(b), b); // C1 passthrough
const byteOf = (ch) => { const cp = ch.codePointAt(0); if (cp >= 0xA0 && cp <= 0xFF) return cp; return REV.has(ch) ? REV.get(ch) : null; };
const isCont = (b) => b != null && b >= 0x80 && b <= 0xBF;
function repair(s) {
  const chars = [...s]; let out = ''; let fixed = 0;
  for (let i = 0; i < chars.length; i++) {
    const lb = byteOf(chars[i]);
    const need = lb >= 0xC2 && lb <= 0xDF ? 1 : lb >= 0xE0 && lb <= 0xEF ? 2 : lb >= 0xF0 && lb <= 0xF4 ? 3 : 0;
    if (need) {
      const bytes = [lb];
      for (let k = 1; k <= need; k++) bytes.push(byteOf(chars[i + k] ?? ''));
      if (bytes.slice(1).every(isCont)) {
        try { out += new TextDecoder('utf-8', { fatal: true }).decode(Buffer.from(bytes)); i += need; fixed++; continue; } catch {}
      }
    }
    out += chars[i];
  }
  return { out, fixed };
}
module.exports = { repair };
if (require.main === module) {
  const check = process.argv.includes('--check');
  let total = 0;
  for (const f of process.argv.slice(2).filter(a => a !== '--check')) {
    const s = fs.readFileSync(f, 'utf8'); const r = repair(s); total += r.fixed;
    console.log(f, 'tokens fixed:', r.fixed);
    if (!check && r.out !== s) fs.writeFileSync(f, r.out, 'utf8');
  }
  console.log((check ? 'CHECK' : 'WROTE') + ' total=' + total);
}

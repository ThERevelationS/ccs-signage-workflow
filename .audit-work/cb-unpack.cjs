// usage: node cb-unpack.cjs <evaluate-result.json> <out.csv> — decodes the base64 export payload
const fs = require('fs');
const [src, out] = process.argv.slice(2);
let raw = fs.readFileSync(src, 'utf8').trim();
let v = JSON.parse(raw); if (typeof v === 'string') v = JSON.parse(v);
if (v.status !== 200) { console.log('HTTP', v.status, v.type); process.exit(1); }
const buf = Buffer.from(v.b64, 'base64');
// SSRS CSV is UTF-16LE (BOM FF FE) or UTF-8 (BOM EF BB BF)
const text = buf[0] === 0xff && buf[1] === 0xfe ? buf.slice(2).toString('utf16le') : buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf ? buf.slice(3).toString('utf8') : buf.toString('utf8');
fs.writeFileSync(out, text, 'utf8');
const lines = text.split(/\r?\n/).filter((l) => l.trim());
console.log(`bytes=${buf.length} type=${v.type} disposition=${v.disposition} lines=${lines.length}`);
console.log('HEADER:', lines[0].slice(0, 600));
console.log('ROW1  :', (lines[1] || '').slice(0, 300));

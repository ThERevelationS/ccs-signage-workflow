// Reads sandbox-read JSON on stdin, writes each file's content to <outdir>/<basename>.
// Usage: npx base44 sandbox read <path> --json | node extract.cjs <outdir>
const fs = require('fs');
const path = require('path');
const outdir = process.argv[2] || '.';
let raw = '';
process.stdin.on('data', (d) => (raw += d));
process.stdin.on('end', () => {
  let doc;
  try {
    doc = JSON.parse(raw);
  } catch (e) {
    console.error('PARSE_FAIL', e.message);
    console.error(raw.slice(0, 2000));
    process.exit(2);
  }
  if (doc.error || doc.code) {
    console.error('API_ERROR', JSON.stringify(doc).slice(0, 2000));
    process.exit(3);
  }
  const files = doc.files || [];
  for (const f of files) {
    if (f.error) {
      console.log(`FILE_ERROR ${f.path}: ${JSON.stringify(f.error)}`);
      continue;
    }
    const name = path.basename(f.path);
    const dest = path.join(outdir, name);
    fs.writeFileSync(dest, f.content);
    console.log(`WROTE ${dest} ${Buffer.byteLength(f.content)} bytes`);
  }
});

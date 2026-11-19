// Extract file content(s) from base44 sandbox read JSON output (stdout may include non-JSON noise).
const fs = require('fs');
const [,, inFile, outFile] = process.argv;
const raw = fs.readFileSync(inFile, 'utf8');
const start = raw.indexOf('{');
if (start === -1) { console.error('NO JSON FOUND in ' + inFile); process.exit(2); }
let j;
try {
  j = JSON.parse(raw.slice(start));
} catch (e) {
  // try last { ... } block
  const end = raw.lastIndexOf('}');
  j = JSON.parse(raw.slice(start, end + 1));
}
if (j.files && j.files.length) {
  const f = j.files[0];
  if (f.error) { console.error('FILE ERROR: ' + JSON.stringify(f.error)); process.exit(3); }
  if (outFile) { fs.writeFileSync(outFile, f.content); console.log('WROTE ' + outFile + ' (' + f.content.length + ' chars)'); }
  else { console.log(f.content); }
} else {
  console.log(JSON.stringify(j, null, 2).slice(0, 4000));
}

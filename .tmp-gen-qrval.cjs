const fs = require('fs');
const edits = [{
  old_text: 'console.log(`\\nFACE SCAN VALIDATOR: ${passed} checks PASS`);',
  new_text: 'test("QRScanner shows the scan reticle while scanning", () => {\n' +
    '  const src = readFileSync("src/components/timeclock/QRScanner.jsx", "utf8");\n' +
    '  assert.match(src, /scan-reticle scan-tone-scanning/);\n' +
    '  for (const cls of ["tl", "tr", "bl", "br"]) assert.match(src, new RegExp(`scan-bracket ${cls}`));\n' +
    '  assert.match(src, /scan-oval/);\n' +
    '  assert.match(src, /scan-line/);\n' +
    '  assert.match(src, /\\{isScanning && \\(/, "reticle only renders while scanning");\n' +
    '});\n\n' +
    'console.log(`\\nFACE SCAN VALIDATOR: ${passed} checks PASS`);',
}];
fs.writeFileSync('.tmp-qrval.json', JSON.stringify(edits));
console.log('ok');

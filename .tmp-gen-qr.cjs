const fs = require('fs');
const edits = [{
  old_text: '      <div \n        id="qr-reader" \n        ref={scannerRef}\n        className={`rounded-xl overflow-hidden ${isScanning ? \'block\' : \'hidden\'}`}\n        style={{ width: \'100%\', maxWidth: \'320px\', margin: \'0 auto\' }}\n      />',
  new_text: '      <div className="relative mx-auto" style={{ width: \'100%\', maxWidth: \'320px\' }}>\n' +
    '        <div \n' +
    '          id="qr-reader" \n' +
    '          ref={scannerRef}\n' +
    '          className={`rounded-xl overflow-hidden ${isScanning ? \'block\' : \'hidden\'}`}\n' +
    '        />\n' +
    '        {isScanning && (\n' +
    '          <div className="scan-reticle scan-tone-scanning">\n' +
    '            <span className="scan-bracket tl" />\n' +
    '            <span className="scan-bracket tr" />\n' +
    '            <span className="scan-bracket bl" />\n' +
    '            <span className="scan-bracket br" />\n' +
    '            <span className="scan-oval" />\n' +
    '            <span className="scan-line" />\n' +
    '          </div>\n' +
    '        )}\n' +
    '      </div>',
}];
fs.writeFileSync('.tmp-qr.json', JSON.stringify(edits));
console.log('ok');

const fs = require('fs');
const r = (JSON.parse(fs.readFileSync('.tmp-remote/qcs-v7.json', 'utf8')).content) || '';
const i = r.indexOf('!authoritativeTransition && !punchResolution && !isRecognizing && !showClockOut');
console.log('idx:', i);
console.log(JSON.stringify(r.slice(i - 60, i + 260)));
console.log('crlf:', (r.match(/\r\n/g) || []).length);

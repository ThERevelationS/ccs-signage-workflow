const fs = require('fs');
const line = '        {!authoritativeTransition && !punchResolution && !isRecognizing && !showClockOut && !(selectedUser && activeEntry) && (';
const dup = line + '\r\n\r\n' + line;
fs.writeFileSync('.tmp-fix-dup.json', JSON.stringify([{ old_text: dup, new_text: line }]));
console.log('built');

const fs = require('fs');
const t = fs.readFileSync('src/components/timeclock/QuickClockSection.jsx', 'utf8');
const lines = t.split('\n');
// The summary block is lines 1575-1614 (0-indexed 1574-1613) in the local file.
const newBlock = lines.slice(1574, 1613).join('\n');
const oldText = '        {!authoritativeTransition && !punchResolution && !isRecognizing && !showClockOut && (\n          <div className="flex flex-col items-center gap-6">';
const newText = newBlock + '\n\n        {!authoritativeTransition && !punchResolution && !isRecognizing && !showClockOut && !(selectedUser && activeEntry) && (\n          <div className="flex flex-col items-center gap-6">';
fs.writeFileSync('.tmp-edit-qcs-sum.json', JSON.stringify([{ old_text: oldText, new_text: newText }]));
console.log('built; block head:', JSON.stringify(newBlock.slice(0, 90)));

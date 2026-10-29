const fs = require('fs');
const oldText = "console.log(`Time Clock session-load fencing: ${results.length}/${results.length} scenarios pass`);";
const newText = "console.log(`PASS ${results.length}/${results.length} Time Clock session-load fencing scenarios`);";
fs.writeFileSync('.tmp-edit-slf.json', JSON.stringify([{ old_text: oldText, new_text: newText }]));
console.log('built');

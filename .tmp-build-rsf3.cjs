const fs = require('fs');
const oldText = "console.log(`Time Clock read-scope fencing: ${results.length}/${results.length} scenarios pass`);";
const newText = "console.log(`PASS ${results.length}/${results.length} Time Clock read-scope fencing scenarios`);";
fs.writeFileSync('.tmp-edit-rsf3.json', JSON.stringify([{ old_text: oldText, new_text: newText }]));
console.log('built');

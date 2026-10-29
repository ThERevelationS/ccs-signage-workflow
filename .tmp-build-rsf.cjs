const fs = require('fs');
const oldText = [
"  '@/components/ui/progress': { Progress: () => React.createElement('div') },",
"  '@/components/ui/dialog': uiDialogMocks,",
].join('\n');
const newText = [
"  '@/components/ui/progress': { Progress: () => React.createElement('div') },",
"  '@/components/ui/skeleton': { Skeleton: () => React.createElement('div') },",
"  '@/components/ui/dialog': uiDialogMocks,",
].join('\n');
fs.writeFileSync('.tmp-edit-rsf.json', JSON.stringify([{ old_text: oldText, new_text: newText }]));
console.log('built');

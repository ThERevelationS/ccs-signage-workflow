const fs = require('fs');
const oldText = [
"  '@/components/ui/skeleton': { Skeleton: () => React.createElement('div') },",
"  '@/components/ui/dialog': uiDialogMocks,",
].join('\n');
const newText = [
"  '@/components/ui/skeleton': { Skeleton: () => React.createElement('div') },",
"  '@/components/ui/list-skeleton': { ListSkeleton: () => React.createElement('div') },",
"  '@/components/workflow/NotificationService': { triggerNotification: () => {} },",
"  '@/components/ui/dialog': uiDialogMocks,",
].join('\n');
fs.writeFileSync('.tmp-edit-rsf2.json', JSON.stringify([{ old_text: oldText, new_text: newText }]));
console.log('built');

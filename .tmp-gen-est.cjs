const fs = require('fs');
const edits = [
  {
    old_text: 'import { useAuth } from "@/components/auth/EmailGate";',
    new_text: 'import { useAuth } from "@/components/auth/EmailGate";\nimport { ListSkeleton } from "@/components/ui/list-skeleton";',
  },
  {
    old_text: '        {isLoading ? (\n' +
      '          <div className="flex items-center justify-center h-64">\n' +
      '            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>\n' +
      '          </div>\n' +
      '        ) : (',
    new_text: '        {isLoading ? (\n' +
      '          <ListSkeleton rows={5} />\n' +
      '        ) : (',
  },
];
fs.writeFileSync('.tmp-est.json', JSON.stringify(edits));
console.log('ok');

const fs = require('fs');
const out = {
  '.tmp-d1.json': [
    {
      old_text: 'import { Badge } from "@/components/ui/badge";',
      new_text: 'import { Badge } from "@/components/ui/badge";\nimport { ListSkeleton } from "@/components/ui/list-skeleton";',
    },
    {
      old_text: '          <div className="py-12 flex items-center justify-center text-gray-500"><Loader2 className="w-5 h-5 animate-spin mr-2" />Loading authoritative shift history…</div>',
      new_text: '          <ListSkeleton rows={4} />',
    },
  ],
  '.tmp-d2.json': [
    {
      old_text: 'import { Badge } from "@/components/ui/badge";',
      new_text: 'import { Badge } from "@/components/ui/badge";\nimport { ListSkeleton } from "@/components/ui/list-skeleton";',
    },
    {
      old_text: '        <div className="flex items-center justify-center p-8 text-gray-500"><Loader2 className="w-5 h-5 animate-spin mr-2" />Loading audit history...</div>',
      new_text: '        <ListSkeleton rows={5} />',
    },
  ],
};
for (const [file, e] of Object.entries(out)) fs.writeFileSync(file, JSON.stringify(e));
console.log('ok');

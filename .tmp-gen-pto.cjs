const fs = require('fs');
const edits = [
  {
    old_text: '  AlertCircle,\n  Loader2\n} from "lucide-react";',
    new_text: '  AlertCircle\n} from "lucide-react";\nimport { Skeleton } from "@/components/ui/skeleton";',
  },
  {
    old_text: '  if (isLoading) {\n    return (\n      <div className="clay-card p-6 text-center">\n        <Loader2 className="w-6 h-6 animate-spin mx-auto text-gray-400" />\n      </div>\n    );\n  }',
    new_text: '  if (isLoading) {\n    return (\n      <div className="clay-card p-6">\n        <div className="space-y-3">\n          <Skeleton className="h-5 w-40" />\n          <Skeleton className="h-9 w-24" />\n          <Skeleton className="h-3 w-56" />\n        </div>\n      </div>\n    );\n  }',
  },
];
fs.writeFileSync('.tmp-pto.json', JSON.stringify(edits));
console.log('ok');

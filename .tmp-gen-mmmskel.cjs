const fs = require('fs');

const out = {
  '.tmp-mmm.json': [
    {
      old_text: 'import { useAuth } from "@/components/auth/EmailGate";',
      new_text: 'import { useAuth } from "@/components/auth/EmailGate";\nimport { ListSkeleton } from "@/components/ui/list-skeleton";\nimport { Skeleton } from "@/components/ui/skeleton";',
    },
    {
      old_text: '  if (isLoading) {\n' +
        '    return (\n' +
        '      <div className="flex items-center justify-center p-8">\n' +
        '        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />\n' +
        '      </div>\n' +
        '    );\n' +
        '  }',
      new_text: '  if (isLoading) {\n' +
        '    return (\n' +
        '      <div className="h-full overflow-auto p-6">\n' +
        '        <div className="mb-6 space-y-2">\n' +
        '          <Skeleton className="h-8 w-72" />\n' +
        '          <Skeleton className="h-4 w-96" />\n' +
        '        </div>\n' +
        '        <ListSkeleton rows={8} />\n' +
        '      </div>\n' +
        '    );\n' +
        '  }',
    },
  ],
  '.tmp-rp.json': [
    {
      old_text: 'import { useAuth } from "@/components/auth/EmailGate";',
      new_text: 'import { useAuth } from "@/components/auth/EmailGate";\nimport { ListSkeleton } from "@/components/ui/list-skeleton";\nimport { Skeleton } from "@/components/ui/skeleton";',
    },
    {
      old_text: '  if (!accessChecked || isLoading) {\n' +
        '    return (\n' +
        '      <div className="flex items-center justify-center min-h-screen">\n' +
        '        <Loader2 className="w-8 h-8 animate-spin text-purple-600" />\n' +
        '      </div>\n' +
        '    );\n' +
        '  }',
      new_text: '  if (!accessChecked || isLoading) {\n' +
        '    return (\n' +
        '      <div className="min-h-screen p-6">\n' +
        '        <div className="mb-6 space-y-2">\n' +
        '          <Skeleton className="h-8 w-64" />\n' +
        '          <Skeleton className="h-4 w-80" />\n' +
        '        </div>\n' +
        '        <ListSkeleton rows={6} />\n' +
        '      </div>\n' +
        '    );\n' +
        '  }',
    },
  ],
};

for (const [file, e] of Object.entries(out)) fs.writeFileSync(file, JSON.stringify(e));
console.log('ok');

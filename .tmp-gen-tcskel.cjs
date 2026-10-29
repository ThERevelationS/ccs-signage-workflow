const fs = require('fs');
const edits = [
  {
    old_text: 'import SceneCanvas from "@/components/motion/SceneCanvas";',
    new_text: 'import SceneCanvas from "@/components/motion/SceneCanvas";\nimport { Skeleton } from "@/components/ui/skeleton";',
  },
  {
    old_text: '  if (isLoading && allUsers.length === 0) {\n' +
      '    return (\n' +
      '      <div className="min-h-screen flex items-center justify-center">\n' +
      '        <Loader2 className="w-8 h-8 animate-spin text-purple-600" />\n' +
      '      </div>\n' +
      '    );\n' +
      '  }',
    new_text: '  if (isLoading && allUsers.length === 0) {\n' +
      '    return (\n' +
      '      <div className="min-h-screen p-4 sm:p-6 ambient-mesh">\n' +
      '        <div className="max-w-4xl mx-auto">\n' +
      '          <div className="relative mb-6 flex items-center justify-between overflow-hidden rounded-2xl px-3 py-2">\n' +
      '            <div className="flex items-center gap-3">\n' +
      '              <Skeleton className="h-12 w-12 rounded-xl" />\n' +
      '              <div className="space-y-2">\n' +
      '                <Skeleton className="h-6 w-32" />\n' +
      '                <Skeleton className="h-3 w-44" />\n' +
      '              </div>\n' +
      '            </div>\n' +
      '            <Skeleton className="h-9 w-36" />\n' +
      '          </div>\n' +
      '          <Skeleton className="mb-4 h-64 w-full rounded-2xl" />\n' +
      '          <div className="grid gap-4 sm:grid-cols-2">\n' +
      '            <Skeleton className="h-40 rounded-xl" />\n' +
      '            <Skeleton className="h-40 rounded-xl" />\n' +
      '          </div>\n' +
      '        </div>\n' +
      '      </div>\n' +
      '    );\n' +
      '  }',
  },
];
fs.writeFileSync('.tmp-tcskel.json', JSON.stringify(edits));
console.log('ok');

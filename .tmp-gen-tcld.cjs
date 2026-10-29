const fs = require('fs');
const edits = [
  {
    old_text: 'import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";',
    new_text: 'import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";\nimport FadeIn from "@/components/motion/FadeIn";',
  },
  {
    old_text: '          {error && (\n            <div className="flex items-start gap-2 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-700">\n              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />\n              <span>{error}</span>\n            </div>\n          )}',
    new_text: '          {error && (\n            <FadeIn>\n              <div className="flex items-start gap-2 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-700">\n                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />\n                <span>{error}</span>\n              </div>\n            </FadeIn>\n          )}',
  },
];
fs.writeFileSync('.tmp-tcld.json', JSON.stringify(edits));
console.log('ok');

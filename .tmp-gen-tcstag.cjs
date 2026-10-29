const fs = require('fs');
const edits = [
  {
    old_text: 'import { Skeleton } from "@/components/ui/skeleton";',
    new_text: 'import { Skeleton } from "@/components/ui/skeleton";\nimport { Stagger, StaggerItem } from "@/components/motion/Stagger";',
  },
  {
    old_text: '                {/* Time Entries List */}\n                <div className="space-y-3">',
    new_text: '                {/* Time Entries List */}\n                <Stagger className="space-y-3">',
  },
  {
    old_text: '                      return (\n                      <div key={entry.id} className="clay-card p-4">',
    new_text: '                      return (\n                      <StaggerItem key={entry.id} className="clay-card p-4">',
  },
  {
    old_text: '                      </div>\n                    );})\n                  )}\n                </div>\n              </TabsContent>',
    new_text: '                      </StaggerItem>\n                    );})\n                  )}\n                </Stagger>\n              </TabsContent>',
  },
];
fs.writeFileSync('.tmp-tcstag.json', JSON.stringify(edits));
console.log('ok');

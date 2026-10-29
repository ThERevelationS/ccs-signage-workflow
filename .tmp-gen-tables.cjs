const fs = require('fs');

function edits(importAnchor, spinnerLine, columns) {
  return [
    {
      old_text: importAnchor,
      new_text: importAnchor + '\nimport { TableSkeleton } from "@/components/ui/table-skeleton";',
    },
    {
      old_text: spinnerLine,
      new_text: '          <TableSkeleton columns={' + columns + '} />',
    },
  ];
}

const out = {
  'src/pages/Inventory.jsx': edits(
    'import { useAuth } from "@/components/auth/EmailGate";',
    '          <div className="flex items-center justify-center py-16 text-slate-500"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Loading stock…</div>',
    7,
  ),
  'src/pages/JobCosting.jsx': edits(
    'import { useAuth } from "@/components/auth/EmailGate";',
    '          <div className="flex items-center justify-center py-16 text-slate-500"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Loading job costs…</div>',
    12,
  ),
  'src/pages/PurchaseOrders.jsx': edits(
    'import { useAuth } from "@/components/auth/EmailGate";',
    '          <div className="flex items-center justify-center py-16 text-slate-500"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Loading purchase orders…</div>',
    6,
  ),
};

for (const [file, e] of Object.entries(out)) {
  fs.writeFileSync('.tmp-e-' + file.split('/').pop().replace('.jsx', '.json'), JSON.stringify(e));
}
console.log(Object.keys(out).join('\n'));

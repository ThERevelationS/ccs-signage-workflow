const fs = require('fs');
const edits = [{
  old_text: 'console.log(`\\nMOTION FOUNDATION VALIDATOR: ${passed} checks PASS`);',
  new_text: 'test("TableSkeleton primitive renders a shaped table placeholder", () => {\n' +
    '  const src = readFileSync("src/components/ui/table-skeleton.jsx", "utf8");\n' +
    '  assert.match(src, /columns = 5/);\n' +
    '  assert.match(src, /rows = 6/);\n' +
    '  assert.match(src, /<thead className="bg-slate-50 dark:bg-slate-800">/);\n' +
    '  assert.doesNotMatch(src, /animate-spin/, "skeletons must not spin");\n' +
    '});\n\n' +
    'for (const [file, cols] of [["src/pages/Inventory.jsx", 7], ["src/pages/JobCosting.jsx", 12], ["src/pages/PurchaseOrders.jsx", 6]]) {\n' +
    '  test(`${file} uses TableSkeleton for its list loader`, () => {\n' +
    '    const src = readFileSync(file, "utf8");\n' +
    '    assert.match(src, /import \\{ TableSkeleton \\} from "@\\/components\\/ui\\/table-skeleton"/);\n' +
    '    assert.match(src, new RegExp(`<TableSkeleton columns=\\\\{${cols}\\\\} />`));\n' +
    '    assert.doesNotMatch(src, /py-16 text-slate-500"><Loader2/, "first-paint list loader must not be a spinner");\n' +
    '  });\n' +
    '}\n\n' +
    'console.log(`\\nMOTION FOUNDATION VALIDATOR: ${passed} checks PASS`);',
}];
fs.writeFileSync('.tmp-tskval.json', JSON.stringify(edits));
console.log('ok');

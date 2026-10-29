const fs = require('fs');
const edits = [{
  old_text: 'for (const [file, cols] of [["src/pages/Inventory.jsx", 7], ["src/pages/JobCosting.jsx", 12], ["src/pages/PurchaseOrders.jsx", 6]]) {\n' +
    '  test(`${file} uses TableSkeleton for its list loader`, () => {\n' +
    '    const src = readFileSync(file, "utf8");\n' +
    '    assert.match(src, /import \\{ TableSkeleton \\} from "@\\/components\\/ui\\/table-skeleton"/);\n' +
    '    assert.match(src, new RegExp(`<TableSkeleton columns=\\\\{${cols}\\\\} />`));\n' +
    '    assert.doesNotMatch(src, /py-16 text-slate-500"><Loader2/, "first-paint list loader must not be a spinner");\n' +
    '  });\n' +
    '}',
  new_text: 'for (const [file, cols, gone] of [["src/pages/Inventory.jsx", 7, "Loading stock"], ["src/pages/JobCosting.jsx", 12, "Loading job costs"], ["src/pages/PurchaseOrders.jsx", 6, "Loading purchase orders"]]) {\n' +
    '  test(`${file} uses TableSkeleton for its list loader`, () => {\n' +
    '    const src = readFileSync(file, "utf8");\n' +
    '    assert.match(src, /import \\{ TableSkeleton \\} from "@\\/components\\/ui\\/table-skeleton"/);\n' +
    '    assert.match(src, new RegExp(`<TableSkeleton columns=\\\\{${cols}\\\\} />`));\n' +
    '    assert.ok(!src.includes(gone), "first-paint list loader must not be a spinner");\n' +
    '  });\n' +
    '}',
}];
fs.writeFileSync('.tmp-tskfix.json', JSON.stringify(edits));
console.log('ok');

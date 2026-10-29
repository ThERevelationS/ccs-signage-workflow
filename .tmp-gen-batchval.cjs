const fs = require('fs');
const edits = [{
  old_text: 'console.log(`\\nMOTION FOUNDATION VALIDATOR: ${passed} checks PASS`);',
  new_text: 'for (const [file, shape] of [\n' +
    '  ["src/pages/MyWorkflow.jsx", /ListSkeleton rows=\\{8\\}/],\n' +
    '  ["src/pages/Financials.jsx", /ListSkeleton rows=\\{5\\}/],\n' +
    '  ["src/pages/CompletedReports.jsx", /ListSkeleton rows=\\{6\\}/],\n' +
    '  ["src/pages/FeatureReports.jsx", /ListSkeleton rows=\\{6\\}/],\n' +
    ']) {\n' +
    '  test(`${file} renders a list skeleton while loading`, () => {\n' +
    '    const src = readFileSync(file, "utf8");\n' +
    '    assert.match(src, /import \\{ ListSkeleton \\} from "@\\/components\\/ui\\/list-skeleton"/);\n' +
    '    assert.match(src, shape);\n' +
    '  });\n' +
    '}\n\n' +
    'test("ReportingDashboard renders a dashboard skeleton while loading", () => {\n' +
    '  const src = readFileSync("src/pages/ReportingDashboard.jsx", "utf8");\n' +
    '  assert.match(src, /import \\{ Skeleton \\} from "@\\/components\\/ui\\/skeleton"/);\n' +
    '  assert.match(src, /<Skeleton className="h-72 w-full rounded-xl" \\/>/);\n' +
    '  assert.doesNotMatch(src, /min-h-96[\\s\\S]{0,120}animate-spin/, "full-page spinner must be gone");\n' +
    '});\n\n' +
    'test("ChangeOrders loaders use content-shaped skeletons", () => {\n' +
    '  const src = readFileSync("src/pages/ChangeOrders.jsx", "utf8");\n' +
    '  assert.match(src, /<ListSkeleton rows=\\{3\\} \\/>/, "dialog detail skeleton");\n' +
    '  assert.match(src, /<TableSkeleton columns=\\{6\\} \\/>/, "list table skeleton");\n' +
    '});\n\n' +
    'console.log(`\\nMOTION FOUNDATION VALIDATOR: ${passed} checks PASS`);',
}];
fs.writeFileSync('.tmp-batchval.json', JSON.stringify(edits));
console.log('ok');

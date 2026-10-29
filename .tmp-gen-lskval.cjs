const fs = require('fs');
const edits = [{
  old_text: 'console.log(`\\nMOTION FOUNDATION VALIDATOR: ${passed} checks PASS`);',
  new_text: 'test("Estimating board loading renders a card-list skeleton", () => {\n' +
    '  const src = readFileSync("src/pages/Estimating.jsx", "utf8");\n' +
    '  assert.match(src, /import \\{ ListSkeleton \\} from "@\\/components\\/ui\\/list-skeleton"/);\n' +
    '  assert.match(src, /<ListSkeleton rows=\\{5\\} \\/>/);\n' +
    '  assert.doesNotMatch(src, /animate-spin rounded-full h-12 w-12/, "board loader must not be a spinner");\n' +
    '  const skel = readFileSync("src/components/ui/list-skeleton.jsx", "utf8");\n' +
    '  assert.match(skel, /rows = 5/);\n' +
    '});\n\n' +
    'console.log(`\\nMOTION FOUNDATION VALIDATOR: ${passed} checks PASS`);',
}];
fs.writeFileSync('.tmp-lskval.json', JSON.stringify(edits));
console.log('ok');

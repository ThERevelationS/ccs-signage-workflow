const fs = require('fs');
const edits = [{
  old_text: 'console.log(`\\nMOTION FOUNDATION VALIDATOR: ${passed} checks PASS`);',
  new_text: 'test("TimeClock mount loading renders a layout skeleton, not a bare spinner", () => {\n' +
    '  const page = readFileSync("src/pages/TimeClock.jsx", "utf8");\n' +
    '  const branch = page.slice(page.indexOf("if (isLoading && allUsers.length === 0)"), page.indexOf("const shellAlreadyGuards"));\n' +
    '  assert.match(branch, /<Skeleton className="h-12 w-12 rounded-xl" \\/>/);\n' +
    '  assert.match(branch, /<Skeleton className="mb-4 h-64 w-full rounded-2xl" \\/>/);\n' +
    '  assert.match(branch, /ambient-mesh/, "the skeleton keeps the ambient backdrop");\n' +
    '  assert.doesNotMatch(branch, /animate-spin/, "no bare spinner during first paint");\n' +
    '  assert.match(page, /import \\{ Skeleton \\} from "@\\/components\\/ui\\/skeleton"/);\n' +
    '});\n\n' +
    'console.log(`\\nMOTION FOUNDATION VALIDATOR: ${passed} checks PASS`);',
}];
fs.writeFileSync('.tmp-skelval.json', JSON.stringify(edits));
console.log('ok');

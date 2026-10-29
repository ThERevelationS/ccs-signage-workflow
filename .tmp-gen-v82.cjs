const fs = require('fs');
const edits = [{
  old_text: 'console.log(`\\nMOTION FOUNDATION VALIDATOR: ${passed} checks PASS`);',
  new_text: 'test("TimeClock time-off list staggers in", () => {\n' +
    '  const src = readFileSync("src/pages/TimeClock.jsx", "utf8");\n' +
    '  const tab = src.slice(src.indexOf(\'TabsContent value="timeoff"\'), src.indexOf(\'TabsContent value="balance"\'));\n' +
    '  assert.match(tab, /<Stagger className="space-y-3">/);\n' +
    '  assert.match(tab, /<StaggerItem key=\\{request\\.id\\} className="clay-card p-4">/);\n' +
    '});\n\n' +
    'test("PTOBalanceView loading shows a card skeleton", () => {\n' +
    '  const src = readFileSync("src/components/timeclock/PTOBalanceView.jsx", "utf8");\n' +
    '  assert.match(src, /import \\{ Skeleton \\} from "@\\/components\\/ui\\/skeleton"/);\n' +
    '  assert.match(src, /<Skeleton className="h-9 w-24" \\/>/);\n' +
    '  assert.doesNotMatch(src, /animate-spin/, "PTO balance loading must not spin");\n' +
    '});\n\n' +
    'console.log(`\\nMOTION FOUNDATION VALIDATOR: ${passed} checks PASS`);',
}];
fs.writeFileSync('.tmp-v82.json', JSON.stringify(edits));
console.log('ok');

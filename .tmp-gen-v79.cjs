const fs = require('fs');
const edits = [{
  old_text: 'console.log(`\\nMOTION FOUNDATION VALIDATOR: ${passed} checks PASS`);',
  new_text: 'test("CurrentWorkCard glows while a labor segment is tracked", () => {\n' +
    '  const src = readFileSync("src/components/timeclock/CurrentWorkCard.jsx", "utf8");\n' +
    '  assert.match(src, /glow-card \\$\\{activeLabor \\? "glow-info" : ""\\}/);\n' +
    '});\n\n' +
    'test("TimeClock weekly entries list staggers in", () => {\n' +
    '  const src = readFileSync("src/pages/TimeClock.jsx", "utf8");\n' +
    '  assert.match(src, /import \\{ Stagger, StaggerItem \\} from "@\\/components\\/motion\\/Stagger"/);\n' +
    '  assert.match(src, /<Stagger className="space-y-3">/);\n' +
    '  assert.match(src, /<StaggerItem key=\\{entry\\.id\\} className="clay-card p-4">/);\n' +
    '});\n\n' +
    'test("FaceEnrollmentDialog success state animates the check", () => {\n' +
    '  const src = readFileSync("src/components/timeclock/FaceEnrollmentDialog.jsx", "utf8");\n' +
    '  assert.match(src, /success-burst/);\n' +
    '  assert.match(src, /check-draw/);\n' +
    '  assert.doesNotMatch(src, /CheckCircle2/, "static icon replaced by animated svg");\n' +
    '});\n\n' +
    'console.log(`\\nMOTION FOUNDATION VALIDATOR: ${passed} checks PASS`);',
}];
fs.writeFileSync('.tmp-v79.json', JSON.stringify(edits));
console.log('ok');

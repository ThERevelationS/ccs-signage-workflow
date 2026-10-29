const fs = require('fs');
const edits = [{
  old_text: 'console.log(`\\nMOTION FOUNDATION VALIDATOR: ${passed} checks PASS`);',
  new_text: 'for (const file of ["src/pages/MondayMorningMeeting.jsx", "src/pages/ResourcePlanning.jsx"]) {\n' +
    '  test(`${file} renders skeletons during its loading branch`, () => {\n' +
    '    const src = readFileSync(file, "utf8");\n' +
    '    assert.match(src, /import \\{ ListSkeleton \\} from "@\\/components\\/ui\\/list-skeleton"/);\n' +
    '    assert.match(src, /<ListSkeleton rows=\\{\\d+\\} \\/>/);\n' +
    '    assert.doesNotMatch(src, /min-h-screen[\\s\\S]{0,200}animate-spin/, "full-screen spinner must be gone");\n' +
    '  });\n' +
    '}\n\n' +
    'console.log(`\\nMOTION FOUNDATION VALIDATOR: ${passed} checks PASS`);',
}];
fs.writeFileSync('.tmp-rpval.json', JSON.stringify(edits));
console.log('ok');

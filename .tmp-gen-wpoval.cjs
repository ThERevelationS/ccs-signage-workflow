const fs = require('fs');
const edits = [{
  old_text: 'console.log(`\\nMOTION FOUNDATION VALIDATOR: ${passed} checks PASS`);',
  new_text: 'test("WorkPauseOverlay entrance uses motion with reduced-motion fallback", () => {\n' +
    '  const src = readFileSync("src/components/timeclock/WorkPauseOverlay.jsx", "utf8");\n' +
    '  assert.match(src, /import \\{ motion, useReducedMotion \\} from "framer-motion"/);\n' +
    '  assert.match(src, /const reduceMotion = useReducedMotion\\(\\)/);\n' +
    '  assert.match(src, /initial=\\{reduceMotion \\? false : \\{ opacity: 0 \\}\\}/, "backdrop fades in");\n' +
    '  assert.match(src, /initial=\\{reduceMotion \\? false : \\{ opacity: 0, scale: 0\\.92, y: 24 \\}\\}/, "card springs in");\n' +
    '  assert.match(src, /transition=\\{spring\\.soft\\}/);\n' +
    '});\n\n' +
    'test("TimeClockLoginDialog animates the error banner", () => {\n' +
    '  const src = readFileSync("src/components/timeclock/TimeClockLoginDialog.jsx", "utf8");\n' +
    '  assert.match(src, /import FadeIn from "@\\/components\\/motion\\/FadeIn"/);\n' +
    '  assert.match(src, /<FadeIn>/);\n' +
    '});\n\n' +
    'console.log(`\\nMOTION FOUNDATION VALIDATOR: ${passed} checks PASS`);',
}];
fs.writeFileSync('.tmp-wpoval.json', JSON.stringify(edits));
console.log('ok');

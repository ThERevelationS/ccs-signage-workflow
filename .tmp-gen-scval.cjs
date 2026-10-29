const fs = require('fs');
const edits = [{
  old_text: 'console.log(`\\nMOTION FOUNDATION VALIDATOR: ${passed} checks PASS`);',
  new_text: 'test("SceneCanvas lazy-loads three and respects motion + visibility", () => {\n' +
    '  const sc = readFileSync("src/components/motion/SceneCanvas.jsx", "utf8");\n' +
    '  assert.match(sc, /await import\\("three"\\)/, "three must load lazily inside the effect");\n' +
    '  assert.match(sc, /useReducedMotion/);\n' +
    '  assert.match(sc, /if \\(reduceMotion\\) \\{\\s*render\\(0\\)/, "reduced motion must render one static frame only");\n' +
    '  assert.match(sc, /visibilitychange/, "the RAF loop must pause on hidden tabs");\n' +
    '  assert.match(sc, /geometry\\?\\.dispose\\?\\.\\(\\)/);\n' +
    '  assert.match(sc, /renderer\\?\\.dispose\\?\\.\\(\\)/);\n' +
    '  assert.match(sc, /aria-hidden="true"/);\n' +
    '});\n\n' +
    'test("TimeClock header mounts the ambient 3D layer behind content", () => {\n' +
    '  const page = readFileSync("src/pages/TimeClock.jsx", "utf8");\n' +
    '  assert.match(page, /import SceneCanvas from "@\\/components\\/motion\\/SceneCanvas"/);\n' +
    '  assert.match(page, /<SceneCanvas className="absolute inset-0 opacity-60" \\/>/);\n' +
    '  const header = page.slice(page.indexOf("{/* Header */}"), page.indexOf("{sessionNotice"));\n' +
    '  assert.match(header, /relative flex items-center justify-between/, "header content must sit above the canvas");\n' +
    '});\n\n' +
    'console.log(`\\nMOTION FOUNDATION VALIDATOR: ${passed} checks PASS`);',
}];
fs.writeFileSync('.tmp-scval.json', JSON.stringify(edits));
console.log('ok');

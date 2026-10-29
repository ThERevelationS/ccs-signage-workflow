const fs = require('fs');
const edits = [{
  old_text: 'console.log(`\\nMOTION FOUNDATION VALIDATOR: ${passed} checks PASS`);',
  new_text: 'test("EmployeeTodayCard glows by live clock status", () => {\n' +
    '  const src = readFileSync("src/components/timeclock/EmployeeTodayCard.jsx", "utf8");\n' +
    '  assert.match(src, /hasProblem \\? "glow-danger"/);\n' +
    '  assert.match(src, /work_pause_status === "paused" \\? "glow-warning"/);\n' +
    '  assert.match(src, /break_status === "on_break" \\? "glow-warning"/);\n' +
    '  assert.match(src, /"glow-success"/);\n' +
    '  assert.match(src, /clay-card glow-card p-4 mb-6 \\$\\{cardGlow\\}/);\n' +
    '});\n\n' +
    'console.log(`\\nMOTION FOUNDATION VALIDATOR: ${passed} checks PASS`);',
}];
fs.writeFileSync('.tmp-etcval.json', JSON.stringify(edits));
console.log('ok');

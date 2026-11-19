const fs = require('fs');
const p = 'scripts/foundation-equipment-browser-fixture.mjs';
let s = fs.readFileSync(p, 'utf8');
s = s.replace(
  "  const nameInput = page.locator('input').first();\n  await nameInput.fill('UserEdited');",
  "  const durInput = page.locator('input[aria-label=\"Rental duration\"]').first();\n  await durInput.fill('2');"
);
fs.writeFileSync(p, s);
console.log('ok', s.includes('durInput'));

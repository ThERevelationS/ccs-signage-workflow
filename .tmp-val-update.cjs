const fs = require('fs');
const p = 'scripts/validate-timeclock-tracker.mjs';
let t = fs.readFileSync(p, 'utf8');
t = t.replace(
  "assert.match(backend, /display_style: \\['ring', 'bar', 'minimal', 'flip', 'roll'\\]/);",
  "assert.match(backend, /display_style: \\['ring', 'bar', 'minimal', 'flip', 'roll', 'donut', 'arc', 'badge'\\]/);"
);
t = t.replace(
  "assert.match(backend, /animation_style: \\['smooth', 'pulse', 'glow', 'breathe', 'sweep', 'none'\\]/);",
  "assert.match(backend, /animation_style: \\['smooth', 'pulse', 'glow', 'breathe', 'sweep', 'wave', 'sparkle', 'float', 'flicker', 'rainbow', 'pop', 'wobble', 'ripple', 'shake', 'gradient', 'none'\\]/);"
);
// settings labels changed — old check used the flat toggle labels.
t = t.replace(
  `check('settings expose all new controls', () => {
  for (const label of ['Hide when unfocused', 'Time Clock page only', 'Celebrate goal',
    'Blinking separator', 'Only when clocked in', 'Progressive colors', 'Custom label',
    'Reminders \\\\(minutes on clock\\\\)']) {
    assert.ok(new RegExp(label).test(settings), \`setting "\${label}" missing\`);
  }
  assert.match(settings, /set\\("device_scope"\\)/);
  assert.match(settings, /value="desktop_only"/);
  assert.match(settings, /value="mobile_only"/);
});`,
  `check('settings expose all new controls', () => {
  for (const label of ['Hide when unfocused', 'Time Clock page only', 'Celebrate goal',
    'Blinking separator', 'Only when clocked in', 'Progressive colors', 'Custom label',
    'Reminders', 'Milestones', 'Appearance', 'Motion', 'Placement & visibility']) {
    assert.ok(new RegExp(label).test(settings), \`setting "\${label}" missing\`);
  }
  assert.match(settings, /set\\("device_scope"\\)/);
  assert.match(settings, /value="desktop_only"/);
  assert.match(settings, /value="mobile_only"/);
  assert.match(settings, /type="color"/);
  assert.match(settings, /addReminder/);
  assert.match(settings, /InfoDot/);
});`);
fs.writeFileSync(p, t);
console.log('validator updated');

const fs = require('fs');
const p = 'base44/functions/timeClockAction/entry.ts';
let t = fs.readFileSync(p, 'utf8');
const reps = [];

function rep(name, oldS, newS) {
  if (!t.includes(oldS)) { console.log('MISS: ' + name); return; }
  t = t.replace(oldS, newS);
  reps.push(name);
}

// Wider enums.
rep('display_style enum',
  "  display_style: ['ring', 'bar', 'minimal', 'flip', 'roll'],",
  "  display_style: ['ring', 'bar', 'minimal', 'flip', 'roll', 'donut', 'arc', 'badge'],");
rep('animation_style enum',
  "  animation_style: ['smooth', 'pulse', 'glow', 'breathe', 'sweep', 'none'],",
  "  animation_style: ['smooth', 'pulse', 'glow', 'breathe', 'sweep', 'wave', 'sparkle', 'float', 'flicker', 'rainbow', 'pop', 'wobble', 'ripple', 'shake', 'gradient', 'none'],");
rep('background_style enum',
  "  background_style: ['glass', 'solid', 'minimal'],",
  "  background_style: ['minimal', 'glass', 'solid', 'outline', 'soft', 'accent', 'halo', 'dotted', 'striped', 'elevated', 'inset', 'neon', 'pearl', 'carbon', 'mesh', 'aurora', 'dusk', 'forest', 'ocean', 'sunset', 'berry', 'mono'],");
rep('font enum',
  "  font: ['default', 'mono', 'rounded', 'serif'],",
  "  font: ['default', 'mono', 'rounded', 'serif', 'light', 'heavy'],");

// Bool keys + editable keys: reminders objects + weekly_celebrate.
rep('bool keys',
  "'hide_when_unfocused', 'timeclock_page_only', 'goal_celebrate']",
  "'hide_when_unfocused', 'timeclock_page_only', 'goal_celebrate', 'weekly_celebrate']");
rep('editable keys',
  "'custom_label', 'alert_minutes']",
  "'custom_label', 'alert_minutes', 'reminders']");

// Hex accent support + reminders normalization + weekly_celebrate default.
rep('accent hex',
  "  out.custom_label = String(row.custom_label || '').slice(0, 24).trim();",
  "  out.custom_label = String(row.custom_label || '').slice(0, 24).trim();\n" +
  "  const rawAccent = String(row.accent_color || '');\n" +
  "  if (/^#[0-9a-fA-F]{6}$/.test(rawAccent)) out.accent_color = rawAccent.toLowerCase();\n" +
  "  const reminderSource = Array.isArray(row.reminders) ? row.reminders\n" +
  "    : (Array.isArray(row.alert_minutes) ? row.alert_minutes : []);\n" +
  "  out.reminders = reminderSource\n" +
  "    .map((r: any) => {\n" +
  "      const minutes = Math.round(Number(typeof r === 'object' && r !== null ? r.minutes : r));\n" +
  "      const label = typeof r === 'object' && r !== null ? String(r.label || '').slice(0, 60).trim() : '';\n" +
  "      return Number.isFinite(minutes) && minutes > 0 && minutes <= 1440 ? { minutes, label } : null;\n" +
  "    })\n" +
  "    .filter(Boolean)\n" +
  "    .filter((r: any, i: number, arr: any[]) => arr.findIndex((o: any) => o.minutes === r.minutes) === i)\n" +
  "    .slice(0, 12);");
rep('defaults: weekly_celebrate + reminders',
  "  alert_minutes: [],",
  "  alert_minutes: [],\n    reminders: [],\n    weekly_celebrate: true,");

fs.writeFileSync(p, t);
console.log('applied: ' + reps.join(', '));

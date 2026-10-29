const fs = require('fs');
const e = require('esbuild');

let s = fs.readFileSync('src/components/timeclock/TimeTrackerSettings.jsx', 'utf8');
const rep = (a, b) => { if (!s.includes(a)) { console.log('MISS: ' + a.slice(0, 60)); return; } s = s.replace(a, b); };

rep('  show_only_clocked_in: false,\n  progressive_colors: true,\n  blink_separator: false,',
  '  show_only_clocked_in: false,\n  progressive_colors: true,\n  blink_separator: false,\n  hide_when_unfocused: false,\n  timeclock_page_only: false,\n  goal_celebrate: true,');

rep('["blink_separator", "Blinking separator"],',
  '["blink_separator", "Blinking separator"],\n              ["hide_when_unfocused", "Hide when unfocused"],\n              ["timeclock_page_only", "Time Clock page only"],\n              ["goal_celebrate", "Celebrate goal"],');

rep('<SelectItem value="flip">Flip digits</SelectItem>',
  '<SelectItem value="flip">Flip digits</SelectItem>\n              <SelectItem value="roll">Roll digits</SelectItem>');

fs.writeFileSync('src/components/timeclock/TimeTrackerSettings.jsx', s);

let css = fs.readFileSync('src/index.css', 'utf8');
css += `
@keyframes trackerRoll {
  0% { transform: rotateX(60deg) translateY(6px); opacity: 0; }
  100% { transform: rotateX(0deg) translateY(0); opacity: 1; }
}
.tracker-roll { animation: trackerRoll 380ms cubic-bezier(0.2, 0.8, 0.3, 1); transform-origin: 50% 100%; }
@keyframes trackerCelebrate {
  0%, 100% { filter: hue-rotate(0deg) brightness(1); }
  50% { filter: hue-rotate(90deg) brightness(1.15); }
}
.tracker-celebrate { animation: trackerCelebrate 1.6s ease-in-out infinite; }
`;
css = css.replace('.tracker-sweep::after, .tracker-blink', '.tracker-sweep::after, .tracker-blink, .tracker-roll, .tracker-celebrate');
fs.writeFileSync('src/index.css', css);

e.transformSync(fs.readFileSync('src/components/timeclock/TimeTracker.jsx', 'utf8'), { loader: 'jsx' });
e.transformSync(s, { loader: 'jsx' });
e.transformSync(fs.readFileSync('base44/functions/timeClockAction/entry.ts', 'utf8'), { loader: 'ts' });
console.log('all ok');

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const comp = readFileSync(new URL('../src/components/timeclock/TimeTracker.jsx', import.meta.url), 'utf8');
const settings = readFileSync(new URL('../src/components/timeclock/TimeTrackerSettings.jsx', import.meta.url), 'utf8');
const backend = readFileSync(new URL('../base44/functions/timeClockAction/entry.ts', import.meta.url), 'utf8');
const layout = readFileSync(new URL('../src/Layout.jsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');

let pass = 0;
const check = (name, fn) => { fn(); pass++; console.log(`PASS ${name}`); };

// ---------- visibility gates ----------
check('location hidden gate', () => {
  assert.match(comp, /locationPref !== "hidden"/);
});
check('location pref matching with bar fallback', () => {
  assert.match(comp, /locationPref === "top" && position !== "side"/);
  assert.match(comp, /locationPref === "side" && position === "side"/);
  assert.match(comp, /locationPref === "top" && !hasTopBar/);
  assert.match(comp, /locationPref === "side" && !hasSideBar/);
});
check('only-when-clocked-in gate', () => {
  assert.match(comp, /prefs\?\.show_only_clocked_in === true && snapshot\?\.status !== "clocked_in"/);
});
check('unfocused-hide gate', () => {
  assert.match(comp, /prefs\?\.hide_when_unfocused === true && !focused/);
});
check('timeclock-page-only gate', () => {
  assert.match(comp, /prefs\?\.timeclock_page_only === true && !onTimeClock/);
});
check('device-scope gate', () => {
  assert.match(comp, /prefs\?\.device_scope === "desktop_only" && isMobileView/);
  assert.match(comp, /prefs\?\.device_scope === "mobile_only" && !isMobileView/);
});

// ---------- snapshot read fencing ----------
check('snapshot read is scope-fenced', () => {
  assert.match(comp, /scopeRef\.current = scopeKey/);
  assert.match(comp, /scopeRef\.current !== requestScope/);
});
check('pause/visibility events force refresh', () => {
  assert.match(comp, /ccs-timeclock-work-pause-changed/);
  assert.match(comp, /visibilitychange/);
  assert.match(comp, /ccs_work_pause_signal/);
});
check('save-refresh event listener', () => {
  assert.match(comp, /ccs:timeTrackerRefresh/);
  assert.match(settings, /dispatchEvent\(new CustomEvent\("ccs:timeTrackerRefresh", \{ detail: \{ prefs/);
  assert.match(comp, /event\?\.detail\?\.prefs/);
});

// ---------- display prefs applied ----------
check('layout-aware zoom scaling (not transform)', () => {
  assert.match(comp, /zoom: prefs\?\.scale \|\| 1/);
  assert.doesNotMatch(comp, /transform: `scale\(/);
});
check('animation targeting per element', () => {
  assert.match(comp, /const animTarget = prefs\?\.animation_target \|\| "all"/);
  assert.match(comp, /animFor\("digits"\)/);
  assert.match(comp, /animFor\("ring"\)/);
  assert.match(comp, /animFor\("icon"\)/);
});
check('element toggles gated', () => {
  assert.match(comp, /prefs\?\.show_label !== false/);
  assert.match(comp, /prefs\?\.show_icon !== false/);
  assert.match(comp, /prefs\?\.show_percent === true/);
  assert.match(comp, /prefs\?\.blink_separator === true \? "tracker-blink"/);
});
check('progressive colors opt-out', () => {
  assert.match(comp, /prefs\?\.progressive_colors === false \? accent\.ring/);
});
check('show_seconds switches formatter', () => {
  assert.match(comp, /prefs\?\.show_seconds === false/);
});
check('custom label override', () => {
  assert.match(comp, /String\(prefs\?\.custom_label \|\| ""\)\.trim\(\)/);
});
check('goal celebrate class', () => {
  assert.match(comp, /tracker-celebrate/);
  assert.match(css, /@keyframes trackerCelebrate/);
});
check('roll digits display style', () => {
  assert.match(comp, /tracker-roll/);
  assert.match(css, /@keyframes trackerRoll/);
});
check('animation css classes exist', () => {
  for (const k of ['trackerGlow', 'trackerBreathe', 'trackerSweep', 'trackerBlink']) {
    assert.match(css, new RegExp(`@keyframes ${k}`));
  }
  assert.match(css, /\.tracker-pulse/);
  assert.match(css, /\.tracker-flip/);
});

// ---------- alerts ----------
check('alert_minutes reminder effect', () => {
  assert.match(comp, /prefs\?\.alert_minutes/);
  assert.match(comp, /10000 \+ minute/);
});

// ---------- backend normalize ----------
check('backend accepts new enums', () => {
  assert.match(backend, /display_style: \['ring', 'bar', 'minimal', 'flip', 'roll'\]/);
  assert.match(backend, /animation_style: \['smooth', 'pulse', 'glow', 'breathe', 'sweep', 'none'\]/);
  assert.match(backend, /animation_target: \['all', 'digits', 'ring', 'icon'\]/);
  assert.match(backend, /device_scope: \['all', 'desktop_only', 'mobile_only'\]/);
});
check('backend editable keys include new prefs', () => {
  for (const k of ['show_label', 'show_icon', 'show_seconds', 'show_percent', 'show_only_clocked_in',
    'progressive_colors', 'blink_separator', 'hide_when_unfocused', 'timeclock_page_only', 'goal_celebrate']) {
    assert.ok(backend.includes(`'${k}'`), `bool key ${k} missing from backend`);
  }
  for (const k of ['animation_target', 'device_scope', 'custom_label', 'alert_minutes']) {
    assert.ok(backend.includes(`'${k}'`), `editable key ${k} missing from backend`);
  }
});
check('backend bool normalize preserves defaults', () => {
  assert.match(backend, /row\[key\] === undefined \? base\[key\] : row\[key\] === true/);
});
check('backend scale clamp up to 200%', () => {
  assert.match(backend, /trackerClamp\(row\.scale, 0\.5, 2, 1\)/);
});
check('backend custom_label + alert_minutes normalized', () => {
  assert.match(backend, /out\.custom_label = String\(row\.custom_label \|\| ''\)\.slice\(0, 24\)/);
  assert.match(backend, /out\.alert_minutes = \(Array\.isArray\(row\.alert_minutes\)/);
});

// ---------- settings surface ----------
check('settings defaults mirror backend', () => {
  for (const k of ['device_scope: "all"', 'custom_label: ""', 'alert_minutes: []',
    'hide_when_unfocused: false', 'timeclock_page_only: false', 'goal_celebrate: true']) {
    assert.ok(settings.includes(k), `default ${k} missing from settings card`);
  }
});
check('settings expose all new controls', () => {
  for (const label of ['Hide when unfocused', 'Time Clock page only', 'Celebrate goal',
    'Blinking separator', 'Only when clocked in', 'Progressive colors', 'Custom label',
    'Reminders \\(minutes on clock\\)']) {
    assert.ok(new RegExp(label).test(settings), `setting "${label}" missing`);
  }
  assert.match(settings, /set\("device_scope"\)/);
  assert.match(settings, /value="desktop_only"/);
  assert.match(settings, /value="mobile_only"/);
});
check('live preview driven by draft prefs', () => {
  assert.match(settings, /<TimeTrackerPreview prefs=\{p\} \/>/);
  assert.match(comp, /export function TimeTrackerPreview/);
});
check('scale slider max 200', () => {
  assert.match(settings, /min=\{50\} max=\{200\} step=\{5\}/);
});

// ---------- layout mounts ----------
check('bar-availability props on mounts', () => {
  assert.match(layout, /<TimeTracker position="top" hasTopBar hasSideBar=\{isSideNav \|\| isMobile\}/);
  assert.match(layout, /<TimeTracker position="side" hasSideBar hasTopBar=\{!isSideNav\} \/>/);
});

console.log(`\nPASS ${pass}/${pass} Time Tracker contract groups`);

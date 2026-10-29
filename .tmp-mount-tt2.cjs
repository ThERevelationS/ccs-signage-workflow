// Mount TimeTracker with an ENABLED snapshot to exercise the full render path.
const React = require('react');
const TestRenderer = require('react-test-renderer');
const { transformSync } = require('esbuild');
const vm = require('vm');
const fs = require('fs');

const snapshot = {
  status: 'clocked_in', work_minutes: 120, paid_minutes: 120, elapsed_minutes: 150,
  frozen: false, paused_now: false,
  company_day: '2026-10-27', company_now: '2026-10-27T15:00:00Z',
  server_time: '2026-10-27T15:00:00Z',
  weekly_minutes: 800, weekly_daily_minutes: [100, 120, 0, 0, 0, 0, 0],
  goal_minutes: 480,
  prefs: { tracker_enabled: true, direction: 'down', time_format: 'hh_mm_ss', daily_goal_minutes: 480, weekly_goal_minutes: 2400, location: 'both', size: 'expanded', background_style: 'minimal', accent_color: 'indigo', font: 'default', scale: 1, opacity: 1, animation_style: 'pulse', display_style: 'ring', update_interval_seconds: 60, privacy_blur: false, show_overtime: true, show_pace: true, show_projected_finish: true, show_week_strip: true, milestone_minutes: [15, 30, 60], milestone_sound: 'chime', overtime_warning: false },
};

const passthrough = (name) => ({ children }) => React.createElement('div', { 'data-mock': name }, children);
const iconModule = new Proxy({}, { get: () => () => React.createElement('svg') });
const mocks = {
  react: React,
  'react/jsx-runtime': require('react/jsx-runtime'),
  'react/jsx-dev-runtime': require('react/jsx-runtime'),
  'framer-motion': { motion: new Proxy({}, { get: () => passthrough('motion') }), useReducedMotion: () => true, AnimatePresence: passthrough('AP') },
  'lucide-react': iconModule,
  'date-fns': { format: () => 'x' },
  '@/api/base44Client': { base44: { functions: { invoke: () => Promise.resolve({ success: true, snapshot }) }, entities: new Proxy({}, { get: () => ({ filter: () => Promise.resolve([]) }) }) } },
  '@/components/auth/EmailGate': { useAuth: () => ({ currentUser: { email: 'a@b.c', full_name: 'A' }, sessionToken: 'tok' }), AuthProvider: passthrough('AuthProvider') },
  '@/components/ui/use-toast': { useToast: () => ({ toast: () => {} }) },
  '@/components/announcements/AnnouncementContext': { playSoundEffect: () => {}, AnnouncementProvider: passthrough('AP') },
  '@/components/timeclock/timeClockCompanyTime': { TIME_CLOCK_COMPANY_TIME_LABEL: 'Central', formatCompanyDateTime: (v) => String(v), formatMinutes: (v) => String(v) },
  '@/components/ui/popover': { Popover: passthrough('Popover'), PopoverTrigger: passthrough('PopoverTrigger'), PopoverContent: passthrough('PopoverContent') },
  '@/components/staff/staffEntities': { staffEntities: new Proxy({}, { get: () => new Proxy({}, { get: () => () => Promise.resolve([]) }) }) },
};
const uiFallback = new Proxy({}, { get: (_t, name) => passthrough(String(name)) });

const src = fs.readFileSync('src/components/timeclock/TimeTracker.jsx', 'utf8');
const compiled = transformSync(src, { loader: 'jsx', jsx: 'automatic', format: 'cjs', target: 'es2022' }).code;
const mod = { exports: {} };
vm.runInNewContext(compiled, {
  module: mod, exports: mod.exports,
  require: (id) => (id in mocks ? mocks[id] : id.startsWith('@/components/ui/') ? uiFallback : id.startsWith('@/') ? passthrough(id) : require(id)),
  console,
  window: { addEventListener() {}, removeEventListener() {}, sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} }, matchMedia: () => ({ matches: false, addEventListener() {} }), location: { pathname: '/' }, setInterval, clearInterval, setTimeout, clearTimeout, requestAnimationFrame: (f)=>setTimeout(f,0) },
  document: { addEventListener() {}, querySelector: () => null, querySelectorAll: () => [] },
  sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  navigator: {},
  setTimeout, clearTimeout, setInterval, clearInterval,
}, { filename: 'TimeTracker.jsx' });

const TimeTracker = mod.exports.default;
(async () => {
  const { act } = TestRenderer;
  let tree;
  await act(async () => { tree = TestRenderer.create(React.createElement(TimeTracker, { position: 'top' })); });
  await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
  console.log('MOUNTED OK — root children:', tree.toJSON() ? 'rendered' : 'null');
})().catch((e) => { console.log('CRASH:', e.message); console.log(e.stack ? e.stack.split('\n').slice(0, 6).join('\n') : ''); process.exit(1); });



// Mount TimeTracker with mocked deps to catch render crashes.
const React = require('react');
const TestRenderer = require('react-test-renderer');
const { transformSync } = require('esbuild');
const vm = require('vm');
const fs = require('fs');

const passthrough = (name) => ({ children }) => React.createElement('div', { 'data-mock': name }, children);
const iconModule = new Proxy({}, { get: () => () => React.createElement('svg') });
const uiFallback = new Proxy({}, { get: (_t, name) => passthrough(String(name)) });

const mocks = {
  react: React,
  'framer-motion': { motion: new Proxy({}, { get: () => passthrough('motion') }), useReducedMotion: () => true, AnimatePresence: passthrough('AnimatePresence') },
  'lucide-react': iconModule,
  'date-fns': { format: () => 'x', startOfWeek: (d) => d, endOfWeek: (d) => d },
  '@/api/base44Client': { base44: { functions: { invoke: () => Promise.resolve({ success: true }) }, entities: new Proxy({}, { get: () => ({ filter: () => Promise.resolve([]) }) }) } },
  '@/components/auth/EmailGate': { useAuth: () => ({ currentUser: { email: 'a@b.c', full_name: 'A' }, sessionToken: 'tok' }), AuthProvider: passthrough('AuthProvider') },
  '@/components/ui/use-toast': { useToast: () => ({ toast: () => {} }) },
  '@/components/ui/toaster': { useToast: () => ({ toast: () => {} }) },
  '@/components/timeclock/timeClockCompanyTime': new Proxy({}, { get: () => (v) => String(v) }),
  '@/components/ui/popover': { Popover: passthrough('Popover'), PopoverTrigger: passthrough('PopoverTrigger'), PopoverContent: passthrough('PopoverContent') },
};

const src = fs.readFileSync('src/components/timeclock/TimeTracker.jsx', 'utf8');
const compiled = transformSync(src, { loader: 'jsx', jsx: 'automatic', format: 'cjs', target: 'es2022' }).code;
const module = { exports: {} };
vm.runInNewContext(compiled, {
  module, exports: module.exports,
  require: (id) => (id in mocks ? mocks[id]
    : id.startsWith('@/components/ui/') ? uiFallback
    : id.startsWith('@/components/motion/') ? passthrough(id)
    : id.startsWith('@/components/') ? passthrough(id)
    : id.startsWith('@/') ? {}
    : require(id)),
  console, window: { addEventListener() {}, removeEventListener() {}, sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} }, matchMedia: () => ({ matches: false, addEventListener() {} }) },
  document: { addEventListener() {}, querySelector: () => null, querySelectorAll: () => [] },
  sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  Date, Math, Promise, Object, Number, String, Map, Set, JSON, Array, Boolean, Error,
  setTimeout: () => 1, clearTimeout: () => {}, setInterval: () => 1, clearInterval: () => {},
}, { filename: 'TimeTracker.jsx' });

const TimeTracker = module.exports.default;
(async () => {
  const { act } = TestRenderer;
  await act(async () => {
    TestRenderer.create(React.createElement(TimeTracker, { position: 'top' }));
  });
  console.log('MOUNTED OK');
})().catch((e) => { console.log('CRASH:', e.message); process.exit(1); });

const fs = require('fs');
const oldText = "    '@/components/motion/motion': { duration: { ui: 0.18 }, easing: { decelerate: [0, 0, 0.2, 1] }, spring: { soft: { type: 'spring' } } },";
const newText = [
"    '@/components/timeclock/TimeClockStatusContext': { useTimeClockStatus: () => ({ isFallback: true, version: 0, refresh: async () => null, sharedStatus: null }) },",
"    '@/lib/usePolling': { usePolling: () => {} },",
"    'framer-motion': { motion: new Proxy({}, { get: () => (props) => React.createElement('div', props, props?.children) }), useReducedMotion: () => false },",
"    'date-fns': { format: () => '' },",
"    '@/components/motion/motion': { duration: { ui: 0.18 }, easing: { decelerate: [0, 0, 0.2, 1] }, spring: { soft: { type: 'spring' } } },",
].join('\n');
fs.writeFileSync('.tmp-edit-wpo.json', JSON.stringify([{ old_text: oldText, new_text: newText }]));
console.log('built');

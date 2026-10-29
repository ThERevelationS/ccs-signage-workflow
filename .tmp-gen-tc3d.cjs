const fs = require('fs');
const edits = [
  {
    old_text: 'import QuickClockSection from "@/components/timeclock/QuickClockSection";',
    new_text: 'import QuickClockSection from "@/components/timeclock/QuickClockSection";\nimport SceneCanvas from "@/components/motion/SceneCanvas";',
  },
  {
    old_text: '        {/* Header */}\n        <div className="flex items-center justify-between mb-6">',
    new_text: '        {/* Header */}\n        <div className="relative mb-6 overflow-hidden rounded-2xl px-3 py-2">\n          <SceneCanvas className="absolute inset-0 opacity-60" />\n          <div className="relative flex items-center justify-between">',
  },
  {
    old_text: '          )}\n        </div>\n\n        {sessionNotice && (',
    new_text: '          )}\n          </div>\n        </div>\n\n        {sessionNotice && (',
  },
];
fs.writeFileSync('.tmp-tc3d.json', JSON.stringify(edits));
console.log('ok');

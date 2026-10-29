const fs = require('fs');
const edits = [
  {
    old_text: 'import SceneCanvas from "@/components/motion/SceneCanvas";\n',
    new_text: '',
  },
  {
    old_text: '        <div className="relative mb-6 overflow-hidden rounded-2xl px-3 py-2">\n' +
      '          <SceneCanvas className="absolute inset-0 opacity-60" />\n' +
      '          <div className="relative flex items-center justify-between">',
    new_text: '        <div className="mb-6 flex items-center justify-between">',
  },
  {
    old_text: '          )}\n          </div>\n        </div>\n\n        {sessionNotice && (',
    new_text: '          )}\n        </div>\n\n        {sessionNotice && (',
  },
];
fs.writeFileSync('.tmp-rmsc.json', JSON.stringify(edits));
console.log('ok');

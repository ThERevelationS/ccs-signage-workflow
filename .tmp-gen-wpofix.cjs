const fs = require('fs');
const edits = [{
  old_text: "    '@/components/ui/button': { Button },",
  new_text: "    '@/components/ui/button': { Button },\n" +
    "    '@/components/motion/motion': { duration: { ui: 0.18 }, easing: { decelerate: [0, 0, 0.2, 1] }, spring: { soft: { type: 'spring' } } },",
}];
fs.writeFileSync('.tmp-wpofix.json', JSON.stringify(edits));
console.log('ok');

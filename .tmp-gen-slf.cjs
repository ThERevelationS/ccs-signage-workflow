const fs = require('fs');
const edits = [{
  old_text: "      if (id.startsWith('@/components/motion/')) return uiFallback;",
  new_text: "      if (id.startsWith('@/components/motion/')) return {\n" +
    "        __esModule: true,\n" +
    "        default: passthrough(id),\n" +
    "        FadeIn: passthrough('FadeIn'),\n" +
    "        Stagger: passthrough('Stagger'),\n" +
    "        StaggerItem: passthrough('StaggerItem'),\n" +
    "        CountUp: passthrough('CountUp'),\n" +
    "        GlowCard: passthrough('GlowCard'),\n" +
    "      };",
}];
fs.writeFileSync('.tmp-slf.json', JSON.stringify(edits));
console.log('ok');

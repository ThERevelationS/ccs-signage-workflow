const fs = require('fs');
const edits = [
  {
    old_text: 'import { Button } from "@/components/ui/button";\nimport { Clock3, Loader2, Pause, Play, X } from "lucide-react";',
    new_text: 'import { Button } from "@/components/ui/button";\nimport { motion, useReducedMotion } from "framer-motion";\nimport { duration, easing, spring } from "@/components/motion/motion";\nimport { Clock3, Loader2, Pause, Play, X } from "lucide-react";',
  },
  {
    old_text: '  const [resumeBusy, setResumeBusy] = useState(false);',
    new_text: '  const [resumeBusy, setResumeBusy] = useState(false);\n  const reduceMotion = useReducedMotion();',
  },
  {
    old_text: '  return (\n    <div\n      className="pointer-events-auto fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-slate-950/45 p-4 backdrop-blur-[2px] sm:p-6"',
    new_text: '  return (\n    <motion.div\n      initial={reduceMotion ? false : { opacity: 0 }}\n      animate={{ opacity: 1 }}\n      transition={{ duration: duration.ui, ease: easing.decelerate }}\n      className="pointer-events-auto fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-slate-950/45 p-4 backdrop-blur-[2px] sm:p-6"',
  },
  {
    old_text: '      <div\n        className="relative w-full max-w-xl rounded-[28px] border border-purple-200 bg-white p-6 text-center shadow-2xl sm:p-9"',
    new_text: '      <motion.div\n        initial={reduceMotion ? false : { opacity: 0, scale: 0.92, y: 24 }}\n        animate={{ opacity: 1, scale: 1, y: 0 }}\n        transition={spring.soft}\n        className="relative w-full max-w-xl rounded-[28px] border border-purple-200 bg-white p-6 text-center shadow-2xl sm:p-9"',
  },
  {
    old_text: '          <span>If you ignore this reminder and keep using the app, it returns in 2 minutes.</span>\n        </div>\n      </div>\n    </div>\n  );\n}',
    new_text: '          <span>If you ignore this reminder and keep using the app, it returns in 2 minutes.</span>\n        </div>\n      </motion.div>\n    </motion.div>\n  );\n}',
  },
];
fs.writeFileSync('.tmp-wpo.json', JSON.stringify(edits));
console.log('ok');

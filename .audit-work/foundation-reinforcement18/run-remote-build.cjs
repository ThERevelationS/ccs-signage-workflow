const { spawnSync } = require('child_process');
const fs = require('fs');
const inner = "node --input-type=commonjs -e 'const p=require(\"node:path\"); require(\"esbuild\").buildSync({entryPoints:[\"src/components/estimator/estimateConversionService.js\"],bundle:true,format:\"esm\",platform:\"browser\",alias:{\"@\":p.resolve(\"src\")},outfile:\"/tmp/estimator-material-read-guard.mjs\",logLevel:\"info\"})'";
const r = spawnSync('npx.cmd', ['base44@latest','sandbox','run', inner, '--app-id','68dfcc5e57bbbc35387da97c','--branch','main','--json'], { encoding: 'buffer', windowsHide: true, shell: true });
fs.writeFileSync('.audit-work/foundation-reinforcement18/material-read-remote-build.json', r.stdout);
fs.writeFileSync('.audit-work/foundation-reinforcement18/material-read-remote-build.err', r.stderr || Buffer.alloc(0));
console.log(r.stdout.toString().slice(0, 900));

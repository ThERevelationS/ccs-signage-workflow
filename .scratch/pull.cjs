// Pull remote sandbox file(s) to .scratch/remote/<path>
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const APP = '68dfcc5e57bbbc35387da97c';
const files = process.argv.slice(2);
for (const f of files) {
  const out = execSync(
    `npx base44@latest sandbox read "${f}" --app-id ${APP} --branch main --json`,
    { cwd: path.join(__dirname, '..'), maxBuffer: 50 * 1024 * 1024 }
  ).toString();
  const i = out.indexOf('{');
  const j = JSON.parse(out.slice(i));
  const dest = path.join(__dirname, 'remote', f);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, j.files[0].content);
  console.log(`pulled ${f} -> ${dest} (${j.files[0].content.length} chars)`);
}

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
const files = [
  'src/components/admin/adminAccountDraft.js',
  'src/components/admin/accountFieldResolution.js',
  'src/components/admin/unverifiedAccountSave.js',
];
const out = execFileSync('npx', ['-y','base44@latest','sandbox','read',...files,'--app-id','68dfcc5e57bbbc35387da97c','--branch','main','--json'],{encoding:'utf8',maxBuffer:1<<24});
const i = out.indexOf('{');
const d = JSON.parse(out.slice(i));
for (const f of d.files) {
  const c = f.content || '';
  fs.writeFileSync('.tmp-remote-'+f.path.split('/').pop(), c);
  const loc = fs.readFileSync(f.path,'utf8');
  const same = loc.replace(/\r\n/g,'\n') === c.replace(/\r\n/g,'\n');
  console.log(f.path, 'remote_len', c.length, 'local_match:', same);
}

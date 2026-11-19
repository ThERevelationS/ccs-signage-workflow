const { execFileSync } = require('child_process');
const fs = require('fs');
const edits = fs.readFileSync('.audit-work/jdp-edits.json', 'utf8');
try {
  const out = execFileSync('npx.cmd', ['base44@latest', 'sandbox', 'edit', 'src/components/permitting/JurisdictionDetailPanel.jsx',
    '--app-id', '68dfcc5e57bbbc35387da97c', '--branch', 'main', '--edits-json', edits, '--json'],
    { encoding: 'utf8', stdio: ['ignore','pipe','pipe'], timeout: 180000 });
  console.log('OK', out.slice(-200));
} catch (e) { console.log('FAIL', String(e.stdout||'').slice(-200), String(e.stderr||'').slice(-400)); }

const { spawnSync } = require('child_process');
const fs = require('fs');
const edits = fs.readFileSync('.audit-work/jdp-edits.json', 'utf8');
console.log('edits bytes:', edits.length);
const r = spawnSync('npx.cmd', ['base44@latest', 'sandbox', 'edit', 'src/components/permitting/JurisdictionDetailPanel.jsx',
  '--app-id', '68dfcc5e57bbbc35387da97c', '--branch', 'main', '--edits-json', edits, '--json'],
  { encoding: 'utf8', timeout: 180000 });
console.log('rc:', r.status, 'out:', String(r.stdout || '').slice(-300), 'err:', String(r.stderr || '').slice(-300));

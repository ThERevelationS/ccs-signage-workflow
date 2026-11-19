const { execFileSync } = require('child_process');
const fs = require('fs');
const content = fs.readFileSync('src/components/permitting/JurisdictionDetailPanel.jsx', 'utf8');
for (let i = 0; i < 3; i++) {
  try {
    const out = execFileSync('npx.cmd', ['base44@latest', 'sandbox', 'write', 'src/components/permitting/JurisdictionDetailPanel.jsx',
      '--app-id', '68dfcc5e57bbbc35387da97c', '--branch', 'main', '--content', content, '--overwrite', '--json'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 180000 });
    console.log('OK attempt', i, out.slice(-200)); process.exit(0);
  } catch (e) {
    console.log('attempt', i, 'stdout:', String(e.stdout || '').slice(-200), 'stderr:', String(e.stderr || '').slice(-400));
  }
}
process.exit(1);

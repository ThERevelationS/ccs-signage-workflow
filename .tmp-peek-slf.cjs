const fs = require('fs');
const t = fs.readFileSync('scripts/validate-timeclock-session-load-fencing.mjs', 'utf8');
const lines = t.split('\n');
lines.forEach((l, i) => {
  if (l.includes('@/') || /loadComponent|requireMocks|mocks\[|extraMocks/.test(l)) {
    console.log((i + 1) + ': ' + l.trim().substring(0, 140));
  }
});

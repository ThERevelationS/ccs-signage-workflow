// Strip oversized public-copied dirs from dist/ before `site deploy`.
// Base44 site deploy has a ~50MB archive cap; Vite copies ALL of public/ into
// dist/, and the evidence/photo blob dirs below push the archive over the cap
// (169MB observed → partial upload → published HTML referencing missing assets
// → blank production site on 2026-10-31).
// These files remain in public/ for local dev, and previously-uploaded copies
// continue serving from Base44's retained asset store in production.
// Run: node scripts/strip-site-deploy-assets.mjs   (after vite build)

import { existsSync, rmSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const DIST = 'dist';
const STRIP_DIRS = ['permitting-evidence', 'fleet-assets'];
const CAP_WARN_MB = 50;

const dirSizeMB = (dir) => {
  let bytes = 0;
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else bytes += statSync(p).size;
    }
  };
  walk(dir);
  return bytes / (1024 * 1024);
};

if (!existsSync(DIST)) {
  console.error('dist/ not found — run vite build first');
  process.exit(1);
}

for (const name of STRIP_DIRS) {
  const p = join(DIST, name);
  if (existsSync(p)) {
    rmSync(p, { recursive: true, force: true });
    console.log(`stripped dist/${name}`);
  }
}

const total = dirSizeMB(DIST);
console.log(`dist/ size: ${total.toFixed(1)}MB`);
if (total > CAP_WARN_MB) {
  console.error(`WARNING: dist/ still exceeds ${CAP_WARN_MB}MB deploy cap — site deploy will fail`);
  process.exit(2);
}

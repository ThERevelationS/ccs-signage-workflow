// probe: why doesn't the reload click arm reads on p2
const { execSync, spawn } = require('child_process');
// reuse the fixture's own server/bundle by launching it, then probing with playwright
const cp = spawn('node', ['scripts/foundation-material-browser-fixture.mjs'], { stdio: 'inherit' });
setTimeout(() => process.exit(0), 60000);

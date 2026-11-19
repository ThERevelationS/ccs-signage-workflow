const fs = require('fs');
let p = '.audit-work/foundation-navigation15-fx.cjs';
let s = fs.readFileSync(p, 'utf8');
s = s.replace("fs.mkdirSync(OUT, { recursive: true }); s = s; // OUT set below via literal\n", '');
s = s.replace(`  const page = await ctx.newPage({ viewport: { width: 1280, height: 800 } }).catch(() => ctx.newPage());
  await ctx.newPage();
  await ctx.pages()[1].close();
  const page2 = ctx.pages()[0];`,
`  const page2 = await ctx.newPage();`);
fs.writeFileSync(p, s);
console.log('fx fixed');

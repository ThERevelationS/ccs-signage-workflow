const fs = require("fs");
const strip = (s) => (s.charCodeAt(0) === 0xfeff ? s.slice(1) : s);
const j = JSON.parse(strip(fs.readFileSync(process.argv[2], "utf8"))).files[0].content;
const i = j.indexOf('"rls"');
console.log(j.slice(i, i + 1400));

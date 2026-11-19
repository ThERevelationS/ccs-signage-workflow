import {readFileSync,writeFileSync} from 'node:fs';
const raw=readFileSync(process.argv[2],'utf8');
const j=JSON.parse(raw.slice(raw.indexOf('{')));
writeFileSync(process.argv[3],j.files[0].content);

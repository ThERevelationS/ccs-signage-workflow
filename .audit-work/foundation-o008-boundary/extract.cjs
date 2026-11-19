const fs=require('fs');
const [,,rawFile,p,out]=process.argv;
const raw=fs.readFileSync(rawFile,'utf8');
const start=raw.indexOf('{');
try{
  const j=JSON.parse(raw.slice(start));
  const f=(j.files||[]).find(f=>f.path===p)||j.files[0];
  if(!f||typeof f.content!=='string'){console.error('FAIL-NOCONTENT',p);process.exit(1);}
  fs.writeFileSync(out,f.content);
  console.log('OK',p,f.content.length,'bytes');
}catch(e){console.error('FAIL-PARSE',p,e.message);process.exit(1);}

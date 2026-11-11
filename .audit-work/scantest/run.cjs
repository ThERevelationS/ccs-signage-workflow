const fs=require('fs'),path=require('path');
const NAMES=['project','items','calc','inventory','walls','poles','totals','delivery','cabinets','options','pricing','history','estimate','record','settings','catalog','line','source','data','patch','prev','next','row','item'];
function declared(src,name){
  const pats=[
    new RegExp(String.raw`\b(?:const|let|var|function)\s+`+name+String.raw`\b`),
    new RegExp(String.raw`\b`+name+String.raw`\s*=>`),
    new RegExp(String.raw`[({[,]\s*`+name+String.raw`\s*[,})=:\]]`),
    new RegExp(String.raw`import\s*\{[^}]*\b`+name+String.raw`\b`),
  ];
  return pats.some(r=>r.test(src));
}
function scanDir(dir){
  for(const f of fs.readdirSync(dir,{withFileTypes:true})){
    const p=path.join(dir,f.name);
    if(f.isDirectory()){scanDir(p);continue;}
    if(!/\.(jsx|js)$/.test(f.name))continue;
    const src=fs.readFileSync(p,'utf8');
    const fns=[...src.matchAll(/function (\w+)\s*\(\s*\{([^{}]*)\}/g)];
    for(const m of fns){
      const props=new Set(m[2].split(',').map(s=>s.trim().split(/[=:.\s]/)[0].trim()).filter(Boolean));
      const body=src.slice(m.index+m[0].length);
      for(const name of NAMES){
        if(props.has(name))continue;
        if(new RegExp(String.raw`(?<=^|[^.A-Za-z_$])`+name+String.raw`\?*\.[a-zA-Z_$]`).test(body)&&!declared(src,name))
          console.log(p,'::',m[1],'-> undeclared:',name);
      }
    }
  }
}
scanDir(process.argv[2]||'src/components/estimator');

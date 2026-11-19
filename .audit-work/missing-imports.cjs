const fs=require('fs'),path=require('path');
const exts=['','.js','.jsx','.ts','.tsx','/index.js','/index.jsx'];
const missing=new Map();
const scan=(dir)=>{
  for(const f of fs.readdirSync(dir,{withFileTypes:true})){
    const p=path.join(dir,f.name);
    if(f.isDirectory()){scan(p);continue}
    if(!/\.(jsx?|tsx?)$/.test(f.name))continue;
    const t=fs.readFileSync(p,'utf8');
    for(const m of t.matchAll(/(?:from|import)\s*\(?\s*['"](@\/[^'"]+|\.\.?\/[^'"]+)['"]/g)){
      const spec=m[1];
      const resolved = spec.startsWith('@/') ? spec.slice(2)
        : path.relative('src', path.join(path.dirname(p),spec)).split(path.sep).join('/');
      const full='src/'+resolved;
      if(exts.some(e=>fs.existsSync(full+e)))continue;
      if(!missing.has(spec)) missing.set(spec,[]);
      missing.get(spec).push(p);
    }
  }
};
scan('src');
console.log('missing imports:',missing.size);
for(const [k,v] of [...missing].slice(0,40)) console.log(' ',k,'<-',v.slice(0,2).join(','));

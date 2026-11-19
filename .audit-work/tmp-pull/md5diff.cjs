const fs=require('fs'),crypto=require('crypto');
const remote={};
for(const l of fs.readFileSync('.audit-work/tmp-pull/remote-md5-norm.txt','utf8').split('\n')){
  const m=l.trim().match(/^([0-9a-f]+)\s+(.+)$/);
  if(m&&m[2].startsWith('./')) remote['src/components/estimator/'+m[2].slice(2)]=m[1];
}
const norm=s=>s.replace(/\r/g,'').replace(/\n+$/,'');
const drift=[];
const walk=d=>{for(const f of fs.readdirSync(d)){const p=d+'/'+f;if(fs.statSync(p).isDirectory())walk(p);else{
  if(remote[p]===undefined) continue;
  const h=crypto.createHash('md5').update(norm(fs.readFileSync(p,'utf8'))).digest('hex');
  if(remote[p]!==h) drift.push(p);
}}};
walk('src/components/estimator');
console.log('content-drifted:',drift.length);
drift.forEach(f=>console.log(' -',f));

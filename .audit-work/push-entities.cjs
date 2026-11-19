const {spawnSync}=require('child_process');const fs=require('fs');
for(const f of ['SignageFact','SignageFactIndex']){
  const c=fs.readFileSync('base44/entities/'+f+'.jsonc','utf8');
  let done=false;
  for(let a=0;a<3&&!done;a++){
    const r=spawnSync('npx',['base44@latest','sandbox','write','base44/entities/'+f+'.jsonc','--app-id','68dfcc5e57bbbc35387da97c','--branch','main','--json'],{input:c,encoding:'utf8',timeout:60000,shell:true});
    const out=(r.stdout||'')+(r.stderr||'');
    done=/checkpoint|success|written|created/i.test(out)&&!/Error|Failed/i.test(out);
    if(!done)console.log(f,'attempt',a+1,out.slice(-180));
  }
  console.log(f,done?'WROTE':'FAILED');
}

const {spawnSync}=require('child_process');const fs=require('fs');
for(const f of ['src/components/permitting/JurisdictionDetailPanel.jsx','src/pages/Customer360.jsx','src/App.jsx']){
  const c=fs.readFileSync(f,'utf8');
  const r=spawnSync('npx',['base44@latest','sandbox','write',f,'--app-id','68dfcc5e57bbbc35387da97c','--branch','main','--json','--overwrite'],{input:c,encoding:'utf8',timeout:60000,shell:true});
  const out=(r.stdout||'')+(r.stderr||'');
  console.log(f,/success|written|checkpoint/i.test(out)&&!/Error|Failed/i.test(out)?'WROTE':'? '+out.slice(-120));
}

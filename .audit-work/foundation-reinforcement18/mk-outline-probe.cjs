const fs=require('fs'),path=require('path'),esbuild=require('esbuild');
const DIR='.audit-work/foundation-reinforcement18/';
const art=JSON.parse(fs.readFileSync(DIR+'masonry-outline-continuation-source.json','utf8'));
const sources=new Map();
for(const a of ["wall-cap-geometry-remote-validation.json","masonry-material-pole-source.json","masonry-page-dependency-source.json","masonry-rates-panel-source.json"])for(const f of JSON.parse(fs.readFileSync(DIR+a,"utf8")).files)sources.set("/app/"+f.path,f.content);
for(const f of art.files)sources.set("/app/"+f.path,f.normalized??f.text);
sources.set('/app/src/components/estimator/foundation/wallCalculator.js',fs.readFileSync(DIR+'masonry-outline-candidate-wallCalculator.js','utf8'));
sources.set('/app/probe.js','export { calcProject } from "/app/src/components/estimator/foundation/foundationCalc.js";');
const plug={name:'f',setup(b){b.onResolve({filter:/.*/},a=>{let base;if(a.path.startsWith('/app/'))base=a.path;else if(a.path.startsWith('@/'))base='/app/src/'+a.path.slice(2);else if(a.path.startsWith('.')){if(!a.importer.startsWith('/app'))return null;base=path.posix.resolve(path.posix.dirname(a.importer),a.path);}else return null;if(sources.has(base))return{path:base,namespace:'f'};if(sources.has(base+'.js'))return{path:base+'.js',namespace:'f'};if(sources.has(base+'.jsx'))return{path:base+'.jsx',namespace:'f'};throw new Error('missing '+a.path);});b.onLoad({filter:/.*/,namespace:'f'},a=>({contents:sources.get(a.path),loader:'jsx'}));}};
esbuild.build({entryPoints:[DIR+'_probe-entry.js'],bundle:true,format:'cjs',platform:'node',outfile:DIR+'_probe-bundle.cjs',plugins:[plug]}).then(()=>{
const {calcProject}=require(process.cwd()+'/.audit-work/foundation-reinforcement18/_probe-bundle.cjs');
const seed=JSON.parse(fs.readFileSync(DIR+'masonry-pricing-baseline-probe.json','utf8')).fixture;
const clone=o=>JSON.parse(JSON.stringify(o));
const base={id:'synthetic-masonry-project',updated_date:'synthetic-v1',project_name:'P',items:[],poles:[],wall_caps:[],selected_equipment:[],signage_cabinets:[],walls:clone(seed.project.walls),landscape:{cell_size_inches:12,cells:{}},customer_pricing:{applied:false}};
const modes={
'valid-string':p=>{p.walls[0].shape={...p.walls[0].shape,segments:p.walls[0].shape.segments.map(s=>({...s,length:String(s.length)}))}},
'empty-acknowledged':p=>{p.walls[0].shape={points:[],closed:false,segments:[]}},
'points-mismatch':p=>{p.walls[0].shape={points:[{x:0,z:0},{x:8,z:0},{x:8,z:8},{x:0,z:8}],closed:true,segments:[{length:8},{length:8},{length:8},{length:8},{length:9}]}},
'malformed-points':p=>{p.walls[0].shape={points:[{x:0,z:0},{x:NaN,z:0}],closed:false,segments:[{length:16}]}},
'new-unknown':p=>{p.walls=[{...clone(p.walls[0]),component_id:'masonry-new-outline',shape:{points:[],closed:false,segments:[]},calculatedCosts:{totalBricks:6,materialCost:12,mortarCost:0,laborCost:45,totalCost:57}}]},
'legacy-lengths-only':p=>{},
};
const out={};
for(const[id,mut]of Object.entries(modes)){
  const p=clone(base);mut(p);
  const saved=clone(base);
  const c=calcProject(p,clone(seed.inventory),clone(seed.settings),{savedProject:saved});
  out[id]={costs:c.walls[0]?.calculatedCosts??null,total:c.totals.grand_total,pricingUnavailable:!!c.catalogIssues.length,issues:c.catalogIssues.map(i=>i.code)};
}
console.log(JSON.stringify(out,null,1));
});

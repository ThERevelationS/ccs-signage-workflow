const fs=require('fs'),path=require('path'),esbuild=require('esbuild');
const DIR='.audit-work/foundation-reinforcement18/';
const art=JSON.parse(fs.readFileSync(DIR+'masonry-outline-continuation-source.json','utf8'));
const sources=new Map();
for(const f of art.files)sources.set('/app/'+f.path,f.normalized??f.text);
sources.set('/app/src/components/estimator/foundation/wallCalculator.js',fs.readFileSync(DIR+'masonry-outline-candidate-wallCalculator.js','utf8'));
sources.set('/app/src/components/estimator/foundation/WallShapeEditor.jsx',fs.readFileSync(DIR+'masonry-outline-candidate-WallShapeEditor.jsx','utf8'));
sources.set('/app/src/components/ui/button.jsx','export const Button=(p)=>p;');
sources.set('/app/src/components/ui/input.jsx','export const Input=(p)=>p;');
sources.set('/app/entry.js','import WallShapeEditor from "/app/src/components/estimator/foundation/WallShapeEditor.jsx"; export { WallShapeEditor };');
const plug={name:'f',setup(b){b.onResolve({filter:/.*/},a=>{let base;if(a.path.startsWith('/app/'))base=a.path;else if(a.path.startsWith('@/'))base='/app/src/'+a.path.slice(2);else if(a.path.startsWith('.')){if(!a.importer.startsWith('/app'))return null;base=path.posix.resolve(path.posix.dirname(a.importer),a.path);}else return null;for(const c of [base,base+'.js',base+'.jsx'])if(sources.has(c))return{path:c,namespace:'f'};throw new Error('missing '+a.path+' from '+a.importer);});b.onLoad({filter:/.*/,namespace:'f'},a=>({contents:sources.get(a.path),loader:'jsx',resolveDir:process.cwd()}));}};
esbuild.build({entryPoints:[DIR.replace(/\/$/,'')+'/entry-not-used.js'].length?[DIR+'_ed-entry.js']:[],bundle:true,format:'cjs',platform:'node',outfile:DIR+'_ed-bundle.cjs',plugins:[plug]}).then(()=>{
const {WallShapeEditor}=require(process.cwd()+'/.audit-work/foundation-reinforcement18/_ed-bundle.cjs');
const React=require('react'),TR=require('react-test-renderer');
let last=null;
TR.act(()=>{TR.create(React.createElement(WallShapeEditor,{shape:{closed:false,segments:[{length:16}]},onChange:(s)=>{last=s}}))});
console.log('mounted OK');
}).catch(e=>{console.log('ERR',e.message.slice(0,300))});

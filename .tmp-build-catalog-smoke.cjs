const esbuild=require('esbuild');
const path=require('path');
esbuild.build({
  entryPoints:['/tmp/catalog-smoke-entry.mjs'],
  outfile:'/tmp/catalog-smoke-bundle.mjs',
  bundle:true,
  format:'esm',
  platform:'node',
  target:'node20',
  plugins:[{
    name:'app-alias',
    setup(build){
      build.onResolve({filter:/^@\/api\/base44Client$/},()=>({path:'/tmp/mock-base44.mjs'}));
      build.onResolve({filter:/^@\//},args=>({path:path.join('/app/src',args.path.slice(2))}));
    }
  }]
}).catch(e=>{console.error(e);process.exit(1)});

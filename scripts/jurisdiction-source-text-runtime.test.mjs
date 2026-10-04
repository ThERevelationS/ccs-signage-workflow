import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {spawnSync} from 'node:child_process';
test('bundled text runtime works without a relative pdf.worker.mjs file',async()=>{
 const result=await build({entryPoints:['base44/shared/jurisdictionSourceTextRuntime.ts'],bundle:true,write:false,format:'esm',platform:'node',plugins:[{name:'npm-runtime',setup(b){
  b.onResolve({filter:/^npm:pdfjs-dist@4\.8\.69\//},args=>({path:args.path.replace('npm:pdfjs-dist@4.8.69/','pdfjs-dist/'),external:true}));
 }}]});
 const script=result.outputFiles[0].text+`
import {GlobalWorkerOptions} from 'pdfjs-dist/legacy/build/pdf.mjs';
import {jsPDF} from 'jspdf';
import {createHash} from 'node:crypto';
const pdf=new jsPDF();pdf.text('Retained official source text for worker regression.',20,20);
const bytes=new Uint8Array(pdf.output('arraybuffer'));
globalThis.Deno={resolveDns:async()=>['93.184.216.34']};
let reads=0;globalThis.fetch=async()=>{reads++;return new Response(bytes);};
GlobalWorkerOptions.workerSrc='deliberately-missing-worker.mjs';
const source={id:'s',archived_file_url:'https://storage.example/a.pdf',file_hash_sha256:createHash('sha256').update(bytes).digest('hex'),file_bytes:bytes.length};
const chunk=await readAndExtractSourcePdf({source,startPage:1});
console.log(JSON.stringify({ok:chunk.pages[0].text.includes('worker regression'),pages:chunk.total_pages,reads,preloaded:!!globalThis.pdfjsWorker?.WorkerMessageHandler}));
`;
 const child=spawnSync(process.execPath,['--input-type=module','--eval',script],{encoding:'utf8',timeout:20000});
 assert.equal(child.status,0,child.stderr);
 const line=child.stdout.split('\n').find(l=>l.startsWith('{"ok"'));assert.ok(line,child.stdout);
 assert.deepEqual(JSON.parse(line),{ok:true,pages:1,reads:1,preloaded:true});
});

import assert from 'node:assert/strict';
import {mkdtemp,writeFile,symlink,copyFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createServer} from 'vite';
import react from '@vitejs/plugin-react';
const {chromium}=await import('/tmp/sips-browser-check/node_modules/playwright/index.mjs');
const root=process.cwd(),scratch=await mkdtemp(path.join(tmpdir(),'electrical-inquiry-'));
let vite,browser;const checks=[];
try {
 await symlink(path.join(root,'node_modules'),path.join(scratch,'node_modules'),'dir');
 const css=(await readdir(path.join(root,'dist/assets'))).find(n=>n.endsWith('.css'));
 await copyFile(path.join(root,'dist/assets',css),path.join(scratch,'styles.css'));
 await copyFile(path.join(root,'docs/official-evidence/ohio-sharonville-2026-10-07/electrical-identity-comparison-fixture-2026-10-18.json'),path.join(scratch,'fixture.json'));
 await writeFile(path.join(scratch,'index.html'),'<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"></head><body><div id="root"></div><script type="module" src="/main.jsx"></script></body></html>');
 await writeFile(path.join(scratch,'main.jsx'),[
  "import React,{useState} from 'react';import {createRoot} from 'react-dom/client';import initial from './fixture.json';",
  "import Panel from "+JSON.stringify('/@fs'+root+'/src/components/permitting/OfficeResearchFindings.jsx')+";",
  "window.saves=[];function App(){const [research,setResearch]=useState(initial);window.current=research;return <main className='max-w-5xl mx-auto p-3'><button className='min-h-11' onClick={()=>{const next=structuredClone(initial);next.roles.find(r=>r.role==='electrical_permit').office_name='Changed candidate';setResearch(next);}}>Change fixture</button><Panel research={research} onSave={async next=>window.saves.push(next)}/></main>}createRoot(document.getElementById('root')).render(<App/>);"
 ].join('\n'));
 vite=await createServer({configFile:false,root:scratch,plugins:[react()],resolve:{alias:{'@':path.join(root,'src')}},server:{host:'127.0.0.1',port:0,fs:{allow:[root,scratch]}},logLevel:'error'});
 await vite.listen();const origin='http://127.0.0.1:'+vite.httpServer.address().port;
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 for(const width of [320,390,1280]){
  const page=await browser.newPage({viewport:{width,height:1000}}),errors=[],outside=[];
  page.setDefaultTimeout(8000);page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{if(window.denyCopy)throw Error('denied');window.copied=text;}}}));
  await page.route('**/*',route=>{const url=route.request().url();if(url.startsWith('http')&&!url.startsWith(origin)){outside.push(url);return route.abort();}return route.continue();});
  await page.goto(origin,{waitUntil:'networkidle'});
  const permit=page.getByRole('region',{name:'Office inquiry: electrical_permit',exact:true});
  const inspection=page.getByRole('region',{name:'Office inquiry: electrical_inspection',exact:true});
  await permit.getByRole('button',{name:'Prepare permit issuer inquiry',exact:true}).click();
  const permitText=permit.getByRole('textbox',{name:'Questions for the permit issuer',exact:true});
  assert.match(await permitText.inputValue(),/distinguish issuance from intake and inspections/);
  await permit.getByRole('button',{name:'Copy inquiry',exact:true}).click();
  await permit.getByText(/Inquiry copied/).waitFor();
  assert.equal(await page.evaluate(()=>window.copied),await permitText.inputValue());
  await inspection.getByRole('button',{name:'Prepare inspection provider inquiry',exact:true}).click();
  const inspectionText=inspection.getByRole('textbox',{name:'Questions for the inspection provider',exact:true});
  assert.match(await inspectionText.inputValue(),/contract or delegation/);
  assert.notEqual(await inspectionText.inputValue(),await permitText.inputValue());
  await page.evaluate(()=>{window.denyCopy=true;});
  await inspection.getByRole('button',{name:'Copy inquiry',exact:true}).click();
  await inspection.getByText(/Copy is unavailable/).waitFor();
  assert.ok(await inspectionText.evaluate(node=>node===document.activeElement&&node.selectionStart===0&&node.selectionEnd===node.value.length));
  await permit.getByRole('button',{name:'Select inquiry text',exact:true}).focus();await page.keyboard.press('Enter');
  assert.ok(await permitText.evaluate(node=>node===document.activeElement&&node.selectionEnd===node.value.length));
  for(const control of await page.locator('[aria-label^="Office inquiry:"] button').all())assert.ok((await control.boundingBox()).height>=44);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  if(width===390)await permit.screenshot({path:'/tmp/permitting-electrical-inquiry-390.png'});
  await page.getByRole('button',{name:'Change fixture',exact:true}).click();
  assert.match(await permitText.inputValue(),/Changed candidate/);
  assert.equal(await permit.getByText(/Inquiry copied/).count(),0);
  assert.equal(await page.evaluate(()=>window.saves.length),0);
  assert.deepEqual(errors,[]);assert.deepEqual(outside,[]);
  checks.push({width,passed:true,separate_roles:true,copy:true,manual_copy_fallback:true,keyboard_selection:true,updated_draft:true,no_overflow:true,no_external_requests:true,no_saves:true});
  await page.close();
 }
 await writeFile('docs/permitting-electrical-inquiry-browser-2026-10-18.json',JSON.stringify({status:'passed',checks,synthetic_only:true,employee_acceptance:false},null,2)+'\n');
 console.log(JSON.stringify({status:'passed',widths:checks.map(x=>x.width),external_requests:0,production_writes:0}));
}finally{await browser?.close();await vite?.close();await rm(scratch,{recursive:true,force:true});}

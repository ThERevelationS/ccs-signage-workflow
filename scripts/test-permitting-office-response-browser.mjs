import assert from 'node:assert/strict';
import {mkdtemp,writeFile,symlink,copyFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createServer} from 'vite';
import react from '@vitejs/plugin-react';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || '/tmp/permitting-inquiry-browser/node_modules/playwright/index.mjs');
const root=process.cwd(),scratch=await mkdtemp(path.join(tmpdir(),'office-responses-'));
let vite,browser;const checks=[];
try{
 await symlink(path.join(root,'node_modules'),path.join(scratch,'node_modules'),'dir');
 const css=(await readdir(path.join(root,'dist/assets'))).find(n=>n.endsWith('.css'));
 await copyFile(path.join(root,'dist/assets',css),path.join(scratch,'styles.css'));
 await copyFile(path.join(root,'docs/official-evidence/ohio-sharonville-2026-10-07/electrical-identity-comparison-fixture-2026-10-18.json'),path.join(scratch,'fixture.json'));
 await writeFile(path.join(scratch,'index.html'),'<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"></head><body><div id="root"></div><script type="module" src="/main.jsx"></script></body></html>');
 await writeFile(path.join(scratch,'main.jsx'),[
  "import React,{useState} from 'react';import {createRoot} from 'react-dom/client';import initial from './fixture.json';",
  "import Panel from "+JSON.stringify('/@fs'+root+'/src/components/permitting/OfficeResearchFindings.jsx')+";",
  "window.attempts=[];window.saves=[];window.failNext=true;window.original=JSON.stringify(initial);function App(){const [research,setResearch]=useState(initial),[editable,setEditable]=useState(true);window.current=research;return <main className='max-w-5xl mx-auto p-3'><button className='min-h-11' onClick={()=>setEditable(false)}>Read-only fixture</button><Panel research={research} canEdit={editable} actor='Synthetic staff' onSave={async next=>{window.attempts.push(next);if(window.failNext){window.failNext=false;throw Error('Synthetic interrupted response');}window.saves.push(next);setResearch(next);return {office_research:next};}}/></main>}createRoot(document.getElementById('root')).render(<App/>);"
 ].join('\n'));
 vite=await createServer({configFile:false,root:scratch,plugins:[react()],resolve:{alias:{'@':path.join(root,'src')}},server:{host:'127.0.0.1',port:0,fs:{allow:[root,scratch]}},logLevel:'error'});
 await vite.listen();const origin='http://127.0.0.1:'+vite.httpServer.address().port;
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 for(const width of [320,390,1280]){
  const page=await browser.newPage({viewport:{width,height:1000}}),errors=[],outside=[];
  page.setDefaultTimeout(8000);page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>{const url=route.request().url();if(url.startsWith('http')&&!url.startsWith(origin)){outside.push(url);return route.abort();}return route.continue();});
  await page.goto(origin,{waitUntil:'networkidle'});
  const permit=page.getByRole('region',{name:'Office responses: electrical_permit',exact:true});
  const inspector=page.getByRole('region',{name:'Office responses: electrical_inspection',exact:true});
  const fill=async(region,office,quote)=>{
   await region.getByLabel('Responding office',{exact:true}).fill(office);
   await region.getByLabel('Response date',{exact:true}).fill('2026-10-18');
   await region.getByLabel('Source reference (email, call or official page)',{exact:true}).fill('Synthetic fixture — no real office statement');
   await region.getByLabel('Exact response quote',{exact:true}).fill(quote);
  };
  await permit.getByRole('button',{name:'Record permit issuer response',exact:true}).click();
  await fill(permit,'Synthetic issuer','Synthetic permit reply only.');
  await permit.getByLabel('Commercial sign scope reported by office',{exact:true}).selectOption('claims_applies');
  assert.equal(await page.evaluate(()=>window.attempts.length),0);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Open response form overflow');
  await permit.getByRole('button',{name:'Save unverified response',exact:true}).evaluate(node=>{node.click();node.click();});
  await permit.getByRole('alert').getByText('Synthetic interrupted response',{exact:true}).waitFor();
  assert.equal(await permit.getByLabel('Exact response quote',{exact:true}).inputValue(),'Synthetic permit reply only.');
  assert.equal(await page.evaluate(()=>window.attempts.length),1);
  await permit.getByRole('button',{name:'Retry same response',exact:true}).focus();await page.keyboard.press('Enter');
  await permit.getByText(/Office response saved as unverified evidence/).waitFor();
  assert.equal(await page.evaluate(()=>window.saves.length),1);
  assert.equal(await page.evaluate(()=>window.attempts[0].staff_responses[0].id===window.attempts[1].staff_responses[0].id),true);
  assert.equal(await page.evaluate(()=>window.current.staff_responses.length),1);
  await permit.locator('summary').click();
  await permit.getByText('Synthetic permit reply only.',{exact:true}).waitFor();
  await permit.getByText('Commercial sign scope: Office says it applies — unverified',{exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>window.current.staff_responses[0].authority_approved),false);
  if(width===390)await permit.screenshot({path:'/tmp/permitting-office-response-390.png'});
  await inspector.getByRole('button',{name:'Record inspection provider response',exact:true}).click();
  await fill(inspector,'Synthetic inspector','Synthetic inspection reply only.');
  await inspector.getByRole('button',{name:'Save unverified response',exact:true}).click();
  await inspector.getByText(/Office response saved as unverified evidence/).waitFor();
  assert.deepEqual(await page.evaluate(()=>window.current.staff_responses.map(r=>r.role)),['electrical_permit','electrical_inspection']);
  assert.equal(await page.evaluate(()=>JSON.stringify(window.current.roles)===JSON.stringify(JSON.parse(window.original).roles)),true);
  assert.equal(await page.evaluate(()=>JSON.stringify(window.current.identity_reconciliation)===JSON.stringify(JSON.parse(window.original).identity_reconciliation)),true);
  await page.getByRole('button',{name:'Read-only fixture',exact:true}).click();
  assert.equal(await permit.getByRole('button',{name:/Record .* response/}).count(),0);
  assert.equal(await inspector.getByRole('button',{name:/Record .* response/}).count(),0);
  assert.equal(await permit.locator('summary').count(),1);assert.equal(await inspector.locator('summary').count(),1);
  for(const control of await page.locator('[aria-label^="Office responses:"] summary').all())assert.ok((await control.boundingBox()).height>=44);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  assert.deepEqual(errors,[]);assert.deepEqual(outside,[]);
  checks.push({width,passed:true,explicit_save_only:true,failed_save_preserves_form:true,same_tick_save_lock:true,same_response_retry:true,separate_roles:true,immutable_findings_and_comparison:true,read_only_history:true,no_overflow:true,no_external_requests:true,production_writes:0});
  await page.close();
 }
 await writeFile('docs/permitting-office-response-browser-2026-10-18.json',JSON.stringify({status:'passed',checks,synthetic_only:true,employee_acceptance:false},null,2)+'\n');
 console.log(JSON.stringify({status:'passed',widths:checks.map(x=>x.width),external_requests:0,production_writes:0}));
}finally{await browser?.close();await vite?.close();await rm(scratch,{recursive:true,force:true});}

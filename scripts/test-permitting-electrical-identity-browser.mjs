import assert from 'node:assert/strict';
import {mkdtemp,writeFile,symlink,copyFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createServer} from 'vite';
import react from '@vitejs/plugin-react';
const {chromium}=await import('/tmp/sips-browser-check/node_modules/playwright/index.mjs');
const root=process.cwd(),scratch=await mkdtemp(path.join(tmpdir(),'electrical-identity-'));
let vite,browser;const checks=[];
try {
 await symlink(path.join(root,'node_modules'),path.join(scratch,'node_modules'),'dir');
 const css=(await readdir(path.join(root,'dist/assets'))).find(n=>n.endsWith('.css'));
 await copyFile(path.join(root,'dist/assets',css),path.join(scratch,'styles.css'));
 await copyFile(path.join(root,'docs/official-evidence/ohio-sharonville-2026-10-07/electrical-identity-comparison-fixture-2026-10-18.json'),path.join(scratch,'fixture.json'));
 await writeFile(path.join(scratch,'index.html'),'<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"></head><body><div id="root"></div><script type="module" src="/main.jsx"></script></body></html>');
 const main=[
 "import React,{useState} from 'react';import {createRoot} from 'react-dom/client';import initial from './fixture.json';",
 "import Panel from "+JSON.stringify('/@fs'+root+'/src/components/permitting/OfficeResearchFindings.jsx')+";",
 "window.fixture={original:JSON.stringify(initial),saves:[]};",
 "function App(){const [research,setResearch]=useState(initial);window.fixture.current=research;",
 "return <main className='max-w-5xl mx-auto p-3'><nav>{['legacy','unsafe','profile','reset'].map(mode=><button className='min-h-11 border p-2' key={mode} onClick={()=>{",
 "const next=structuredClone(initial);if(mode==='legacy')delete next.identity_reconciliation;",
 "if(mode==='unsafe')next.identity_reconciliation.source_snapshot.archived_file_url='javascript:alert(1)';",
 "if(mode==='profile')next.profile_snapshot.id='other';setResearch(next);",
 "}}>Fixture {mode}</button>)}</nav><Panel research={research} canEdit actor='Synthetic staff' onSave={async next=>{window.fixture.saves.push(next);setResearch(next);}}/></main>}",
 "createRoot(document.getElementById('root')).render(<App/>);"
 ].join('\n');
 await writeFile(path.join(scratch,'main.jsx'),main);
 vite=await createServer({configFile:false,root:scratch,plugins:[react()],resolve:{alias:{'@':path.join(root,'src')}},server:{host:'127.0.0.1',port:0,fs:{allow:[root,scratch]}},logLevel:'error'});
 await vite.listen();const origin='http://127.0.0.1:'+vite.httpServer.address().port;
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 for(const width of [320,390,1280]) {
  const page=await browser.newPage({viewport:{width,height:1000}}),errors=[],outside=[];
  page.setDefaultTimeout(8000);page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>{const url=route.request().url();if(url.startsWith('http')&&!url.startsWith(origin)){outside.push(url);return route.abort();}return route.continue();});
  await page.goto(origin,{waitUntil:'networkidle'});
  const region=page.getByRole('region',{name:'Saved electrical office identity comparisons'});await region.waitFor();
  const issuer=region.getByRole('article',{name:'Identity comparison: electrical_permit'});
  const inspector=region.getByRole('article',{name:'Identity comparison: electrical_inspection'});
  assert.equal(await region.getByRole('article').count(),2);
  await issuer.getByText('City of Sharonville',{exact:true}).waitFor();
  await inspector.getByText('Legacy entry · identity metadata missing',{exact:true}).waitFor();
  assert.match(await issuer.getByRole('link').getAttribute('href'),/#page=8$/);
  assert.match(await inspector.getByRole('link').getAttribute('href'),/#page=7$/);
  for(const link of await region.getByRole('link').all())assert.ok((await link.boundingBox()).height>=44);
  await issuer.locator('summary').click();await inspector.locator('summary').click();
  await inspector.getByText('1776692992927-0.21800261198141846',{exact:true}).waitFor();
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Expanded reference overflow');
  assert.equal(await region.getByRole('button',{name:/approve|assign|verify/i}).count(),0);
  if(width===390)await region.screenshot({path:'/tmp/permitting-electrical-identity-390.png'});
  const inspect=issuer.getByRole('button',{name:'Inspect current permit finding'});
  assert.ok((await inspect.boundingBox()).height>=44);await inspect.focus();await page.keyboard.press('Enter');
  const detail=page.locator('details').filter({has:page.locator('summary').filter({hasText:'Electrical permit issuer: City of Sharonville'})}).last();
  assert.ok(await detail.evaluate(node=>node.open));
  assert.ok(await detail.locator(':scope > summary').evaluate(node=>node===document.activeElement));
  await detail.getByRole('button',{name:'Edit Electrical permit issuer research draft',exact:true}).click();
  await page.locator('#research-office-3').fill('Staff edited issuer');
  await detail.getByRole('button',{name:'Save research draft',exact:true}).click();
  await issuer.getByText('Finding changed since this comparison. Reconcile again before using this reference.',{exact:true}).waitFor();
  await inspector.getByText('Identity review pending',{exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>window.fixture.saves.length),1);
  assert.equal(await page.evaluate(()=>window.fixture.saves[0].identity_reconciliation.entries[0].recorded_basis.office_name),'City of Sharonville');
  await page.getByRole('button',{name:'Fixture legacy'}).click();assert.equal(await region.count(),0);
  await page.getByRole('button',{name:'Fixture unsafe'}).click();await region.waitFor();assert.equal(await region.getByRole('link').count(),0);
  await page.getByRole('button',{name:'Fixture profile'}).click();assert.equal(await region.count(),0);
  await page.getByRole('button',{name:'Fixture reset'}).click();await region.waitFor();
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  assert.equal(await page.evaluate(()=>window.fixture.original===JSON.stringify(window.fixture.current)),true);
  assert.deepEqual(errors,[]);assert.deepEqual(outside,[]);
  checks.push({width,passed:true,actual_parent:true,role_separation:true,exact_pages:true,keyboard_focus:true,edit_staleness:true,legacy:true,unsafe_link_withheld:true,no_external_requests:true,no_overflow:true});
  await page.close();
 }
 await writeFile('docs/permitting-electrical-identity-browser-2026-10-18.json',JSON.stringify({status:'passed',checks,synthetic_only:true,employee_acceptance:false},null,2)+'\n');
 console.log(JSON.stringify({status:'passed',widths:checks.map(x=>x.width),external_requests:0,production_writes:0}));
} finally {
 await browser?.close();await vite?.close();await rm(scratch,{recursive:true,force:true});
}

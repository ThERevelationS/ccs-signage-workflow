import assert from 'node:assert/strict';
import {mkdtemp,writeFile,symlink,copyFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createServer} from 'vite';
import react from '@vitejs/plugin-react';
const {chromium}=await import('/tmp/permitting-browser-check/node_modules/playwright/index.mjs');
const root=process.cwd(),scratch=await mkdtemp(path.join(tmpdir(),'permitting-draft-'));let vite,browser;const checks=[];
try {
 await symlink(path.join(root,'node_modules'),path.join(scratch,'node_modules'),'dir');
 const css=(await readdir(path.join(root,'dist/assets'))).find(n=>n.endsWith('.css'));await copyFile(path.join(root,'dist/assets',css),path.join(scratch,'styles.css'));
 await writeFile(path.join(scratch,'index.html'),'<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"></head><body><div id="root"></div><script type="module" src="/main.jsx"></script></body></html>');
 await writeFile(path.join(scratch,'api.js'),`export const base44={entities:{PermittingWorkflowDraft:{filter:async()=>{window.fixture.reads++;if(window.fixture.fail)throw Error('Synthetic failure');return {items:window.fixture.rows};}}}};`);
 await writeFile(path.join(scratch,'main.jsx'),`import React from 'react';import {createRoot} from 'react-dom/client';import Library from '/@fs/app/src/components/permitting/PermittingDraftLibrary.jsx';const snapshot={jurisdiction:{jurisdiction_id:'fixture',jurisdiction_name:'Example Municipality',state:'OH'},summary:'Synthetic saved proposal',steps:[{step_index:0,permit_type:'Confirm sign application',office:'Example office',office_type:'Zoning',action:'Confirm the source',basis:'staff_confirmation_needed',citations:[]}],gaps:[{description:'Missing fee evidence'}],rule_counts:{approved:0,pending:0}};window.fixture={reads:0,fail:false,rows:[{id:'oh',title:'Wall sign review',jurisdiction_name:'Example Municipality',state:'OH',snapshot,project_inputs:{signTypes:'Wall sign'},review_notes:'Confirm electrical office'},{id:'ky',title:'Kentucky monument',state:'KY',jurisdiction_name:'Example County',snapshot:{...snapshot,jurisdiction:{jurisdiction_id:'ky',jurisdiction_name:'Example County',state:'KY'}}},{id:'broken',title:'Incomplete fixture',snapshot:null}]};createRoot(document.getElementById('root')).render(<Library onClose={()=>{}}/>);`);
 vite=await createServer({configFile:false,root:scratch,plugins:[react()],resolve:{alias:[{find:'@/api/base44Client',replacement:path.join(scratch,'api.js')},{find:'@',replacement:path.join(root,'src')}]},server:{host:'127.0.0.1',port:0,fs:{allow:[root,scratch]}},logLevel:'error'});await vite.listen();const origin='http://127.0.0.1:'+vite.httpServer.address().port;
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 for(const width of [320,390,1280]){
 const page=await browser.newPage({viewport:{width,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',route=>route.request().url().startsWith(origin)?route.continue():route.abort());await page.goto(origin,{waitUntil:'networkidle'});
 await page.getByRole('heading',{name:'Wall sign review',exact:true}).waitFor();
 await page.getByLabel('Filter draft state').selectOption('KY');assert.equal(await page.locator('article').count(),1);await page.getByRole('heading',{name:'Kentucky monument'}).waitFor();
 await page.getByLabel('Filter draft state').selectOption('all');await page.getByLabel('Search workflow drafts').fill('electrical');assert.equal(await page.locator('article').count(),1);
 await page.getByRole('button',{name:'Review draft',exact:true}).click();await page.getByText('Synthetic saved proposal',{exact:true}).waitFor();assert.equal(await page.getByLabel('Review notes / questions to resolve').inputValue(),'Confirm electrical office');assert.ok(await page.getByRole('button',{name:'Draft saved',exact:true}).isDisabled());assert.equal(await page.getByRole('button',{name:/Create .*Permit Line/}).count(),0);
 await page.getByRole('button',{name:'Close',exact:true}).first().click();await page.getByLabel('Search workflow drafts').fill('no-match');await page.getByText('No drafts match these filters.',{exact:true}).waitFor();
 await page.getByLabel('Search workflow drafts').fill('');await page.evaluate(()=>window.fixture.fail=true);await page.getByRole('button',{name:'Refresh drafts'}).click();await page.getByRole('alert').waitFor();assert.equal(await page.locator('article').count(),0);
 await page.evaluate(()=>{window.fixture.fail=false;window.fixture.rows=[];});await page.getByRole('button',{name:'Refresh drafts'}).click();await page.getByRole('heading',{name:'No saved workflows yet'}).waitFor();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);
 checks.push({width,passed:true,checks:'library state/search filters, reopen actual designer snapshot/notes, no job action, no-match, load failure/retry, empty library, no overflow'});console.log('PASS draft library '+width);await page.close();
 }
 await writeFile(path.join(root,'docs/permitting-draft-library-browser-2026-10-14.json'),JSON.stringify({mode:'actual designer and pipeline; synthetic API/AI/evidence; production CSS; external requests blocked; not production acceptance',checks},null,2)+'\n');
}finally{await browser?.close();await vite?.close();await rm(scratch,{recursive:true,force:true});}

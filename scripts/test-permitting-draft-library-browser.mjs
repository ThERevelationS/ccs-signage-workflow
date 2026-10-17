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
 await writeFile(path.join(scratch,'api.js'),`export const base44={entities:{PermittingWorkflowDraft:{filter:async(query,options)=>{window.fixture.reads++;window.fixture.requests.push({query,options});if(window.fixture.fail)throw Error('Synthetic failure');const start=options.cursor?Number(options.cursor.replace('draft-page-','')):0;if(window.fixture.failOlder&&start)throw Error('Synthetic older-page failure');if(window.fixture.slowOlder&&start)await new Promise(resolve=>setTimeout(resolve,350));const items=window.fixture.rows.slice(start,start+options.limit),end=start+items.length,has_more=end<window.fixture.rows.length;return {items,has_more,next_cursor:has_more?'draft-page-'+end:null};}}}};`);
 await writeFile(path.join(scratch,'main.jsx'),`import React from 'react';import {createRoot} from 'react-dom/client';import Library from '/@fs/app/src/components/permitting/PermittingDraftLibrary.jsx';const snapshot={jurisdiction:{jurisdiction_id:'fixture',jurisdiction_name:'Example Municipality',state:'OH'},summary:'Synthetic saved proposal',steps:[{step_index:0,permit_type:'Confirm sign application',office:'Example office',office_type:'Zoning',action:'Confirm the source',basis:'staff_confirmation_needed',citations:[]}],gaps:[{description:'Missing fee evidence'}],rule_counts:{approved:0,pending:0}};window.fixture={reads:0,requests:[],fail:false,failOlder:false,slowOlder:false,rows:[{id:'oh',title:'Wall sign review',jurisdiction_name:'Example Municipality',state:'OH',snapshot,project_inputs:{signTypes:'Wall sign'},review_notes:'Confirm electrical office'},{id:'ky',title:'Kentucky monument',state:'KY',jurisdiction_name:'Example County',snapshot:{...snapshot,jurisdiction:{jurisdiction_id:'ky',jurisdiction_name:'Example County',state:'KY'}}},{id:'broken',title:'Incomplete fixture',snapshot:null}]};createRoot(document.getElementById('root')).render(<Library onClose={()=>{}}/>);`);
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
 // Replace only synthetic fixtures: no app records or external APIs are written.
 await page.evaluate(()=>{
   const snapshot={jurisdiction:{jurisdiction_id:'older-fixture',jurisdiction_name:'Older Example',state:'OH'},summary:'Older saved proposal',steps:[],gaps:[],rule_counts:{approved:0,pending:0}};
   window.fixture.rows=Array.from({length:205},(_,index)=>({id:'draft-'+index,title:index===204?'Oldest electrical review':'Saved draft '+index,state:index===204?'OH':'KY',snapshot,review_notes:index===204?'Keep the earlier review notes':''}));
   window.fixture.requests=[];
 });await page.getByRole('button',{name:'Refresh drafts'}).click();
 await page.getByText('100 shown from 100 loaded drafts.',{exact:false}).waitFor();
 assert.equal(await page.locator('article').count(),100);
 await page.getByLabel('Search workflow drafts').fill('Oldest electrical');
 await page.getByText('No drafts match these filters.',{exact:true}).waitFor();
 await page.evaluate(()=>window.fixture.failOlder=true);await page.getByRole('button',{name:'Load older drafts',exact:true}).click();
 await page.getByRole('alert').filter({hasText:'Your loaded drafts are still available'}).waitFor();
 await page.getByLabel('Search workflow drafts').fill('');assert.equal(await page.locator('article').count(),100);
 await page.evaluate(()=>{window.fixture.failOlder=false;window.fixture.slowOlder=true;});
 await page.getByRole('button',{name:'Retry older drafts',exact:true}).click();
 await page.getByRole('status').filter({hasText:'Loaded drafts remain available'}).waitFor();assert.equal(await page.locator('article').count(),100);
 assert.ok(await page.getByRole('button',{name:'Refresh drafts',exact:true}).isDisabled());
 await page.getByText('200 shown from 200 loaded drafts.',{exact:false}).waitFor();
 await page.getByLabel('Search workflow drafts').fill('Oldest electrical');await page.getByLabel('Filter draft state').selectOption('OH');
 await page.getByRole('button',{name:'Load older drafts',exact:true}).click();
 await page.getByRole('heading',{name:'Oldest electrical review',exact:true}).waitFor();
 await page.getByText('1 shown from 205 loaded drafts.',{exact:false}).waitFor();
 await page.getByText('Reached the end of this browse.',{exact:false}).waitFor();
 assert.equal(await page.getByRole('button',{name:'Load older drafts',exact:true}).count(),0);
 await page.getByRole('button',{name:'Review draft',exact:true}).click();
 await page.getByText('Older saved proposal',{exact:true}).waitFor();
 assert.equal(await page.getByLabel('Review notes / questions to resolve').inputValue(),'Keep the earlier review notes');
 assert.equal(await page.getByRole('button',{name:/Create .*Permit Line/}).count(),0);
 await page.getByRole('button',{name:'Close',exact:true}).first().click();
 const requests=await page.evaluate(()=>window.fixture.requests.filter(request=>Object.keys(request.query).length===0));
 assert.deepEqual(requests,[{query:{},options:{sort:'-created_date',limit:100}},{query:{},options:{cursor:'draft-page-100',limit:100}},{query:{},options:{cursor:'draft-page-100',limit:100}},{query:{},options:{cursor:'draft-page-200',limit:100}}]);
 await page.getByLabel('Search workflow drafts').fill('');await page.getByLabel('Filter draft state').selectOption('all');
 await page.getByText('205 shown from 205 loaded drafts.',{exact:false}).waitFor();
 assert.equal(await page.locator('article').count(),205);assert.equal(await page.locator('article h3').evaluateAll(nodes=>new Set(nodes.map(node=>node.textContent)).size),205);
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);
 checks.push({width,passed:true,checks:'library filters, saved snapshot/notes, no job action, load failure/retry, empty states; 205 drafts across 3 cursor pages, older failure preserves rows, retry uses same cursor, loading state, filter/search older records, reopen oldest snapshot, no duplicate cards, end of browse, no overflow'});console.log('PASS draft library '+width);await page.close();
 }
 await writeFile(path.join(root,'docs/permitting-draft-library-pagination-browser-2026-10-17.json'),JSON.stringify({mode:'actual designer and pipeline; synthetic API/AI/evidence; production CSS; external requests blocked; not production acceptance',checks},null,2)+'\n');
}finally{await browser?.close();await vite?.close();await rm(scratch,{recursive:true,force:true});}

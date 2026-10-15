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
 await writeFile(path.join(scratch,'api.js'),`export const base44={entities:{
 PermittingRule:{filter:async()=>({items:[{id:'approved',status:'staff_approved',is_operational:true,requirement:'Synthetic approved requirement'},{id:'pending',status:'needs_review',requirement:'Synthetic pending requirement'},{id:'historical',status:'historical',is_operational:true,draft_context:true}]})},
 PermittingSourceDocument:{filter:async()=>({items:[]})},
 PermittingWorkflowDraft:{filter:async()=>({items:window.fixture.rows}),create:async row=>{window.fixture.attempts++;if(window.fixture.fail){window.fixture.fail=false;throw Error('Synthetic save failure');}const saved={...row,id:'synthetic-draft-'+(window.fixture.rows.length+1)};window.fixture.rows.push(saved);return saved;}},
 PermitLineItem:{create:async()=>{window.fixture.jobWrites++;throw Error('Job writes forbidden');}}},
 functions:{invoke:async()=>{throw Error('Provider calls forbidden');}},integrations:{Core:{InvokeLLM:async()=>{window.fixture.aiCalls++;return {summary:'Synthetic workflow — fixture only',steps:[
 {permit_type:'Synthetic approved step',office:'Example office',office_type:'Zoning',action:'Synthetic action',basis:'approved_rule',citations:[{rule_id:'approved'}]},
 {permit_type:'Synthetic pending step',office:'Example office',office_type:'Electrical',action:'Synthetic pending action',basis:'approved_rule',citations:[{rule_id:'pending'}]},
 {permit_type:'Synthetic unsupported step',office:'Unknown',office_type:'Building',action:'Confirm applicability',basis:'approved_rule',citations:[{rule_id:'invented'}]}],gaps:[{description:'Synthetic unresolved requirement',reason:'Evidence absent'}]};}}}};`);
 await writeFile(path.join(scratch,'main.jsx'),`import React,{useState} from 'react';import {createRoot} from 'react-dom/client';import Designer from '/@fs/app/src/components/permitting/PermitWorkflowDesigner.jsx';window.fixture={rows:[],attempts:0,fail:true,jobWrites:0,aiCalls:0};function App(){const [open,setOpen]=useState(true);return <><button onClick={()=>setOpen(true)}>Open designer</button>{open&&<Designer isOpen onClose={()=>setOpen(false)} preselectedJurisdiction={{jurisdiction_id:'fixture-only',jurisdiction_name:'Example Municipality',state:'OH'}}/>}</>}createRoot(document.getElementById('root')).render(<App/>);`);
 vite=await createServer({configFile:false,root:scratch,plugins:[react()],resolve:{alias:[{find:'@/api/base44Client',replacement:path.join(scratch,'api.js')},{find:'@',replacement:path.join(root,'src')}]},server:{host:'127.0.0.1',port:0,fs:{allow:[root,scratch]}},logLevel:'error'});await vite.listen();const origin='http://127.0.0.1:'+vite.httpServer.address().port;
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 for(const width of [320,390,1280]){
 const page=await browser.newPage({viewport:{width,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',route=>route.request().url().startsWith(origin)?route.continue():route.abort());await page.goto(origin,{waitUntil:'networkidle'});
 await page.getByLabel('Sign Type(s)',{exact:true}).fill('Wall sign');await page.getByRole('button',{name:'Generate Permit Workflow',exact:true}).click();
 await page.getByText('Synthetic workflow — fixture only',{exact:true}).waitFor();await page.getByText('Approved Rule',{exact:true}).waitFor();await page.getByText('Pending Review',{exact:true}).waitFor();await page.getByText('Staff Confirmation Needed',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Edit proposed steps',exact:true}).click();
 await page.getByLabel('Action for step 1',{exact:true}).fill('Staff-adjusted synthetic action');
 await page.getByLabel('Required documents for step 1 · one per line',{exact:true}).fill('Site plan\nLighting plan');
 await page.getByLabel('Target day for step 2',{exact:true}).fill('30');
 await page.getByLabel('Follow-up interval in days for step 2',{exact:true}).fill('7');
 await page.getByLabel('Inspection planned for step 2 · confirm provider and stages',{exact:true}).check();
 await page.getByLabel('Step 2 depends on step 1',{exact:true}).check();
 await page.getByText('Staff edited',{exact:true}).first().waitFor();assert.equal(await page.getByText('Staff edited',{exact:true}).count(),2);
 await page.getByRole('button',{name:'Expand all',exact:true}).click();await page.getByText('The proposed requirement is not backed by a recognized approved or pending rule. Confirm its source and applicability.',{exact:true}).waitFor();
 const save=page.getByRole('button',{name:'Save permitting draft',exact:true});assert.ok(await save.isDisabled());
 await page.getByLabel('Review notes / questions to resolve').fill('Confirm electrical requirements with office');await page.getByRole('checkbox',{name:/I reviewed the proposed steps/}).check();assert.ok(await save.isEnabled());
 await save.click();await page.getByText('Synthetic save failure',{exact:true}).waitFor();assert.ok(await save.isEnabled());await save.click();await page.getByRole('status').filter({hasText:'Saved permitting draft:'}).waitFor();
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.ok((await page.getByRole('button',{name:'Draft saved',exact:true}).boundingBox()).height>=44);
 await page.getByRole('button',{name:'Close',exact:true}).first().click();await page.getByRole('button',{name:'Open designer',exact:true}).click();await page.getByRole('region',{name:'Saved permitting drafts'}).getByRole('button').click();
 assert.equal(await page.getByLabel('Review notes / questions to resolve').inputValue(),'Confirm electrical requirements with office');assert.ok(await page.getByRole('button',{name:'Draft saved',exact:true}).isDisabled());
 await page.getByRole('button',{name:'Create editable revision',exact:true}).click();
 await page.getByLabel('Action for step 1',{exact:true}).fill('Revision two synthetic action');
 const revisedSave=page.getByRole('button',{name:'Save revised permitting draft',exact:true});assert.ok(await revisedSave.isDisabled());
 await page.getByRole('checkbox',{name:/I reviewed the proposed steps/}).check();assert.ok(await revisedSave.isEnabled());await revisedSave.click();
 await page.getByRole('status').filter({hasText:'Saved permitting draft:'}).waitFor();
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 const result=await page.evaluate(()=>window.fixture);assert.equal(result.rows.length,2);assert.equal(result.attempts,3);assert.equal(result.aiCalls,1);assert.equal(result.jobWrites,0);
 assert.equal(result.rows[0].status,'draft');assert.equal(result.rows[0].work_order_id,undefined);assert.equal(result.rows[1].work_order_id,undefined);
 assert.deepEqual(result.rows[0].snapshot.steps.map(s=>s.basis),['staff_confirmation_needed','staff_confirmation_needed','staff_confirmation_needed']);
 assert.equal(result.rows[0].snapshot.steps[0].action,'Staff-adjusted synthetic action');assert.deepEqual(result.rows[0].snapshot.steps[0].required_documents,['Site plan','Lighting plan']);
 assert.deepEqual(result.rows[0].snapshot.steps[0].citations,[{rule_id:'approved'}]);assert.equal(result.rows[0].snapshot.steps[0].staff_override.original_values.action,'Synthetic action');
 const timedStep=result.rows[0].snapshot.steps[1];assert.equal(timedStep.target_days_from_start,30);assert.equal(timedStep.followup_interval_days,7);assert.equal(timedStep.inspection_needed,true);assert.deepEqual(timedStep.dependencies,[0]);assert.deepEqual(timedStep.citations,[{rule_id:'pending'}]);assert.equal(timedStep.staff_override.original_basis,'pending_review');
 assert.deepEqual(result.rows[1].snapshot.steps.map(s=>s.basis),['staff_confirmation_needed','staff_confirmation_needed','staff_confirmation_needed']);
 assert.equal(result.rows[1].snapshot.steps[0].action,'Revision two synthetic action');assert.deepEqual(result.rows[1].snapshot.steps[0].citations,[{rule_id:'approved'}]);
 assert.equal(result.rows[1].snapshot.steps[1].target_days_from_start,30);assert.equal(result.rows[1].snapshot.steps[1].followup_interval_days,7);assert.equal(result.rows[1].snapshot.steps[1].inspection_needed,true);assert.deepEqual(result.rows[1].snapshot.steps[1].dependencies,[0]);
 assert.equal(result.rows[0].snapshot.steps[0].action,'Staff-adjusted synthetic action');assert.equal(result.rows[1].snapshot.draft_revision.parent_draft_id,result.rows[0].id);assert.equal(result.rows[1].snapshot.draft_revision.root_draft_id,result.rows[0].id);assert.equal(result.rows[1].snapshot.draft_revision.revision_number,2);assert.deepEqual(errors,[]);
 checks.push({width,passed:true,checks:'preview evidence labels, staff content and schedule edits demote basis and preserve citations, inspection and earlier-step dependency planning, review gate, save failure/retry, immutable append-only revision and parent linkage, no job writes, no overflow'});console.log('PASS workflow draft '+width);await page.close();
 }
 await writeFile(path.join(root,'docs/permitting-workflow-draft-browser-2026-10-15.json'),JSON.stringify({mode:'actual designer and pipeline; synthetic API/AI/evidence; production CSS; external requests blocked; not production acceptance',checks},null,2)+'\n');
}finally{await browser?.close();await vite?.close();await rm(scratch,{recursive:true,force:true});}

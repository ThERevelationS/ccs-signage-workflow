import assert from 'node:assert/strict';
import {mkdtemp,writeFile,symlink,copyFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createServer} from 'vite';
import react from '@vitejs/plugin-react';
const {chromium}=await import('/tmp/permitting-browser-check/node_modules/playwright/index.mjs');
const root=process.cwd(),scratch=await mkdtemp(path.join(tmpdir(),'permitting-review-packet-'));let vite,browser;const checks=[];
try {
 await symlink(path.join(root,'node_modules'),path.join(scratch,'node_modules'),'dir');
 const css=(await readdir(path.join(root,'dist/assets'))).find(n=>n.endsWith('.css'));await copyFile(path.join(root,'dist/assets',css),path.join(scratch,'styles.css'));
 await writeFile(path.join(scratch,'index.html'),'<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"></head><body><div id="root"></div><script type="module" src="/main.jsx"></script></body></html>');
 await writeFile(path.join(scratch,'api.js'),`export const base44={entities:{
 PermittingWorkflowDraft:{filter:async()=>{window.fixture.draftReads++;return {items:structuredClone(window.fixture.rows),has_more:false,next_cursor:null};}},
 PermittingSourceDocument:{filter:async()=>{window.fixture.forbidden++;throw Error('No source reads authorized');}},
 PermitLineItem:{create:async()=>{window.fixture.forbidden++;throw Error('No job writes authorized');}}
 },functions:{invoke:async()=>{window.fixture.forbidden++;throw Error('No backend calls authorized');}},integrations:{Core:{InvokeLLM:async()=>{window.fixture.forbidden++;throw Error('No AI calls authorized');}}}};`);
 await writeFile(path.join(scratch,'main.jsx'),`import React from 'react';import {createRoot} from 'react-dom/client';import Library from '/@fs/app/src/components/permitting/PermittingDraftLibrary.jsx';
 import * as pdfjs from '/@fs/app/node_modules/pdfjs-dist/build/pdf.mjs';
 pdfjs.GlobalWorkerOptions.workerSrc='/@fs/app/node_modules/pdfjs-dist/build/pdf.worker.mjs';
 window.readPacketPdf=async data=>{const pdf=await pdfjs.getDocument({data:new Uint8Array(data),isEvalSupported:false}).promise;let text='';for(let i=1;i<=pdf.numPages;i++){const page=await pdf.getPage(i);text+=(await page.getTextContent()).items.map(item=>item.str).join(' ')+' ';}return {pages:pdf.numPages,text};};
 const citation={source_document_id:'source',rule_id:'rule-42',section_or_page:'Section 4.2',physical_page:9,excerpt:'CITATION_BEGIN_TOKEN '+ 'Full saved quotation must remain readable across pages. '.repeat(280)+' CITATION_END_TOKEN',source_sha256:'a'.repeat(64),text_sha256:'b'.repeat(64),official_url:'https://example.gov/signs',archived_file_url:'https://example.gov/old.pdf',verification_status:'needs_verification'};
 const source={id:'source',jurisdiction_id:'fixture-oh',title:'CAPTURED_OLD_SOURCE',file_hash_sha256:'a'.repeat(64),archived_file_url:'https://example.gov/old.pdf',retrieval_timestamp:'2026-10-01T12:00:00Z',effective_or_adopted_date:'2020-01-01',content_status:'historical',authority_classification:'superseded',verification_status:'needs_verification',reviewer:'Fixture reviewer',superseded_by:'new-source',notes_gaps:'CURRENTNESS_UNCONFIRMED'};
 const role=(role,label,office)=>({role,label,findings:[{office_name:office,applicability:'unknown',service_area:'Recorded service area',responsibility_quote:'Recorded responsibility quote',delegation_quote:'Delegation unverified',research_fields:{application_portal:'https://example.gov/apply',inspection_stages:'Rough and final — confirm'},official_source_url:'https://example.gov/offices'}]});
 const snapshot={jurisdiction:{jurisdiction_id:'fixture-oh',jurisdiction_name:'Fixture municipality',state:'OH'},jurisdiction_unresolved:true,summary:'Saved packet fixture',
 electrical_planning_handoff:{research_method:'Recorded fixture research',roles:[role('electrical_permit_issuer','Electrical permit issuer','ISSUER_ONLY_OFFICE'),role('electrical_inspection_provider','Electrical inspection provider','INSPECTOR_ONLY_OFFICE')]},
 steps:[{step_index:0,permit_type:'Sign review',office:'Saved zoning office',office_type:'Zoning',action:'SAVED_ACTION_TOKEN',basis:'pending_review',required_documents:['Site plan','Lighting plan'],forms:[{title:'Recorded form',official_url:'https://example.gov/form.pdf'}],target_days_from_start:0,followup_interval_days:7,inspection_needed:false,dependencies:[],citations:[citation],gap_reason:'APPLICABILITY_UNCONFIRMED'},
 {step_index:1,permit_type:'Electrical review',office:'Saved electrical office',action:'Confirm electrical scope',basis:'staff_confirmation_needed',inspection_needed:true,dependencies:[0],citations:[{rule_id:'unlinked-rule',excerpt:'UNLINKED_SAVED_CITATION',official_url:'javascript:alert(1)',archived_file_url:'https://user:password@example.gov/file.pdf'}]}],
 source_evidence:{source},gaps:[{description:'GAP_TOKEN',reason:'Missing evidence'}],rule_counts:{approved:0,pending:1},draft_revision:{root_draft_id:'original',parent_draft_id:'earlier',parent_title:'Earlier fixture',revision_number:3,created_at:'2026-10-17T10:00:00Z'}};
 const row={id:'opened',title:'Opened packet fixture',status:'draft',created_date:'2026-10-17T10:01:00Z',reviewed_at:'2026-10-17T10:00:00Z',project_inputs:{address:'123 Fixture Lane',customer:'Saved fixture customer',signTypes:'Wall sign',dimensions:'4 ft × 8 ft',illuminated:false,electricalWork:true,exemptionStatus:'Unknown'},review_notes:'NOTE_BEGIN_TOKEN\\n'+ 'Long saved review notes and unresolved questions. '.repeat(110)+'\\nNOTE_END_TOKEN',snapshot};
 const legacy={id:'legacy',title:'Legacy packet fixture',status:'draft',snapshot:{jurisdiction:{jurisdiction_name:'Unresolved'},steps:[],gaps:[],rule_counts:{approved:0,pending:0}}};
 window.fixture={rows:[row,legacy],draftReads:0,forbidden:0,printCalls:0};window.fixture.original=JSON.stringify(window.fixture.rows);
 window.print=()=>{window.fixture.printCalls++;};
 createRoot(document.getElementById('root')).render(<><p>UNRELATED_CLIENT_SECRET_TOKEN</p><Library onClose={()=>{}}/></>);`);
 vite=await createServer({configFile:false,root:scratch,plugins:[react()],resolve:{alias:[{find:'@/api/base44Client',replacement:path.join(scratch,'api.js')},{find:'@',replacement:path.join(root,'src')}]},server:{host:'127.0.0.1',port:0,fs:{allow:[root,scratch]}},logLevel:'error'});await vite.listen();const origin='http://127.0.0.1:'+vite.httpServer.address().port;
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 for(const width of [320,390,1280]){
 const page=await browser.newPage({viewport:{width,height:1000}}),errors=[],external=[];page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/*',route=>route.request().url().startsWith(origin)?route.continue():(external.push(route.request().url()),route.abort()));await page.goto(origin,{waitUntil:'networkidle'});
 await page.getByRole('heading',{name:'Opened packet fixture',exact:true}).waitFor();
 const openedCard=page.locator('article').filter({has:page.getByRole('heading',{name:'Opened packet fixture',exact:true})});
 await openedCard.getByRole('button',{name:'Review draft',exact:true}).click();
 const packetButton=page.getByRole('button',{name:'Open saved review packet',exact:true});await packetButton.click();
 const packet=page.getByRole('dialog',{name:'Saved workflow review packet',exact:true});await packet.waitFor();
 await packet.getByText('SAVED_ACTION_TOKEN',{exact:true}).waitFor();await packet.getByText('ISSUER_ONLY_OFFICE',{exact:true}).waitFor();await packet.getByText('INSPECTOR_ONLY_OFFICE',{exact:true}).waitFor();
 assert.equal(await packet.getByRole('link',{name:/javascript:|user:password/}).count(),0);
 assert.ok((await packet.getByRole('region',{name:'Saved review notes',exact:true}).innerText()).includes('NOTE_END_TOKEN'));
 assert.ok((await packet.getByRole('region',{name:'Proposed step 1',exact:true}).innerText()).includes('CITATION_END_TOKEN'));
 assert.ok(await packet.getByRole('region',{name:'Proposed step 2',exact:true}).getByText('Step 1',{exact:false}).count());
 assert.ok(await packet.getByText(/Captured source metadata was not recorded/).count());
 assert.equal(await packet.evaluate(node=>node.parentElement===document.body),true);
 assert.ok(await packet.evaluate(node=>node.scrollWidth<=node.clientWidth));
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 assert.ok((await packet.getByRole('button',{name:'Print / Save as PDF',exact:true}).boundingBox()).height>=44);
 await packet.getByRole('button',{name:'Print / Save as PDF',exact:true}).click();assert.equal(await page.evaluate(()=>window.fixture.printCalls),1);
 if(width===320)await page.screenshot({path:'/tmp/permitting-packet-mobile.png'});
 if(width===1280){
   await page.screenshot({path:'/tmp/permitting-packet-desktop.png'});
   await page.emulateMedia({media:'print'});
   assert.equal(await page.locator('#root').evaluate(node=>getComputedStyle(node).display),'none');
   assert.equal(await page.locator('[data-permitting-review-packet] .packet-toolbar').evaluate(node=>getComputedStyle(node).display),'none');
   assert.equal(await page.locator('[data-permitting-review-packet] .packet-scroll').evaluate(node=>getComputedStyle(node).overflow),'visible');
   assert.equal(await page.locator('[data-permitting-review-packet]').evaluate(node=>getComputedStyle(node).position),'static');
   const buffer=await page.pdf({format:'Letter',printBackground:true,displayHeaderFooter:false,path:'/tmp/permitting-packet-fixture.pdf'});
   await page.emulateMedia({media:'screen'});
   const pdf=await page.evaluate(data=>window.readPacketPdf(data),Array.from(buffer));
   assert.ok(pdf.pages>=3,'Long saved content must span pages');
   for(const token of ['CITATION_BEGIN_TOKEN','CITATION_END_TOKEN','NOTE_BEGIN_TOKEN','NOTE_END_TOKEN','SAVED_ACTION_TOKEN','CAPTURED_OLD_SOURCE','ISSUER_ONLY_OFFICE','INSPECTOR_ONLY_OFFICE','GAP_TOKEN','rule-42','2026-10-17T10:01:00Z','UNLINKED_SAVED_CITATION'])assert.ok(pdf.text.includes(token),'Missing PDF content '+token);
   assert.ok(!pdf.text.includes('UNRELATED_CLIENT_SECRET_TOKEN'));assert.ok(!pdf.text.includes('Print / Save as PDF'));assert.ok(!pdf.text.includes('AI Permit Workflow Designer'));
   checks.push({width,printedPages:pdf.pages,pdf:'actual Chromium PDF text verified; complete long quotes/notes and saved metadata; no unrelated client/navigation content'});
 }
 await page.keyboard.press('Escape');await packet.waitFor({state:'detached'});await page.waitForFunction(()=>document.activeElement?.textContent==='Open saved review packet');assert.ok(await packetButton.evaluate(node=>node===document.activeElement));
 assert.equal(await page.getByLabel('Review notes / questions to resolve').inputValue(),await page.evaluate(()=>window.fixture.rows[0].review_notes));
 // Reopen/return retains the saved review, then edited revisions have no print action until saved.
 await packetButton.click();await packet.waitFor();await page.evaluate(()=>{window.print=null;});await packet.getByRole('button',{name:'Print / Save as PDF',exact:true}).click();await packet.getByRole('alert').filter({hasText:'Printing is unavailable'}).waitFor();
 await packet.getByRole('button',{name:'Return to saved draft',exact:true}).click();await page.waitForFunction(()=>document.activeElement?.textContent==='Open saved review packet');assert.ok(await packetButton.evaluate(node=>node===document.activeElement));
 await page.getByRole('button',{name:'Create editable revision',exact:true}).click();await page.getByLabel('Action for step 1',{exact:true}).fill('UNSAVED_ACTION_TOKEN');
 assert.equal(await page.getByRole('button',{name:'Open saved review packet',exact:true}).count(),0);
 await page.getByRole('button',{name:'Close',exact:true}).first().click();
 const legacyCard=page.locator('article').filter({has:page.getByRole('heading',{name:'Legacy packet fixture',exact:true})});await legacyCard.getByRole('button',{name:'Review draft',exact:true}).click();await page.getByRole('button',{name:'Open saved review packet',exact:true}).click();
 await packet.getByText(/No captured source metadata recorded/).waitFor();await packet.getByText(/Responsibility remains unresolved/).waitFor();await packet.getByText('No proposed steps recorded.',{exact:true}).waitFor();
 await packet.getByRole('button',{name:'Return to saved draft',exact:true}).click();
 assert.equal(await page.evaluate(()=>JSON.stringify(window.fixture.rows)===window.fixture.original),true);
 assert.equal(await page.evaluate(()=>window.fixture.forbidden),0);assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
 checks.push({width,passed:true,checks:'actual library/designer/packet; saved-only entry; full saved action/citations/forms/office metadata; unsafe links omitted; 44px controls; no overflow; print invocation and unavailable fallback; Escape/return focus; draft notes preserved; unsaved revision excluded; legacy missing evidence explicit; no mutations, source reads, AI or job writes'});
 console.log('PASS saved workflow packet '+width);await page.close();
 }
 await writeFile(path.join(root,'docs/permitting-workflow-review-packet-browser-2026-10-17.json'),JSON.stringify({mode:'actual components and Chromium Print/PDF; synthetic immutable saved drafts; production CSS; external requests blocked; not authenticated employee acceptance',checks},null,2)+'\n');
}finally{await browser?.close();await vite?.close();await rm(scratch,{recursive:true,force:true});}


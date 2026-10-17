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
 PermittingWorkflowDraft:{filter:async()=>{window.fixture.draftReads++;return {items:structuredClone(window.fixture.rows),has_more:false,next_cursor:null};},get:async id=>structuredClone(window.fixture.rows.find(row=>row.id===id)),create:async row=>{window.fixture.saveCalls++;if(window.fixture.failSave){window.fixture.failSave=false;throw Error('Synthetic review save failure');}const saved={...structuredClone(row),id:'review-revision-'+(window.fixture.rows.length+1),created_date:'2026-10-17T12:00:00Z'};window.fixture.rows.push(saved);sessionStorage.setItem('planning-review-fixture',JSON.stringify(window.fixture.rows));return structuredClone(saved);}},
 PermittingSourceDocument:{filter:async()=>{window.fixture.forbidden++;throw Error('No source reads authorized');}},
 PermitLineItem:{create:async()=>{window.fixture.forbidden++;throw Error('No job writes authorized');}}
 },functions:{invoke:async()=>{window.fixture.forbidden++;throw Error('No backend calls authorized');}},integrations:{Core:{InvokeLLM:async()=>{window.fixture.forbidden++;throw Error('No AI calls authorized');}}}};`);
 await writeFile(path.join(scratch,'main.jsx'),`import React from 'react';import {createRoot} from 'react-dom/client';import Library from '/@fs/app/src/components/permitting/PermittingDraftLibrary.jsx';
 import * as pdfjs from '/@fs/app/node_modules/pdfjs-dist/build/pdf.mjs';
 pdfjs.GlobalWorkerOptions.workerSrc='/@fs/app/node_modules/pdfjs-dist/build/pdf.worker.mjs';
 window.readPacketPdf=async data=>{const pdf=await pdfjs.getDocument({data:new Uint8Array(data),isEvalSupported:false}).promise;let text='';for(let i=1;i<=pdf.numPages;i++){const page=await pdf.getPage(i);text+=(await page.getTextContent()).items.map(item=>item.str).join(' ')+' ';}return {pages:pdf.numPages,text};};
 const citation={source_document_id:'source',rule_id:'rule-42',section_or_page:'Section 4.2',physical_page:9,excerpt:'CITATION_BEGIN_TOKEN '+ 'Full saved quotation must remain readable across pages. '.repeat(3)+' CITATION_END_TOKEN',source_sha256:'a'.repeat(64),text_sha256:'b'.repeat(64),official_url:'https://example.gov/signs',archived_file_url:'https://example.gov/old.pdf',verification_status:'needs_verification'};
 const source={id:'source',jurisdiction_id:'fixture-oh',title:'CAPTURED_OLD_SOURCE',file_hash_sha256:'a'.repeat(64),archived_file_url:'https://example.gov/old.pdf',retrieval_timestamp:'2026-10-01T12:00:00Z',effective_or_adopted_date:'2020-01-01',content_status:'historical',authority_classification:'superseded',verification_status:'needs_verification',reviewer:'Fixture reviewer',superseded_by:'new-source',notes_gaps:'CURRENTNESS_UNCONFIRMED'};
 const role=(role,label,office)=>({role,label,findings:[{office_name:office,applicability:'unknown',service_area:'Recorded service area',responsibility_quote:'Recorded responsibility quote',delegation_quote:'Delegation unverified',research_fields:{application_portal:'https://example.gov/apply',inspection_stages:'Rough and final — confirm'},official_source_url:'https://example.gov/offices'}]});
 const snapshot={jurisdiction:{jurisdiction_id:'fixture-oh',jurisdiction_name:'Fixture municipality',state:'OH'},jurisdiction_unresolved:true,summary:'Saved packet fixture',
 electrical_planning_handoff:{research_method:'Recorded fixture research',roles:[role('electrical_permit_issuer','Electrical permit issuer','ISSUER_ONLY_OFFICE'),role('electrical_inspection_provider','Electrical inspection provider','INSPECTOR_ONLY_OFFICE')]},
 steps:[{step_index:0,permit_type:'Sign review',office:'Saved zoning office',office_type:'Zoning',action:'SAVED_ACTION_TOKEN',basis:'pending_review',required_documents:['Site plan','Lighting plan'],forms:[{title:'Recorded form',official_url:'https://example.gov/form.pdf'}],target_days_from_start:0,followup_interval_days:7,inspection_needed:false,dependencies:[],citations:[citation],gap_reason:'APPLICABILITY_UNCONFIRMED'},
 {step_index:1,staff_review:{decision:'reviewed_for_planning',reason:'Previous staff planning review',notes:'Original review note',follow_up:{evidence:false,office:false,documents:false}},permit_type:'Electrical review',office:'Saved electrical office',action:'Confirm electrical scope',basis:'staff_confirmation_needed',inspection_needed:true,dependencies:[0],citations:[{rule_id:'unlinked-rule',excerpt:'UNLINKED_SAVED_CITATION',official_url:'javascript:alert(1)',archived_file_url:'https://user:password@example.gov/file.pdf'}]}],
 source_evidence:{source},gaps:[{description:'GAP_TOKEN',reason:'Missing evidence'}],rule_counts:{approved:0,pending:1},draft_revision:{root_draft_id:'original',parent_draft_id:'earlier',parent_title:'Earlier fixture',revision_number:3,created_at:'2026-10-17T10:00:00Z'}};
 const row={id:'opened',title:'Opened packet fixture',status:'draft',created_date:'2026-10-17T10:01:00Z',reviewed_at:'2026-10-17T10:00:00Z',project_inputs:{address:'123 Fixture Lane',customer:'Saved fixture customer',signTypes:'Wall sign',dimensions:'4 ft × 8 ft',illuminated:false,electricalWork:true,exemptionStatus:'Unknown'},review_notes:'NOTE_BEGIN_TOKEN\\n'+ 'Long saved review notes and unresolved questions. '.repeat(2)+'\\nNOTE_END_TOKEN',snapshot};
 const legacy={id:'legacy',title:'Legacy packet fixture',status:'draft',snapshot:{jurisdiction:{jurisdiction_name:'Unresolved'},steps:[],gaps:[],rule_counts:{approved:0,pending:0}}};
 window.fixture={rows:JSON.parse(sessionStorage.getItem('planning-review-fixture')||'null')||[row,legacy],draftReads:0,forbidden:0,printCalls:0,failSave:true,saveCalls:0};window.fixture.originalOpened=JSON.stringify(window.fixture.rows.find(row=>row.id==='opened'));window.fixture.original=JSON.stringify(window.fixture.rows);
 window.print=()=>{window.fixture.printCalls++;};
 createRoot(document.getElementById('root')).render(<><p>UNRELATED_CLIENT_SECRET_TOKEN</p><Library onClose={()=>{}}/></>);`);
 vite=await createServer({configFile:false,root:scratch,plugins:[react()],resolve:{alias:[{find:'@/api/base44Client',replacement:path.join(scratch,'api.js')},{find:'@',replacement:path.join(root,'src')}]},server:{host:'127.0.0.1',port:0,fs:{allow:[root,scratch]}},logLevel:'error'});await vite.listen();const origin='http://127.0.0.1:'+vite.httpServer.address().port;
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 for(const width of [320,390,1280]){
 const page=await browser.newPage({viewport:{width,height:1000}}),errors=[],external=[];page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/*',route=>route.request().url().startsWith(origin)?route.continue():(external.push(route.request().url()),route.abort()));await page.goto(origin,{waitUntil:'networkidle'});
 const card=title=>page.locator('article').filter({has:page.getByRole('heading',{name:title,exact:true})});
 await card('Opened packet fixture').getByRole('button',{name:'Review draft',exact:true}).click();
 await page.getByRole('button',{name:'Expand all',exact:true}).click();
 let first=page.getByRole('region',{name:'Staff planning review for step 1',exact:true}),second=page.getByRole('region',{name:'Staff planning review for step 2',exact:true});
 await first.getByText('Not reviewed',{exact:true}).waitFor();await second.getByText('Reviewed for planning',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Create editable revision',exact:true}).click();
 const decision1=first.getByLabel('Planning decision for step 1',{exact:true});
 await first.getByRole('checkbox',{name:'Evidence follow-up for step 1',exact:true}).check();
 await first.getByRole('checkbox',{name:'Office / provider follow-up for step 1',exact:true}).check();
 await first.getByRole('checkbox',{name:'Documents / forms follow-up for step 1',exact:true}).check();
 assert.equal(await decision1.inputValue(),'needs_follow_up');
 const save=page.getByRole('button',{name:'Save revised permitting draft',exact:true});
 await page.getByRole('checkbox',{name:/I reviewed the proposed steps/}).check();assert.ok(await save.isDisabled());
 await first.getByLabel('Review reason for step 1',{exact:true}).fill('Confirm source version, issuer/inspection responsibility and forms.');
 const longNotes='REVIEW_NOTE_BEGIN '+ 'Detailed saved planning follow-up. '.repeat(70)+' REVIEW_NOTE_END';
 await first.getByLabel('Review notes for step 1',{exact:true}).fill(longNotes);
 await second.getByLabel('Planning decision for step 2',{exact:true}).selectOption('not_applicable_proposal');
 await second.getByLabel('Review reason for step 2',{exact:true}).fill('Proposed not applicable; office confirmation still needed.');
 await decision1.selectOption('reviewed_for_planning');await page.getByRole('checkbox',{name:/I reviewed the proposed steps/}).check();assert.ok(await save.isDisabled());
 await decision1.selectOption('needs_follow_up');
 // Both leave paths protect the editable review when the user cancels.
 page.once('dialog',dialog=>dialog.dismiss());await page.getByRole('button',{name:'Close',exact:true}).first().click();
 assert.equal(await first.getByLabel('Review notes for step 1',{exact:true}).inputValue(),longNotes);
 page.once('dialog',dialog=>dialog.dismiss());await page.getByRole('button',{name:'← Edit inputs',exact:true}).click();
 assert.equal(await first.getByLabel('Review notes for step 1',{exact:true}).inputValue(),longNotes);
 assert.equal(await page.evaluate(()=>window.dispatchEvent(new Event('beforeunload',{cancelable:true}))),false);
 await page.getByRole('checkbox',{name:/I reviewed the proposed steps/}).check();await save.click();
 await page.getByText('Synthetic review save failure',{exact:true}).waitFor();assert.equal(await first.getByLabel('Review notes for step 1',{exact:true}).inputValue(),longNotes);assert.ok(await save.isEnabled());
 await save.click();await page.getByRole('status').filter({hasText:'Saved permitting draft:'}).waitFor();
 await first.getByText(longNotes,{exact:true}).waitFor();assert.equal(await first.getByRole('combobox').count(),0);
 let result=await page.evaluate(()=>window.fixture),created=result.rows.find(row=>row.id==='review-revision-3');
 assert.equal(result.saveCalls,2);assert.equal(JSON.stringify(result.rows.find(row=>row.id==='opened')),result.originalOpened);
 assert.equal(created.snapshot.steps[0].staff_review.notes,longNotes);assert.equal(created.snapshot.steps[0].staff_review.decision,'needs_follow_up');
 assert.deepEqual(created.snapshot.steps[0].staff_review.follow_up,{evidence:true,office:true,documents:true});
 assert.equal(created.snapshot.steps[1].staff_review.decision,'not_applicable_proposal');
 assert.equal(created.snapshot.draft_revision.parent_draft_id,'opened');assert.equal(created.snapshot.draft_revision.revision_number,4);
 for(let i=0;i<2;i++){assert.equal(created.snapshot.steps[i].basis,result.rows[0].snapshot.steps[i].basis);assert.deepEqual(created.snapshot.steps[i].citations,result.rows[0].snapshot.steps[i].citations);}
 assert.deepEqual(created.snapshot.source_evidence,result.rows[0].snapshot.source_evidence);assert.deepEqual(created.snapshot.gaps,result.rows[0].snapshot.gaps);
 assert.equal(created.work_order_id,undefined);assert.equal(created.status,'draft');assert.equal(result.forbidden,0);
 assert.equal(await page.evaluate(()=>window.dispatchEvent(new Event('beforeunload',{cancelable:true}))),true);
 await page.getByRole('button',{name:'Show revision history & comparison',exact:true}).click();await page.getByRole('button',{name:'Load previous revision',exact:true}).click();
 await page.getByRole('region',{name:'Staff planning review comparison',exact:true}).getByText('REVIEW_NOTE_BEGIN',{exact:false}).waitFor();
 const packetButton=page.getByRole('button',{name:'Open saved review packet',exact:true});await packetButton.click();
 const packet=page.getByRole('dialog',{name:'Saved workflow review packet',exact:true});await packet.waitFor();
 await packet.getByText(longNotes,{exact:true}).waitFor();await packet.getByText('Needs follow-up',{exact:true}).waitFor();await packet.getByText('Proposed not applicable',{exact:true}).waitFor();
 if(width===1280){
  const bytes=await page.pdf({format:'Letter',printBackground:true,displayHeaderFooter:false});
  const pdf=await page.evaluate(data=>window.readPacketPdf(data),Array.from(bytes));
  for(const token of ['REVIEW_NOTE_BEGIN','REVIEW_NOTE_END','Needs follow-up','Proposed not applicable','CAPTURED_OLD_SOURCE','SAVED_ACTION_TOKEN'])assert.ok(pdf.text.includes(token),'Missing saved review PDF text: '+token);
  assert.ok(!pdf.text.includes('UNRELATED_CLIENT_SECRET_TOKEN'));checks.push({width,pdfPages:pdf.pages,pdf:'actual saved review annotations, long notes, evidence and uncertainty retained; unrelated UI excluded'});
 }
 await packet.getByRole('button',{name:'Return to saved draft',exact:true}).click();await page.waitForFunction(()=>document.activeElement?.textContent==='Open saved review packet');
 // Browser reload and reopen read only the created immutable record.
 const title=created.title;
 await page.reload({waitUntil:'networkidle'});await card(title).getByRole('button',{name:'Review draft',exact:true}).click();await page.getByRole('button',{name:'Expand all',exact:true}).click();
 first=page.getByRole('region',{name:'Staff planning review for step 1',exact:true});second=page.getByRole('region',{name:'Staff planning review for step 2',exact:true});
 await first.getByText(longNotes,{exact:true}).waitFor();await second.getByText('Proposed not applicable',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Create editable revision',exact:true}).click();
 await page.getByLabel('Office for step 2',{exact:true}).fill('Changed proposed electrical office');
 assert.equal(await second.getByLabel('Planning decision for step 2',{exact:true}).inputValue(),'needs_follow_up');
 assert.ok(await second.getByRole('checkbox',{name:'Office / provider follow-up for step 2',exact:true}).isChecked());
 await second.getByText(/proposed step changed after its review/).waitFor();
 await second.getByRole('checkbox',{name:'Office / provider follow-up for step 2',exact:true}).uncheck();
 await second.getByLabel('Planning decision for step 2',{exact:true}).selectOption('reviewed_for_planning');
 await second.getByLabel('Review reason for step 2',{exact:true}).fill('Revisited the changed proposed office for planning only.');
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 assert.ok((await second.getByLabel('Planning decision for step 2',{exact:true}).boundingBox()).height>=44);
 result=await page.evaluate(()=>window.fixture);assert.equal(result.forbidden,0);assert.equal(result.rows.length,3);
 assert.equal(result.rows.find(row=>row.id==='review-revision-3').snapshot.steps[1].staff_review.decision,'not_applicable_proposal');
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
 if(width===320)await page.screenshot({path:'/tmp/permitting-review-checklist-mobile.png'});
 page.once('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'Close',exact:true}).first().click();
 checks.push({width,passed:true,checks:'actual saved library/designer/revision/checklist/history/packet; missing legacy review explicit; reason and follow-up consistency gates; cancel leave preserves edits and unload guard; save failure/retry; immutable append preserving source/citations/basis/gaps; reload/reopen; print evidence and long review notes; changed proposal invalidates earlier review; no job/provider/AI/source calls or overflow'});
 console.log('PASS staff planning review '+width);await page.close();
 }
 await writeFile(path.join(root,'docs/permitting-workflow-planning-review-browser-2026-10-17.json'),JSON.stringify({mode:'actual UI and Chromium PDF; synthetic immutable draft API persisted in test-session storage for reload checks; production CSS; external requests blocked; not authenticated employee acceptance',checks},null,2)+'\n');
}finally{await browser?.close();await vite?.close();await rm(scratch,{recursive:true,force:true});}


import assert from 'node:assert/strict';
import {mkdtemp,writeFile,symlink,copyFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createServer} from 'vite';
import react from '@vitejs/plugin-react';
const {chromium}=await import('/tmp/permitting-browser-check/node_modules/playwright/index.mjs');
const root=process.cwd(),scratch=await mkdtemp(path.join(tmpdir(),'permitting-citation-evidence-'));let vite,browser;const checks=[];
try {
 await symlink(path.join(root,'node_modules'),path.join(scratch,'node_modules'),'dir');
 const css=(await readdir(path.join(root,'dist/assets'))).find(n=>n.endsWith('.css'));await copyFile(path.join(root,'dist/assets',css),path.join(scratch,'styles.css'));
 await writeFile(path.join(scratch,'index.html'),'<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"></head><body><div id="root"></div><script type="module" src="/main.jsx"></script></body></html>');
 await writeFile(path.join(scratch,'api.js'),`export const base44={entities:{
 PermittingWorkflowDraft:{filter:async()=>({items:window.fixture.rows,has_more:false,next_cursor:null}),get:async id=>structuredClone(window.fixture.ancestors[id])},
 PermittingSourceDocument:{filter:async(query,options)=>{window.fixture.reads.push({query,options});if(window.fixture.failSource)throw Error('Synthetic source failure');const row=window.fixture.sources[query.id];if(query.id==='slow')await new Promise(resolve=>setTimeout(resolve,500));return {items:row?[structuredClone(row)]:[]};}},
 },functions:{invoke:async(name,args)=>{window.fixture.textReads.push({name,args});if(name!=='getPermittingSourceTextPages')throw Error('Unexpected provider call');if(window.fixture.failText)throw Error('Synthetic text failure');return {data:{success:true,source_document_id:'source',source_sha256:'b'.repeat(64),archived_file_url:'https://example.gov/current.pdf',available_through:1,total_pages:1,complete_document_text:true,pages:[{page:1,source_document_id:'source',source_sha256:'b'.repeat(64),text_sha256:'c'.repeat(64),text:'Only CURRENT saved source page',truncated:false,needs_ocr_review:false}]}};}}};`);
 await writeFile(path.join(scratch,'main.jsx'),`import React from 'react';import {createRoot} from 'react-dom/client';import Library from '/@fs/app/src/components/permitting/PermittingDraftLibrary.jsx';
 const meta={id:'source',jurisdiction_id:'oh',title:'Retained sign code',file_hash_sha256:'b'.repeat(64),archived_file_url:'https://example.gov/current.pdf',file_bytes:1000,official_url:'https://example.gov/signs',content_status:'historical',superseded_by:'new-code-record',verification_status:'needs_verification',text_extraction_state:{pages_extracted:1}};
 const citation={source_document_id:'source',rule_id:'rule',section_or_page:'Page 1',physical_page:1,excerpt:'Opened snapshot quote '+ 'full retained evidence '.repeat(15),source_sha256:'b'.repeat(64),archived_file_url:meta.archived_file_url};
 const oldCitation={...citation,excerpt:'Earlier snapshot quote preserved exactly',source_sha256:'a'.repeat(64),archived_file_url:'https://example.gov/old.pdf'};
 const snapshot={jurisdiction:{jurisdiction_id:'oh',jurisdiction_name:'Fixture municipality',state:'OH'},summary:'Saved evidence prototype',steps:[{step_index:0,permit_type:'Confirm sign review',office:'Recorded zoning office',office_type:'Zoning',action:'Confirm current authority',basis:'pending_review',citations:[citation]},{step_index:1,permit_type:'Check evidence gaps',action:'Resolve source gaps',basis:'staff_confirmation_needed',citations:[{source_document_id:'missing',excerpt:'Missing source quote'},{source_document_id:'foreign',excerpt:'Foreign record quote'},{source_document_id:'legacy',excerpt:'Legacy quote',official_url:'javascript:alert(1)',archived_file_url:'https://user:password@example.gov/file.pdf'},{rule_id:'unlinked',excerpt:'Unlinked retained quote'},{source_document_id:'slow',excerpt:'Delayed source quote'}]}],gaps:[{description:'Confirm authority'}],rule_counts:{approved:0,pending:1},source_evidence:{source:{...meta,content_status:'current',superseded_by:''}}};
 const earlier={id:'earlier',title:'Earlier evidence draft',snapshot:{...structuredClone(snapshot),steps:[{...snapshot.steps[0],citations:[oldCitation]},snapshot.steps[1]],source_evidence:{source:{...meta,file_hash_sha256:'a'.repeat(64),archived_file_url:'https://example.gov/old.pdf'}}},review_notes:'Earlier question'};
 const opened={id:'opened',title:'Opened evidence draft',snapshot:{...snapshot,draft_revision:{root_draft_id:'earlier',parent_draft_id:'earlier',revision_number:2}},review_notes:'Opened question'};
 window.fixture={rows:[opened],ancestors:{earlier},sources:{source:meta,foreign:{...meta,id:'foreign',jurisdiction_id:'ky'},legacy:{id:'legacy',jurisdiction_id:'oh',title:'Legacy source record',official_url:'javascript:alert(1)'},slow:{...meta,id:'slow'}},reads:[],textReads:[],failSource:false,failText:false};
 window.fixture.unchanged=JSON.stringify({rows:window.fixture.rows,ancestors:window.fixture.ancestors});
 createRoot(document.getElementById('root')).render(<Library onClose={()=>{}}/>);`);
 vite=await createServer({configFile:false,root:scratch,plugins:[react()],resolve:{alias:[{find:'@/api/base44Client',replacement:path.join(scratch,'api.js')},{find:'@',replacement:path.join(root,'src')}]},server:{host:'127.0.0.1',port:0,fs:{allow:[root,scratch]}},logLevel:'error'});await vite.listen();const origin='http://127.0.0.1:'+vite.httpServer.address().port;
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 for(const width of [320,390,1280]){
 const page=await browser.newPage({viewport:{width,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const external=[];await page.route('**/*',route=>route.request().url().startsWith(origin)?route.continue():(external.push(route.request().url()),route.abort()));
 await page.goto(origin,{waitUntil:'networkidle'});
 await page.getByRole('heading',{name:'Opened evidence draft',exact:true}).waitFor();
 await page.getByRole('button',{name:'Review draft',exact:true}).click();
 await page.getByRole('button',{name:'Show revision history & comparison',exact:true}).click();
 await page.getByRole('button',{name:'Load previous revision',exact:true}).click();
 const comparison=page.getByRole('region',{name:'Saved revision comparison',exact:true});await comparison.waitFor();
 const earlierButton=comparison.getByRole('button',{name:'Open earlier citation 1 source',exact:true}).first();
 await earlierButton.click();
 let dialog=page.getByRole('dialog',{name:'Saved citation evidence',exact:true});
 await dialog.getByRole('heading',{name:'Source metadata differs or cannot match',exact:true}).waitFor();
 await dialog.getByText('Earlier snapshot quote preserved exactly',{exact:true}).waitFor();
 await dialog.getByText('The loaded source record must not be treated as the original cited version.',{exact:false}).waitFor();
 assert.equal(await dialog.getByRole('link',{name:'Open citation’s recorded archive',exact:true}).getAttribute('href'),'https://example.gov/old.pdf');
 assert.equal(await dialog.getByRole('link',{name:'Open loaded record’s retained copy',exact:true}).getAttribute('href'),'https://example.gov/current.pdf');
 assert.equal(await page.evaluate(()=>window.fixture.textReads.length),0);
 await dialog.getByRole('button',{name:'Inspect saved physical-page text',exact:true}).click();
 await dialog.getByText('Physical pages 1–1',{exact:false}).waitFor();
 await dialog.locator('summary').filter({hasText:'Physical page 1'}).click();
 await dialog.getByText('Only CURRENT saved source page',{exact:true}).waitFor();
 await dialog.getByText('Earlier snapshot quote preserved exactly',{exact:true}).waitFor();
 assert.ok(await dialog.evaluate(node=>node.scrollWidth<=node.clientWidth));
 await dialog.getByRole('button',{name:'Return to draft',exact:true}).click();
 assert.ok(await earlierButton.evaluate(node=>node===document.activeElement));
 assert.equal(await page.getByLabel('Review notes / questions to resolve').inputValue(),'Opened question');
 await comparison.getByRole('button',{name:'Open opened citation 1 source',exact:true}).first().click();
 dialog=page.getByRole('dialog',{name:'Saved citation evidence',exact:true});
 await dialog.getByRole('heading',{name:'Recorded archive fingerprint matches',exact:true}).waitFor();
 const fullQuote=await page.evaluate(()=>window.fixture.rows[0].snapshot.steps[0].citations[0].excerpt);
 await dialog.getByText(fullQuote,{exact:true}).waitFor();
 await dialog.getByText('Draft, historical or superseded context.',{exact:false}).waitFor();
 await dialog.getByText('Source review metadata changed since this draft',{exact:true}).waitFor();
 await dialog.getByRole('button',{name:'Inspect saved physical-page text',exact:true}).click();
 await dialog.getByText('Physical pages 1–1',{exact:false}).waitFor();
 await dialog.getByRole('button',{name:'Return to draft',exact:true}).click();
 // A missing source retains the citation, retries the same exact query and never chooses a title match.
 await comparison.getByRole('button',{name:'Open opened citation 1 source',exact:true}).nth(1).click();
 dialog=page.getByRole('dialog',{name:'Saved citation evidence',exact:true});
 await dialog.getByRole('alert').waitFor();await dialog.getByText('Missing source quote',{exact:true}).waitFor();
 await page.evaluate(()=>window.fixture.sources.missing={id:'missing',jurisdiction_id:'oh',title:'Recovered exact source'});
 await dialog.getByRole('button',{name:'Retry exact source',exact:true}).click();
 await dialog.getByRole('heading',{name:'Recovered exact source',exact:true}).waitFor();
 await dialog.getByRole('heading',{name:'Exact cited version is unverified',exact:true}).waitFor();
 await dialog.getByRole('button',{name:'Return to draft',exact:true}).click();
 await comparison.getByRole('button',{name:'Open opened citation 2 source',exact:true}).click();
 dialog=page.getByRole('dialog',{name:'Saved citation evidence',exact:true});await dialog.getByRole('alert').waitFor();assert.equal(await dialog.getByRole('region',{name:'Loaded exact source details'}).count(),0);
 await dialog.getByRole('button',{name:'Return to draft',exact:true}).click();
 await comparison.getByRole('button',{name:'Open opened citation 3 source',exact:true}).click();
 dialog=page.getByRole('dialog',{name:'Saved citation evidence',exact:true});await dialog.getByRole('heading',{name:'Source metadata differs or cannot match',exact:true}).waitFor();
 assert.equal(await dialog.getByRole('link').count(),0);
 await page.keyboard.press('Escape');await dialog.waitFor({state:'detached'});
 await comparison.getByRole('button',{name:'Open opened citation 4 source',exact:true}).click();
 dialog=page.getByRole('dialog',{name:'Saved citation evidence',exact:true});await dialog.getByText('No saved source record is linked to this citation.',{exact:true}).waitFor();
 await dialog.getByRole('button',{name:'Return to draft',exact:true}).click();
 // Closing an in-flight read and reopening another citation cannot apply the late response.
 await comparison.getByRole('button',{name:'Open opened citation 5 source',exact:true}).click();
 dialog=page.getByRole('dialog',{name:'Saved citation evidence',exact:true});await dialog.getByRole('status').filter({hasText:'Loading this exact saved source record'}).waitFor();
 await dialog.getByRole('button',{name:'Return to draft',exact:true}).click();
 await comparison.getByRole('button',{name:'Open opened citation 3 source',exact:true}).click();
 dialog=page.getByRole('dialog',{name:'Saved citation evidence',exact:true});await dialog.getByRole('heading',{name:'Legacy source record',exact:true}).waitFor();
 await page.waitForTimeout(600);assert.equal(await dialog.getByRole('heading',{name:'Retained sign code',exact:true}).count(),0);
 await dialog.getByRole('button',{name:'Return to draft',exact:true}).click();
 // The normal saved-step citation entry also stays inside the designer.
 await page.getByRole('button',{name:'Expand all',exact:true}).click();
 await page.getByRole('button',{name:'Open saved source details',exact:true}).first().click();
 dialog=page.getByRole('dialog',{name:'Saved citation evidence',exact:true});await dialog.getByRole('heading',{name:'Recorded archive fingerprint matches',exact:true}).waitFor();
 await dialog.getByRole('button',{name:'Return to draft',exact:true}).click();
 const result=await page.evaluate(()=>window.fixture);
 assert.ok(result.reads.every(read=>read.query.id&&read.query.jurisdiction_id==='oh'&&read.options.limit===1));
 assert.equal(result.reads.filter(read=>read.query.id==='missing').length,2);
 assert.equal(result.reads.filter(read=>!read.query.id).length,0);
 assert.equal(JSON.stringify({rows:result.rows,ancestors:result.ancestors}),result.unchanged);
 assert.equal(await page.getByRole('button',{name:/Create .*Permit Line/}).count(),0);
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
 checks.push({width,passed:true,checks:'actual library/designer/history, both snapshot citations and source contexts, fingerprint match/mismatch/unknown, full quotes, explicit page text reads, same-record retries, missing/foreign/unlinked source, unsafe URLs omitted, late read ignored, preserved draft/comparison/focus, no snapshot mutations or job actions or external requests or overflow'});console.log('PASS workflow source evidence '+width);await page.close();
 }
 await writeFile(path.join(root,'docs/permitting-workflow-source-evidence-browser-2026-10-17.json'),JSON.stringify({mode:'actual UI; synthetic saved draft/source/text API fixtures; production CSS; external requests blocked; not authenticated employee acceptance',checks},null,2)+'\n');
}finally{await browser?.close();await vite?.close();await rm(scratch,{recursive:true,force:true});}


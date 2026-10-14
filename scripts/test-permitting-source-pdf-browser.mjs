import assert from 'node:assert/strict';
import {mkdtemp,writeFile,symlink,copyFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createServer} from 'vite';
import react from '@vitejs/plugin-react';
const {chromium}=await import('/tmp/permitting-browser-check/node_modules/playwright/index.mjs');
function fixturePDF(){
 const stream='BT /F1 18 Tf 36 150 Td (Synthetic permitting retained source) Tj ET';
 const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 240] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>','<< /Length '+Buffer.byteLength(stream)+' >>\nstream\n'+stream+'\nendstream','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
 let body='%PDF-1.4\n',offsets=[0];for(let i=0;i<objects.length;i++){offsets.push(Buffer.byteLength(body));body+=(i+1)+' 0 obj\n'+objects[i]+'\nendobj\n';}
 const xref=Buffer.byteLength(body);body+='xref\n0 6\n0000000000 65535 f \n'+offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')+'trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n'+xref+'\n%%EOF';return Buffer.from(body);
}
const pdf=fixturePDF();
const root=process.cwd(),scratch=await mkdtemp(path.join(tmpdir(),'permitting-source-pdf-'));let vite,browser;const checks=[];
try{
 await symlink(path.join(root,'node_modules'),path.join(scratch,'node_modules'),'dir');
 await writeFile(path.join(scratch,'older.pdf'),pdf);await writeFile(path.join(scratch,'latest.pdf'),pdf);
 const css=(await readdir(path.join(root,'dist/assets'))).find(n=>n.endsWith('.css'));await copyFile(path.join(root,'dist/assets',css),path.join(scratch,'styles.css'));
 await writeFile(path.join(scratch,'index.html'),'<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"></head><body><div id="root"></div><script type="module" src="/main.jsx"></script></body></html>');
 await writeFile(path.join(scratch,'api.js'),`export const base44={entities:{
 PermittingRule:{filter:async(query,options)=>{window.fixture.reads.push({entity:'rules',query,options});return {items:query.jurisdiction_id==='fixture-populated'?window.fixture.rules:[]};}},
 SourceMonitorState:{filter:async(query,options)=>{window.fixture.reads.push({entity:'monitors',query,options});return {items:query.jurisdiction_id==='fixture-populated'?window.fixture.monitors:[]};}},
 PermittingSourceDocument:{filter:async(query,options)=>{
 window.fixture.reads.push({entity:'sources',query,options});
 if(query.jurisdiction_id!=='fixture-populated')return {items:[]};
 if(!query.id)return {items:window.fixture.sources.filter(row=>['listed','html','large','unsafe','missingcopy'].includes(row.id))};
 if(query.id==='failed'&&window.fixture.failSource){window.fixture.failSource=false;throw Error('Synthetic source failure');}
 if(query.id==='delayed')return await new Promise(resolve=>{window.fixture.pendingResolve=()=>resolve({items:[{id:'delayed',jurisdiction_id:'fixture-populated',title:'Late old jurisdiction source'}]});});
 return {items:window.fixture.sources.filter(row=>row.id===query.id)};
 }}},
 functions:{invoke:async()=>{window.fixture.calls++;throw Error('No provider calls allowed');}},integrations:{Core:{InvokeLLM:async()=>{window.fixture.calls++;throw Error('No AI allowed');}}}};`);
 await writeFile(path.join(scratch,'auth.js'),"export const useAuth=()=>({currentUser:{id:'fixture',email:'fixture@example.test',role:'user'},sessionToken:'fixture'});");
 await writeFile(path.join(scratch,'progress.js'),"export const useResearchProgress=()=>({runAction:()=>{window.fixture.calls++;throw Error('No research calls allowed');}});");
 const stubNames=['OfficialSourceRescans','ExternalPermittingReferrals','LocalityApprovedEvidence','CAGISSearchBar','DocumentAnalysisPanel','ExtractedContentDisplay','JurisdictionActivityTab','JurisdictionAuthorityStatus','PermitWorkflowDesigner'];
 const aliases=[];
 for(const name of stubNames){const file=path.join(scratch,name+'.jsx');await writeFile(file,'export default function Fixture(){return <p>'+name+' · isolated fixture</p>}');aliases.push({find:'./'+name,replacement:file});}
 await writeFile(path.join(scratch,'report.js'),"export const generateJurisdictionPDF=()=>{throw Error('Not requested');};");aliases.push({find:'./JurisdictionPDFReport',replacement:path.join(scratch,'report.js')});
 await writeFile(path.join(scratch,'main.jsx'),`import React,{useState} from 'react';import {createRoot} from 'react-dom/client';import Panel from '/@fs/app/src/components/permitting/JurisdictionDetailPanel.jsx';
 const roles=['sign_permit','zoning','building','electrical_permit','electrical_inspection','right_of_way','historic_review'].map((role,i)=>({role,label:['Sign permit','Zoning','Building','Electrical permit issuer','Electrical inspection provider','Right of way','Historic review'][i],office_name:i<2?'Example planning office':i===4?'Example inspection provider':'',applicability:'unknown',research_fields:i===4?{inspection_scheduling:'Schedule the final electrical inspection through the provider portal.'}:{}}));
 const populated={id:'fixture-populated',name:'Example Municipality',state:'OH',type:'city',verification_status:'needs_verification',website_url:'https://example.gov',documents:[{id:'form',title:'Example sign application',doc_type:'permit_application',url:'https://example.gov/sign.pdf',file_url:location.origin+'/latest.pdf'},{id:'profile-large',title:'Large collected PDF',doc_type:'sign_ordinance',url:'https://example.gov/profile-large.pdf',file_url:'https://example.gov/profile-large.pdf',stored_bytes:13*1024*1024}],permit_requirements:{requires_permit:false,fee_range:'Unverified example fee'},office_research:{method:'office-research-requirements-v1',researched_at:'2026-10-14T12:00:00Z',roles}};
 const empty={id:'fixture-empty',name:'Empty Municipality',state:'OH',type:'city',documents:[]};window.fixture={calls:0,reads:[],failSource:true,
 sources:[{id:'listed',jurisdiction_id:'fixture-populated',jurisdiction_profile_doc_id:'form',title:'Same sign application',source_type:'permit_application',official_url:'https://example.gov/sign.pdf',archived_file_url:location.origin+'/latest.pdf',content_status:'current',authority_classification:'application_form'},
 {id:'beyond',jurisdiction_id:'fixture-populated',jurisdiction_profile_doc_id:'form',title:'Very long retained historical source '+('abcdefghij'.repeat(25)),source_type:'permit_application',official_url:'https://example.gov/sign.pdf',archived_file_url:location.origin+'/older.pdf',content_status:'historical',authority_classification:'historical'},
 {id:'foreign',jurisdiction_id:'other-jurisdiction',title:'Wrong jurisdiction source',source_type:'permit_application'},
 {id:'failed',jurisdiction_id:'fixture-populated',title:'Recovered source',source_type:'checklist'},
 {id:'html',jurisdiction_id:'fixture-populated',title:'Retained web page',source_type:'portal_instruction',archived_file_url:'https://example.gov/retained.html'},
 {id:'large',jurisdiction_id:'fixture-populated',title:'Oversized retained PDF',source_type:'sign_ordinance',archived_file_url:'https://example.gov/large.pdf',file_bytes:13*1024*1024},
 {id:'unsafe',jurisdiction_id:'fixture-populated',title:'Unsafe retained URL',source_type:'other',archived_file_url:'javascript:example.pdf'},
 {id:'missingcopy',jurisdiction_id:'fixture-populated',title:'No retained copy',source_type:'checklist',official_url:'https://example.gov/missing.pdf'}],
 rules:[['found','Cited older source','beyond'],['missing','Cited missing source','missing'],['foreign','Cited foreign source','foreign'],['failed','Cited retry source','failed'],['delayed','Cited slow source','delayed'],['unlinked','Citation without source','']].map(([id,requirement,source])=>({id,requirement,status:'needs_review',citations:[{source_document_id:source,section_or_page:'Section 1',excerpt:'Synthetic cited excerpt',official_url:'https://example.gov/code'}]})),
 monitors:[{id:'m1',source_document_id:'listed',source_title:'Monitor linked source',staff_review_required:true},{id:'m2',source_title:'Monitor without link',staff_review_required:true}]
 };function App(){const [row,setRow]=useState(populated);return <div className="h-screen flex flex-col"><button className="min-h-11 shrink-0" onClick={()=>setRow(row.id===populated.id?empty:populated)}>Switch fixture</button><div className="min-h-0 flex-1"><Panel jurisdiction={row} onClose={()=>{}} onUpdate={()=>{throw Error('No writes allowed');}}/></div></div>}createRoot(document.getElementById('root')).render(<App/>);`);
 vite=await createServer({configFile:false,root:scratch,plugins:[react()],resolve:{alias:[...aliases,{find:'@/api/base44Client',replacement:path.join(scratch,'api.js')},{find:'@/components/auth/EmailGate',replacement:path.join(scratch,'auth.js')},{find:'./ResearchProgressContext',replacement:path.join(scratch,'progress.js')},{find:'@',replacement:path.join(root,'src')}]},server:{host:'127.0.0.1',port:0,fs:{allow:[root,scratch]}},logLevel:'error'});await vite.listen();const origin='http://127.0.0.1:'+vite.httpServer.address().port;
 browser=await chromium.launch({channel:'chromium',headless:process.env.PERMITTING_PDF_HEADED!=='1',ignoreDefaultArgs:['--disable-extensions'],args:['--no-sandbox']});
 for(const width of [320,390,1280]){
  const page=await browser.newPage({viewport:{width,height:1100}}),errors=[],outside=[];page.on('pageerror',e=>errors.push(e.message));
  let holdPDF=false;const heldRoutes=[];
  await page.context().route('**/*',route=>{const url=route.request().url();if(url.startsWith(origin)&&/\/(older|latest)\.pdf(?:[?#]|$)/.test(url)){if(holdPDF){heldRoutes.push(route);return;}return route.continue();}if(url.startsWith('http')&&!url.startsWith(origin)){outside.push(url);return route.abort();}return route.continue();});
  await page.goto(origin,{waitUntil:'networkidle'});
  const nav=page.getByRole('navigation',{name:'Jurisdiction workspace shortcuts'});await nav.waitFor();
  const catalog=page.getByRole('region',{name:'Document repository catalog'});
  await nav.getByRole('button',{name:/^Requirements/}).click();
  await page.getByText('Cited older source',{exact:true}).click();
  const rule=page.getByRole('region',{name:'Saved requirements and evidence'}).locator('details').filter({has:page.getByText('Cited older source',{exact:true})});
  await rule.getByRole('button',{name:'Open saved source details'}).click();
  const card=catalog.locator(':scope > details').filter({has:page.getByText('Source record: beyond',{exact:true})});
  await card.getByRole('button',{name:'Preview retained PDF',exact:true}).waitFor();
  const preview=page.getByRole('region',{name:'Retained PDF preview'});
  await card.getByRole('button',{name:'Preview retained PDF',exact:true}).click();
  await preview.getByText('The browser reported the frame loaded.',{exact:false}).waitFor();
  assert.ok(await preview.getByRole('button',{name:'Back',exact:true}).evaluate(node=>node===document.activeElement));
  assert.equal(await preview.locator('iframe').getAttribute('src'),origin+'/older.pdf#toolbar=1&navpanes=0&scrollbar=1');
  await preview.getByText('Retained copy · saved currentness: historical',{exact:false}).waitFor();
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  assert.ok(await preview.evaluate(node=>node.scrollWidth<=node.clientWidth));
  await page.waitForTimeout(750);
  await preview.locator('iframe').screenshot({path:'/tmp/permitting-source-pdf-frame-'+width+'.png'});
  await page.screenshot({path:'/tmp/permitting-source-pdf-'+width+'.png'});
  await preview.getByRole('button',{name:'Back',exact:true}).click();assert.equal(await preview.count(),0);
  assert.ok(await card.locator('summary').first().evaluate(node=>node===document.activeElement));
  await card.getByRole('button',{name:'Preview retained PDF',exact:true}).click();
  await preview.getByText('The browser reported the frame loaded.',{exact:false}).waitFor();
  await preview.getByRole('button',{name:'Preview not working?',exact:true}).click();
  await preview.getByText('PDF Preview Not Available',{exact:true}).waitFor();
  assert.ok(await preview.getByRole('button',{name:'Open PDF in New Tab',exact:true}).evaluate(node=>node===document.activeElement));
  await preview.getByRole('button',{name:'Retry PDF preview',exact:true}).click();
  await preview.getByText('The browser reported the frame loaded.',{exact:false}).waitFor();
  await preview.getByRole('button',{name:'Back',exact:true}).click();
  await page.clock.install();holdPDF=true;
  await card.getByRole('button',{name:'Preview retained PDF',exact:true}).click();
  await preview.getByText('Loading PDF preview…',{exact:true}).waitFor();
  await page.clock.runFor(12001);
  await preview.getByText('PDF preview timed out',{exact:true}).waitFor();assert.equal(await preview.locator('iframe').count(),0);
  holdPDF=false;for(const route of heldRoutes)await route.abort().catch(()=>{});
  await preview.getByRole('button',{name:'Retry PDF preview',exact:true}).click();
  await preview.getByText('The browser reported the frame loaded.',{exact:false}).waitFor();
  await preview.getByRole('button',{name:'Back',exact:true}).click();
  for(const title of ['Retained web page','Oversized retained PDF','Unsafe retained URL','No retained copy','Large collected PDF']){
    const row=catalog.locator(':scope > details').filter({has:page.getByText(title,{exact:true})});
    await row.locator('summary').first().click();
    assert.equal(await row.getByRole('button',{name:'Preview retained PDF',exact:true}).count(),0);
  }
  assert.equal(await catalog.getByText('Recorded file size exceeds the 12 MiB inline preview limit.',{exact:false}).count(),2);
  assert.equal(await catalog.locator('a[href^="javascript:"]').count(),0);
  // Existing profile PDF handoff uses the same real viewer.
  await page.getByRole('button',{name:'Expand Example sign application',exact:true}).click();
  await page.getByRole('button',{name:'Open Example sign application',exact:true}).click();
  await page.getByText('The browser reported the frame loaded.',{exact:false}).waitFor();
  assert.equal(await page.locator('iframe').getAttribute('src'),origin+'/latest.pdf#toolbar=1&navpanes=0&scrollbar=1');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.getByRole('button',{name:'Back',exact:true}).click();
  assert.ok(await page.getByRole('button',{name:'Open Example sign application',exact:true}).evaluate(node=>node===document.activeElement));
  // Reopen selected source after the parent viewer remounts the catalog.
  await nav.getByRole('button',{name:/^Requirements/}).click();
  await page.getByText('Cited older source',{exact:true}).click();await rule.getByRole('button',{name:'Open saved source details'}).click();
  await card.getByRole('button',{name:'Preview retained PDF',exact:true}).click();await preview.getByText('The browser reported the frame loaded.',{exact:false}).waitFor();
  await page.getByRole('button',{name:'Switch fixture',exact:true}).click();assert.equal(await page.locator('iframe').count(),0);
  await catalog.getByText('No saved sources or collected links found.',{exact:false}).waitFor();
  const reads=await page.evaluate(()=>window.fixture.reads);assert.ok(reads.every(r=>r.query.jurisdiction_id));
  assert.equal(await page.evaluate(()=>window.fixture.calls),0);assert.deepEqual(errors,[]);assert.deepEqual(outside,[]);
  checks.push({width,passed:true,checks:'actual catalog and PDF viewer; citation-to-catalog-only PDF, correct retained URL, historical context, responsive header, initial/back focus, native frame load, manual fallback/retry, 12s timeout/retry, size/non-PDF/unsafe/missing guards, existing profile viewer/back focus, jurisdiction switch closes frame, no writes/provider calls/overflow'});console.log('PASS retained source PDF '+width);await page.close();
 }
 await writeFile(path.join(root,'docs/permitting-source-pdf-browser-2026-10-14.json'),JSON.stringify({tested_at:new Date().toISOString(),mode:'actual parent, catalog and PDFViewer; actual requirements/monitor; synthetic metadata and valid one-page PDF; controlled browser frame responses/errors/time; production CSS; unrelated heavy children stubbed; not authenticated production acceptance',renderer:process.env.PERMITTING_PDF_HEADED==='1'?'full Chromium under Xvfb':'full Chromium headless',production_writes:0,checks},null,2)+'\n');
}finally{await browser?.close();await vite?.close();await rm(scratch,{recursive:true,force:true});}

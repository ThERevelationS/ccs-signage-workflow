import assert from 'node:assert/strict';
import {mkdtemp,writeFile,symlink,copyFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createServer} from 'vite';
import react from '@vitejs/plugin-react';
const {chromium}=await import('/tmp/permitting-browser-check/node_modules/playwright/index.mjs');
const root=process.cwd(),scratch=await mkdtemp(path.join(tmpdir(),'permitting-source-navigation-'));let vite,browser;const checks=[];
try{
 await symlink(path.join(root,'node_modules'),path.join(scratch,'node_modules'),'dir');
 const css=(await readdir(path.join(root,'dist/assets'))).find(n=>n.endsWith('.css'));await copyFile(path.join(root,'dist/assets',css),path.join(scratch,'styles.css'));
 await writeFile(path.join(scratch,'index.html'),'<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"></head><body><div id="root"></div><script type="module" src="/main.jsx"></script></body></html>');
 await writeFile(path.join(scratch,'api.js'),`export const base44={entities:{
 PermittingRule:{filter:async(query,options)=>{window.fixture.reads.push({entity:'rules',query,options});return {items:query.jurisdiction_id==='fixture-populated'?window.fixture.rules:[]};}},
 SourceMonitorState:{filter:async(query,options)=>{window.fixture.reads.push({entity:'monitors',query,options});return {items:query.jurisdiction_id==='fixture-populated'?window.fixture.monitors:[]};}},
 PermittingSourceDocument:{filter:async(query,options)=>{
 window.fixture.reads.push({entity:'sources',query,options});
 if(query.jurisdiction_id!=='fixture-populated')return {items:[]};
 if(!query.id)return {items:[window.fixture.sources[0]]};
 if(query.id==='failed'&&window.fixture.failSource){window.fixture.failSource=false;throw Error('Synthetic source failure');}
 if(query.id==='delayed')return await new Promise(resolve=>{window.fixture.pendingResolve=()=>resolve({items:[{id:'delayed',jurisdiction_id:'fixture-populated',title:'Late old jurisdiction source'}]});});
 return {items:window.fixture.sources.filter(row=>row.id===query.id)};
 }}},
 functions:{invoke:async()=>{window.fixture.calls++;throw Error('No provider calls allowed');}},integrations:{Core:{InvokeLLM:async()=>{window.fixture.calls++;throw Error('No AI allowed');}}}};`);
 await writeFile(path.join(scratch,'auth.js'),"export const useAuth=()=>({currentUser:{id:'fixture',email:'fixture@example.test',role:'user'},sessionToken:'fixture'});");
 await writeFile(path.join(scratch,'progress.js'),"export const useResearchProgress=()=>({runAction:()=>{window.fixture.calls++;throw Error('No research calls allowed');}});");
 const stubNames=['OfficialSourceRescans','ExternalPermittingReferrals','LocalityApprovedEvidence','PDFViewer','CAGISSearchBar','DocumentAnalysisPanel','ExtractedContentDisplay','JurisdictionActivityTab','JurisdictionAuthorityStatus','PermitWorkflowDesigner'];
 const aliases=[];
 for(const name of stubNames){const file=path.join(scratch,name+'.jsx');await writeFile(file,'export default function Fixture(){return <p>'+name+' · isolated fixture</p>}');aliases.push({find:'./'+name,replacement:file});}
 await writeFile(path.join(scratch,'report.js'),"export const generateJurisdictionPDF=()=>{throw Error('Not requested');};");aliases.push({find:'./JurisdictionPDFReport',replacement:path.join(scratch,'report.js')});
 await writeFile(path.join(scratch,'main.jsx'),`import React,{useState} from 'react';import {createRoot} from 'react-dom/client';import Panel from '/@fs/app/src/components/permitting/JurisdictionDetailPanel.jsx';
 const roles=['sign_permit','zoning','building','electrical_permit','electrical_inspection','right_of_way','historic_review'].map((role,i)=>({role,label:['Sign permit','Zoning','Building','Electrical permit issuer','Electrical inspection provider','Right of way','Historic review'][i],office_name:i<2?'Example planning office':i===4?'Example inspection provider':'',applicability:'unknown',research_fields:i===4?{inspection_scheduling:'Schedule the final electrical inspection through the provider portal.'}:{}}));
 const populated={id:'fixture-populated',name:'Example Municipality',state:'OH',type:'city',verification_status:'needs_verification',website_url:'https://example.gov',documents:[{id:'form',title:'Example sign application',doc_type:'permit_application',url:'https://example.gov/sign.pdf',file_url:'https://example.gov/latest.pdf'}],permit_requirements:{requires_permit:false,fee_range:'Unverified example fee'},office_research:{method:'office-research-requirements-v1',researched_at:'2026-10-14T12:00:00Z',roles}};
 const empty={id:'fixture-empty',name:'Empty Municipality',state:'OH',type:'city',documents:[]};window.fixture={calls:0,reads:[],failSource:true,
 sources:[{id:'listed',jurisdiction_id:'fixture-populated',jurisdiction_profile_doc_id:'form',title:'Same sign application',source_type:'permit_application',official_url:'https://example.gov/sign.pdf',archived_file_url:'https://example.gov/latest.pdf',content_status:'current',authority_classification:'application_form'},
 {id:'beyond',jurisdiction_id:'fixture-populated',jurisdiction_profile_doc_id:'form',title:'Same sign application',source_type:'permit_application',official_url:'https://example.gov/sign.pdf',archived_file_url:'https://example.gov/older.pdf',content_status:'historical',authority_classification:'historical'},
 {id:'foreign',jurisdiction_id:'other-jurisdiction',title:'Wrong jurisdiction source',source_type:'permit_application'},
 {id:'failed',jurisdiction_id:'fixture-populated',title:'Recovered source',source_type:'checklist'}],
 rules:[['found','Cited older source','beyond'],['missing','Cited missing source','missing'],['foreign','Cited foreign source','foreign'],['failed','Cited retry source','failed'],['delayed','Cited slow source','delayed'],['unlinked','Citation without source','']].map(([id,requirement,source])=>({id,requirement,status:'needs_review',citations:[{source_document_id:source,section_or_page:'Section 1',excerpt:'Synthetic cited excerpt',official_url:'https://example.gov/code'}]})),
 monitors:[{id:'m1',source_document_id:'listed',source_title:'Monitor linked source',staff_review_required:true},{id:'m2',source_title:'Monitor without link',staff_review_required:true}]
 };function App(){const [row,setRow]=useState(populated);return <div className="h-screen flex flex-col"><button className="min-h-11 shrink-0" onClick={()=>setRow(row.id===populated.id?empty:populated)}>Switch fixture</button><div className="min-h-0 flex-1"><Panel jurisdiction={row} onClose={()=>{}} onUpdate={()=>{throw Error('No writes allowed');}}/></div></div>}createRoot(document.getElementById('root')).render(<App/>);`);
 vite=await createServer({configFile:false,root:scratch,plugins:[react()],resolve:{alias:[...aliases,{find:'@/api/base44Client',replacement:path.join(scratch,'api.js')},{find:'@/components/auth/EmailGate',replacement:path.join(scratch,'auth.js')},{find:'./ResearchProgressContext',replacement:path.join(scratch,'progress.js')},{find:'@',replacement:path.join(root,'src')}]},server:{host:'127.0.0.1',port:0,fs:{allow:[root,scratch]}},logLevel:'error'});await vite.listen();const origin='http://127.0.0.1:'+vite.httpServer.address().port;
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 for(const width of [320,390,1280]){
  const page=await browser.newPage({viewport:{width,height:1100}}),errors=[],outside=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>{const url=route.request().url();if(url.startsWith('http')&&!url.startsWith(origin)){outside.push(url);return route.abort();}return route.continue();});
  await page.goto(origin,{waitUntil:'networkidle'});
  const nav=page.getByRole('navigation',{name:'Jurisdiction workspace shortcuts'});await nav.waitFor();
  const catalog=page.getByRole('region',{name:'Document repository catalog'});
  const requirements=page.getByRole('region',{name:'Saved requirements and evidence'});
  const rule=name=>requirements.locator('details').filter({has:page.getByText(name,{exact:true})});
  const openRule=async(name)=>{await nav.getByRole('button',{name:/^Requirements/}).click();const row=rule(name);if(!(await row.getAttribute('open')!==null))await row.locator('summary').click();return row;};
  await catalog.getByText('1 shown from 1 loaded entries.',{exact:false}).waitFor();
  await catalog.getByLabel('Search document catalog').fill('hide-everything');
  await catalog.getByLabel('Document type',{exact:true}).selectOption('permit_application');
  await (await openRule('Cited older source')).getByRole('button',{name:'Open saved source details'}).click();
  await catalog.getByText('Selected source: Same sign application',{exact:true}).waitFor();
  const selectedCard=catalog.locator(':scope > details').filter({has:page.getByText('Source record: beyond',{exact:true})});
  assert.equal(await selectedCard.count(),1);
  assert.ok(await selectedCard.locator('summary').first().evaluate(node=>node===document.activeElement));
  assert.equal(await catalog.getByLabel('Search document catalog').inputValue(),'');
  assert.equal(await catalog.getByLabel('Document type',{exact:true}).inputValue(),'all');
  assert.equal(await selectedCard.getByRole('link',{name:'Open retained copy'}).getAttribute('href'),'https://example.gov/older.pdf');
  assert.equal(await selectedCard.getByRole('button',{name:'Open collected search / PDF tools'}).count(),0);
  await selectedCard.getByText('Draft, historical or superseded context.',{exact:false}).waitFor();
  await selectedCard.locator('summary').first().click();assert.equal(await selectedCard.getAttribute('open'),null);
  await rule('Cited older source').getByRole('button',{name:'Open saved source details'}).click();
  await selectedCard.getByText('Saved classification: historical',{exact:false}).waitFor();
  assert.ok(await selectedCard.locator('summary').first().evaluate(node=>node===document.activeElement));
  await page.screenshot({path:'/tmp/permitting-source-navigation-'+width+'.png'});
  await (await openRule('Cited missing source')).getByRole('button',{name:'Open saved source details'}).click();
  await catalog.getByRole('alert').getByText('No linked source record found in this jurisdiction.',{exact:false}).waitFor();
  assert.equal(await catalog.getByText('Source record: beyond',{exact:true}).count(),0);
  await (await openRule('Cited foreign source')).getByRole('button',{name:'Open saved source details'}).click();
  await catalog.getByRole('alert').getByText('No linked source record found in this jurisdiction.',{exact:false}).waitFor();
  assert.equal(await catalog.getByText('Wrong jurisdiction source',{exact:true}).count(),0);
  await (await openRule('Cited retry source')).getByRole('button',{name:'Open saved source details'}).click();
  await catalog.getByRole('alert').getByText('The linked saved source could not be loaded.',{exact:false}).waitFor();
  await catalog.getByRole('button',{name:'Retry linked source'}).click();await catalog.getByText('Selected source: Recovered source',{exact:true}).waitFor();
  await catalog.getByRole('button',{name:'Clear source selection'}).click();assert.equal(await catalog.getByText('Selected source: Recovered source',{exact:true}).count(),0);
  const unlinked=await openRule('Citation without source');await unlinked.getByText('No saved source record linked to this citation.',{exact:false}).waitFor();assert.equal(await unlinked.getByRole('button',{name:'Open saved source details'}).count(),0);
  await nav.getByRole('button',{name:/^Source Monitoring/}).click();
  await page.getByRole('button',{name:'Monitor linked source Needs review',exact:true}).click();
  const monitor=page.locator('article').filter({has:page.getByRole('button',{name:'Monitor linked source Needs review',exact:true})});
  await monitor.getByText('Retained evidence',{exact:true}).waitFor();
  await monitor.getByRole('button',{name:'Review documents',exact:true}).click();
  await catalog.getByText('Linked source record: listed',{exact:true}).waitFor();await catalog.getByText('Selected source: Same sign application',{exact:true}).waitFor();
  const listed=catalog.locator(':scope > details').filter({has:page.getByText('Source record: listed',{exact:true})});
  assert.equal(await listed.getByRole('link',{name:'Open retained copy'}).getAttribute('href'),'https://example.gov/latest.pdf');
  assert.ok(await listed.locator('summary').first().evaluate(node=>node===document.activeElement));
  await nav.getByRole('button',{name:/^Source Monitoring/}).click();await page.getByRole('button',{name:'Monitor without link Needs review',exact:true}).click();
  const missingMonitor=page.locator('article').filter({has:page.getByRole('button',{name:'Monitor without link Needs review',exact:true})});
  await missingMonitor.getByText('No saved source record is linked to this monitor.',{exact:false}).waitFor();
  await missingMonitor.getByRole('button',{name:'Review documents',exact:true}).click();assert.equal(await catalog.getByText('Linked source record:',{exact:false}).count(),0);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await (await openRule('Cited slow source')).getByRole('button',{name:'Open saved source details'}).click();
  await catalog.getByText('Loading linked saved source…',{exact:true}).waitFor();await page.waitForFunction(()=>typeof window.fixture.pendingResolve==='function');
  await page.getByRole('button',{name:'Switch fixture',exact:true}).click();
  await nav.getByRole('button',{name:/^Documents/}).click();
  await catalog.getByText('No saved sources or collected links found.',{exact:false}).waitFor();
  await page.evaluate(()=>{window.fixture.pendingResolve();return new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));});
  assert.equal(await catalog.getByText('Late old jurisdiction source',{exact:true}).count(),0);
  assert.ok(await page.getByLabel('Documents workspace',{exact:true}).evaluate(node=>node===document.activeElement));
  const reads=await page.evaluate(()=>window.fixture.reads);assert.ok(reads.filter(r=>r.entity==='sources').every(r=>r.query.jurisdiction_id&&(!r.query.id?r.options.limit===200:r.options.limit===1)));assert.ok(reads.every(r=>!('jurisdiction_name' in r.query)));
  assert.ok(reads.some(r=>r.query.id==='beyond'&&r.query.jurisdiction_id==='fixture-populated'));
  assert.equal(await page.evaluate(()=>window.fixture.calls),0);assert.deepEqual(errors,[]);assert.deepEqual(outside,[]);
  checks.push({width,passed:true,checks:'actual parent/requirements/monitor/catalog; source ID navigation beyond list, identical titles and different archives, filter reset/open/focus/repeat, missing/foreign records, failure/retry, missing citation/monitor IDs, generic browse, late reads ignored on jurisdiction switch, canonical queries, no writes/provider calls/overflow'});console.log('PASS exact source navigation '+width);await page.close();
 }
 await writeFile(path.join(root,'docs/permitting-source-navigation-browser-2026-10-14.json'),JSON.stringify({tested_at:new Date().toISOString(),mode:'actual parent, requirements, source monitor and document catalog with production CSS; synthetic API; unrelated heavy children stubbed; external requests blocked; not authenticated production acceptance',production_writes:0,checks},null,2)+'\n');
}finally{await browser?.close();await vite?.close();await rm(scratch,{recursive:true,force:true});}

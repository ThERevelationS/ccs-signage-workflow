import assert from 'node:assert/strict';
import {mkdtemp,writeFile,symlink,copyFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createServer} from 'vite';
import react from '@vitejs/plugin-react';
const {chromium}=await import('/tmp/permitting-browser-check/node_modules/playwright/index.mjs');
const root=process.cwd(),scratch=await mkdtemp(path.join(tmpdir(),'permitting-workspace-'));let vite,browser;const checks=[];
try{
 await symlink(path.join(root,'node_modules'),path.join(scratch,'node_modules'),'dir');
 const css=(await readdir(path.join(root,'dist/assets'))).find(n=>n.endsWith('.css'));await copyFile(path.join(root,'dist/assets',css),path.join(scratch,'styles.css'));
 await writeFile(path.join(scratch,'index.html'),'<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"></head><body><div id="root"></div><script type="module" src="/main.jsx"></script></body></html>');
 await writeFile(path.join(scratch,'api.js'),"export const base44={entities:{PermittingRule:{filter:async()=>({items:[]})}},functions:{invoke:async()=>{window.fixture.calls++;throw Error('No provider calls allowed');}},integrations:{Core:{InvokeLLM:async()=>{window.fixture.calls++;throw Error('No AI allowed');}}}};");
 await writeFile(path.join(scratch,'auth.js'),"export const useAuth=()=>({currentUser:{id:'fixture',email:'fixture@example.test',role:'user'},sessionToken:'fixture'});");
 await writeFile(path.join(scratch,'progress.js'),"export const useResearchProgress=()=>({runAction:()=>{window.fixture.calls++;throw Error('No research calls allowed');}});");
 const stubNames=['OfficialSourceRescans','ExternalPermittingReferrals','LocalityApprovedEvidence','PDFViewer','CAGISSearchBar','DocumentAnalysisPanel','ExtractedContentDisplay','JurisdictionActivityTab','JurisdictionAuthorityStatus','SourceMonitorPanel','PermitWorkflowDesigner'];
 const aliases=[];
 for(const name of stubNames){const file=path.join(scratch,name+'.jsx');await writeFile(file,'export default function Fixture(){return <p>'+name+' · isolated fixture</p>}');aliases.push({find:'./'+name,replacement:file});}
 await writeFile(path.join(scratch,'report.js'),"export const generateJurisdictionPDF=()=>{throw Error('Not requested');};");aliases.push({find:'./JurisdictionPDFReport',replacement:path.join(scratch,'report.js')});
 await writeFile(path.join(scratch,'main.jsx'),`import React,{useState} from 'react';import {createRoot} from 'react-dom/client';import Panel from '/@fs/app/src/components/permitting/JurisdictionDetailPanel.jsx';
 const roles=['sign_permit','zoning','building','electrical_permit','electrical_inspection','right_of_way','historic_review'].map((role,i)=>({role,label:['Sign permit','Zoning','Building','Electrical permit issuer','Electrical inspection provider','Right of way','Historic review'][i],office_name:i<2?'Example planning office':i===4?'Example inspection provider':'',applicability:'unknown',research_fields:i===4?{inspection_scheduling:'Schedule the final electrical inspection through the provider portal.'}:{}}));
 const populated={id:'fixture-populated',name:'Example Municipality',state:'OH',type:'city',verification_status:'needs_verification',website_url:'https://example.gov',documents:[{id:'form',title:'Example sign application',doc_type:'permit_application',url:'https://example.gov/sign.pdf'}],permit_requirements:{requires_permit:false,fee_range:'Unverified example fee'},office_research:{method:'office-research-requirements-v1',researched_at:'2026-10-14T12:00:00Z',roles}};
 const empty={id:'fixture-empty',name:'Empty Municipality',state:'OH',type:'city',documents:[]};window.fixture={calls:0};function App(){const [row,setRow]=useState(populated);return <div className="h-screen flex flex-col"><button className="min-h-11 shrink-0" onClick={()=>setRow(row.id===populated.id?empty:populated)}>Switch fixture</button><div className="min-h-0 flex-1"><Panel jurisdiction={row} onClose={()=>{}} onUpdate={()=>{throw Error('No writes allowed');}}/></div></div>}createRoot(document.getElementById('root')).render(<App/>);`);
 vite=await createServer({configFile:false,root:scratch,plugins:[react()],resolve:{alias:[...aliases,{find:'@/api/base44Client',replacement:path.join(scratch,'api.js')},{find:'@/components/auth/EmailGate',replacement:path.join(scratch,'auth.js')},{find:'./ResearchProgressContext',replacement:path.join(scratch,'progress.js')},{find:'@',replacement:path.join(root,'src')}]},server:{host:'127.0.0.1',port:0,fs:{allow:[root,scratch]}},logLevel:'error'});await vite.listen();const origin='http://127.0.0.1:'+vite.httpServer.address().port;
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 for(const width of [320,390,1280]){
  const page=await browser.newPage({viewport:{width,height:1100}}),errors=[],outside=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>{const url=route.request().url();if(url.startsWith('http')&&!url.startsWith(origin)){outside.push(url);return route.abort();}return route.continue();});
  await page.goto(origin,{waitUntil:'networkidle'});
  const nav=page.getByRole('navigation',{name:'Jurisdiction workspace shortcuts'});await nav.waitFor();
  for(const [label,region] of [['Documents','Documents workspace'],['Offices & Electrical','Office and electrical research workspace'],['Requirements','Requirements workspace'],['Source Monitoring','Source monitoring workspace']]){
   const button=nav.getByRole('button',{name:new RegExp('^'+label)});assert.ok((await button.boundingBox()).height>=44);
   await button.click();const target=page.getByLabel(region,{exact:true});await target.waitFor();assert.ok(await target.evaluate(node=>node===document.activeElement));
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  }
  await nav.getByRole('button',{name:/^Offices & Electrical/}).click();assert.equal(await page.getByRole('region',{name:'Collected office research'}).locator('details').count(),7);
  await page.getByText('Electrical inspection provider: Example inspection provider',{exact:true}).click();
  await page.getByText('Schedule the final electrical inspection through the provider portal.',{exact:true}).waitFor();
  await nav.getByRole('button',{name:/^Requirements/}).click();await page.getByText('Permit required: No',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Switch fixture',exact:true}).click();
  await nav.getByRole('button',{name:/^Offices & Electrical/}).click();await page.getByText('Office research has not been collected yet.',{exact:true}).waitFor();
  await nav.getByRole('button',{name:/^Requirements/}).click();await page.getByRole('heading',{name:'Requirements not collected yet'}).waitFor();
  await nav.getByRole('button',{name:/^Documents/}).click();await page.getByText('No documents yet. Use the AI refresh to discover documents.',{exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>window.fixture.calls),0);assert.deepEqual(errors,[]);assert.deepEqual(outside,[]);
  checks.push({width,passed:true,checks:'four focused shortcuts, seven office roles/electrical details, explicit negative permit flag, empty-state navigation, no provider calls, no overflow'});console.log('PASS jurisdiction workspace '+width);await page.close();
 }
 await writeFile(path.join(root,'docs/permitting-workspace-browser-2026-10-14.json'),JSON.stringify({tested_at:new Date().toISOString(),mode:'actual detail panel/navigation/office findings and production CSS; synthetic data; unrelated heavy child surfaces stubbed; external requests blocked',production_writes:0,checks},null,2)+'\n');
}finally{await browser?.close();await vite?.close();await rm(scratch,{recursive:true,force:true});}

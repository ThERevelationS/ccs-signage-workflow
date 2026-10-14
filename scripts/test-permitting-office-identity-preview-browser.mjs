// Actual permitting components + app CSS in isolated Chromium. Mock SDK only; external requests blocked.
import assert from "node:assert/strict";
import {mkdtemp,writeFile,readFile,symlink,copyFile,readdir,rm,mkdir} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
import {createServer} from "vite";
import react from "@vitejs/plugin-react";
const {chromium}=await import(process.env.PERMITTING_PLAYWRIGHT_PATH || "/tmp/permitting-browser-check/node_modules/playwright/index.mjs");
const root=process.cwd(),scratch=await mkdtemp(path.join(tmpdir(),"permitting-identity-browser-"));
const reportPath=process.env.PERMITTING_BROWSER_REPORT || "docs/permitting-office-identity-browser-2026-10-14.json";
const receipt=JSON.parse(await readFile(path.join(root,"docs/official-evidence/ohio-sharonville-2026-10-07/publisher-identity-review-readback-2026-10-14.json"),"utf8"));
let vite,browser;const checks=[];
try {
 await symlink(path.join(root,"node_modules"),path.join(scratch,"node_modules"),"dir");
 const css=(await readdir(path.join(root,"dist/assets"))).find(n=>n.endsWith(".css"));
 assert.ok(css,"App build CSS required");await copyFile(path.join(root,"dist/assets",css),path.join(scratch,"styles.css"));
 await writeFile(path.join(scratch,"fixture.json"),JSON.stringify(receipt.candidate));
 await writeFile(path.join(scratch,"index.html"),'<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"></head><body><div id="root"></div><script type="module" src="/main.jsx"></script></body></html>');
 await writeFile(path.join(scratch,"api.js"),`
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==="object"?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
export const base44={entities:{GlobalSettings:{filter:async()=>{window.fixture.reads++;return [{id:"setting",updated_date:"catalog1",setting_value:{items:[structuredClone(window.fixture.original)]}}];}}},functions:{invoke:async(name,body)=>{
 window.fixture.calls.push({name,body});if(name!=="permittingOfficeCandidate" || body.action!=="identity_preview"){window.fixture.writes++;throw Error("Unexpected action");}
 const mode=window.fixture.mode,office=structuredClone(window.fixture.original),historical=structuredClone(office.office_candidate_registration.snapshot),fresh=structuredClone(historical);
 fresh.source.authority_classification="administrative_guidance";
 const snapshot={catalog:{id:"setting",updated_date:"catalog1"},office,historical_registration:historical,current_evidence:fresh,source_updated_date:"source1",profile_updated_date:"profile1"};
 const hash=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(JSON.stringify(canonical(snapshot))));
 const result={success:true,dry_run:true,status:"identity_review_only",review_snapshot:snapshot,review_snapshot_sha256:Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,"0")).join(""),unresolved_identity:["Printed publisher, parent department and child division require reconciliation.","Alias equivalence unresolved."],identity_verified:false,authority_verified:false,source_currentness_verified:false,contacts_verified:false,commercial_sign_scope_verified:false,delegation_verified:false,address_authority_resolved:false,production_writes:0,llm_calls:0};
 await new Promise(r=>setTimeout(r,mode==="slow"?800:250));window.fixture.completed++;
 if(mode==="conflict")throw Error("Synthetic source changed during review");
 if(mode==="digest")result.review_snapshot_sha256="b".repeat(64);
 if(mode==="approved")result.identity_verified=true;
 return {data:result};
}}};
`);
 await writeFile(path.join(scratch,"main.jsx"),`
import React,{useState} from "react";import {createRoot} from "react-dom/client";import original from "./fixture.json";
import Panel from "/@fs${root}/src/components/permitting/OfficeCandidateEvidencePanel.jsx";
window.fixture={original,reads:0,calls:[],completed:0,writes:0,mode:"ok"};
function Fixture(){const [office,setOffice]=useState(original),[show,setShow]=useState(true);return <main className="p-3 max-w-3xl mx-auto space-y-3"><h1>Isolated identity preview acceptance</h1>
<nav className="flex flex-wrap gap-2">{["ok","slow","conflict","digest","approved"].map(mode=><button className="min-h-11 border p-2" key={mode} onClick={()=>window.fixture.mode=mode}>Mode {mode}</button>)}
<button className="min-h-11 border p-2" onClick={()=>setOffice({...original,contact_notes:"Unsaved staff draft"})}>Edit draft</button>
<button className="min-h-11 border p-2" onClick={()=>setOffice(original)}>Restore selection</button>
<button className="min-h-11 border p-2" onClick={()=>setShow(false)}>Close panel</button></nav>
{show && <Panel office={office}/>}</main>;}
createRoot(document.getElementById("root")).render(<Fixture/>);
`);
 vite=await createServer({configFile:false,root:scratch,plugins:[react()],resolve:{alias:[{find:"@/api/base44Client",replacement:path.join(scratch,"api.js")}]},server:{host:"127.0.0.1",port:0,fs:{allow:[root,scratch]}},logLevel:"error"});
 await vite.listen();const origin="http://127.0.0.1:"+vite.httpServer.address().port;
 browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
 const preview=page=>page.getByRole("button",{name:"Preview saved identity evidence",exact:true});
 const section=page=>page.getByRole("region",{name:"Fresh saved identity evidence preview"});
 async function check(name,width,run){
  const page=await browser.newPage({viewport:{width,height:900}}),errors=[],outside=[];
  page.setDefaultTimeout(5000);
  page.on("pageerror",e=>errors.push(e.message));
  await page.route("**/*",route=>{const url=route.request().url();if(url.startsWith("http")&&!url.startsWith(origin)){outside.push(url);return route.abort();}return route.continue();});
  try{await page.goto(origin,{waitUntil:"networkidle"});await preview(page).waitFor();await run(page);
   assert.deepEqual(errors,[]);assert.deepEqual(outside,[]);assert.equal(await page.evaluate(()=>window.fixture.writes),0);
   checks.push({name,width,passed:true});console.log("PASS "+name+" "+width);
  }catch(error){checks.push({name,width,passed:false,error:error.message});console.log("FAIL "+name+" "+width+": "+error.message);}
  finally{await page.close();}
 }
 for(const width of [320,390,1280]){
  await check("layout and tap target",width,async page=>{
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),"horizontal overflow");
   assert.equal(await page.evaluate(()=>window.fixture.reads),0);assert.equal(await page.evaluate(()=>window.fixture.calls.length),0);
   const box=await preview(page).boundingBox();assert.ok(box.height>=44,"Preview tap target is "+box.height+"px; requires at least 44px");
   assert.ok(await page.getByRole("link",{name:"Official proof page (new tab)"}).count()===2);
  });
  await check("keyboard preview and readable snapshot",width,async page=>{
   await preview(page).focus();await page.keyboard.press("Enter");await page.keyboard.press("Enter");
   await section(page).getByText(/Read-only preview received/).waitFor();
   assert.equal(await page.evaluate(()=>window.fixture.calls.length),1);assert.equal(await page.evaluate(()=>window.fixture.reads),1);
   assert.ok(await section(page).getByText("administrative_guidance",{exact:true}).isVisible());
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),"snapshot overflow");
   await mkdir(path.join(root,"docs/permitting-identity-browser-screenshots"),{recursive:true});
   await section(page).screenshot({path:path.join(root,"docs/permitting-identity-browser-screenshots/preview-"+width+".png")});
  });
 }
 await check("unsaved draft refused without invocation",390,async page=>{
  await page.getByRole("button",{name:"Edit draft",exact:true}).click();await preview(page).click();
  await page.getByRole("alert").filter({hasText:"differs from the saved catalog"}).waitFor();
  assert.equal(await page.evaluate(()=>window.fixture.calls.length),0);
 });
 await check("late result and return to old selection stay hidden",390,async page=>{
  await page.getByRole("button",{name:"Mode slow",exact:true}).click();await preview(page).click();
  await page.waitForFunction(()=>window.fixture.calls.length===1);
  await page.getByRole("button",{name:"Edit draft",exact:true}).click();await page.waitForFunction(()=>window.fixture.completed===1);
  assert.equal(await section(page).getByText(/Read-only preview received/).count(),0);
  await page.getByRole("button",{name:"Restore selection",exact:true}).click();assert.ok(await preview(page).isEnabled());
  assert.equal(await section(page).getByText(/Read-only preview received/).count(),0);
 });
 for(const mode of ["conflict","digest","approved"])await check("explicit "+mode+" failure",390,async page=>{
  await page.getByRole("button",{name:"Mode "+mode,exact:true}).click();await preview(page).click();
  await page.getByRole("alert").waitFor();assert.equal(await section(page).getByText(/Read-only preview received/).count(),0);
  assert.ok(await preview(page).isEnabled());assert.equal(await page.evaluate(()=>window.fixture.calls.length),1);
 });
 await check("panel closure suppresses late response",390,async page=>{
  await page.getByRole("button",{name:"Mode slow",exact:true}).click();await preview(page).click();await page.waitForFunction(()=>window.fixture.calls.length===1);
  await page.getByRole("button",{name:"Close panel",exact:true}).click();await page.waitForFunction(()=>window.fixture.completed===1);
  assert.equal(await section(page).count(),0);
 });
 const report={tested_at:new Date().toISOString(),browser:browser.version(),mode:"isolated Chromium; actual components and app CSS; synthetic SDK; all external HTTP blocked",production_writes:0,live_endpoint_verified:false,checks};
 await writeFile(path.join(root,reportPath),JSON.stringify(report,null,2)+"\n");
 console.log(checks.filter(c=>c.passed).length+"/"+checks.length+" Chromium checks passed");
 if(checks.some(c=>!c.passed))process.exitCode=1;
}finally{await browser?.close();await vite?.close();await rm(scratch,{recursive:true,force:true});}

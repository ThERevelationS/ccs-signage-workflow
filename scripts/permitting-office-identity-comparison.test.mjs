import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import crypto from "node:crypto";
import { build } from "esbuild";
const bundle=await build({entryPoints:["src/components/permitting/officeIdentityComparison.mjs"],bundle:true,write:false,format:"esm",platform:"node"});
const {officeIdentityComparison:compare}=await import("data:text/javascript;base64,"+Buffer.from(bundle.outputFiles[0].text).toString("base64"));
const receipt=JSON.parse(fs.readFileSync("docs/official-evidence/ohio-sharonville-2026-10-07/publisher-identity-review-readback-2026-10-14.json","utf8"));
const packets=JSON.parse(fs.readFileSync("src/components/permitting/officeIdentityComparisonEvidence.json","utf8"));
const fixture=()=>structuredClone(receipt.candidate);
const now=Date.parse("2026-10-14T13:00:00Z");
test("exact comparison binds historical registration without mutating it",()=>{
 const office=fixture(),before=JSON.stringify(office),c=compare(office,packets,now);
 assert.equal(c.warning,"");assert.equal(c.observations.length,2);assert.equal(c.observedOnly,true);
 assert.ok(c.unresolved.includes("Alias equivalence is unresolved"));
 assert.equal(c.guideContact.physical_page,2); assert.equal(JSON.stringify(office),before);
});
test("retained official HTML bytes and literal labels match each proof",()=>{
 for(const proof of packets[0].observations){
  const bytes=fs.readFileSync(proof.repo_path);
  assert.equal(bytes.length,proof.bytes);assert.equal(crypto.createHash("sha256").update(bytes).digest("hex"),proof.sha256);
  const html=bytes.toString().replaceAll("&amp;","&");
  for(const quote of proof.quotes) assert.ok(html.includes(quote),quote);
  assert.ok(html.includes("ameyer@cityofsharonville.com"));
 }
});
test("every binding mismatch suppresses proof instead of fallback guessing",()=>{
 const mutations=[
  o=>o.government_office_id="other",o=>o.name="renamed",
  o=>o.office_candidate_registration.registration_key="other",
  ...["id","name","state","type"].map(k=>o=>o.office_candidate_registration.snapshot.profile[k]="other"),
  ...["id","jurisdiction_id","file_hash_sha256","official_url"].map(k=>o=>o.office_candidate_registration.snapshot.source[k]="other"),
  o=>o.office_candidate_registration.snapshot.archive_document_id="other",
  ...["excerpt","physical_page","text_sha256"].map(k=>o=>o.office_candidate_registration.snapshot.proof[k]="other"),
 ];
 for(const mutate of mutations){const o=fixture();mutate(o);const c=compare(o,packets,now);assert.ok(c.warning);assert.equal(c.observations.length,0);}
 assert.equal(compare({id:"unrelated"},packets,now),null);
});
test("stale and future observations never gain currentness or initiate work",()=>{
 for(const time of [Date.parse("2026-11-15T13:00:00Z"),Date.parse("2026-10-13T13:00:00Z")]){
  const c=compare(fixture(),packets,time);assert.ok(c.warning.includes("Recheck"));assert.equal(c.observedOnly,true);
 }
});
test("unsafe incomplete external proof metadata is withheld",()=>{
 for(const change of [
  p=>p.observations[0].url="javascript:alert(1)",
  p=>p.observations[0].url="https://other.gov/proof",
  p=>p.observations[0].sha256="fake",
  p=>p.observations[0].observed_at="yesterday",
  p=>p.observations[0].quotes=[],
  p=>p.observations[0].bytes=0,
  p=>p.method="other",
 ]){const ps=structuredClone(packets);change(ps[0]);const c=compare(fixture(),ps,now);assert.ok(c.warning);assert.equal(c.observations.length,0);}
});
test("actual comparison markup separates names, dates and contact boundaries",async()=>{
 const b=await build({entryPoints:["src/components/permitting/OfficeIdentityComparisonPanel.jsx"],bundle:true,write:false,format:"esm",platform:"node",jsx:"automatic",external:["react","react/jsx-runtime"]});
 const path="scripts/.office-comparison-test-bundle.mjs";fs.writeFileSync(path,b.outputFiles[0].text);
 let Panel;try{Panel=(await import("../"+path+"?t="+Date.now())).default;}finally{fs.unlinkSync(path);}
 const React=(await import("react")).default,{renderToStaticMarkup}=await import("react-dom/server");
 const html=renderToStaticMarkup(React.createElement(Panel,{office:fixture()}));
 assert.ok(html.includes("Parent department:"));assert.ok(html.includes("Child division:"));
 assert.ok(html.includes("2026-10-14T12:22:43.754Z"));
 assert.ok(html.includes("not a permit inbox"));assert.ok(html.includes("do not corroborate"));
 assert.ok(html.includes("not a fresh website check"));assert.ok(!/<button|<input|<textarea/.test(html));
});

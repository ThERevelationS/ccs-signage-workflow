import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { build } from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { officeCandidateEvidence } from "../src/components/permitting/officeCandidateEvidence.mjs";

const receipt = JSON.parse(fs.readFileSync("docs/official-evidence/ohio-sharonville-2026-10-07/publisher-identity-review-readback-2026-10-14.json", "utf8"));
const fixture = () => structuredClone(receipt.candidate);
const bundle = await build({entryPoints:["src/components/permitting/OfficeCandidateEvidencePanel.jsx"],bundle:true,write:false,format:"esm",platform:"node",jsx:"automatic",external:["react","react/jsx-runtime"]});
const temporary = "scripts/.office-candidate-panel-test-bundle.mjs";
fs.writeFileSync(temporary,bundle.outputFiles[0].text);
let Panel;
try { Panel = (await import("../"+temporary+"?t="+Date.now())).default; } finally { fs.unlinkSync(temporary); }
const render = office => renderToStaticMarkup(React.createElement(Panel,{office}));

test("exact registered lineage remains historical and read-only",()=>{
 const office=fixture(),before=JSON.stringify(office),e=officeCandidateEvidence(office);
 assert.equal(e.gaps.length,0); assert.equal(e.physicalPage,7);
 assert.equal(e.sourceId,receipt.source.id); assert.equal(e.profileId,receipt.profile.id);
 assert.equal(e.classification,"unknown_review_required");
 assert.equal(JSON.stringify(office),before);
 const html=render(office);
 assert.ok(html.includes(e.printedName)); assert.ok(html.includes(e.archiveDocumentId));
 assert.ok(html.includes("Not established by this registration"));
 assert.ok(html.includes("makes no fresh source check"));
 assert.ok(!/<button|<input|<textarea|<select/.test(html));
 assert.equal(JSON.stringify(office),before);
});
test("legacy offices have no fabricated registration",()=>{
 assert.equal(officeCandidateEvidence({id:"legacy",name:"Legacy"}),null);
 assert.equal(render({id:"legacy",name:"Legacy"}),"");
});
test("incomplete and malformed registration stays visible with gaps",()=>{
 for(const registration of [{},[],{snapshot:{proof:{physical_page:-1,text_sha256:"fake"},source:{id:"s",jurisdiction_id:"wrong"},profile:{id:"p"}}}]){
  const office={id:"candidate",name:"Office",office_candidate_registration:registration};
  assert.ok(officeCandidateEvidence(office).gaps.length>0);
  assert.ok(render(office).includes("Evidence needs attention"));
 }
});
test("renamed catalog and mismatched identifiers do not silently reconcile",()=>{
 const office=fixture(); office.name="Building & Zoning Division"; office.government_office_id="different";
 const e=officeCandidateEvidence(office);
 assert.ok(e.gaps.some(x=>x.includes("identifiers")));
 assert.ok(e.gaps.some(x=>x.includes("differs from the printed")));
 assert.notEqual(e.currentName,e.printedName);
 assert.ok(render(office).includes("Building &amp; Zoning Division"));
});
test("unsafe links are never navigable and quotes are escaped",()=>{
 for(const url of ["javascript:alert(1)","http://example.com","https://user:secret@example.com","/relative","https://example.com/\u0000"]){
  const office=fixture(); office.office_candidate_registration.snapshot.source.official_url=url;
  const e=officeCandidateEvidence(office); assert.equal(e.officialHref,"");
  assert.ok(!render(office).includes('href="'+url+'"'));
 }
 const office=fixture(); office.office_candidate_registration.snapshot.proof.excerpt='<script>alert("x")</script>';
 assert.ok(!render(office).includes("<script>"));
});
test("editor displays evidence before verification without new writes or imports",()=>{
 const editor=fs.readFileSync("src/components/permitting/OfficeCatalogEditor.jsx","utf8");
 assert.ok(editor.indexOf("<OfficeCandidateEvidencePanel office={office} />")<editor.indexOf("Canonical office verification"));
 const panel=fs.readFileSync("src/components/permitting/OfficeCandidateEvidencePanel.jsx","utf8");
 assert.ok(!/base44|onChange|onClick|useEffect/.test(panel));
});

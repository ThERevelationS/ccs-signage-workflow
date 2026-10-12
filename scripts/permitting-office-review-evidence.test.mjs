import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import vm from "node:vm";
import { buildSync } from "esbuild";
import { localityOfficeReviewEvidence as evidence, safeOfficeEvidenceUrl as safe } from "../src/components/permitting/localityOfficeReviewEvidence.js";
import { resolveCatalogOfficeProvenance as resolve } from "../src/components/permitting/localityOfficeCatalogBridge.js";
const office = {id:"local", authority_roles:["electrical_permit"], authority_verification_status:"staff_verified", authority_verified_by:"Reviewer", authority_verified_at:"2026-10-12T12:00:00Z", authority_verification_notes:"Issuer confirmed; inspection unresolved."};
test("issuer and inspection evidence remain separate without mutating saved fields",()=>{
 const before=structuredClone(office), result=evidence(office,null);
 assert.deepEqual(result.electrical.map(row=>row.status),["Staff verified","Not assigned"]);
 assert.equal(result.notes,office.authority_verification_notes);assert.equal(result.reviewer,"Reviewer");assert.deepEqual(office,before);
});
test("shared verification cannot promote locality roles or copied website",()=>{
 const result=evidence({authority_roles:["electrical_inspection"],contact_website:"https://example.org"},{metadata:{verification_status:"staff_verified",source_url:"https://example.org/source",verification_notes:"Shared identity only"}});
 assert.deepEqual(result.electrical.map(row=>row.status),["Not assigned","Needs review"]);assert.equal(result.reviewer,"");assert.equal(result.sharedNotes,"Shared identity only");
});
test("unsupported roles and revoked status suppress prior review attribution",()=>{
 for(const row of [{...office,authority_roles:["electrical_permit","unknown"]},{...office,authority_verification_status:"needs_verification"}]){
 const result=evidence(row,null);assert.equal(result.electrical[0].status,"Needs review");assert.equal(result.reviewer,"");assert.equal(result.reviewedAt,"");
 }
});
test("broad electrical category cannot fill either specific responsibility",()=>{
 assert.deepEqual(evidence({office_type:"Electrical Inspectors",authority_roles:["electrical"],authority_verification_status:"staff_verified"},null).electrical.map(row=>row.status),["Not assigned","Not assigned"]);
});
test("unsafe and credential-bearing links are excluded",()=>{
 for(const url of ["javascript:alert(1)","data:text/html,bad","file:///tmp/example","//example.org","https://user:secret@example.org","bad",""])assert.equal(safe(url),"");
 assert.equal(safe(" https://example.org/source "),"https://example.org/source");
});
test("ambiguous stable catalog identity exposes no shared evidence",()=>{
 const catalog=[{id:"a",government_office_id:"gov",government_office:{source_url:"https://example.org/a"}},{id:"b",government_office_id:"gov",government_office:{source_url:"https://example.org/b"}}];
 assert.equal(evidence(office,resolve(catalog,{catalog_office_id:"a"})).sharedSource,"");
});
test("actual evidence panel renders escaped notes and safe separated links",()=>{
 const require=createRequire(import.meta.url), output=buildSync({entryPoints:["src/components/permitting/LocalityOfficeReviewEvidence.jsx"],bundle:true,write:false,format:"cjs",platform:"node",jsx:"automatic",external:["react","react/jsx-runtime"]}).outputFiles[0].text;
 const module={exports:{}};vm.runInNewContext(output,{module,exports:module.exports,require,URL});
 const React=require("react"), {renderToStaticMarkup}=require("react-dom/server");
 const html=renderToStaticMarkup(React.createElement(module.exports.default,{office:{...office,authority_verification_notes:"<script>bad</script>",contact_website:"javascript:alert(1)"},provenance:{metadata:{source_url:"https://example.org/source"}}}));
 assert.match(html,/Electrical permit issuer/);assert.match(html,/Electrical inspection provider/);assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<script>|javascript:|Open office website/);assert.match(html,/noopener noreferrer/);assert.match(html,/reference material/);
});

import test from "node:test";
import assert from "node:assert/strict";
import {build} from "esbuild";
import {ruleFixture} from "./permitting-rule-evidence-fixture.mjs";
import {assembledSourceText,textSha256} from "../base44/shared/jurisdictionSourcePdfText.mjs";
import {registerOfficeCandidate,previewOfficeCandidateIdentity} from "../base44/shared/permittingOfficeCandidate.mjs";
import {evidenceDigest} from "../base44/shared/permittingRuleEvidence.mjs";
const clone=v=>structuredClone(v);
async function setup(){
 const f=await ruleFixture({source:{authority_classification:"unknown_review_required",content_status:"unknown",verification_status:"needs_verification",jurisdiction_profile_doc_id:"doc",issuing_office:null}});
 const text="Pilot Planning Department Office\nPermit intake details require review.";
 const page={...f.page,text,text_sha256:await textSha256(new TextEncoder().encode(text))};
 f.patchSource({extracted_pages:[page],extracted_text:assembledSourceText(f.source(),[page])});
 const s=f.source(),profile={id:"profile",name:"Pilot",state:"OH",type:"city",updated_date:"profile1",documents:[{id:"doc",url:s.official_url,file_url:s.archived_file_url,source_sha256:s.file_hash_sha256,stored_sha256:s.file_hash_sha256,source_bytes:s.file_bytes,stored_bytes:s.file_bytes}]};
 const row={id:"setting",setting_key:"permitOfficeCatalog",updated_date:"catalog1",setting_value:{items:[]}};
 let filters=0,sourceGets=0,onFilter,onSource;let writes=0;
 const rejectWrite=()=>{writes++;throw Error("Unexpected write");};
 const deps={sourceEntity:{get:async()=>{sourceGets++;if(onSource)onSource(sourceGets);return clone(f.source());},create:rejectWrite,updateMany:rejectWrite},
  profileEntity:{get:async()=>clone(profile),updateMany:rejectWrite},segmentEntity:f.api.segmentEntity,
  settingsEntity:{filter:async()=>{filters++;if(onFilter)onFilter(filters);return [clone(row)];},updateMany:rejectWrite}};
 const p=await registerOfficeCandidate(deps,{input:{source_document_id:"source",office_name:"Pilot Planning Department Office",physical_page:1,publisher_quote:"Pilot Planning Department Office"},dryRun:true});
 row.setting_value.items.push({...p.proposal,office_candidate_registration:{...p.proposal.office_candidate_registration,registered_by:"admin@example.test",registered_at:"2026-10-14"}});
 filters=0;sourceGets=0;
 const input={officeId:p.proposal.id,registrationKey:p.expected_evidence_digest,expectedCatalogVersion:"catalog1"};
 const preview=()=>previewOfficeCandidateIdentity(deps,input);
 return {f,row,profile,deps,input,preview,writes:()=>writes,onFilter:fn=>onFilter=fn,onSource:fn=>onSource=fn};
}
test("fresh preview preserves registration-time purpose beside current purpose with zero writes",async()=>{
 const t=await setup(),before=clone(t.row);t.f.patchSource({authority_classification:"administrative_guidance"});
 const r=await t.preview();assert.equal(r.status,"identity_review_only");
 assert.equal(r.review_snapshot.historical_registration.source.authority_classification,"unknown_review_required");
 assert.equal(r.review_snapshot.current_evidence.source.authority_classification,"administrative_guidance");
 assert.equal(r.review_snapshot_sha256,await evidenceDigest(r.review_snapshot));
 for(const k of ["authority_verified","identity_verified","contacts_verified","source_currentness_verified","commercial_sign_scope_verified","delegation_verified","address_authority_resolved"])assert.equal(r[k],false);
 assert.equal(r.production_writes,0);assert.equal(r.llm_calls,0);assert.equal(t.writes(),0);assert.deepEqual(t.row,before);
});
test("stale or missing selection and unknown registration are rejected without writes",async()=>{
 for(const patch of [{expectedCatalogVersion:"old"},{expectedCatalogVersion:""},{registrationKey:"b".repeat(64)},{officeId:"office-candidate-missing"}]){
  const t=await setup();Object.assign(t.input,patch);await assert.rejects(t.preview);assert.equal(t.writes(),0);
 }
});
test("renames canonical ID mismatches and altered historical evidence cannot preview",async()=>{
 for(const mutate of [
  o=>o.name="Renamed",o=>o.government_office_id="other",
  o=>o.office_candidate_registration.snapshot.proof.text_sha256="b".repeat(64),
  o=>o.office_candidate_registration.snapshot.source.authority_classification="changed",
 ]){
  const t=await setup();mutate(t.row.setting_value.items[0]);await assert.rejects(t.preview);assert.equal(t.writes(),0);
 }
});
test("current profile archive replacement or bytes mismatch requires re-review",async()=>{
 for(const mutate of [t=>t.profile.name="Other",t=>t.profile.documents[0].stored_bytes=101,t=>t.profile.documents[0].file_url="https://storage.test/other.pdf",t=>t.profile.updated_date=""]){
  const t=await setup();mutate(t);await assert.rejects(t.preview);assert.equal(t.writes(),0);
 }
});
test("same-version candidate mutation between reads is detected by snapshot comparison",async()=>{
 const t=await setup();t.onFilter(n=>{if(n===2)t.row.setting_value.items[0].contact_notes="Concurrent note";});
 await assert.rejects(t.preview,/changed during identity review/);assert.equal(t.writes(),0);
});
test("source metadata change during retrieval is detected without writes",async()=>{
 const t=await setup();t.onSource(n=>{if(n===2)t.f.patchSource({notes_gaps:"Concurrent purpose note"});});
 await assert.rejects(t.preview,/changed during evidence retrieval/);assert.equal(t.writes(),0);
});
test("catalog version change between reads is rejected",async()=>{
 const t=await setup();t.onFilter(n=>{if(n===2)t.row.updated_date="catalog2";});
 await assert.rejects(t.preview,/catalog changed/);assert.equal(t.writes(),0);
});
let handler;
const bundle=await build({entryPoints:["base44/functions/permittingOfficeCandidate/entry.ts"],bundle:true,write:false,format:"esm",platform:"neutral",
 plugins:[{name:"mock-sdk",setup(b){b.onResolve({filter:/^npm:@base44\/sdk/},()=>({path:"sdk",namespace:"mock"}));b.onLoad({filter:/.*/,namespace:"mock"},()=>({contents:"export const createClientFromRequest=()=>globalThis.identityPreviewFixture;",loader:"js"}));}}]});
globalThis.Deno={serve:fn=>handler=fn};await import("data:text/javascript;base64,"+Buffer.from(bundle.outputFiles[0].text).toString("base64"));
const call=async body=>{const r=await handler(new Request("https://test",{method:"POST",body:JSON.stringify(body)}));return {status:r.status,data:await r.json()};};
test("identity preview handler denies non-admin before elevated reads",async()=>{
 let service=0;globalThis.identityPreviewFixture={auth:{me:async()=>({role:"user"})},get asServiceRole(){service++;return {};}};
 assert.equal((await call({action:"identity_preview"})).status,403);assert.equal(service,0);
});
test("compiled handler returns exact read-only preview and exposes no identity apply action",async()=>{
 const t=await setup();globalThis.identityPreviewFixture={auth:{me:async()=>({role:"admin",email:"admin@example.test"})},asServiceRole:{entities:{PermittingSourceDocument:t.deps.sourceEntity,PermittingSourceTextSegment:t.deps.segmentEntity,JurisdictionProfile:t.deps.profileEntity,GlobalSettings:t.deps.settingsEntity}}};
 const r=await call({action:"identity_preview",office_id:t.input.officeId,registration_key:t.input.registrationKey,expected_catalog_updated_date:t.input.expectedCatalogVersion});
 assert.equal(r.status,200);assert.equal(r.data.identity_verified,false);assert.equal(r.data.production_writes,0);assert.equal(t.writes(),0);
 assert.equal((await call({action:"identity_apply"})).status,400);
});

test("changing both candidate identifiers cannot reuse a valid publisher registration",async()=>{
 const t=await setup(),office=t.row.setting_value.items[0];
 office.id=office.government_office_id=t.input.officeId="office-candidate-substituted";
 await assert.rejects(t.preview,/lineage changed/);assert.equal(t.writes(),0);
});

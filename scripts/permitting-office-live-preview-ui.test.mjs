import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {webcrypto} from "node:crypto";
import {build} from "esbuild";
import React from "react";
import TestRenderer,{act} from "react-test-renderer";
import {evidenceDigest} from "../base44/shared/permittingRuleEvidence.mjs";
import {loadOfficeIdentityPreview,officePreviewSelectionKey} from "../src/components/permitting/officeIdentityPreviewRequest.mjs";
globalThis.crypto ??= webcrypto;
const receipt=JSON.parse(fs.readFileSync("docs/official-evidence/ohio-sharonville-2026-10-07/publisher-identity-review-readback-2026-10-14.json","utf8"));
const clone=v=>structuredClone(v);
async function setup(){
 const office=clone(receipt.candidate),historical=clone(office.office_candidate_registration.snapshot),fresh=clone(historical);
 fresh.source.authority_classification="administrative_guidance";
 const row={id:"setting",updated_date:"catalog1",setting_value:{items:[clone(office)]}};
 const snapshot={catalog:{id:row.id,updated_date:row.updated_date},office:clone(office),historical_registration:historical,current_evidence:fresh,source_updated_date:"source1",profile_updated_date:"profile1"};
 const result={success:true,dry_run:true,status:"identity_review_only",review_snapshot:snapshot,review_snapshot_sha256:await evidenceDigest(snapshot),unresolved_identity:["Alias equivalence unresolved"],identity_verified:false,authority_verified:false,source_currentness_verified:false,contacts_verified:false,commercial_sign_scope_verified:false,delegation_verified:false,address_authority_resolved:false,production_writes:0,llm_calls:0};
 const calls={read:0,invoke:0};let readHook,invokeHook;
 const settingsEntity={filter:async(...args)=>{calls.read++;assert.deepEqual(args,[{setting_key:"permitOfficeCatalog"},"id",2,0]);return readHook?readHook():[clone(row)];}};
 const invoke=async(name,body)=>{calls.invoke++;assert.equal(name,"permittingOfficeCandidate");assert.deepEqual(body,{action:"identity_preview",office_id:office.id,registration_key:office.office_candidate_registration.registration_key,expected_catalog_updated_date:"catalog1"});return invokeHook?invokeHook():{data:clone(result)};};
 const load=extra=>loadOfficeIdentityPreview({office,settingsEntity,invoke,...extra});
 return {office,row,result,calls,settingsEntity,invoke,load,readHook:fn=>readHook=fn,invokeHook:fn=>invokeHook=fn};
}
test("one explicit read and read-only request use fresh catalog version and preserve selection",async()=>{
 const t=await setup(),before=JSON.stringify(t.office),r=await t.load();
 assert.equal(r.status,"identity_review_only");assert.deepEqual(t.calls,{read:1,invoke:1});assert.equal(JSON.stringify(t.office),before);
 const differentlyOrdered=Object.fromEntries(Object.entries(t.office).reverse());
 assert.equal(officePreviewSelectionKey(t.office),officePreviewSelectionKey(differentlyOrdered));
});
test("draft changes, replaced candidate and ambiguous catalog stop before invocation",async()=>{
 for(const mutate of [
  t=>t.office.contact_notes="Unsaved",t=>t.row.setting_value.items=[],
  t=>t.row.setting_value.items.push(clone(t.office)),t=>t.row.updated_date="",
 ]){
  const t=await setup();mutate(t);await assert.rejects(t.load);assert.equal(t.calls.invoke,0);
 }
 const t=await setup();t.readHook(()=>[t.row,t.row]);await assert.rejects(t.load);assert.equal(t.calls.invoke,0);
});
test("changed selection after catalog read cannot start the backend preview",async()=>{
 const t=await setup();await assert.rejects(()=>t.load({isCurrent:()=>false}),/selected office changed/);assert.equal(t.calls.invoke,0);
});
test("malformed or approval-bearing responses are withheld",async()=>{
 for(const change of [
  r=>r.identity_verified=true,r=>r.production_writes=1,r=>r.dry_run=false,
  r=>r.review_snapshot.catalog.updated_date="old",r=>r.review_snapshot.office.name="Wrong",
  r=>r.review_snapshot.current_evidence.proof.text_sha256="a".repeat(64),
  r=>r.review_snapshot.historical_registration.source.title="changed",
  r=>r.review_snapshot.current_evidence=null,r=>r.review_snapshot_sha256="b".repeat(64),
 ]){
  const t=await setup();change(t.result);
  if(t.result.review_snapshot_sha256!=="b".repeat(64))t.result.review_snapshot_sha256=await evidenceDigest(t.result.review_snapshot);
  await assert.rejects(t.load,/does not match/);assert.equal(t.calls.invoke,1);
 }
});
test("backend conflict and timeout never retry or save",async()=>{
 const conflict=await setup();conflict.invokeHook(()=>{throw Error("Source changed");});
 await assert.rejects(conflict.load,/Source changed/);assert.deepEqual(conflict.calls,{read:1,invoke:1});
 const t=await setup();let finish;t.readHook(()=>new Promise(resolve=>finish=resolve));
 await assert.rejects(()=>t.load({timeoutMs:5}),/timed out/);
 finish([t.row]);await new Promise(resolve=>setTimeout(resolve,0));assert.equal(t.calls.invoke,0);
});
const bundle=await build({entryPoints:["src/components/permitting/OfficeIdentityLivePreview.jsx"],bundle:true,write:false,format:"esm",platform:"node",jsx:"automatic",external:["react","react/jsx-runtime"],
 plugins:[{name:"sdk-fixture",setup(p){p.onResolve({filter:/^@\/api\/base44Client$/},()=>({path:"sdk",namespace:"mock"}));p.onLoad({filter:/.*/,namespace:"mock"},()=>({contents:"export const base44={entities:{GlobalSettings:{filter:(...args)=>globalThis.previewUiSdk.settingsEntity.filter(...args)}},functions:{invoke:(...args)=>globalThis.previewUiSdk.invoke(...args)}};",loader:"js"}));}}]});
const path="scripts/.office-live-preview-test.mjs";fs.writeFileSync(path,bundle.outputFiles[0].text);
let Panel;try{Panel=(await import("../"+path+"?t="+Date.now())).default;}finally{fs.unlinkSync(path);}
const button=r=>r.root.findByType("button");
const output=r=>JSON.stringify(r.toJSON());
test("actual preview renders with no API call and duplicate clicks emit one request",async()=>{
 const t=await setup();globalThis.previewUiSdk=t;let r;
 act(()=>{r=TestRenderer.create(React.createElement(Panel,{office:t.office}));});assert.deepEqual(t.calls,{read:0,invoke:0});
 await act(async()=>{const first=button(r).props.onClick();const second=button(r).props.onClick();await Promise.all([first,second]);});
 assert.deepEqual(t.calls,{read:1,invoke:1});assert.ok(output(r).includes("administrative_guidance"));assert.ok(output(r).includes("unknown_review_required"));act(()=>r.unmount());
});
test("selection edits hide completed snapshots and ignore late responses",async()=>{
 const t=await setup();globalThis.previewUiSdk=t;let finish,pending,r;
 t.invokeHook(()=>new Promise(resolve=>finish=resolve));
 act(()=>{r=TestRenderer.create(React.createElement(Panel,{office:t.office}));});
 act(()=>{pending=button(r).props.onClick();});
 await act(async()=>{await Promise.resolve();});
 const edited={...t.office,contact_notes:"New draft"};
 act(()=>r.update(React.createElement(Panel,{office:edited})));
 await act(async()=>{finish({data:t.result});await pending;});
 assert.ok(!output(r).includes(t.result.review_snapshot_sha256));assert.ok(!output(r).includes("preview received"));
 t.invokeHook(()=>({data:t.result}));
 act(()=>r.update(React.createElement(Panel,{office:t.office})));
 assert.equal(button(r).props.disabled,false);
 assert.ok(!output(r).includes(t.result.review_snapshot_sha256));
 await act(async()=>await button(r).props.onClick());
 assert.ok(output(r).includes(t.result.review_snapshot_sha256));
 act(()=>r.update(React.createElement(Panel,{office:edited})));
 assert.ok(!output(r).includes(t.result.review_snapshot_sha256));
 act(()=>r.update(React.createElement(Panel,{office:t.office})));
 assert.ok(!output(r).includes(t.result.review_snapshot_sha256));assert.equal(button(r).props.disabled,false);act(()=>r.unmount());
});
test("unmount ignores late success and current conflicts remain explicit",async()=>{
 const t=await setup();globalThis.previewUiSdk=t;let finish,pending,r;
 t.invokeHook(()=>new Promise(resolve=>finish=resolve));
 act(()=>{r=TestRenderer.create(React.createElement(Panel,{office:t.office}));});
 act(()=>{pending=button(r).props.onClick();});
 await act(async()=>{await Promise.resolve();});act(()=>r.unmount());
 await act(async()=>{finish({data:t.result});await pending;});
 t.invokeHook(()=>{throw Error("Selected source changed");});
 act(()=>{r=TestRenderer.create(React.createElement(Panel,{office:t.office}));});
 await act(async()=>await button(r).props.onClick());
 assert.ok(output(r).includes("Selected source changed"));assert.ok(!output(r).includes("preview received"));act(()=>r.unmount());
});

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {build} from "esbuild";
import React from "react";
import TestRenderer,{act} from "react-test-renderer";
import {candidateOfficeVerificationBlockReason as reason,updateGovernmentOfficeVerification as verify,normalizeGovernmentOfficeCatalogEntry as normalize} from "../src/components/permitting/governmentOfficeCatalog.js";
const receipt=JSON.parse(fs.readFileSync("docs/official-evidence/ohio-sharonville-2026-10-07/publisher-identity-review-readback-2026-10-14.json","utf8"));
const fixture=()=>structuredClone(receipt.candidate);
test("candidate promotion rejects the entire patch before provenance or clock changes",()=>{
 const o=fixture(),before=JSON.stringify(o);let clock=0;
 assert.throws(()=>verify(o,{verification_status:"staff_verified",source_url:"https://www.sharonville.org/new",verified_by:"Override",verified_at:"now"},"reviewer",()=>{clock++;return "now";}),/evidence-bound identity review/);
 assert.equal(clock,0);assert.equal(JSON.stringify(o),before);
});
test("malformed registration and missing registration on candidate IDs cannot bypass",()=>{
 for(const o of [
  {id:"legacy",office_candidate_registration:null},
  {id:"legacy",office_candidate_registration:[]},
  {id:"legacy",office_candidate_registration:{}},
  {id:"office-candidate-orphan"},
  {id:"local",government_office_id:"office-candidate-orphan"},
 ]){assert.ok(reason(o));assert.throws(()=>verify(o,{verification_status:"staff_verified"}),/evidence-bound/);}
});
test("existing candidate verification is preserved until explicit revocation or identity edit",()=>{
 const o=fixture();o.government_office.verification_status="staff_verified";o.government_office.verified_by="Historical reviewer";o.government_office.verified_at="2026-10-01";
 o.office_identity_reviews=[{id:"prior",proof:"retained"}];const before=JSON.stringify(o);
 const n=normalize(o);assert.equal(n.government_office.verified_by,"Historical reviewer");
 const notes=verify(o,{verification_notes:"Review pending"});assert.equal(notes.government_office.verification_status,"staff_verified");
 assert.throws(()=>verify(o,{verification_status:"staff_verified"}),/evidence-bound/);
 const revoked=verify(o,{verification_status:"needs_verification"});
 assert.equal(revoked.government_office.verification_status,"needs_verification");
 assert.deepEqual(revoked.office_identity_reviews,o.office_identity_reviews);
 assert.deepEqual(revoked.office_candidate_registration,o.office_candidate_registration);
 assert.equal(JSON.stringify(o),before);
});
test("legacy noncandidate verification behavior remains unchanged",()=>{
 const o={id:"legacy",name:"Office",government_office:{source_url:"https://official.example.gov"}};
 assert.equal(reason(o),"");assert.equal(verify(o,{verification_status:"staff_verified"},"reviewer",()=> "2026-10-14").government_office.verified_by,"reviewer");
});
const names=["Button","Input","Label","Select","SelectContent","SelectItem","SelectTrigger","SelectValue","Checkbox","Popover","PopoverContent","PopoverTrigger","AlertDialog","AlertDialogAction","AlertDialogCancel","AlertDialogContent","AlertDialogDescription","AlertDialogFooter","AlertDialogHeader","AlertDialogTitle","Plus","Trash2","GripVertical","Search","ChevronDown","ChevronRight","Sparkles","X","ExternalLink"];
const stub='import React from "react";\n'+names.map(n=>'export const '+n+'=({children,...props})=>React.createElement("'+(n==="Button"?"button":n==="Input"?"input":"div")+'",props,children);').join("\n")+'\nexport const DragDropContext=({children})=>children;export const Droppable=({children})=>children({innerRef:()=>{},droppableProps:{},placeholder:null});export const Draggable=({children})=>children({innerRef:()=>{},draggableProps:{},dragHandleProps:{}});export default ()=>null;';
const b=await build({stdin:{contents:fs.readFileSync("src/components/permitting/OfficeCatalogEditor.jsx","utf8")+"\nexport {OfficeEditor};",resolveDir:process.cwd()+"/src/components/permitting",loader:"jsx"},bundle:true,write:false,format:"esm",platform:"node",jsx:"automatic",external:["react","react/jsx-runtime"],
 plugins:[{name:"synthetic-ui",setup(p){p.onResolve({filter:/^(?:@\/components\/ui\/|lucide-react$|@hello-pangea\/dnd$|\.\/AIOfficeResearchDialog$|\.\/OfficeCandidateEvidencePanel$)/},()=>({path:"stub",namespace:"mock"}));p.onLoad({filter:/.*/,namespace:"mock"},()=>({contents:stub,loader:"js"}));}}]});
const path="scripts/.office-verification-editor-test.mjs";fs.writeFileSync(path,b.outputFiles[0].text);
let OfficeEditor;try{({OfficeEditor}=await import("../"+path+"?t="+Date.now()));}finally{fs.unlinkSync(path);}
const button=(root,label)=>root.findAllByType("button").find(n=>n.children.includes(label));
test("actual unverified candidate toggle is disabled and handler cannot emit an update",()=>{
 let renderer;const changes=[];
 act(()=>{renderer=TestRenderer.create(React.createElement(OfficeEditor,{office:fixture(),officeTypes:[],onChange:o=>changes.push(o),onDelete:()=>{}}));});
 act(()=>renderer.root.findAllByType("button")[0].props.onClick());
 const toggle=button(renderer.root,"Mark staff verified");assert.ok(toggle);assert.equal(toggle.props.disabled,true);
 act(()=>toggle.props.onClick());assert.equal(changes.length,0);
 assert.ok(JSON.stringify(renderer.toJSON()).includes("separate evidence-bound identity review"));act(()=>renderer.unmount());
});
test("actual historical candidate revocation remains enabled and preserves evidence",()=>{
 const o=fixture();o.government_office.verification_status="staff_verified";o.government_office.verified_by="Reviewer";o.government_office.verified_at="2026-10-01";
 let renderer;const changes=[];
 act(()=>{renderer=TestRenderer.create(React.createElement(OfficeEditor,{office:o,officeTypes:[],onChange:n=>changes.push(n),onDelete:()=>{}}));});
 act(()=>renderer.root.findAllByType("button")[0].props.onClick());
 const toggle=button(renderer.root,"Revoke verification");assert.equal(toggle.props.disabled,false);
 act(()=>toggle.props.onClick());assert.equal(changes.length,1);
 assert.equal(changes[0].government_office.verification_status,"needs_verification");
 assert.deepEqual(changes[0].office_candidate_registration,o.office_candidate_registration);act(()=>renderer.unmount());
});

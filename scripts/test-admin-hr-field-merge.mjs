// Synthetic field-level HR reconciliation tests. No production data or backend writes.
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { reconcileHrDraft, formatHrFieldPath } from "../src/components/user/reconcileHrDraft.js";

const contact = (name, relationship, phone, phone_alt="") =>
  ({name,relationship,phone,phone_alt});
const alice = contact("Alice", "Spouse", "111", "222");
const bob = contact("Bob", "Parent", "333", "444");
const merge = (baseline,latest,draft,overwriteConflicts=false) =>
  reconcileHrDraft({baseline,latest,draft,overwriteConflicts});

test("Clothing sizes edited on different keys merge without a conflict",()=>{
 const baseline={clothing_sizes:{shirt:"L",pants_waist:"32",shoe:"10"}};
 const latest={clothing_sizes:{shirt:"XL",pants_waist:"32",shoe:"10"}};
 const draft={clothing_sizes:{shirt:"L",pants_waist:"34",shoe:"10"}};
 const result=merge(baseline,latest,draft);
 assert.deepEqual(result.conflictFields,[]);
 assert.deepEqual(result.editedFields,["clothing_sizes.pants_waist"]);
 assert.deepEqual(result.merged.clothing_sizes,{shirt:"XL",pants_waist:"34",shoe:"10"});
 assert.deepEqual(latest.clothing_sizes,{shirt:"XL",pants_waist:"32",shoe:"10"});
});

test("Same clothing-size key modified differently conflicts by exact field",()=>{
 const baseline={clothing_sizes:{shirt:"L",shoe:"10",hoodie:"M"}};
 const latest={clothing_sizes:{shirt:"XL",shoe:"10",hoodie:"L"}};
 const draft={clothing_sizes:{shirt:"S",shoe:"11",hoodie:"M"}};
 const preferred=merge(baseline,latest,draft);
 assert.deepEqual(preferred.conflictFields,["clothing_sizes.shirt"]);
 assert.deepEqual(preferred.editedFields,["clothing_sizes.shirt","clothing_sizes.shoe"]);
 assert.deepEqual(preferred.merged.clothing_sizes,{shirt:"XL",shoe:"11",hoodie:"L"});
 const overwrite=merge(baseline,latest,draft,true);
 assert.deepEqual(overwrite.merged.clothing_sizes,{shirt:"S",shoe:"11",hoodie:"L"});
});

test("Deleting one clothing field keeps unrelated newly added latest field",()=>{
 const baseline={clothing_sizes:{shirt:"L",shoe:"10"}};
 const latest={clothing_sizes:{shirt:"L",shoe:"10",hoodie:"XL"}};
 const draft={clothing_sizes:{shirt:"L"}};
 const result=merge(baseline,latest,draft);
 assert.deepEqual(result.conflictFields,[]);
 assert.deepEqual(result.editedFields,["clothing_sizes.shoe"]);
 assert.deepEqual(result.merged.clothing_sizes,{shirt:"L",hoodie:"XL"});
});

test("Adding a clothing size on both sides safely merges distinct keys",()=>{
 const baseline={};
 const latest={clothing_sizes:{hoodie:"L"}};
 const draft={clothing_sizes:{shirt:"XL"}};
 const result=merge(baseline,latest,draft);
 assert.deepEqual(result.conflictFields,[]);
 assert.deepEqual(result.merged.clothing_sizes,{hoodie:"L",shirt:"XL"});
});

test("Deleting whole clothing object while another admin changes it is atomic",()=>{
 const baseline={clothing_sizes:{shirt:"L"}};
 const latest={clothing_sizes:{shirt:"XL"}};
 const draft={};
 const result=merge(baseline,latest,draft);
 assert.deepEqual(result.conflictFields,["clothing_sizes"]);
 assert.deepEqual(result.merged,latest);
 assert.deepEqual(merge(baseline,latest,draft,true).merged,{});
});

test("Contacts with unchanged unique identities merge different fields of same person",()=>{
 const baseline={emergency_contacts:[alice,bob]};
 const latest={emergency_contacts:[{...alice,phone_alt:"999"},bob]};
 const draft={emergency_contacts:[{...alice,phone:"888"},bob]};
 const result=merge(baseline,latest,draft);
 assert.deepEqual(result.conflictFields,[]);
 assert.deepEqual(result.editedFields,["emergency_contacts[0].phone"]);
 assert.deepEqual(result.merged.emergency_contacts,[
  {...alice,phone:"888",phone_alt:"999"},bob
 ]);
 assert.deepEqual(latest.emergency_contacts[0].phone,"111");
});

test("Contacts with unchanged identity merge changes to different people",()=>{
 const baseline={emergency_contacts:[alice,bob]};
 const latest={emergency_contacts:[alice,{...bob,phone:"999"}]};
 const draft={emergency_contacts:[{...alice,phone_alt:"555"},bob]};
 const result=merge(baseline,latest,draft);
 assert.deepEqual(result.conflictFields,[]);
 assert.equal(result.merged.emergency_contacts[0].phone_alt,"555");
 assert.equal(result.merged.emergency_contacts[1].phone,"999");
});

test("Same contact field changed twice produces a precise conflict",()=>{
 const baseline={emergency_contacts:[alice]};
 const latest={emergency_contacts:[{...alice,phone:"222"}]};
 const draft={emergency_contacts:[{...alice,phone:"333",phone_alt:"987"}]};
 const result=merge(baseline,latest,draft);
 assert.deepEqual(result.conflictFields,["emergency_contacts[0].phone"]);
 assert.deepEqual(result.editedFields,["emergency_contacts[0].phone","emergency_contacts[0].phone_alt"]);
 assert.equal(result.merged.emergency_contacts[0].phone,"222");
 assert.equal(result.merged.emergency_contacts[0].phone_alt,"987");
 const overwrote=merge(baseline,latest,draft,true);
 assert.equal(overwrote.merged.emergency_contacts[0].phone,"333");
 assert.equal(overwrote.merged.emergency_contacts[0].phone_alt,"987");
});

test("Identical new value on both sides is not a conflict",()=>{
 const baseline={emergency_contacts:[alice]};
 const latest={emergency_contacts:[{...alice,phone:"555"}]};
 const draft={emergency_contacts:[{...alice,phone:"555"}]};
 const result=merge(baseline,latest,draft);
 assert.deepEqual(result.conflictFields,[]);
 assert.equal(result.merged.emergency_contacts[0].phone,"555");
});

for(const [label,baseContacts,latestContacts,draftContacts] of [
 ["reordered entries",[alice,bob],[bob,alice],[{...alice,phone:"888"},bob]],
 ["admin appended contact",[alice],[alice,bob],[{...alice,phone:"888"}]],
 ["admin removed contact",[alice,bob],[alice],[{...alice,phone:"888"},bob]],
 ["user appended contact",[alice],[{...alice,phone:"777"}],[alice,bob]],
 ["user renamed contact",[alice],[{...alice,phone:"777"}],[{...alice,name:"Alicia"}]],
 ["admin changed relationship",[alice],[{...alice,relationship:"Friend"}],[{...alice,phone:"888"}]],
 ["ambiguous duplicate",[alice,alice],[{...alice,phone:"777"},alice],[alice,{...alice,phone_alt:"888"}]],
 ["missing stable name",[contact("","Spouse","111")],[contact("","Spouse","222")],[contact("","Spouse","333")]]
]){
 test(`Unsafe contact identity/list change (${label}) stays atomic`,()=>{
  const baseline={emergency_contacts:baseContacts};
  const latest={emergency_contacts:latestContacts};
  const draft={emergency_contacts:draftContacts};
  const result=merge(baseline,latest,draft);
  assert.deepEqual(result.conflictFields,["emergency_contacts"]);
  assert.deepEqual(result.editedFields,["emergency_contacts"]);
  assert.deepEqual(result.merged.emergency_contacts,latestContacts);
  assert.deepEqual(merge(baseline,latest,draft,true).merged.emergency_contacts,draftContacts);
 });
}

test("Contact-array deletion is safe only if latest is unchanged",()=>{
 const baseline={emergency_contacts:[alice,bob]};
 const draft={emergency_contacts:[alice]};
 assert.deepEqual(merge(baseline,baseline,draft).merged,draft);
 const latest={emergency_contacts:[{...alice,phone:"888"},bob]};
 assert.deepEqual(merge(baseline,latest,draft).conflictFields,["emergency_contacts"]);
});

test("Top-level HR fields remain backward-compatible and atomic",()=>{
 const baseline={qualifications:{certs:["A","B"]},address:"Old"};
 const latest={qualifications:{certs:["A","C"]},address:"Old"};
 const draft={qualifications:{certs:["B","A"]},address:"New"};
 const result=merge(baseline,latest,draft);
 assert.deepEqual(result.conflictFields,["qualifications"]);
 assert.deepEqual(result.merged.qualifications,latest.qualifications);
 assert.equal(result.merged.address,"New");
});

test("Conflict field names in UI are precise and do not expose field values",()=>{
 const ui=readFileSync("src/components/user/UserHRDataForm.jsx","utf8");
 assert.match(ui,/conflictFields\.map\(formatHrFieldPath\)/);
 assert.match(ui,/compared field by field/);
 assert.match(ui,/entire contact list is treated as one change/);
 assert.match(ui,/disabled=\{!confirmOverwrite\}/);
 assert.match(ui,/Nothing has been saved yet/);
 assert.equal(formatHrFieldPath("clothing_sizes.pants_waist"),"Clothing size: pants waist");
 assert.equal(formatHrFieldPath("emergency_contacts[1].phone_alt"),"Emergency contact 2: phone alt");
 assert.equal(formatHrFieldPath("emergency_contacts"),"Emergency contacts (list or identity changed)");
});

test("Special JSON property names cannot mutate the draft merge prototype",()=>{
 const base=JSON.parse('{"clothing_sizes":{"__proto__":"old","shirt":"L"}}');
 const latest=JSON.parse('{"clothing_sizes":{"__proto__":"latest","shirt":"L"}}');
 const draft=JSON.parse('{"clothing_sizes":{"__proto__":"draft","shirt":"XL"}}');
 const before=Object.prototype;
 const result=merge(base,latest,draft);
 assert.deepEqual(result.conflictFields,["clothing_sizes.__proto__"]);
 assert.equal(Object.getPrototypeOf(result.merged),before);
 assert.equal(Object.getPrototypeOf(result.merged.clothing_sizes),before);
 assert.equal(Object.prototype.polluted,undefined);
 assert.equal(Object.getOwnPropertyDescriptor(result.merged.clothing_sizes,"__proto__").value,"latest");
 assert.equal(result.merged.clothing_sizes.shirt,"XL");
 const overwrite=merge(base,latest,draft,true);
 assert.equal(Object.getOwnPropertyDescriptor(overwrite.merged.clothing_sizes,"__proto__").value,"draft");
});

test("Malformed envelopes fail closed, and input records remain unchanged",()=>{
 assert.throws(()=>merge(null,{},{}),/verified records/);
 assert.throws(()=>merge({},[],{}),/verified records/);
 assert.throws(()=>merge({},{},null),/verified records/);
 const old={clothing_sizes:{shirt:"L"},emergency_contacts:[alice]};
 const fresh={clothing_sizes:{shirt:"XL"},emergency_contacts:[alice]};
 const draft={clothing_sizes:{shoe:"11"},emergency_contacts:[{...alice,phone_alt:"555"}]};
 const originals=JSON.stringify([old,fresh,draft]);
 merge(old,fresh,draft);
 merge(old,fresh,draft,true);
 assert.equal(JSON.stringify([old,fresh,draft]),originals);
});

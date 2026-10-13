// Synthetic, read-only HR outcome preview coverage: no production HR records.
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { previewHrResolution, reconcileHrDraft, formatHrFieldPath } from "../src/components/user/reconcileHrDraft.js";

const base = {
  city: "Base city", address: "Old address",
  clothing_sizes: { shirt: "L", shoe: "10", hoodie: "M" },
  emergency_contacts: [
    { name: "Alice", relationship: "Spouse", phone: "111", phone_alt: "222" }
  ],
  personal_email: "old@example.invalid"
};
const latest = {
  ...base,
  city: "Newer city",
  clothing_sizes: { shirt: "XL", shoe: "10", hoodie: "M" },
  emergency_contacts: [
    { ...base.emergency_contacts[0], phone: "444" }
  ],
  personal_email: "same@example.invalid"
};
const draft = {
  ...base,
  address: "My address",
  city: "My city",
  clothing_sizes: { shirt: "S", shoe: "11", hoodie: "M" },
  emergency_contacts: [
    { ...base.emergency_contacts[0], phone_alt: "555" }
  ],
  personal_email: "same@example.invalid"
};
const byPath = preview => new Map(preview.fields.map(row => [row.path, row]));

test("Default safe preview distinguishes newest values, my edits, conflicts, and agreement", () => {
  const p = previewHrResolution({ baseline: base, latest, draft });
  assert.equal(p.choice, "prefer-latest");
  assert.equal(byPath(p).get("city").outcome, "latest-over-mine");
  assert.equal(byPath(p).get("address").outcome, "mine");
  assert.equal(byPath(p).get("clothing_sizes.shirt").outcome, "latest-over-mine");
  assert.equal(byPath(p).get("clothing_sizes.shoe").outcome, "mine");
  assert.equal(byPath(p).get("emergency_contacts[0].phone").outcome, "latest");
  assert.equal(byPath(p).get("emergency_contacts[0].phone_alt").outcome, "mine");
  assert.equal(byPath(p).get("personal_email").outcome, "agreed");
  assert.deepEqual(p.counts, { mine: 3, latest: 3, overwritten: 0, agreed: 1 });
  assert.equal(p.fields.length, 7);
  assert.ok(p.fields.every(field => typeof field.label === "string" && field.label.length > 0));
  assert.ok(p.fields.every(field => !("value" in field) && !("draftValue" in field)));
});

test("Choosing latest previews discarding local-only edits without mutating the draft", () => {
  const p = previewHrResolution({ baseline: base, latest, draft, choice: "latest" });
  assert.equal(byPath(p).get("address").outcome, "latest-over-mine");
  assert.equal(byPath(p).get("clothing_sizes.shoe").outcome, "latest-over-mine");
  assert.equal(byPath(p).get("emergency_contacts[0].phone_alt").outcome, "latest-over-mine");
  assert.equal(byPath(p).get("emergency_contacts[0].phone").outcome, "latest");
  assert.deepEqual(p.counts, { mine: 0, latest: 6, overwritten: 0, agreed: 1 });
  assert.equal(draft.address, "My address");
});

test("Explicit overwrite preview identifies precisely which newer fields would be replaced", () => {
  const p = previewHrResolution({ baseline: base, latest, draft, choice: "keep-conflicts" });
  assert.equal(byPath(p).get("city").outcome, "overwritten");
  assert.equal(byPath(p).get("clothing_sizes.shirt").outcome, "overwritten");
  assert.equal(byPath(p).get("emergency_contacts[0].phone").outcome, "latest");
  assert.equal(byPath(p).get("emergency_contacts[0].phone_alt").outcome, "mine");
  assert.deepEqual(p.counts, { mine: 3, latest: 1, overwritten: 2, agreed: 1 });
});

test("Preview outcome is consistent with actual merge for every field", () => {
  for (const choice of ["latest","prefer-latest","keep-conflicts"]) {
    const result = choice === "latest"
      ? latest
      : reconcileHrDraft({ baseline: base, latest, draft, overwriteConflicts: choice === "keep-conflicts" }).merged;
    const p = previewHrResolution({ baseline: base, latest, draft, choice });
    const expectValue = {
      city: result.city,
      address: result.address,
      shirt: result.clothing_sizes.shirt,
      shoe: result.clothing_sizes.shoe,
      contactPhone: result.emergency_contacts[0].phone,
      contactAlt: result.emergency_contacts[0].phone_alt
    };
    for (const [path, value, localValue, freshValue] of [
      ["city",expectValue.city,draft.city,latest.city],
      ["address",expectValue.address,draft.address,latest.address],
      ["clothing_sizes.shirt",expectValue.shirt,draft.clothing_sizes.shirt,latest.clothing_sizes.shirt],
      ["clothing_sizes.shoe",expectValue.shoe,draft.clothing_sizes.shoe,latest.clothing_sizes.shoe],
      ["emergency_contacts[0].phone",expectValue.contactPhone,draft.emergency_contacts[0].phone,latest.emergency_contacts[0].phone],
      ["emergency_contacts[0].phone_alt",expectValue.contactAlt,draft.emergency_contacts[0].phone_alt,latest.emergency_contacts[0].phone_alt]
    ]) {
      const row = byPath(p).get(path);
      assert.ok(row, `preview includes ${path} for ${choice}`);
      if (row.outcome === "mine" || row.outcome === "overwritten") assert.equal(value, localValue);
      if (row.outcome === "latest" || row.outcome === "latest-over-mine") assert.equal(value, freshValue);
    }
    assert.equal(p.counts.mine + p.counts.latest + p.counts.overwritten + p.counts.agreed, p.fields.length);
  }
});

test("Ambiguous contact list is previewed atomically rather than misrepresenting its fields", () => {
  const one = {name:"Alice",relationship:"Spouse",phone:"111"};
  const two = {name:"Bob",relationship:"Parent",phone:"222"};
  const baseline = {emergency_contacts:[one,two]};
  const latest = {emergency_contacts:[two,one]};
  const draft = {emergency_contacts:[{...one,phone:"333"},two]};
  const safe = previewHrResolution({ baseline, latest, draft });
  assert.equal(safe.fields.length,1);
  assert.deepEqual(safe.fields[0], {
    path: "emergency_contacts",
    label: formatHrFieldPath("emergency_contacts"),
    outcome: "latest-over-mine",
    conflict: true
  });
  const overwrite = previewHrResolution({ baseline, latest, draft, choice:"keep-conflicts" });
  assert.equal(overwrite.fields[0].outcome,"overwritten");
});

test("Remote-only nested edits show as latest kept even when draft is unchanged", () => {
  const baseline = {clothing_sizes:{shirt:"L"},emergency_contacts:[{name:"Alice",relationship:"Spouse",phone:"111"}]};
  const latest = {clothing_sizes:{shirt:"XL"},emergency_contacts:[{name:"Alice",relationship:"Spouse",phone:"222"}]};
  const draft = baseline;
  const p = previewHrResolution({baseline,latest,draft});
  assert.deepEqual(p.fields.map(x=>x.path),["clothing_sizes.shirt","emergency_contacts[0].phone"]);
  assert.ok(p.fields.every(row=>row.outcome==="latest"&&!row.conflict));
});

test("Additions, removals, and no-difference scenarios are previewed coherently",()=>{
 const b={clothing_sizes:{shoe:"10"},notes:"old"};
 const l={clothing_sizes:{shoe:"10",hoodie:"M"},notes:"old"};
 const d={clothing_sizes:{shoe:"11"}};
 const p=previewHrResolution({baseline:b,latest:l,draft:d});
 assert.equal(byPath(p).get("notes").outcome,"mine");
 assert.equal(byPath(p).get("clothing_sizes.hoodie").outcome,"latest");
 assert.equal(byPath(p).get("clothing_sizes.shoe").outcome,"mine");
 const zero=previewHrResolution({baseline:b,latest:b,draft:b});
 assert.deepEqual(zero.fields,[]);
 assert.deepEqual(zero.counts,{mine:0,latest:0,overwritten:0,agreed:0});
});

test("Invalid choices or malformed envelopes fail closed",()=>{
 assert.throws(()=>previewHrResolution({baseline:base,latest,draft,choice:"silent-overwrite"}),/Unsupported/);
 assert.throws(()=>previewHrResolution({baseline:[],latest,draft}),/verified records/);
 assert.throws(()=>previewHrResolution({baseline:base,latest:null,draft,choice:"latest"}),/verified records/);
});

test("Preview is read-only and contains no draft or newer HR field values",()=>{
 const original=JSON.stringify([base,latest,draft]);
 for (const choice of ["latest","prefer-latest","keep-conflicts"]) {
   const p=previewHrResolution({baseline:base,latest,draft,choice});
   assert.doesNotMatch(JSON.stringify(p),/Newer city|My address|same@example\.invalid|Spouse|Alice/);
 }
 assert.equal(JSON.stringify([base,latest,draft]),original);
});

test("UI presents a preview before local draft application, with guarded overwrite",()=>{
 const ui=readFileSync("src/components/user/UserHRDataForm.jsx","utf8");
 assert.match(ui,/hrResolutionPreview = hrRecovery\?\.stage === "review"[\s\S]*?previewHrResolution\(/);
 assert.match(ui,/aria-label="HR resolution preview choices"/);
 assert.match(ui,/aria-pressed=\{hrPreviewChoice === option\.value\}/);
 assert.match(ui,/aria-label="HR field resolution preview"/);
 assert.match(ui,/hrResolutionPreview\.fields\.map\(field =>/);
 assert.match(ui,/HR_PREVIEW_OUTCOME\[field\.outcome\]/);
 assert.match(ui,/disabled=\{hrPreviewChoice === "keep-conflicts" && !confirmOverwrite\}/);
 assert.match(ui,/onClick=\{\(\) => resolveHrRecovery\(hrPreviewChoice\)\}/);
 assert.match(ui,/Apply preview to my draft/);
 assert.match(ui,/Nothing has been saved yet/);
 assert.match(ui,/setHrPreviewChoice\("prefer-latest"\)/);
 assert.match(ui,/setConfirmOverwrite\(false\);\s*\};\s*const resolveHrRecovery/);
 assert.doesNotMatch(ui,/\{field\.draftValue\}|\{field\.latestValue\}/);
});

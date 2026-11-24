import assert from "node:assert/strict";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const signs = await import(pathToFileURL(resolve(here, "../src/components/permitting/permitSigns.js")).href);
const prompts = await import(pathToFileURL(resolve(here, "../src/components/permitting/permitPlanPrompt.js")).href);

const {
  SIGN_TYPES, SIGN_SCOPES, newUnit, setTypeCount, unitAreaSqFt,
  mergeScannedSigns, legacyInputsFromSigns, describeSignsForPrompt, totalUnitCount,
} = signs;
const { buildSignScanPrompt, buildPermitPlanPrompt } = prompts;

// ── setTypeCount: grow / shrink / 0 / clone-from-last ──
{
  let s = setTypeCount([], "cabinet", 2);
  assert.equal(s.length, 1);
  assert.equal(s[0].type, "cabinet");
  assert.equal(s[0].units.length, 2);
  assert.notEqual(s[0].units[0].id, s[0].units[1].id);

  // Grow clones the last unit (id/source_line/notes reset).
  s = setTypeCount(s, "cabinet", 2);
  s[0].units[1] = { ...s[0].units[1], scope: "reface", width_in: 24, height_in: 36, source_line: "x", notes: "n" };
  s = setTypeCount(s, "cabinet", 4);
  assert.equal(s[0].units.length, 4);
  assert.equal(s[0].units[2].scope, "reface");
  assert.equal(s[0].units[2].width_in, 24);
  assert.equal(s[0].units[2].source_line, "");
  assert.equal(s[0].units[2].notes, "");
  assert.notEqual(s[0].units[2].id, s[0].units[1].id);

  // Shrink truncates from the end.
  s = setTypeCount(s, "cabinet", 1);
  assert.equal(s[0].units.length, 1);

  // n=0 removes the type entirely; clamped to 50.
  s = setTypeCount(s, "cabinet", 0);
  assert.equal(s.length, 0);
  s = setTypeCount([], "pylon", 999);
  assert.equal(s[0].units.length, 50);

  // Original array not mutated.
  const before = setTypeCount([], "monument", 1);
  const after = setTypeCount(before, "monument", 3);
  assert.equal(before[0].units.length, 1);
  assert.equal(after[0].units.length, 3);
}

// ── newUnit defaults ──
{
  const plain = newUnit("cabinet");
  assert.equal(plain.scope, "new");
  assert.equal(plain.faces, 1);
  assert.equal(plain.illuminated, false);
  assert.equal(plain.electrical, false);
  assert.equal(plain.width_in, null);
  const emc = newUnit("emc");
  assert.equal(emc.illuminated, true);
  assert.equal(emc.electrical, true);
}

// ── unitAreaSqFt: faces=2, missing sizes ──
{
  assert.equal(unitAreaSqFt({ width_in: 24, height_in: 120, faces: 1 }), 20);
  assert.equal(unitAreaSqFt({ width_in: 24, height_in: 120, faces: 2 }), 40);
  assert.equal(unitAreaSqFt({ width_in: null, height_in: 120, faces: 1 }), null);
  assert.equal(unitAreaSqFt({ width_in: 24, height_in: null, faces: 1 }), null);
  assert.equal(unitAreaSqFt({}), null);
}

// ── mergeScannedSigns: sanitize ──
{
  const merged = mergeScannedSigns([
    { type: "channel_letters", count: 2, scope: "new", illuminated: true, electrical: true, width_in: 24, height_in: 120, letter_height_in: 18, source_line: "East elevation letters" },
    { type: "weird_custom", count: 1, scope: "bogus", width_in: -5, height_in: "abc", overall_height_in: 99999 },
    { type: "channel_letters", count: 1, scope: "reface" }, // same type → merges into first entry
    { type: "blade", count: 0 },       // count < 1 → 1
    { type: "banner", count: 60 },     // clamp → 50
    { type: "window", faces: 7 },      // faces only 1|2 → 1
    "not-an-object",
  ]);
  assert.equal(merged[0].type, "channel_letters");
  assert.equal(merged[0].units.length, 3); // 2 + merged 1
  assert.equal(merged[1].type, "other");
  assert.equal(merged[1].units[0].scope, "new");
  assert.equal(merged[1].units[0].width_in, null);   // -5 rejected
  assert.equal(merged[1].units[0].height_in, null);  // "abc" rejected
  assert.equal(merged[1].units[0].overall_height_in, null); // 99999 rejected
  assert.equal(merged[2].type, "blade");
  assert.equal(merged[2].units.length, 1);
  assert.equal(merged[3].type, "banner");
  assert.equal(merged[3].units.length, 50);
  assert.equal(merged[4].units[0].faces, 1);
  assert.equal(totalUnitCount(merged), 3 + 1 + 1 + 50 + 1);
  // faces=2 survives.
  const two = mergeScannedSigns([{ type: "cabinet", count: 1, faces: 2 }]);
  assert.equal(two[0].units[0].faces, 2);
  // Merging preserves first-seen order across scan results.
  const ordered = mergeScannedSigns([{ type: "pylon" }, { type: "awning" }, { type: "pylon" }]);
  assert.deepEqual(ordered.map(e => e.type), ["pylon", "awning"]);
  assert.equal(ordered[0].units.length, 2);
}

// ── legacyInputsFromSigns ──
{
  const list = mergeScannedSigns([
    { type: "emc", count: 1, illuminated: true, electrical: true, width_in: 48, height_in: 96 },
    { type: "monument", count: 1 },
    { type: "channel_letters", count: 2, width_in: 24, height_in: 120 },
  ]);
  const legacy = legacyInputsFromSigns(list);
  assert.equal(legacy.signTypes, "EMC / digital, Monument, Channel letters ×2");
  assert.equal(legacy.dimensions, "48×96 in, 24×120 in, 24×120 in");
  assert.equal(legacy.emcDigital, true);
  assert.equal(legacy.freestanding, true);   // monument
  assert.equal(legacy.illuminated, true);
  assert.equal(legacy.electricalWork, true);
  assert.equal(legacy.newVsReplacement, "New sign");
  assert.equal(legacy.temporaryVsPermanent, "Permanent");

  // Scope mapping from the FIRST unit.
  const reface = legacyInputsFromSigns(mergeScannedSigns([{ type: "cabinet", scope: "reface" }]));
  assert.equal(reface.newVsReplacement, "Face replacement");
  const repair = legacyInputsFromSigns(mergeScannedSigns([{ type: "cabinet", scope: "repair" }]));
  assert.equal(repair.newVsReplacement, "Repair");

  // All-temporary → Temporary; mixed → Permanent; empty → Permanent.
  assert.equal(legacyInputsFromSigns(mergeScannedSigns([{ type: "banner" }, { type: "a_frame" }])).temporaryVsPermanent, "Temporary");
  assert.equal(legacyInputsFromSigns(mergeScannedSigns([{ type: "banner" }, { type: "cabinet" }])).temporaryVsPermanent, "Permanent");
  assert.equal(legacyInputsFromSigns([]).temporaryVsPermanent, "Permanent");
  assert.equal(legacyInputsFromSigns([]).signTypes, "");
}

// ── describeSignsForPrompt: unit numbering across types ──
{
  const list = mergeScannedSigns([
    { type: "channel_letters", count: 2, scope: "new", illuminated: true, electrical: true, width_in: 24, height_in: 120, letter_height_in: 18, source_line: "East elevation letters", notes: "double-sided" },
    { type: "monument", count: 1, scope: "reface", overall_height_in: 96 },
  ]);
  const text = describeSignsForPrompt(list);
  const lines = text.split("\n");
  assert.equal(lines.length, 3);
  assert.match(lines[0], /^#1 Channel letters — scope: New sign; illuminated; electrical; 24" W × 120" H; letter height 18"; 1 face; area 20\.0 sq ft; from "East elevation letters"; notes: double-sided$/);
  assert.match(lines[1], /^#2 Channel letters/);
  assert.match(lines[2], /^#3 Monument — scope: Reface \(new faces\)/);
  assert.match(lines[2], /overall height 96"/);
  assert.doesNotMatch(lines[2], /W × /); // missing sizes omitted
}

// ── Plan prompt: every office name + every sign number present ──
{
  const list = mergeScannedSigns([
    { type: "channel_letters", count: 2, illuminated: true, electrical: true, width_in: 24, height_in: 120 },
    { type: "blade", count: 1 },
  ]);
  const offices = [
    { name: "Milford Zoning Office", roles: ["zoning"], verified: true, phone: "555-0100" },
    { name: "Clermont County Building", roles: ["building", "electrical_permit"], verified: false,
      evidence: [{ role: "electrical_permit", quote: "Issues electrical permits", url: "https://example.gov/elec" }] },
  ];
  const prompt = buildPermitPlanPrompt({
    input: { customer: "Acme", address: "1 Main St" },
    jurisdiction: { jurisdiction_name: "Milford", state: "OH" },
    offices,
    signs: list,
    installDate: "2026-03-01",
    county: "Clermont",
    documents: [{ id: "d1", title: "Sign ordinance" }],
  });
  for (const o of offices) assert.ok(prompt.includes(o.name), `prompt missing office ${o.name}`);
  for (const n of [1, 2, 3]) assert.ok(prompt.includes(`#${n} `), `prompt missing sign #${n}`);
  assert.ok(prompt.includes("(Clermont County)"));
  assert.ok(prompt.includes("2026-03-01"));
  assert.ok(prompt.includes("Issues electrical permits"));
  // Empty offices → explicit parenthetical.
  const noOffices = buildPermitPlanPrompt({ offices: [], signs: [] });
  assert.ok(noOffices.includes("(none selected — infer offices from the research below and mark them staff_confirmation_needed)"));
  assert.ok(noOffices.includes("(none on file)"));
}

// ── Scan prompt: every line item name present ──
{
  const lines = [
    { name: "Channel letters — storefront", category: "Signs", quantity: 1, description: "24in letters" },
    { name: "Permit acquisition fee", category: "Service", quantity: 1, description: "" },
    { name: "(2) Blade signs", category: "", quantity: 2, description: "Double sided" },
  ];
  const prompt = buildSignScanPrompt({
    estimate_number: "EST-14627",
    project_name: "Acme HQ",
    client_name: "Acme",
    site_address: "1 Main St",
    lines,
  });
  for (const l of lines) assert.ok(prompt.includes(l.name), `scan prompt missing ${l.name}`);
  for (const t of SIGN_TYPES) assert.ok(prompt.includes(`${t.key} — ${t.label}`));
  for (const s of SIGN_SCOPES) assert.ok(["new", "reface", "repair", "removal", "relocate"].includes(s.key));
}

console.log("PASS permit-signs");

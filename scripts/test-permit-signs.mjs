import assert from "node:assert/strict";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";
import { readFileSync } from "node:fs";

const here = dirname(fileURLToPath(import.meta.url));
const signs = await import(pathToFileURL(resolve(here, "../src/components/permitting/permitSigns.js")).href);
const prompts = await import(pathToFileURL(resolve(here, "../src/components/permitting/permitPlanPrompt.js")).href);

const {
  SIGN_TYPES, SIGN_SCOPES, newUnit, setTypeCount, unitAreaSqFt,
  mergeScannedSigns, legacyInputsFromSigns, describeSignsForPrompt, totalUnitCount,
  addWorkingDays, workingDaysBetween, profileLimits, unitRuleFlags, preBuildWarnings,
  parseLocalDate,
} = signs;
const { buildSignScanPrompt, buildPermitPlanPrompt, estimatePartsText } = prompts;

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
  assert.equal(plain.size_basis, null);
  const emc = newUnit("emc");
  assert.equal(emc.illuminated, true);
  assert.equal(emc.electrical, true);
  // Clones carry size provenance but reset id/source_line/notes.
  const cloned = newUnit("cabinet", { size_source: "4' x 8'", size_basis: "material", width_in: 48, source_line: "x", notes: "y" });
  assert.equal(cloned.size_source, "4' x 8'");
  assert.equal(cloned.size_basis, "material");
  assert.equal(cloned.width_in, 48);
  assert.equal(cloned.source_line, "");
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

  // size_source/size_basis carried; unsized units collapse to 'none'/"".
  const sized = mergeScannedSigns([
    { type: "cabinet", count: 1, width_in: 48, height_in: 96, size_source: "4' x 8'", size_basis: "material" },
  ]);
  assert.equal(sized[0].units[0].size_source, "4' x 8'");
  assert.equal(sized[0].units[0].size_basis, "material");
  const noSize = mergeScannedSigns([
    { type: "cabinet", count: 1, size_source: "junk text", size_basis: "stated" },
  ]);
  assert.equal(noSize[0].units[0].size_basis, "none");
  assert.equal(noSize[0].units[0].size_source, "");
  const badBasis = mergeScannedSigns([
    { type: "cabinet", count: 1, width_in: 10, height_in: 10, size_basis: "bogus" },
  ]);
  assert.equal(badBasis[0].units[0].size_basis, null);
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

  // material-basis sizes carry the unconfirmed note; stated does not.
  const mat = mergeScannedSigns([
    { type: "cabinet", count: 1, width_in: 48, height_in: 96, size_basis: "material" },
  ]);
  assert.match(describeSignsForPrompt(mat), /48" W × 96" H \(size from material sheet — unconfirmed\)/);
  const stated = mergeScannedSigns([
    { type: "cabinet", count: 1, width_in: 48, height_in: 96, size_basis: "stated" },
  ]);
  assert.doesNotMatch(describeSignsForPrompt(stated), /material sheet/);
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

// ── estimatePartsText: real CoreBridge product_notes fixtures ──
{
  const fix1 = JSON.parse(readFileSync(resolve(here, "fixtures/permit-scan-inv14504.json"), "utf8"));
  const { cbCategory, parts } = estimatePartsText(fix1.lines[0].product_notes);
  assert.equal(cbCategory, "Monument Signs");
  for (const want of ["ACM - Aluminum Composite 6mm, 4'x8', white", "Vinyl - 3M IJ175CV3", "Installation"]) {
    assert.ok(parts.includes(want), `missing part: ${want}`);
  }
  for (const p of parts) {
    assert.ok(!p.includes("$"), `money token leaked into parts: ${p}`);
    assert.ok(p !== "4000 Sales" && p !== "Margin", `header/value leaked into parts: ${p}`);
  }
  // Non-CoreBridge-dump notes → empty result.
  assert.deepEqual(estimatePartsText(""), { cbCategory: "", parts: [] });
  assert.deepEqual(estimatePartsText(fix1.lines[1].product_notes), { cbCategory: "", parts: [] });
  assert.deepEqual(estimatePartsText("just a normal note\nnothing structured"), { cbCategory: "", parts: [] });

  const fix2 = JSON.parse(readFileSync(resolve(here, "fixtures/permit-scan-parts2.json"), "utf8"));
  const p2 = estimatePartsText(fix2.lines[0].product_notes);
  assert.ok(p2.parts.includes("Aluminum .080 - Bright White - 4'x 8' - Baked Enamel"),
    `size-bearing part missing; got ${JSON.stringify(p2.parts.slice(0, 6))}`);
  // Dedupe: repeated parts appear once.
  const dupes = p2.parts.filter((p, i) => p2.parts.indexOf(p) !== i);
  assert.deepEqual(dupes, []);
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
  assert.ok(prompt.includes("(name | category as entered | CoreBridge category | quantity | description | parts used to build it)"));
  assert.ok(prompt.includes("size_basis"));

  // From the real INV-14504 fixture: CoreBridge category + parts reach the prompt.
  const fix1 = JSON.parse(readFileSync(resolve(here, "fixtures/permit-scan-inv14504.json"), "utf8"));
  const p2 = buildSignScanPrompt({ estimate_number: "INV-14504", lines: fix1.lines });
  assert.ok(p2.includes("parts:"));
  assert.ok(p2.includes("ACM - Aluminum Composite 6mm, 4'x8', white"));
  assert.ok(p2.includes("CoreBridge category: Monument Signs"));
  assert.ok(p2.includes("Vinyl - 3M IJ175CV3"));
}

// ── parseLocalDate: date-only strings are local midnight, not UTC ──
{
  const d = parseLocalDate("2026-12-10");
  assert.equal(d.getDate(), 10);
  assert.equal(d.getMonth(), 11);
  assert.equal(d.getFullYear(), 2026);
  assert.equal(d.getHours(), 0);
  assert.equal(parseLocalDate("not-a-date"), null);
  assert.equal(parseLocalDate(""), null);
  assert.equal(parseLocalDate(null), null);
  // Full ISO timestamps keep Date's parsing; Date input is cloned.
  const ts = parseLocalDate("2026-12-10T15:30:00");
  assert.equal(ts.getDate(), 10);
  const src = new Date(2026, 11, 10);
  const clone = parseLocalDate(src);
  assert.equal(clone.getDate(), 10);
  assert.notEqual(clone, src);
  // workingDaysBetween on date-only strings is not off by a day in US timezones.
  assert.equal(workingDaysBetween("2026-11-20", "2026-11-23"), 1);
}

// ── addWorkingDays: weekends, n=0, invalid ──
{
  // Fri Nov 20 2026 +1 working day → Mon Nov 23; +5 → Fri Nov 27.
  const fri = new Date(2026, 10, 20);
  const plus1 = addWorkingDays(fri, 1);
  assert.equal(plus1.getDay(), 1);
  assert.equal(plus1.getDate(), 23);
  const plus5 = addWorkingDays(fri, 5);
  assert.equal(plus5.getDay(), 5);
  assert.equal(plus5.getDate(), 27);
  // n<=0 returns the same day; ISO strings accepted; input not mutated.
  const same = addWorkingDays("2026-11-20T00:00:00", 0);
  assert.equal(same.getDate(), 20);
  assert.equal(addWorkingDays(fri, -3).getDate(), 20);
  assert.equal(fri.getDate(), 20);
  assert.equal(addWorkingDays("not-a-date", 3), null);
  assert.equal(addWorkingDays(null, 1), null);
  // Sat +1 → Mon (weekend not counted).
  assert.equal(addWorkingDays(new Date(2026, 10, 21), 1).getDate(), 23);
}

// ── workingDaysBetween ──
{
  assert.equal(workingDaysBetween(new Date(2026, 10, 20), new Date(2026, 10, 23)), 1); // Fri→Mon = 1
  assert.equal(workingDaysBetween(new Date(2026, 10, 20), new Date(2026, 10, 20)), 0);
  assert.equal(workingDaysBetween(new Date(2026, 10, 23), new Date(2026, 10, 20)), 0);
}

// ── profileLimits: real-shaped profile, empty, "information not found" ──
{
  const limits = profileLimits({
    permit_requirements: {
      requires_permit: true,
      max_sign_area_sqft: 80,
      max_height_ft: 30,
      illumination_allowed: true,
      electronic_signs_allowed: null,
      fee_range: "INFORMATION NOT FOUND (fee schedule pending)",
      processing_time: "INFORMATION NOT FOUND",
    },
    sqft_width_height_rules: "Wall signs: 1.5 sq ft per foot of frontage",
    height_allowances: "",
    setback_rules: "INFORMATION NOT FOUND",
    lighting_allowances: "No internal illumination in residential",
  });
  assert.equal(limits.maxAreaSqFt, 80);
  assert.equal(limits.maxHeightFt, 30);
  assert.equal(limits.illuminationAllowed, true);
  assert.equal(limits.electronicAllowed, null);
  assert.equal(limits.feeRange, null);
  assert.equal(limits.processingTime, null);
  assert.equal(limits.texts.length, 2);
  assert.equal(limits.texts[0].label, "Size / area");
  assert.equal(limits.texts[1].label, "Lighting");

  const none = profileLimits(null);
  assert.deepEqual(none, {
    maxAreaSqFt: null, maxHeightFt: null, illuminationAllowed: null,
    electronicAllowed: null, feeRange: null, processingTime: null, texts: [],
  });
  assert.deepEqual(profileLimits({}).maxAreaSqFt, null);
  // Non-finite / non-positive numbers drop; non-boolean drops.
  const bad = profileLimits({ permit_requirements: { max_sign_area_sqft: -3, max_height_ft: "lots", illumination_allowed: "yes", electronic_signs_allowed: false, fee_range: "$50–$200", processing_time: "10 days" } });
  assert.equal(bad.maxAreaSqFt, null);
  assert.equal(bad.maxHeightFt, null);
  assert.equal(bad.illuminationAllowed, null);
  assert.equal(bad.electronicAllowed, false);
  assert.equal(bad.feeRange, "$50–$200");
  assert.equal(bad.processingTime, "10 days");
}

// ── unitRuleFlags: over / under / none ──
{
  const limits = {
    maxAreaSqFt: 80, maxHeightFt: 30,
    illuminationAllowed: false, electronicAllowed: false,
    feeRange: null, processingTime: null, texts: [],
  };
  const over = unitRuleFlags(
    { width_in: 120, height_in: 120, faces: 1, overall_height_in: 480, illuminated: true },
    "emc", limits);
  assert.equal(over.length, 4);
  assert.match(over[0], /Area 100\.0 sq ft is over the 80 sq ft limit on file/);
  assert.match(over[1], /Height 40 ft is over the 30 ft limit on file/);
  assert.match(over[2], /Illumination not allowed per rules on file/);
  assert.match(over[3], /Electronic signs not allowed per rules on file/);

  const under = unitRuleFlags(
    { width_in: 48, height_in: 96, faces: 1, overall_height_in: 240, illuminated: false },
    "cabinet", limits);
  assert.deepEqual(under, []);

  // emc electronic flag only applies to emc type.
  const emcNotElec = unitRuleFlags({ illuminated: false }, "cabinet", limits);
  assert.deepEqual(emcNotElec, []);
  const emcYes = unitRuleFlags({ illuminated: false }, "emc", limits);
  assert.equal(emcYes.length, 1);

  // Missing limits → nothing.
  assert.deepEqual(unitRuleFlags({ width_in: 120, height_in: 120, faces: 1 }, "cabinet", null), []);
  assert.deepEqual(unitRuleFlags({ width_in: 120, height_in: 120, faces: 1 }, "cabinet", { ...limits, maxAreaSqFt: null }), []);
  // Missing sizes → no area/height flags even when limits exist.
  assert.deepEqual(unitRuleFlags({}, "cabinet", limits), []);
}

// ── preBuildWarnings ──
{
  assert.deepEqual(preBuildWarnings({ signs: [], offices: [] }),
    ["No signs listed — the plan will be generic.", "No offices selected — the AI will have to guess them."]);
  const sized = mergeScannedSigns([
    { type: "cabinet", count: 1, width_in: 48, height_in: 96 },
    { type: "channel_letters", count: 2 },            // #2, #3 missing sizes
    { type: "blade", count: 1, width_in: 12, height_in: null },
  ]);
  const w = preBuildWarnings({ signs: sized, offices: [{ name: "Zoning" }] });
  assert.deepEqual(w, ["Sizes missing on #2, #3, #4 — size limits can't be checked."]);
  assert.deepEqual(preBuildWarnings({ signs: sized, offices: [] }),
    ["Sizes missing on #2, #3, #4 — size limits can't be checked.", "No offices selected — the AI will have to guess them."]);
  const allSized = mergeScannedSigns([{ type: "cabinet", count: 1, width_in: 48, height_in: 96 }]);
  assert.deepEqual(preBuildWarnings({ signs: allSized, offices: [{ name: "Zoning" }] }), []);
}

console.log("PASS permit-signs");

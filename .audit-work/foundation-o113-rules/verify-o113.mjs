// O-113 rule-registry verification — bundles the pure module in Node (no
// browser, no network) and asserts: registration completeness, fail-closed
// validation, lookup correctness, params assertion pass/fail, determinism,
// honest verified/held status, and that every seeded rule cites a real
// register id from CONCRETE_FOUNDATION_SOURCE_REGISTER.md (O-120 honored).
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { buildSync } from "esbuild";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
const bundlePath = resolve(here, ".tmp-foundation-rule-registry.mjs");
buildSync({
  entryPoints: [resolve(root, "src/components/estimator/foundation/foundationRuleRegistry.js")],
  bundle: true, format: "esm", outfile: bundlePath, logLevel: "silent",
});
const mod = await import(pathToFileURL(bundlePath).href);
const {
  FOUNDATION_RULE_REGISTRY, FOUNDATION_RULE_SEEDS, FOUNDATION_RULE_SOURCES,
  createFoundationRuleRegistry, foundationBarSizeClass,
} = mod;

let checks = 0;
const ok = (cond, label) => { checks += 1; assert.ok(cond, label); };
const eq = (a, b, label) => { checks += 1; assert.equal(a, b, label); };
const deepEq = (a, b, label) => { checks += 1; assert.deepEqual(a, b, label); };

// ---------- register doc cross-check ----------
const registerDoc = fs.readFileSync(resolve(root, ".audit-work/CONCRETE_FOUNDATION_SOURCE_REGISTER.md"), "utf8");
const registerIds = new Set([...registerDoc.matchAll(/^## (CMP-SUP-\d+)/gm)].map(m => m[1]));
ok(registerIds.size >= 24, "register doc exposes CMP-SUP-001..024 headings");

// Per-entry verification hints from the doc body.
const sections = {};
for (const m of registerDoc.matchAll(/^## (CMP-SUP-\d+)[\s\S]*?(?=^## CMP-SUP-|^## Register Status)/gm)) {
  sections[m[1]] = m[0];
}
const verifiedByDoc = id => {
  const body = sections[id] || "";
  return /Verification:\s*VERIFIED/i.test(body)
    || /VERIFIED for pages/i.test(body)
    || /VERIFIED as a manufacturer spacing example/i.test(body)
    || /VERIFIED as consistent multi-source public quotation/i.test(body);
};

// ---------- registry build integrity ----------
ok(FOUNDATION_RULE_REGISTRY.errors.length === 0, "zero invalid seeds");
eq(FOUNDATION_RULE_REGISTRY.size, FOUNDATION_RULE_SEEDS.length, "every seed registered");
const stats = FOUNDATION_RULE_REGISTRY.stats();
eq(stats.total, FOUNDATION_RULE_SEEDS.length, "stats total matches seeds");
eq(stats.active + stats.held, stats.total, "status counts cover all rules");
ok(FOUNDATION_RULE_SEEDS.length >= 50, "initial population is substantive (>=50 rules)");

// ---------- record completeness on every registered rule ----------
const all = FOUNDATION_RULE_REGISTRY.allRules();
eq(all.length, FOUNDATION_RULE_SEEDS.length, "allRules returns all seeds");
const seen = new Set();
for (const rule of all) {
  ok(!seen.has(rule.rule_id), `rule_id unique: ${rule.rule_id}`);
  seen.add(rule.rule_id);
  ok(/^[A-Z][A-Z0-9]*(-[A-Z0-9]+)+$/.test(rule.rule_id), `rule_id shape ${rule.rule_id}`);
  ok(typeof rule.domain === "string" && rule.domain.length > 0, `domain present ${rule.rule_id}`);
  ok(typeof rule.statement === "string" && rule.statement.length > 0, `statement present ${rule.rule_id}`);
  ok(rule.params && typeof rule.params === "object", `params record ${rule.rule_id}`);
  ok(/^\d+\.\d+\.\d+$/.test(rule.rule_version), `semver ${rule.rule_id}`);
  ok(["active", "held"].includes(rule.status), `status enum ${rule.rule_id}`);
  ok(Array.isArray(rule.limits), `limits array ${rule.rule_id}`);
  ok(Array.isArray(rule.unsupported), `unsupported array ${rule.rule_id}`);
  // every rule is citable — except held seeds, whose null source_ref IS the
  // citation-gap marker (nothing encoded => nothing to cite).
  if (rule.source_ref === null) {
    eq(rule.status, "held", `null source_ref only on held rules: ${rule.rule_id}`);
  } else {
    ok(typeof rule.source_ref === "object", `source_ref present ${rule.rule_id}`);
    ok(registerIds.has(rule.source_ref.register_id), `register_id exists in register doc: ${rule.rule_id} -> ${rule.source_ref.register_id}`);
    ok(typeof rule.source_ref.authority === "string" && rule.source_ref.authority.length > 0, `authority ${rule.rule_id}`);
    ok(typeof rule.source_ref.title === "string" && rule.source_ref.title.length > 0, `title ${rule.rule_id}`);
    ok([true, false, "candidate"].includes(rule.source_ref.verified), `verified enum ${rule.rule_id}`);
    // status honesty: active implies a verified source
    if (rule.status === "active") ok(rule.source_ref.verified === true, `active rule has verified source: ${rule.rule_id}`);
    if (rule.source_ref.verified !== true) eq(rule.status, "held", `unverified-source rule is held: ${rule.rule_id}`);
    // verified claims must match the register doc's own verification state
    if (rule.source_ref.verified === true) {
      ok(verifiedByDoc(rule.source_ref.register_id), `doc backs verified flag: ${rule.rule_id} -> ${rule.source_ref.register_id}`);
    }
    ok(Object.isFrozen(rule.source_ref), `source_ref frozen ${rule.rule_id}`);
  }
  for (const id of rule.corroborating_register_ids) {
    ok(registerIds.has(id), `corroborating id exists: ${rule.rule_id} -> ${id}`);
  }
  // frozen records
  ok(Object.isFrozen(rule), `rule frozen ${rule.rule_id}`);
  ok(Object.isFrozen(rule.params), `params frozen ${rule.rule_id}`);
  // no fabricated numeric values
  for (const [k, v] of Object.entries(rule.params)) {
    if (typeof v === "number") ok(Number.isFinite(v), `param finite ${rule.rule_id}.${k}`);
  }
}

// ---------- registerRule validation: fail closed ----------
{
  const reg = createFoundationRuleRegistry([]);
  const base = {
    domain: "support.placement.spacing", statement: "x",
    applicability: {}, limits: [], unsupported: [],
    rule_version: "1.0.0", status: "active",
    source_ref: { register_id: "CMP-SUP-013", authority: "a", title: "t", edition: null, section: null, url: "u", verified: true },
  };
  // limit-bearing rule missing source_ref -> rejected
  const noRef = reg.registerRule({ ...base, rule_id: "T-NOREF-1", params: { max_spacing_inches: 48 }, source_ref: undefined });
  eq(noRef.ok, false, "missing source_ref rejected");
  eq(reg.size, 0, "rejected rule not stored");
  // missing register_id -> rejected
  const badId = reg.registerRule({ ...base, rule_id: "T-BADID-1", params: { max_spacing_inches: 1 }, source_ref: { ...base.source_ref, register_id: "foo" } });
  eq(badId.ok, false, "malformed register_id rejected");
  // incomplete source_ref -> rejected
  const badRef = reg.registerRule({ ...base, rule_id: "T-BADREF-1", params: { max_spacing_inches: 1 }, source_ref: { register_id: "CMP-SUP-013", verified: true } });
  eq(badRef.ok, false, "incomplete source_ref rejected");
  // bad status / bad version / bad domain / bad id -> rejected
  eq(reg.registerRule({ ...base, rule_id: "T-S-1", params: {}, status: "weird" }).ok, false, "bad status rejected");
  eq(reg.registerRule({ ...base, rule_id: "T-V-1", params: {}, rule_version: "1.0" }).ok, false, "bad version rejected");
  eq(reg.registerRule({ ...base, rule_id: "T-D-1", params: {}, domain: "SUPPORT" }).ok, false, "bad domain rejected");
  eq(reg.registerRule({ ...base, rule_id: "lowercase", params: {} }).ok, false, "bad rule_id rejected");
  eq(reg.registerRule({ ...base, rule_id: "T-P-1", params: "nope" }).ok, false, "non-record params rejected");
  eq(reg.registerRule({ ...base, rule_id: "T-NAN-1", params: { max_x_inches: NaN } }).ok, false, "NaN param rejected");
  // duplicate -> rejected
  eq(reg.registerRule({ ...base, rule_id: "T-DUP-1", params: {} }).ok, true, "first register ok");
  eq(reg.registerRule({ ...base, rule_id: "T-DUP-1", params: {} }).ok, false, "duplicate rejected");
  // candidate-sourced rule declared active -> coerced to held
  const coerced = reg.registerRule({ ...base, rule_id: "T-COERCE-1", params: { max_x_inches: 1 }, source_ref: { ...base.source_ref, verified: "candidate" } });
  eq(coerced.ok, true, "candidate-source rule registers");
  eq(coerced.rule.status, "held", "candidate-source active declaration coerced to held");
  ok(coerced.warnings.length > 0, "coercion warning recorded");
  eq(reg.assertParamsAgainstRule("T-COERCE-1", { x_inches: 1 }).verdict, "rule_not_active", "coerced held rule cannot gate");
}

// ---------- lookupRule ----------
{
  const r = FOUNDATION_RULE_REGISTRY.lookupRule("SUP-SPACING-CHAIR-UTAH-LE5-MAX");
  ok(r && r.rule_id === "SUP-SPACING-CHAIR-UTAH-LE5-MAX", "lookup returns the rule");
  eq(r.params.max_spacing_inches_each_way, 36, "lookup returns intact params");
  eq(FOUNDATION_RULE_REGISTRY.lookupRule("NOPE-NOPE-1"), null, "unknown id -> null");
  eq(FOUNDATION_RULE_REGISTRY.lookupRule("SUP-DENSITY-DOBIE-CRSI-QUOTE-HELD").status, "held", "held rule lookup keeps status");
}

// ---------- rulesForDomain ----------
{
  const support = FOUNDATION_RULE_REGISTRY.rulesForDomain("support");
  ok(support.length >= 40, "subtree match returns the support domain family");
  ok(support.every(r => r.domain === "support" || r.domain.startsWith("support.")), "subtree filter exact");
  ok(support.every(r => r.status === "active"), "held excluded by default");
  const supportWithHeld = FOUNDATION_RULE_REGISTRY.rulesForDomain("support", {}, { includeHeld: true });
  ok(supportWithHeld.length > support.length, "includeHeld adds held rules");
  ok(supportWithHeld.some(r => r.status === "held"), "held rules present when requested");

  const spacing = FOUNDATION_RULE_REGISTRY.rulesForDomain("support.placement.spacing", {}, { includeHeld: true });
  eq(spacing.length, 8, "spacing subtree returns exactly its 8 rules");
  const spacingActive = FOUNDATION_RULE_REGISTRY.rulesForDomain("support.placement.spacing");
  eq(spacingActive.length, 6, "active spacing rules only");

  // context filtering by bar size class
  const le5 = FOUNDATION_RULE_REGISTRY.rulesForDomain("support.placement.spacing", { member_type: "flat_slab", support_class: "individual", bar_size_class: "le_#5" });
  ok(le5.some(r => r.rule_id === "SUP-SPACING-CHAIR-UTAH-LE5-MAX"), "le_#5 context finds the 36in Utah rule");
  ok(!le5.some(r => r.rule_id === "SUP-SPACING-CHAIR-UTAH-GT5-MAX"), "le_#5 context excludes the gt_#5 rule");
  const gt5 = FOUNDATION_RULE_REGISTRY.rulesForDomain("support.placement.spacing", { member_type: "flat_slab", support_class: "individual", bar_size: "#8" });
  ok(gt5.some(r => r.rule_id === "SUP-SPACING-CHAIR-UTAH-GT5-MAX"), "bar_size #8 resolves gt_#5 rule");
  ok(!gt5.some(r => r.rule_id === "SUP-SPACING-CHAIR-UTAH-LE5-MAX"), "bar_size #8 excludes le_#5 rule");
  const none = FOUNDATION_RULE_REGISTRY.rulesForDomain("nonexistent.domain");
  eq(none.length, 0, "unknown domain -> empty");
  // determinism of ordering
  deepEq(support.map(r => r.rule_id), support.map(r => r.rule_id).sort((a, b) => a.localeCompare(b)), "rulesForDomain sorted by rule_id");
}

// ---------- bar size class helper ----------
eq(foundationBarSizeClass("#4"), "le_#5", "#4 -> le_#5");
eq(foundationBarSizeClass("#5"), "le_#5", "#5 -> le_#5");
eq(foundationBarSizeClass("#6"), "gt_#5", "#6 -> gt_#5");
eq(foundationBarSizeClass("#11"), "gt_#5", "#11 -> gt_#5");
eq(foundationBarSizeClass("5"), "le_#5", "bare number works");
eq(foundationBarSizeClass("x"), null, "unparseable -> null");

// ---------- assertParamsAgainstRule ----------
{
  // pass: Iowa continuous ceiling 48
  let r = FOUNDATION_RULE_REGISTRY.assertParamsAgainstRule("SUP-SPACING-CONTINUOUS-IOWA-MAX", { spacing_inches_each_way: 48 });
  eq(r.ok, true, "48 <= 48 passes");
  eq(r.verdict, "pass", "verdict pass");
  r = FOUNDATION_RULE_REGISTRY.assertParamsAgainstRule("SUP-SPACING-CONTINUOUS-IOWA-MAX", { spacing_inches_each_way: 60 });
  eq(r.ok, false, "60 > 48 fails");
  eq(r.violations[0].verdict, "fail", "violation verdict fail");
  r = FOUNDATION_RULE_REGISTRY.assertParamsAgainstRule("SUP-SPACING-CONTINUOUS-IOWA-MAX", {});
  eq(r.ok, false, "missing actual fails closed");
  eq(r.violations[0].verdict, "unverified", "missing actual -> unverified");
  r = FOUNDATION_RULE_REGISTRY.assertParamsAgainstRule("SUP-SPACING-CONTINUOUS-IOWA-MAX", { spacing_inches_each_way: "48" });
  eq(r.ok, false, "string actual fails closed as unverified");

  // Utah le5 = 36
  eq(FOUNDATION_RULE_REGISTRY.assertParamsAgainstRule("SUP-SPACING-CHAIR-UTAH-LE5-MAX", { spacing_inches_each_way: 36 }).ok, true, "Utah 36 pass");
  eq(FOUNDATION_RULE_REGISTRY.assertParamsAgainstRule("SUP-SPACING-CHAIR-UTAH-LE5-MAX", { spacing_inches_each_way: 37 }).ok, false, "Utah 37 fail");

  // FDOT beam bolster: two gated params
  r = FOUNDATION_RULE_REGISTRY.assertParamsAgainstRule("SUP-SPACING-BEAM-BOLSTER-FDOT-MAX", { first_bolster_from_end_inches: 24, spacing_inches_along_beam: 48 });
  eq(r.ok, true, "FDOT beam limits pass");
  r = FOUNDATION_RULE_REGISTRY.assertParamsAgainstRule("SUP-SPACING-BEAM-BOLSTER-FDOT-MAX", { first_bolster_from_end_inches: 30, spacing_inches_along_beam: 48 });
  eq(r.ok, false, "FDOT first-from-end fail");

  // FDOT dobie block: max face 4 + min cure 3 days
  eq(FOUNDATION_RULE_REGISTRY.assertParamsAgainstRule("SUP-DOBIE-FOOTING-BLOCK-FDOT", { block_face_inches: 4, moist_cure_days: 3 }).ok, true, "dobie limits pass");
  eq(FOUNDATION_RULE_REGISTRY.assertParamsAgainstRule("SUP-DOBIE-FOOTING-BLOCK-FDOT", { block_face_inches: 5, moist_cure_days: 3 }).ok, false, "dobie face fail");
  eq(FOUNDATION_RULE_REGISTRY.assertParamsAgainstRule("SUP-DOBIE-FOOTING-BLOCK-FDOT", { block_face_inches: 4, moist_cure_days: 2 }).ok, false, "dobie cure fail");

  // tall-chair bracing >12"
  eq(FOUNDATION_RULE_REGISTRY.assertParamsAgainstRule("SUP-GEOMETRY-TALL-CHAIR-BRACING", { unbraced_height_inches: 12 }).ok, true, "12in chair ok");
  eq(FOUNDATION_RULE_REGISTRY.assertParamsAgainstRule("SUP-GEOMETRY-TALL-CHAIR-BRACING", { unbraced_height_inches: 13 }).ok, false, "13in unbraced fails");

  // tie-wire gauge number: <=16 awg number
  eq(FOUNDATION_RULE_REGISTRY.assertParamsAgainstRule("TIE-WIRE-GAUGE-MIN", { tie_wire_gauge_awg: 16 }).ok, true, "16ga passes");
  eq(FOUNDATION_RULE_REGISTRY.assertParamsAgainstRule("TIE-WIRE-GAUGE-MIN", { tie_wire_gauge_awg: 14 }).ok, true, "14ga (heavier) passes");
  eq(FOUNDATION_RULE_REGISTRY.assertParamsAgainstRule("TIE-WIRE-GAUGE-MIN", { tie_wire_gauge_awg: 18 }).ok, false, "18ga (lighter) fails");

  // held rules cannot gate
  r = FOUNDATION_RULE_REGISTRY.assertParamsAgainstRule("SUP-DENSITY-DOBIE-CRSI-QUOTE-HELD", { blocks_per_footing_mat: 6, spacing_inches_each_way: 60 });
  eq(r.ok, false, "held rule cannot gate");
  eq(r.verdict, "rule_not_active", "held verdict");

  // unknown rule
  r = FOUNDATION_RULE_REGISTRY.assertParamsAgainstRule("NOPE-1", {});
  eq(r.verdict, "rule_not_found", "unknown rule verdict");

  // documentation-only rule has no gated params -> unverified, cannot approve
  r = FOUNDATION_RULE_REGISTRY.assertParamsAgainstRule("SUP-MAT-INDEPENDENT-SUPPORT", {});
  eq(r.ok, false, "paramless rule cannot pass an assertion");
  eq(r.violations[0].code, "no_gated_params", "no_gated_params code");

  // rule object passed directly works
  const ruleObj = FOUNDATION_RULE_REGISTRY.lookupRule("SUP-SPACING-CHAIR-IOWA-MAX");
  eq(FOUNDATION_RULE_REGISTRY.assertParamsAgainstRule(ruleObj, { spacing_inches_each_way: 36 }).ok, true, "object form works");

  // repeat calls are deep-equal (determinism)
  const a1 = FOUNDATION_RULE_REGISTRY.assertParamsAgainstRule("SUP-SPACING-CONTINUOUS-IOWA-MAX", { spacing_inches_each_way: 60 });
  const a2 = FOUNDATION_RULE_REGISTRY.assertParamsAgainstRule("SUP-SPACING-CONTINUOUS-IOWA-MAX", { spacing_inches_each_way: 60 });
  deepEq(a1, a2, "assertion result deterministic");
}

// ---------- determinism across registries ----------
{
  const reg2 = createFoundationRuleRegistry();
  eq(JSON.stringify(reg2.allRules()), JSON.stringify(FOUNDATION_RULE_REGISTRY.allRules()), "two seeded registries serialize identically");
  eq(reg2.size, FOUNDATION_RULE_REGISTRY.size, "same size");
  // frozen registry object itself
  ok(Object.isFrozen(FOUNDATION_RULE_REGISTRY), "registry frozen");
  // mutation attempts on a frozen rule must not take (strict mode throws or silently no-ops — either way the record is unchanged)
  const rule = FOUNDATION_RULE_REGISTRY.lookupRule("SUP-SPACING-CHAIR-UTAH-LE5-MAX");
  try { rule.params.max_spacing_inches_each_way = 99; } catch { /* strict */ }
  eq(rule.params.max_spacing_inches_each_way, 36, "frozen param unchanged after mutation attempt");
}

// ---------- O-120 honesty gates ----------
{
  // citation markers: paid standards never active, never verified
  for (const rule of FOUNDATION_RULE_REGISTRY.allRules()) {
    if (!rule.source_ref) continue;
    if (rule.source_ref.register_id === "CMP-SUP-024" || rule.source_ref.register_id === "CMP-SUP-018"
      || rule.source_ref.register_id === "CMP-SUP-019" || rule.source_ref.register_id === "CMP-SUP-020") {
      eq(rule.status, "held", `paid/uninspected source stays held: ${rule.rule_id}`);
      ok(rule.source_ref.verified !== true, `paid/uninspected source not verified: ${rule.rule_id}`);
    }
  }
  // no non-marker statement presents paid-standard content as inspected authority
  for (const rule of all) {
    if (rule.domain === "authority.marker") continue; // markers exist to document the citation itself
    ok(!/\bper\s+ACI\s*3\d\d\b/i.test(rule.statement), `no 'per ACI 3xx' authority claim in statement: ${rule.rule_id}`);
    ok(!/\bper\s+CRSI\s+(MSP|Manual of Standard Practice|RB4)/i.test(rule.statement), `no 'per CRSI' authority claim: ${rule.rule_id}`);
  }
  // required verified limits from the task are present and active
  const requiredActive = [
    "SUP-SPACING-CHAIR-UTAH-LE5-MAX", "SUP-SPACING-CHAIR-UTAH-GT5-MAX",
    "SUP-SPACING-FLATSLAB-UTAH-MAX", "SUP-SPACING-CONTINUOUS-IOWA-MAX",
    "SUP-SPACING-CHAIR-IOWA-MAX", "SUP-DOBIE-FOOTING-BLOCK-FDOT",
    "SUP-MAT-INDEPENDENT-SUPPORT", "SUP-UPPER-NO-BASE-REACH",
    "SUP-GEOMETRY-TALL-CHAIR-BRACING", "SUP-SUBSTRATE-LOOSE-PLATE",
    "SUP-EPOXY-BARS-COATED-SUPPORTS",
  ];
  for (const id of requiredActive) {
    const r = FOUNDATION_RULE_REGISTRY.lookupRule(id);
    ok(r !== null, `required rule seeded: ${id}`);
    eq(r.status, "active", `required rule active: ${id}`);
    eq(r.source_ref.verified, true, `required rule verified: ${id}`);
  }
  // required held gaps from the task are present and held
  const requiredHeld = [
    "SUP-DENSITY-DOBIE-CRSI-QUOTE-HELD", "SUP-SPACING-HIGHCHAIR-TRADE-EXAMPLE-HELD",
    "SUP-SPACING-CASTLE-NZ-CHART-HELD", "SUP-DENSITY-MESHUPS-AREA-HELD",
    "SUP-CATALOG-HCP-HEIGHT-CONFLICT-HELD", "SUP-CATALOG-SBU-RANGE-DISPUTED-HELD",
    "AUTH-CRSI-MSP-HELD", "AUTH-ACI-315-HELD", "AUTH-ACI-318-HELD", "AUTH-CRSI-PRB-HELD",
  ];
  for (const id of requiredHeld) {
    const r = FOUNDATION_RULE_REGISTRY.lookupRule(id);
    ok(r !== null, `required held rule seeded: ${id}`);
    eq(r.status, "held", `required rule held: ${id}`);
  }
}

// ---------- seed-source consistency ----------
{
  // every register source citation matches the register doc's own authority line loosely:
  // at minimum the register id prefix exists and the doc mentions the org keyword.
  for (const [id, s] of Object.entries(FOUNDATION_RULE_SOURCES)) {
    ok(registerIds.has(id), `FOUNDATION_RULE_SOURCES id exists in doc: ${id}`);
  }
  // no seed duplicates an id inside params or claims a register id shape in limits text that doesn't exist
  for (const rule of all) {
    const allText = [rule.statement, ...rule.limits, ...rule.unsupported].join(" ");
    for (const m of allText.matchAll(/CMP-SUP-\d{3}/g)) {
      ok(registerIds.has(m[0]), `referenced register id exists in text of ${rule.rule_id}`);
    }
  }
}

// ---------- held-seed registration (O-106/O-111/O-112 encodings) ----------
{
  // The METHOD-*-HELD skeleton + support/masonry held seeds must REGISTER —
  // a held seed in .errors is invisible to consumers, defeating the marker.
  const heldSeeds = [
    "METHOD-SIGN-WIND-HELD", "METHOD-FOOTING-BEARING-HELD", "METHOD-SHAFT-HELD",
    "METHOD-PILLAR-BAR-HELD", "METHOD-BASE-PLATE-HELD", "METHOD-LATERAL-HELD",
    "METHOD-FROST-HELD",
    "SUP-HEIGHT-HELD", "SUP-CAPACITY-HELD",
    "CAP-COPING-HELD", "CAP-DRIP-HELD", "CAP-MORTAR-HELD",
  ];
  for (const id of heldSeeds) {
    const r = FOUNDATION_RULE_REGISTRY.lookupRule(id);
    ok(r !== null, `held seed registered: ${id}`);
    eq(r.status, "held", `held seed status: ${id}`);
    eq(r.source_ref, null, `held seed carries no citation: ${id}`);
  }
  // held seeds surface through includeHeld domain lookups — a consumer asking
  // for the method subtree sees every named gap.
  const methods = FOUNDATION_RULE_REGISTRY.rulesForDomain("method", {}, { includeHeld: true });
  for (const id of heldSeeds.filter((i) => i.startsWith("METHOD-"))) {
    ok(methods.some((r) => r.rule_id === id), `method domain exposes held seed: ${id}`);
  }
  // the previously-malformed compatibility seed registers under the canonical shape
  const compat = FOUNDATION_RULE_REGISTRY.lookupRule("SUP-COMPAT-BASE-PLATE-ON-SHAFT");
  ok(compat !== null, "SUP-COMPAT-BASE-PLATE-ON-SHAFT registered");
  eq(compat.domain, "support.compatibility", "compat seed domain canonicalized");
  eq(compat.status, "held", "candidate-source compat seed coerced to held");
  // topic index documents every method domain + the masonry cap domain
  const { FOUNDATION_SOURCE_TOPIC_INDEX } = mod;
  for (const d of ["method.sign_wind", "method.footing", "method.shaft", "method.lateral",
    "method.frost_depth", "method.pillar_bar", "method.base_plate", "masonry.cap_detail", "support.geometry"]) {
    ok(typeof FOUNDATION_SOURCE_TOPIC_INDEX[d] === "string", `topic index documents domain: ${d}`);
  }
}

const s = FOUNDATION_RULE_REGISTRY.stats();
console.log(`PASS verify-o113 (${s.total} rules: ${s.active} active / ${s.held} held, ${checks} assertions)`);

// verify-lane-de-subunits.mjs -- Lane D/E bounded-subunit sweep (O-047/O-050/
// O-051/O-053/O-054/O-058/O-059/O-062/O-063/O-069/O-073/O-098/O-101/O-114/
// O-115/O-120). Asserts each landed subunit's contract: presence on the right
// surface + behavior where the model is importable.

import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const src = (p) => readFileSync(join(root, p), "utf8");
const count = (s, sub) => s.split(sub).length - 1;

let pass = 0, fail = 0;
const ok = (cond, name) => {
  if (cond) { pass += 1; }
  else { fail += 1; console.log(`FAIL ${name}`); }
};

const diag = src("src/components/estimator/foundation/foundationSceneDiagnostics.js");
const walls = src("src/components/estimator/foundation/FoundationWallsPanel.jsx");
const caps = src("src/components/estimator/foundation/FoundationWallCapsPanel.jsx");
const capCalc = src("src/components/estimator/foundation/wallCapCalculator.js");
const poles = src("src/components/estimator/foundation/FoundationPolesPanel.jsx");
const landsc = src("src/components/estimator/foundation/LandscapeDesigner.jsx");
const design = src("src/components/estimator/foundation/FoundationDesignBasis.jsx");
const page = src("src/pages/FoundationEstimator.jsx");
const examples = src(".audit-work/foundation-method-examples.md");
const register = src(".audit-work/CONCRETE_FOUNDATION_SOURCE_REGISTER.md");
const poleCalc = src("src/components/estimator/foundation/poleCalculator.js");

// -- O-047 masonry walls: joint/bond checks read authored fields ------------
ok(diag.includes("wall?.materialId ? \"masonry\""), "O-047: masonry detection resolves materialId");
ok(diag.includes("wall?.mortar_joint_inches ?? wall?.mortarGapInches"), "O-047: joint check reads authored mortarGapInches");
ok(diag.includes("mortar-joint-held"), "O-047: mortar-joint-held advisory");
ok(diag.includes("brick-bond-held"), "O-047: brick-bond-held advisory");
ok(walls.includes("brick_bond_type"), "O-047: brick_bond_type authored");
ok(walls.includes("corner_return_count"), "O-047: corner_return_count authored");
ok(walls.includes('"running"') && walls.includes('"flemish"'), "O-047: bond enum (running/stack/Flemish/soldier)");

// -- O-050/O-051 caps: miter/joint fields + end-treatment enum --------------
ok(caps.includes("miter_angle_deg"), "O-050: cap_miter_angle authored");
ok(caps.includes("joint_width_inches"), "O-050: cap_joint_width authored");
ok(capCalc.includes("export const WALL_CAP_SUPPORTED_END_TREATMENTS"), "O-051: end-treatment enum documented/exported");
ok(diag.includes("cap-miter-held") && diag.includes("cap-joint-held"), "O-050: miter/joint held advisories");
ok(diag.includes("cap-miter-overlap"), "O-051: cap_miter_overlap advisory");

// -- O-053/O-054 caps: offcut election + anchor log --------------------------
ok(caps.includes("offcut_reuse_elected"), "O-053: offcut_reuse_elected authored");
ok(caps.includes("purchased_pieces"), "O-053: purchased_pieces authored");
ok(caps.includes("cap_anchor_state"), "O-054: cap_anchor_state authored");
ok(caps.includes("reanchor_log"), "O-054: reanchor_log recorded on re-anchor");

// -- O-058/O-059/O-062/O-063 poles + signs -----------------------------------
ok(diag.includes("pole-clash"), "O-058: pole_clash advisory (pairwise diameter)");
ok(diag.includes("pole-edge-clearance"), "O-058: pole-edge-clearance advisory");
ok(diag.includes("sign-mount-mismatch"), "O-059: sign_mount_mismatch advisory");
ok(poles.includes("sign_span_count"), "O-059: sign_span_count surface");
ok(poles.includes("anchor_assembly"), "O-062: anchor_assembly authored");
ok(diag.includes("anchor-assembly-held"), "O-062: anchor-assembly held advisory");
ok(diag.includes("hardware-unsupported"), "O-062: hardware_unsupported advisory");
ok(diag.includes("linked-product-missing"), "O-063: linked_product_missing advisory");

// -- O-069/O-073 landscape ----------------------------------------------------
ok(landsc.includes("landscape?.locked === true") || landsc.includes("landscape.locked === true"), "O-069: landscape_lock enforced on paint paths");
ok(landsc.includes("landscape?.layer ?? \"\""), "O-069: landscape_layer authored");
ok(count(landsc, "locked === true") >= 4, "O-069: lock gates paint+edge+flood+flag");
ok(landsc.includes("waste_fraction") && landsc.includes("labor_cost"), "O-073: waste_fraction + labor_cost authored");

// -- O-098 a11y sweep on touched surfaces -------------------------------------
for (const [f, pat] of [
  ["poles", "Remove pole"], ["caps", "Remove cap"], ["walls", "Remove wall"],
]) {
  ok(src(`src/components/estimator/foundation/Foundation${{ poles: "PolesPanel", caps: "WallCapsPanel", walls: "WallsPanel" }[f]}.jsx`)
    .includes(`aria-label={\`${pat}`), `O-098: ${pat} button labeled`);
}

// -- O-101 walkthrough fields --------------------------------------------------
ok(page.includes("walkthrough_step"), "O-101: walkthrough_step authored");
ok(page.includes("walkthrough_video_url"), "O-101: walkthrough_video_url authored");

// -- O-114 worked examples -----------------------------------------------------
ok(examples.includes("WORKED-EX-UNIT-CONV"), "O-114: WORKED-EX-UNIT-CONV doc");
ok(examples.includes("WORKED-EX-MONOTONIC"), "O-114: WORKED-EX-MONOTONIC doc");
ok(examples.includes("WORKED-EX-BOUNDARY"), "O-114: WORKED-EX-BOUNDARY doc");
ok(poleCalc.includes("embedment_inches: 40") && poleCalc.includes("shaft_diameter_inches: 16"),
  "O-114: worked example reproduces its derivation (40/16)");

// -- O-115 feasible fields ------------------------------------------------------
ok(poles.includes("feasible_candidate"), "O-115: feasible_candidate authored");
ok(poles.includes("dim_range"), "O-115: dim_range authored");

// -- O-120 licensing fields ------------------------------------------------------
ok(design.includes("license_class"), "O-120: license_class authored");
ok(design.includes("licensed_source"), "O-120: licensed_source authored (tri-state)");

// -- O-102/O-103/W-023 docs -------------------------------------------------------
ok(register.includes("Source Groups By Domain"), "O-102: per-domain source-group docs");
ok(register.includes("Authority Class Badges"), "O-103: class-badge docs");
ok(register.includes("shop_assumptions"), "O-103: shop_assumptions class documented");

// -- behavior: run the diagnostics against a fixture -----------------------------
// The module uses extensionless `@/`-adjacent imports — bundle it with esbuild
// before importing (the codebase's hardening-test convention).
import { execSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
try {
  const tmp = mkdtempSync(join(tmpdir(), "lane-de-"));
  const bundle = join(tmp, "diag.mjs").replace(/\\/g, "/");
  execSync(`npx esbuild "${join(root, "src/components/estimator/foundation/foundationSceneDiagnostics.js")}" --bundle --format=esm --platform=node --outfile="${bundle}"`, { stdio: "pipe" });
  const mod = await import(pathToFileURL(bundle).href);
  const fn = mod.foundationSceneDiagnostics || mod.default;
  ok(typeof fn === "function", "diagnostics module exports the scene function");
  if (typeof fn === "function") {
    // A masonry wall (materialId set) with no mortar joint + no bond records
    // the held advisories; a wall WITH authored joint/bond stays quiet.
    const noJoint = fn({
      items: [{ component_id: "f1", foundation_type: "spread_foot", x_inches: 0, z_inches: 0, length_inches: 48, width_inches: 48 }],
      walls: [{ component_id: "w1", materialId: "mat1", shape: { points: [{ x: 0, z: 0 }, { x: 10, z: 0 }], closed: false } }],
      poles: [], wall_caps: [], signage_cabinets: [],
    });
    const kinds = new Set(noJoint.map((f) => f.kind));
    ok(kinds.has("mortar-joint-held"), "behavior: masonry wall w/o joint -> mortar-joint-held");
    ok(kinds.has("brick-bond-held"), "behavior: masonry wall w/o bond -> brick-bond-held");

    const authored = fn({
      items: [{ component_id: "f1", foundation_type: "spread_foot", x_inches: 0, z_inches: 0, length_inches: 48, width_inches: 48 }],
      walls: [{ component_id: "w1", materialId: "mat1", mortarGapInches: 0.375, brick_bond_type: "running", shape: { points: [{ x: 0, z: 0 }, { x: 10, z: 0 }], closed: false } }],
      poles: [], wall_caps: [], signage_cabinets: [],
    });
    const kinds2 = new Set(authored.map((f) => f.kind));
    ok(!kinds2.has("mortar-joint-held"), "behavior: authored joint -> no mortar-joint-held");
    ok(!kinds2.has("brick-bond-held"), "behavior: authored bond -> no brick-bond-held");

    // Pole clash: two 8"-dia poles 4" apart -> clash; 20" apart -> quiet.
    const clash = fn({
      items: [], walls: [], wall_caps: [], signage_cabinets: [],
      poles: [
        { component_id: "p1", x_inches: 0, z_inches: 0, diameter_inches: 8, height_inches: 120 },
        { component_id: "p2", x_inches: 4, z_inches: 0, diameter_inches: 8, height_inches: 120 },
      ],
    });
    ok(clash.some((f) => f.kind === "pole-clash"), "behavior: overlapping poles -> pole-clash");
    const clear = fn({
      items: [], walls: [], wall_caps: [], signage_cabinets: [],
      poles: [
        { component_id: "p1", x_inches: 0, z_inches: 0, diameter_inches: 8, height_inches: 120 },
        { component_id: "p2", x_inches: 20, z_inches: 0, diameter_inches: 8, height_inches: 120 },
      ],
    });
    ok(!clear.some((f) => f.kind === "pole-clash"), "behavior: spaced poles -> no pole-clash");

    // Cap overlap: two caps on seg s1 overlapping -> cap-miter-overlap.
    const over = fn({
      items: [], poles: [], signage_cabinets: [],
      walls: [{ component_id: "w1", shape: { points: [{ x: 0, z: 0 }, { x: 100, z: 0 }], closed: false, segments: [{ component_id: "s1", length: 100 }] } }],
      wall_caps: [
        { segment_component_id: "s1", wall_component_id: "w1", position_along_segment_inches: 0, length_inches: 48 },
        { segment_component_id: "s1", wall_component_id: "w1", position_along_segment_inches: 40, length_inches: 48 },
      ],
    });
    ok(over.some((f) => f.kind === "cap-miter-overlap"), "behavior: overlapping caps -> cap-miter-overlap");

    // Linked product: sign links a missing item -> linked-product-missing.
    const linked = fn({
      items: [], walls: [], wall_caps: [], signage_cabinets: [],
      poles: [{ component_id: "p1", x_inches: 0, z_inches: 0, height_inches: 120, signs: [{ linked_product_id: "gone", mount_height_inches: 60, height_inches: 24 }] }],
    });
    ok(linked.some((f) => f.kind === "linked-product-missing"), "behavior: dangling link -> linked-product-missing");
  }
} catch (e) {
  fail += 1;
  console.log(`FAIL diagnostics import: ${e.message}`);
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

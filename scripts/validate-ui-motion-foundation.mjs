// Static-contract checks for the Phase 0+1 motion & glow foundation:
// shared tokens, reduced-motion guards on every animated primitive, button
// press feedback, the desktop page transition, and the CSS utilities.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import vm from "node:vm";

const css = readFileSync("src/index.css", "utf8");
const layout = readFileSync("src/Layout.jsx", "utf8");
const button = readFileSync("src/components/ui/button.jsx", "utf8");
const tokens = readFileSync("src/components/motion/motion.js", "utf8");
const files = {
  FadeIn: readFileSync("src/components/motion/FadeIn.jsx", "utf8"),
  Stagger: readFileSync("src/components/motion/Stagger.jsx", "utf8"),
  CountUp: readFileSync("src/components/motion/CountUp.jsx", "utf8"),
  GlowCard: readFileSync("src/components/motion/GlowCard.jsx", "utf8"),
};
let passed = 0;
const test = (name, fn) => { fn(); passed += 1; console.log("PASS " + name); };

function loadTokens() {
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(
    tokens.replace(/^export /gm, "")
      + "\nthis.__x = { duration, easing, spring, staggerContainer, fadeUpItem, pageEnter };",
    ctx,
  );
  return ctx.__x;
}

test("motion tokens expose a single duration/easing/spring vocabulary", () => {
  const x = loadTokens();
  assert.equal(x.duration.micro, 0.12);
  assert.equal(x.duration.page, 0.38);
  assert.ok(x.spring.soft.type === "spring" && x.spring.snappy.stiffness > x.spring.soft.stiffness);
  const container = x.staggerContainer(0.05, 0.1);
  assert.equal(container.show.transition.staggerChildren, 0.05);
  assert.equal(x.pageEnter.initial.y, 8);
  assert.equal(x.fadeUpItem.hidden.opacity, 0);
});

test("every motion primitive honors prefers-reduced-motion", () => {
  for (const [name, source] of Object.entries(files)) {
    assert.match(source, /useReducedMotion/, name + " must read the reduced-motion preference");
  }
  assert.match(files.FadeIn, /initial=\{reduceMotion \? false/);
  assert.match(files.Stagger, /initial=\{reduceMotion \? false/);
  assert.match(files.GlowCard, /hover && !reduceMotion/, "GlowCard disables hover lift under reduced motion");
});

test("CountUp animates only for motion users and lands on the target otherwise", () => {
  assert.match(files.CountUp, /animate\(prev\.current, target/);
  assert.match(files.CountUp, /if \(reduceMotion\) \{\s*node\.textContent = format\(target\)/);
  assert.match(files.CountUp, /aria-live="polite"/);
});

test("buttons get press feedback and hover lift, both gated by motion-safe", () => {
  assert.match(button, /motion-safe:active:scale-\[0\.97\]/);
  assert.match(button, /transition-\[color,background-color,border-color,box-shadow,transform\]/);
  const lifts = button.match(/motion-safe:hover:-translate-y-px/g) || [];
  assert.ok(lifts.length >= 4, "all filled variants must lift on hover");
  const ghost = button.match(/ghost: "([^"]*)"/)[1];
  assert.doesNotMatch(ghost, /translate-y/, "ghost/link stay flat — no floaty links");
});

test("desktop pages get an enter-only fade transition keyed by route", () => {
  assert.match(layout, /key=\{location\.pathname\}/);
  assert.match(layout, /initial=\{reduceMotion \? false : \{ opacity: 0, y: 8 \}\}/);
  assert.match(layout, /animate=\{\{ opacity: 1, y: 0 \}\}/);
  const desktopBranch = layout.slice(layout.indexOf(") : (\n                <motion.div"));
  assert.doesNotMatch(desktopBranch.slice(0, 600), /AnimatePresence/, "enter-only: no exit animation delaying navigation");
});

test("ambient mesh and status glows exist with reduced-motion fallbacks", () => {
  assert.match(css, /@keyframes ambientDrift/);
  assert.match(css, /\.ambient-mesh/);
  assert.match(css, /\.glow-card/);
  for (const tone of ["glow-success", "glow-warning", "glow-danger", "glow-info"]) {
    assert.match(css, new RegExp("\\." + tone));
  }
  const ambientBlock = css.slice(css.indexOf("@keyframes ambientDrift"), css.indexOf("Face-scan reticle"));
  assert.match(ambientBlock, /prefers-reduced-motion[\s\S]*\.ambient-mesh \{ animation: none; \}/, "ambient-mesh must have a reduced-motion fallback");
});

test("glow-card transforms only paint-safe properties", () => {
  const cardBlock = css.slice(css.indexOf(".glow-card {"), css.indexOf(".glow-success"));
  assert.match(cardBlock, /box-shadow/);
  assert.doesNotMatch(cardBlock, /transition:[^}]*\b(width|height|top|left|margin|padding)\b/,
    "no layout-thrashing transition properties");
});

test("motion barrel re-exports the full primitive set", () => {
  const index = readFileSync("src/components/motion/index.js", "utf8");
  for (const name of ["FadeIn", "GlowCard", "CountUp", "Stagger", "StaggerItem", "duration", "spring", "pageEnter"]) {
    assert.ok(index.includes(name), "index.js must export " + name);
  }
});

test("StatCards adopt stagger, count-up, and status glow", () => {
  const stat = readFileSync("src/components/estimator/home/StatCards.jsx", "utf8");
  assert.match(stat, /<Stagger className=/);
  assert.match(stat, /<StaggerItem key=/);
  assert.match(stat, /<CountUp value=\{counts\[c\.key\]/);
  assert.match(stat, /glow-card/);
  assert.match(stat, /glow-danger/, "sync-issue card must glow when nonzero");
});

test("SalesHome wraps its sections in FadeIn", () => {
  const home = readFileSync("src/pages/SalesHome.jsx", "utf8");
  assert.match(home, /import FadeIn from "@\/components\/motion\/FadeIn"/);
  assert.ok((home.match(/<FadeIn/g) || []).length >= 2);
  assert.match(home, /<FadeIn delay=\{0\.12\}>/);
});

test("TimeClock header has no decorative 3D canvas", () => {
  const page = readFileSync("src/pages/TimeClock.jsx", "utf8");
  assert.doesNotMatch(page, /SceneCanvas/, "the ambient 3D hero was removed");
  assert.ok(!existsSync("src/components/motion/SceneCanvas.jsx"), "SceneCanvas.jsx must be deleted");
});

test("TimeClock mount loading renders a layout skeleton, not a bare spinner", () => {
  const page = readFileSync("src/pages/TimeClock.jsx", "utf8");
  const branch = page.slice(page.indexOf("if (isLoading && allUsers.length === 0)"), page.indexOf("const shellAlreadyGuards"));
  assert.match(branch, /<Skeleton className="h-12 w-12 rounded-xl" \/>/);
  assert.match(branch, /<Skeleton className="mb-4 h-64 w-full rounded-2xl" \/>/);
  assert.match(branch, /ambient-mesh/, "the skeleton keeps the ambient backdrop");
  assert.doesNotMatch(branch, /animate-spin/, "no bare spinner during first paint");
  assert.match(page, /import \{ Skeleton \} from "@\/components\/ui\/skeleton"/);
});

test("TableSkeleton primitive renders a shaped table placeholder", () => {
  const src = readFileSync("src/components/ui/table-skeleton.jsx", "utf8");
  assert.match(src, /columns = 5/);
  assert.match(src, /rows = 6/);
  assert.match(src, /<thead className="bg-slate-50 dark:bg-slate-800">/);
  assert.doesNotMatch(src, /animate-spin/, "skeletons must not spin");
});

for (const [file, cols, gone] of [["src/pages/Inventory.jsx", 7, "Loading stock"], ["src/pages/JobCosting.jsx", 12, "Loading job costs"], ["src/pages/PurchaseOrders.jsx", 6, "Loading purchase orders"]]) {
  test(`${file} uses TableSkeleton for its list loader`, () => {
    const src = readFileSync(file, "utf8");
    assert.match(src, /import \{ TableSkeleton \} from "@\/components\/ui\/table-skeleton"/);
    assert.match(src, new RegExp(`<TableSkeleton columns=\\{${cols}\\} />`));
    assert.ok(!src.includes(gone), "first-paint list loader must not be a spinner");
  });
}

test("Estimating board loading renders a card-list skeleton", () => {
  const src = readFileSync("src/pages/Estimating.jsx", "utf8");
  assert.match(src, /import \{ ListSkeleton \} from "@\/components\/ui\/list-skeleton"/);
  assert.match(src, /<ListSkeleton rows=\{5\} \/>/);
  assert.doesNotMatch(src, /animate-spin rounded-full h-12 w-12/, "board loader must not be a spinner");
  const skel = readFileSync("src/components/ui/list-skeleton.jsx", "utf8");
  assert.match(skel, /rows = 5/);
});

test("WorkPauseOverlay entrance uses motion with reduced-motion fallback", () => {
  const src = readFileSync("src/components/timeclock/WorkPauseOverlay.jsx", "utf8");
  assert.match(src, /import \{ motion, useReducedMotion \} from "framer-motion"/);
  assert.match(src, /const reduceMotion = useReducedMotion\(\)/);
  assert.match(src, /initial=\{reduceMotion \? false : \{ opacity: 0 \}\}/, "backdrop fades in");
  assert.match(src, /initial=\{reduceMotion \? false : \{ opacity: 0, scale: 0\.92, y: 24 \}\}/, "card springs in");
  assert.match(src, /transition=\{spring\.soft\}/);
});

test("TimeClockLoginDialog animates the error banner", () => {
  const src = readFileSync("src/components/timeclock/TimeClockLoginDialog.jsx", "utf8");
  assert.match(src, /import FadeIn from "@\/components\/motion\/FadeIn"/);
  assert.match(src, /<FadeIn>/);
});

test("EmployeeTodayCard glows by live clock status", () => {
  const src = readFileSync("src/components/timeclock/EmployeeTodayCard.jsx", "utf8");
  assert.match(src, /hasProblem \? "glow-danger"/);
  assert.match(src, /work_pause_status === "paused" \? "glow-warning"/);
  assert.match(src, /break_status === "on_break" \? "glow-warning"/);
  assert.match(src, /"glow-success"/);
  assert.match(src, /clay-card glow-card p-4 mb-6 \$\{cardGlow\}/);
});

for (const file of ["src/pages/MondayMorningMeeting.jsx", "src/pages/ResourcePlanning.jsx"]) {
  test(`${file} renders skeletons during its loading branch`, () => {
    const src = readFileSync(file, "utf8");
    assert.match(src, /import \{ ListSkeleton \} from "@\/components\/ui\/list-skeleton"/);
    assert.match(src, /<ListSkeleton rows=\{\d+\} \/>/);
    assert.doesNotMatch(src, /min-h-screen[\s\S]{0,200}animate-spin/, "full-screen spinner must be gone");
  });
}

test("CurrentWorkCard glows while a labor segment is tracked", () => {
  const src = readFileSync("src/components/timeclock/CurrentWorkCard.jsx", "utf8");
  assert.match(src, /glow-card \$\{activeLabor \? "glow-info" : ""\}/);
});

test("TimeClock weekly entries list staggers in", () => {
  const src = readFileSync("src/pages/TimeClock.jsx", "utf8");
  assert.match(src, /import \{ Stagger, StaggerItem \} from "@\/components\/motion\/Stagger"/);
  assert.match(src, /<Stagger className="space-y-3">/);
  assert.match(src, /<StaggerItem key=\{entry\.id\} className="clay-card p-4">/);
});

test("FaceEnrollmentDialog success state animates the check", () => {
  const src = readFileSync("src/components/timeclock/FaceEnrollmentDialog.jsx", "utf8");
  assert.match(src, /success-burst/);
  assert.match(src, /check-draw/);
  assert.doesNotMatch(src, /CheckCircle2/, "static icon replaced by animated svg");
});

for (const [file, shape] of [
  ["src/pages/MyWorkflow.jsx", /ListSkeleton rows=\{8\}/],
  ["src/pages/Financials.jsx", /ListSkeleton rows=\{5\}/],
  ["src/pages/CompletedReports.jsx", /ListSkeleton rows=\{6\}/],
  ["src/pages/FeatureReports.jsx", /ListSkeleton rows=\{6\}/],
]) {
  test(`${file} renders a list skeleton while loading`, () => {
    const src = readFileSync(file, "utf8");
    assert.match(src, /import \{ ListSkeleton \} from "@\/components\/ui\/list-skeleton"/);
    assert.match(src, shape);
  });
}

test("ReportingDashboard renders a dashboard skeleton while loading", () => {
  const src = readFileSync("src/pages/ReportingDashboard.jsx", "utf8");
  assert.match(src, /import \{ Skeleton \} from "@\/components\/ui\/skeleton"/);
  assert.match(src, /<Skeleton className="h-72 w-full rounded-xl" \/>/);
  assert.doesNotMatch(src, /min-h-96[\s\S]{0,120}animate-spin/, "full-page spinner must be gone");
});

test("ChangeOrders loaders use content-shaped skeletons", () => {
  const src = readFileSync("src/pages/ChangeOrders.jsx", "utf8");
  assert.match(src, /<ListSkeleton rows=\{3\} \/>/, "dialog detail skeleton");
  assert.match(src, /<TableSkeleton columns=\{6\} \/>/, "list table skeleton");
});

test("TimeClock time-off list staggers in", () => {
  const src = readFileSync("src/pages/TimeClock.jsx", "utf8");
  const tab = src.slice(src.indexOf('TabsContent value="timeoff"'), src.indexOf('TabsContent value="balance"'));
  assert.match(tab, /<Stagger className="space-y-3">/);
  assert.match(tab, /<StaggerItem key=\{request\.id\} className="clay-card p-4">/);
});

test("PTOBalanceView loading shows a card skeleton", () => {
  const src = readFileSync("src/components/timeclock/PTOBalanceView.jsx", "utf8");
  assert.match(src, /import \{ Skeleton \} from "@\/components\/ui\/skeleton"/);
  assert.match(src, /<Skeleton className="h-9 w-24" \/>/);
  assert.doesNotMatch(src, /animate-spin/, "PTO balance loading must not spin");
});

test("TimeClock detail dialogs use list skeletons", () => {
  const sd = readFileSync("src/components/timeclock/TimeClockShiftDetail.jsx", "utf8");
  const at = readFileSync("src/components/timeclock/TimeClockAuditTrail.jsx", "utf8");
  assert.ok(sd.includes("import { ListSkeleton } from"), "shift detail imports ListSkeleton");
  assert.ok(!sd.includes("animate-spin"), "shift detail must not spin");
  assert.ok(at.includes("<ListSkeleton rows={5}"), "audit trail uses ListSkeleton");
  assert.ok(!at.includes("Loading audit history"), "audit trail spinner text gone");
});

console.log(`\nMOTION FOUNDATION VALIDATOR: ${passed} checks PASS`);

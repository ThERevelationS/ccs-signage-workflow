// Static-contract checks for the Phase 0+1 motion & glow foundation:
// shared tokens, reduced-motion guards on every animated primitive, button
// press feedback, the desktop page transition, and the CSS utilities.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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

test("SceneCanvas lazy-loads three and respects motion + visibility", () => {
  const sc = readFileSync("src/components/motion/SceneCanvas.jsx", "utf8");
  assert.match(sc, /await import\("three"\)/, "three must load lazily inside the effect");
  assert.match(sc, /useReducedMotion/);
  assert.match(sc, /if \(reduceMotion\) \{\s*render\(0\)/, "reduced motion must render one static frame only");
  assert.match(sc, /visibilitychange/, "the RAF loop must pause on hidden tabs");
  assert.match(sc, /geometry\?\.dispose\?\.\(\)/);
  assert.match(sc, /renderer\?\.dispose\?\.\(\)/);
  assert.match(sc, /aria-hidden="true"/);
});

test("TimeClock header mounts the ambient 3D layer behind content", () => {
  const page = readFileSync("src/pages/TimeClock.jsx", "utf8");
  assert.match(page, /import SceneCanvas from "@\/components\/motion\/SceneCanvas"/);
  assert.match(page, /<SceneCanvas className="absolute inset-0 opacity-60" \/>/);
  const header = page.slice(page.indexOf("{/* Header */}"), page.indexOf("{sessionNotice"));
  assert.match(header, /relative flex items-center justify-between/, "header content must sit above the canvas");
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

for (const [file, cols] of [["src/pages/Inventory.jsx", 7], ["src/pages/JobCosting.jsx", 12], ["src/pages/PurchaseOrders.jsx", 6]]) {
  test(`${file} uses TableSkeleton for its list loader`, () => {
    const src = readFileSync(file, "utf8");
    assert.match(src, /import \{ TableSkeleton \} from "@\/components\/ui\/table-skeleton"/);
    assert.match(src, new RegExp(`<TableSkeleton columns=\\{${cols}\\} />`));
    assert.doesNotMatch(src, /py-16 text-slate-500"><Loader2/, "first-paint list loader must not be a spinner");
  });
}

console.log(`\nMOTION FOUNDATION VALIDATOR: ${passed} checks PASS`);

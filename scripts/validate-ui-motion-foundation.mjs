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
  const rmBlock = css.slice(css.lastIndexOf("prefers-reduced-motion"));
  assert.match(rmBlock, /\.ambient-mesh \{ animation: none; \}/);
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

console.log(`\nMOTION FOUNDATION VALIDATOR: ${passed} checks PASS`);

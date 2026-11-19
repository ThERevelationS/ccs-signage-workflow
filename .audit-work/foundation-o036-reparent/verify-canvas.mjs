import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { buildSync } from "esbuild";

const OUT = ".audit-work/foundation-o036-reparent/verify";
fs.mkdirSync(OUT, { recursive: true });
const stubsDir = path.resolve(`${OUT}/stubs`);
fs.mkdirSync(stubsDir, { recursive: true });

fs.writeFileSync(`${stubsDir}/jsx-runtime.js`, `
export const jsx = (type, props) => ({ type, props: props || {} });
export const jsxs = jsx;
export const Fragment = "Fragment";
`);
fs.writeFileSync(`${stubsDir}/react.js`, `
export const useMemo = (fn) => fn();
export const useState = (v) => [typeof v === "function" ? v() : v, () => {}];
export const useRef = (v) => ({ current: v });
export const useEffect = () => {};
export const useLayoutEffect = () => {};
export const useInsertionEffect = () => {};
export const useCallback = (fn) => fn;
export const useContext = () => ({});
export const useReducer = (r, v) => [v, () => {}];
export const useId = () => "stub-id";
export const useDebugValue = () => {};
export const useTransition = () => [false, (fn) => fn && fn()];
export const useDeferredValue = (v) => v;
export const useImperativeHandle = () => {};
export const useSyncExternalStore = (sub, getSnap) => (getSnap ? getSnap() : undefined);
export const createElement = (type, props, ...children) => ({ type, props: { ...(props || {}), children: children.length <= 1 ? children[0] : children } });
export const cloneElement = (el, props) => ({ ...(el || {}), props: { ...(el?.props || {}), ...(props || {}) } });
export const isValidElement = (el) => !!el && typeof el === "object";
export const Children = { map: (c, fn) => (Array.isArray(c) ? c.map(fn) : c == null ? [] : [fn(c)]), forEach: (c, fn) => (Array.isArray(c) ? c.forEach(fn) : c != null && fn(c)), count: (c) => (Array.isArray(c) ? c.length : c == null ? 0 : 1), only: (c) => c, toArray: (c) => (Array.isArray(c) ? c : c == null ? [] : [c]) };
export const forwardRef = (fn) => fn;
export const memo = (c) => c;
export const lazy = (fn) => () => ({ type: "lazy" });
export const createRef = () => ({ current: null });
export const createContext = (v) => ({ Provider: "ContextProvider", Consumer: "ContextConsumer", _currentValue: v });
export const startTransition = (fn) => fn && fn();
export const Component = class {};
export const PureComponent = class {};
export const StrictMode = "StrictMode";
export const Suspense = "Suspense";
export const Fragment = Symbol("Fragment");
export default {};
`);
fs.writeFileSync(`${stubsDir}/lucide-react.js`, `
const icon = (name) => (props) => ({ type: "icon", props: { ...(props || {}), icon: name } });
export const Move = icon("Move"), ZoomIn = icon("ZoomIn"), ZoomOut = icon("ZoomOut");
`);

const SRC = path.resolve("src");
const alias = {
  "@": SRC,
  "react": `${stubsDir}/react.js`,
  "react/jsx-runtime": `${stubsDir}/jsx-runtime.js`,
  "react-dom": `${stubsDir}/react.js`,
  "lucide-react": `${stubsDir}/lucide-react.js`,
};

const bundle = (entry, name) => {
  buildSync({
    entryPoints: [path.resolve(entry)], bundle: true, platform: "node", format: "esm",
    outfile: `${OUT}/${name}.bundle.mjs`, alias,
    external: ["@/*"],
    loader: { ".jsx": "jsx", ".js": "jsx" }, jsx: "automatic",
  });
  return import(pathToFileURL(path.resolve(`${OUT}/${name}.bundle.mjs`)).href);
};

const results = [];
const check = (name, fn) => {
  const record = { name };
  results.push(record);
  try { fn(); record.ok = true; console.log("ok", name); }
  catch (e) { record.ok = false; record.error = String(e.stack || e); console.error("FAIL", name, e.message); }
};

// Minimal browser globals — a bundled UI dep probes window/self at load.
globalThis.window = globalThis.window || {
  self: {}, top: {}, self_ref: null, addEventListener() {}, removeEventListener() {},
  matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
  requestAnimationFrame: (fn) => setTimeout(fn, 0),
  getComputedStyle: () => ({}),
  innerWidth: 1280, innerHeight: 800, devicePixelRatio: 1, location: { href: "", pathname: "/" },
  document: { addEventListener() {}, removeEventListener() {}, createElement: () => ({ style: {}, setAttribute() {} }), documentElement: { style: {} }, body: {} },
  navigator: { maxTouchPoints: 0, userAgent: "stub" },
};
globalThis.window.self = globalThis.window;
const defineGlobal = (name, value) => {
  try { Object.defineProperty(globalThis, name, { value, configurable: true, writable: true }); }
  catch { globalThis[name] = value; }
};
defineGlobal("self", globalThis.window);
defineGlobal("top", globalThis.window);
defineGlobal("document", globalThis.window.document);
defineGlobal("navigator", globalThis.window.navigator);
defineGlobal("requestAnimationFrame", globalThis.window.requestAnimationFrame);
defineGlobal("getComputedStyle", globalThis.window.getComputedStyle);
defineGlobal("matchMedia", globalThis.window.matchMedia);

const canvasMod = await bundle("src/components/estimator/foundation/FoundationLayoutCanvas.jsx", "canvas");
const selMod = await bundle("src/components/estimator/foundation/foundationSceneSelection.js", "selection");
const FoundationLayoutCanvas = canvasMod.default;
const { createSceneSelection } = selMod;

// Walk a stub-rendered tree for elements matching a predicate.
const walk = (node, pred, out = []) => {
  if (!node) return out;
  if (Array.isArray(node)) { node.forEach((n) => walk(n, pred, out)); return out; }
  if (typeof node === "object") {
    if (pred(node)) out.push(node);
    const kids = node.props?.children;
    if (kids) walk(kids, pred, out);
  }
  return out;
};
const hasData = (node, attr) => node.props && node.props[attr] !== undefined;

// ── Scene fixture (mirrors verify-o036) ─────────────────────────────────
const scene = {
  items: [
    { component_id: "item-a", foundation_type: "spread_foot", x_inches: 0, z_inches: 0, length_inches: 48, width_inches: 24, rotation_degrees: 0 },
  ],
  walls: [
    { component_id: "wall-a", shape: { closed: false, points: [{ x: 0, z: 100 }, { x: 100, z: 100 }, { x: 100, z: 150 }], segments: [{ component_id: "seg-1" }] } },
  ],
  poles: [
    { component_id: "pole-1", x_inches: 10, z_inches: 5, foundation_component_id: "item-a", foundation_idx: 0 },
    { component_id: "pole-2", x_inches: 200, z_inches: 5 },
  ],
  wallCaps: [
    { component_id: "cap-1", wall_component_id: "wall-a", wall_index: 0, segment_component_id: "seg-1", segment_index: 0 },
  ],
  signageCabinets: [
    { component_id: "cab-1", mount: "pole", pole_component_id: "pole-1", pole_index: 0 },
  ],
};

check("bundle: canvas compiles with reparent seam", () => {
  assert.equal(typeof FoundationLayoutCanvas, "function");
  assert.equal(typeof createSceneSelection, "function");
});

check("mount chrome: one link per live mount, honest anchors, none for standalone", () => {
  const tree = FoundationLayoutCanvas({ ...scene, onMoveItem: () => true, onPatchScene: () => true });
  const svg = walk(tree, (n) => hasData(n, "data-mount-links"));
  assert.equal(svg.length, 1);
  const links = walk(svg[0], (n) => hasData(n, "data-mount-link"));
  const ids = links.map((l) => l.props["data-mount-link"]).sort();
  assert.deepEqual(ids, ["cabinet:component:cab-1", "pole:component:pole-1", "wall-cap:component:cap-1"].sort());
  // each live link draws a tether line + a diamond badge
  const lines = walk(svg[0], (n) => n.type === "line");
  const badges = walk(svg[0], (n) => n.type === "rect");
  assert.ok(lines.length >= 2, `expected ≥2 tethers, got ${lines.length}`);
  assert.equal(badges.length, 3);
  // pole-1 tether ends at item-a center (24,12)
  const poleLink = links.find((l) => l.props["data-mount-link"] === "pole:component:pole-1");
  const poleLine = walk(poleLink, (n) => n.type === "line")[0];
  assert.equal(poleLine.props.x1, 10);
  assert.equal(poleLine.props.y1, 5);
  assert.equal(poleLine.props.x2, 24);
  assert.equal(poleLine.props.y2, 12);
});

check("Mount button appears only when a reparentable child is selected + editable", () => {
  // seeded selection: pole-1 selected → Mount button renders
  const sel = createSceneSelection();
  sel.setSelection([{ id: "pole:component:pole-1" }]);
  const tree = FoundationLayoutCanvas({
    ...scene, onMoveItem: () => true, onPatchScene: () => true, sceneSelection: sel,
  });
  const mountBtns = walk(tree, (n) => n.props?.["data-op"] === "reparent");
  assert.equal(mountBtns.length, 1);
  assert.equal(mountBtns[0].props.disabled, false);
  // item-only selection → no Mount button
  const sel2 = createSceneSelection();
  sel2.setSelection([{ id: "item:component:item-a" }]);
  const tree2 = FoundationLayoutCanvas({
    ...scene, onMoveItem: () => true, onPatchScene: () => true, sceneSelection: sel2,
  });
  assert.equal(walk(tree2, (n) => n.props?.["data-op"] === "reparent").length, 0);
});

check("Mount button disables without the multi channel", () => {
  const sel = createSceneSelection();
  sel.setSelection([{ id: "pole:component:pole-1" }]);
  const tree = FoundationLayoutCanvas({
    ...scene, onMoveItem: () => true, sceneSelection: sel, // no onPatchScene
  });
  const mountBtns = walk(tree, (n) => n.props?.["data-op"] === "reparent");
  assert.equal(mountBtns.length, 1);
  assert.equal(mountBtns[0].props.disabled, true);
});

await Promise.all([]);
const failures = results.filter((r) => r.ok === false);
console.log(`\n${results.length - failures.length}/${results.length} o036-canvas checks passed`);
if (failures.length) {
  fs.writeFileSync(`${OUT}/verify-o036-canvas-failures.json`, JSON.stringify(failures, null, 2));
  process.exit(1);
}
console.log("PASS o036-canvas");

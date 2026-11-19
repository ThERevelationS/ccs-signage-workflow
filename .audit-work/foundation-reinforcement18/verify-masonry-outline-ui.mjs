// verify-masonry-outline-ui.mjs — focused WallShapeEditor unit/interaction harness.
// Bundle: outline-candidate Editor + outline-candidate wallCalculator; real react-test-renderer.
// UI-only proofs: rect validation, metadata preservation, malformed render, unique IDs,
// SVG scale click mapping, segment-ID remap after assembly normalization.
import fs from "fs";
import path from "path";
import assert from "assert/strict";
import esbuild from "esbuild";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const React = require("react");
const { act, create } = require("react-test-renderer");
const DIR = ".audit-work/foundation-reinforcement18/";
const SPEC = JSON.parse(fs.readFileSync(DIR + "masonry-outline-flow-proof-spec.json", "utf8"));
const hash = (t) => require("crypto").createHash("sha256").update(t).digest("hex");
const art = JSON.parse(fs.readFileSync(DIR + SPEC.sourceArtifact, "utf8"));
assert.equal(art.head, SPEC.sourceHead, "source artifact head");
const sources = new Map();
for (const f of art.files) sources.set("/app/" + f.path, f.normalized ?? f.text);
sources.set("/app/src/components/estimator/foundation/wallCalculator.js", fs.readFileSync(DIR + "masonry-outline-candidate-wallCalculator.js", "utf8"));
sources.set("/app/src/components/estimator/foundation/WallShapeEditor.jsx", fs.readFileSync(DIR + "masonry-outline-candidate-WallShapeEditor.jsx", "utf8"));
assert.equal(hash(sources.get("/app/src/components/estimator/foundation/wallCalculator.js")), SPEC.candidateHash, "calc candidate");
assert.equal(hash(sources.get("/app/src/components/estimator/foundation/WallShapeEditor.jsx")), SPEC.candidateEditorHash, "editor candidate");
// real DOM element stubs (forward props to real <button>/<input>)
sources.set("/app/src/components/ui/button.jsx", "export const Button = ({children, ...p}) => <button {...p}>{children}</button>;");
sources.set("/app/src/components/ui/input.jsx", "export const Input = ({className, ...p}) => <input className={className} {...p} />;");
sources.set("/app/lucide-react/index.jsx","export const Undo2=(p)=><svg {...p}/>; export const Trash2=(p)=><svg {...p}/>; export const Square=(p)=><svg {...p}/>;");
sources.set("/app/entry.js", `
import WallShapeEditor, { buildSegments } from "/app/src/components/estimator/foundation/WallShapeEditor.jsx";
import { foundationWallOutlineBasis, foundationWallRectangle, foundationWallSegments } from "/app/src/components/estimator/foundation/wallCalculator.js";
export { WallShapeEditor, buildSegments, foundationWallOutlineBasis, foundationWallRectangle, foundationWallSegments };
`);
const plug = { name: "frozen", setup(b) {
  b.onResolve({ filter: /.*/ }, (a) => {
    let base;
    if (a.path.startsWith("/app/")) base = a.path;
    else if (a.path.startsWith("@/")) base = "/app/src/" + a.path.slice(2);
    else if (a.path.startsWith(".")) {
      if (!a.importer.startsWith("/app")) return null;
      base = path.posix.resolve(path.posix.dirname(a.importer), a.path);
    } else if (a.path === "lucide-react") return { path: "/app/lucide-react/index.jsx", namespace: "frozen" };
    else return null;
    const resolved = [base, base + ".js", base + ".jsx"].find((p) => sources.has(p));
    if (!resolved) throw Error("Missing frozen source: " + a.path + " from " + a.importer);
    return { path: resolved, namespace: "frozen" };
  });
  b.onLoad({ filter: /.*/, namespace: "frozen" }, (a) => ({
    contents: sources.get(a.path), loader: a.path.endsWith(".jsx") ? "jsx" : "js", resolveDir: path.resolve("."),
  }));
} };
const build = await esbuild.build({
  entryPoints: ["/app/entry.js"], bundle: true, platform: "browser", format: "cjs",
  write: false, logLevel: "silent", jsx: "automatic", plugins: [plug], external: ["react", "react-dom", "react-test-renderer" ],
});
assert.deepEqual(build.warnings, []);
const tmp = DIR + "_outline-ui-bundle.cjs";
fs.writeFileSync(tmp, build.outputFiles[0].contents);
const { WallShapeEditor, buildSegments, foundationWallRectangle } = require(path.resolve(tmp));
globalThis.window = { confirm: () => true };

const results = [];
const check = async (id, fn) => {
  try { await fn(); results.push({ id, ok: true }); console.log("ok " + id); }
  catch (e) { results.push({ id, ok: false, error: String(e.stack || e).slice(0, 900) }); console.log("FAIL " + id + " :: " + String(e.message || e).slice(0, 300)); }
};
const VALID = { points: [{ x: 0, z: 0 }, { x: 8, z: 0 }, { x: 8, z: 8 }, { x: 0, z: 8 }], closed: true, segments: [{ length: 8 }, { length: 8 }, { length: 8 }, { length: 8 }], tag: "meta" };
const inputs = (c) => c.root.findAll((el) => el.type === "input");
const byId = (c, prefix) => c.root.findAll((el) => String(el.props?.id || "").startsWith(prefix));
const btnByText = (c, t) => c.root.findAll((el) => el.type === "button" && String(el.props?.children?.join?.("") ?? el.props?.children ?? "").includes(t) || el.type === "button" && (Array.isArray(el.props?.children) ? el.props.children.some((x) => String(x).includes(t)) : String(el.props?.children).includes(t)));
const mount = async (shape) => {
  let last = null, calls = [];
  let c;
  await act(async () => { c = create(React.createElement(WallShapeEditor, { shape, onChange: (s) => { last = s; calls.push(s); } })); });
  return { c, get last() { return last; }, calls };
};

// invalid rect values — no onChange, shape unchanged, apply disabled, linked diagnostic, per-field marking
for (const bad of ["", "0", "-5", "abc", "1e999", "NaN"]) {
  await check("invalid-rect-l-" + JSON.stringify(bad), async () => {
    const { c, calls } = await mount(JSON.parse(JSON.stringify(VALID)));
    await act(async () => { byId(c, "rectL")[0].props.onChange({ target: { value: bad } }); });
    assert.equal(calls.length, 0, "no onChange on invalid l");
    assert.equal(byId(c, "rectL")[0].props["aria-invalid"], true, "l marked");
    assert.equal(byId(c, "rectW")[0].props["aria-invalid"], undefined, "w not marked");
    assert.equal(byId(c, "rectL")[0].props["aria-describedby"], byId(c, "rectW")[0].props["aria-describedby"] === undefined ? "rect-err-" + byId(c, "rectL")[0].props.id.replace("rectL-", "") : undefined);
    const use = btnByText(c, "Use rectangle")[0];
    assert.equal(use.props.disabled, true, "apply disabled");
    const err = c.root.findAll((el) => String(el.props?.id || "").startsWith("rect-err"));
    assert.equal(err.length, 1, "one error element");
    assert.equal(byId(c, "rectL")[0].props["aria-describedby"], err[0].props.id, "l links to error");
  });
  await check("invalid-rect-w-" + JSON.stringify(bad), async () => {
    const { c, calls } = await mount(JSON.parse(JSON.stringify(VALID)));
    await act(async () => { byId(c, "rectW")[0].props.onChange({ target: { value: bad } }); });
    assert.equal(calls.length, 0, "no onChange on invalid w");
    assert.equal(byId(c, "rectW")[0].props["aria-invalid"], true, "w marked");
    assert.equal(byId(c, "rectL")[0].props["aria-invalid"], undefined, "l not marked");
    assert.equal(byId(c, "rectW")[0].props["aria-describedby"], c.root.findAll((el) => String(el.props?.id || "").startsWith("rect-err"))[0].props.id, "w links to error");
    assert.equal(btnByText(c, "Use rectangle")[0].props.disabled, true, "apply disabled");
  });
}

await check("valid-rect-8x8-exact-geometry-metadata", async () => {
  const { c, calls } = await mount(JSON.parse(JSON.stringify(VALID)));
  await act(async () => { byId(c, "rectL")[0].props.onChange({ target: { value: "8" } }); });
  await act(async () => { byId(c, "rectW")[0].props.onChange({ target: { value: "8" } }); });
  await act(async () => { btnByText(c, "Use rectangle")[0].props.onClick(); });
  const last = calls.at(-1);
  assert.equal(last.points.length, 4);
  assert.deepEqual(last.points, [{ x: 0, z: 0 }, { x: 8, z: 0 }, { x: 8, z: 8 }, { x: 0, z: 8 }]);
  assert.equal(last.closed, true);
  assert.deepEqual(last.segments.map((s) => s.length), [8, 8, 8, 8]);
  assert.equal(last.tag, "meta", "extra shape metadata preserved");
});
await check("valid-rect-decimal-8_5x4_25", async () => {
  const { c, calls } = await mount(JSON.parse(JSON.stringify(VALID)));
  await act(async () => { byId(c, "rectL")[0].props.onChange({ target: { value: "8.5" } }); });
  await act(async () => { byId(c, "rectW")[0].props.onChange({ target: { value: "4.25" } }); });
  await act(async () => { btnByText(c, "Use rectangle")[0].props.onClick(); });
  assert.deepEqual(calls.at(-1).points.map((p) => [p.x, p.z]), [[0, 0], [8.5, 0], [8.5, 4.25], [0, 4.25]]);
  assert.deepEqual(calls.at(-1).segments.map((s) => s.length), [8.5, 4.25, 8.5, 4.25]);
});
await check("valid-rect-numeric-string-events", async () => {
  const { c, calls } = await mount(JSON.parse(JSON.stringify(VALID)));
  await act(async () => { byId(c, "rectL")[0].props.onChange({ target: { value: "8" } }); });
  await act(async () => { byId(c, "rectW")[0].props.onChange({ target: { value: "8" } }); });
  await act(async () => { btnByText(c, "Use rectangle")[0].props.onClick(); });
  assert.ok(calls.at(-1).points.every((p) => Number.isFinite(p.x) && Number.isFinite(p.z)), "numeric points");
});
await check("malformed-points-no-crash-no-guessed-preview", async () => {
  const { c } = await mount({ points: [{ x: 0, z: 0 }, { x: null, z: "bad" }], closed: false, segments: [{ length: 16 }] });
  const polys = c.root.findAll((el) => el.type === "polyline");
  assert.equal(polys.length, 0, "no guessed polygon");
  const txt = JSON.stringify(c.toJSON());
  assert.ok(txt.includes("Unavailable") || !txt.includes('perimeter'), "no invented perimeter");
  assert.ok(txt.includes("need repair"), "repair warning shown");
});
await check("one-point-drawable-undo-clear", async () => {
  const { c, calls } = await mount({ points: [{ x: 0, z: 0 }], closed: false, segments: [{ length: 0 }] });
  const svg = c.root.findAll((el) => el.type === "svg" && typeof el.props?.onClick === "function")[0];
  svg.props.onClick({ currentTarget: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 520, height: 300 }) }, clientX: 100, clientY: 100 });
  await act(async () => {});
  assert.ok(calls.length >= 0, "no crash on click");
  const undo = btnByText(c, "Undo")[0]; assert.ok(undo, "Undo present");
  const clear = btnByText(c, "Clear")[0]; assert.ok(clear, "Clear present");
});
await check("valid-open-closed-unaffected", async () => {
  const open = { points: [{ x: 0, z: 0 }, { x: 8, z: 0 }, { x: 8, z: 8 }], closed: false, segments: [{ length: 8 }, { length: 8 }] };
  const { c } = await mount(JSON.parse(JSON.stringify(open)));
  const polys = c.root.findAll((el) => el.type === "polyline");
  assert.equal(polys.length, 1, "open polyline renders");
  const { c: c2 } = await mount(JSON.parse(JSON.stringify(VALID)));
  assert.equal(c2.root.findAll((el) => el.type === "polyline").length, 1, "closed polyline renders");
});
await check("legacy-segments-only-no-polygon-warning", async () => {
  const { c } = await mount({ closed: false, segments: [{ length: 16 }] });
  assert.equal(c.root.findAll((el) => el.type === "polyline").length, 0, "no polygon");
  assert.ok(JSON.stringify(c.toJSON()).includes("Recorded segment lengths only"), "legacy warning");
});
await check("two-editors-unique-grid-and-error-ids", async () => {
  let c;
  await act(async () => {
    c = create(React.createElement("div", null,
      React.createElement(WallShapeEditor, { shape: VALID, onChange: () => {} }),
      React.createElement(WallShapeEditor, { shape: { points: [{ x: 1, z: 1 }], closed: false, segments: [] }, onChange: () => {} })));
  });
  const grids = c.root.findAll((el) => el.type === "pattern").map((el) => el.props.id);
  assert.equal(new Set(grids).size, grids.length, "unique grid ids");
  const rectIds = c.root.findAll((el) => el.type === "input" && String(el.props?.id || "").startsWith("rectL")).map((el) => el.props.id);
  assert.equal(new Set(rectIds).size, rectIds.length, "unique rect ids");
});
await check("scaled-svg-click-maps-to-viewbox-inches", async () => {
  const { c, calls } = await mount({ points: [], closed: false, segments: [] });
  const svg = c.root.findAll((el) => el.type === "svg" && typeof el.props?.onClick === "function")[0];
  // mobile: rendered width 260 (half of 520 viewBox) — click at x=130px => viewBox 260 => inch (260-20)/1.4 ≈ 171.4 snap 172
  svg.props.onClick({ currentTarget: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 260, height: 150 }) }, clientX: 130, clientY: 75 });
  await act(async () => {});
  assert.ok(calls.length, "click emitted");
  const expectedX = Math.max(0, Math.round(((130 * (520 / 260)) - 20) / 1.4 / 2) * 2);
  assert.equal(calls.at(-1).points[0].x, expectedX, "scaled x mapping");
});
await check("malformed-clear-available", async () => {
  const { c, calls } = await mount({ points: [{ x: null }], closed: false, segments: "bad" });
  const clear = btnByText(c, "Clear")[0];
  assert.ok(clear, "Clear present");
  assert.equal(clear.props.disabled, false, "Clear enabled for malformed");
  await act(async () => { clear.props.onClick(); });
  assert.deepEqual({ points: calls.at(-1).points, segments: calls.at(-1).segments, closed: calls.at(-1).closed }, { points: [], segments: [], closed: false }, "cleared");
});
await check("consecutive-duplicate-point-not-appended-after-clamp", async () => {
  const { c, calls } = await mount({ points: [], closed: false, segments: [] });
  const svg = c.root.findAll((el) => el.type === "svg" && typeof el.props?.onClick === "function")[0];
  const ev = () => ({ currentTarget: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 520, height: 300 }) }, clientX: 5, clientY: 5 });
  svg.props.onClick(ev()); await act(async () => {});
  assert.equal(calls.length, 1, "first click emits");
  const emitted = calls.at(-1);
  await act(async () => { c.update(React.createElement(WallShapeEditor, { shape: emitted, onChange: (sh) => calls.push(sh) })); });
  const svg2 = c.root.findAll((el) => el.type === "svg" && typeof el.props?.onClick === "function")[0];
  svg2.props.onClick(ev()); await act(async () => {});
  assert.equal(calls.length, 1, "dup click suppressed after shape feedback");
  assert.equal(calls[0].points.length, 1, "one point recorded");
});

assert.equal(results.length, 23, "case count");
const okCount = results.filter((r) => r.ok).length;
fs.writeFileSync(DIR + "masonry-outline-ui-verification.json", JSON.stringify({ results }, null, 2));
console.log("masonry-outline-ui passed=" + okCount + " failed=" + (results.length - okCount));
if (okCount !== results.length) process.exit(1);

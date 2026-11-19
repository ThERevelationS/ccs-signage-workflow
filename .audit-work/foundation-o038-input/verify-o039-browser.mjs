// O-038/O-039 real-component verification — mounts the CANDIDATE
// FoundationLayoutCanvas (staging tree = remote files + new modules, never
// local src/) in real Chromium and replays the layout10 gesture scenarios.
// Asserts the wired input seam preserves committed behavior byte-for-byte:
// drag commit, sub-inch wiggle null, keyboard nudges, second-pointer guard,
// reorder identity, invalid-item exclusion, zoom/scroll mapping, read-only,
// pen input — plus an in-browser probe of the new modules.
// Usage: node verify-o039-browser.mjs
import esbuild from "esbuild";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { chromium } from "playwright-core";

const OUT = ".audit-work/foundation-o038-input";
fs.mkdirSync(OUT, { recursive: true });
const STAGE = path.resolve(`${OUT}/staging-src`);
const STUBS = {
  "lucide-react": `export const Move=()=>null;export const ZoomIn=()=>null;export const ZoomOut=()=>null;`,
};

const harness = `
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import FoundationLayoutCanvas from '@/components/estimator/foundation/FoundationLayoutCanvas';
import * as transforms from '@/components/estimator/foundation/foundationSceneTransforms';
import * as input from '@/components/estimator/foundation/foundationSceneInput';
window.__scene = { transforms, input };

const baseItems = () => ([
  { component_id: 'i0', x_inches: 10, z_inches: 10, length_inches: 24, width_inches: 24 },
  { component_id: 'i1', x_inches: 120, z_inches: 80, length_inches: 48, width_inches: 36 },
]);
const basePoles = () => ([{ component_id: 'pp', x_inches: 60, z_inches: 55 }]);
function App(){
  const [items,setItems]=useState(baseItems());
  const [poles]=useState(basePoles());
  const [moves,setMoves]=useState([]);
  const [editable,setEditable]=useState(true);
  window.__items=items; window.__moves=moves;
  window.__ctl=(cmd,arg)=>{
    if(cmd==='reorder')setItems(prev=>[prev[1],prev[0]]);
    if(cmd==='delete')setItems(prev=>[prev[0]]);
    if(cmd==='mutate')setItems(prev=>prev.map((it,j)=>j===0?{...it,length_inches:99}:it));
    if(cmd==='readonly')setEditable(false);
    if(cmd==='editable')setEditable(true);
    if(cmd==='reset'){setItems(baseItems());setMoves([]);setEditable(true);}
    if(cmd==='invalidpos')setItems(prev=>[{...prev[0],x_inches:'bad'},prev[1]]);
  };
  return React.createElement(FoundationLayoutCanvas,{
    items, poles,
    onMoveItem: editable ? (i,p)=>{setMoves(m=>[...m,{i,p}]);setItems(prev=>prev.map((it,j)=>j===i?{...it,...p}:it));} : undefined,
  });
}
createRoot(document.getElementById('root')).render(React.createElement(React.StrictMode, null, React.createElement(App)));
`;

const plugin = {
  name: "s",
  setup(b) {
    b.onResolve({ filter: /^harness$/ }, () => ({ path: "harness", namespace: "h" }));
    b.onResolve({ filter: /.*/ }, (a) => (STUBS[a.path] ? { path: path.resolve("s-" + a.path.replace(/[^a-z0-9]/gi, "_")), namespace: "s" } : undefined));
    b.onLoad({ filter: /.*/, namespace: "h" }, () => ({ contents: harness, loader: "jsx", resolveDir: STAGE }));
    b.onLoad({ filter: /.*/, namespace: "s" }, (a) => {
      const key = Object.keys(STUBS).find((k) => path.resolve("s-" + k.replace(/[^a-z0-9]/gi, "_")) === a.path);
      return { contents: STUBS[key], loader: "js", resolveDir: STAGE };
    });
  },
};

const built = await esbuild.build({
  entryPoints: ["harness"], bundle: true, format: "iife", platform: "browser",
  write: false, plugins: [plugin], loader: { ".js": "jsx", ".jsx": "jsx" },
  jsx: "automatic", alias: { "@": STAGE }, metafile: true,
});
const inputs = Object.keys(built.metafile.inputs);
fs.writeFileSync(`${OUT}/o039-browser-inputs.json`, JSON.stringify(inputs, null, 1));
assert.ok(inputs.some((i) => i.includes("foundationSceneTransforms")), "transforms bundled");
assert.ok(inputs.some((i) => i.includes("foundationSceneInput")), "input bundled");
assert.ok(inputs.some((i) => i.includes("staging-src")), "bundle built from staging tree");
assert.ok(!inputs.some((i) => /base44|src[\\/]components[\\/]estimator[\\/]foundation(?!.*staging)/i.test(i) && !i.includes("staging-src")), "no local-src/base44 inputs");
fs.writeFileSync(`${OUT}/o039-page-bundle.js`, built.outputFiles[0].text);

// Minimal CSS shim — the app renders these utilities via Tailwind; the
// fixture only needs the geometry-relevant subset (mirrors layout10's).
const css = `
  *,*::before,*::after{box-sizing:border-box}
  .relative{position:relative}.absolute{position:absolute}
  [class*="aspect-"]{aspect-ratio:3/2}
  .overflow-auto{overflow:auto}.flex-wrap{flex-wrap:wrap}.gap-2{gap:8px}.select-none{user-select:none}
  .rounded-sm{border-radius:2px}.rounded-full{border-radius:9999px}
  .flex{display:flex}.items-center{align-items:center}.justify-center{justify-content:center}
  .justify-between{justify-content:space-between}.border{border-width:1px}
  .border-2{border-width:2px;border-style:dashed;border-color:#d97706}
  .bg-amber-100\\/70{background:rgba(254,243,199,.7)}
  .cursor-move{cursor:move}
  .w-2\\.5{width:10px}.h-2\\.5{height:10px}.w-6{width:24px}.h-6{height:24px}
  .w-10{width:40px}.h-3{height:12px}.w-3{width:12px}.h-\\[420px\\]{height:420px}
  .bg-slate-700{background:#334155}.border-white{border-color:#fff}
  .p-3{padding:12px}.p-2{padding:8px}.mb-2{margin-bottom:8px}.mt-1{margin-top:4px}
  .left-1{left:4px}.top-1{top:4px}.z-10{z-index:10}
  .bg-white{background:#fff}.bg-gray-50{background:#f9fafb}.border-gray-200{border-color:#e5e7eb}.border-gray-300{border-color:#d1d5db}
  body{margin:8px;font-family:sans-serif}
`;
const html = `<!doctype html><meta charset="utf-8"><style>${css}</style><body><div id="root"></div><script>${built.outputFiles[0].text.replace(/<\/script/g, "<\\/script")}</script></body></html>`;
const server = http.createServer((req, res) => { res.setHeader("content-type", "text/html"); res.end(html); });
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const port = server.address().port;

const browser = await chromium.launch({ channel: "chrome", headless: true });
const results = [];
const record = (name, fn) => results.push({ name, ...(typeof fn === "function" ? fn() || {} : {}) });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.on("pageerror", (e) => record(`pageerror: ${e.message}`, () => { throw e; }));
  await page.goto(`http://127.0.0.1:${port}/`);
  await page.waitForSelector("text=Layout Canvas", { timeout: 15000 });

  const itemBox = async (label) => {
    const el = page.locator(`[aria-label="${label}"]`).first();
    await el.waitFor({ timeout: 5000 });
    return el.boundingBox();
  };
  const canvasBox = () => page.locator('[class*="aspect-"]').boundingBox();
  // Wait until item `label`'s DOM rect matches its plan position — the
  // percent-positioning seam projected through the live element rect.
  const waitPlaced = async (label, xIn, zIn) => page.waitForFunction(([lab, x, z]) => {
    const el = document.querySelector(`[aria-label="${lab}"]`);
    if (!el) return false;
    const cv = el.parentElement.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    return cv.width > 10 && Math.abs(r.left - (cv.left + (x * cv.width) / 480)) < 2
      && Math.abs(r.top - (cv.top + (z * cv.height) / 320)) < 2;
  }, [label, xIn, zIn], { timeout: 8000 });

  // --- scenario A: mouse drag commits a whole-inch patch ---
  await waitPlaced("Move Foundation 2", 120, 80);
  const b0 = await itemBox("Move Foundation 2");
  const cb = await canvasBox();
  await page.mouse.move(b0.x + 8, b0.y + 8);
  await page.mouse.down();
  await page.mouse.move(b0.x + 48, b0.y + 30, { steps: 4 });
  await page.mouse.up();
  await page.waitForTimeout(80);
  const mvA = await page.evaluate("window.__moves");
  assert.equal(mvA.length, 1, "one commit per completed drag");
  assert.equal(mvA[0].i, 1);
  const scaleX = cb.width / 480;
  const scaleY = cb.height / 320;
  assert.equal(mvA[0].p.x_inches, Math.round(120 + 40 / scaleX), "drag dx maps through the rect view");
  assert.equal(mvA[0].p.z_inches, Math.round(80 + 22 / scaleY), "drag dz maps through the rect view");
  record("A: drag commit");

  // --- scenario B: keyboard nudges (1" arrows, 12" shift) ---
  const item1 = page.locator('[aria-label="Move Foundation 1"]');
  await item1.focus();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Shift+ArrowDown");
  await page.waitForTimeout(80);
  const mvB = await page.evaluate("window.__moves.slice(-2)");
  assert.deepEqual(mvB.map((m) => m.p), [{ x_inches: 11, z_inches: 10 }, { x_inches: 11, z_inches: 22 }]);
  record("B: keyboard nudges");

  // --- scenario C: sub-inch wiggle commits nothing ---
  await page.evaluate("window.__ctl('reset')");
  await page.waitForTimeout(60);
  const b1 = await itemBox("Move Foundation 1");
  await page.mouse.move(b1.x + 5, b1.y + 5);
  await page.mouse.down();
  await page.mouse.move(b1.x + 5.4, b1.y + 5.3, { steps: 2 });
  await page.mouse.up();
  await page.waitForTimeout(80);
  assert.equal((await page.evaluate("window.__moves")).length, 0, "wiggle < 1 inch commits nothing");
  record("C: wiggle null");

  // --- scenario D: second pointer cannot hijack an active gesture ---
  const cbD = await canvasBox();
  await page.mouse.move(b1.x + 5, b1.y + 5);
  await page.mouse.down();
  await page.evaluate(([x, y]) => {
    const el = document.elementFromPoint(x, y)?.closest("[role=button]") || document.body;
    el.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerId: 77, isPrimary: false, button: 0, clientX: x + 200, clientY: y + 200 }));
  }, [b1.x + 5, b1.y + 5]);
  await page.mouse.move(b1.x + 60, b1.y + 60, { steps: 3 });
  await page.mouse.up();
  await page.waitForTimeout(80);
  const mvD = await page.evaluate("window.__moves");
  assert.equal(mvD.length, 1, "primary gesture completes despite second-pointer down");
  record("D: second-pointer guard");

  // --- scenario E: reorder mid-gesture re-resolves by component id ---
  await page.evaluate("window.__ctl('reset')");
  await page.waitForTimeout(60);
  const b2 = await itemBox("Move Foundation 1");
  await page.mouse.move(b2.x + 5, b2.y + 5);
  await page.mouse.down();
  await page.mouse.move(b2.x + 40, b2.y + 40, { steps: 2 });
  await page.evaluate("window.__ctl('reorder')");
  await page.mouse.up();
  await page.waitForTimeout(80);
  const mvE = await page.evaluate("window.__moves");
  assert.equal(mvE.length, 1);
  assert.equal(mvE[0].i, 1, "component identity re-resolves after reorder");
  const itemsE = await page.evaluate("window.__items");
  assert.equal(itemsE[1].component_id, "i0", "patch landed on the dragged component");
  record("E: reorder identity");

  // --- scenario F: mutation mid-gesture cancels commit (fingerprint) ---
  await page.evaluate("window.__ctl('reset')");
  await page.waitForTimeout(60);
  const b3 = await itemBox("Move Foundation 1");
  await page.mouse.move(b3.x + 5, b3.y + 5);
  await page.mouse.down();
  await page.mouse.move(b3.x + 40, b3.y + 40, { steps: 2 });
  await page.evaluate("window.__ctl('mutate')");
  await page.mouse.up();
  await page.waitForTimeout(80);
  assert.equal((await page.evaluate("window.__moves")).length, 0, "fingerprint mismatch cancels");
  record("F: fingerprint cancel");

  // --- scenario G: invalid-position item is not draggable, note rendered ---
  await page.evaluate("window.__ctl('invalidpos')");
  await page.waitForTimeout(60);
  assert.equal(await page.locator("text=needs valid dimensions").count(), 1);
  const roleBtns = await page.locator("[role=button]").count();
  assert.equal(roleBtns, 1, "only the valid item is interactive");
  record("G: invalid item excluded");

  // --- scenario H: zoom + scroll still map through the element rect ---
  await page.evaluate("window.__ctl('reset')");
  await page.waitForTimeout(60);
  await page.locator('[aria-label="Zoom layout in"]').click(); // 1.25x
  await page.locator('[aria-label="Zoom layout in"]').click(); // 1.5x
  await waitPlaced("Move Foundation 2", 120, 80);
  const cbZ = await canvasBox();
  const b4 = await itemBox("Move Foundation 2");
  await page.mouse.move(b4.x + 4, b4.y + 4);
  await page.mouse.down();
  await page.mouse.move(b4.x + 30, b4.y + 30, { steps: 2 });
  await page.mouse.up();
  await page.waitForTimeout(80);
  const mvH = await page.evaluate("window.__moves.slice(-1)");
  const zx = cbZ.width / 480;
  const zy = cbZ.height / 320;
  assert.equal(mvH[0].p.x_inches, Math.round(120 + 26 / zx), "zoomed rect maps dx (no double-zoom)");
  assert.equal(mvH[0].p.z_inches, Math.round(80 + 26 / zy), "zoomed rect maps dz");
  record("H: zoomed mapping");

  // --- scenario I: pen pointer type drags like primary mouse (CDP real input) ---
  const cdp = await page.context().newCDPSession(page);
  const b5 = await itemBox("Move Foundation 2");
  const px = Math.round(b5.x + 4);
  const py = Math.round(b5.y + 4);
  await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x: px, y: py, button: "left", clickCount: 1, pointerType: "pen" });
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: px + 24, y: py + 12, button: "left", pointerType: "pen" });
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: px + 24, y: py + 12, button: "left", clickCount: 1, pointerType: "pen" });
  await page.waitForTimeout(100);
  const mvI = await page.evaluate("window.__moves.slice(-1)");
  assert.equal(mvI.length, 1, "pen gesture commits");
  record("I: pen input");

  // --- scenario J: read-only mode renders without handlers ---
  await page.evaluate("window.__ctl('readonly')");
  await page.waitForTimeout(60);
  assert.equal(await page.locator("[role=button]").count(), 0);
  assert.ok(await page.locator("text=read-only").count() >= 1 || (await page.locator("text=Foundation positions").count()) >= 1);
  await page.evaluate("window.__ctl('editable')");
  record("J: read-only");

  // --- scenario K: in-browser probe of the new modules on real data ---
  const probe = await page.evaluate(() => {
    const { transforms: T, input: I } = window.__scene;
    const items = window.__items;
    const v = T.planViewForViewport({ viewport: { width: 960, height: 640 } });
    const p = T.planToScreen(v, 24, 16);
    const back = T.screenToPlan(v, p.x, p.y);
    const hit = I.hitTestPlan({ items, poles: [{ component_id: "pp", x_inches: 60, z_inches: 55 }], walls: [] }, { x: 60, z: 55 });
    const drag = I.beginSceneDrag({ pointerId: 1, key: "component:i0", identityKind: "component", legacyIndex: 0, count: 2, corner: { x: items[0].x_inches, z: items[0].z_inches }, grabPoint: { x_inches: 15, z_inches: 15 }, fingerprint: "f" });
    const commit = I.commitSceneDrag(drag, { x_inches: 27, z_inches: 27 });
    return { rt: back, hit: hit && hit.kind, commit, deg: T.planRotationToWorldRadians(90) };
  });
  assert.ok(Math.abs(probe.rt.x_inches - 24) < 1e-7 && Math.abs(probe.rt.z_inches - 16) < 1e-7, "browser round-trip");
  assert.equal(probe.hit, "pole", "browser hit-test pole over item");
  assert.deepEqual(probe.commit, { x_inches: 22, z_inches: 22 }, "browser commit math");
  assert.ok(Math.abs(probe.deg - Math.PI / 2) < 1e-12);
  record("K: in-browser module probe");

  await page.screenshot({ path: `${OUT}/o039-browser-canvas.png`, fullPage: false });
} finally {
  await browser.close();
  server.close();
}

const report = { suite: "verify-o039-browser", scenarios: results.map((r) => r.name), status: "PASS", viewport: "1280x900", engine: "chromium (system chrome channel)" };
fs.writeFileSync(`${OUT}/o039-browser-verification.json`, JSON.stringify(report, null, 2));
console.log(`PASS ${report.suite}: ${results.length} scenarios`);
results.forEach((r) => console.log(" -", r.name));
process.exit(0);

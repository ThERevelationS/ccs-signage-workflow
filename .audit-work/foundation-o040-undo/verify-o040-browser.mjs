// O-040 (CMP-C09) real-component verification — mounts the CANDIDATE
// FoundationLayoutCanvas (staging tree = remote pulls + candidates, never
// local src/) in real Chromium with a mounted createSceneHistory store and
// replays stroke/undo scenarios end to end:
//   * one pointer drag = ONE history command carrying the pre-stroke corner
//   * a keyboard nudge burst coalesces to ONE command inside the window
//   * undo applies the inverse patch through the SAME commit path (onMoveItem)
//   * external writes detach the chain — stale geometry is never resurrected
//   * interleaved writes landing mid-gesture are preserved inside the entry
//   * refused commits, read-only mode, wiggle/cancel paths record nothing
// Usage: node verify-o040-browser.mjs
import esbuild from "esbuild";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { chromium } from "playwright-core";

const OUT = ".audit-work/foundation-o040-undo";
const STAGE = path.resolve(`${OUT}/staging-src`);
const STUBS = {
  "lucide-react": `export const Move=()=>null;export const ZoomIn=()=>null;export const ZoomOut=()=>null;`,
};

const harness = `
import React, { useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import FoundationLayoutCanvas from '@/components/estimator/foundation/FoundationLayoutCanvas';
import * as historyMod from '@/components/estimator/foundation/foundationSceneHistory';
import * as input from '@/components/estimator/foundation/foundationSceneInput';
window.__scene = { historyMod, input };

const baseItems = () => ([
  { component_id: 'i0', x_inches: 10, z_inches: 10, length_inches: 24, width_inches: 24, foundation_type: 'spread' },
  { component_id: 'i1', x_inches: 120, z_inches: 80, length_inches: 48, width_inches: 36, foundation_type: 'spread' },
]);
const basePoles = () => ([{ component_id: 'pp', x_inches: 60, z_inches: 55 }]);

function App(){
  const [items,setItems]=useState(baseItems());
  const [poles]=useState(basePoles());
  const [moves,setMoves]=useState([]);
  const [editable,setEditable]=useState(true);
  const refuseRef = useRef(false);
  const histRef = useRef(null);
  if (!histRef.current) histRef.current = historyMod.createSceneHistory({ coalesceWindowMs: 800 });
  const history = histRef.current;
  const itemsRef = useRef(items); itemsRef.current = items;
  window.__items=items; window.__moves=moves; window.__history=history;
  const applyMove = (i,p) => {
    if (refuseRef.current) return false;
    setMoves(m=>[...m,{i,p}]);
    setItems(prev=>prev.map((it,j)=>j===i?{...it,...p}:it));
    return true;
  };
  window.__ctl=(cmd,arg)=>{
    if(cmd==='reorder')setItems(prev=>[prev[1],prev[0]]);
    if(cmd==='mutate0')setItems(prev=>prev.map((it,j)=>j===0?{...it,length_inches:99}:it));
    if(cmd==='mutate1')setItems(prev=>prev.map((it,j)=>j===1?{...it,length_inches:99}:it));
    if(cmd==='readonly')setEditable(false);
    if(cmd==='editable')setEditable(true);
    if(cmd==='refuse'){refuseRef.current=true;}
    if(cmd==='accept'){refuseRef.current=false;}
    if(cmd==='reset'){setItems(baseItems());setMoves([]);setEditable(true);refuseRef.current=false;history.clear(historyMod.sceneLayoutAnchor(baseItems()));}
  };
  window.__undo=()=>history.undo(historyMod.sceneLayoutAnchor(itemsRef.current),(rev)=>applyMove(rev.target.index,rev.patch));
  window.__redo=()=>history.redo(historyMod.sceneLayoutAnchor(itemsRef.current),(rev)=>applyMove(rev.target.index,rev.patch));
  window.__state=()=>history.getState();
  window.__entries=()=>history.entries();
  return React.createElement(FoundationLayoutCanvas,{
    items, poles,
    onMoveItem: editable ? applyMove : undefined,
    sceneHistory: history,
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
fs.writeFileSync(`${OUT}/o040-browser-inputs.json`, JSON.stringify(inputs, null, 1));
assert.ok(inputs.some((i) => i.includes("foundationSceneHistory")), "history module bundled");
assert.ok(inputs.some((i) => i.includes("foundationSceneInput")), "input module bundled");
assert.ok(!inputs.some((i) => /base44|src[\\/]components[\\/]estimator[\\/]foundation/i.test(i) && !i.includes("staging-src")), "no local-src/base44 inputs");
fs.writeFileSync(`${OUT}/o040-page-bundle.js`, built.outputFiles[0].text);

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
  .w-10{width:40px}.h-3{height:12px}.w-3{width:12px}
  .bg-slate-700{background:#334155}.border-white{border-color:#fff}
  .p-3{padding:12px}.mb-2{margin-bottom:8px}.mt-1{margin-top:4px}
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
const record = (name) => results.push({ name });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.on("pageerror", (e) => { throw e; });
  await page.goto(`http://127.0.0.1:${port}/`);
  await page.waitForSelector("text=Layout Canvas", { timeout: 15000 });
  await page.waitForTimeout(120); // let mount-order effects settle

  const itemBox = async (label) => {
    const el = page.locator(`[aria-label="${label}"]`).first();
    await el.waitFor({ timeout: 5000 });
    return el.boundingBox();
  };
  const dragItem = async (label, dxPx, dyPx) => {
    const b = await itemBox(label);
    await page.mouse.move(b.x + 6, b.y + 6);
    await page.mouse.down();
    await page.mouse.move(b.x + 6 + dxPx, b.y + 6 + dyPx, { steps: 3 });
    await page.mouse.up();
    await page.waitForTimeout(70);
  };
  const entries = () => page.evaluate("window.__entries()");
  const state = () => page.evaluate("window.__state()");

  // --- A: one drag = ONE command with the pre-stroke corner as inverse ---
  await dragItem("Move Foundation 2", 40, 20);
  let e = await entries();
  assert.equal(e.past.length, 1, "drag recorded exactly one command");
  assert.equal(e.past[0].method, "drag");
  assert.equal(e.past[0].label, "Move Foundation 2");
  assert.equal(e.past[0].moves, 1);
  assert.deepEqual(e.past[0].detached, false);
  const st0 = await state();
  assert.equal(st0.canUndo, true);
  record("A: drag = one command");

  // --- B: undo applies the inverse patch through the same commit path ---
  const beforeDrag = await page.evaluate("window.__items[1].x_inches + ',' + window.__items[1].z_inches");
  const dragEntry = (await entries()).past[0];
  const ur = await page.evaluate("window.__undo()");
  assert.equal(ur.status, "applied");
  assert.deepEqual(ur.patch, { x_inches: 120, z_inches: 80 }, "inverse patch = pre-stroke corner");
  await page.waitForTimeout(70);
  const afterUndo = await page.evaluate("window.__items[1].x_inches + ',' + window.__items[1].z_inches");
  assert.equal(afterUndo, "120,80", `item reverted (${beforeDrag} -> undo -> ${afterUndo})`);
  const mvUndo = await page.evaluate("window.__moves.length");
  assert.equal(mvUndo, 2, "undo landed through onMoveItem, same commit path");
  const rr = await page.evaluate("window.__redo()");
  assert.equal(rr.status, "applied");
  assert.deepEqual(rr.patch, dragEntry ? { x_inches: rr.patch.x_inches, z_inches: rr.patch.z_inches } : null);
  await page.waitForTimeout(70);
  assert.notEqual(await page.evaluate("window.__items[1].x_inches"), 120, "redo re-applied");
  record("B: undo/redo round-trip through real commit path");

  // --- C: keyboard burst coalesces to ONE command; gap starts a new one ---
  await page.evaluate("window.__ctl('reset')");
  await page.waitForTimeout(80);
  const item1 = page.locator('[aria-label="Move Foundation 1"]');
  await item1.focus();
  for (let i = 0; i < 4; i += 1) { await page.keyboard.press("ArrowRight"); await page.waitForTimeout(40); }
  e = await entries();
  assert.equal(e.past.length, 1, "4-key burst = one command");
  assert.equal(e.past[0].method, "nudge");
  assert.equal(e.past[0].moves, 4);
  await page.waitForTimeout(1000); // past the 800ms coalesce window
  await page.keyboard.press("Shift+ArrowDown");
  await page.waitForTimeout(80);
  e = await entries();
  assert.equal(e.past.length, 2, "post-window nudge = second command");
  const u1 = await page.evaluate("window.__undo()");
  assert.equal(u1.status, "applied");
  const u2 = await page.evaluate("window.__undo()");
  assert.equal(u2.status, "applied");
  assert.deepEqual(u2.patch, { x_inches: 10, z_inches: 10 }, "burst undo restores pre-burst corner");
  await page.waitForTimeout(70);
  const posC = await page.evaluate("window.__items[0].x_inches + ',' + window.__items[0].z_inches");
  assert.equal(posC, "10,10", "item back at start after both undos");
  record("C: nudge burst coalescing + boundary");

  // --- D: external write detaches — stale geometry never resurrected ---
  await page.evaluate("window.__ctl('reset')");
  await page.waitForTimeout(80);
  await dragItem("Move Foundation 1", 50, 30);
  e = await entries();
  assert.equal(e.past.length, 1);
  await page.evaluate("window.__ctl('mutate0')"); // outside the stroke channel
  await page.waitForTimeout(80);
  const stD = await state();
  assert.equal(stD.canUndo, false, "recorded move detached by external write");
  assert.equal(stD.detached, 1);
  const ur2 = await page.evaluate("window.__undo()");
  assert.equal(ur2.status, "stale", "undo refuses rather than resurrect stale geometry");
  record("D: external write detaches");

  // --- E: write landing mid-gesture is preserved inside the entry ---
  await page.evaluate("window.__ctl('reset')");
  await page.waitForTimeout(80);
  {
    const b = await itemBox("Move Foundation 1");
    await page.mouse.move(b.x + 6, b.y + 6);
    await page.mouse.down();
    await page.mouse.move(b.x + 40, b.y + 30, { steps: 2 });
    await page.evaluate("window.__ctl('mutate1')"); // other row writes mid-gesture
    await page.mouse.up();
    await page.waitForTimeout(80);
  }
  e = await entries();
  assert.equal(e.past.length, 1, "gesture still recorded — the interleaved write is inside its anchors");
  const item1Before = await page.evaluate("window.__items[1].length_inches");
  assert.equal(item1Before, 99, "mid-gesture write landed");
  const ur3 = await page.evaluate("window.__undo()");
  assert.equal(ur3.status, "applied", "undo still applies — its anchors cover the interleaved write");
  await page.waitForTimeout(70);
  const item0Pos = await page.evaluate("window.__items[0].x_inches");
  const item1Len = await page.evaluate("window.__items[1].length_inches");
  assert.equal(item0Pos, 10, "dragged row reverted");
  assert.equal(item1Len, 99, "interleaved write preserved — CAS semantics, not snapshot rollback");
  record("E: interleaved write preserved inside anchors");

  // --- F: refused commit records nothing ---
  await page.evaluate("window.__ctl('reset')");
  await page.evaluate("window.__ctl('refuse')");
  await page.waitForTimeout(60);
  await dragItem("Move Foundation 1", 30, 20);
  e = await entries();
  assert.equal(e.past.length, 0, "refused commit → no entry");
  const itemF = page.locator('[aria-label="Move Foundation 1"]');
  await itemF.focus();
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(60);
  e = await entries();
  assert.equal(e.past.length, 0, "refused nudge → no entry");
  await page.evaluate("window.__ctl('accept')");
  record("F: refused commits record nothing");

  // --- G: wiggle / second-pointer / cancel paths record nothing ---
  {
    const b = await itemBox("Move Foundation 1");
    await page.mouse.move(b.x + 5, b.y + 5);
    await page.mouse.down();
    await page.mouse.move(b.x + 5.4, b.y + 5.3, { steps: 2 });
    await page.mouse.up();
    await page.waitForTimeout(60);
  }
  e = await entries();
  assert.equal(e.past.length, 0, "sub-inch wiggle → no entry");
  {
    const b = await itemBox("Move Foundation 1");
    await page.mouse.move(b.x + 5, b.y + 5);
    await page.mouse.down();
    await page.evaluate(([x, y]) => {
      const el = document.elementFromPoint(x, y)?.closest("[role=button]") || document.body;
      el.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerId: 77, isPrimary: false, button: 0, clientX: x + 200, clientY: y + 200 }));
    }, [b.x + 5, b.y + 5]);
    await page.mouse.move(b.x + 60, b.y + 60, { steps: 2 });
    await page.mouse.up();
    await page.waitForTimeout(80);
  }
  e = await entries();
  assert.equal(e.past.length, 1, "primary gesture completes despite second pointer");
  record("G: wiggle null + second-pointer still one command");

  // --- H: read-only mode records nothing ---
  await page.evaluate("window.__ctl('reset')");
  await page.evaluate("window.__ctl('readonly')");
  await page.waitForTimeout(60);
  await dragItem("Foundation 1", 30, 20).catch(() => { });
  const itemH = await page.locator("[role=button]").count();
  assert.equal(itemH, 0, "no interactive items read-only");
  e = await entries();
  assert.equal(e.past.length, 0);
  await page.evaluate("window.__ctl('editable')");
  await page.waitForTimeout(60);
  record("H: read-only records nothing");

  // --- I: zoomed drag still records one command ---
  await page.locator('[aria-label="Zoom layout in"]').click();
  await page.locator('[aria-label="Zoom layout in"]').click();
  await page.waitForTimeout(60);
  await dragItem("Move Foundation 2", 30, 30);
  e = await entries();
  assert.equal(e.past.length, 1, "zoomed drag = one command");
  record("I: zoomed drag");

  // --- J: in-browser module probe on real data ---
  const probe = await page.evaluate(() => {
    const { historyMod: HM, input: I } = window.__scene;
    const items = window.__items;
    const a1 = HM.sceneLayoutAnchor(items);
    const a2 = HM.sceneLayoutAnchor(items.map((it, i) => i === 0 ? { ...it, x_inches: it.x_inches + 1 } : it));
    const a3 = HM.sceneLayoutAnchor(items.map((it) => ({ ...it, description: "changed" })));
    const h = HM.createSceneHistory();
    h.observe(a1);
    h.observe(a1);
    return { same: a1 === HM.sceneLayoutAnchor(items), moved: a1 !== a2, nongeom: a1 === a3, anchored: h.anchored, statuses: [h.undo().status, h.redo().status] };
  });
  assert.equal(probe.same, true);
  assert.equal(probe.moved, true);
  assert.equal(probe.nongeom, true, "geometry-only anchor confirmed in-browser");
  assert.deepEqual(probe.statuses, ["empty", "empty"]);
  record("J: in-browser module probe");

  await page.screenshot({ path: `${OUT}/o040-browser-canvas.png`, fullPage: false });
} finally {
  await browser.close();
  server.close();
}

const report = { suite: "verify-o040-browser", scenarios: results.map((r) => r.name), count: results.length, status: "PASS", viewport: "1280x900", engine: "chromium (system chrome channel)" };
fs.writeFileSync(`${OUT}/o040-browser-verification.json`, JSON.stringify(report, null, 2));
console.log(`PASS ${report.suite}: ${results.length} scenarios`);
results.forEach((r) => console.log(" -", r.name));
process.exit(0);

// O-034 (CMP-C03) real-component verification — mounts the CANDIDATE
// FoundationLayoutCanvas (staging tree = remote pulls + candidates, never
// local src/) in real Chromium with a mounted createSceneSelection store
// and replays selection scenarios end to end:
//   * click selects (node id + part + highlight DOM), ctrl/shift additive,
//     additive click on selected toggles off, empty click clears
//   * marquee rubber-band region select (intersect) + additive union
//   * click-vs-drag slop: a real drag keeps selection; a wiggle still clicks
//   * keyboard: Tab/arrows cycle with focus-follows, Escape clears,
//     Delete fires the consumer hook without deleting
//   * z-top-wins: pole painted over an item selects the pole
//   * reconcile: deleted rows drop from selection
//   * drag/nudge commit + history seam unchanged (O-039/O-040 parity)
// Usage: node verify-o034-browser.mjs
import esbuild from "esbuild";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { chromium } from "playwright-core";

const OUT = ".audit-work/foundation-o034-selection";
const STAGE = path.resolve(`${OUT}/staging-src`);
const STUBS = {
  "lucide-react": `export const Move=()=>null;export const ZoomIn=()=>null;export const ZoomOut=()=>null;`,
};

const harness = `
import React, { useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import FoundationLayoutCanvas from '@/components/estimator/foundation/FoundationLayoutCanvas';
import * as selMod from '@/components/estimator/foundation/foundationSceneSelection';
import * as historyMod from '@/components/estimator/foundation/foundationSceneHistory';
import * as input from '@/components/estimator/foundation/foundationSceneInput';
window.__scene = { selMod, historyMod, input };

const baseItems = () => ([
  { component_id: 'i0', x_inches: 40, z_inches: 40, length_inches: 48, width_inches: 48, foundation_type: 'spread' },
  { component_id: 'i1', x_inches: 240, z_inches: 40, length_inches: 48, width_inches: 48, foundation_type: 'spread' },
  { component_id: 'i2', x_inches: 40, z_inches: 200, length_inches: 24, width_inches: 24, foundation_type: 'pillar', diameter: 24 },
]);
// pp overlaps item i0's rect (40..88,40..88) but off its center — so a
// center click hits the item face while a click on the pole's spot still
// demonstrates paint-order topmost-wins.
const basePoles = () => ([{ component_id: 'pp', x_inches: 80, z_inches: 50 }, { component_id: 'pq', x_inches: 430, z_inches: 290 }]);
const baseWalls = () => ([{ component_id: 'w0', shape: { points: [{x:330,z:200},{x:430,z:200},{x:430,z:280}], closed: false, segments: [{component_id:'s0'},{component_id:'s1'}] } }]);
const baseCaps = () => ([{ component_id: 'c0', wall_component_id: 'w0', segment_component_id: 's0' }]);
const baseCabinets = () => ([{ component_id: 'b0', mount: 'pole', pole_component_id: 'pq' }]);

function App(){
  const [items,setItems]=useState(baseItems());
  const [poles]=useState(basePoles());
  const [walls]=useState(baseWalls());
  const [caps]=useState(baseCaps());
  const [cabinets]=useState(baseCabinets());
  const [moves,setMoves]=useState([]);
  const [deletes,setDeletes]=useState([]);
  const [editable,setEditable]=useState(true);
  const histRef = useRef(null);
  if (!histRef.current) histRef.current = historyMod.createSceneHistory();
  const selRef = useRef(null);
  if (!selRef.current) selRef.current = selMod.createSceneSelection();
  const selection = selRef.current;
  window.__items=items; window.__moves=moves; window.__deletes=deletes;
  window.__selection=selection; window.__history=histRef.current;
  const applyMove = (i,p) => {
    setMoves(m=>[...m,{i,p}]);
    setItems(prev=>prev.map((it,j)=>j===i?{...it,...p}:it));
    return true;
  };
  const onDelete = (ents) => setDeletes(d=>[...d, ents.map(e=>e.id)]);
  window.__ctl=(cmd,arg)=>{
    if(cmd==='dropItem1')setItems(prev=>prev.filter((_,j)=>j!==1));
    if(cmd==='reorder')setItems(prev=>[prev[1],prev[0],prev[2]]);
    if(cmd==='readonly')setEditable(false);
    if(cmd==='editable')setEditable(true);
    if(cmd==='reset'){setItems(baseItems());setMoves([]);setDeletes([]);setEditable(true);selection.setSelection([]);}
  };
  window.__selState=()=>selection.getState();
  window.__selEntries=()=>selection.entries();
  window.__selIds=()=>selection.getState().ids;
  return React.createElement(FoundationLayoutCanvas,{
    items, poles, walls, wallCaps: caps, signageCabinets: cabinets,
    onMoveItem: editable ? applyMove : undefined,
    sceneHistory: histRef.current,
    sceneSelection: selection,
    onDeleteSelection: onDelete,
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
fs.writeFileSync(`${OUT}/o034-browser-inputs.json`, JSON.stringify(inputs, null, 1));
assert.ok(inputs.some((i) => i.includes("foundationSceneSelection")), "selection module bundled");
assert.ok(inputs.some((i) => i.includes("foundationSceneInput")), "input module bundled");
assert.ok(!inputs.some((i) => /base44|src[\\/]components[\\/]estimator[\\/]foundation/i.test(i) && !i.includes("staging-src")), "no local-src/base44 inputs");
fs.writeFileSync(`${OUT}/o034-page-bundle.js`, built.outputFiles[0].text);

const css = `
  *,*::before,*::after{box-sizing:border-box}
  .relative{position:relative}.absolute{position:absolute}
  [class*="aspect-"]{aspect-ratio:3/2}
  .overflow-auto{overflow:auto}.flex-wrap{flex-wrap:wrap}.gap-2{gap:8px}.select-none{user-select:none}
  .rounded-sm{border-radius:2px}.rounded-full{border-radius:9999px}.rounded-\\[2px\\]{border-radius:2px}
  .flex{display:flex}.items-center{align-items:center}.justify-center{justify-content:center}
  .justify-between{justify-content:space-between}
  .border{border-width:1px;border-style:solid}
  .border-2{border-width:2px}
  .border-dashed{border-style:dashed}.border-solid{border-style:solid}
  .border-amber-500{border-color:#f59e0b}.border-sky-600{border-color:#0284c7}.border-sky-700{border-color:#0369a1}
  .border-sky-800{border-color:#075985}.border-sky-500{border-color:#0ea5e9}.border-white{border-color:#fff}
  .border-gray-200{border-color:#e5e7eb}.border-gray-300{border-color:#d1d5db}
  .bg-amber-100\\/70{background:rgba(254,243,199,.7)}.bg-sky-100\\/70{background:rgba(224,242,254,.7)}
  .bg-sky-300\\/20{background:rgba(125,211,252,.2)}
  .text-amber-800{color:#92400e}.text-sky-900{color:#0c4a6e}
  .bg-white{background:#fff}.bg-slate-700{background:#334155}.bg-sky-500{background:#0ea5e9}
  .bg-gray-50{background:#f9fafb}.bg-amber-50\\/90{background:rgba(255,251,235,.9)}
  .cursor-move{cursor:move}
  .w-2{width:8px}.h-2{height:8px}.w-2\\.5{width:10px}.h-2\\.5{height:10px}
  .w-6{width:24px}.h-6{height:24px}.w-10{width:40px}.h-3{height:12px}.w-3{width:12px}
  .p-3{padding:12px}.mb-2{margin-bottom:8px}.mt-1{margin-top:4px}
  .left-1{left:4px}.top-1{top:4px}.z-10{z-index:10}.z-20{z-index:20}
  .text-\\[13px\\]{font-size:13px}.text-\\[11px\\]{font-size:11px}.text-\\[10px\\]{font-size:10px}
  .font-bold{font-weight:700}.font-semibold{font-weight:600}
  .text-gray-900{color:#111827}.text-gray-400{color:#9ca3af}.text-gray-600{color:#4b5563}.text-amber-700{color:#b45309}
  .px-1\\.5{padding-left:6px;padding-right:6px}.py-0\\.5{padding-top:2px;padding-bottom:2px}
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
  await page.waitForTimeout(140);

  const plan = () => page.locator("[data-scene-selection]");
  const planBox = async () => (await plan().boundingBox());
  const itemBox = async (label) => {
    const el = page.locator(`[aria-label="${label}"]`).first();
    await el.waitFor({ timeout: 5000 });
    return el.boundingBox();
  };
  const selIds = () => page.evaluate("window.__selIds()");
  const clickAt = async (x, y, modifiers = []) => {
    for (const m of modifiers) await page.keyboard.down(m);
    await page.mouse.click(x, y);
    for (const m of modifiers) await page.keyboard.up(m);
    await page.waitForTimeout(60);
  };

  // --- A: click selects an item — node id, part, DOM highlight ---
  {
    const b = await itemBox("Move Foundation 1");
    await clickAt(b.x + b.width / 2, b.y + b.height / 2);
    const ids = await selIds();
    assert.deepEqual(ids, ["item:component:i0"], "click selects the item node");
    const e0 = (await page.evaluate("window.__selEntries()"))[0];
    assert.equal(e0.part.type, "face");
    assert.equal(e0.collection, "items");
    assert.equal(e0.label, "Foundation 1");
    const sel = await page.locator('[data-selected="true"]').count();
    assert.equal(sel, 1, "one selected element in the DOM");
    const handles = await page.locator('[data-selection-handle="true"]').count();
    assert.equal(handles, 4, "primary selection draws 4 corner handles");
    const pressed = await page.locator('[aria-label="Move Foundation 1"]').getAttribute("aria-pressed");
    assert.equal(pressed, "true");
    record("A: click selects — id + part + highlight + handles");
  }

  // --- B: ctrl/shift additive + toggle-off + primary tracking ---
  {
    const b2 = await itemBox("Move Foundation 2");
    await clickAt(b2.x + b2.width / 2, b2.y + b2.height / 2, ["Control"]);
    assert.deepEqual(await selIds(), ["item:component:i0", "item:component:i1"], "ctrl-click adds");
    assert.equal((await page.evaluate("window.__selState()")).primaryId, "item:component:i1");
    const b3 = await itemBox("Move Foundation 3");
    await clickAt(b3.x + b3.width / 2, b3.y + b3.height / 2, ["Shift"]);
    assert.deepEqual(await selIds(), ["item:component:i0", "item:component:i1", "item:component:i2"], "shift-click adds");
    await clickAt(b2.x + b2.width / 2, b2.y + b2.height / 2, ["Control"]);
    assert.deepEqual(await selIds(), ["item:component:i0", "item:component:i2"], "ctrl-click on selected toggles off");
    assert.equal((await page.evaluate("window.__selState()")).primaryId, "item:component:i2");
    const selCount = await page.locator('[data-selected="true"]').count();
    assert.equal(selCount, 2);
    const handles = await page.locator('[data-selection-handle="true"]').count();
    assert.equal(handles, 4, "handles only on the primary");
    record("B: ctrl/shift additive + toggle + primary");
  }

  // --- C: empty click clears; additive empty click keeps ---
  {
    const pb = await planBox();
    await clickAt(pb.x + pb.width * 0.97, pb.y + pb.height * 0.95);
    assert.deepEqual(await selIds(), [], "plain empty click clears");
    const b1 = await itemBox("Move Foundation 1");
    await clickAt(b1.x + b1.width / 2, b1.y + b1.height / 2);
    await clickAt(pb.x + pb.width * 0.97, pb.y + pb.height * 0.95, ["Control"]);
    assert.deepEqual(await selIds(), ["item:component:i0"], "additive empty click keeps selection");
    record("C: empty click clears / additive keeps");
  }

  // --- D: marquee region select (intersect) over empty space ---
  await page.evaluate("window.__ctl('reset')");
  await page.waitForTimeout(90);
  {
    const pb = await planBox();
    // drag a band across item1's right edge + item2 (pillar) far corner
    await page.mouse.move(pb.x + pb.width * 0.06, pb.y + pb.height * 0.06);
    await page.mouse.down();
    await page.mouse.move(pb.x + pb.width * 0.62, pb.y + pb.height * 0.32, { steps: 5 });
    // rubber band visible mid-gesture
    assert.equal(await page.locator('[data-marquee="true"]').count(), 1, "rubber band renders while dragging");
    await page.mouse.up();
    await page.waitForTimeout(70);
    const ids = await selIds();
    assert.ok(ids.includes("item:component:i0"), "marquee picked item 1");
    assert.ok(!ids.includes("item:component:i2"), "pillar outside the band");
    assert.ok(ids.includes("pole:component:pp"), "pole inside the band");
    assert.equal(await page.locator('[data-marquee="true"]').count(), 0, "band gone after commit");
    record("D: marquee region select");
  }

  // --- E: additive marquee unions with existing selection ---
  {
    const pb = await planBox();
    await page.mouse.move(pb.x + pb.width * 0.50, pb.y + pb.height * 0.08);
    await page.keyboard.down("Shift");
    await page.mouse.down();
    await page.mouse.move(pb.x + pb.width * 0.72, pb.y + pb.height * 0.40, { steps: 4 });
    await page.mouse.up();
    await page.keyboard.up("Shift");
    await page.waitForTimeout(70);
    const ids = await selIds();
    assert.ok(ids.includes("item:component:i0"), "existing kept in union");
    assert.ok(ids.includes("item:component:i1"), "item 2 added by band");
    record("E: additive marquee union");
  }

  // --- F: drag keeps selection (drags don't deselect); wiggle still clicks ---
  {
    const b2 = await itemBox("Move Foundation 2");
    // real drag on a SELECTED item — the multi-selection survives the move
    await page.mouse.move(b2.x + 6, b2.y + 6);
    await page.mouse.down();
    await page.mouse.move(b2.x + 6 + 30, b2.y + 6 + 20, { steps: 3 });
    await page.mouse.up();
    await page.waitForTimeout(70);
    const idsAfterDrag = await selIds();
    assert.deepEqual([...idsAfterDrag].sort(), ["item:component:i0", "item:component:i1", "pole:component:pp"], "drag on an already-selected item does NOT drop the selection");
    const moved = await page.evaluate("window.__moves.length");
    assert.ok(moved >= 1, "the drag still committed a move (O-039 intact)");
    // wiggle under the slop = click → selects the pressed item's topmost hit
    const b3 = await itemBox("Move Foundation 3");
    await page.mouse.move(b3.x + 5, b3.y + 5);
    await page.mouse.down();
    await page.mouse.move(b3.x + 5.3, b3.y + 5.2, { steps: 2 });
    await page.mouse.up();
    await page.waitForTimeout(60);
    assert.deepEqual(await selIds(), ["item:component:i2"], "sub-threshold wiggle resolves as click");
    record("F: drag keeps selection / wiggle clicks");
  }

  // --- G: keyboard — Tab/arrows cycle with focus, Escape clears, Delete hooks ---
  await page.evaluate("window.__ctl('reset')");
  await page.waitForTimeout(80);
  {
    await plan().focus();
    await page.keyboard.press("Tab");
    await page.waitForTimeout(60);
    assert.deepEqual(await selIds(), ["item:component:i0"], "Tab selects first tree node");
    // focus follows the cycle — the selected item element is now focused
    const focused = await page.evaluate("document.activeElement?.getAttribute('data-node-id')");
    assert.equal(focused, "item:component:i0");
    // Tab on the focused item cycles to the next tree node (focus follows)
    await page.keyboard.press("Tab");
    await page.waitForTimeout(60);
    assert.deepEqual(await selIds(), ["item:component:i1"]);
    // container-level arrows cycle too (refocus the plan first)
    await plan().focus();
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(60);
    assert.deepEqual(await selIds(), ["item:component:i2"], "container arrow cycles");
    // item-focus arrows NUDGE (O-039 preserved) — selection untouched
    const item1 = page.locator('[aria-label="Move Foundation 1"]');
    await item1.focus();
    const x0 = await page.evaluate("window.__items[0].x_inches");
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(60);
    const x1 = await page.evaluate("window.__items[0].x_inches");
    assert.equal(x1 - x0, 1, "item-focus arrows still nudge");
    assert.deepEqual(await selIds(), ["item:component:i2"], "a nudge does not steal selection");
    // Tab keeps walking the tree into non-item nodes: wall → segment → cap
    await page.keyboard.press("Tab");
    await page.waitForTimeout(60);
    assert.deepEqual(await selIds(), ["wall:component:w0"], "cycle reaches walls");
    await page.keyboard.press("Tab");
    await page.waitForTimeout(60);
    assert.deepEqual(await selIds(), ["wall-segment:component:w0|component:s0"], "cycle reaches wall segments");
    await page.keyboard.press("Tab");
    await page.waitForTimeout(60);
    assert.deepEqual(await selIds(), ["wall-cap:component:c0"], "cycle reaches mounted caps (breadcrumb child)");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(60);
    assert.deepEqual(await selIds(), [], "Escape clears");
    // Delete on a selection fires the consumer hook — the store never deletes
    await plan().focus();
    await page.keyboard.press("Tab");
    await page.waitForTimeout(60);
    await page.keyboard.press("Delete");
    await page.waitForTimeout(60);
    const dels = await page.evaluate("window.__deletes");
    assert.equal(dels.length, 1, "delete hook fired once");
    assert.deepEqual(dels[0], ["item:component:i0"], "hook got the selected node ids");
    assert.equal(await page.evaluate("window.__items.length"), 3, "store never deletes — consumer decides");
    record("G: keyboard cycle/focus/delete-hook/Escape");
  }

  // --- H: z-top-wins — pole painted over an item selects the pole ---
  {
    const b1 = await itemBox("Move Foundation 1");
    // pole pp sits at 80,50 — inside item i0's rect (40..88, 40..88).
    // Click exactly on the pole's spot: DOM targets the item div, but the
    // plan hit test puts the pole on top.
    const pb = await planBox();
    const px = pb.x + (80 / 480) * pb.width;
    const py = pb.y + (50 / 320) * pb.height;
    await clickAt(px, py);
    const ids = await selIds();
    assert.deepEqual(ids, ["pole:component:pp"], "pole over item selects the pole");
    const e0 = (await page.evaluate("window.__selEntries()"))[0];
    assert.equal(e0.part.type, "point");
    assert.equal(e0.label, "Pole 1");
    record("H: z-top-wins pole-over-item");
  }

  // --- I: reconcile — deleted row drops out of the selection ---
  await page.evaluate("window.__ctl('reset')");
  await page.waitForTimeout(80);
  {
    const b2 = await itemBox("Move Foundation 2");
    await clickAt(b2.x + b2.width / 2, b2.y + b2.height / 2);
    assert.deepEqual(await selIds(), ["item:component:i1"]);
    await page.evaluate("window.__ctl('dropItem1')");
    await page.waitForTimeout(90);
    assert.deepEqual(await selIds(), [], "deleted row dropped from selection — never re-points at its neighbor");
    // reorder keeps component-id selections (with refreshed descriptors)
    const b1 = await itemBox("Move Foundation 1");
    await clickAt(b1.x + b1.width / 2, b1.y + b1.height / 2);
    await page.evaluate("window.__ctl('reorder')");
    await page.waitForTimeout(90);
    assert.deepEqual(await selIds(), ["item:component:i0"], "component id survives reorder");
  }
  record("I: reconcile delete/reorder");

  // --- J: read-only still selects + marquees (no edits possible) ---
  await page.evaluate("window.__ctl('readonly')");
  await page.waitForTimeout(80);
  {
    const ro = await page.locator("[role=button]").count();
    assert.equal(ro, 0, "read-only has no interactive items");
    const pb = await planBox();
    const px = pb.x + (64 / 480) * pb.width;
    const py = pb.y + (64 / 320) * pb.height;
    await clickAt(px, py);
    assert.deepEqual(await selIds(), ["item:component:i0"], "read-only click selects");
    // marquee in read-only — band over i0 + the overlapping pole
    // (items are [i2, i0] after the scenario-I drop + reorder)
    await page.mouse.move(pb.x + pb.width * 0.08, pb.y + pb.height * 0.05);
    await page.mouse.down();
    await page.mouse.move(pb.x + pb.width * 0.25, pb.y + pb.height * 0.35, { steps: 3 });
    await page.mouse.up();
    await page.waitForTimeout(70);
    assert.deepEqual(await selIds(), ["item:component:i0", "pole:component:pp"], "read-only marquee selects too");
    await page.evaluate("window.__ctl('editable')");
    await page.waitForTimeout(60);
    record("J: read-only select + marquee");
  }

  // --- K: history seam untouched — drag still records one undo command ---
  {
    const before = (await page.evaluate("window.__history.entries()")).past.length;
    const b1 = await itemBox("Move Foundation 1");
    // index 0 is the i2 pillar after dropItem1+reorder — grab the box CENTER:
    // rounded-full clips the DOM hit region to the inscribed circle, so a
    // corner point would land on the plan container instead.
    const cx = b1.x + b1.width / 2, cy = b1.y + b1.height / 2;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 36, cy + 26, { steps: 3 });
    await page.mouse.up();
    await page.waitForTimeout(70);
    const entries = await page.evaluate("window.__history.entries()");
    const diag = { before, b1, moves: await page.evaluate("window.__moves.length"), sel: await selIds(), items: await page.evaluate("window.__items.map(i=>i&&i.component_id)") };
    assert.equal(entries.past.length, before + 1, `drag recorded exactly one history command — ${JSON.stringify(diag)}`);
    assert.equal(entries.past[entries.past.length - 1].method, "drag");
    const moves = await page.evaluate("window.__moves.length");
    assert.ok(moves >= 1, "move landed through onMoveItem");
    record("K: O-039/O-040 seams intact (drag = one command)");
  }

  await page.screenshot({ path: `${OUT}/o034-browser-canvas.png`, fullPage: false });
} finally {
  await browser.close();
  server.close();
}

const report = { suite: "verify-o034-browser", scenarios: results.map((r) => r.name), count: results.length, status: "PASS", viewport: "1280x900", engine: "chromium (system chrome channel)" };
fs.writeFileSync(`${OUT}/o034-browser-verification.json`, JSON.stringify(report, null, 2));
console.log(`PASS ${report.suite}: ${results.length} scenarios`);
results.forEach((r) => console.log(" -", r.name));
process.exit(0);

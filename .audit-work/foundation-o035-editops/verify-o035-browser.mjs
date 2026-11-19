// O-035 (CMP-C04) real-component verification — mounts the CANDIDATE
// FoundationLayoutCanvas + foundationSceneEditOps (staging tree = remote
// pulls + candidates, never local src/) in real Chromium and replays the
// edit-operations surface end to end:
//   * selection chrome: primary outline handles (8 resize + rotate),
//     ops toolbar, typed bar, dimension chip
//   * handle resize / rotate-handle / keyboard rotate (burst = ONE command)
//   * object snap guides during drag + snapped commit; uniform grid snap
//   * typed coordinate/dimension entry (ft/in parse, invalid = no commit)
//   * multi-row ops (align / distribute / multi-drag) through the
//     onPatchScene channel — ONE 'scene-multi' history entry per op
//   * honesty guard: the legacy single-row undo apply REFUSES a multi
//     entry ('rejected'); the mounted multi-aware apply round-trips it
//   * delete / duplicate page hooks (canvas emits plans, never mutates)
//   * read-only gating: no edit chrome, selection still works
// Usage: node verify-o035-browser.mjs
import esbuild from "esbuild";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const STAGE = path.resolve(`${DIR}/staging-src`);
const STUBS = {
  "lucide-react": `export const Move=()=>null;export const ZoomIn=()=>null;export const ZoomOut=()=>null;`,
};

const harness = `
import React, { useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import FoundationLayoutCanvas from '@/components/estimator/foundation/FoundationLayoutCanvas';
import * as historyMod from '@/components/estimator/foundation/foundationSceneHistory';
import * as input from '@/components/estimator/foundation/foundationSceneInput';
import * as editops from '@/components/estimator/foundation/foundationSceneEditOps';
import * as selmod from '@/components/estimator/foundation/foundationSceneSelection';
window.__scene = { historyMod, input, editops, selmod };

const baseItems = () => ([
  { component_id: 'i0', x_inches: 10, z_inches: 10, length_inches: 24, width_inches: 24, foundation_type: 'spread' },
  { component_id: 'i1', x_inches: 60, z_inches: 10, length_inches: 24, width_inches: 24, foundation_type: 'spread' },
  { component_id: 'i2', x_inches: 200, z_inches: 80, length_inches: 48, width_inches: 36, foundation_type: 'spread' },
]);
const basePoles = () => ([{ component_id: 'pp', x_inches: 60, z_inches: 55 }]);

function App(){
  const [items,setItems]=useState(baseItems());
  const [poles,setPoles]=useState(basePoles());
  const [editable,setEditable]=useState(true);
  const [grid,setGrid]=useState(0);
  const [moves,setMoves]=useState([]);
  const [multiCalls,setMultiCalls]=useState([]);
  const [deletes,setDeletes]=useState([]);
  const [dups,setDups]=useState([]);
  const refuseRef = useRef(false);
  const histRef = useRef(null);
  const selRef = useRef(null);
  if (!histRef.current) histRef.current = historyMod.createSceneHistory({ coalesceWindowMs: 800 });
  if (!selRef.current) selRef.current = selmod.createSceneSelection();
  const history = histRef.current;
  const selection = selRef.current;
  const itemsRef = useRef(items); itemsRef.current = items;
  const polesRef = useRef(poles); polesRef.current = poles;
  window.__items=items; window.__poles=poles; window.__moves=moves;
  window.__multi=multiCalls; window.__deletes=deletes; window.__dups=dups;
  window.__history=history; window.__selection=selection;

  const applyMove = (i,p) => {
    if (refuseRef.current) return false;
    setMoves(m=>[...m,{i,p}]);
    setItems(prev=>prev.map((it,j)=>j===i?{...it,...p}:it));
    return true;
  };
  const applyScene = (patches) => {
    if (refuseRef.current) return false;
    setMultiCalls(m=>[...m,patches]);
    const applyRows = (rows) => rows.map((r,j)=>{
      let out = r;
      for (const p of patches) if (p.index===j && p.patch) out = {...out, ...p.patch};
      return out;
    });
    // collection-tagged rows — the candidate page channel routes each row
    setItems(prev=>prev.map((r,j)=>{
      let out=r;
      for (const p of patches) if (p.collection==='items' && p.index===j) out={...out,...p.patch};
      return out;
    }));
    setPoles(prev=>prev.map((r,j)=>{
      let out=r;
      for (const p of patches) if (p.collection==='poles' && p.index===j) out={...out,...p.patch};
      return out;
    }));
    return true;
  };
  const onDelete = (entries) => {
    setDeletes(d=>[...d, entries]);
    const itemIdx = entries.filter(e=>e.kind==='item' && Number.isInteger(e.index)).map(e=>e.index).sort((a,b)=>b-a);
    if (itemIdx.length) setItems(prev=>{const next=[...prev]; for (const i of itemIdx) next.splice(i,1); return next;});
    const poleIdx = entries.filter(e=>e.kind==='pole' && Number.isInteger(e.index)).map(e=>e.index).sort((a,b)=>b-a);
    if (poleIdx.length) setPoles(prev=>{const next=[...prev]; for (const i of poleIdx) next.splice(i,1); return next;});
  };
  const onDuplicate = (plan) => {
    setDups(d=>[...d, plan]);
    // The canvas emits a plan; the page clones (foundationDuplicateMirror
    // owns id minting — the harness clones verbatim for the probe).
    const clones = plan.sources.filter(s=>s.collection==='items').map((s,k)=>({
      ...itemsRef.current[s.index],
      component_id: (itemsRef.current[s.index].component_id||'row') + '_c' + k,
      x_inches: (itemsRef.current[s.index].x_inches||0) + plan.offset_inches.x,
      z_inches: (itemsRef.current[s.index].z_inches||0) + plan.offset_inches.z,
    }));
    if (clones.length) setItems(prev=>[...prev,...clones]);
  };
  const fullAnchor = () => historyMod.sceneLayoutAnchor({ items: itemsRef.current, poles: polesRef.current, walls: [] });
  // The documented mount: the page's undo apply understands BOTH payload
  // shapes — single-row {target.index, patch} and scene-multi {patch.multi}.
  const applyRev = (rev) => {
    const p = rev.patch;
    if (p && Array.isArray(p.multi)) {
      for (const m of p.multi) {
        if (m.collection==='items') setItems(prev=>prev.map((it,j)=>j===m.index?{...it,...m.fields}:it));
        else if (m.collection==='poles') setPoles(prev=>prev.map((it,j)=>j===m.index?{...it,...m.fields}:it));
      }
      return true;
    }
    return applyMove(rev.target.index, p);
  };
  window.__undo=()=>history.undo(fullAnchor(), applyRev);
  window.__redo=()=>history.redo(fullAnchor(), applyRev);
  // The CURRENT page apply — single-row only. Multi entries carry
  // target:null so this refuses honestly ('rejected'), never a fake apply.
  window.__legacyUndo=()=>history.undo(fullAnchor(), (rev)=>applyMove(rev.target.index, rev.patch));
  window.__state=()=>history.getState();
  window.__entries=()=>history.entries();
  window.__sel=()=>selection.getState();
  window.__ctl=(cmd,arg)=>{
    if(cmd==='readonly')setEditable(false);
    if(cmd==='editable')setEditable(true);
    if(cmd==='grid')setGrid(arg||0);
    if(cmd==='refuse'){refuseRef.current=true;}
    if(cmd==='accept'){refuseRef.current=false;}
    if(cmd==='reset'){setItems(baseItems());setPoles(basePoles());setMoves([]);setMultiCalls([]);setDeletes([]);setDups([]);setEditable(true);setGrid(0);refuseRef.current=false;history.clear(historyMod.sceneLayoutAnchor({items:baseItems(),poles:basePoles(),walls:[]}));}
  };
  return React.createElement(FoundationLayoutCanvas,{
    items, poles,
    onMoveItem: editable ? applyMove : undefined,
    onPatchScene: editable ? applyScene : undefined,
    onDeleteSelection: editable ? onDelete : undefined,
    onDuplicateSelection: editable ? onDuplicate : undefined,
    sceneHistory: history,
    sceneSelection: selection,
    gridSnapInches: grid,
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
fs.writeFileSync(`${DIR}/o035-browser-inputs.json`, JSON.stringify(inputs, null, 1));
assert.ok(inputs.some((i) => i.includes("foundationSceneEditOps")), "edit-ops module bundled");
assert.ok(inputs.some((i) => i.includes("foundationSceneHistory")), "history module bundled");
assert.ok(inputs.some((i) => i.includes("foundationSceneInput")), "input module bundled");
assert.ok(!inputs.some((i) => /src[\\/]components[\\/]estimator[\\/]foundation/i.test(i) && !i.includes("staging-src")), "no local-src inputs");
fs.writeFileSync(`${DIR}/o035-page-bundle.js`, built.outputFiles[0].text);

const css = `
  *,*::before,*::after{box-sizing:border-box}
  .relative{position:relative}.absolute{position:absolute}
  [class*="aspect-"]{aspect-ratio:3/2}
  .overflow-auto{overflow:auto}.flex-wrap{flex-wrap:wrap}.gap-2{gap:8px}.gap-1{gap:4px}.select-none{user-select:none}
  .rounded-sm{border-radius:2px}.rounded-full{border-radius:9999px}
  .flex{display:flex}.flex-col{flex-direction:column}.items-center{align-items:center}.justify-center{justify-content:center}
  .justify-between{justify-content:space-between}.border{border-width:1px}
  .border-2{border-width:2px;border-style:dashed;border-color:#d97706}
  .border-solid{border-style:solid}.border-sky-600{border-color:#0284c7}.border-sky-700{border-color:#0369a1}.border-sky-800{border-color:#075985}
  .border-gray-200{border-color:#e5e7eb}.border-gray-300{border-color:#d1d5db}.border-red-300{border-color:#fca5a5}
  .bg-sky-100\\/70{background:rgba(224,242,254,.7)}.bg-amber-100\\/70{background:rgba(254,243,199,.7)}
  .bg-sky-500{background:#0ea5e9}.bg-sky-300\\/20{background:rgba(125,211,252,.2)}
  .bg-white{background:#fff}.bg-gray-50{background:#f9fafb}.bg-slate-700{background:#334155}.bg-amber-50\\/90{background:rgba(255,251,235,.9)}
  .border-white{border-color:#fff}.border-l{border-left-width:1px}.border-t{border-top-width:1px}.border-sky-500\\/70{border-color:rgba(14,165,233,.7)}
  .cursor-move{cursor:move}
  .w-2{width:8px}.h-2{height:8px}.w-2\\.5{width:10px}.h-2\\.5{height:10px}.w-6{width:24px}.h-6{height:24px}
  .w-10{width:40px}.w-14{width:56px}.h-3{height:12px}.w-3{width:12px}
  .p-3{padding:12px}.px-1{padding-left:4px;padding-right:4px}.px-1\\.5{padding-left:6px;padding-right:6px}.py-0\\.5{padding-top:2px;padding-bottom:2px}
  .mb-2{margin-bottom:8px}.mt-1{margin-top:4px}.mt-2{margin-top:8px}.mr-1{margin-right:4px}
  .left-1{left:4px}.top-1{top:4px}.z-10{z-index:10}.z-20{z-index:20}
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
  await page.waitForTimeout(120);

  const itemBox = async (label) => {
    const el = page.locator(`[aria-label="${label}"]`).first();
    await el.waitFor({ timeout: 5000 });
    return el.boundingBox();
  };
  // Press at the box CENTER — a selected item shows 8 resize handles at its
  // edges/corners, and an edge-offset press would start a resize, not a move.
  const clickItem = async (label, { ctrl = false } = {}) => {
    const b = await itemBox(label);
    if (ctrl) await page.keyboard.down("Control");
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.down();
    await page.mouse.up();
    if (ctrl) await page.keyboard.up("Control");
    await page.waitForTimeout(70);
  };
  const dragItem = async (label, dxPx, dyPx, { hold = false } = {}) => {
    const b = await itemBox(label);
    const cx = b.x + b.width / 2, cy = b.y + b.height / 2;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + dxPx, cy + dyPx, { steps: 3 });
    if (hold) await page.waitForTimeout(60);
    await page.mouse.up();
    await page.waitForTimeout(80);
  };
  const entries = () => page.evaluate("window.__entries()");
  const state = () => page.evaluate("window.__state()");

  // --- A: click selects → primary chrome (8 resize + rotate + toolbar + typed + dims)
  await clickItem("Move Foundation 1");
  assert.equal(await page.locator("[data-resize-handle]").count(), 8, "8 resize handles on primary");
  assert.equal(await page.locator("[data-rotate-handle]").count(), 1, "rotate handle on primary");
  assert.equal(await page.locator("[data-editops-toolbar]").count(), 1, "ops toolbar visible");
  assert.equal(await page.locator("[data-typed-bar]").count(), 1, "typed bar visible for single item");
  assert.equal(await page.locator("[data-dim-chip]").count(), 1, "dimension chip on selection");
  const dimText = await page.locator("[data-dim-chip]").first().innerText();
  assert.ok(/24|2'/.test(dimText), `dim chip shows size (${dimText})`);
  assert.equal(await page.locator('[data-typed-field="x"]').count(), 1, "typed x field present");
  assert.equal(await page.locator('[data-typed-field="length"]').count(), 1, "typed length field present");
  assert.equal(await page.locator('[data-typed-field="rotation"]').count(), 1, "typed rotation field present");
  record("A: selection chrome — handles, toolbar, typed bar, dims");

  // --- B: 'e' handle resize → one command, whole-inch patch, undo round-trips
  {
    const h = await page.locator('[data-resize-handle="e"]').boundingBox();
    await page.mouse.move(h.x + 4, h.y + 4);
    await page.mouse.down();
    await page.mouse.move(h.x + 4 + 40, h.y + 4, { steps: 3 }); // ~+15in
    await page.mouse.up();
    await page.waitForTimeout(90);
  }
  const lenAfter = await page.evaluate("window.__items[0].length_inches");
  assert.ok(Number.isInteger(lenAfter) && lenAfter > 24, `resize landed whole-inch (${lenAfter})`);
  let e = await entries();
  assert.equal(e.past.length, 1, "resize = one history command");
  assert.equal(e.past[0].method, "handle");
  assert.equal(e.past[0].label, "Resize Foundation 1");
  const ur = await page.evaluate("window.__undo()");
  assert.equal(ur.status, "applied");
  await page.waitForTimeout(70);
  assert.equal(await page.evaluate("window.__items[0].length_inches"), 24, "undo restored length");
  const rr = await page.evaluate("window.__redo()");
  assert.equal(rr.status, "applied");
  await page.waitForTimeout(70);
  assert.equal(await page.evaluate("window.__items[0].length_inches"), lenAfter, "redo re-applied");
  await page.evaluate("window.__undo()"); await page.waitForTimeout(60);
  record("B: handle resize = one command + undo/redo");

  // --- C: rotate handle drag → ~90° snap, one command
  await page.evaluate("window.__ctl('reset')"); await page.waitForTimeout(90);
  await clickItem("Move Foundation 1");
  {
    const h = await page.locator("[data-rotate-handle]").boundingBox();
    await page.mouse.move(h.x + 5, h.y + 5);
    await page.mouse.down();
    // drag to the right of the item's center → ~+90° clockwise
    await page.mouse.move(h.x + 45, h.y + 23, { steps: 4 });
    await page.mouse.up();
    await page.waitForTimeout(90);
  }
  const rot = await page.evaluate("window.__items[0].rotation_degrees");
  assert.ok(typeof rot === "number" && rot % 15 === 0 && rot !== 0, `rotate landed a 15° step (${rot})`);
  e = await entries();
  assert.equal(e.past.length, 1, "rotate = one history command");
  assert.equal(e.past[0].method, "handle");
  const ur2 = await page.evaluate("window.__undo()");
  assert.equal(ur2.status, "applied");
  await page.waitForTimeout(60);
  assert.equal(await page.evaluate("window.__items[0].rotation_degrees") ?? 0, 0, "undo restored rotation");
  record("C: rotate handle = snapped 15° step + undo");

  // --- D: ']' key burst coalesces into ONE rotate command
  await page.evaluate("window.__ctl('reset')"); await page.waitForTimeout(80);
  await clickItem("Move Foundation 1");
  {
    const item1 = page.locator('[aria-label="Move Foundation 1"]');
    await item1.focus();
    for (let i = 0; i < 3; i += 1) { await page.keyboard.press("]"); await page.waitForTimeout(40); }
    await page.waitForTimeout(80);
  }
  assert.equal(await page.evaluate("window.__items[0].rotation_degrees"), 45, "3 × ] = +45°");
  e = await entries();
  assert.equal(e.past.length, 1, "rotate-key burst coalesced to one command");
  assert.equal(e.past[0].method, "key");
  record("D: keyboard rotate burst = one command");

  // --- E: object snap during drag — guides show + commit lands snapped
  await page.evaluate("window.__ctl('reset')"); await page.waitForTimeout(80);
  {
    // i0 at x=10 (24 wide → right edge 34); i1 left edge at 60.
    // Drag ~24in right: raw right edge ~58 → snaps +2 → x=36.
    const b = await itemBox("Move Foundation 1");
    const cx = b.x + b.width / 2, cy = b.y + b.height / 2;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 62, cy, { steps: 4 });
    await page.waitForTimeout(60);
    const gx = await page.locator('[data-snap-guide="x"]').count();
    assert.ok(gx >= 1, "snap guide visible during drag");
    await page.mouse.up();
    await page.waitForTimeout(80);
  }
  const snapPos = await page.evaluate("window.__items[0].x_inches + ',' + window.__items[0].z_inches");
  assert.equal(snapPos, "36,10", `edge snapped onto the neighbor at 60 (${snapPos})`);
  e = await entries();
  assert.equal(e.past.length, 1, "snapped drag = one command");
  record("E: object snap guides + snapped commit");

  // --- F: typed fields — inches, ft entry, invalid stays uncommitted
  await page.evaluate("window.__ctl('reset')"); await page.waitForTimeout(80);
  await clickItem("Move Foundation 1");
  {
    const xField = page.locator('[data-typed-field="x"]');
    await xField.fill("120");
    await xField.press("Enter");
    await page.waitForTimeout(80);
  }
  assert.equal(await page.evaluate("window.__items[0].x_inches"), 120, "typed x committed");
  e = await entries();
  assert.equal(e.past.length, 1, "typed = one command");
  assert.equal(e.past[0].method, "typed");
  {
    const lField = page.locator('[data-typed-field="length"]');
    await lField.fill("6'");
    await lField.press("Enter");
    await page.waitForTimeout(80);
  }
  assert.equal(await page.evaluate("window.__items[0].length_inches"), 72, "ft entry parsed to inches");
  {
    const zField = page.locator('[data-typed-field="z"]');
    await zField.fill("abc");
    await zField.press("Enter");
    await page.waitForTimeout(70);
  }
  assert.equal(await page.evaluate("window.__items[0].z_inches"), 10, "invalid text never lands a half-patch");
  const typedCount = (await entries()).past.length;
  assert.equal(typedCount, 2, "invalid entry recorded nothing");
  record("F: typed coordinates — in / ft / invalid rejection");

  // --- G: multi-select align → multi channel, ONE scene-multi entry, honest undo
  // 3 rows selected: the primary anchors, BOTH other rows patch → the
  // commit router can't fit it in the single-item channel → onPatchScene.
  await page.evaluate("window.__ctl('reset')"); await page.waitForTimeout(90);
  await clickItem("Move Foundation 1");
  await clickItem("Move Foundation 2", { ctrl: true });
  await clickItem("Move Foundation 3", { ctrl: true });
  const sel = await page.evaluate("window.__sel()");
  assert.equal(sel.count, 3, "ctrl+click additive selection");
  const primaryId = sel.primaryId;
  const primaryIdx = primaryId.endsWith(":i2") ? 2 : primaryId.endsWith(":i1") ? 1 : 0;
  await page.locator('[data-op="align-left"]').click();
  await page.waitForTimeout(90);
  const expectedX = await page.evaluate(`window.__items[${primaryIdx}].x_inches`);
  for (const j of [0, 1, 2].filter((i) => i !== primaryIdx)) {
    assert.equal(await page.evaluate(`window.__items[${j}].x_inches`), expectedX, `align pulled row ${j} onto the primary's left edge`);
  }
  const multiCalls = await page.evaluate("window.__multi.length");
  assert.equal(multiCalls, 1, "align committed through the multi channel");
  e = await entries();
  assert.equal(e.past.length, 1, "align = one history command");
  assert.equal(e.past[0].kind, "scene-multi", "multi op records the multi kind");
  // Honesty guard: the CURRENT single-row apply refuses, nothing faked.
  const legacy = await page.evaluate("window.__legacyUndo()");
  assert.equal(legacy.status, "rejected", "legacy apply refuses the multi payload honestly");
  // The mounted multi-aware apply round-trips it for real.
  const u3 = await page.evaluate("window.__undo()");
  assert.equal(u3.status, "applied", "mounted multi apply undoes the op");
  await page.waitForTimeout(70);
  assert.equal(await page.evaluate("window.__items[0].x_inches"), 10, "undo restored row 0");
  assert.equal(await page.evaluate("window.__items[1].x_inches"), 60, "undo restored row 1");
  const r3 = await page.evaluate("window.__redo()");
  assert.equal(r3.status, "applied");
  await page.waitForTimeout(70);
  assert.equal(await page.evaluate("window.__items[0].x_inches"), expectedX, "redo re-applied");
  record("G: align — multi channel, one command, honest refusal + real undo");

  // --- H: distribute 3 → equal gaps, outer pair anchored
  await page.evaluate("window.__ctl('reset')"); await page.waitForTimeout(90);
  await clickItem("Move Foundation 1");
  await clickItem("Move Foundation 2", { ctrl: true });
  await clickItem("Move Foundation 3", { ctrl: true });
  await page.locator('[data-op="distribute-x"]').click();
  await page.waitForTimeout(90);
  const i1x = await page.evaluate("window.__items[1].x_inches");
  // i0 [10,34] and i2 [200,248] anchored; free = 200-34-24 = 142; gap = 71
  // → i1 left edge lands at 34+71 = 105.
  assert.equal(i1x, 105, `middle row re-spaced to equal gaps (${i1x})`);
  e = await entries();
  assert.equal(e.past.length, 1, "distribute = one command");
  const u4 = await page.evaluate("window.__undo()");
  assert.equal(u4.status, "applied");
  await page.waitForTimeout(70);
  assert.equal(await page.evaluate("window.__items[1].x_inches"), 60, "distribute undo restored position");
  record("H: distribute — equal gaps, one command, undo");

  // --- I: delete — canvas emits the plan, page commits (button + keyboard)
  await page.evaluate("window.__ctl('reset')"); await page.waitForTimeout(90);
  await clickItem("Move Foundation 1");
  await page.locator('[data-op="delete"]').click();
  await page.waitForTimeout(90);
  const del1 = await page.evaluate("window.__deletes.length");
  assert.equal(del1, 1, "delete hook fired");
  assert.equal(await page.evaluate("window.__items.length"), 2, "page removed the row (canvas never mutates)");
  await clickItem("Move Foundation 1"); // now the former i1
  {
    const it = page.locator('[aria-label="Move Foundation 1"]');
    await it.focus();
    await page.keyboard.press("Delete");
    await page.waitForTimeout(90);
  }
  assert.equal(await page.evaluate("window.__deletes.length"), 2, "keyboard Delete fires the same hook");
  assert.equal(await page.evaluate("window.__items.length"), 1);
  record("I: delete — hook plan via button + Delete key");

  // --- J: duplicate — plan hook (button + Ctrl+D), page clones at +12/+12
  await page.evaluate("window.__ctl('reset')"); await page.waitForTimeout(90);
  await clickItem("Move Foundation 1");
  await page.locator('[data-op="duplicate"]').click();
  await page.waitForTimeout(90);
  const dups = await page.evaluate("window.__dups");
  assert.equal(dups.length, 1, "duplicate plan emitted");
  assert.deepEqual(dups[0].offset_inches, { x: 12, z: 12 }, "suggested +12/+12 offset");
  assert.equal(await page.evaluate("window.__items.length"), 4, "page cloned the row");
  const clone = await page.evaluate("window.__items[3]");
  assert.equal(clone.x_inches, 22); assert.equal(clone.z_inches, 22);
  assert.equal(clone.component_id, "i0_c0", "clone carries a new id");
  await clickItem("Move Foundation 2");
  {
    const it = page.locator('[aria-label="Move Foundation 2"]');
    await it.focus();
    await page.keyboard.down("Control");
    await page.keyboard.press("d");
    await page.keyboard.up("Control");
    await page.waitForTimeout(90);
  }
  assert.equal(await page.evaluate("window.__dups.length"), 2, "Ctrl+D fires the same hook");
  assert.equal(await page.evaluate("window.__items.length"), 5);
  record("J: duplicate — plan via button + Ctrl+D");

  // --- K: read-only — no edit chrome, selection still works
  await page.evaluate("window.__ctl('reset')"); await page.waitForTimeout(80);
  await page.evaluate("window.__ctl('readonly')");
  await page.waitForTimeout(80);
  await clickItem("Foundation 1").catch(() => {});
  // read-only items have no aria-label — click via node id position instead
  {
    const box = await page.locator('[data-scene-selection="true"]').boundingBox();
    await page.mouse.move(box.x + 30, box.y + 30);
    await page.mouse.down(); await page.mouse.up();
    await page.waitForTimeout(70);
  }
  assert.equal(await page.locator("[data-editops-toolbar]").count(), 0, "no toolbar read-only");
  assert.equal(await page.locator("[data-typed-bar]").count(), 0, "no typed bar read-only");
  assert.equal(await page.locator("[data-resize-handle]").count(), 0, "no handles read-only");
  const selRO = await page.evaluate("window.__sel()");
  assert.ok(selRO.count >= 1, "read-only click still selects");
  await page.evaluate("window.__ctl('editable')");
  await page.waitForTimeout(70);
  record("K: read-only gating — selection lives, edit chrome gone");

  // --- L: uniform grid snap — drag lands on 12in multiples
  await page.evaluate("window.__ctl('reset')"); await page.waitForTimeout(80);
  await page.evaluate("window.__ctl('grid', 12)");
  // Drag into genuinely empty plan space (~x150 / ~z190) so no bounds probe
  // sits within snap tolerance of any object — BOTH axes fall to the 12in
  // grid (object snap would win if a candidate were in reach).
  await dragItem("Move Foundation 1", 360, 463);
  const gx0 = await page.evaluate("window.__items[0].x_inches");
  const gz0 = await page.evaluate("window.__items[0].z_inches");
  assert.ok(gx0 % 12 === 0 && gz0 % 12 === 0, `grid-snapped commit (${gx0},${gz0})`);
  assert.ok(gx0 > 10 && gz0 > 10, "the drag actually landed");
  record("L: uniform grid snap");

  // --- M: multi-drag — selected rows move together, ONE scene-multi entry
  await page.evaluate("window.__ctl('reset')"); await page.waitForTimeout(90);
  await clickItem("Move Foundation 1");
  await clickItem("Move Foundation 2", { ctrl: true });
  await dragItem("Move Foundation 1", 50, 30);
  const x0 = await page.evaluate("window.__items[0].x_inches");
  const x1 = await page.evaluate("window.__items[1].x_inches");
  const z1 = await page.evaluate("window.__items[1].z_inches");
  assert.ok(x0 > 10 && x1 > 60 && z1 > 10, `both rows moved (${x0}, ${x1},${z1})`);
  assert.equal(await page.evaluate("window.__multi.length"), 1, "multi-drag committed via multi channel");
  e = await entries();
  assert.equal(e.past.length, 1, "multi-drag = one history command");
  assert.equal(e.past[0].kind, "scene-multi");
  const u5 = await page.evaluate("window.__undo()");
  assert.equal(u5.status, "applied");
  await page.waitForTimeout(70);
  assert.equal(await page.evaluate("window.__items[0].x_inches"), 10);
  assert.equal(await page.evaluate("window.__items[1].x_inches"), 60);
  record("M: multi-drag — one multi commit + undo");

  await page.screenshot({ path: `${DIR}/o035-browser-canvas.png`, fullPage: false });
} finally {
  await browser.close();
  server.close();
}

const report = { suite: "verify-o035-browser", scenarios: results.map((r) => r.name), count: results.length, status: "PASS", viewport: "1280x900", engine: "chromium (system chrome channel)" };
fs.writeFileSync(`${DIR}/o035-browser-verification.json`, JSON.stringify(report, null, 2));
console.log(`PASS ${report.suite}: ${results.length} scenarios`);
results.forEach((r) => console.log(" -", r.name));
process.exit(0);

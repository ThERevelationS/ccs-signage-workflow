// O-039 remote-vs-candidate parity: replays an identical scripted gesture
// stream against the REMOTE canvas bundle and the CANDIDATE bundle (staging)
// and deep-compares every emitted move patch and DOM placement. Any
// behavioral drift introduced by the input-seam wiring fails here.
// Usage: node verify-o039-remote-parity.mjs
import esbuild from "esbuild";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { chromium } from "playwright-core";

const OUT = ".audit-work/foundation-o038-input";
const STUBS = {
  "lucide-react": `export const Move=()=>null;export const ZoomIn=()=>null;export const ZoomOut=()=>null;`,
};

const harness = `
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import FoundationLayoutCanvas from '@/components/estimator/foundation/FoundationLayoutCanvas';
const baseItems = () => ([
  { component_id: 'i0', x_inches: 10, z_inches: 10, length_inches: 24, width_inches: 24 },
  { component_id: 'i1', x_inches: 120, z_inches: 80, length_inches: 48, width_inches: 36, rotation_degrees: 15 },
  { component_id: 'i2', x_inches: 200, z_inches: 200, length_inches: 30, width_inches: 30 },
  { id: 77, x_inches: 300, z_inches: 60, length_inches: 20, width_inches: 20 },
  { x_inches: 350, z_inches: 150, length_inches: 25, width_inches: 15 },
]);
function App(){
  const [items,setItems]=useState(baseItems());
  const [moves,setMoves]=useState([]);
  window.__items=items; window.__moves=moves;
  window.__ctl=(cmd)=>{
    if(cmd==='reorder')setItems(prev=>[prev[1],prev[0],...prev.slice(2)]);
    if(cmd==='deleteFirst')setItems(prev=>prev.slice(1));
    if(cmd==='mutate0')setItems(prev=>prev.map((it,j)=>j===0?{...it,length_inches:99}:it));
    if(cmd==='reset'){setItems(baseItems());setMoves([]);}
  };
  return React.createElement(FoundationLayoutCanvas,{items,poles:[{component_id:'pp',x_inches:60,z_inches:55}],
    onMoveItem:(i,p)=>{setMoves(m=>[...m,{i,p}]);setItems(prev=>prev.map((it,j)=>j===i?{...it,...p}:it));}});
}
createRoot(document.getElementById('root')).render(React.createElement(React.StrictMode, null, React.createElement(App)));
`;

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
  .w-2\\.5{width:10px}.h-2\\.5{height:10px}.w-6{width:24px}.h-6{height:24px}.w-10{width:40px}
  .bg-slate-700{background:#334155}.border-white{border-color:#fff}
  .p-3{padding:12px}.mb-2{margin-bottom:8px}.mt-1{margin-top:4px}
  .left-1{left:4px}.top-1{top:4px}.z-10{z-index:10}
  .bg-white{background:#fff}.bg-gray-50{background:#f9fafb}.border-gray-200{border-color:#e5e7eb}.border-gray-300{border-color:#d1d5db}
  body{margin:8px;font-family:sans-serif}
`;

const buildFor = async (stage) => {
  const plugin = { name: "s", setup(b) {
    b.onResolve({ filter: /^harness$/ }, () => ({ path: "harness", namespace: "h" }));
    b.onResolve({ filter: /.*/ }, (a) => (STUBS[a.path] ? { path: path.resolve("s-" + a.path.replace(/[^a-z0-9]/gi, "_")), namespace: "s" } : undefined));
    b.onLoad({ filter: /.*/, namespace: "h" }, () => ({ contents: harness, loader: "jsx", resolveDir: stage }));
    b.onLoad({ filter: /.*/, namespace: "s" }, (a) => { const k = Object.keys(STUBS).find((k) => path.resolve("s-" + k.replace(/[^a-z0-9]/gi, "_")) === a.path); return { contents: STUBS[k], loader: "js", resolveDir: stage }; });
  }};
  const built = await esbuild.build({ entryPoints: ["harness"], bundle: true, format: "iife", platform: "browser", write: false, plugins: [plugin], loader: { ".js": "jsx", ".jsx": "jsx" }, jsx: "automatic", alias: { "@": stage } });
  return `<!doctype html><meta charset="utf-8"><style>${css}</style><body><div id="root"></div><script>${built.outputFiles[0].text.replace(/<\/script/g, "<\\/script")}</script></body></html>`;
};

// One scripted gesture stream — deterministic, run identically on both builds.
async function runGestureScript(page) {
  const log = { moves: [], steps: [] };
  const snap = async (tag) => {
    const s = await page.evaluate(() => ({
      moves: window.__moves,
      rects: [...document.querySelectorAll("[role=button]")].map((el) => {
        const r = el.getBoundingClientRect();
        return { label: el.getAttribute("aria-label"), x: +r.left.toFixed(2), y: +r.top.toFixed(2), w: +r.width.toFixed(2), h: +r.height.toFixed(2), t: el.style.transform || "" };
      }),
      items: window.__items.map((it) => ({ x: it.x_inches, z: it.z_inches, id: it.component_id ?? it.id ?? null })),
    }));
    log.steps.push({ tag, ...s });
  };
  const drag = async (label, dx, dy) => {
    const b = await page.locator(`[aria-label="${label}"]`).boundingBox();
    await page.mouse.move(b.x + 6, b.y + 6);
    await page.mouse.down();
    await page.mouse.move(b.x + 6 + dx, b.y + 6 + dy, { steps: 3 });
    await page.mouse.up();
    await page.waitForTimeout(50);
  };
  const item = (n) => page.locator(`[aria-label="Move Foundation ${n}"]`);

  await snap("initial");
  await drag("Move Foundation 2", 41, 23);            // rotated item drag
  await snap("drag-rotated");
  await item(1).focus();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Shift+ArrowUp");
  await page.keyboard.press("Alt+ArrowDown");          // modifier -> ignored
  await page.keyboard.press("x");                      // non-arrow -> ignored
  await snap("keyboard");
  await page.evaluate("window.__ctl('reset')"); await page.waitForTimeout(50);
  // wiggle
  let b = await item(3).boundingBox();
  await page.mouse.move(b.x + 5, b.y + 5); await page.mouse.down();
  await page.mouse.move(b.x + 5.3, b.y + 5.4, { steps: 2 }); await page.mouse.up();
  await snap("wiggle");
  // reorder mid-drag (component identity)
  b = await item(4).boundingBox();                     // legacy-id row
  await page.mouse.move(b.x + 5, b.y + 5); await page.mouse.down();
  await page.mouse.move(b.x + 30, b.y + 30, { steps: 2 });
  await page.evaluate("window.__ctl('reorder')");
  await page.mouse.up(); await page.waitForTimeout(50);
  await snap("reorder-commit");
  // mutate mid-drag -> fingerprint cancel
  await page.evaluate("window.__ctl('reset')"); await page.waitForTimeout(50);
  b = await item(1).boundingBox();
  await page.mouse.move(b.x + 5, b.y + 5); await page.mouse.down();
  await page.mouse.move(b.x + 30, b.y + 30, { steps: 2 });
  await page.evaluate("window.__ctl('mutate0')");
  await page.mouse.up(); await page.waitForTimeout(50);
  await snap("fingerprint-cancel");
  // index-identity row (no id) drag after delete -> count changed -> cancel
  await page.evaluate("window.__ctl('reset')"); await page.waitForTimeout(50);
  b = await item(5).boundingBox();
  await page.mouse.move(b.x + 5, b.y + 5); await page.mouse.down();
  await page.mouse.move(b.x + 20, b.y + 20, { steps: 2 });
  await page.evaluate("window.__ctl('deleteFirst')");
  await page.mouse.up(); await page.waitForTimeout(50);
  await snap("index-cancel");
  // zoom 1.5x then drag
  await page.evaluate("window.__ctl('reset')"); await page.waitForTimeout(50);
  await page.locator('[aria-label="Zoom layout in"]').click();
  await page.locator('[aria-label="Zoom layout in"]').click();
  await page.waitForTimeout(50);
  await drag("Move Foundation 5", 26, -14);
  await snap("zoomed-drag");
  // zoom back out then negative-direction drag
  await page.locator('[aria-label="Zoom layout out"]').click();
  await page.locator('[aria-label="Zoom layout out"]').click();
  await page.waitForTimeout(50);
  await drag("Move Foundation 1", -6, -9);             // clamps? no — free move allowed negative
  await snap("negative-drag");
  return log;
}

const stageCand = path.resolve(`${OUT}/staging-src`);
const stageRemote = path.resolve(`${OUT}/remote-pkg`);
const [htmlCand, htmlRemote] = [await buildFor(stageCand), await buildFor(stageRemote)];

const server = http.createServer((req, res) => {
  res.setHeader("content-type", "text/html");
  res.end(req.url.startsWith("/remote") ? htmlRemote : htmlCand);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const port = server.address().port;

const browser = await chromium.launch({ channel: "chrome", headless: true });
const run = async (route) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`http://127.0.0.1:${port}/${route}`);
  await page.waitForSelector("text=Layout Canvas", { timeout: 15000 });
  const out = await runGestureScript(page);
  await ctx.close();
  return out;
};
const remoteLog = await run("remote");
const candLog = await run("candidate");
await browser.close();
server.close();

fs.writeFileSync(`${OUT}/o039-parity-remote.json`, JSON.stringify(remoteLog, null, 1));
fs.writeFileSync(`${OUT}/o039-parity-candidate.json`, JSON.stringify(candLog, null, 1));

assert.equal(candLog.steps.length, remoteLog.steps.length, "step count parity");
let diffs = 0;
for (let i = 0; i < remoteLog.steps.length; i += 1) {
  try {
    assert.deepEqual(candLog.steps[i], remoteLog.steps[i], `step ${remoteLog.steps[i].tag}`);
  } catch (e) {
    diffs += 1;
    console.log(`DIFF @${remoteLog.steps[i].tag}:`, String(e.message).slice(0, 600));
  }
}
const report = { suite: "verify-o039-remote-parity", steps: remoteLog.steps.map((s) => s.tag), diffs, status: diffs ? "FAIL" : "PASS" };
fs.writeFileSync(`${OUT}/o039-remote-parity.json`, JSON.stringify(report, null, 2));
console.log(`${report.status} ${report.suite}: ${remoteLog.steps.length} scripted steps, ${diffs} diffs`);
process.exit(diffs ? 1 : 0);

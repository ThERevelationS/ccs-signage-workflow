import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { build } from "esbuild";
import { chromium } from "playwright-core";

const DIR = ".audit-work/foundation-reinforcement18/";
// This observes the real renderer. In particular, WebGLRenderer installs render
// as an instance method, so overriding a subclass prototype would not capture it.
const captureRenderer = `
export * from "three";
import { WebGLRenderer as NativeRenderer } from "three";
export class WebGLRenderer extends NativeRenderer {
  constructor(options) {
    super(options);
    const c=window.__foundation3DCapture;c.created++;
    const nativeRender=this.render.bind(this),nativeDispose=this.dispose.bind(this);
    let disposed=false,lastScene=null;
    this.render=(scene,camera)=>{
      nativeRender(scene,camera);
      c.frames++;c.nativeRenderCompleted=true;lastScene=scene;window.__foundation3DScene=scene;
      const gl=this.getContext();
      if(!c.driver){
        const debug=gl.getExtension("WEBGL_debug_renderer_info");
        c.driver={version:gl.getParameter(gl.VERSION),renderer:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):"unavailable"};
      }
      if(c.wantPixels){
        c.wantPixels=false;
        const width=gl.drawingBufferWidth,height=gl.drawingBufferHeight,bytes=new Uint8Array(width*height*4);
        gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,bytes);
        const sampled=new Set(),packed=new Uint32Array(bytes.buffer);
        for(let i=0;i<packed.length;i+=16)sampled.add(packed[i]);
        c.pixels={frame:c.frames,width,height,uniqueColorsSampled:sampled.size,contextLost:gl.isContextLost(),drawCalls:this.info.render.calls};
      }
      const error=gl.getError();if(error!==gl.NO_ERROR&&c.glErrors.length<8)c.glErrors.push(error);
    };
    this.dispose=()=>{
      if(!disposed){disposed=true;c.disposed++;}nativeDispose();
      if(window.__foundation3DScene===lastScene)window.__foundation3DScene=null;
    };
  }
}`;
const built = await build({
  entryPoints: [DIR + "reinforcement-3d-browser-fixture.jsx"], bundle: true, write: false, outdir: "out",
  platform: "browser", format: "esm", jsx: "automatic", metafile: true,
  plugins: [{ name: "observe-native-webgl", setup(builder) {
    builder.onResolve({ filter: /^three$/ }, args => args.namespace === "native-webgl-capture"
      ? { path: path.resolve("node_modules/three/build/three.module.js") }
      : { path: "three", namespace: "native-webgl-capture" });
    builder.onLoad({ filter: /.*/, namespace: "native-webgl-capture" }, () => ({ contents: captureRenderer, loader: "js", resolveDir: process.cwd() }));
  } }],
});
const inputs = Object.keys(built.metafile.inputs);
for (const file of ["Foundation3DPreview.jsx", "foundationReinforcementPreview3D.js", "foundationReinforcementModel.js", "foundationReinforcementThreePreview.js"])
  assert.ok(inputs.some(input => input.endsWith("/" + file)), "Actual source required: " + file);
assert.ok(inputs.some(input => input.endsWith("/three/build/three.module.js")), "Actual Three.js WebGL implementation required");
assert.ok(!inputs.some(input => /base44Client|staffEntities|node_modules\/@base44/.test(input)));
fs.writeFileSync(DIR + "reinforcement-3d-browser-meta.json", JSON.stringify(built.metafile, null, 2) + "\n");
const js = built.outputFiles.find(file => file.path.endsWith(".js")).text;
fs.writeFileSync(DIR + "reinforcement-3d-browser-bundle.js", js);
const css = fs.readFileSync(DIR + "reinforcement-3d-browser.css", "utf8");
const html = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"></head><body><div id="root"></div><script type="module" src="/fixture.js"></script></body></html>';
const server = http.createServer((request, response) => {
  const pathname = new URL(request.url, "http://127.0.0.1").pathname;
  const file = { "/fixture.js": ["text/javascript", js], "/fixture.css": ["text/css", css] }[pathname];
  if (file) { response.writeHead(200, { "Content-Type": file[0] }); response.end(file[1]); return; }
  if (pathname === "/favicon.ico") { response.writeHead(204); response.end(); return; }
  response.writeHead(pathname === "/" ? 200 : 404, { "Content-Type": "text/html; charset=utf-8" }); response.end(html);
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({
  executablePath: "C:/Users/BrettHeinlein/AppData/Local/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-win64/chrome-headless-shell.exe",
  args: ["--enable-webgl", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const results = [];
const expectedCounts = { spread: 8, pillar: 6, ties: 17, legacy: 0, unsupported: 0 };
const inspect = page => page.evaluate(() => window.__foundation3DInspect());
const near = (actual, expected, tolerance = 1e-9) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} != ${expected}`);
async function check(mode, width) {
  const context = await browser.newContext({ viewport: { width, height: 1000 }, deviceScaleFactor: 1 });
  const page = await context.newPage(), telemetry = { pageErrors: [], consoleErrors: [], externalRequests: [], requestFailures: [] };
  page.on("pageerror", error => telemetry.pageErrors.push(String(error)));
  page.on("console", message => { if (message.type() === "error") telemetry.consoleErrors.push(message.text()); });
  page.on("requestfailed", request => telemetry.requestFailures.push(request.url()));
  page.on("dialog", dialog => { telemetry.pageErrors.push("Unexpected dialog: " + dialog.message()); return dialog.dismiss(); });
  await page.route("**/*", route => {
    const url = new URL(route.request().url());
    if (url.origin === origin && ["/", "/fixture.js", "/fixture.css", "/favicon.ico"].includes(url.pathname)) return route.continue();
    telemetry.externalRequests.push(url.href); return route.abort();
  });
  try {
    await page.goto(origin + "/?mode=" + mode, { waitUntil: "networkidle" });
    await page.waitForFunction(() => window.__foundation3DCapture?.frames > 0 || document.body.innerText.includes("3D preview is unavailable"));
    let snapshot = await inspect(page);
    assert.ok(snapshot.frames > 0, "Real native WebGL render must complete; an error placeholder is not a pass");
    assert.equal(snapshot.canvasCount, 1); assert.equal(snapshot.inputUnchanged, true);
    assert.equal(snapshot.primitives.length, expectedCounts[mode]);
    assert.equal(snapshot.concrete.length, 1); assert.equal(snapshot.glErrors.length, 0);
    const hasSteel = expectedCounts[mode] > 0;
    assert.equal(snapshot.ground[0].opacity, hasSteel ? 0.12 : 1);
    assert.equal(snapshot.concrete[0].opacity, hasSteel ? 0.18 : 1);
    for (const primitive of snapshot.primitives) {
      assert.equal(primitive.parentedToConcrete, true); assert.equal(primitive.engineeringApproved, false);
      if (primitive.geometry !== "BufferGeometry") near(primitive.nominalRadius, 0.5 / 24);
    }
    if (mode === "spread") {
      assert.ok(snapshot.primitives.every(primitive => primitive.role === "horizontal" && primitive.geometry === "CylinderGeometry"));
      assert.equal(snapshot.primitives.reduce((sum, primitive) => sum + primitive.pathLength, 0), 20);
      near(snapshot.primitives[0].world[1], -0.3125);
    }
    if (mode === "pillar") {
      assert.equal(snapshot.primitives.filter(primitive => primitive.role === "longitudinal").length, 4);
      const rings = snapshot.primitives.filter(primitive => primitive.geometry === "TorusGeometry");
      assert.equal(rings.length, 2); rings.forEach(ring => near(ring.ringRadius, 7 / 12));
    }
    if (mode === "ties") {
      assert.equal(snapshot.primitives.filter(primitive => primitive.role === "horizontal").length, 16);
      const ties = snapshot.primitives.filter(primitive => primitive.kind === "tie_reference");
      assert.equal(ties.length, 1); assert.equal(ties[0].dashed, true);
      near(ties[0].pathLength, 29 / 12, 1e-6); assert.notEqual(ties[0].pathLength, 3);
      await page.getByText("Support items and hook/bend allowances are not drawn. Dashed ties are reference paths only.", { exact: true }).waitFor();
    }
    if (mode === "unsupported") {
      await page.getByText(/reinforcement calculation version is unsupported/).waitFor();
      assert.ok(await page.getByText(/reinforcement calculation version is unsupported/).evaluate(element => element.classList.contains("text-red-700")));
    }
    if (mode === "legacy") assert.equal(await page.getByRole("button", { name: "Reinforcement", exact: true }).count(), 0);
    await page.getByText("Schematic overview only: instances are arranged for inspection, not saved 2D placement. Pole markers and diameters are schematic, not purchasing data.", { exact: true }).waitFor();
    if (mode === "spread" || !hasSteel) await page.getByRole("button", { name: "Top", exact: true }).click();
    if (mode === "ties") await page.getByRole("button", { name: "Front", exact: true }).click();
    if (!hasSteel) await page.getByRole("button", { name: "Hide Ground", exact: true }).click();
    const canvas = page.locator("canvas"); await canvas.hover();
    await page.mouse.wheel(0, mode === "pillar" || mode === "ties" ? -600 : -750);
    await page.getByText(mode === "pillar" || mode === "ties" ? "250%" : "400%", { exact: true }).waitFor();
    await page.evaluate(() => { window.__foundation3DCapture.pixels = null; window.__foundation3DCapture.wantPixels = true; });
    await page.waitForFunction(() => window.__foundation3DCapture.pixels !== null);
    snapshot = await inspect(page);
    assert.ok(snapshot.pixels.width > 100 && snapshot.pixels.height === 420, "Real app CSS must size a usable canvas");
    assert.equal(snapshot.pixels.contextLost, false); assert.ok(snapshot.pixels.drawCalls > 0);
    assert.ok(snapshot.pixels.uniqueColorsSampled > 1, "Actual framebuffer must not be a uniform blank");
    assert.equal(snapshot.glErrors.length, 0);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), "Full-page horizontal overflow");
    const screenshot = DIR + `reinforcement-3d-browser-${mode}-${width}.png`;
    await page.screenshot({ path: screenshot, fullPage: true });
    if (hasSteel) {
      await page.getByRole("button", { name: "Reinforcement", exact: true }).click();
      await page.waitForFunction(() => window.__foundation3DInspect().primitives.length === 0);
      const hidden = await inspect(page); assert.equal(hidden.concrete[0].opacity, 1); assert.equal(hidden.ground[0].opacity, 1);
      await page.getByRole("button", { name: "Reinforcement", exact: true }).click();
      await page.waitForFunction(count => window.__foundation3DInspect().primitives.length === count, expectedCounts[mode]);
    }
    await page.getByRole("button", { name: "Hide 3D View", exact: true }).click(); assert.equal(await page.locator("canvas").count(), 0);
    await page.getByRole("button", { name: "Show 3D View", exact: true }).click(); await canvas.waitFor();
    const final = await inspect(page);
    assert.equal(final.primitives.length, expectedCounts[mode]); assert.equal(final.inputUnchanged, true); assert.equal(final.canvasCount, 1);
    assert.equal(final.glErrors.length, 0); assert.equal(final.created - final.disposed, 1);
    for (const entries of Object.values(telemetry)) assert.deepEqual(entries, []);
    results.push({ mode, width, ok: true, snapshot, final, screenshot, telemetry });
    console.log("ok", mode, width, snapshot.driver?.renderer);
  } catch (error) {
    const screenshot = DIR + `reinforcement-3d-browser-failed-${mode}-${width}.png`;
    await page.screenshot({ path: screenshot, fullPage: true }).catch(() => {});
    results.push({ mode, width, ok: false, error: String(error.stack), screenshot, telemetry, snapshot: await inspect(page).catch(() => null) });
    console.error("FAIL", mode, width, error.message);
  } finally { await context.close(); }
}
try {
  outer: for (const width of [1440, 390]) for (const mode of Object.keys(expectedCounts)) {
    await check(mode, width); if (results.some(result => !result.ok)) break outer;
  }
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
const failed = results.filter(result => !result.ok).length;
fs.writeFileSync(DIR + "reinforcement-3d-browser-verification.json", JSON.stringify({
  synthetic: true, rendererMocked: false, softwareWebGLRequested: true, realBase44StorageVerified: false,
  realWebGLVerified: results.length === 10 && !failed, results,
}, null, 2) + "\n");
console.log(`Native WebGL browser: ${results.filter(result => result.ok).length}/10; failed=${failed}`);
process.exitCode = failed || results.length !== 10 ? 1 : 0;

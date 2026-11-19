import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { build } from "esbuild";
import { chromium } from "playwright-core";

const DIR = ".audit-work/foundation-reinforcement18/";
const captureRenderer = `
export * from "three";
import { WebGLRenderer as NativeRenderer } from "three";
export class WebGLRenderer extends NativeRenderer {
  constructor(options) {
    super(options);
    const c=window.__savedLayoutCapture;c.created++;
    const nativeRender=this.render.bind(this),nativeDispose=this.dispose.bind(this);
    let disposed=false,lastScene=null;
    this.render=(scene,camera)=>{
      nativeRender(scene,camera);c.frames++;c.scene=scene;c.camera=camera.clone();lastScene=scene;
      const gl=this.getContext();
      if(!c.driver){const debug=gl.getExtension("WEBGL_debug_renderer_info");
        c.driver={version:gl.getParameter(gl.VERSION),renderer:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):"unavailable"};}
      if(c.wantPixels){c.wantPixels=false;
        const width=gl.drawingBufferWidth,height=gl.drawingBufferHeight,bytes=new Uint8Array(width*height*4);
        gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,bytes);
        const sampled=new Set(),packed=new Uint32Array(bytes.buffer);
        for(let i=0;i<packed.length;i+=16)sampled.add(packed[i]);
        c.pixels={frame:c.frames,width,height,uniqueColorsSampled:sampled.size,contextLost:gl.isContextLost(),drawCalls:this.info.render.calls};}
      const error=gl.getError();if(error!==gl.NO_ERROR&&c.glErrors.length<8)c.glErrors.push(error);
    };
    this.dispose=()=>{if(!disposed){disposed=true;c.disposed++;}nativeDispose();
      if(c.scene===lastScene){c.scene=null;c.camera=null;}};
  }
}`;
const compiled = await build({
  entryPoints: [DIR + "foundation-saved-layout-browser-fixture.jsx"], bundle: true, write: false, outdir: "out",
  platform: "browser", format: "esm", jsx: "automatic", metafile: true,
  plugins: [{ name: "saved-layout-native-webgl", setup(builder) {
    builder.onResolve({ filter: /^three$/ }, args => args.namespace === "saved-layout-webgl"
      ? { path: path.resolve("node_modules/three/build/three.module.js") }
      : { path: "three", namespace: "saved-layout-webgl" });
    builder.onLoad({ filter: /.*/, namespace: "saved-layout-webgl" }, () => ({
      contents: captureRenderer, loader: "js", resolveDir: process.cwd(),
    }));
  } }],
});
const inputs = Object.keys(compiled.metafile.inputs);
for (const file of ["Foundation3DPreview.jsx", "foundationReinforcementPreview3D.js", "foundationLayoutModel.js",
  "foundationPolePreview3D.js", "foundationReinforcementThreePreview.js"])
  assert.ok(inputs.some(input => input.endsWith("/" + file)), "Actual source required: " + file);
assert.ok(inputs.some(input => input.endsWith("/three/build/three.module.js")));
assert.ok(!inputs.some(input => /base44Client|staffEntities|foundationCalc\.js|node_modules\/@base44/.test(input)));
fs.writeFileSync(DIR + "foundation-saved-layout-browser-meta.json", JSON.stringify(compiled.metafile, null, 2) + "\n");
const js = compiled.outputFiles.find(file => file.path.endsWith(".js")).text;
const css = fs.readFileSync(DIR + "foundation-saved-layout-browser.css", "utf8");
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
const inspect = page => page.evaluate(() => window.__savedLayoutInspect());
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);
const inFrame = snapshot => snapshot.corners.length === 8 && snapshot.corners.every(point =>
  point.every(Number.isFinite) && Math.abs(point[0]) <= 0.95 && Math.abs(point[1]) <= 0.95 && point[2] >= -1 && point[2] <= 1);
const waitFrames = (page, frame) => page.waitForFunction(frame => window.__savedLayoutCapture.frames >= frame + 2, frame);
try {
  for (const mode of ["recorded", "legacy-height", "invalid-poles", "quantity", "wide-layout"]) {
    for (const viewport of [{ width: 1280, height: 1100 }, { width: 390, height: 844 }]) {
      const context = await browser.newContext({ viewport });
      const page = await context.newPage();
      const telemetry = { consoleErrors: [], pageErrors: [], externalRequests: [], requestFailures: [] };
      const stages = [];
      let screenshot, final;
      page.on("console", message => { if (message.type() === "error") telemetry.consoleErrors.push(message.text()); });
      page.on("pageerror", error => telemetry.pageErrors.push(String(error)));
      page.on("requestfailed", request => telemetry.requestFailures.push({ url: request.url(), error: request.failure()?.errorText }));
      await page.route("**/*", async route => {
        if (new URL(route.request().url()).origin !== origin) {
          telemetry.externalRequests.push(route.request().url()); await route.abort(); return;
        }
        await route.continue();
      });
      const stage = async name => {
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const snapshot = await inspect(page);
        stages.push({ name, fits: inFrame(snapshot), corners: snapshot.corners, camera: snapshot.camera });
        assert.equal(snapshot.inputUnchanged, true); assert.equal(snapshot.financialInputsUnchanged, true);
        assert.equal(snapshot.procurementReady, false); assert.equal(snapshot.engineeringApproved, false);
        assert.ok(snapshot.steel.every(bar => bar.engineeringApproved === false && bar.parentedToConcrete));
        return snapshot;
      };
      try {
        await page.goto(origin + "/?mode=" + mode, { waitUntil: "networkidle" });
        await page.waitForFunction(() => window.__savedLayoutCapture?.frames >= 2);
        assert.equal(await page.getByRole("button", { name: "Inspection", exact: true }).getAttribute("aria-pressed"), "true");
        await page.getByRole("button", { name: "Saved 2D Anchors", exact: true }).click();
        const count = ["recorded", "wide-layout"].includes(mode) ? 2 : 1;
        await page.waitForFunction(count => window.__savedLayoutInspect().foundations.length === count &&
          window.__savedLayoutInspect().foundations.every(item => item.placementMode === "layout"), count);
        let snapshot = await stage("saved-mode");
        assert.equal(snapshot.steel.length, count * 8);
        near(snapshot.foundations[0].rotation, -Math.PI / 2);
        if (mode === "recorded") {
          assert.deepEqual(snapshot.foundations.map(item => item.position), [[11.5, -0.5, 21.5], [31.5, -1.5, 11.5]]);
          assert.deepEqual(snapshot.markers.find(pole => pole.kind === "attached").position, [11.5, 6, 21.5]);
          assert.deepEqual(snapshot.markers.find(pole => pole.kind === "independent").position, [5, 6, 5]);
          await page.getByRole("button", { name: "Move saved anchor", exact: true }).click();
          await page.waitForFunction(() => window.__savedLayoutInspect().foundations[0]?.position[0] === 21.5);
          await stage("moved-anchor");
          await page.getByRole("button", { name: "Undo saved move", exact: true }).click();
          await page.waitForFunction(() => window.__savedLayoutInspect().foundations[0]?.position[0] === 11.5);
          await stage("undo-move");
        }
        if (mode === "legacy-height") {
          assert.equal(snapshot.markers.length, 1); assert.equal(snapshot.markers[0].height, 8);
          assert.equal(snapshot.markers[0].heightBasis, "legacy_default");
          assert.match(await page.locator("body").innerText(), /height.*not recorded/i);
        }
        if (mode === "invalid-poles") {
          assert.equal(snapshot.markers.length, 0);
          const text = await page.locator("body").innerText();
          assert.match(text, /Pole 1:/); assert.match(text, /Pole 2:/);
        }
        if (mode === "quantity") {
          assert.equal(snapshot.foundations.length, 1);
          assert.match(await page.locator("body").innerText(), /additional.*locations.*not recorded/i);
        }
        if (mode === "wide-layout") {
          near(snapshot.foundations[1].position[0] - snapshot.foundations[0].position[0], 200);
        }
        for (const view of ["Top", "Front", "Side", "Reset"]) {
          const frame = (await inspect(page)).frames;
          await page.getByRole("button", { name: view, exact: true }).click();
          await waitFrames(page, frame); await stage(view);
        }
        await page.getByRole("button", { name: "Fit View", exact: true }).click();
        await stage("fit-view");
        const resized = { width: viewport.width === 390 ? 320 : 640, height: viewport.height };
        let frame = (await inspect(page)).frames;
        await page.setViewportSize(resized); await waitFrames(page, frame); await stage("resized");
        frame = (await inspect(page)).frames;
        await page.setViewportSize(viewport); await waitFrames(page, frame); await stage("restored-width");
        await page.getByRole("button", { name: "Hide 3D View", exact: true }).click();
        assert.equal(await page.locator("canvas").count(), 0);
        await page.getByRole("button", { name: "Show 3D View", exact: true }).click();
        await page.waitForFunction(() => window.__savedLayoutInspect().foundations.length > 0);
        await stage("hide-show");
        assert.equal(await page.getByRole("button", { name: "Saved 2D Anchors", exact: true }).getAttribute("aria-pressed"), "true");
        frame = (await inspect(page)).frames;
        await page.evaluate(() => { window.__savedLayoutCapture.wantPixels = true; });
        await page.waitForFunction(frame => window.__savedLayoutCapture.pixels?.frame > frame, frame);
        final = await inspect(page);
        assert.equal(final.created - final.disposed, 1); assert.equal(final.canvasCount, 1);
        assert.deepEqual(final.glErrors, []); assert.ok(final.driver.version.includes("WebGL"));
        assert.ok(final.pixels.uniqueColorsSampled > 8); assert.ok(final.pixels.drawCalls > 0);
        assert.equal(final.pixels.contextLost, false);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        for (const values of Object.values(telemetry)) assert.deepEqual(values, []);
        screenshot = DIR + `foundation-saved-layout-${mode}-${viewport.width}.png`;
        await page.screenshot({ path: screenshot, fullPage: true });
        assert.ok(stages.every(stage => stage.fits), "Saved scene is outside the view at: " + stages.filter(stage => !stage.fits).map(stage => stage.name).join(", "));
        results.push({ mode, viewport, ok: true, screenshot, stages, final, telemetry });
        console.log("ok", mode, viewport.width);
      } catch (error) {
        screenshot ||= DIR + `foundation-saved-layout-${mode}-${viewport.width}-failed.png`;
        await page.screenshot({ path: screenshot, fullPage: true }).catch(() => {});
        final ||= await inspect(page).catch(() => null);
        results.push({ mode, viewport, ok: false, error: String(error.stack), screenshot, stages, final, telemetry });
        console.error("FAIL", mode, viewport.width, error.message);
      } finally { await context.close(); }
    }
  }
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
fs.writeFileSync(DIR + "foundation-saved-layout-browser-verification.json", JSON.stringify({
  results, syntheticOnly: true, actualNativeWebGL: true, realStorageVerified: false,
  pricingChanged: false, reinforcementV2Activated: false,
}, null, 2) + "\n");
if (results.some(result => !result.ok)) process.exitCode = 1;

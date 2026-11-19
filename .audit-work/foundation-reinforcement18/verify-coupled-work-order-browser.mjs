import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import { createHash } from "node:crypto";
import { chromium } from "playwright-core";

const DIR = ".audit-work/foundation-reinforcement18/";
const names = ["saved-page", "recovered-page", "lost-work-order-create-reply"];
const documents = new Map(), frozen = new Map(), before = new Map();
const digest = file => createHash("sha256").update(fs.readFileSync(file)).digest("hex");
for (const name of names) {
  const file = DIR + `coupled-work-order-${name}-frozen.json`;
  frozen.set(name, JSON.parse(fs.readFileSync(file, "utf8")));
  before.set(file, digest(file));
  for (const suffix of ["-print.html", "-print-before-display-fix.html"]) {
    const document = `coupled-work-order-${name}${suffix}`;
    documents.set("/" + document, fs.readFileSync(DIR + document, "utf8"));
  }
}
const expected = [
  ["foundation:item:0:finishing", "0.19 hour", "$60.00", "$11.25"],
  ["foundation:item:0:pouring", "1 cy", "$15.00", "$15.00"],
  ["foundation:concrete-delivery:truck:0:fuel", "1 truck", "$30.00", "$30.00"],
  ["foundation:concrete-delivery:truck:0:small-load", "1 truck", "$150.00", "$150.00"],
  ["foundation:item:0:excavation", "2.5 hour", "$60.00", "$150.00"],
  ["foundation:landscape", "1 job", "$0.75", "$0.75"],
  ["foundation:concrete-delivery:mix", "1 cy", "$201.00", "$201.00"],
  ["foundation:item:0:rebar-labor", "1.2 hr", "$60.00", "$72.00"],
  ["foundation:cabinet:0", "2 each", "$12.00", "$24.00"],
  ["foundation:item:0:rebar", "20 ft", "$2.00", "$40.00"],
];
const server = http.createServer((request, response) => {
  if (request.url === "/favicon.ico") { response.writeHead(204); response.end(); return; }
  const html = documents.get(request.url);
  response.writeHead(html ? 200 : 404, { "Content-Type": "text/html; charset=utf-8" });
  response.end(html || "Not found");
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({
  executablePath: "C:/Users/BrettHeinlein/AppData/Local/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-win64/chrome-headless-shell.exe",
});
const results = [];
try {
  for (const name of names) for (const viewport of [{ width: 1280, height: 1000 }, { width: 390, height: 844 }]) {
    const telemetry = { consoleErrors: [], pageErrors: [], externalRequests: [], requestFailures: [] };
    const page = await browser.newPage({ viewport });
    page.on("console", message => { if (message.type() === "error") telemetry.consoleErrors.push(message.text()); });
    page.on("pageerror", error => telemetry.pageErrors.push(String(error)));
    page.on("requestfailed", request => telemetry.requestFailures.push(request.url()));
    await page.route("**/*", route => {
      if (new URL(route.request().url()).origin === origin) return route.continue();
      telemetry.externalRequests.push(route.request().url()); return route.abort();
    });
    let baselineWidth, actualWidth;
    try {
      await page.goto(origin + `/coupled-work-order-${name}-print-before-display-fix.html`, { waitUntil: "networkidle" });
      baselineWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      await page.goto(origin + `/coupled-work-order-${name}-print.html`, { waitUntil: "networkidle" });
      assert.equal(await page.locator("script").count(), 0);
      const table = page.locator("table").filter({ has: page.locator("th", { hasText: /^Part$/ }) });
      assert.equal(await table.count(), 1);
      const rows = table.locator("tbody > tr");
      assert.equal(await rows.count(), 10);
      const materialNames = await rows.evaluateAll(list => list.map(row => [...row.cells[0].childNodes]
        .filter(node => node.nodeType === Node.TEXT_NODE).map(node => node.textContent).join("").trim()));
      for (const [key, quantity, rate, extended] of expected) {
        const saved = frozen.get(name).workOrder.materials.find(row => row.part_key === key);
        assert.ok(saved);
        const index = materialNames.indexOf(saved.part_name);
        assert.ok(index >= 0); assert.equal(materialNames.lastIndexOf(saved.part_name), index);
        const cells = rows.nth(index).locator("td");
        assert.equal((await cells.nth(3).innerText()).trim(), quantity, key + " quantity");
        assert.equal((await cells.nth(4).innerText()).trim(), rate, key + " frozen rate");
        assert.equal((await cells.nth(5).innerText()).trim(), extended, key + " frozen amount");
      }
      const notes = table.locator("td > div");
      assert.equal(await notes.count(), 2);
      const text = await table.innerText();
      assert.ok(text.includes("Physical steel (last calculated): 20 ft; 13.36 lb."));
      assert.ok(text.includes("Frozen priced quantity: 1.2 hr."));
      assert.ok(text.includes("Last-calculated labor: 1.2 hr."));
      assert.ok(!text.includes("00000000000000"));
      for (const note of await notes.all()) {
        assert.ok((await note.innerText()).includes("Engineering and purchasing review required."));
        const bounds = await note.evaluate(element => ({
          scroll: element.scrollWidth, client: element.clientWidth,
          right: element.getBoundingClientRect().right, cellRight: element.closest("td").getBoundingClientRect().right,
        }));
        assert.ok(bounds.scroll <= bounds.client + 1); assert.ok(bounds.right <= bounds.cellRight + 1);
      }
      actualWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      assert.ok(actualWidth <= Math.max(viewport.width, baselineWidth) + 1, "No additional print-sheet overflow");
      for (const values of Object.values(telemetry)) assert.deepEqual(values, []);
      const screenshot = DIR + `coupled-work-order-${name}-${viewport.width}.png`;
      await page.screenshot({ path: screenshot, fullPage: true });
      results.push({ name, viewport, ok: true, baselineWidth, actualWidth, screenshot, telemetry });
      console.log("ok", name, viewport.width);
    } catch (error) {
      results.push({ name, viewport, ok: false, error: error.stack, baselineWidth, actualWidth, telemetry });
      console.error("FAIL", name, viewport.width, error.message);
    } finally { await page.close(); }
  }
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
for (const [file, hash] of before) assert.equal(digest(file), hash, "Frozen financial input changed");
fs.writeFileSync(DIR + "coupled-work-order-browser-verification.json", JSON.stringify({
  results, syntheticFrozenHtml: true, financialInputsUnchanged: true, realBrowserPrintDialogVerified: false,
  realStorageVerified: false, backendAuthorizationVerified: false,
}, null, 2) + "\n");
if (results.some(result => !result.ok)) process.exitCode = 1;

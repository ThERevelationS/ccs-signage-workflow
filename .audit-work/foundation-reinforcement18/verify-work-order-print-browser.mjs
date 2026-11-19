import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import { chromium } from "playwright-core";

const DIR = ".audit-work/foundation-reinforcement18/";
const fixtures = JSON.parse(fs.readFileSync(DIR + "work-order-print-frozen-cases.json", "utf8")).fixtures;
const documents = new Map();
for (const fixture of fixtures) {
  for (const file of [fixture.file, fixture.baseline]) documents.set("/" + file, fs.readFileSync(DIR + file, "utf8"));
}
const server = http.createServer((request, response) => {
  if (request.url === "/favicon.ico") { response.writeHead(204); response.end(); return; }
  const html = documents.get(request.url);
  response.writeHead(html ? 200 : 404, { "Content-Type": "text/html; charset=utf-8" });
  response.end(html || "Not found");
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const chrome = "C:/Users/BrettHeinlein/AppData/Local/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-win64/chrome-headless-shell.exe";
const browser = await chromium.launch({ executablePath: chrome });
const results = [];
try {
  for (const fixture of fixtures) {
    for (const viewport of [{ width: 1280, height: 1000 }, { width: 390, height: 844 }]) {
      const telemetry = { consoleErrors: [], pageErrors: [], externalRequests: [], requestFailures: [], requests: [] };
      const page = await browser.newPage({ viewport });
      page.on("console", message => { if (message.type() === "error") telemetry.consoleErrors.push(message.text()); });
      page.on("pageerror", error => telemetry.pageErrors.push(String(error)));
      page.on("requestfailed", request => telemetry.requestFailures.push(request.url()));
      await page.route("**/*", route => {
        const url = route.request().url(); telemetry.requests.push(url);
        if (new URL(url).origin === origin) return route.continue();
        telemetry.externalRequests.push(url); return route.abort();
      });
      let baselineWidth, actualWidth;
      try {
        await page.goto(origin + "/" + fixture.baseline, { waitUntil: "networkidle" });
        baselineWidth = await page.evaluate(() => document.documentElement.scrollWidth);
        await page.goto(origin + "/" + fixture.file, { waitUntil: "networkidle" });
        assert.equal(await page.locator("script").count(), 0, "Frozen shop fixture must not execute app, SDK or print scripts.");
        const table = page.locator("table").filter({
          has: page.locator("th", { hasText: /^Part$/ }),
        });
        assert.equal(await table.count(), 1);
        const rows = table.locator("tbody > tr");
        assert.equal(await rows.count(), fixture.expected.length);
        for (const expected of fixture.expected) {
          const matches = [];
          for (let index = 0; index < await rows.count(); index += 1) {
            if ((await rows.nth(index).locator("td").nth(1).innerText()).trim() === expected.type) matches.push(index);
          }
          assert.equal(matches.length, 1, "Each expected role must have exactly one manifest row.");
          const row = rows.nth(matches[0]), cells = row.locator("td");
          assert.equal((await cells.nth(3).innerText()).trim(), expected.quantity);
          assert.equal((await cells.nth(4).innerText()).trim(), expected.unitCost);
          assert.equal((await cells.nth(5).innerText()).trim(), expected.extended);
          const note = cells.nth(0).locator("div");
          if (!expected.note.length) assert.equal(await note.count(), 0, "Ordinary rows must not get reinforcement annotations.");
          else {
            assert.equal(await note.count(), 1);
            const text = await note.innerText();
            for (const required of expected.note) assert.ok(text.includes(required), required);
            assert.ok(text.includes("Engineering and purchasing review required."));
            assert.ok(!text.includes("$72.00 / hr"));
            const box = await note.evaluate(element => {
              const cell = element.closest("td").getBoundingClientRect(), rect = element.getBoundingClientRect();
              return { scroll: element.scrollWidth, client: element.clientWidth, right: rect.right, cellRight: cell.right };
            });
            assert.ok(box.scroll <= box.client + 1, "Review note must wrap inside its cell.");
            assert.ok(box.right <= box.cellRight + 1, "Review note must not extend beyond its cell.");
          }
        }
        actualWidth = await page.evaluate(() => document.documentElement.scrollWidth);
        // The established print sheet may be wider than a phone. New notes must
        // not introduce additional overflow; do not disguise that as responsive app UI.
        assert.ok(actualWidth <= Math.max(viewport.width, baselineWidth) + 1,
          `New print annotation widens existing sheet: ${actualWidth} > ${baselineWidth}.`);
        assert.deepEqual(telemetry.consoleErrors, []);
        assert.deepEqual(telemetry.pageErrors, []);
        assert.deepEqual(telemetry.externalRequests, []);
        assert.deepEqual(telemetry.requestFailures, []);
        if (fixture.name.startsWith("sandbox-candidate") && fixture.name !== "sandbox-candidate-ordinary") {
          await page.screenshot({ path: DIR + `print-browser-${fixture.name}-${viewport.width}.png`, fullPage: true });
        }
        results.push({ name: fixture.name, viewport, ok: true, baselineWidth, actualWidth, telemetry });
        console.log("ok", fixture.name, viewport.width);
      } catch (error) {
        results.push({ name: fixture.name, viewport, ok: false, error: String(error.stack), baselineWidth, actualWidth, telemetry });
        console.error("FAIL", fixture.name, viewport.width, error.message);
      } finally { await page.close(); }
    }
  }
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
fs.writeFileSync(DIR + "work-order-print-browser-results.json", JSON.stringify({ synthetic: true, staticFrozenHtml: true, results }, null, 2) + "\n");
console.log(`Work Order print browser: ${results.filter(row => row.ok).length}/${results.length}; failed=${results.filter(row => !row.ok).length}`);
process.exitCode = results.some(row => !row.ok) ? 1 : 0;

import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import { chromium } from "playwright-core";

const DIR = ".audit-work/foundation-reinforcement18/";
const fixtures = JSON.parse(fs.readFileSync(DIR + "bom-ui-frozen-cases.json", "utf8")).fixtures;
const documents = new Map(fixtures.map(fixture => ["/" + fixture.file, fs.readFileSync(DIR + fixture.file, "utf8")]));
const css = fs.readFileSync(DIR + "bom-fixture.css", "utf8");
const server = http.createServer((request, response) => {
  if (request.url === "/favicon.ico") { response.writeHead(204); response.end(); return; }
  if (request.url === "/fixture.css") { response.writeHead(200, { "Content-Type": "text/css" }); response.end(css); return; }
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
  for (const fixture of fixtures) {
    for (const viewport of [{ width: 1280, height: 1000 }, { width: 390, height: 844 }]) {
      const page = await browser.newPage({ viewport });
      const telemetry = { consoleErrors: [], pageErrors: [], externalRequests: [], requestFailures: [], requests: [] };
      page.on("console", message => { if (message.type() === "error") telemetry.consoleErrors.push(message.text()); });
      page.on("pageerror", error => telemetry.pageErrors.push(String(error)));
      page.on("requestfailed", request => telemetry.requestFailures.push(request.url()));
      await page.route("**/*", route => {
        const url = route.request().url(); telemetry.requests.push(url);
        if (new URL(url).origin === origin) return route.continue();
        telemetry.externalRequests.push(url); return route.abort();
      });
      try {
        await page.goto(origin + "/" + fixture.file, { waitUntil: "networkidle" });
        assert.equal(await page.locator("script").count(), 0, "SSR fixture must not execute application/SDK scripts.");
        const panel = page.getByRole("heading", { name: "Bill of Materials", exact: true }).locator("..");
        const styling = await panel.evaluate(element => ({
          padding: parseFloat(getComputedStyle(element).paddingTop),
          border: parseFloat(getComputedStyle(element).borderTopWidth),
          headingWeight: Number(getComputedStyle(element.querySelector("h3")).fontWeight),
        }));
        assert.ok(styling.padding > 0 && styling.border > 0 && styling.headingWeight >= 600,
          "The actual BOM padding, border and heading styles must be present before visual acceptance.");
        const table = page.locator("table").filter({ has: page.locator("th", { hasText: /^Material$/ }) });
        assert.equal(await table.count(), 1);
        const rows = table.locator("tbody > tr"); assert.equal(await rows.count(), fixture.expected.length);
        for (const expected of fixture.expected) {
          const hits = [];
          for (let index = 0; index < await rows.count(); index += 1) {
            const label = await rows.nth(index).locator("td").first().evaluate(element => element.firstChild.textContent.trim());
            if (label === expected.name) hits.push(index);
          }
          assert.equal(hits.length, 1, `Exactly one scoped BOM row must match ${expected.name}.`);
          const cells = rows.nth(hits[0]).locator("td");
          assert.equal((await cells.nth(1).innerText()).trim(), expected.quantity);
          assert.equal((await cells.nth(2).innerText()).trim(), expected.cost);
          const note = cells.first().locator("p");
          if (!expected.note.length) assert.equal(await note.count(), 0);
          else {
            assert.equal(await note.count(), 1);
            const text = await note.innerText();
            for (const phrase of expected.note) assert.ok(text.includes(phrase), phrase);
            assert.ok(text.includes("Engineering and purchasing review required."));
            const size = await note.evaluate(element => ({ scroll: element.scrollWidth, client: element.clientWidth }));
            assert.ok(size.scroll <= size.client + 1, "The review note must wrap, not overflow.");
          }
        }
        const subtotal = page.getByText("Listed cost subtotal", { exact: true }).locator("..").locator("span").last();
        assert.equal((await subtotal.innerText()).trim(), fixture.subtotal);
        const warning = page.getByText(/Pricing unavailable.*saved quantities may be outdated/);
        assert.equal(await warning.count(), fixture.pricingUnavailable ? 1 : 0);
        const width = await page.evaluate(() => document.documentElement.scrollWidth);
        assert.ok(width <= viewport.width + 1, `BOM overflows viewport: ${width} > ${viewport.width}.`);
        assert.ok(!(await table.innerText()).includes("NaN")); assert.ok(!(await table.innerText()).includes("Infinity"));
        assert.deepEqual(telemetry.consoleErrors, []); assert.deepEqual(telemetry.pageErrors, []);
        assert.deepEqual(telemetry.externalRequests, []); assert.deepEqual(telemetry.requestFailures, []);
        if (["zero-mixed", "blocked-unrecorded-split", "unknown-basis"].includes(fixture.name)) {
          await page.screenshot({ path: DIR + `bom-browser-${fixture.name}-${viewport.width}.png`, fullPage: true });
        }
        results.push({ name: fixture.name, viewport, ok: true, width, telemetry });
        console.log("ok", fixture.name, viewport.width);
      } catch (error) {
        results.push({ name: fixture.name, viewport, ok: false, error: String(error.stack), telemetry });
        console.error("FAIL", fixture.name, viewport.width, error.message);
      } finally { await page.close(); }
    }
  }
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
fs.writeFileSync(DIR + "bom-browser-verification.json", JSON.stringify({ synthetic: true, staticSSR: true, results }, null, 2) + "\n");
console.log(`Reinforcement BOM browser: ${results.filter(row => row.ok).length}/${results.length}; failed=${results.filter(row => !row.ok).length}`);
process.exitCode = results.some(row => !row.ok) ? 1 : 0;

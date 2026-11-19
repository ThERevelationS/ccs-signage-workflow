import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import { createHash } from "node:crypto";
import { chromium } from "playwright-core";

const DIR = ".audit-work/foundation-reinforcement18/";
const remoteCandidate = process.argv[2] === "candidate";
const prefix = remoteCandidate ? "independent-cost-print" : "cost-print";
const fixtures = ["historical-unknown", "new-accepted-costs"];
const documents = new Map(fixtures.map(name => ["/" + name, fs.readFileSync(DIR + `${prefix}-${name}.html`, "utf8")]));
const inputFile = DIR + "coupled-work-order-saved-page-frozen.json";
const inputHash = () => createHash("sha256").update(fs.readFileSync(inputFile)).digest("hex");
const before = inputHash();
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
const selectedName = process.argv[remoteCandidate ? 3 : 2];
const selectedWidth = Number(process.argv[remoteCandidate ? 4 : 3]) || null;
try {
  for (const name of fixtures) for (const viewport of [{ width: 1280, height: 1000 }, { width: 390, height: 844 }]) {
    if (selectedName && name !== selectedName) continue;
    if (selectedWidth && viewport.width !== selectedWidth) continue;
    const page = await browser.newPage({ viewport });
    const telemetry = { consoleErrors: [], pageErrors: [], externalRequests: [], requestFailures: [] };
    page.on("console", event => { if (event.type() === "error") telemetry.consoleErrors.push(event.text()); });
    page.on("pageerror", error => telemetry.pageErrors.push(String(error)));
    page.on("requestfailed", request => telemetry.requestFailures.push(request.url()));
    await page.route("**/*", route => {
      if (new URL(route.request().url()).origin === origin) return route.continue();
      telemetry.externalRequests.push(route.request().url()); return route.abort();
    });
    let width, screenshot;
    try {
      await page.goto(origin + "/" + name, { waitUntil: "networkidle" });
      assert.equal(await page.locator("script").count(), 0);
      const products = page.locator("table").filter({ has: page.locator("th", { hasText: /^Product \/ Description$/i }) });
      const totals = page.locator("table").filter({ has: page.locator("td", { hasText: /^Products Subtotal$/ }) });
      const materials = page.locator("table").filter({ has: page.locator("th", { hasText: /^Part$/ }) });
      for (const table of [products, totals, materials]) assert.equal(await table.count(), 1);
      const rows = products.locator("tbody > tr");
      assert.equal(await rows.count(), 2);
      for (const [index, expected] of [[0, "$345.00"], [1, "$694.00"]]) {
        const cells = rows.nth(index).locator("td");
        assert.equal((await cells.nth(5).innerText()).trim(), expected, "Selling amount unchanged");
        for (const column of [6, 7]) assert.equal((await cells.nth(column).innerText()).trim(),
          name === "historical-unknown" ? "" : expected, "Unknown cost must remain blank; known cost must be frozen");
        assert.equal((await cells.nth(8).innerText()).trim(), name === "historical-unknown" ? "" : "$0.00");
      }
      if (name === "historical-unknown") {
        assert.equal(await totals.locator("td", { hasText: /^Internal Cost$/ }).count(), 0);
        assert.equal(await totals.locator("td", { hasText: /^Internal Margin/ }).count(), 0);
      } else {
        const cost = totals.locator("tr").filter({ has: page.locator("td", { hasText: /^Internal Cost$/ }) });
        const margin = totals.locator("tr").filter({ has: page.locator("td", { hasText: /^Internal Margin \(0%\)$/ }) });
        assert.equal(await cost.count(), 1); assert.equal(await margin.count(), 1);
        assert.equal((await cost.locator("td").nth(1).innerText()).trim(), "$1,039.00");
        assert.equal((await margin.locator("td").nth(1).innerText()).trim(), "$0.00");
      }
      assert.ok(!(await totals.innerText()).includes("100%"));
      const contract = totals.locator("tr").filter({ has: page.locator("td", { hasText: /^Contract Total \(estimate\)$/ }) });
      assert.equal((await contract.locator("td").nth(1).innerText()).trim(), "$1,039.00");
      const parts = materials.locator("tbody > tr");
      assert.equal(await parts.count(), 10);
      const amounts = await parts.evaluateAll(list => list.map(row => Number(row.cells[5].textContent.trim().replace(/[$,]/g, ""))));
      assert.equal(Math.round(amounts.reduce((sum, value) => sum + value, 0) * 100), 69400);
      const note = await materials.innerText();
      if (remoteCandidate) {
        assert.ok(!note.includes("Frozen priced quantity:"), "Held reinforcement display is not part of this independent unit");
      } else {
        assert.ok(note.includes("Frozen priced quantity: 1.2 hr."));
        assert.ok(note.includes("Physical steel (last calculated): 20 ft; 13.36 lb."));
        assert.ok(note.includes("Engineering and purchasing review required."));
      }
      for (const label of ["Work Order products", "Work Order materials"]) {
        const region = page.getByRole("region", { name: label, exact: true });
        assert.equal(await region.count(), 1);
        assert.equal(await region.getAttribute("tabindex"), "0");
        if (viewport.width === 390) {
          assert.ok(await region.evaluate(element => element.scrollWidth > element.clientWidth));
          await region.focus();
          await page.keyboard.press("ArrowRight");
          await page.waitForFunction(label => document.querySelector(`[aria-label="${label}"]`).scrollLeft > 0, label);
          await region.evaluate(element => { element.scrollLeft = 0; });
        }
      }
      await page.emulateMedia({ media: "print" });
      for (const label of ["Work Order products", "Work Order materials"]) {
        assert.equal(await page.getByRole("region", { name: label, exact: true })
          .evaluate(element => getComputedStyle(element).overflowX), "visible", "Print must not clip horizontal regions");
      }
      await page.emulateMedia({ media: "screen" });
      for (const values of Object.values(telemetry)) assert.deepEqual(values, []);
      width = await page.evaluate(() => document.documentElement.scrollWidth);
      screenshot = DIR + `${prefix}-${name}-${viewport.width}.png`;
      await page.screenshot({ path: screenshot, fullPage: true });
      assert.ok(width <= viewport.width, "Screen tables must not overflow the document");
      results.push({ name, viewport, ok: true, width, telemetry, screenshot });
      console.log("ok", name, viewport.width);
    } catch (error) {
      const overflow = await page.locator("table").evaluateAll(tables => tables.map(table => ({
        headers: [...table.querySelectorAll("th")].map(cell => cell.textContent.trim()),
        width: table.getBoundingClientRect().width, right: table.getBoundingClientRect().right,
        scrollWidth: table.scrollWidth, clientWidth: table.clientWidth,
        rows: [...table.rows].slice(0, 3).map(row => [...row.cells].map(cell => ({
          text: cell.textContent.trim(), width: cell.getBoundingClientRect().width,
        }))),
      })));
      results.push({ name, viewport, ok: false, error: error.stack, telemetry, width, screenshot, overflow });
      console.error("FAIL", name, viewport.width, error.message);
    } finally { await page.close(); }
  }
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
assert.equal(inputHash(), before, "Do not mutate settled financial inputs");
const selectedSuffix = selectedName ? `-selected-${selectedName}-${selectedWidth || "all"}` : "";
fs.writeFileSync(DIR + prefix + "-browser-verification" + selectedSuffix + ".json", JSON.stringify({
  results, financialInputsUnchanged: true, syntheticStaticHtml: true, realBrowserPrintDialogVerified: false,
}, null, 2) + "\n");
if (results.some(result => !result.ok)) process.exitCode = 1;

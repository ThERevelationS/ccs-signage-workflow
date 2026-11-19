import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { build } from "esbuild";
import { chromium } from "playwright-core";

const DIR = ".audit-work/foundation-reinforcement18", ORIGIN = "http://127.0.0.1:5190";
const fixtures = JSON.parse(fs.readFileSync(`${DIR}/pricing-browser-fixtures.json`, "utf8"));
const list = fixtures.fixtures || fixtures;
const css = fs.readFileSync(`${DIR}/pricing-fixture.css`, "utf8");

const throwFn = (name) => `export const ${name} = (...a) => { (window.__unexpectedOps ||= []).push("${name}:" + JSON.stringify(a)); throw new Error("fixture-blocked ${name}"); };`;
const STUBS = {
  "loadAllEntityRows.js": `export async function loadAllEntityRows({ entity } = {}) {
    const kind = entity?.kind || entity?.name || "";
    if (kind === "BuilderPart") return window.__currentPart ? [window.__currentPart] : [];
    if (kind === "BuilderPartGroup") return [];
    (window.__unexpectedOps ||= []).push("loadAllEntityRows:" + kind); throw new Error("fixture-blocked " + kind); }`,
  "base44Client.js": `const blocked = (n) => (...a) => { (window.__unexpectedOps ||= []).push("base44." + n); throw new Error("fixture-blocked base44." + n); };
    export const base44 = { entities: { BuilderPart: { kind: "BuilderPart" }, BuilderPartGroup: { kind: "BuilderPartGroup" } },
      auth: { me: blocked("auth.me") }, functions: { invoke: blocked("invoke") },
      integrations: { Core: { InvokeLLM: blocked("InvokeLLM"), SendEmail: blocked("SendEmail") } },
      asServiceRole: { entities: new Proxy({}, { get: () => ({ filter: blocked("filter"), get: blocked("get"), list: blocked("list") }) }) } };`,
  "staffEntities.js": `export const staffEntities = new Proxy({}, { get: (t, n) => new Proxy({}, { get: (t2, m) => (...a) => { (window.__unexpectedOps ||= []).push("staffEntities." + String(n) + "." + String(m)); throw new Error("fixture-blocked staffEntities"); } }) });`,
  "partSync.js": throwFn("detachBuilderPartOverride") + throwFn("updateDetachedPartOverride"),
  "customProductService.js": throwFn("addCatalogPartToProduct") + throwFn("removeManualProductPart") + throwFn("switchManualProductPart") + throwFn("updateManualProductPart"),
  "partCatalog.js": `export const typeDetails = () => []; export const partCatalog = {};`,
  "clipboardService.js": throwFn("copyPartGroupToClipboard") + throwFn("copyPartToClipboard"),
  "partGroupService.js": throwFn("clonePartGroupInProduct") + throwFn("createPartGroupInProduct") + throwFn("dissolvePartGroup") + throwFn("moveIndependentPartGroup") + throwFn("renamePartGroup"),
  "builderEntityPersistence.js": `export const expectedBuilderEntityFields = () => ({});` + throwFn("replaceBuilderEntityFieldsIfUnchanged"),
  "ImportExportButtons.jsx": `export const CopyBomButton = () => null;`,
  "VendorCostBadge.jsx": `export default function VendorCostBadge() { return null; }`,
};
const NULL_MODALS = ["CreatePartGroupModal.jsx", "BuilderPartEditWarningModal.jsx", "DetachedPartOverrideModal.jsx", "MasterPartPickerModal.jsx", "MovePartGroupModal.jsx", "SavePartTemplateModal.jsx", "PartLibraryPickerModal.jsx"];

const stubPlugin = {
  name: "fixture-stubs",
  setup(b) {
    b.onResolve({ filter: /.*/ }, (args) => {
      if (args.path.startsWith("stub:") || args.path.startsWith("null:")) return null;
      const base = args.path.split(/[\\/]/).pop();
      const key = STUBS[base] ? base : STUBS[base + ".js"] ? base + ".js" : STUBS[base + ".jsx"] ? base + ".jsx" : null;
      if (key) return { path: `stub:${key}`, namespace: "stub" };
      const nullKey = NULL_MODALS.includes(base) ? base : NULL_MODALS.includes(base + ".jsx") ? base + ".jsx" : null;
      if (nullKey) return { path: `null:${nullKey}`, namespace: "nullmod" };
      return null;
    });
    b.onLoad({ filter: /.*/, namespace: "stub" }, (args) => ({ contents: STUBS[args.path.slice(5)], loader: "js" }));
    b.onLoad({ filter: /.*/, namespace: "nullmod" }, () => ({ contents: "export default function NullModal() { return null; }", loader: "jsx" }));
  },
};

const built = await build({
  entryPoints: [`${DIR}/pricing-fixture.jsx`], bundle: true, write: false, outdir: "out",
  platform: "browser", format: "esm", jsx: "automatic",
  alias: { "@": path.resolve("src") }, plugins: [stubPlugin], metafile: true,
});
fs.writeFileSync(`${DIR}/pricing-browser-meta.json`, JSON.stringify(built.metafile, null, 2));
const js = built.outputFiles.find(f => f.path.endsWith(".js")).text;
fs.writeFileSync(`${DIR}/pricing-browser-bundle.js`, js);
const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/app.css"><style>body{margin:8px}</style><script>window.__FIXTURES__=${JSON.stringify(list)};</script></head><body><div id="root"></div><script type="module" src="/bundle.js"></script></body></html>`;
const requests = [], errors = [], results = [];
const server = http.createServer((req, res) => {
  if (req.url === "/bundle.js") { res.setHeader("Content-Type", "text/javascript"); return res.end(js); }
  if (req.url === "/app.css") { res.setHeader("Content-Type", "text/css"); return res.end(css); }
  if (req.url === "/favicon.ico") { res.writeHead(204); return res.end(); }
  if (req.url !== "/") requests.push(req.url);
  res.setHeader("Content-Type", "text/html"); res.end(html);
});
await new Promise(r => server.listen(5190, "127.0.0.1", r));

const CHROME = "C:/Users/BrettHeinlein/AppData/Local/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-win64/chrome-headless-shell.exe";
const browser = await chromium.launch({ executablePath: CHROME });
const resultsJson = [];
let shotCount = 0;
async function check(name, fn) {
  for (const vp of [{ width: 1280, height: 900, tag: "1280" }, { width: 390, height: 844, tag: "390" }]) {
    const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1 });
    const log = { consoleErr: [], requestFailed: [], externalRequests: [], allRequests: [] };
    page.on("console", m => { if (m.type() === "error") log.consoleErr.push(m.text()); });
    page.on("pageerror", e => errors.push(`${name}/${vp.tag} pageerror:${String(e).slice(0, 300)}`));
    page.on("requestfailed", r => { log.requestFailed.push(r.url()); errors.push(`${name}/${vp.tag} requestfailed:${r.url()}`); });
    await page.route("**/*", route => {
      const url = route.request().url();
      log.allRequests.push(url);
      if (new URL(url).origin === ORIGIN) return route.continue();
      log.externalRequests.push(url);
      errors.push(`${name}/${vp.tag} external-blocked:${url}`);
      return route.abort();
    });
    page.on("request", r => { if (!r.url().startsWith(ORIGIN)) errors.push(`${name}/${vp.tag} external:${r.url()}`); });
    try {
      await fn(page, vp, log);
      resultsJson.push({ name, viewport: vp.tag, ok: true, consoleErr: log.consoleErr, requestFailed: log.requestFailed, externalRequests: log.externalRequests, allRequests: log.allRequests, unexpectedOps: log.unexpectedOps || [] });
      console.log(`ok ${name} @${vp.tag}`);
    } catch (e) {
      resultsJson.push({ name, viewport: vp.tag, ok: false, error: String(e).slice(0, 1200), consoleErr: log.consoleErr, requestFailed: log.requestFailed, externalRequests: log.externalRequests, allRequests: log.allRequests, unexpectedOps: log.unexpectedOps || [] });
      console.log(`FAIL ${name} @${vp.tag} ${e.message}`);
    }
    await page.close();
  }
}

const rowBtn = (p) => p.locator("button[aria-expanded]").first();
for (const fx of list) {
  await check(fx.name, async (p, vp, log) => {
    await p.goto(ORIGIN, { waitUntil: "networkidle" });
    await p.selectOption("[data-testid=fixture-select]", fx.name);
    await p.waitForSelector("button[aria-expanded]", { timeout: 10000 });
    const btn = rowBtn(p);
    assert.equal(await btn.getAttribute("aria-expanded"), "false");
    await btn.click();
    await p.waitForFunction(() => document.querySelector("button[aria-expanded]")?.getAttribute("aria-expanded") === "true");
    const txt = await p.locator("body").innerText();
    if (fx.ordinary) {
      assert.ok(!txt.includes("REINFORCEMENT PRICING"), "ordinary part must not render reinforcement card");
      const pricing = p.locator("section", { has: p.locator('div:text-is("PRICING INFORMATION")') }).first();
      assert.ok(await pricing.count() > 0, "PRICING INFORMATION section");
      for (const [dtText, ddText] of [["Frozen unit cost", "$2.00"], ["Frozen extended", "$40.00"], ["Current unit cost", "$2.00"], ["Current extended", "$40.00"]]) {
        const row = pricing.locator("div", { has: p.locator(`dt:text-is("${dtText}")`) }).first();
        assert.ok(await row.count() > 0, `missing dt row "${dtText}"`);
        assert.equal((await row.locator("dd").first().innerText()).trim(), ddText, `dd for "${dtText}"`);
      }
      const info = p.locator("section", { has: p.locator('div:text-is("PART INFORMATION")') }).first();
      const qtyRow = info.locator("div", { has: p.locator('dt:text-is("Quantity")') }).first();
      assert.equal((await qtyRow.locator("dd").first().innerText()).trim(), "20 ft", "PART INFORMATION Quantity");
      assert.ok(!txt.includes("FROZEN INVENTORY DETAILS"), "ordinary keeps TYPE-SPECIFIC DETAILS");
    } else {
      await p.waitForFunction(() => document.body.innerText.includes("REINFORCEMENT PRICING"));
      const card = p.locator("section", { hasText: "REINFORCEMENT PRICING" });
      const cardTxt = await card.innerText();
      for (const [dtText, ddText] of Object.entries(fx.expected || {})) {
        const row = card.locator("div", { has: p.locator(`dt:text-is("${dtText}")`) }).first();
        assert.ok(await row.count() > 0, `missing dt row "${dtText}"`);
        const dd = row.locator("dd").first();
        assert.equal((await dd.innerText()).trim(), ddText, `dd for "${dtText}"`);
      }
      if (fx.status) { const dom = await p.locator("body").textContent(); assert.ok(dom.includes(fx.status), `missing status "${fx.status}"`); }
      assert.ok(txt.includes("FROZEN INVENTORY DETAILS"), "frozen inventory heading");
      assert.ok(cardTxt.includes("engineering and purchasing review required"), "review note");
      if (fx.name.includes("legacy") || fx.name.includes("labor")) assert.ok(!cardTxt.includes("$72.00 / hr"), "no invented 72/hr");
      if (fx.name === "zero") { assert.ok(cardTxt.includes("0 ft"), "priced 0 ft"); assert.ok(cardTxt.includes("20 ft"), "physical 20 ft"); }
      if (fx.name === "removal") { assert.ok(!cardTxt.includes("Physical steel"), "no physical row"); assert.ok(!txt.includes("Catalog basis is unverified"), "no unverified warn"); assert.ok(cardTxt.includes("$0.00"), "after removal 0"); }
      // large JSON numeric overflow check
      if (fx.name === "large") {
        const dds = card.locator("dd");
        const n = await dds.count();
        const cardBox = await card.boundingBox();
        for (let i = 0; i < n; i += 1) {
          const dd = dds.nth(i);
          const m = await dd.evaluate(el => ({ sw: el.scrollWidth, cw: el.clientWidth }));
          assert.ok(m.sw <= m.cw + 1, `dd ${i} overflows ${m.sw}>${m.cw}`);
          const bb = await dd.boundingBox();
          assert.ok(bb.x + bb.width <= cardBox.x + cardBox.width + 1, `dd ${i} right edge outside card`);
        }
      }
    }
    const sw = await p.evaluate(() => document.documentElement.scrollWidth);
    assert.ok(sw <= vp.width + 1, `horizontal overflow ${sw}>${vp.width}`);
    const ops = await p.evaluate(() => window.__unexpectedOps || []);
    log.unexpectedOps = ops;
    assert.deepEqual(ops, [], `unexpected ops: ${JSON.stringify(ops)}`);
    assert.deepEqual(log.consoleErr.filter(t => !/favicon|DevTools/.test(t)), [], `console errors: ${log.consoleErr.join("|")}`);
    if ((fx.name === "changed" && vp.width === 1280) || (fx.name === "legacy-labor" && vp.width === 390) || (fx.name === "zero" && vp.width === 390) || (fx.name === "large" && vp.width === 1280)) {
      shotCount += 1;
      await p.screenshot({ path: `${DIR}/pricing-browser-${fx.name}-${vp.tag}.png`, fullPage: true });
    }
  });
}
await browser.close();
server.close();
fs.writeFileSync(`${DIR}/pricing-browser-results.json`, JSON.stringify({ results: resultsJson, errors, requests, shots: shotCount }, null, 2));
const failed = resultsJson.filter(r => !r.ok).length;
console.log(`Pricing browser: ${resultsJson.length - failed}/${resultsJson.length}; failed=${failed}; errors=${errors.length}; shots=${shotCount}`);
process.exit(failed || errors.length ? 1 : 0);

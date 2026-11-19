// O-093 real-component verification: bundle the candidate panels with real
// calc modules (React automatic runtime, stubbed ui/button·input·lucide),
// serve them, drive a real Chromium with playwright-core, and assert DOM +
// commit behavior. Runs from .audit-work/foundation-o093-labels/.
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import fs from "node:fs";
import http from "node:http";
import assert from "node:assert/strict";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "..", "..");
const fx = path.join(here, "fixture-browser");
const outDir = path.join(here, "verify", "fixture-out");
fs.mkdirSync(outDir, { recursive: true });

// ---- bundle ---------------------------------------------------------------
const esbuild = await import(pathToFileURL(path.join(repo, "node_modules", "esbuild", "lib", "main.js")).href);
await esbuild.build({
  entryPoints: [path.join(fx, "src", "harness.jsx")],
  bundle: true,
  format: "iife",
  jsx: "automatic",
  outfile: path.join(outDir, "harness.js"),
  alias: {
    "lucide-react": path.join(fx, "src", "stubs", "lucide-react.jsx"),
    "@/components/ui/input": path.join(fx, "src", "components", "ui", "input.jsx"),
    "@/components/ui/button": path.join(fx, "src", "components", "ui", "button.jsx"),
    "@/components/masterInventory/inventoryNormalization": path.join(
      fx, "src", "components", "masterInventory", "inventoryNormalization.js"),
  },
  loader: { ".js": "jsx", ".jsx": "jsx" },
  logLevel: "silent",
});

fs.writeFileSync(
  path.join(outDir, "index.html"),
  `<!doctype html><meta charset="utf-8"><div id="root"></div><script src="harness.js"></script>`
);

// ---- static server --------------------------------------------------------
const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  const file = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
  const p = path.join(outDir, file);
  if (!p.startsWith(outDir) || !fs.existsSync(p)) {
    res.writeHead(404); res.end("nf"); return;
  }
  res.writeHead(200, { "content-type": file.endsWith(".js") ? "text/javascript" : "text/html" });
  res.end(fs.readFileSync(p));
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;

// ---- playwright ------------------------------------------------------------
const pw = await import(pathToFileURL(path.join(repo, "node_modules", "playwright-core", "index.mjs")).href);
let browser, channelUsed;
for (const channel of ["chrome", "msedge"]) {
  try {
    browser = await pw.chromium.launch({ channel, headless: true });
    channelUsed = channel;
    break;
  } catch { /* try next */ }
}
if (!browser) browser = await pw.chromium.launch({ headless: true });

let passed = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); passed++; };
const results = [];
const check = (name, fn) => fn().then(
  () => { results.push(`PASS ${name}`); },
  (e) => { results.push(`FAIL ${name}: ${e.message}`); }
);

const page = await browser.newPage();
const mount = async (name) => {
  await page.goto(`${base}/?case=${name}`);
  await page.waitForFunction(() => window.__harnessReady === true);
  await page.evaluate(() => { window.__commits = []; });
};
const commits = () => page.evaluate(() => window.__commits);
const lastCommit = async (tag) => (await commits()).filter((c) => c.tag === tag).at(-1)?.value;
const inputByLabel = (label) => page.locator(`input[aria-label="${label}"]`);

// 1 — Poles panel: labels/help/placeholder + ft/in commit + malformed verbatim
await check("poles", async () => {
  await mount("poles");
  const height = inputByLabel("Pole 1 height above grade (inches)");
  ok(await height.count() === 1, "height input renders");
  // plain-language label text visible next to the field
  ok(await page.getByText("Height above grade (in)").count() >= 1, "plain-language label renders");
  ok(await height.inputValue() === "10'", `stored 120in displays 10', got ${await height.inputValue()}`);
  ok((await height.getAttribute("placeholder")) === `10' 0"`, "placeholder suggests ft/in format");
  ok(((await height.getAttribute("title")) || "").includes("finished grade"), "title carries contextual help");
  await height.click();
  await height.fill(`12' 6"`);
  ok((await lastCommit("poles"))?.[0]?.height_inches === 150, `12' 6" commits 150, got ${JSON.stringify((await lastCommit("poles"))?.[0])}`);
  await height.fill("abc");
  ok((await lastCommit("poles"))?.[0]?.height_inches === "abc", "malformed stores verbatim");
  ok(await page.getByText(/Not a recognized measurement/).count() >= 1, "inline syntax hint renders");
  ok(await height.getAttribute("aria-invalid") === "true", "aria-invalid set on malformed draft");
  // real calc issue surfaces in the pricing status row
  ok((await page.locator("#pole-0-pricing").count()) === 1, "real pole calc issues render");
  await height.blur();
  ok(await height.inputValue() === "abc", "verbatim draft echoes after blur (never snapped to 0)");
});

// 2 — legacy y_offset_inches → canonical embedment on edit
await check("embed-legacy", async () => {
  await mount("embed-legacy");
  const emb = inputByLabel("Pole 1 embedment below grade (inches)");
  ok(await emb.inputValue() === "3'", `legacy 36in displays 3', got ${await emb.inputValue()}`);
  await emb.fill(`3' 6"`);
  const last = (await lastCommit("poles"))?.[0];
  ok(last?.embedment_inches === 42 && last?.y_offset_inches === undefined,
    `3' 6" commits canonical embedment 42 and clears legacy spelling, got ${JSON.stringify(last)}`);
});

// 3 — Walls panel
await check("walls", async () => {
  await mount("walls");
  const height = inputByLabel("Wall height (in)");
  ok(await height.inputValue() === "2'", `stored 24in displays 2', got ${await height.inputValue()}`);
  const mortar = inputByLabel("Wall mortar gap (in)");
  ok(await mortar.inputValue() === `0.375"`, `mortar fallback displays 0.375", got ${await mortar.inputValue()}`);
  await height.fill(`3'`);
  ok((await lastCommit("walls"))?.[0]?.heightInches === 36, `3' commits 36`);
});

// 4 — Wall caps panel
await check("caps", async () => {
  await mount("caps");
  const dim = inputByLabel("Cap 1 cut length (inches)");
  ok(await dim.count() === 1, "cut-length dimension input renders");
  ok(await dim.inputValue() === "4'", `stored 48in displays 4', got ${await dim.inputValue()}`);
  await dim.fill("abc");
  ok((await lastCommit("caps"))?.[0]?.length_inches === "abc", "malformed stores verbatim");
  ok(await page.getByText(/Not a recognized measurement/).count() >= 1, "inline hint renders");
  ok(await dim.getAttribute("aria-invalid") === "true", "aria-invalid set");
});

// 5 — Signage cabinets panel
await check("cabinets", async () => {
  await mount("cabinets");
  const width = inputByLabel("Width (in)");
  ok(await width.count() === 1, "width input renders");
  ok(await width.inputValue() === "4'", `stored 48in displays 4'`);
  await width.fill(`2'-6"`);
  ok((await lastCommit("cabinets"))?.[0]?.width_inches === 30, `2'-6" commits 30`);
});

// 6 — Wall shape editor: rect dims → real foundationWallRectangle geometry
await check("shape", async () => {
  await mount("shape");
  const rectL = inputByLabel("Rectangle outline length (inches)");
  const rectW = inputByLabel("Rectangle outline width (inches)");
  await rectL.fill(`8'`);
  await rectW.fill(`4'`);
  await page.getByRole("button", { name: /Use rectangle/ }).click();
  const shape = await lastCommit("shape");
  const lengths = (shape?.segments || []).map((s) => s.length).sort((a, b) => a - b);
  ok(JSON.stringify(lengths) === JSON.stringify([48, 48, 96, 96]),
    `8'×4' rectangle emits 96/48 segments, got ${JSON.stringify(lengths)}`);
  await rectL.fill("abc");
  ok(await page.getByRole("button", { name: /Use rectangle/ }).isDisabled(), "malformed disables Apply");
  ok(await page.getByText(/Not a recognized measurement/).count() >= 1, "rect syntax hint renders");
});

// 7 — Landscape designer cell size
await check("landscape", async () => {
  await mount("landscape");
  const cell = page.locator("input[data-landscape-field='cell_size_inches']");
  ok(await cell.inputValue() === "1'", `stored 12in displays 1', got ${await cell.inputValue()}`);
  await cell.click();
  await cell.fill(`1' 6"`);
  ok((await lastCommit("landscape"))?.cell_size_inches === 18, `1' 6" commits 18`);
  await cell.fill("abc");
  ok((await lastCommit("landscape"))?.cell_size_inches === "abc", "malformed stores verbatim");
  ok(await cell.getAttribute("aria-invalid") === "true", "aria-invalid on landscape field");
});

// 8 — bare field: required acceptance forms commit through the panel seam
await check("field-matrix", async () => {
  await mount("field");
  const input = inputByLabel("Bare dimension field");
  const forms = [
    [`12' 6"`, 150], [`12'-6"`, 150], [`12.5'`, 150],
    [`150"`, 150], [`12 6`, 150], [`12'6`, 150],
  ];
  for (const [text, expected] of forms) {
    await input.fill(text);
    const v = await lastCommit("field");
    ok(v === expected, `form ${JSON.stringify(text)} commits ${expected}, got ${v}`);
  }
  await input.fill("abc");
  ok((await lastCommit("field")) === "abc", `malformed commits verbatim`);
  ok(await input.getAttribute("aria-invalid") === "true", "aria-invalid on malformed");
});

// screenshots for the evidence pack
await mount("poles");
await page.setViewportSize({ width: 1280, height: 900 });
await page.screenshot({ path: path.join(outDir, "shot-poles-1280.png"), fullPage: true });
await page.setViewportSize({ width: 390, height: 844 });
await page.screenshot({ path: path.join(outDir, "shot-poles-390.png"), fullPage: true });
await mount("walls");
await page.setViewportSize({ width: 1280, height: 900 });
await page.screenshot({ path: path.join(outDir, "shot-walls-1280.png"), fullPage: true });
await mount("shape");
await page.screenshot({ path: path.join(outDir, "shot-shape-1280.png"), fullPage: true });
await mount("landscape");
await page.screenshot({ path: path.join(outDir, "shot-landscape-1280.png"), fullPage: true });

await browser.close();
server.close();
console.log(`channel=${channelUsed || "bundled"} assertions=${passed}`);
results.forEach((r) => console.log(r));
const failed = results.filter((r) => r.startsWith("FAIL"));
console.log(failed.length ? `FAIL o093-browser (${failed.length})` : "PASS o093-browser");
process.exit(failed.length ? 1 : 0);

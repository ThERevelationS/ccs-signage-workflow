import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { build } from "esbuild";
import { chromium } from "playwright-core";

const DIR = ".audit-work/foundation-reinforcement18";
const PORT = Number(process.env.FOUNDATION_UI_PORT ?? 5172);
assert.ok(Number.isSafeInteger(PORT) && PORT > 0 && PORT <= 65535, "Use a valid isolated local fixture port.");
const ORIGIN = `http://127.0.0.1:${PORT}`;
const keep = process.argv.includes("--keep-server");
const reuse = process.argv.includes("--existing-server");
const css = fs.readFileSync(`${DIR}/ui-fixture.css`, "utf8");
assert.ok(/\.p-3\{/.test(css), "Compile the main proposal panel utilities too; p-3 is missing.");
const built = await build({ entryPoints: [`${DIR}/ui-lead-fixture.jsx`], bundle: true, write: false, outdir: "out",
  platform: "browser", format: "esm", jsx: "automatic", alias: { "@": path.resolve("src") }, metafile: true });
fs.writeFileSync(`${DIR}/ui-lead-meta.json`, JSON.stringify(built.metafile, null, 2));
const js = built.outputFiles.find(f => f.path.endsWith(".js")).text;
const html = '<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/app.css"><style>body{margin:8px}</style></head><body><div id="root"></div><script type="module" src="/bundle.js"></script></body></html>';
const requests = [], errors = [], results = [];
const server = http.createServer((req, res) => {
  if (req.url === "/bundle.js") { res.setHeader("Content-Type", "text/javascript"); return res.end(js); }
  if (req.url === "/app.css") { res.setHeader("Content-Type", "text/css"); return res.end(css); }
  if (req.url === "/favicon.ico") { res.writeHead(204); return res.end(); }
  if (req.url !== "/") requests.push(req.url);
  res.setHeader("Content-Type", "text/html"); res.end(html);
});
if (reuse) {
  assert.equal(await (await fetch(`${ORIGIN}/bundle.js`)).text(), js, "Existing fixture must serve the exact freshly compiled component bundle.");
  assert.equal(await (await fetch(`${ORIGIN}/app.css`)).text(), css, "Existing fixture must serve the exact current compiled stylesheet.");
} else await new Promise(resolve => server.listen(PORT, "127.0.0.1", resolve));
const browser = await chromium.launch({ channel: "chrome", headless: true });
async function check(name, run, width = 1280) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 } }), p = await ctx.newPage();
  p.setDefaultTimeout(8000);
  p.on("pageerror", e => errors.push({ name, error: String(e) }));
  p.on("console", m => { if (m.type() === "error") errors.push({ name, error: m.text() }); });
  await p.route("**/*", route => {
    const u = new URL(route.request().url());
    if (u.origin === ORIGIN && ["/", "/bundle.js", "/app.css", "/favicon.ico"].includes(u.pathname)) return route.continue();
    requests.push(u.href); return route.abort();
  });
  try {
    await p.goto(ORIGIN); await p.getByText("Reinforcement proposal", { exact: true }).waitFor();
    await run(p);
    assert.equal(await p.evaluate(() => window.__held.every(h => JSON.stringify(h.value) === h.before)), true, "Actual browser-held props unchanged");
    results.push({ name, ok: true });
  } catch (e) { results.push({ name, ok: false, error: e.stack }); }
  finally { await ctx.close(); }
  console.log(results.at(-1).ok ? "ok" : "FAIL", name);
}
async function seed(p, edit) {
  await p.evaluate(edit ?? (() => window.__adopt(window.__blank())));
  await p.waitForFunction(() => !!window.__draft);
}
const field = (p, text) => p.getByLabel(text, { exact: true });
const draft = p => p.evaluate(() => window.__draft);
const calls = p => p.evaluate(() => window.__calls);
const mat = (id, value = "") => ({ id, bearing_elevation_inches: value, max_spacing_x_inches: "", max_spacing_z_inches: "" });
const PRELIMINARY = "I understand this is preliminary only, not engineering approval.";
const WARNING = "Acknowledge warning: Engineering review remains separate; this preview is not approval.";
async function ackSeed(p, initial = { preliminary: false, warningCodes: [] }) {
  await seed(p);
  await p.evaluate(value => {
    window.__ackFresh = () => ({ ...window.__preview(), warningCodes: ["engineering_review"] });
    window.__setPreview(window.__ackFresh());
    const set = next => {
      const immutable = Object.freeze({ preliminary: next.preliminary, warningCodes: Object.freeze([...next.warningCodes]) });
      window.__held.push({ value: immutable, before: JSON.stringify(immutable) });
      window.__acks = immutable;
      window.__setFlags({ acknowledgments: immutable, onAcknowledgmentsChange: update => {
        window.__calls.push(["ack", structuredClone(update)]);
        set(update);
        window.__setPreview(previous => ({ ...previous, stale: true }));
      } });
    };
    window.__setAcks = set;
    set(value);
  }, initial);
  await field(p, PRELIMINARY).waitFor();
}
const acceptReady = (p, ready) => p.waitForFunction(expected =>
  [...document.querySelectorAll("button")].find(button => button.textContent.trim() === "Accept Proposal")?.disabled === !expected, ready);
try {
  await check("browser-deep-frozen mount, unchanged refs, four Unknown metadata fields", async p => {
    await seed(p, () => { const d = window.__blank(); d.material = { kind: "catalog", inventory_id: "missing-meta" }; window.__adopt(d); });
    assert.deepEqual(await p.evaluate(() => [Object.isFrozen(window.__draft), Object.isFrozen(window.__draft.design.cover_inches), Object.isFrozen(window.__item)]), [true, true, true]);
    assert.equal((await calls(p)).length, 0);
    assert.match(await p.locator("body").innerText(), /diameter Unknown - weight Unknown - Unknown\/Unknown/);
  });
  await check("raw invalid edit changes only side, browser original remains frozen/unchanged", async p => {
    await seed(p); await field(p, "Cover side (in)").fill("-oops");
    assert.deepEqual((await draft(p)).design.cover_inches, { side: "-oops", top: "", bottom: "" });
    assert.equal(await p.evaluate(() => window.__held.filter(h => h.value?.schema_version).at(-2).value.design.cover_inches.side), "");
  });
  await check("two real UUID adds, all mat numerics blank, delete and controlled restore", async p => {
    await seed(p); await p.locator('[data-add="mats"]').click(); await p.locator('[data-add="mats"]').click();
    const before = await draft(p), rows = before.design.spread.mats;
    assert.equal(new Set(rows.map(r => r.id)).size, 2);
    for (const row of rows) { assert.match(row.id, /^mat_[a-f0-9-]{36}$/); assert.deepEqual([row.bearing_elevation_inches, row.max_spacing_x_inches, row.max_spacing_z_inches], ["", "", ""]); }
    await p.locator('[data-del="mats:0"]').click(); assert.deepEqual((await draft(p)).design.spread.mats, [rows[1]]);
    before.design.spread.mats[0].bearing_elevation_inches = "9";
    await p.evaluate(d => window.__adopt(d), before);
    await p.waitForFunction(() => document.querySelector('[data-list="mats"] input')?.value === "9");
    assert.equal(await p.locator('[data-list="mats"] input').first().inputValue(), "9");
  });
  await check("material round-trip preserves every raw field and unavailable ID", async p => {
    await seed(p, () => { const d = window.__blank(); d.material = { kind: "catalog", inventory_id: "gone", name: "Name", reason: "Reason", unit: "ft", bar_diameter_inches: "-oops", weight_lb_per_ft: "0", cost_per_ft: "0" }; window.__adopt(d); });
    const before = (await draft(p)).material;
    await p.getByRole("button", { name: "Manual", exact: true }).click();
    assert.deepEqual((await draft(p)).material, { ...before, kind: "manual" });
    await p.getByRole("button", { name: "Catalog", exact: true }).click();
    assert.deepEqual((await draft(p)).material, before);
    assert.equal(await field(p, "Rebar item").inputValue(), "gone");
    assert.match(await field(p, "Rebar item").innerText(), /Unavailable: gone/);
  });
  await check("both overrides preserve string0 then clear to null; actual item untouched", async p => {
    await seed(p);
    for (const [label, key] of [["Quantity override (ft)", "quantity_ft"], ["Cost override ($/ft)", "cost_per_ft"]]) {
      await field(p, label).fill("0"); assert.equal((await draft(p)).overrides[key], "0");
      await field(p, label).fill(""); assert.equal((await draft(p)).overrides[key], null);
    }
    assert.deepEqual(await p.evaluate(() => [window.__item.custom_rebar_qty, window.__item.custom_rebar_cost_per_ft]), [0, 0]);
  });
  await check("acceptance blocks stale/false/missing/invalid IDs and every disable flag", async p => {
    await seed(p); const button = p.getByRole("button", { name: "Accept Proposal" });
    for (const patch of [{ stale: true }, { canAccept: false }, { id: null }, { id: 123 }, { id: "" }, { id: "  " }]) {
      await p.evaluate(x => window.__setPreview({ ...window.__preview(), ...x }), patch); assert.equal(await button.isDisabled(), true);
    }
    for (const flags of [{ busy: true }, { disabled: true }]) {
      await p.evaluate(x => { window.__setFlags(x); window.__setPreview(window.__preview()); }, flags);
      assert.equal(await button.isDisabled(), true); assert.equal(await field(p, "Bar diameter (in)").isDisabled(), true);
    }
    await p.evaluate(() => window.__setFlags({})); await button.click();
    assert.deepEqual((await calls(p)).filter(c => c[0] === "accept"), [["accept", "preview-exact"]]);
  });
  await check("strict versions disable unsupported controls, including proto-like strings", async p => {
    await seed(p);
    for (const value of ["2", "__proto__", 3]) {
      await p.evaluate(v => { window.__setVersion(v); window.__setPreview(window.__preview()); }, value);
      assert.equal(await p.getByRole("button", { name: "Accept Proposal" }).isDisabled(), true);
      assert.equal(await field(p, "Bar diameter (in)").isDisabled(), true);
      assert.match(await p.locator("body").innerText(), /Unsupported/);
    }
    for (const value of [null, 1, 2]) {
      await p.evaluate(v => window.__setVersion(v), value);
      assert.equal(await p.getByRole("button", { name: "Accept Proposal" }).isDisabled(), false);
    }
  });
  await check("parent deletion preserves exact ties and displays newly orphaned reference", async p => {
    await seed(p, () => { const d = window.__blank(); d.design.spread.mats = [{ id: "parent", bearing_elevation_inches: "", max_spacing_x_inches: "", max_spacing_z_inches: "" }]; d.design.spread.inter_mat_ties = [{ id: "tie", from_mat_id: "parent", to_mat_id: "missing", x_inches: "1", z_inches: "2", cut_length_inches: "3" }]; window.__adopt(d); });
    const ties = (await draft(p)).design.spread.inter_mat_ties;
    await p.locator('[data-del="mats:0"]').click(); assert.deepEqual((await draft(p)).design.spread.inter_mat_ties, ties);
    const selects = p.locator('[data-list="ties"] select');
    assert.equal(await selects.nth(0).inputValue(), "parent"); assert.match(await selects.nth(0).innerText(), /Missing: parent/);
    assert.equal(await selects.nth(1).inputValue(), "missing");
  });
  await check("hoops start entirely blank, authored allowance0 survives type round-trip", async p => {
    await seed(p); await p.evaluate(() => window.__setType("pillar"));
    const spread = (await draft(p)).design.spread;
    await p.locator('[data-add="hoops"]').click();
    let row = (await draft(p)).design.pillar.hoops[0];
    assert.deepEqual([row.center_y_inches, row.centerline_diameter_inches, row.cut_allowance_inches], ["", "", ""]);
    await field(p, "Cut allowance (in)").fill("0"); await field(p, "Longitudinal count").fill("4");
    row = (await draft(p)).design.pillar.hoops[0]; assert.equal(row.cut_allowance_inches, "0");
    await p.evaluate(() => window.__setType("spread_foot")); assert.deepEqual((await draft(p)).design.spread, spread);
    await p.evaluate(() => window.__setType("pillar")); assert.equal(await field(p, "Cut allowance (in)").inputValue(), "0");
  });
  await check("21-row pagination changes exactly one row, no pagination callbacks", async p => {
    await seed(p, () => { const d = window.__blank(); d.design.spread.mats = Array.from({ length: 21 }, (_, i) => ({ id: "m" + i, bearing_elevation_inches: String(i), max_spacing_x_inches: "", max_spacing_z_inches: "" })); window.__adopt(d); });
    const before = await draft(p); await p.locator('[data-page="next"]').click(); assert.equal((await calls(p)).length, 0);
    await p.locator('[data-list="mats"] input').first().fill("999");
    before.design.spread.mats[20].bearing_elevation_inches = "999"; assert.deepEqual(await draft(p), before);
  });
  await check("page7 shrink to21 rows then Prev once reaches page1 without edits", async p => {
    await seed(p, () => { const d = window.__blank(); d.design.spread.mats = Array.from({ length: 141 }, (_, i) => ({ id: "m" + i, bearing_elevation_inches: String(i), max_spacing_x_inches: "", max_spacing_z_inches: "" })); window.__adopt(d); });
    for (let i = 0; i < 6; i++) await p.locator('[data-page="next"]').click();
    await p.evaluate(() => { const d = structuredClone(window.__draft); d.design.spread.mats = d.design.spread.mats.slice(0, 21); window.__adopt(d); });
    await p.locator('[data-page="prev"]').click();
    assert.equal(await p.locator('[data-list="mats"] input').first().inputValue(), "0"); assert.equal((await calls(p)).length, 0);
  });
  await check("malformed mats + valid ties require explicit repair, not data loss", async p => {
    await seed(p, () => { const d = window.__blank(); d.design.spread.mats = "bad"; d.design.spread.inter_mat_ties = [{ id: "t", from_mat_id: "x", to_mat_id: "y" }]; window.__adopt(d); });
    const ties = (await draft(p)).design.spread.inter_mat_ties; assert.equal((await calls(p)).length, 0);
    await p.locator('[data-list="mats"]').getByRole("button", { name: "Replace List" }).click();
    assert.deepEqual((await draft(p)).design.spread.mats, []); assert.deepEqual((await draft(p)).design.spread.inter_mat_ties, ties);
  });
  await check("malformed defined hoops require repair; null row deletes without touching valid row", async p => {
    await seed(p, () => { const d = window.__blank(); d.design.pillar.hoops = "bad"; window.__adopt(d); window.__setType("pillar"); });
    await p.locator('[data-list="hoops"]').getByRole("button", { name: "Replace List" }).click();
    assert.deepEqual((await draft(p)).design.pillar.hoops, []);
    await p.evaluate(() => { const d = structuredClone(window.__draft); d.design.pillar.hoops = [null, { id: "kept", center_y_inches: "9" }]; window.__adopt(d); });
    await p.locator('[data-del="hoops:0"]').click(); assert.deepEqual((await draft(p)).design.pillar.hoops, [{ id: "kept", center_y_inches: "9" }]);
  });
  await check("257ties still allow Add;4096ties and256mats cap without truncation", async p => {
    await seed(p, () => { const d = window.__blank(); d.design.spread.inter_mat_ties = Array.from({ length: 257 }, (_, i) => ({ id: "t" + i, from_mat_id: "", to_mat_id: "" })); window.__adopt(d); });
    assert.equal(await p.locator('[data-add="ties"]').isDisabled(), false);
    await p.evaluate(() => { const d = structuredClone(window.__draft); d.design.spread.inter_mat_ties = Array.from({ length: 4096 }, (_, i) => ({ id: "t" + i })); d.design.spread.mats = Array.from({ length: 256 }, (_, i) => ({ id: "m" + i })); window.__adopt(d); });
    assert.equal(await p.locator('[data-add="ties"]').isDisabled(), true); assert.equal(await p.locator('[data-add="mats"]').isDisabled(), true);
    assert.equal((await draft(p)).design.spread.inter_mat_ties.length, 4096); assert.equal((await calls(p)).length, 0);
  });
  await check("absent secure UUID disables Add without callbacks", async p => {
    await p.evaluate(() => { Object.defineProperty(globalThis, "crypto", { value: {}, configurable: true }); window.__adopt(window.__blank()); });
    assert.equal(await p.locator('[data-add="mats"]').isDisabled(), true); assert.match(await p.locator("body").innerText(), /Secure row IDs unavailable/);
    assert.equal((await calls(p)).length, 0);
  });
  await check("object/array JSON reference values render repairable errors without crashing", async p => {
    await seed(p, () => { const d = window.__blank(); d.design.supports.mode = { bad: true }; d.design.spread.mats = [{ id: { bad: true } }]; d.design.spread.inter_mat_ties = [{ id: "t", from_mat_id: { bad: true }, to_mat_id: ["bad"] }]; d.material = { kind: "catalog", inventory_id: { bad: true } }; window.__adopt(d); window.__setCatalog([null, { id: "good", material_name: { bad: true } }]); });
    assert.equal((await calls(p)).length, 0); assert.match(await p.locator("body").innerText(), /invalid|malformed/i);
    await p.locator('[data-del="mats:0"]').click(); assert.deepEqual((await draft(p)).design.spread.mats, []);
  });
  await check("failed catalog read is visible without substituting metadata or changing the draft", async p => {
    await seed(p, () => { const d = window.__blank(); d.material = { kind: "catalog", inventory_id: "gone" }; window.__adopt(d); window.__setCatalog(null); });
    assert.match(await p.locator("body").innerText(), /Catalog could not be read/);
    assert.equal(await field(p, "Rebar item").inputValue(), "gone"); assert.equal((await calls(p)).length, 0);
  });
  await check("duplicate row and catalog IDs stay visible without duplicate React keys", async p => {
    await seed(p, () => {
      const d = window.__blank(); d.design.spread.mats = [{ id: "duplicate", bearing_elevation_inches: 32 }, { id: "duplicate", bearing_elevation_inches: 31 }];
      d.design.spread.inter_mat_ties = [{ id: "t", from_mat_id: "duplicate", to_mat_id: "duplicate" }];
      d.material = { kind: "catalog", inventory_id: "duplicate-catalog" }; window.__adopt(d);
      window.__setCatalog([{ id: "duplicate-catalog", material_name: "One" }, { id: "duplicate-catalog", material_name: "Two" }]);
    });
    assert.equal(await p.locator('[data-list="mats"] [data-row]').count(), 2);
    assert.match(await p.locator("body").innerText(), /Duplicate inventory ID/);
    assert.equal((await calls(p)).length, 0);
  });
  await check("malformed cover and active design subtrees require explicit replacement", async p => {
    for (const key of ["cover_inches", "supports", "spread", "pillar", "longitudinal"]) {
      await p.evaluate(k => {
        const d = window.__blank(); if (k === "longitudinal") d.design.pillar.longitudinal = "bad"; else d.design[k] = null;
        window.__adopt(d); window.__setType(["pillar", "longitudinal"].includes(k) ? "pillar" : "spread_foot");
      }, key);
      await p.waitForFunction(k => document.body.innerText.includes(k + " draft malformed"), key);
      const previous = await draft(p), beforeCalls = (await calls(p)).length;
      assert.match(await p.locator("body").innerText(), new RegExp(key + " draft malformed"));
      assert.equal((await calls(p)).length, beforeCalls);
      await p.getByRole("button", { name: `Replace ${key}`, exact: true }).click();
      await p.waitForFunction(k => !document.body.innerText.includes(k + " draft malformed"), key);
      const next = await draft(p);
      assert.equal((await calls(p)).length, beforeCalls + 1);
      const expected = { cover_inches: { side: "", top: "", bottom: "" }, supports: { mode: "unconfigured", reason: "" },
        spread: { mats: [], inter_mat_ties: [] }, pillar: { hoops: [], longitudinal: {} } };
      if (key === "longitudinal") previous.design.pillar.longitudinal = {};
      else previous.design[key] = expected[key];
      assert.deepEqual(next, previous, `Only ${key} is replaced in the committed seed`);
    }
  });
  await check("malformed material/overrides are repaired only by their explicit actions", async p => {
    for (const key of ["material", "overrides"]) {
      await p.evaluate(k => { const d = window.__blank(); d[k] = "bad"; window.__adopt(d); }, key);
      await p.waitForFunction(k => document.body.innerText.includes(k + " draft malformed"), key);
      const previous = await draft(p), beforeCalls = (await calls(p)).length;
      assert.match(await p.locator("body").innerText(), new RegExp(key + " draft malformed"));
      await p.getByRole("button", { name: `Replace ${key}`, exact: true }).click();
      await p.waitForFunction(k => !document.body.innerText.includes(k + " draft malformed"), key);
      const next = await draft(p); previous[key] = key === "material" ? { kind: "" } : { quantity_ft: null, cost_per_ft: null };
      assert.deepEqual(next, previous, `Only ${key} is replaced in the committed seed`);
      assert.equal((await calls(p)).length, beforeCalls + 1);
    }
  });
  await check("accepted numeric fields display as numbers, malformed object inputs remain visibly invalid", async p => {
    await seed(p, () => { const d = window.__blank(); d.design.bar_diameter_inches = { bad: true }; d.design.spread.mats = [{ id: "m", bearing_elevation_inches: 32, max_spacing_x_inches: 0, max_spacing_z_inches: 12 }]; window.__adopt(d); });
    assert.equal(await field(p, "Bar diameter (in)").inputValue(), "");
    assert.equal(await field(p, "Bearing elevation (in)").inputValue(), "32");
    assert.equal(await field(p, "Max spacing X (in)").inputValue(), "0");
    assert.match(await p.locator("body").innerText(), /Invalid/); assert.equal((await calls(p)).length, 0);
  });
  await check("mobile text fields request a text keyboard; dimensions retain decimal keyboard", async p => {
    await seed(p);
    for (const label of ["Name", "Reason", "Unit"]) assert.equal(await field(p, label).getAttribute("inputmode"), "text");
    assert.equal(await field(p, "Nominal diameter (in)").getAttribute("inputmode"), "decimal");
    await p.getByLabel("Supports", { exact: true }).selectOption("off");
    assert.equal(await p.getByLabel("Reason", { exact: true }).first().getAttribute("inputmode"), "text");
  });
  await check("switching to manual cannot silently reinterpret an authored each unit as feet", async p => {
    await seed(p, () => { const d = window.__blank(); d.material.unit = "each"; d.material.cost_per_ft = "2"; d.material.kind = "catalog"; window.__adopt(d); });
    await p.getByRole("button", { name: "Manual", exact: true }).click();
    assert.equal((await draft(p)).material.unit, "each"); assert.equal(await field(p, "Unit").inputValue(), "each");
    assert.equal((await draft(p)).material.cost_per_ft, "2");
  });
  for (const width of [375, 1280]) await check(`actual styled populated long-UUID layout at${width}px`, async p => {
    const ids = ["mat_" + "a".repeat(36), "mat_" + "b".repeat(36)];
    await seed(p); const d = await draft(p); d.design.spread.mats = ids.map(id => mat(id, "32"));
    d.design.spread.inter_mat_ties = [{ id: "tie_" + "c".repeat(36), from_mat_id: ids[0], to_mat_id: ids[1], x_inches: "0", z_inches: "0", cut_length_inches: "9" }];
    await p.evaluate(x => { window.__adopt(x); window.__setPreview(window.__preview()); }, d);
    assert.equal(await p.evaluate(() => getComputedStyle(document.querySelector(".grid-cols-3")).display), "grid");
    assert.ok(await p.evaluate(() => parseFloat(getComputedStyle(document.querySelector("#root > div")).paddingLeft) > 0), "Main panel padding is compiled");
    assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1));
    assert.match(await p.locator("body").innerText(), /\$252\.80/); assert.match(await p.locator("body").innerText(), /\$112\.00/);
    await p.screenshot({ path: `${DIR}/ui-lead-${width}.png`, fullPage: true });
  }, width);
  await check("explicit acknowledgments start unchecked and block acceptance without any automatic callbacks", async p => {
    await ackSeed(p);
    assert.equal(await field(p, PRELIMINARY).isChecked(), false);
    assert.equal(await field(p, WARNING).isChecked(), false);
    await acceptReady(p, false);
    assert.deepEqual(await calls(p), []);
  });
  await check("preliminary acknowledgment is an immutable controlled event, not a design or price edit", async p => {
    await ackSeed(p);
    const original = await draft(p);
    await field(p, PRELIMINARY).check();
    await p.waitForFunction(() => window.__acks?.preliminary === true);
    assert.deepEqual(await calls(p), [["ack", { preliminary: true, warningCodes: [] }]]);
    assert.deepEqual(await draft(p), original);
    assert.equal(await field(p, WARNING).isChecked(), false);
    await acceptReady(p, false);
  });
  await check("all explicit warnings still require fresh preview before one exact-ID acceptance", async p => {
    await ackSeed(p);
    await field(p, PRELIMINARY).check();
    await field(p, WARNING).check();
    await p.waitForFunction(() => window.__acks?.warningCodes.includes("engineering_review"));
    await acceptReady(p, false);
    assert.deepEqual(await calls(p), [
      ["ack", { preliminary: true, warningCodes: [] }],
      ["ack", { preliminary: true, warningCodes: ["engineering_review"] }],
    ]);
    await p.getByRole("button", { name: "Refresh Preview", exact: true }).click();
    assert.deepEqual((await calls(p)).at(-1), ["preview"]);
    await p.evaluate(() => window.__setPreview(window.__ackFresh()));
    await acceptReady(p, true);
    await p.getByRole("button", { name: "Accept Proposal", exact: true }).click();
    assert.deepEqual((await calls(p)).at(-1), ["accept", "preview-exact"]);
    assert.equal((await calls(p)).filter(([name]) => name === "accept").length, 1);
    assert.equal((await calls(p)).filter(([name]) => name === "change").length, 0);
  });
  await check("unchecking a required warning retains frozen prior acknowledgment and blocks stale acceptance", async p => {
    await ackSeed(p, { preliminary: true, warningCodes: ["engineering_review"] });
    await acceptReady(p, true);
    await field(p, WARNING).uncheck();
    await p.waitForFunction(() => window.__acks?.warningCodes.length === 0);
    await acceptReady(p, false);
    assert.deepEqual(await calls(p), [["ack", { preliminary: true, warningCodes: [] }]]);
    assert.equal(await p.evaluate(() => window.__held.some(entry =>
      entry.value?.preliminary === true && entry.value?.warningCodes?.[0] === "engineering_review")), true);
  });
  await check("malformed warning lists and array-shaped acknowledgments fail closed; duplicate warnings render once", async p => {
    await ackSeed(p, { preliminary: true, warningCodes: ["engineering_review"] });
    for (const warningCodes of [null, "engineering_review", [""], [null], ["engineering_review", 1]]) {
      await p.evaluate(codes => window.__setPreview({ ...window.__ackFresh(), warningCodes: codes }), warningCodes);
      await p.waitForFunction(codes => JSON.stringify(window.__renderedPreview?.warningCodes) === JSON.stringify(codes), warningCodes);
      await acceptReady(p, false);
    }
    await p.evaluate(() => window.__setPreview({ ...window.__ackFresh(), warningCodes: ["engineering_review", "engineering_review"] }));
    await acceptReady(p, true);
    assert.equal(await field(p, WARNING).count(), 1);
    await p.evaluate(() => {
      window.__setPreview({ ...window.__ackFresh(), warningCodes: [] });
      const invalid = Object.assign([], { preliminary: true, warningCodes: Object.freeze([]) });
      Object.freeze(invalid);
      window.__setFlags({ acknowledgments: invalid, onAcknowledgmentsChange: value => window.__calls.push(["ack", value]) });
    });
    await acceptReady(p, false);
    assert.equal(await field(p, PRELIMINARY).isChecked(), false);
    assert.deepEqual(await calls(p), []);
  });
  await check("acknowledgment controls respect busy, disabled, unsupported and stale states on a styled phone layout", async p => {
    await ackSeed(p, { preliminary: true, warningCodes: ["engineering_review"] });
    await acceptReady(p, true);
    for (const flags of [{ busy: true }, { disabled: true }]) {
      await p.evaluate(extra => window.__setFlags({
        ...extra, acknowledgments: window.__acks, onAcknowledgmentsChange: value => window.__calls.push(["ack", value]),
      }), flags);
      await p.waitForFunction(extra => Object.entries(extra).every(([key, value]) => window.__renderedFlags?.[key] === value), flags);
      await acceptReady(p, false);
      assert.equal(await field(p, PRELIMINARY).isDisabled(), true);
      assert.equal(await field(p, WARNING).isDisabled(), true);
    }
    await p.evaluate(() => {
      window.__setFlags({ acknowledgments: window.__acks, onAcknowledgmentsChange: value => window.__calls.push(["ack", value]) });
      window.__setVersion(99);
    });
    await p.getByText("This reinforcement mode is unsupported; proposal edits are unavailable.", { exact: true }).waitFor();
    await acceptReady(p, false);
    assert.equal(await field(p, PRELIMINARY).isDisabled(), true);
    await p.evaluate(() => { window.__setVersion(2); window.__setPreview({ ...window.__ackFresh(), stale: true }); });
    await p.getByText("Preview is stale - refresh before accepting.", { exact: true }).waitFor();
    await acceptReady(p, false);
    assert.equal(await field(p, PRELIMINARY).isDisabled(), false);
    assert.deepEqual(await calls(p), []);
    assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1));
    assert.ok(await p.evaluate(() => parseFloat(getComputedStyle(document.querySelector("#root > div")).paddingLeft) > 0));
    await p.screenshot({ path: `${DIR}/ui-acknowledgments-390.png`, fullPage: true });
  }, 390);
} finally {
  await browser.close();
  if (!reuse && !keep) await new Promise(resolve => server.close(resolve));
}
fs.writeFileSync(`${DIR}/ui-lead-results.json`, JSON.stringify({ synthetic: true, results, requests, errors }, null, 2) + "\n");
const failures = results.filter(r => !r.ok).length + requests.length + errors.length;
console.log(`UI_LEAD_VERIFICATION_DONE cases=${results.length} failures=${failures} keep=${keep} reuse=${reuse} pid=${process.pid}`);
process.exitCode = failures ? 1 : 0;

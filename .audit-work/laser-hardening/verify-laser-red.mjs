// RED — proves the REMOTE (pre-hardening) LaserEstimator defects end-to-end.
// Mounts the frozen remote page and demonstrates: malformed stored inputs
// crash the render outright, produce NaN totals the save path persists,
// launder blanks/malformed values mid-edit and at Settings-seed time, and
// provide no guard surface whatsoever. Every assertion describes the BAD
// remote behavior — the candidate inverts all of them.
import esbuild from "esbuild";
import path from "node:path";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import assertReal from "node:assert/strict";
import { E, remoteOnlySources, makeStubs, makeFrozenPlugin } from "./laser-frozen.mjs";

// Counted-assert proxy — every assertion is a recorded check so the run emits
// a machine-readable verification JSON (same convention as painting/cnc).
const __results = [];
let __section = "setup";
const section = (name) => { __section = name; };
const assert = new Proxy(assertReal, {
  get: (t, p) => {
    if (typeof t[p] !== "function") return t[p];
    return (...args) => { const r = t[p](...args); __results.push({ section: __section, ok: true }); return r; };
  },
});

// ---------- window shim ----------
const winHandlers = {};
globalThis.window = {
  location: { search: "", href: "" },
  sessionStorage: { _d: {}, getItem(k) { return this._d[k] ?? null; }, setItem(k, v) { this._d[k] = String(v); }, removeItem(k) { delete this._d[k]; } },
  confirm: () => true,
  addEventListener: (t, f) => { (winHandlers[t] ??= []).push(f); },
  removeEventListener: (t, f) => { winHandlers[t] = (winHandlers[t] || []).filter(h => h !== f); },
};
globalThis.location = globalThis.window.location;
globalThis.confirm = () => true;
globalThis.alert = (m) => { globalThis.__alerts.push(String(m)); };
globalThis.window.alert = globalThis.alert;
// addItem's setTimeout focus lands on document.querySelector — shim it so
// item-add clicks don't crash the loose-mounted (non-act) proofs.
globalThis.document = { querySelector: () => null };
globalThis.window.document = globalThis.document;
globalThis.__unexpectedNetwork = 0; globalThis.__unexpectedSdk = 0;
globalThis.fetch = () => { globalThis.__unexpectedNetwork++; throw Error("net"); };

// ---------- bundle the REMOTE page ----------
const sources = remoteOnlySources();
const STUBS = makeStubs(sources);
const loaded = {};
const plug = makeFrozenPlugin(sources, STUBS, loaded);
const entry = "/app/laser-red-entry.jsx";
sources.set(entry, `export { default as Page } from "/app/src/pages/LaserEstimator.jsx";`);
await esbuild.build({
  entryPoints: [entry], bundle: true, format: "esm", platform: "node", write: true,
  external: ["react", "react-dom", "react-dom/*", "react/*", "react-test-renderer", "react-router-dom", "scheduler", "scheduler/*"],
  plugins: [plug], loader: { ".js": "jsx", ".jsx": "jsx" }, jsx: "automatic",
  outfile: E + ".laser-red-bundle.mjs", logLevel: "silent",
});
const { Page } = await import(pathToFileURL(path.resolve(E + ".laser-red-bundle.mjs")));
const React = (await import("react")).default;
const { create, act } = await import("react-test-renderer");
const { MemoryRouter } = await import("react-router-dom");

// Error boundary — react-test-renderer surfaces unhandled render errors as
// uncaught exceptions, so the remote page's render crash is captured here.
class EB extends React.Component {
  state = { err: null };
  static getDerivedStateFromError(err) { return { err }; }
  render() {
    if (this.state.err) return React.createElement("div", { "data-eb": "crash" });
    return this.props.children;
  }
}

const SETTINGS_ROWS = (o = {}) => Object.entries({
  parameter_laser_machine_rate: "100", parameter_laser_labor_rate: "75",
  engraving_laser_machine_rate: "80", engraving_labor_rate: "40",
  parameter_handling_time_percentage: "15", engraving_handling_time_percentage: "20",
  min_parameter_laser_setup_hours: "0.5", parameter_laser_fixed_material_setup_cost: "0",
  laser_letter_perimeter_factor: "3.5", laser_engrave_speed_sqipm: "5",
  acrylic_cut_multiplier: "1", wood_cut_multiplier: "1", leather_cut_multiplier: "1",
  acrylic_engrave_multiplier: "1", wood_engrave_multiplier: "1", leather_engrave_multiplier: "1",
  cut_speed_1_16: "20", cut_speed_1_8: "20", cut_speed_3_16: "20", cut_speed_1_4: "20",
  cut_speed_3_8: "20", cut_speed_1_2: "20", cut_speed_3_4: "20",
  ...o,
}).map(([setting_name, setting_value]) => ({ setting_name, setting_value }));

const PANEL = (o = {}) => ({
  item_type: "panel", material_type: "Acrylic", material_thickness: "1/4",
  description: "P", quantity: 2, length: 24, width: 12, letter_height: 0, num_letters: 1,
  engrave_area_sqin: 0, total_cut_length_inches: 144,
  cut_speed_ipm: 20, engrave_speed_sqipm: 5,
  machine_time_hours: 0.1, handling_time_hours: 0.01, machine_cost: 10, labor_cost: 0.75,
  ...o,
});
const PROJECT = (o = {}) => ({
  id: "lp-1", updated_date: "v1", project_name: "P", client_name: "C",
  items: [PANEL()], machine_rate_per_hour: 100, labor_rate: 75,
  engraving_machine_rate_per_hour: 80, engraving_labor_rate: 40,
  parameter_handling_time_percentage: 15, engraving_handling_time_percentage: 20,
  fixed_setup_hours: 0.5, fixed_material_setup_cost: 0, notes: "",
  total_machine_cost: 10, total_supplies_cost: 0, total_labor_cost: 38.25, total_cost: 48.25,
  ...o,
});

const flush = async (n = 40) => { for (let i = 0; i < n; i++) await Promise.resolve(); };
const textOf = (node) => {
  let out = "";
  const walk = (x) => {
    if (x == null || typeof x === "boolean") return;
    if (typeof x === "string" || typeof x === "number") { out += x + " "; return; }
    if (Array.isArray(x)) { x.forEach(walk); return; }
    if (x.props) { if (x.props.children !== undefined) walk(x.props.children); return; }
    walk(x);
  };
  walk(node);
  return out.replace(/\s+/g, " ").trim();
};
const pageText = (c) => textOf(c.root.findAll(() => true).map(el => el.children));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const mount = async (opts = {}) => {
  globalThis.__spies = []; globalThis.__alerts = []; globalThis.__catalogReads = [];
  globalThis.__project = opts.project ?? null;
  globalThis.__estimate = opts.estimate ?? null;
  globalThis.__settingRows = opts.settings ?? SETTINGS_ROWS();
  globalThis.__ebError = null;
  let c = null, err = null;
  try {
    await act(async () => {
      c = create(React.createElement(MemoryRouter, { initialEntries: [opts.route ?? "/?id=lp-1"] },
        React.createElement(EB, null, React.createElement(Page))));
      await flush();
    });
  } catch (e) { err = e; }
  const crashed = c?.root ? c.root.findAll(el => el.props?.["data-eb"] === "crash").length > 0 : false;
  return { c, err, crashed };
};
// The remote recalc useEffect loops forever once items exist (its write-back
// recreates calculateTotals on every pass — an extra remote defect). For the
// save-path proofs we mount OUTSIDE act entirely: inside act, React 18's
// synchronous queue flush replays the recalc loop forever and starves every
// timer (the previous harness hung there). A bare create() lets the loop
// churn on the scheduler's macrotask queue where timers interleave; we give
// it real time, click, then unmount to kill the loop. React's "not wrapped
// in act"/depth noise is suppressed for the duration.
const mountLoose = async (opts = {}) => {
  globalThis.__spies = []; globalThis.__alerts = []; globalThis.__catalogReads = [];
  globalThis.__project = opts.project ?? null;
  globalThis.__estimate = opts.estimate ?? null;
  globalThis.__settingRows = opts.settings ?? SETTINGS_ROWS();
  const oe = console.error, ow = console.warn;
  console.error = console.warn = () => {};
  let c = null;
  try {
    const p = (async () => {
      c = create(React.createElement(MemoryRouter, { initialEntries: [opts.route ?? "/?id=lp-1"] },
        React.createElement(EB, null, React.createElement(Page))));
      await sleep(120);
    })();
    await Promise.race([p, sleep(400)]);
  } catch { /* render noise */ }
  return { c, restore: () => { console.error = oe; console.warn = ow; } };
};
const clickSaveLoose = async (c) => {
  const btn = c.root.findAll(el => el.type === "button" && /(Save|Update) Estimate/.test(textOf(el.children)));
  assert.ok(btn.length, "Save button found");
  btn[0].props.onClick();
  await flush(80);
};
// Loose mounts render on the scheduler's macrotask queue — poll in real time.
const waitForLoose = async (c, fn, tries = 60) => {
  for (let i = 0; i < tries; i++) { if (fn()) return true; await sleep(50); }
  return false;
};
// Drive a text input on a loose mount and wait for the value to land.
const fillLoose = async (c, pred, value) => {
  const el = c.root.findAll(e => e.type === "input" && pred(e.props))[0];
  assert.ok(el, "loose fill target input found");
  el.props.onChange({ target: { value } });
  await waitForLoose(c, () => c.root.findAll(e => e.type === "input" && pred(e.props))[0]?.props.value === value);
};
const clickSave = async (c) => {
  const btn = c.root.findAll(el => el.type === "button" && /(Save|Update) Estimate/.test(textOf(el.children)));
  assert.ok(btn.length, "Save button found");
  await act(async () => { btn[0].props.onClick(); await flush(); });
};
const saves = () => globalThis.__spies.filter(s => s[0] === "saveSource");

// R1 — DEFECT: malformed stored cut length CRASHES the page render outright
// (unhandled TypeError caught by the boundary — a real user gets a white screen).
section("R1 render crash");
{
  const { err, crashed } = await mount({ project: PROJECT({ items: [PANEL({ total_cut_length_inches: "abc" })] }) });
  assert.equal(err, null);
  assert.ok(crashed, "R1 DEFECT: unguarded .toFixed render crash on malformed stored data");
}

// R2 — DEFECT: malformed stored labor rate → NaN math → NaN persisted AND
// the sidebar launders it to $0.00 in display.
section("R2 NaN persisted");
{
  const { c, restore } = await mountLoose({ project: PROJECT({ labor_rate: "not-a-rate" }) });
  await clickSaveLoose(c);
  c.unmount();
  restore();
  assert.equal(saves().length, 1, "R2 remote still wrote");
  assert.ok(!Number.isFinite(saves()[0][1].data.total_labor_cost), "R2 DEFECT: NaN labor persisted");
  assert.ok(!Number.isFinite(saves()[0][1].data.total_cost), "R2 DEFECT: NaN total persisted");
}

// R3 — DEFECT: malformed stored engrave area → NaN machine cost persisted.
section("R3 NaN machine persisted");
{
  const { c, restore } = await mountLoose({ project: PROJECT({ items: [PANEL({ engrave_area_sqin: "abc" })] }) });
  await clickSaveLoose(c);
  c.unmount();
  restore();
  assert.equal(saves().length, 1);
  assert.ok(!Number.isFinite(saves()[0][1].data.total_machine_cost), "R3 DEFECT: NaN machine cost persisted");
}

// R4 — DEFECT: malformed Settings seed on a NEW project silently fabricates
// 100; no issue surface exists anywhere. The remote save guard requires ≥1
// item, so we add one on a loose mount (the recalc loop churns in the
// background and dies at unmount).
section("R4 silent seed 100");
{
  const { c, restore } = await mountLoose({
    route: "/", project: null,
    settings: SETTINGS_ROWS({ parameter_laser_machine_rate: "garbage" }),
  });
  const loaded = await waitForLoose(c, () =>
    c.root.findAll(el => el.type === "button" && /Add Item/.test(textOf(el.children))).length > 0);
  assert.ok(loaded, "R4 new-project page loaded");
  const txt = pageText(c);
  assert.ok(!txt.includes("Pricing unavailable"), "R4 DEFECT: no issue surface exists");
  const aria = c.root.findAll(el => el.props?.["aria-invalid"] === "true" || el.props?.["aria-invalid"] === true);
  assert.equal(aria.length, 0, "R4 DEFECT: no aria-invalid anywhere");
  await fillLoose(c, (p) => p.placeholder === "Enter client name", "C");
  await fillLoose(c, (p) => p.id === "project_name", "P");
  const addBtn = c.root.findAll(el => el.type === "button" && /Add Item/.test(textOf(el.children)));
  addBtn[0].props.onClick();
  await waitForLoose(c, () => c.root.findAll(el => el.type === "input").length > 0);
  await clickSaveLoose(c);
  c.unmount();
  restore();
  const s = globalThis.__spies.filter(x => x[0] === "ensureIdempotent");
  assert.equal(s.length, 1, "R4 remote wrote the new project");
  assert.equal(s[0][1].data.machine_rate_per_hour, 100, "R4 DEFECT: malformed seed silently became 100");
}

// R5 — DEFECT: clearing a number input mid-edit is silently laundered to 0
// (parseFloat||0) — the user's blank is destroyed before validation can see it.
section("R5 blank laundered");
{
  const { c, restore } = await mountLoose({ project: PROJECT() });
  const seen = await waitForLoose(c, () => c.root.findAll(el => el.type === "input" && el.props.value === 24).length > 0);
  assert.ok(seen, "R5 length input found");
  const len = c.root.findAll(el => el.type === "input" && el.props.value === 24)[0];
  len.props.onChange({ target: { value: "" } });
  // The laundered value lands on a scheduler-pass render — wait in real time.
  await waitForLoose(c, () => c.root.findAll(el => el.type === "input" && el.props.value === 0).length > 0);
  const after = c.root.findAll(el => el.type === "input" && el.props.value === 0);
  c.unmount();
  restore();
  assert.ok(after.length, "R5 DEFECT: blank silently became 0 (raw input destroyed)");
}

// R6 — DEFECT: authored 0% handling seeded to a NEW project is resurrected
// to the default 15 — a legitimate explicit zero can never round-trip.
section("R6 zero resurrected");
{
  const { c, restore } = await mountLoose({
    route: "/", project: null,
    settings: SETTINGS_ROWS({ parameter_handling_time_percentage: "0" }),
  });
  const loaded = await waitForLoose(c, () =>
    c.root.findAll(el => el.type === "button" && /Add Item/.test(textOf(el.children))).length > 0);
  assert.ok(loaded, "R6 new-project page loaded");
  await fillLoose(c, (p) => p.placeholder === "Enter client name", "C");
  await fillLoose(c, (p) => p.id === "project_name", "P");
  const addBtn = c.root.findAll(el => el.type === "button" && /Add Item/.test(textOf(el.children)));
  addBtn[0].props.onClick();
  await waitForLoose(c, () => c.root.findAll(el => el.type === "input").length > 0);
  await clickSaveLoose(c);
  c.unmount();
  restore();
  const s = globalThis.__spies.filter(x => x[0] === "ensureIdempotent");
  assert.equal(s.length, 1, "R6 remote wrote the new project");
  assert.equal(s[0][1].data.parameter_handling_time_percentage, 15,
    "R6 DEFECT: authored 0% handling silently became 15");
}

section("teardown");
assert.equal(globalThis.__unexpectedSdk, 0, "no SDK");
const sections = {};
for (const r of __results) sections[r.section] = (sections[r.section] || 0) + 1;
fs.writeFileSync(E + "laser-model-red-verification.json", JSON.stringify({
  suite: "laser-red", passed: __results.length, failed: 0, result: "PASS", sections,
  defects: [
    "malformed stored cut length crashes the page render outright (unguarded .toFixed)",
    "malformed stored labor rate → NaN total_labor_cost + total_cost persisted",
    "malformed stored engrave area → NaN total_machine_cost persisted",
    "malformed parameter_laser_machine_rate seed silently becomes 100 — no issue surface, no aria-invalid",
    "cleared number input laundered to 0 mid-edit (parseFloat||0 destroys the raw value)",
    "authored 0% handling resurrected to 15 — a legitimate explicit zero cannot round-trip",
  ],
}, null, 1));
console.log(`PASS laser-red (remote defects: render crash, NaN persisted, display laundering, silent seed, destroyed blanks, resurrected zeros) — ${__results.length} checks`);

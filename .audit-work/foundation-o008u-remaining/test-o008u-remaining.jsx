// O-008u verification harness — model + real-component checks for the three
// O-008 remainder files (MasterEquipmentTab / InventoryTable / FoundationCatalog).
//
// Model tier: verbatim regex-extraction of the candidate's normalizeRow,
// openAdd, initial-useMemo, switchSupportsAttachments, cleanForOwnership,
// tableSupplier and catalogSections into `new Function`s — the REAL candidate
// code runs, not a re-type.
//
// Component tier: react-dom/server renderToStaticMarkup over the bundled
// candidates with @/… deps stubbed. A react shim seeds useState in call order
// so loaded lists + open edit forms render without entity loads or DOM events.
// JSX never reaches a browser — this is real React render output, asserted as
// markup.

import { createElement as h, __seedReactStates } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import InventoryTable from "./testtree/src/components/masterInventory/InventoryTable.jsx";
import InventoryTableRemote from "./testtree/src/remoteBaseline/InventoryTable.jsx";
import MasterEquipmentTab from "./testtree/src/components/masterInventory/MasterEquipmentTab.jsx";
import FoundationCatalog from "./testtree/src/pages/FoundationCatalog.jsx";
import {
  groupInventoryBySupplier,
  inventorySupplierKey,
  inventoryNumberInput,
  inventoryNonnegativeNumber,
} from "./testtree/src/components/masterInventory/inventoryNormalization.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
// The bundle is emitted into testtree/, so candidates/ is one level up.
const CAND = (p) => fs.readFileSync(path.join(HERE, "..", "candidates", p), "utf8");

let passed = 0;
const failures = [];
const ok = (name, cond, extra = "") => {
  if (cond) passed += 1;
  else failures.push(`${name}${extra ? ` — ${extra}` : ""}`);
};
const eq = (name, actual, expected) =>
  ok(name, Object.is(actual, expected), `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
const section = (t) => console.log(`\n=== ${t}`);

// ─── verbatim extraction helpers ────────────────────────────────────────────
const slice = (src, startMarker, endMarker, label) => {
  const i = src.indexOf(startMarker);
  const j = i < 0 ? -1 : src.indexOf(endMarker, i + startMarker.length);
  if (i < 0 || j < 0) throw new Error(`extract failed: ${label}`);
  return src.slice(i, j + endMarker.length);
};
const fnFromDecl = (decl, params) => new Function(...params, `"use strict";\n${decl}\n  return ${decl.match(/(?:const|function)\s+([A-Za-z_$][\w$]*)/)[1]};`);

// ═══ M1 — boundary matrix on the real inventoryNormalization ═══════════════
section("M1 boundary: inventoryNumberInput / inventoryNonnegativeNumber / supplier key+group");

{
  // inventoryNumberInput — write-side draft: blank->null, numeric->Number, else verbatim
  eq("numInput absent-blank", inventoryNumberInput(""), null);
  eq("numInput spaces", inventoryNumberInput("   "), null);
  eq("numInput '0'", inventoryNumberInput("0"), 0);
  eq("numInput 0", inventoryNumberInput(0), 0);
  eq("numInput '12.5'", inventoryNumberInput("12.5"), 12.5);
  eq("numInput '-3'", inventoryNumberInput("-3"), -3);
  eq("numInput 'abc' verbatim", inventoryNumberInput("abc"), "abc");
  eq("numInput '12abc' verbatim", inventoryNumberInput("12abc"), "12abc");
  // inventoryNonnegativeNumber — catalog price basis: explicit 0 legal, else null
  eq("nonneg 0", inventoryNonnegativeNumber(0), 0);
  eq("nonneg '0'", inventoryNonnegativeNumber("0"), 0);
  eq("nonneg 155", inventoryNonnegativeNumber(155), 155);
  eq("nonneg absent", inventoryNonnegativeNumber(undefined), null);
  eq("nonneg blank", inventoryNonnegativeNumber(""), null);
  eq("nonneg '-3'", inventoryNonnegativeNumber("-3"), null);
  eq("nonneg 'abc'", inventoryNonnegativeNumber("abc"), null);
  eq("nonneg NaN", inventoryNonnegativeNumber(NaN), null);
  // supplier key + grouping
  eq("key 'Citywide'", inventorySupplierKey("Citywide"), "citywide");
  eq("key ' citywide '", inventorySupplierKey(" citywide "), "citywide");
  eq("key 'CITY WIDE'", inventorySupplierKey("CITY WIDE"), "city_wide");
  eq("key 'Ernst-Ent.'", inventorySupplierKey("Ernst-Ent."), "ernst_ent_");
  eq("key ''", inventorySupplierKey(""), null);
  eq("key '   '", inventorySupplierKey("   "), null);
  eq("key null", inventorySupplierKey(null), null);
  eq("key number", inventorySupplierKey(42), null);
  const groups = groupInventoryBySupplier([
    { id: 1, supplier: "ZZZ" }, { id: 2, supplier: "aaa" },
    { id: 3 }, { id: 4, supplier: "AAA " }, { id: 5, supplier: "" },
  ]);
  eq("group count", groups.length, 3);
  eq("first group key", groups[0].key, "aaa");
  eq("second group key", groups[1].key, "zzz");
  eq("unassigned last", groups[2].key, null);
  eq("first-seen label kept", groups[0].label, "aaa");
  eq("variant merge", groups[0].rows.map((r) => r.id).join(","), "2,4");
  eq("unassigned rows", groups[2].rows.map((r) => r.id).join(","), "3,5");
}

// ═══ M2 — MasterEquipmentTab verbatim extractions ══════════════════════════
section("M2 MasterEquipmentTab: normalizeRow / openAdd / initial / swap / save coercions");

const MET = CAND("src/components/masterInventory/MasterEquipmentTab.jsx");

// normalizeRow — module-level function, ends before `export default`
const normalizeRowSrc = MET.slice(
  MET.indexOf("function normalizeRow(row, source) {"),
  MET.indexOf("export default function MasterEquipmentTab")
).trimEnd();
const normalizeRow = new Function(`"use strict";\n${normalizeRowSrc}\nreturn normalizeRow;`)();

{
  const absent = normalizeRow({ id: "e1", material_name: "Ex", material_type: "excavation_equipment" }, "foundation_equipment");
  eq("fnd absent day→null", absent.cost_per_day, null);
  eq("fnd absent wk→null", absent.cost_per_week, null);
  eq("fnd absent mo→null", absent.cost_per_month, null);
  const zero = normalizeRow({ id: "e2", cost_per_day: 0, cost_per_week: 0, cost_per_month: 0 }, "foundation_equipment");
  eq("fnd authored 0 day", zero.cost_per_day, 0);
  const chan = normalizeRow({ id: "c1", equipment_name: "B", ownership: "rented" }, "channel_letter_equipment");
  eq("chn absent day→null", chan.cost_per_day, null);
  const priced = normalizeRow({ id: "e3", cost_per_day: 45, cost_per_week: "12.5" }, "foundation_equipment");
  eq("authored 45", priced.cost_per_day, 45);
  eq("authored '12.5' verbatim", priced.cost_per_week, "12.5");
}

// openAdd — closure over activeKind/ownership/setEditItem/setShowForm
const makeOpenAdd = fnFromDecl(slice(MET, "const openAdd = () => {", "\n  };", "openAdd"),
  ["activeKind", "ownership", "setEditItem", "setShowForm"]);
const capture = (kind) => {
  let item = null;
  makeOpenAdd(kind, "rented", (v) => { item = v; }, () => {})();
  return item;
};
{
  const boom = capture("boom_lift");
  eq("openAdd boom chn source", boom._source, "channel_letter_equipment");
  eq("boom cost_per_day null", boom.raw.cost_per_day, null);
  eq("boom cost_per_week null", boom.raw.cost_per_week, null);
  eq("boom cost_per_month null", boom.raw.cost_per_month, null);
  eq("boom delivery_pickup null", boom.raw.delivery_pickup_cost, null);
  eq("boom non-numeric default kept", boom.raw.pricing_mode, "per_day");
  const fnd = capture("attachment");
  eq("openAdd fnd source", fnd._source, "foundation_equipment");
  eq("fnd material_type", fnd.raw.material_type, "attachment");
  eq("fnd cost_per_day null", fnd.raw.cost_per_day, null);
  eq("fnd pickup_delivery null", fnd.raw.pickup_delivery_cost, null);
  eq("fnd sort_order null", fnd.raw.sort_order, null);
  eq("fnd flags kept", fnd.raw.show_in_foundation, true);
}

// initial useMemo — closure over normalized/source/kind/ownership/useMemo
const initialDecl = slice(MET, "const initial = useMemo(() => {", "}, [normalized, source, kind, ownership]);", "initial");
const buildInitial = (normalized, ownership = "rented") =>
  new Function("useMemo", "normalized", "source", "kind", "ownership", `"use strict";\n${initialDecl}\n  return initial;`)(
    (fn) => fn(), normalized, normalized._source, normalized.kind, ownership);

{
  const fndNew = buildInitial({ _new: true, kind: "equipment", _source: "foundation_equipment", raw: {} });
  for (const k of ["cost_per_day", "cost_per_week", "cost_per_month", "pickup_delivery_cost", "mpg", "idle_running_cost_per_hour"])
    eq(`fnd init ${k} absent→null`, fndNew[k], null);
  const fndZero = buildInitial({ kind: "attachment", _source: "foundation_equipment", raw: { cost_per_day: 0, cost_per_week: 45, pickup_delivery_cost: "abc", mpg: 0, idle_running_cost_per_hour: 2.5 } });
  eq("fnd init authored 0", fndZero.cost_per_day, 0);
  eq("fnd init authored 45", fndZero.cost_per_week, 45);
  eq("fnd init 'abc' verbatim", fndZero.pickup_delivery_cost, "abc");
  eq("fnd init mpg 0", fndZero.mpg, 0);
  eq("fnd init idle 2.5", fndZero.idle_running_cost_per_hour, 2.5);
  const chnNew = buildInitial({ _new: true, kind: "equipment", _source: "channel_letter_equipment", raw: {} });
  for (const k of ["cost_per_day", "cost_per_week", "cost_per_month", "cost_flat", "delivery_pickup_cost", "max_height_feet", "default_height_min_feet", "default_height_max_feet", "mpg", "idle_running_cost_per_hour"])
    eq(`chn init ${k} absent→null`, chnNew[k], null);
  eq("chn safety margin default kept", chnNew.vertical_reach_safety_margin_feet, 2);
  const chnZero = buildInitial({ kind: "equipment", _source: "channel_letter_equipment", raw: { cost_per_day: 0, cost_flat: 0, delivery_pickup_cost: 0, max_height_feet: 0, default_height_min_feet: 0, default_height_max_feet: 0, mpg: 0, idle_running_cost_per_hour: 0, vertical_reach_safety_margin_feet: 0 } });
  for (const k of ["cost_per_day", "cost_flat", "delivery_pickup_cost", "max_height_feet", "default_height_min_feet", "default_height_max_feet", "mpg", "idle_running_cost_per_hour", "vertical_reach_safety_margin_feet"])
    eq(`chn init authored 0 ${k}`, chnZero[k], 0);
}

// switchSupportsAttachments — carry + both swap directions
const swapDecl = slice(MET, "const switchSupportsAttachments = (yes) => {", "\n  };", "switchSupportsAttachments");
const makeSwap = fnFromDecl(swapDecl, ["source", "normalized", "setForm", "form", "ownership", "equipmentType", "nameField"]);
const runSwap = ({ form, source, yes, nameField = "material_name", equipmentType = "boom_lift", ownership = "rented" }) => {
  const normalized = { _source: source };
  let nextForm = null;
  makeSwap(source, normalized, (v) => { nextForm = v; }, form, ownership, equipmentType, nameField)(yes);
  return nextForm;
};
{
  const toChn = runSwap({ source: "foundation_equipment", yes: false,
    form: { material_name: "Ex", cost_per_day: 0, cost_per_week: null, cost_per_month: undefined, pickup_delivery_cost: 30, mpg: 0, idle_running_cost_per_hour: null, notes: "n", fuel_type: "diesel" } });
  eq("swap→chn authored 0 kept", toChn.cost_per_day, 0);
  eq("swap→chn null kept", toChn.cost_per_week, null);
  eq("swap→chn absent→null", toChn.cost_per_month, null);
  eq("swap→chn pickup→delivery map", toChn.delivery_pickup_cost, 30);
  eq("swap→chn cost_flat null", toChn.cost_flat, null);
  eq("swap→chn max_height null", toChn.max_height_feet, null);
  eq("swap→chn mpg 0 kept", toChn.mpg, 0);
  eq("swap→chn idle null", toChn.idle_running_cost_per_hour, null);
  const toFnd = runSwap({ source: "channel_letter_equipment", yes: true,
    form: { equipment_name: "Boom", cost_per_day: 100, delivery_pickup_cost: 0, mpg: 8, idle_running_cost_per_hour: 1.5 } });
  eq("swap→fnd delivery→pickup map", toFnd.pickup_delivery_cost, 0);
  eq("swap→fnd authored 100 kept", toFnd.cost_per_day, 100);
  eq("swap→fnd mpg 8", toFnd.mpg, 8);
  const noCarry = runSwap({ source: "foundation_equipment", yes: false, form: {} });
  eq("swap empty form day null", noCarry.cost_per_day, null);
  eq("swap empty form mpg null", noCarry.mpg, null);
}

// cleanForOwnership + inventoryNumberInput save-coercion matrix
const cleanDecl = slice(MET, "const cleanForOwnership = (p) => {", "\n      };", "cleanForOwnership");
const cleanForOwnership = fnFromDecl(cleanDecl, ["ownership"]);
{
  const draftToField = (v) => inventoryNumberInput(v);
  const payload = (form, ownership = "rented") => cleanForOwnership(ownership)({ ...form });
  eq("save blank→null persists", payload({ cost_per_day: draftToField("") }).cost_per_day, null);
  eq("save '0'→0 authored", payload({ cost_per_day: draftToField("0") }).cost_per_day, 0);
  eq("save '12.5'→12.5", payload({ cost_per_day: draftToField("12.5") }).cost_per_day, 12.5);
  eq("save 'abc' verbatim", payload({ cost_per_day: draftToField("abc") }).cost_per_day, "abc");
  eq("save untouched null stays null", payload({ cost_per_day: null }).cost_per_day, null);
  const owned = payload({ cost_per_day: 25, rental_company: "Sunbelt", pricing_mode: "per_day", ownership: "owned" }, "rented");
  eq("owned blanks rental_company", owned.rental_company, "");
  eq("owned pricing_mode→owned_flat", owned.pricing_mode, "owned_flat");
  eq("owned cost field untouched", owned.cost_per_day, 25);
  const rentedBadMode = payload({ pricing_mode: "weird", ownership: "rented" });
  eq("rented bad mode→per_day", rentedBadMode.pricing_mode, "per_day");
}

// ═══ M3 — InventoryTable / FoundationCatalog extracted helpers ═════════════
section("M3 InventoryTable tableSupplier + FoundationCatalog catalogSections");

const IT = CAND("src/components/masterInventory/InventoryTable.jsx");
const FC = CAND("src/pages/FoundationCatalog.jsx");

const tableSupplier = fnFromDecl(slice(IT, "const tableSupplier = (row) =>", ";", "tableSupplier"), [])();
{
  eq("supplier field wins", tableSupplier({ supplier: "Acme", vendor_name: "Other" }), "Acme");
  eq("vendor fallback", tableSupplier({ vendor_name: "Citywide" }), "Citywide");
  eq("service_name fallback", tableSupplier({ service_name: "Permit Exp" }), "Permit Exp");
  eq("blank vendor → service", tableSupplier({ vendor_name: "", service_name: "S" }), "S");
  eq("absent all → falsy", tableSupplier({}), undefined);
}

const catSectionsDecl = slice(FC, "const catalogSections = (() => {", "})();", "catalogSections");
const buildSections = (visible, visibleCount) =>
  new Function("groupInventoryBySupplier", "visible", "visibleCount", `"use strict";\n${catSectionsDecl}\n  return catalogSections;`)(
    groupInventoryBySupplier, visible, visibleCount);
{
  const mk = (id, supplier) => ({ id, material_type: "rebar", material_name: id, supplier });
  const vis = [mk("r1", "AAA"), mk("r2", "aaa"), mk("r3", "ZZZ"), mk("r4"), mk("r5", "")];
  const full = buildSections(vis, 60);
  eq("sections count", full.length, 3);
  eq("sections order", full.map((g) => g.key).join(","), "aaa,zzz,");
  eq("unassigned last rows", full[2].rows.length, 2);
  const win = buildSections(vis, 2);
  eq("window caps rows", win.length, 1);
  eq("window rows only", win[0].rows.length, 2);
  const win3 = buildSections(vis, 3);
  eq("window splits group boundary", win3.length, 2);
  eq("window part2 rows", win3[1].rows.length, 1);
  const win0 = buildSections(vis, 0);
  eq("window 0 → no sections", win0.length, 0);
}

// ═══ R1 — real render: InventoryTable grouped headers ══════════════════════
section("R1 InventoryTable renderToStaticMarkup — grouped headers, ordering, colSpan");

const laborSource = {
  key: "labor_services", label: "Labor & Services", nameField: "service_name",
  fields: [
    { name: "service_name", label: "Name", type: "text", required: true, table: true },
    { name: "service_category", label: "Category", type: "select", options: ["concrete_service", "other"], table: true },
    { name: "pricing_mode", label: "Pricing", type: "select", options: ["per_cy", "flat"], table: true },
    { name: "default_rate", label: "Rate", type: "number", required: true, table: true },
    { name: "vendor_name", label: "Vendor", type: "text", table: true },
    { name: "is_active", label: "Active", type: "boolean", table: true },
  ],
};
const laborItems = [
  { id: "L1", service_name: "Citywide 3500", service_category: "concrete_service", pricing_mode: "per_cy", default_rate: 155, vendor_name: "Citywide" },
  { id: "L2", service_name: "Citywide Small-Load", service_category: "concrete_service", pricing_mode: "flat", default_rate: 0, vendor_name: " citywide " },
  { id: "L3", service_name: "Ernst 4000", service_category: "concrete_service", pricing_mode: "per_cy", default_rate: 160, vendor_name: "Ernst" },
  { id: "L4", service_name: "Permit Expediting", service_category: "permitting", pricing_mode: "flat", default_rate: 350 },
  // No supplier/vendor/service fields at all → the unassigned group (the
  // service_name fallback keeps every NAMED labor row in its own group).
  { id: "L5" },
];
const headerTexts = (html) => [...html.matchAll(/Supplier: <span[^>]*>([^<]*)<\/span>\s*<span[^>]*>\((\d+)\)<\/span>/g)]
  .map((m) => ({ label: m[1], count: Number(m[2]) }));

{
  __seedReactStates(null);
  const html = renderToStaticMarkup(h(InventoryTable, { source: laborSource, items: laborItems, canEdit: true }));
  const heads = headerTexts(html);
  eq("header count", heads.length, 4);
  eq("group order alpha", heads.map((x) => x.label).join("|"), "Citywide|Ernst|Permit Expediting|— not recorded");
  eq("citywide merged count", heads[0].count, 2);
  eq("unassigned count", heads[3].count, 1);
  ok("colSpan spans all cols", html.includes('colSpan="7"'), `colSpan=7 expected: ${html.match(/colSpan="\d+"/)?.[0]}`);
  // within-group order = input order (L1 then L2)
  const i1 = html.indexOf("Citywide 3500"), i2 = html.indexOf("Citywide Small-Load"), i3 = html.indexOf("Ernst 4000");
  ok("input order inside group", i1 > -1 && i2 > i1 && i3 > i2);
  // authored 0 rate renders "0", not a minted "—"
  ok("authored 0 rate renders 0", html.includes(">0</span>"));
  // unassigned group is LAST — its header sits after every supplier row
  ok("unassigned header last", html.indexOf("— not recorded") > html.lastIndexOf("Permit Expediting"));
  // header row class per landed markup
  ok("header row class", html.includes('class="bg-slate-50/80"'));
  ok("header uppercase class", /uppercase tracking-wide text-slate-500/.test(html));
}

// sorted view — within-group ordering follows the column sort
{
  __seedReactStates(null);
  const html = renderToStaticMarkup(h(InventoryTable, {
    source: { ...laborSource, fields: laborSource.fields.slice(0, 5) },
    items: laborItems, canEdit: false,
  }));
  const heads = headerTexts(html);
  eq("read-only colSpan", html.match(/colSpan="(\d+)"/)?.[1], "5");
  eq("read-only header count", heads.length, 4);
}

// remote baseline contrast — the TDZ ordering bug throws before the fix
{
  let threw = null;
  __seedReactStates(null);
  try { renderToStaticMarkup(h(InventoryTableRemote, { source: laborSource, items: laborItems, canEdit: true })); }
  catch (e) { threw = e.message; }
  ok("remote baseline TDZ throws (fixed in candidate)", /before initialization|undefined/.test(String(threw)), `got: ${threw}`);
}

// substrates-style source — `supplier` field groups identically
{
  const subSource = {
    key: "substrates", label: "Substrates", nameField: "material_name",
    fields: [
      { name: "material_name", label: "Name", type: "text", table: true },
      { name: "supplier", label: "Supplier", type: "text", table: true },
    ],
  };
  __seedReactStates(null);
  const html = renderToStaticMarkup(h(InventoryTable, {
    source: subSource, canEdit: false,
    items: [{ id: "s1", material_name: "ACM", supplier: "AluCo" }, { id: "s2", material_name: "PVC" }],
  }));
  const heads = headerTexts(html);
  eq("substrates groups", heads.map((x) => x.label).join("|"), "AluCo|— not recorded");
}

// ═══ R2 — real render: FoundationCatalog grouped sections + windowing ═════
section("R2 FoundationCatalog renderToStaticMarkup — sections, unrecorded last, row-budget");

const catRows = [
  { id: "r1", material_type: "rebar", material_name: "Rebar #4", supplier: "AAA Rebar", cost_per_unit: 12 },
  { id: "r2", material_type: "rebar", material_name: "Rebar #5", supplier: " aaa rebar ", cost_per_unit: 0 },
  { id: "r3", material_type: "rebar", material_name: "Rebar #6", supplier: "ZZZ Steel", cost_per_unit: 9 },
  { id: "r4", material_type: "rebar", material_name: "Rebar #7", cost_per_unit: 5 },
  { id: "r5", material_type: "rebar", material_name: "Rebar #8", supplier: "", cost_per_unit: 1 },
];
const sectionHeaders = (html) => [...html.matchAll(/uppercase tracking-wide text-slate-500 border-b[^"]*"[^>]*>\s*(?:Supplier: <span[^>]*>([^<]*)<\/span>|(No supplier recorded))/g)]
  .map((m) => m[1] || m[2]);

{
  // seeds: rows, loading, activeType, search, editing, dialogOpen, loadError, visibleCount
  __seedReactStates([catRows, false, "rebar", "", null, false, "", 60]);
  const html = renderToStaticMarkup(h(FoundationCatalog));
  const heads = sectionHeaders(html);
  eq("catalog section count", heads.length, 3);
  eq("catalog order + unrecorded last", heads.join("|"), "AAA Rebar|ZZZ Steel|No supplier recorded");
  ok("all 5 rows render", ["Rebar #4", "Rebar #5", "Rebar #6", "Rebar #7", "Rebar #8"].every((n) => html.includes(n)));
  ok("authored $0.00 price shows", html.includes("$0.00"));
  ok("no show-more under cap", !html.includes("Show "));
  // header before first row of its group
  ok("header precedes rows", html.indexOf("AAA Rebar") < html.indexOf("Rebar #4") && html.indexOf("No supplier recorded") > html.indexOf("Rebar #6"));
}

{
  __seedReactStates([catRows, false, "rebar", "", null, false, "", 2]);
  const html = renderToStaticMarkup(h(FoundationCatalog));
  const heads = sectionHeaders(html);
  eq("windowed: only first section", heads.length, 1);
  eq("windowed section", heads[0], "AAA Rebar");
  ok("windowed rows capped at 2", html.includes("Rebar #4") && html.includes("Rebar #5") && !html.includes("Rebar #6"));
  ok("show-more renders remaining", html.includes("Show 3 more (3 remaining)"));
}

// ═══ R3 — real render: MasterEquipmentTab list + open form ════════════════
section("R3 MasterEquipmentTab renderToStaticMarkup — list prices, blank-vs-0 form");

const fndRows = [
  { id: "e1", material_name: "Mini Excavator", material_type: "excavation_equipment", ownership: "rented", cost_per_day: 0, cost_per_week: null, compatible_attachment_ids: ["a1"], updated_date: "t0" },
  { id: "a1", material_name: "Auger Bit", material_type: "attachment", ownership: "rented", cost_per_day: 12 },
  { id: "u1", material_name: "Unpriced Tool", material_type: "attachment", ownership: "rented" },
];
const chnRows = [{ id: "c1", equipment_name: "Boom 60ft", equipment_type: "boom_lift", ownership: "rented", cost_per_day: 250 }];

{
  // seeds: foundationRows, channelRows, loading, ownership, activeKind, search, showForm, editItem, loadError
  __seedReactStates([fndRows, chnRows, false, "rented", "equipment", "", false, null, ""]);
  const html = renderToStaticMarkup(h(MasterEquipmentTab, { isAdmin: true }));
  ok("authored $0 day shows", html.includes("Day: <strong>$0</strong>"));
  ok("null week shows Not priced", html.includes("Wk: <strong>Not priced</strong>"));
  ok("absent month shows Not priced", html.includes("Mo: <strong>Not priced</strong>"));
  ok("boom $250 shows", html.includes("Day: <strong>$250</strong>"));
  ok("attachment renders", html.includes("Auger Bit"));
  ok("no $null minted display", !html.includes("$null") && !html.includes("$NaN"));
}

{
  // new foundation equipment — openAdd-produced editItem shape
  const editNew = { _new: true, kind: "equipment", _source: "foundation_equipment", raw: {
    material_type: "excavation_equipment", material_name: "", cost_per_day: null, cost_per_week: null,
    cost_per_month: null, pickup_delivery_cost: null, ownership: "rented",
    compatible_attachment_ids: [], compatible_sub_attachment_ids: [],
    show_in_channel_letters: false, show_in_foundation: true, show_in_sign_maintenance: false, sort_order: null,
  }};
  __seedReactStates([fndRows, chnRows, false, "rented", "equipment", "", true, editNew, ""]);
  const html = renderToStaticMarkup(h(MasterEquipmentTab, { isAdmin: true }));
  ok("blank drafts render value=\"\" (no minted 0)", !/value="0"/.test(html), `found value="0" at ${html.indexOf('value="0"')}`);
  const blankInputs = (html.match(/value=""/g) || []).length;
  ok("≥4 blank numeric inputs", blankInputs >= 4, `got ${blankInputs}`);
  ok("form mounted", html.includes("Supports Attachments") || html.includes("Delivery / Pickup"));
}

{
  // authored-0 channel edit — zeros must initialize as real 0s
  const editZero = { kind: "equipment", _source: "channel_letter_equipment", id: "c1", name: "Boom 60ft", raw: {
    id: "c1", equipment_name: "Boom 60ft", equipment_type: "boom_lift", ownership: "rented",
    cost_per_day: 0, cost_per_week: 0, cost_per_month: 0, cost_flat: 0, delivery_pickup_cost: 0,
    max_height_feet: 0, vertical_reach_safety_margin_feet: 2, is_default_for_height: true,
    default_height_min_feet: 0, default_height_max_feet: 0, mpg: 0, idle_running_cost_per_hour: 0,
    rental_company: "Sunbelt", updated_date: "t1",
  }};
  __seedReactStates([fndRows, chnRows, false, "rented", "equipment", "", true, editZero, ""]);
  const html = renderToStaticMarkup(h(MasterEquipmentTab, { isAdmin: true }));
  const zeros = (html.match(/value="0"/g) || []).length;
  ok("authored 0s initialize value=\"0\" (≥5)", zeros >= 5, `got ${zeros}`);
  ok("safety margin authored 2 shows", html.includes('value="2"'));
}

// ═══ S — source assertions on the three candidates ════════════════════════
section("S source assertions");

{
  ok("MET no `|| 0` remains", !/\|\|\s*0/.test(MET));
  ok("MET no parseFloat||0 draft", !/parseFloat\(e\.target\.value\)\s*\|\|\s*0/.test(MET));
  eq("MET ?? null numeric init count", (MET.match(/\?\? null/g) || []).length >= 22, true);
  eq("MET inventoryNumberInput onChanges", (MET.match(/inventoryNumberInput\(e\.target\.value\)/g) || []).length, 10);
  ok("MET openAdd nulls", /cost_per_day: null, cost_per_week: null, cost_per_month: null, delivery_pickup_cost: null/.test(MET)
    && /cost_per_day: null, cost_per_week: null, cost_per_month: null, pickup_delivery_cost: null/.test(MET)
    && /sort_order: null/.test(MET));
  ok("IT imports groupInventoryBySupplier", /import \{ groupInventoryBySupplier \} from "\.\/inventoryNormalization"/.test(IT));
  ok("IT Fragment import", /Fragment/.test(IT));
  ok("IT groups sortedItems", /groupInventoryBySupplier\(sortedItems, tableSupplier\)/.test(IT));
  ok("IT header markup per landed", /className="bg-slate-50\/80"/.test(IT) && /— not recorded/.test(IT));
  ok("IT colSpan formula", /colSpan=\{tableFields\.length \+ \(canEdit \? 1 : 0\) \+ \(bulkField && canEdit \? 1 : 0\)\}/.test(IT));
  ok("IT sortedItems declared before use", IT.indexOf("const sortedItems") < IT.indexOf("const allVisibleSelected"));
  ok("FC imports grouping", /import \{ groupInventoryBySupplier \} from "@\/components\/masterInventory\/inventoryNormalization"/.test(FC));
  ok("FC sections render", /catalogSections\.map/.test(FC));
  ok("FC header markup per landed", /No supplier recorded/.test(FC) && /Supplier: <span/.test(FC));
  ok("FC window keeps row cap", /group\.rows\.slice\(0, budget\)/.test(FC));
}

// ═══ report ════════════════════════════════════════════════════════════════
console.log(`\n${failures.length === 0 ? "PASS" : "FAIL"} o008u-remaining — ${passed} passed, ${failures.length} failed`);
if (failures.length) {
  for (const f of failures) console.log(`  FAIL: ${f}`);
  process.exit(1);
}

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// A-08 :: Machine — unified machine registry (generalizes MachineRate economics; VinylMachine stays vinyl-specific and untouched)
// A-09 :: TaxAgency — taxing-authority registry + TaxGroup.agency_id optional reference

function parseJsonc(text) {
  // Strip // and /* */ comments outside string literals, then JSON.parse.
  let out = "";
  let inStr = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      out += c;
      if (c === "\\") { out += text[++i] ?? ""; continue; }
      if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') { inStr = true; out += c; continue; }
    if (c === "/" && text[i + 1] === "/") { while (i < text.length && text[i] !== "\n") i++; out += "\n"; continue; }
    if (c === "/" && text[i + 1] === "*") { i += 2; while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) i++; i++; continue; }
    out += c;
  }
  return JSON.parse(out);
}

const load = (name) => parseJsonc(readFileSync(new URL(`../base44/entities/${name}.jsonc`, import.meta.url), "utf8"));
const backendOnly = (schema, role) => {
  for (const op of ["create", "read", "update", "delete"]) {
    assert.equal(schema.rls?.[op]?.user_condition?.role, role, `${schema.name} ${op} gated by ${role}`);
  }
};
const fieldTypes = (schema, expected) => {
  for (const [key, type] of Object.entries(expected)) {
    assert.equal(schema.properties?.[key]?.type, type, `${schema.name}.${key} is ${type}`);
  }
};

// ---------- A-08 :: Machine ----------
const machine = load("Machine");
assert.equal(machine.name, "Machine");
assert.equal(machine.type, "object");
fieldTypes(machine, {
  name: "string",
  machine_type: "string",
  cost_per_hour: "number",
  profiles: "array",
  disposable_cost_per_unit: "number",
  setup_cost: "number",
  setup_minutes: "number",
  labor_pct: "number",
  weighted_multiplier: "number",
  margin_chart_id: "string",
  income_account: "string",
  status: "string",
  description: "string",
});
// machine_type stays a free-form string (roll_fed|sheet_fed|other documented, not enum-locked).
assert.ok(!machine.properties.machine_type.enum, "Machine.machine_type is a plain string, not an enum");
assert.match(machine.properties.machine_type.description ?? "", /roll_fed/);
assert.match(machine.properties.machine_type.description ?? "", /sheet_fed/);
assert.match(machine.properties.machine_type.description ?? "", /other/);
// profiles: array of { name: string, speed_settings: object }
assert.equal(machine.properties.profiles.items?.type, "object", "Machine.profiles items are objects");
assert.equal(machine.properties.profiles.items?.properties?.name?.type, "string", "profile.name is a string");
assert.equal(machine.properties.profiles.items?.properties?.speed_settings?.type, "object", "profile.speed_settings is an object");
// All fields optional (no required list, or an empty one).
assert.ok(!Array.isArray(machine.required) || machine.required.length === 0, "Machine has no required fields");
backendOnly(machine, "__machine_backend_only__");

// ---------- A-09 :: TaxAgency ----------
const agency = load("TaxAgency");
assert.equal(agency.name, "TaxAgency");
assert.equal(agency.type, "object");
fieldTypes(agency, {
  name: "string",
  rate: "number",
  jurisdiction: "string",
  gl_account: "string",
  reporting_period: "string",
  status: "string",
});
assert.ok(!Array.isArray(agency.required) || agency.required.length === 0, "TaxAgency has no required fields");
backendOnly(agency, "__taxagency_backend_only__");

// ---------- A-09 :: TaxGroup gains agency_id only; existing properties untouched ----------
const taxGroup = load("TaxGroup");
assert.equal(taxGroup.name, "TaxGroup");
assert.equal(taxGroup.properties?.agency_id?.type, "string", "TaxGroup.agency_id is an optional string reference");
assert.match(taxGroup.properties.agency_id.description ?? "", /TaxAgency/);
assert.ok(!Array.isArray(taxGroup.required) || !taxGroup.required.includes("agency_id"), "agency_id is optional");
fieldTypes(taxGroup, {
  group_name: "string",
  tax_percent: "number",
  is_default: "boolean",
  is_active: "boolean",
  sort_order: "number",
});
assert.equal(taxGroup.properties.tax_percent.default, 0);
assert.equal(taxGroup.properties.is_default.default, false);
assert.equal(taxGroup.properties.is_active.default, true);
assert.equal(taxGroup.properties.sort_order.default, 0);
assert.deepEqual(taxGroup.required, ["group_name"], "TaxGroup still requires only group_name");
backendOnly(taxGroup, "__taxgroup_backend_only__");

// ---------- Guards :: VinylMachine + MachineRate schemas remain untouched ----------
const vinyl = load("VinylMachine");
assert.equal(vinyl.name, "VinylMachine");
assert.deepEqual(vinyl.properties?.machine_type?.enum, ["printer", "cutter", "print_and_cut", "laminator"], "VinylMachine enum intact");
assert.deepEqual(vinyl.required, ["machine_name", "machine_type"], "VinylMachine required fields intact");
backendOnly(vinyl, "__vinylmachine_backend_only__");

const rate = load("MachineRate");
assert.equal(rate.name, "MachineRate");
assert.deepEqual(rate.required, ["name", "machine_type", "runtime_rate_per_hour"], "MachineRate required fields intact");
assert.deepEqual(rate.properties?.machine_type?.enum, ["vinyl", "cnc", "laser", "printer", "other"], "MachineRate enum intact");

console.log("PASS machine + tax schema (Machine 13 fields + profiles shape, TaxAgency 6 fields, TaxGroup.agency_id, backend-only RLS, VinylMachine/MachineRate untouched)");

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/[^\n]*/g, "$1");
const entity = (name) => JSON.parse(stripComments(readFileSync(new URL(`../base44/entities/${name}.jsonc`, import.meta.url), "utf8")));

const EXPECTED = {
  CatalogPartGroup: {
    role: "__catalogpartgroup_backend_only__",
    fields: {
      name: "string",
      description: "string",
      shared_defaults: "object",
      part_ids: "array",
      sort: "number",
      status: "string",
    },
  },
  PricingModifier: {
    role: "__pricingmodifier_backend_only__",
    fields: {
      name: "string",
      label: "string",
      input_type: "string",
      can_use_in_pricing: "boolean",
      rates: "array",
      formula_text: "string",
      include_setup_fee: "boolean",
      min_charge: "number",
      affects_waste: "boolean",
      inventoried_part_type: "string",
      pricing_tier_id: "string",
      display_order: "number",
      status: "string",
    },
  },
  ModifierOption: {
    role: "__modifieroption_backend_only__",
    fields: {
      modifier_id: "string",
      label: "string",
      value: "string",
      rate_overrides: "object",
      is_default: "boolean",
      sort: "number",
      status: "string",
    },
  },
};

const schemas = {};
for (const [name, spec] of Object.entries(EXPECTED)) {
  const schema = entity(name);
  schemas[name] = schema;
  assert.equal(schema.name, name, `${name}.name`);
  assert.equal(schema.type, "object", `${name} is an object schema`);

  // Every declared field exists with the specified type — and nothing extra snuck in.
  for (const [field, type] of Object.entries(spec.fields)) {
    assert.ok(schema.properties[field], `${name}.${field} declared`);
    assert.equal(schema.properties[field].type, type, `${name}.${field} type=${type}`);
  }
  assert.deepEqual(
    Object.keys(schema.properties).sort(),
    Object.keys(spec.fields).sort(),
    `${name} properties are exactly the specified field list`,
  );

  // All fields optional.
  assert.ok(!schema.required || schema.required.length === 0, `${name} has no required fields`);

  // Backend-only RLS on every operation.
  for (const op of ["create", "read", "update", "delete"]) {
    assert.equal(
      schema.rls?.[op]?.user_condition?.role,
      spec.role,
      `${name}.rls.${op} locked to ${spec.role}`,
    );
  }
}

// Nested shapes.
assert.equal(schemas.CatalogPartGroup.properties.part_ids.items.type, "string", "part_ids is array<string>");
const rateProps = schemas.PricingModifier.properties.rates.items.properties;
assert.equal(schemas.PricingModifier.properties.rates.items.type, "object", "rates is array<object>");
for (const [k, t] of Object.entries({ label: "string", retail: "number", cost: "number", per_unit: "string" })) {
  assert.equal(rateProps[k]?.type, t, `rates[].${k} is ${t}`);
}
assert.match(
  schemas.PricingModifier.properties.input_type.description,
  /text \| number \| select \| checkbox \| formula/,
  "input_type documents the enum as string+description",
);
assert.equal(schemas.CatalogPartGroup.properties.shared_defaults.additionalProperties, true, "shared_defaults is an open object");
assert.equal(schemas.ModifierOption.properties.rate_overrides.additionalProperties, true, "rate_overrides is an open object");

// CatalogPartGroup is a catalog-inheritance registry — NOT an estimate-internal BuilderPartGroup.
const builderGroup = entity("BuilderPartGroup");
assert.ok(builderGroup.properties.builder_product_id, "BuilderPartGroup is scoped to one builder_product_id");
assert.ok(!schemas.CatalogPartGroup.properties.builder_product_id, "CatalogPartGroup is product-agnostic");
assert.ok(!builderGroup.properties.shared_defaults, "BuilderPartGroup has no shared_defaults inheritance bag");
assert.ok(!builderGroup.properties.part_ids, "BuilderPartGroup membership lives on parts, not an id list");

console.log("PASS partgroups + modifiers schema (3 entities, 21 fields, backend-only RLS)");

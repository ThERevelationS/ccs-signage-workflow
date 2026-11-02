import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Entity .jsonc files may carry comments (see BuilderPart.jsonc) — strip before parse,
// same helper as scripts/test-admin-write-authorization.mjs.
const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/[^\n]*/g, "$1");
const entity = (name) =>
  JSON.parse(stripComments(readFileSync(new URL(`../base44/entities/${name}.jsonc`, import.meta.url), "utf8")));

const OPS = ["create", "read", "update", "delete"];

function assertBackendOnly(schema, name, role) {
  assert.equal(schema.name, name, `${name}.name matches filename`);
  assert.equal(schema.type, "object", `${name}.type is object`);
  assert.ok(schema.properties && typeof schema.properties === "object", `${name}.properties present`);
  for (const op of OPS) {
    assert.equal(
      schema.rls?.[op]?.user_condition?.role,
      role,
      `${name} rls.${op} gated on ${role}`
    );
  }
  assert.ok(
    !Array.isArray(schema.required) || schema.required.length === 0,
    `${name} fields all optional (no required[])`
  );
}

// --- A-04 PricingTemplate: named qty-break x customer-tier margin charts ----------
const pt = entity("PricingTemplate");
assertBackendOnly(pt, "PricingTemplate", "__pricingtemplate_backend_only__");

const ptFields = {
  name: "string",
  unit_category: "string",
  breaks: "array",
  market_based: "boolean",
  description: "string",
  sort: "number",
  status: "string",
};
for (const [field, type] of Object.entries(ptFields)) {
  assert.equal(pt.properties[field]?.type, type, `PricingTemplate.${field} is ${type}`);
}

// breaks[] items: { qty:number, tier_markups:{ tier-name -> markup_pct number } }
const breakItem = pt.properties.breaks.items;
assert.equal(breakItem?.type, "object", "PricingTemplate.breaks[] items are objects");
assert.equal(breakItem.properties?.qty?.type, "number", "breaks[].qty is number");
assert.equal(breakItem.properties?.tier_markups?.type, "object", "breaks[].tier_markups is object map");
assert.equal(
  breakItem.properties?.tier_markups?.additionalProperties?.type,
  "number",
  "tier_markups values are markup_pct numbers"
);

// --- A-07 GlobalPricingTier: named shared rule sets ------------------------------
const gpt = entity("GlobalPricingTier");
assertBackendOnly(gpt, "GlobalPricingTier", "__globalpricingtier_backend_only__");

const gptFields = {
  name: "string",
  rules: "array",
  description: "string",
  status: "string",
};
for (const [field, type] of Object.entries(gptFields)) {
  assert.equal(gpt.properties[field]?.type, type, `GlobalPricingTier.${field} is ${type}`);
}

// rules[] items: { tier:string, markup_pct:number, market_based:boolean }
const ruleItem = gpt.properties.rules.items;
assert.equal(ruleItem?.type, "object", "GlobalPricingTier.rules[] items are objects");
assert.equal(ruleItem.properties?.tier?.type, "string", "rules[].tier is string");
assert.equal(ruleItem.properties?.markup_pct?.type, "number", "rules[].markup_pct is number");
assert.equal(ruleItem.properties?.market_based?.type, "boolean", "rules[].market_based is boolean");

console.log("PASS pricing entity schemas (PricingTemplate: 7 fields; GlobalPricingTier: 4 fields; backend-only RLS)");

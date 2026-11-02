// A-21 contract check: GlobalSettings entity schema declares the five new
// optional settings keys with their nested subfields, without disturbing the
// existing setting_key/setting_value KV contract or the backend-only RLS.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const schemaPath = join(here, '..', 'base44', 'entities', 'GlobalSettings.jsonc');
const raw = readFileSync(schemaPath, 'utf8');
// .jsonc tolerance: strip line/block comments before parsing.
const stripped = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1');
const schema = JSON.parse(stripped);

assert.equal(schema.name, 'GlobalSettings');
assert.equal(schema.type, 'object');
assert.ok(schema.properties, 'schema.properties missing');
const props = schema.properties;

// --- existing KV contract untouched ---
assert.equal(props.setting_key?.type, 'string', 'setting_key must remain a string');
assert.equal(props.setting_value?.type, 'object', 'setting_value must remain an object');
assert.deepEqual(schema.required, ['setting_key'], 'required must still be exactly [setting_key]');
assert.equal(
  schema.rls?.read?.user_condition?.role,
  '__globalsettings_backend_only__',
  'RLS must remain backend-only',
);

// --- A-21: five new keys present ---
const NEW_KEYS = ['hoursOfOperation', 'emailDelivery', 'deadlineRules', 'creditTermsDefaults', 'autoInactiveMonths'];
for (const key of NEW_KEYS) {
  assert.ok(props[key], `missing property: ${key}`);
  assert.ok(!schema.required.includes(key), `${key} must be optional (not in required)`);
}

// --- hoursOfOperation: {sales_center_hours:array, production_hours:array} ---
assert.equal(props.hoursOfOperation.type, 'object');
const hours = props.hoursOfOperation.properties;
assert.ok(hours, 'hoursOfOperation.properties missing');
assert.equal(hours.sales_center_hours?.type, 'array');
assert.equal(hours.production_hours?.type, 'array');

// --- emailDelivery: {enabled:boolean, default_from:string, authorized_domains:array<string>, from_salesperson_toggle:boolean} ---
assert.equal(props.emailDelivery.type, 'object');
const email = props.emailDelivery.properties;
assert.ok(email, 'emailDelivery.properties missing');
assert.equal(email.enabled?.type, 'boolean');
assert.equal(email.default_from?.type, 'string');
assert.equal(email.authorized_domains?.type, 'array');
assert.equal(email.authorized_domains?.items?.type, 'string', 'authorized_domains items must be string');
assert.equal(email.from_salesperson_toggle?.type, 'boolean');

// --- deadlineRules: {recalc_on_proof_approval:boolean, respect_hard_dates:boolean} ---
assert.equal(props.deadlineRules.type, 'object');
const rules = props.deadlineRules.properties;
assert.ok(rules, 'deadlineRules.properties missing');
assert.equal(rules.recalc_on_proof_approval?.type, 'boolean');
assert.equal(rules.respect_hard_dates?.type, 'boolean');

// --- creditTermsDefaults: {terms_days:number, credit_limit:number} ---
assert.equal(props.creditTermsDefaults.type, 'object');
const credit = props.creditTermsDefaults.properties;
assert.ok(credit, 'creditTermsDefaults.properties missing');
assert.equal(credit.terms_days?.type, 'number');
assert.equal(credit.credit_limit?.type, 'number');

// --- autoInactiveMonths: number ---
assert.equal(props.autoInactiveMonths.type, 'number');

console.log('PASS schema-globalsettings');

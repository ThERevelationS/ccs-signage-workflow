// Contract checks for the notification template work (masterplan item H-02):
//  - base44/entities/NotificationTemplate.jsonc   — templated customer notification
//    registry (new, backend-only RLS, CoreBridge kind enum + placeholder_map)
//  - base44/functions/seedNotificationTemplates/* — session-authed, admin-gated
//    seed_notification_templates installer; the 15 CoreBridge defaults land
//    idempotently via creation_request_key 'seed-tpl-<key>'
//
// Run: node scripts/test-notification-templates.mjs  →  prints "PASS notification-templates"

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));
const readText = (p) => readFileSync(join(root, p), 'utf8');

let failures = 0;
let checks = 0;
const check = (cond, msg) => {
  checks += 1;
  if (cond) return;
  failures += 1;
  console.error('FAIL', msg);
};

// ---------- NotificationTemplate entity ----------

const tpl = readJson('base44/entities/NotificationTemplate.jsonc');
const props = tpl.properties || {};

check(tpl.name === 'NotificationTemplate', 'NotificationTemplate.name is "NotificationTemplate"');
check(tpl.type === 'object', 'NotificationTemplate.type is "object"');

check(props.schema_version?.type === 'number', 'schema_version is a number');
check(props.creation_request_key?.type === 'string', 'creation_request_key is a string');
check(props.key?.type === 'string', 'key is a string');
check(props.name?.type === 'string', 'name is a string');
check(props.subject?.type === 'string', 'subject is a string');
check(props.body?.type === 'string', 'body is a string');
check(props.cc_billing?.type === 'boolean', 'cc_billing is a boolean');
check(props.attach_pdf?.type === 'boolean', 'attach_pdf is a boolean');
check(props.status?.type === 'string', 'status is a string');
check(props.updated_by?.type === 'string', 'updated_by is a string');

for (const src of ['location', 'salesperson', 'company']) {
  check(
    Array.isArray(props.from_source?.enum) && props.from_source.enum.includes(src),
    `from_source enum includes "${src}"`,
  );
}

const KINDS = [
  'estimate_ready',
  'new_order',
  'action_needed',
  'proof_ready',
  'built',
  'completed',
  'payment_due_5day',
  'monthly_statement',
  'estimate_follow_up_1',
  'estimate_follow_up_2',
  'proof_follow_up_1',
  'proof_follow_up_2',
  'credit_memo',
  'multi_invoice',
  'login_info',
  'custom',
];
for (const k of KINDS) {
  check(
    Array.isArray(props.kind?.enum) && props.kind.enum.includes(k),
    `kind enum includes "${k}"`,
  );
}
check(props.kind?.enum?.length === 16, 'kind enum is exactly the 15 seeded kinds + custom');

check(
  Array.isArray(props.status?.enum) && props.status.enum.includes('active') && props.status.enum.includes('inactive'),
  'status enum is active|inactive',
);
check(props.status?.default === 'active', 'status default is active');
check(props.from_source?.default === 'location', 'from_source default is location');

check(props.placeholder_map?.type === 'array', 'placeholder_map is an array');
check(props.placeholder_map?.items?.type === 'object', 'placeholder_map items are objects');
check(
  props.placeholder_map?.items?.properties?.placeholder?.type === 'string' &&
    props.placeholder_map?.items?.properties?.description?.type === 'string',
  'placeholder_map items carry {placeholder, description}',
);

check(
  !Array.isArray(tpl.required) || tpl.required.length === 0,
  'NotificationTemplate fields are all optional (required is empty/absent)',
);

for (const op of ['create', 'read', 'update', 'delete']) {
  check(
    tpl.rls?.[op]?.user_condition?.role === '__notification_template_backend_only__',
    `NotificationTemplate.rls.${op} is backend-only (__notification_template_backend_only__)`,
  );
}

// ---------- function.jsonc ----------

const fn = readJson('base44/functions/seedNotificationTemplates/function.jsonc');
check(fn.name === 'seedNotificationTemplates', 'function.jsonc name is seedNotificationTemplates');
check(fn.entry === 'entry.ts', 'function.jsonc entry is entry.ts');

// ---------- seed function source ----------

const src = readText('base44/functions/seedNotificationTemplates/entry.ts');

check(src.includes('authenticateSignShopSession'), 'entry.ts authenticates the sign-shop session');
check(
  src.includes("user?.role !== 'admin'") || src.includes("actor?.role !== 'admin'"),
  'entry.ts is admin-gated (role !== admin rejected)',
);
check(src.includes("'seed_notification_templates'"), "entry.ts serves the 'seed_notification_templates' action");
check(src.includes('createFoundationRecordWithRecovery'), 'entry.ts uses createFoundationRecordWithRecovery');
check(src.includes('seed-tpl-'), "entry.ts writes 'seed-tpl-' creation_request_key receipts");
check(src.includes('asServiceRole.entities.NotificationTemplate'), 'entry.ts uses service-role NotificationTemplate entity');
check(src.includes('TEMPLATE_SEED_ROWS'), 'entry.ts declares the TEMPLATE_SEED_ROWS seed set');

// Every seeded kind must appear in the seed source as a `kind:` literal.
const SEEDED_KINDS = KINDS.filter((k) => k !== 'custom');
for (const k of SEEDED_KINDS) {
  check(src.includes(`kind: '${k}'`), `seed source declares kind '${k}'`);
}
check(!src.includes("kind: 'custom'"), "seed source does not seed a 'custom' row");

// Every seeded key appears as a `key:` literal (key = kind for seeded rows).
for (const k of SEEDED_KINDS) {
  check(src.includes(`key: '${k}'`), `seed source declares key '${k}'`);
}

// Each seed row carries subject + body + placeholder_map + the three toggles.
for (const k of SEEDED_KINDS) {
  const keyIdx = src.indexOf(`key: '${k}'`);
  const nextKeyIdx = src.indexOf("key: '", keyIdx + 1);
  const block = nextKeyIdx === -1 ? src.slice(keyIdx) : src.slice(keyIdx, nextKeyIdx);
  check(block.includes('subject:'), `seed row '${k}' has a subject`);
  check(block.includes('body:'), `seed row '${k}' has a body`);
  check(block.includes('from_source:'), `seed row '${k}' has a from_source`);
  check(block.includes('cc_billing:'), `seed row '${k}' has a cc_billing default`);
  check(block.includes('attach_pdf:'), `seed row '${k}' has an attach_pdf default`);
  check(block.includes('placeholder_map:'), `seed row '${k}' has a placeholder_map`);
}

// The placeholder vocabulary the brief requires shows up in the seeded templates.
for (const ph of [
  'customer.company_name',
  'order.title',
  'estimate.number',
  'user.display_name',
  'location.name',
]) {
  check(src.includes(`{{${ph}}}`), `seed bodies use the {{${ph}}} placeholder`);
}

// from_source assignments stay inside the declared enum.
const fromSources = new Set([...src.matchAll(/from_source: '([^']+)'/g)].map((m) => m[1]));
for (const s of fromSources) {
  check(['location', 'salesperson', 'company'].includes(s), `seed from_source '${s}' is a valid enum value`);
}

// 15 rows seeded — count `key:` literals inside the seed array.
const seedArrayMatch = src.match(/const TEMPLATE_SEED_ROWS = \[([\s\S]*?)\n\];/);
check(Boolean(seedArrayMatch), 'TEMPLATE_SEED_ROWS array literal is parseable from source');
if (seedArrayMatch) {
  const rowCount = (seedArrayMatch[1].match(/key: '/g) || []).length;
  check(rowCount === 15, `TEMPLATE_SEED_ROWS seeds exactly 15 templates (got ${rowCount})`);
}

// ---------- result ----------

if (failures > 0) {
  console.error(`${failures} of ${checks} check(s) failed`);
  process.exit(1);
}
if (checks < 20) {
  console.error(`expected >=20 asserts, ran ${checks}`);
  process.exit(1);
}
console.log(`PASS notification-templates (${checks} checks)`);

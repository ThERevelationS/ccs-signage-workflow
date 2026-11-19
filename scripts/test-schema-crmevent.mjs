// Contract checks for the CRM event taxonomy work (masterplan items A-12 / A-13):
//  - base44/entities/CrmEventType.jsonc      — typed event taxonomy registry (new, backend-only RLS)
//  - base44/entities/OpportunityActivity.jsonc — extended with event_type_id + completed_by
//    (completed_at / due_at / assigned_to / outcome already existed — due_date intentionally NOT duplicated)
//  - scripts/crm-event-type-seed.json        — CoreBridge seed taxonomy for the orchestrator to insert
//
// Run: node scripts/test-schema-crmevent.mjs  →  prints "PASS schema-crmevent"

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));

let failures = 0;
const check = (cond, msg) => {
  if (cond) return;
  failures += 1;
  console.error('FAIL', msg);
};

// ---------- A-12: CrmEventType entity ----------

const evt = readJson('base44/entities/CrmEventType.jsonc');
const evp = evt.properties || {};

check(evt.name === 'CrmEventType', 'CrmEventType.name is "CrmEventType"');
check(evt.type === 'object', 'CrmEventType.type is "object"');

check(evp.channel?.type === 'string', 'CrmEventType.channel is a string');
for (const ch of ['call', 'email', 'visit', 'consultation', 'redo']) {
  check(
    Array.isArray(evp.channel?.enum) && evp.channel.enum.includes(ch),
    `CrmEventType.channel enum includes "${ch}"`,
  );
}
check(evp.label?.type === 'string', 'CrmEventType.label is a string');
check(evp.sort?.type === 'number', 'CrmEventType.sort is a number');
check(evp.is_custom?.type === 'boolean', 'CrmEventType.is_custom is a boolean');
check(evp.status?.type === 'string', 'CrmEventType.status is a string');

check(
  !Array.isArray(evt.required) || evt.required.length === 0,
  'CrmEventType fields are all optional (required is empty/absent)',
);

for (const op of ['create', 'read', 'update', 'delete']) {
  check(
    evt.rls?.[op]?.user_condition?.role === '__crmeventtype_backend_only__',
    `CrmEventType.rls.${op} is backend-only (__crmeventtype_backend_only__)`,
  );
}

// ---------- A-13: OpportunityActivity extension ----------

const oa = readJson('base44/entities/OpportunityActivity.jsonc');
const oap = oa.properties || {};

// Newly added by A-13
check(oap.event_type_id?.type === 'string', 'OpportunityActivity.event_type_id is a string');
check(oap.completed_by?.type === 'string', 'OpportunityActivity.completed_by is a string');

// Requested fields that already existed — assert present, not duplicated
check(oap.completed_at?.type === 'string', 'OpportunityActivity.completed_at is a string');
check(oap.assigned_to?.type === 'string', 'OpportunityActivity.assigned_to is a string');
check(oap.outcome?.type === 'string', 'OpportunityActivity.outcome is a string');

// Due coverage: due_at already existed before A-13, so due_date must NOT have been duplicated
check(
  oap.due_at?.type === 'string' || oap.due_date?.type === 'string',
  'OpportunityActivity has a due/date field (due_at)',
);
check(!oap.due_date, 'OpportunityActivity.due_date is absent (due_at already covers due/date — no duplicate)');

// ---------- A-12: CoreBridge seed taxonomy ----------

const seed = readJson('scripts/crm-event-type-seed.json');
check(Array.isArray(seed), 'seed JSON parses to an array');
check(Array.isArray(seed) && seed.length >= 11, `seed has >=11 rows (got ${seed.length})`);

const allowedChannels = new Set(['call', 'email', 'visit', 'consultation', 'redo']);
if (Array.isArray(seed)) {
  seed.forEach((row, i) => {
    check(
      row && typeof row.channel === 'string' && allowedChannels.has(row.channel),
      `seed[${i}].channel is one of call|email|visit|consultation|redo`,
    );
    check(row && typeof row.label === 'string' && row.label.length > 0, `seed[${i}].label is a non-empty string`);
    check(row && typeof row.sort === 'number' && Number.isFinite(row.sort), `seed[${i}].sort is a number`);
    check(row && row.is_custom === false, `seed[${i}].is_custom is false`);
  });

  // Every channel:label pair the brief listed must be present
  const expected = [
    'call:AR/Collections',
    'call:Estimate Follow Up',
    'call:Prospecting',
    'call:Proof',
    'email:Estimate',
    'email:Follow Up',
    'visit:Installation',
    'visit:Sales',
    'visit:Site Survey',
    'consultation:General',
    'redo:Redo',
  ];
  const present = new Set(seed.map((r) => `${r.channel}:${r.label}`));
  for (const pair of expected) {
    check(present.has(pair), `seed contains "${pair}"`);
  }
}

// ---------- result ----------

if (failures > 0) {
  console.error(`${failures} check(s) failed`);
  process.exit(1);
}
console.log('PASS schema-crmevent');

// Contract checks for masterplan item A-20 — SavedQueueView entity backing:
//  - base44/entities/SavedQueueView.jsonc      — new entity (all-optional, backend-only RLS)
//  - gateway wiring stays intact              — staffDataRead STAFF_READABLE + staffEntityWrite WRITE_OPS
//  - persistence routes through the gateway   — savedViewsPersistence.js uses staffEntities (not localStorage)
//
// Run: node scripts/test-schema-savedqueueview.mjs  →  prints "PASS schema-savedqueueview"

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));
const readText = (p) => readFileSync(join(root, p), 'utf8');

let failures = 0;
const check = (cond, msg) => {
  if (cond) return;
  failures += 1;
  console.error('FAIL', msg);
};

// ---------- entity schema ----------

const ent = readJson('base44/entities/SavedQueueView.jsonc');
const p = ent.properties || {};

check(ent.name === 'SavedQueueView', 'SavedQueueView.name is "SavedQueueView"');
check(ent.type === 'object', 'SavedQueueView.type is "object"');

// Fields the persistence layer (savedViewsPersistence.js) writes today
check(p.name?.type === 'string', 'SavedQueueView.name is a string');
check(p.queue_lens?.type === 'string', 'SavedQueueView.queue_lens is a string (queue surface)');
for (const lens of ['design', 'production', 'fulfillment', 'all']) {
  check(
    Array.isArray(p.queue_lens?.enum) && p.queue_lens.enum.includes(lens),
    `SavedQueueView.queue_lens enum includes "${lens}"`,
  );
}
check(p.filters?.type === 'object', 'SavedQueueView.filters is an object (serialized filter state)');
check(p.owner_email?.type === 'string', 'SavedQueueView.owner_email is a string');
check(p.is_shared?.type === 'boolean', 'SavedQueueView.is_shared is a boolean');
check(
  p.creation_request_key?.type === 'string',
  'SavedQueueView.creation_request_key is a string (idempotent-create key)',
);

// Spec'd fields (forward-compatible aliases + C-03 pin/default/status support)
check(p.user_email?.type === 'string', 'SavedQueueView.user_email is a string');
check(p.page?.type === 'string', 'SavedQueueView.page is a string');
check(p.shared?.type === 'boolean', 'SavedQueueView.shared is a boolean');
check(p.pinned?.type === 'boolean', 'SavedQueueView.pinned is a boolean');
check(p.sort?.type === 'number', 'SavedQueueView.sort is a number');
check(p.is_default?.type === 'boolean', 'SavedQueueView.is_default is a boolean');
check(p.status?.type === 'string', 'SavedQueueView.status is a string');

// All fields optional
check(
  !Array.isArray(ent.required) || ent.required.length === 0,
  'SavedQueueView fields are all optional (required is empty/absent)',
);

// Backend-only RLS on every op — access flows through staffDataRead/staffEntityWrite
for (const op of ['create', 'read', 'update', 'delete']) {
  check(
    ent.rls?.[op]?.user_condition?.role === '__savedqueueview_backend_only__',
    `SavedQueueView.rls.${op} is backend-only (__savedqueueview_backend_only__)`,
  );
}

// ---------- gateway wiring ----------

const readGw = readText('base44/functions/staffDataRead/entry.ts');
check(
  /'SavedQueueView'/.test(readGw),
  "staffDataRead STAFF_READABLE includes 'SavedQueueView'",
);

const writeGw = readText('base44/functions/staffEntityWrite/entry.ts');
const writeLine = writeGw.split('\n').find((l) => l.includes('SavedQueueView'));
check(!!writeLine, 'staffEntityWrite WRITE_OPS includes SavedQueueView');
for (const op of ['create', 'updateMany', 'delete']) {
  check(
    !!writeLine && writeLine.includes(`'${op}'`),
    `staffEntityWrite SavedQueueView allows '${op}'`,
  );
}

// ---------- persistence routing (decision: gateway-ready, not localStorage-only) ----------

const persist = readText('src/components/queues/savedViewsPersistence.js');
check(
  persist.includes('staffEntities.SavedQueueView'),
  'savedViewsPersistence.js resolves the entity via staffEntities.SavedQueueView (gateway facade)',
);
check(
  !persist.includes('localStorage'),
  'savedViewsPersistence.js does not use localStorage (persistence is gateway-backed)',
);
check(
  persist.includes('loadAllEntityRows'),
  'savedViewsPersistence.js reads via loadAllEntityRows (paged gateway reads)',
);
check(
  persist.includes('ensureIdempotentEntityCreate'),
  'savedViewsPersistence.js creates via ensureIdempotentEntityCreate (retry-safe)',
);

// ---------- result ----------

if (failures > 0) {
  console.error(`${failures} check(s) failed`);
  process.exit(1);
}
console.log('PASS schema-savedqueueview');

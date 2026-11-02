// Contract check for masterplan item A-19: FeatureReport schema coverage.
//  - base44/entities/FeatureReport.jsonc must carry every stored field the
//    deployed manageFeatureReports function reads/writes (title, description,
//    type, priority, status, submitted_by_name, submitted_by_email,
//    completed_date, admin_notes — enums must match the function's TYPES /
//    PRIORITIES / STATUSES sets), plus the report-catalog spec fields:
//    report_key, category, data_source, parameters_schema, default_filters,
//    export_formats, is_system, sort.
//  - All fields optional (required stays exactly [title, type]); RLS stays
//    backend-only; existing properties unmodified (shape pinned below).
//
// Run: node scripts/test-schema-featurereport.mjs  →  prints "PASS schema-featurereport"

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

const fr = readJson('base44/entities/FeatureReport.jsonc');
const p = fr.properties || {};

check(fr.name === 'FeatureReport', 'FeatureReport.name is "FeatureReport"');
check(fr.type === 'object', 'FeatureReport.type is "object"');

// ---------- Fields read/written by base44/functions/manageFeatureReports/entry.ts ----------

// title — cleanCreateInput (required, max 500), cleanAdminPatch, createWithRecovery title-filter dedupe
check(p.title?.type === 'string', 'FeatureReport.title is a string (function: create/patch/dedupe filter)');
// description — create + admin patch
check(p.description?.type === 'string', 'FeatureReport.description is a string (function: create/patch)');
// type — validated against TYPES = {bug, feature, improvement}
for (const t of ['bug', 'feature', 'improvement']) {
  check(
    Array.isArray(p.type?.enum) && p.type.enum.includes(t),
    `FeatureReport.type enum includes "${t}" (function TYPES set)`,
  );
}
check(p.type?.default === 'feature', 'FeatureReport.type default is "feature" (function default)');
// priority — validated against PRIORITIES = {low, medium, high, critical}
for (const pr of ['low', 'medium', 'high', 'critical']) {
  check(
    Array.isArray(p.priority?.enum) && p.priority.enum.includes(pr),
    `FeatureReport.priority enum includes "${pr}" (function PRIORITIES set)`,
  );
}
check(p.priority?.default === 'medium', 'FeatureReport.priority default is "medium" (function default)');
// status — validated against STATUSES = {open, in_progress, completed}; list() filters on it
for (const st of ['open', 'in_progress', 'completed']) {
  check(
    Array.isArray(p.status?.enum) && p.status.enum.includes(st),
    `FeatureReport.status enum includes "${st}" (function STATUSES set / list scope filter)`,
  );
}
check(p.status?.default === 'open', 'FeatureReport.status default is "open" (create hard-codes open)');
// submitted_by_name / submitted_by_email — written on create; email stripped for non-admin viewers
check(p.submitted_by_name?.type === 'string', 'FeatureReport.submitted_by_name is a string (function: create write)');
check(p.submitted_by_email?.type === 'string', 'FeatureReport.submitted_by_email is a string (function: create write, admin-only view)');
// completed_date — status-derived write; sort key for completed scope ('-completed_date')
check(p.completed_date?.type === 'string', 'FeatureReport.completed_date is a string (function: status-derived write, sort)');
check(p.completed_date?.format === 'date-time', 'FeatureReport.completed_date format is date-time');
// admin_notes — admin patch write; stripped for non-admin viewers
check(p.admin_notes?.type === 'string', 'FeatureReport.admin_notes is a string (function: admin patch, admin-only view)');

// ---------- A-19 catalog spec fields (all optional) ----------

check(p.report_key?.type === 'string', 'FeatureReport.report_key is a string (stable catalog key)');
check(p.category?.type === 'string', 'FeatureReport.category is a string (report grouping e.g. sales|production|financial|queue)');
check(p.data_source?.type === 'string', 'FeatureReport.data_source is a string (entity/query source)');
check(p.parameters_schema?.type === 'object', 'FeatureReport.parameters_schema is an object (JSON-schema-ish param definition)');
check(p.default_filters?.type === 'object', 'FeatureReport.default_filters is an object (default filter values)');
check(
  p.export_formats?.type === 'array' && p.export_formats?.items?.type === 'string',
  'FeatureReport.export_formats is an array of strings (csv|pdf|xlsx)',
);
check(p.is_system?.type === 'boolean', 'FeatureReport.is_system is a boolean (built-in vs user-created)');
check(p.is_system?.default === false, 'FeatureReport.is_system default is false');
check(p.sort?.type === 'number', 'FeatureReport.sort is a number (catalog ordering)');

// ---------- Constraints: catalog fields optional; existing contract untouched ----------

check(
  Array.isArray(fr.required) && fr.required.length === 2 && fr.required.includes('title') && fr.required.includes('type'),
  'FeatureReport.required is exactly [title, type] — no catalog field required',
);
for (const f of ['report_key', 'category', 'data_source', 'parameters_schema', 'default_filters', 'export_formats', 'is_system', 'sort']) {
  check(!fr.required?.includes(f), `FeatureReport.${f} is optional (not in required)`);
}

for (const op of ['create', 'read', 'update', 'delete']) {
  check(
    fr.rls?.[op]?.user_condition?.role === '__feature_report_backend_only__',
    `FeatureReport.rls.${op} stays backend-only (__feature_report_backend_only__)`,
  );
}

// ---------- result ----------

if (failures > 0) {
  console.error(`${failures} check(s) failed`);
  process.exit(1);
}
console.log('PASS schema-featurereport');

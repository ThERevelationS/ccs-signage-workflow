import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Scale-read contract for opportunityWorkspaceAction: no silently-capped
// entity reads in list/search/backup actions. Paged loader or explicit
// limit >= 500 required; scoped-by-id filters may keep a <= 200 cap;
// unique-key lookups may omit a limit; the recency-capped feeds
// (attention_feed, customer_workspace) must publish truncated flags.
const entry = readFileSync(
  process.env.OWA_ENTRY || 'base44/functions/opportunityWorkspaceAction/entry.ts',
  'utf8',
);

// ---- shared paged loader wired in ---------------------------------------
assert.match(
  entry,
  /import\s*\{\s*loadAllEntityRows\s*\}\s*from\s*["']\.\.\/\.\.\/shared\/pagedEntityRows\.ts["']/,
  'entry.ts must import loadAllEntityRows from base44/shared/pagedEntityRows.ts',
);

// ---- hoisted row helper --------------------------------------------------
// `list` used to be declared inside the attention_feed block only; every
// earlier action that called list() (send_digest, bulk_remarkup,
// export/import_estimate, copy_bom, copy_sections) threw ReferenceError.
assert.match(
  entry,
  /^const list = \(v: any\) => \(Array\.isArray\(v\) \? v : \[\]\);/m,
  'the row-array helper must be hoisted to module scope',
);

// ---- regex pushdown helpers ----------------------------------------------
assert.match(entry, /escapeRegex\s*=\s*\(value: string\)/, 'escapeRegex helper required');
assert.match(entry, /\$or:\s*fields\.map/, 'regexOr must fan the term across fields');
assert.match(entry, /\$regex:\s*escapeRegex\(/, 'regex terms must be escaped before pushdown');

// ---- per-action block extraction -----------------------------------------
const marks = [];
const blockRe = /if \(action === "([a-z_0-9]+)"\) \{/g;
let m;
while ((m = blockRe.exec(entry))) marks.push({ name: m[1], start: m.index });
const blocks = {};
marks.forEach((mk, i) => {
  blocks[mk.name] = entry.slice(mk.start, marks[i + 1] ? marks[i + 1].start : entry.length);
});

for (const action of [
  'full_backup', 'send_digest', 'bulk_remarkup', 'attention_feed',
  'search_customers', 'list_opportunities', 'global_search',
  'list_estimating_requests', 'list_follow_ups', 'get_customer_360',
]) {
  assert.ok(blocks[action], `expected an "${action}" action block`);
}

// ---- entity .filter( call extraction --------------------------------------
// Skips array-side .filter((x) => ...) callbacks; keeps entity reads whose
// first arg is an object literal or a constructed query (regexOr, variable).
const CONST_LIMITS = {
  SEARCH_LIMIT: 500,
  FETCH_LIMIT: 1000,
  LIST_CAP: 500,
  ACTIVITY_CAP: 50,
};

function resolveLimit(raw) {
  if (raw == null) return null;
  let expr = raw.trim();
  if (!expr) return null;
  for (const [name, value] of Object.entries(CONST_LIMITS)) {
    expr = expr.replace(new RegExp(`\\b${name}\\b`, 'g'), String(value));
  }
  if (!/^[\d\s+]+$/.test(expr)) return null;
  const total = expr.split('+').reduce((sum, part) => sum + Number(part.trim() || 0), 0);
  return Number.isFinite(total) ? total : null;
}

function splitTopLevel(args) {
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < args.length; i += 1) {
    const c = args[i];
    if (c === '"' || c === "'" || c === '`') {
      const q = c;
      i += 1;
      while (i < args.length && args[i] !== q) {
        if (args[i] === '\\') i += 1;
        i += 1;
      }
      continue;
    }
    if (c === '(' || c === '{' || c === '[') depth += 1;
    else if (c === ')' || c === '}' || c === ']') depth -= 1;
    else if (c === ',' && depth === 0) {
      parts.push(args.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(args.slice(start));
  return parts;
}

function entityFilterCalls(src) {
  const calls = [];
  let idx = 0;
  while ((idx = src.indexOf('.filter(', idx)) !== -1) {
    const open = src.indexOf('(', idx);
    let depth = 0;
    let end = -1;
    for (let i = open; i < src.length; i += 1) {
      const c = src[i];
      if (c === '"' || c === "'" || c === '`') {
        const q = c;
        i += 1;
        while (i < src.length && src[i] !== q) {
          if (src[i] === '\\') i += 1;
          i += 1;
        }
        continue;
      }
      if (c === '(') depth += 1;
      else if (c === ')') {
        depth -= 1;
        if (depth === 0) { end = i; break; }
      }
    }
    if (end === -1) break;
    const args = src.slice(open + 1, end);
    const first = args.trimStart();
    // Array callbacks: (x) =>, function, identifiers (Boolean, matchesQuery),
    // destructuring params ({...}) => / ([k, v]) => — all start with ( or an
    // identifier followed by => or end-of-args. Entity queries start with {
    // or a query-constructor call like regexOr(...
    const isArrayCallback =
      first.startsWith('(')
      || /^function\b/.test(first)
      || /^async\b/.test(first)
      || /^[_a-zA-Z$][\w$]*\s*=>/.test(first)
      || /^[_a-zA-Z$][\w$]*\s*$/.test(first);
    if (!isArrayCallback) {
      calls.push({ args, call: src.slice(idx, end + 1) });
    }
    idx = end + 1;
  }
  return calls;
}

const UNIQUE_KEY = /(\bid\b|creation_request_key|config_name|\bemail\b)\s*:/;
const SCOPED_KEY = /(\b[a-zA-Z]*_id\b|\bid\b|creation_request_key|config_name|\bemail\b)\s*:/;

function violations(blockSrc, { cappedOk }) {
  const out = [];
  for (const { args, call } of entityFilterCalls(blockSrc)) {
    const parts = splitTopLevel(args);
    const query = (parts[0] || '').trim();
    const limit = resolveLimit(parts[2]);
    if (limit != null && limit >= 500) continue; // explicit deep read
    if (cappedOk && limit != null) continue;      // recency-capped feed: explicit bound required
    if (UNIQUE_KEY.test(query)) continue;         // unique-key lookup, tiny result by definition
    if (SCOPED_KEY.test(query) && limit != null && limit <= 200) continue; // id-scoped bounded read
    out.push(call.length > 140 ? `${call.slice(0, 140)}…` : call);
  }
  return out;
}

// ---- strict rules: list / search / backup / digest / remarkup actions -----
const STRICT_ACTIONS = [
  'full_backup', 'send_digest', 'bulk_remarkup', 'search_customers',
  'list_opportunities', 'global_search', 'list_estimating_requests',
  'list_follow_ups', 'get_customer_360',
];
for (const action of STRICT_ACTIONS) {
  const bad = violations(blocks[action], { cappedOk: false });
  assert.deepEqual(bad, [], `${action} has under-limited entity reads:\n${bad.join('\n')}`);
}

// The same standard applies to every other action block (export, copy,
// detail views): scoped filters stay <= 200, unique keys may be unbounded.
for (const [name, src] of Object.entries(blocks)) {
  if (STRICT_ACTIONS.includes(name)) continue;
  if (name === 'attention_feed' || name === 'customer_workspace') continue;
  const bad = violations(src, { cappedOk: false });
  assert.deepEqual(bad, [], `${name} has under-limited entity reads:\n${bad.join('\n')}`);
}

// ---- recency-capped feeds must be explicit + honest -----------------------
for (const action of ['attention_feed', 'customer_workspace']) {
  const bad = violations(blocks[action], { cappedOk: true });
  assert.deepEqual(bad, [], `${action} has unbounded reads without a limit:\n${bad.join('\n')}`);
  assert.match(blocks[action], /truncated/, `${action} must publish per-bucket truncated flags`);
}

// ---- regex pushdown present in the search actions -------------------------
for (const action of ['global_search', 'search_customers']) {
  assert.match(blocks[action], /\$or/, `${action} must push the term down via $or`);
  assert.match(blocks[action], /\$regex/, `${action} must push the term down via $regex`);
  assert.match(blocks[action], /regexOr\(/, `${action} must build queries via regexOr`);
}

// ---- paged loader coverage in the previously-capped actions ---------------
for (const action of [
  'full_backup', 'send_digest', 'bulk_remarkup', 'search_customers',
  'list_opportunities', 'global_search', 'list_estimating_requests',
  'list_follow_ups', 'get_customer_360',
]) {
  assert.match(blocks[action], /loadAllEntityRows/, `${action} must read through the paged loader`);
}

// ---- send_digest regression: helper + today defined ------------------------
assert.match(blocks.send_digest, /const today =/, 'send_digest must define today (was a ReferenceError)');
assert.doesNotMatch(blocks.send_digest, /const list =/, 'send_digest must use the module-scope helper');
assert.doesNotMatch(blocks.list_opportunities, /const list =/, 'list_opportunities must use the module-scope helper');

console.log('PASS scale-reads');

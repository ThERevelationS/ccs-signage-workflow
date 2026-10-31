import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Scale-read contract for the second wave of silently-capped reads:
//   purchaseOrderAction.list_purchase_orders    default-50 -> paged + total_count
//   changeOrderAction.list_change_orders        default-50 -> paged + total_count
//   inventoryAction.list_stock / list_movements default-50 -> paged; 200 window keeps total_count
//   jobCostingAction.list_job_costs/get_job_cost 400/50 caps -> paged + total
//   customerPortalAction bootstrap/portal_inbox/mark_all_read/request_job_revision -> paged
//   boardFeed truncated flag on any clamped pull type
//   dataIntegrityAction orphan scan -> paged scan + scanned/truncated reporting
//   staffDataRead gateway -> cursor/fields pass-through, real count, truncated/returned

const F = (name) => `base44/functions/${name}/entry.ts`;
const read = (name) => readFileSync(F(name), 'utf8');

// ---- helpers --------------------------------------------------------------
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

// Entity reads are `<Capitalized>.filter/list(`, `entity.filter/list(`, or
// `entities.X[.]/entities[x].filter/list(` — array .filter((x)=>...) receivers
// are lowercase locals and never match.
const ENTITY_READ = /\b(?:[A-Z][A-Za-z0-9_]*|entity|entities(?:\.[A-Z][A-Za-z0-9_]*|\[[^\]]*\]))\s*\.\s*(filter|list)\s*\(/g;

function findEntityReads(src) {
  const calls = [];
  let m;
  ENTITY_READ.lastIndex = 0;
  while ((m = ENTITY_READ.exec(src))) {
    const open = src.indexOf('(', m.index + m[0].lastIndexOf('('));
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
    calls.push({ method: m[1], args: src.slice(open + 1, end), call: src.slice(m.index, end + 1) });
    ENTITY_READ.lastIndex = end + 1;
  }
  return calls;
}

// A call violates when it carries NO limit argument at all — the platform
// default of 50 rows then silently truncates the read. Explicit limits are
// deliberate bounds (a 200-row history window, a limit:1 existence probe) and
// unique-key lookups can never overflow a page.
function underLimitedReads(src) {
  const out = [];
  for (const { method, args, call } of findEntityReads(src)) {
    if (/creation_request_key/.test(args)) continue;
    if (/\blimit\b/.test(args)) continue; // options-object read carrying its own limit
    const parts = splitTopLevel(args).map((p) => p.trim());
    const hasLimit = method === 'filter' ? parts.length >= 3 && parts[2] !== '' : parts.length >= 2 && parts[1] !== '';
    if (hasLimit) continue;
    out.push(call.length > 160 ? `${call.slice(0, 160)}…` : call);
  }
  return out;
}

function actionBlocks(entry) {
  const marks = [];
  const blockRe = /if \(action === "([a-z_0-9]+)"\) \{/g;
  let m;
  while ((m = blockRe.exec(entry))) marks.push({ name: m[1], start: m.index });
  const blocks = {};
  marks.forEach((mk, i) => {
    blocks[mk.name] = entry.slice(mk.start, marks[i + 1] ? marks[i + 1].start : entry.length);
  });
  return blocks;
}

const PAGED_IMPORT = /import\s*\{\s*loadAllEntityRows\s*\}\s*from\s*["']\.\.\/\.\.\/shared\/pagedEntityRows\.ts["']/;

// ==== 1. purchaseOrderAction ==============================================
{
  const entry = read('purchaseOrderAction');
  assert.match(entry, PAGED_IMPORT, 'purchaseOrderAction must import loadAllEntityRows');
  const blocks = actionBlocks(entry);
  assert.ok(blocks.list_purchase_orders, 'list_purchase_orders block missing');
  assert.match(blocks.list_purchase_orders, /loadAllEntityRows\(/, 'list_purchase_orders must page its read');
  assert.match(blocks.list_purchase_orders, /total_count/, 'list_purchase_orders must return total_count');
  assert.match(blocks.list_purchase_orders, /truncated/, 'list_purchase_orders must return truncated');
  assert.deepEqual(underLimitedReads(blocks.list_purchase_orders), [], 'list_purchase_orders still has an under-limited read');
}

// ==== 2. changeOrderAction ================================================
{
  const entry = read('changeOrderAction');
  assert.match(entry, PAGED_IMPORT, 'changeOrderAction must import loadAllEntityRows');
  const blocks = actionBlocks(entry);
  assert.ok(blocks.list_change_orders, 'list_change_orders block missing');
  assert.match(blocks.list_change_orders, /loadAllEntityRows\(/, 'list_change_orders must page its read');
  assert.match(blocks.list_change_orders, /total_count/, 'list_change_orders must return total_count');
  assert.match(blocks.list_change_orders, /truncated/, 'list_change_orders must return truncated');
  assert.deepEqual(underLimitedReads(blocks.list_change_orders), [], 'list_change_orders still has an under-limited read');
}

// ==== 3. inventoryAction ==================================================
{
  const entry = read('inventoryAction');
  assert.match(entry, PAGED_IMPORT, 'inventoryAction must import loadAllEntityRows');
  const blocks = actionBlocks(entry);
  assert.match(blocks.list_stock, /loadAllEntityRows\(/, 'list_stock must page its read');
  assert.match(blocks.list_stock, /low_stock_count/, 'list_stock must keep low_stock_count');
  assert.match(blocks.list_stock, /total_count/, 'list_stock must return total_count');
  assert.match(blocks.list_stock, /truncated/, 'list_stock must return truncated');
  assert.deepEqual(underLimitedReads(blocks.list_stock), [], 'list_stock still has an under-limited read');
  // list_movements keeps its explicit 200-row history window but must tell
  // the caller how deep the log actually runs.
  assert.match(blocks.list_movements, /Movement\.filter\(query, "-created_date", 200\)/, 'list_movements keeps the explicit bounded window');
  assert.match(blocks.list_movements, /total_count/, 'list_movements must return total_count');
  assert.match(blocks.list_movements, /truncated/, 'list_movements must return truncated');
  // PO numbering must no longer read a capped page for its collision set.
  const numbering = entry.slice(entry.indexOf('async function nextPoNumber'), entry.indexOf('async function applyMovement'));
  assert.match(numbering, /loadAllEntityRows\(/, 'nextPoNumber must page its numbering scan');
  assert.deepEqual(underLimitedReads(numbering), [], 'nextPoNumber still reads a capped page');
}

// ==== 4. jobCostingAction =================================================
{
  const entry = read('jobCostingAction');
  const blocks = actionBlocks(entry);
  assert.match(blocks.list_job_costs, /loadAllEntityRows\(/, 'list_job_costs must page the work order read');
  assert.doesNotMatch(blocks.list_job_costs, /WorkOrder\.filter\(\{\}, "-created_date", 400\)/, 'list_job_costs must drop the 400-row cap');
  assert.match(blocks.list_job_costs, /total_count/, 'list_job_costs must return total_count');
  assert.match(blocks.list_job_costs, /truncated/, 'list_job_costs must return truncated');
  assert.deepEqual(underLimitedReads(blocks.list_job_costs), [], 'list_job_costs still has an under-limited read');
  assert.match(blocks.get_job_cost, /loadAllEntityRows\(/, 'get_job_cost detail lists must be paged');
  assert.deepEqual(underLimitedReads(blocks.get_job_cost), [], 'get_job_cost still has under-limited reads');
}

// ==== 5. customerPortalAction =============================================
{
  const entry = read('customerPortalAction');
  assert.match(entry, PAGED_IMPORT, 'customerPortalAction must import loadAllEntityRows');
  const blocks = actionBlocks(entry);
  for (const action of ['bootstrap', 'portal_inbox', 'mark_all_read', 'request_job_revision']) {
    assert.ok(blocks[action], `${action} block missing`);
    assert.match(blocks[action], /loadAllEntityRows\(/, `${action} must use the paged loader`);
    assert.deepEqual(underLimitedReads(blocks[action]), [], `${action} still has an under-limited read`);
  }
  // Whole-file: every surviving entity read must carry a limit or be a
  // unique-key lookup — the bulk reads (thread, announcements, links,
  // acceptances, numbering, inbox) all page through loadAllEntityRows now.
  assert.deepEqual(underLimitedReads(entry), [], 'customerPortalAction has a non-key under-limited read');
}

// ==== 6. boardFeed ========================================================
{
  const entry = read('boardFeed');
  assert.match(entry, /const PAGE_SIZE = 5000;/, 'boardFeed PAGE_SIZE');
  assert.match(entry, /const MAX_ROWS = 20000;/, 'boardFeed MAX_ROWS');
  // The clamp flag must fire on rows scanned, on full and delta pulls alike.
  assert.match(entry, /rowsHit \+= page\.length/, 'boardFeed must count scanned rows');
  assert.match(entry, /if \(rowsHit >= MAX_ROWS\) \{ truncated = true; break; \}/, 'boardFeed must flag truncated at the row cap');
  const pullLoop = entry.slice(entry.indexOf('let skip = 0;'), entry.indexOf('const payload'));
  assert.ok(
    pullLoop.indexOf('rowsHit >= MAX_ROWS') > -1
      && pullLoop.indexOf('rowsHit >= MAX_ROWS') < pullLoop.indexOf('page.length < PAGE_SIZE'),
    'the MAX_ROWS clamp must not depend on pull type',
  );
  assert.match(entry, /truncated,\s*\n?\s*server_time/, 'boardFeed payload must publish truncated');
}

// ==== 7. dataIntegrityAction ==============================================
{
  const entry = read('dataIntegrityAction');
  assert.match(entry, /const base44 = createClientFromRequest\(request\)/, 'dataIntegrityAction must build its client');
  assert.match(entry, /async function scanEntityRows/, 'dataIntegrityAction needs a paged scan helper');
  assert.match(entry, /const SCAN_PAGE = 500;/, 'scan page size');
  assert.match(entry, /const SCAN_MAX_ROWS = 20000;/, 'scan safety cap');
  assert.doesNotMatch(entry, /\.list\('-created_date', 500\)/, 'the single-shot 500-row scan must be gone');
  assert.match(entry, /scanned: scan\.scanned/, 'results must report rows scanned');
  assert.match(entry, /truncated: scan\.truncated/, 'results must publish the truncation flag');
  assert.deepEqual(underLimitedReads(entry), [], 'dataIntegrityAction still has an under-limited read');
}

// ==== 8. staffDataRead ====================================================
{
  const entry = read('staffDataRead');
  // (a) cursor + fields pass-through
  assert.match(entry, /const cursor = cleanCursor\(body\?\.cursor\)/, 'readOne must extract body.cursor');
  assert.match(entry, /const fields = cleanFields\(body\?\.fields\)/, 'readOne must extract body.fields');
  assert.match(entry, /options\.cursor = cursor/, 'cursor must reach the entity options');
  assert.match(entry, /options\.fields = fields/, 'fields must reach the entity options');
  assert.match(entry, /entity\.filter\(effectiveQuery, options\)/, 'filtered options-object read required');
  assert.match(entry, /entity\.list\(options\)/, 'list options-object read required');
  assert.match(entry, /cursor: request\?\.cursor/, 'cache key must include cursor');
  assert.match(entry, /fields: request\?\.fields/, 'cache key must include fields');
  // (b) real count
  assert.match(entry, /async function countRows\(entity/, 'countRows helper required');
  assert.match(entry, /entity\.count\(countQuery\)/, 'count must prefer the entity count API');
  assert.match(entry, /counted = await countRows\(entity, effectiveQuery\)/, 'count responses must use the real count');
  // (c) truncation honesty on every list/filter response
  assert.match(entry, /returned: scopedRows\.length/, 'list responses must include returned');
  assert.match(entry, /truncated: hasMore \|\| Boolean\(nextCursor\) \|\| rows\.length >= limit/, 'list responses must include truncated');
  assert.match(entry, /count: counted\.count, truncated: counted\.truncated/, 'count responses must flag a capped tally');
}

console.log('PASS scale-functions');

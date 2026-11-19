import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '.tmp-gl-account-admin.mjs');
buildSync({
  entryPoints: [resolve(here, '../base44/shared/glAccountAdminModel.ts')],
  bundle: true, format: 'esm', outfile: out, logLevel: 'silent',
});
const {
  ACCOUNT_KINDS, ACCOUNT_STATUSES, ACCOUNT_KIND_INFO,
  entityForKind, kindForEntity, isAccountKind,
  canonAccountCode, isAccountCodeFormat, accountCodeOf, parentCodeOf,
  statusOf, isActiveAccount, accountDisplay, accountRequestKey,
  normalizeAccountInput, resolveParentCode,
  indexAccountsByCode, childrenOf, ancestorChain, isDescendantOf,
  sortAccounts, validateAccountPatch, accountPatch,
  accountTree, flattenTree, pickerAccounts,
  deactivateGuard, activateGuard, nextAccountCode,
} = await import(pathToFileURL(out).href);

// ---------------------------------------------------------------------------
// Fixtures — seeded chart (accountingAdminAction seed_gl_accounts parity:
// income 4000-4900 step 100, cogs 5000-5900 step 100) + sub-account rows.
// parent_account stores the PARENT CODE (entity contract), not an id.
// ---------------------------------------------------------------------------
const INCOME = [
  { id: 'i1', code: '4000', name: 'Sales Income', status: 'active', creation_request_key: 'seed-income-4000' },
  { id: 'i2', code: '4100', name: 'Sign Income', status: 'active', creation_request_key: 'seed-income-4100' },
  { id: 'i3', code: '4101', name: 'Wholesale Signs', parent_account: '4100', status: 'active' },
  { id: 'i4', code: '4102', name: 'Retail Signs', parent_account: '4100', status: 'inactive' },
  { id: 'i5', code: '4103', name: 'Deep Wholesale', parent_account: '4101', status: 'active' },
  { id: 'i6', code: '4200', name: 'Service Income', status: 'active' },
  { id: 'i7', code: '4300', name: 'Installation Income', status: 'active' },
  { id: 'i8', code: '4301', name: 'Old Install Sub', parent_account: '4300', status: 'inactive' },
  { id: 'i9', code: '4900', name: 'Other Income', status: 'inactive' },
];
const COGS = [
  { id: 'c1', code: '5000', name: 'Materials COGS', status: 'active' },
  { id: 'c2', code: '5100', name: 'Substrate COGS', status: 'active' },
  { id: 'c3', code: '5900', name: 'Other COGS', status: 'active' },
];
const codes = (rows) => rows.map((r) => r.code);

// --- constants + kind maps ---------------------------------------------------
assert.deepEqual([...ACCOUNT_KINDS], ['income', 'cogs'], 'seeded kinds');
assert.deepEqual([...ACCOUNT_STATUSES], ['active', 'inactive']);
assert.equal(ACCOUNT_KIND_INFO.income.entity, 'IncomeAccount');
assert.equal(ACCOUNT_KIND_INFO.cogs.entity, 'COGSAccount');
assert.equal(ACCOUNT_KIND_INFO.income.series, '4');
assert.equal(ACCOUNT_KIND_INFO.cogs.series, '5');
assert.equal(entityForKind('income'), 'IncomeAccount');
assert.equal(entityForKind('cogs'), 'COGSAccount');
assert.equal(entityForKind('expense'), '', 'unknown kind → no entity');
assert.equal(kindForEntity('IncomeAccount'), 'income');
assert.equal(kindForEntity('COGSAccount'), 'cogs');
assert.equal(kindForEntity('Customer'), '');
assert.equal(isAccountKind('income'), true);
assert.equal(isAccountKind('expense'), false);

// --- code format / field readers ---------------------------------------------
assert.equal(canonAccountCode(' 4100 '), '4100');
assert.equal(canonAccountCode('41a0'), '', 'non-digit rejected');
assert.equal(isAccountCodeFormat('4100'), true);
assert.equal(isAccountCodeFormat('0400'), false, 'leading zero rejected');
assert.equal(isAccountCodeFormat('410'), false, '3 digits rejected');
assert.equal(isAccountCodeFormat('41000'), false, '5 digits rejected');
assert.equal(accountCodeOf({ account_number: '4100' }), '4100', 'account_number alias');
assert.equal(accountCodeOf({ gl_account_code: '4200' }), '4200', 'gl_account_code alias');
assert.equal(parentCodeOf({ parent_account: '4100' }), '4100');
assert.equal(parentCodeOf({ parent_code: ' 4100 ' }), '4100', 'parent_code alias');
assert.equal(parentCodeOf({}), '', 'blank parent = top-level');
assert.equal(statusOf({ status: 'inactive' }), 'inactive');
assert.equal(statusOf({}), 'active', 'missing status defaults active per entity');
assert.equal(isActiveAccount({ status: 'inactive' }), false);
assert.equal(isActiveAccount({ status: 'active' }), true);
assert.equal(accountDisplay({ code: '4100', name: 'Sign Income' }), '4100 Sign Income');
assert.equal(accountRequestKey('income', '4100'), 'glacct:income:4100');
assert.equal(accountRequestKey('cogs', 5000), 'glacct:cogs:5000', 'numeric code tolerated');

// --- normalizeAccountInput ----------------------------------------------------
const norm = normalizeAccountInput({ account_number: '4101', account_name: 'Sub', parent_id: '4100', active: false, notes: 'note text' });
assert.equal(norm.code, '4101');
assert.equal(norm.name, 'Sub');
assert.equal(norm.parent_account, '4100', 'parent_id code-shaped resolves to parent_account');
assert.equal(norm.status, 'inactive', 'active:false maps to status inactive');
assert.equal(norm.status_valid, true);
assert.equal(norm.description, 'note text', 'notes alias feeds description');
assert.equal(normalizeAccountInput({ status: 'weird' }).status_valid, false, 'bad status flagged');
assert.equal(resolveParentCode({ parent_id: 'i2' }, INCOME), '4100', 'entity-id parent resolves via existing');
assert.equal(resolveParentCode({ parent: { code: '4200' } }, INCOME), '4200', 'embedded row parent resolves');

// --- accountPatch -------------------------------------------------------------
const created = accountPatch({ name: 'Freight Income', account_number: '4400' }, { kind: 'income', actor_id: 'admin@shop.com' });
assert.equal(created.code, '4400');
assert.equal(created.name, 'Freight Income');
assert.equal(created.parent_account, '', 'top-level emits blank parent');
assert.equal(created.status, 'active', 'create defaults active');
assert.equal(created.schema_version, 1);
assert.equal(created.creation_request_key, 'glacct:income:4400', 'deterministic managed receipt');
assert.equal(created.updated_by, 'admin@shop.com');
assert.equal('description' in created, false, 'no description key when input lacks one');
const p2 = accountPatch({ code: '4101', name: 'Sub', parent_id: '4100', description: 'resale only' }, { kind: 'income' });
assert.equal(p2.parent_account, '4100');
assert.equal(p2.description, 'resale only', 'schema-extension description rides');
const p3 = accountPatch({ id: 'i1', code: '4000', name: 'Sales Income', status: 'inactive', creation_request_key: 'seed-income-4000' }, { kind: 'income' });
assert.equal(p3.creation_request_key, 'seed-income-4000', 'edit preserves existing receipt');
assert.equal(p3.status, 'inactive');
assert.equal(p3.id, 'i1', 'id echoed for the update path');
assert.equal(accountPatch({ code: '4100', name: 'X' }, { kind: 'income', now: '2026-11-02T00:00:00Z' }).creation_request_key, 'glacct:income:4100', 'now never enters the key');

// --- validateAccountPatch: happy path + field rules ---------------------------
const okCreate = validateAccountPatch({ name: 'Freight Income', code: '4400' }, { existing: INCOME, kind: 'income' });
assert.equal(okCreate.ok, true, 'clean create validates');
assert.deepEqual(okCreate.errors, []);
assert.equal(validateAccountPatch({ name: '', code: '4400' }, { existing: INCOME, kind: 'income' }).errors.some(e => e.field === 'name' && e.code === 'required'), true, 'name required');
assert.equal(validateAccountPatch({ name: 'X' }, { existing: INCOME, kind: 'income' }).errors.some(e => e.field === 'code' && e.code === 'required'), true, 'code required');
assert.equal(validateAccountPatch({ name: 'X', code: '440' }, { existing: INCOME, kind: 'income' }).errors[0].code, 'code_format');
assert.equal(validateAccountPatch({ name: 'X', code: '0440' }, { existing: INCOME, kind: 'income' }).errors.some(e => e.code === 'code_format'), true, 'leading zero rejected');
assert.equal(validateAccountPatch({ name: 'X', code: '44000' }, { existing: INCOME, kind: 'income' }).errors.some(e => e.code === 'code_format'), true);
const longName = 'N'.repeat(121);
assert.equal(validateAccountPatch({ name: longName, code: '4400' }, { existing: INCOME, kind: 'income' }).errors.some(e => e.code === 'name_too_long'), true);

// --- validateAccountPatch: series + uniqueness --------------------------------
assert.equal(validateAccountPatch({ name: 'Wrong', code: '5100' }, { existing: INCOME, kind: 'income' }).errors.some(e => e.code === 'code_series'), true, 'cogs code in income kind rejected');
assert.equal(validateAccountPatch({ name: 'Wrong', code: '4100' }, { existing: COGS, kind: 'cogs' }).errors.some(e => e.code === 'code_series'), true, 'income code in cogs kind rejected');
assert.equal(validateAccountPatch({ name: 'Off', code: '6100' }, { existing: INCOME, kind: 'income', allowOffSeries: true }).errors.some(e => e.code === 'code_series'), false, 'allowOffSeries escape hatch');
const dupErr = validateAccountPatch({ name: 'Dup', code: '4100' }, { existing: INCOME, kind: 'income' });
assert.equal(dupErr.errors.some(e => e.code === 'code_duplicate'), true, 'create over existing code flagged');
assert.match(dupErr.errors.find(e => e.code === 'code_duplicate').message, /Sign Income/, 'dupe names the holder');
const selfEdit = validateAccountPatch({ id: 'i2', name: 'Sign Income', code: '4100' }, { existing: INCOME, kind: 'income' });
assert.equal(selfEdit.ok, true, 'same-code edit excludes self from uniqueness');
const renameToUsed = validateAccountPatch({ id: 'i2', name: 'Sign Income', code: '4200' }, { existing: INCOME, kind: 'income' });
assert.equal(renameToUsed.errors.some(e => e.code === 'code_duplicate'), true, 'rename onto another row still collides');

// --- validateAccountPatch: parents --------------------------------------------
assert.equal(validateAccountPatch({ name: 'Sub', code: '4104', parent_account: '4100' }, { existing: INCOME, kind: 'income' }).ok, true, 'valid sub-account');
assert.equal(validateAccountPatch({ name: 'Sub', code: '4104', parent_account: '4999' }, { existing: INCOME, kind: 'income' }).errors.some(e => e.code === 'parent_not_found'), true, 'missing parent flagged');
assert.equal(validateAccountPatch({ name: 'Sub', code: '4104', parent_account: '4102' }, { existing: INCOME, kind: 'income' }).errors.some(e => e.code === 'parent_inactive'), true, 'inactive parent flagged');
assert.equal(validateAccountPatch({ name: 'Self', code: '4109', parent_account: '4109' }, { existing: INCOME, kind: 'income' }).errors.some(e => e.code === 'parent_self'), true, 'self-parent flagged');
assert.equal(validateAccountPatch({ name: 'Sub', code: '4104', parent_account: '5000' }, { existing: INCOME, kind: 'income' }).errors.some(e => e.code === 'parent_not_found'), true, 'cross-kind parent not in same-kind list');
const cycleEdit = validateAccountPatch({ id: 'i3', code: '4101', name: 'Wholesale Signs', parent_account: '4103' }, { existing: INCOME, kind: 'income' });
assert.equal(cycleEdit.errors.some(e => e.code === 'parent_cycle'), true, 'descendant-as-parent → parent_cycle (4103 → 4101 → 4100)');
const cycleViaOldCode = validateAccountPatch({ id: 'i2', code: '4107', name: 'Sign Income', parent_account: '4101' }, { existing: INCOME, kind: 'income' });
assert.equal(cycleViaOldCode.errors.some(e => e.code === 'parent_cycle'), true, 'cycle caught via OLD code on renumber (4101 → 4100)');
const renumber = validateAccountPatch({ id: 'i2', code: '4150', name: 'Sign Income' }, { existing: INCOME, kind: 'income' });
assert.equal(renumber.errors.some(e => e.code === 'code_renumber_children'), true, 'renumbering a parent orphans children');
assert.equal(validateAccountPatch({ id: 'i6', code: '4250', name: 'Service Income' }, { existing: INCOME, kind: 'income' }).ok, true, 'renumber of a childless row is fine');
assert.equal(validateAccountPatch({ name: 'X', code: '4400', status: 'weird' }, { existing: INCOME, kind: 'income' }).errors.some(e => e.code === 'status_invalid'), true);
assert.equal(validateAccountPatch({ name: 'X', code: '4400' }, { existing: INCOME, kind: 'expense' }).errors.some(e => e.code === 'kind_invalid'), true);
const multi = validateAccountPatch({}, { existing: INCOME, kind: 'income' });
assert.ok(multi.errors.length >= 2, 'all errors collected at once');

// --- lookups + chain walks ----------------------------------------------------
const byCode = indexAccountsByCode(INCOME);
assert.equal(byCode.get('4100').name, 'Sign Income');
assert.deepEqual(codes(childrenOf(byCode.get('4100'), INCOME)), ['4101', '4102'], 'direct children only');
assert.deepEqual(ancestorChain(byCode.get('4103'), byCode), ['4101', '4100'], 'walk up to root');
assert.equal(isDescendantOf(byCode.get('4103'), byCode.get('4100'), byCode), true);
assert.equal(isDescendantOf(byCode.get('4100'), byCode.get('4103'), byCode), false);
// corrupt stored cycle can never hang the walk
const corrupt = [{ code: '4100', parent_account: '4200' }, { code: '4200', parent_account: '4100' }];
assert.deepEqual(ancestorChain(corrupt[0], corrupt), ['4200', '4100'], 'cycle walk terminates');

// --- sortAccounts --------------------------------------------------------------
const messy = [INCOME[5], INCOME[0], INCOME[2]];
assert.deepEqual(codes(sortAccounts(messy)), ['4000', '4101', '4200'], 'numeric code order');
assert.deepEqual(codes(messy), ['4200', '4000', '4101'], 'input array not mutated');
assert.deepEqual(codes(sortAccounts([{ code: 'abcd', name: 'Z' }, INCOME[0]])), ['4000', 'abcd'], 'unparseable code sinks to bottom');

// --- accountTree + flattenTree -------------------------------------------------
const tree = accountTree(INCOME);
assert.deepEqual(tree.map(n => n.account.code), ['4000', '4100', '4200', '4300', '4900'], 'roots ordered by code');
const n4100 = tree.find(n => n.account.code === '4100');
assert.deepEqual(n4100.children.map(n => n.account.code), ['4101', '4102'], 'children nested under parent');
assert.deepEqual(n4100.children[0].children.map(n => n.account.code), ['4103'], 'grandchild nests one deeper');
const orphanTree = accountTree([...INCOME, { code: '4800', name: 'Orphan', parent_account: '4999' }]);
assert.equal(orphanTree.some(n => n.account.code === '4800' && n.children.length === 0), true, 'orphaned parent code promoted to root');
const corruptTree = accountTree(corrupt);
assert.equal(corruptTree.length, 1, 'cycle pair surfaces as one pseudo-root');
assert.equal(corruptTree[0].children[0].account.code, '4200', 'cycle member nests under the other — no hang, no drop');

const flat = flattenTree(tree);
assert.deepEqual(codes(flat), ['4000', '4100', '4101', '4103', '4102', '4200', '4300', '4301', '4900'], 'depth-first flatten order');
assert.equal(flat.find(r => r.code === '4101').depth, 1);
assert.equal(flat.find(r => r.code === '4103').depth, 2);
assert.equal(flat.find(r => r.code === '4101').label, '  ↳ 4101 Wholesale Signs', 'child label indented');
assert.equal(flat.find(r => r.code === '4103').label, '  ↳   ↳ 4103 Deep Wholesale', 'grandchild double-indent');
assert.equal(flat.find(r => r.code === '4100').label, '4100 Sign Income', 'root unindented');
assert.equal(flat.find(r => r.code === '4101').value, '4101', 'select value = GL code');
assert.deepEqual(codes(flattenTree(INCOME)), codes(flat), 'raw list auto-trees identically');

// --- pickerAccounts — the I-01 verify criterion --------------------------------
const picker = pickerAccounts(INCOME);
assert.deepEqual(codes(picker), ['4000', '4100', '4101', '4103', '4200', '4300'], 'numeric order');
assert.equal(picker.every(r => r.status === 'active'), true, 'VERIFY: inactive accounts excluded from pickers');
assert.equal(picker.some(r => r.code === '4102' || r.code === '4900' || r.code === '4301'), false, 'VERIFY: 4102/4301/4900 inactive → not offered');
assert.equal(picker.find(r => r.code === '4101').label, '4101 Wholesale Signs');
assert.equal(picker.find(r => r.code === '4101').value, '4101');
assert.deepEqual(pickerAccounts([]), [], 'empty chart → empty picker');

// --- deactivateGuard / activateGuard --------------------------------------------
const leaf = byCode.get('4103');
assert.deepEqual(deactivateGuard(leaf, { children: [], splitsInUse: 0 }), { ok: true }, 'clean leaf deactivates');
const blockedKids = deactivateGuard(byCode.get('4100'), { children: childrenOf(byCode.get('4100'), INCOME), splitsInUse: 0 });
assert.equal(blockedKids.ok, false, 'parent with active children blocked');
assert.equal(blockedKids.code, 'active_children');
assert.equal(blockedKids.active_children, 1, 'only ACTIVE children count (4102 inactive)');
assert.match(blockedKids.reason, /4101 Wholesale Signs/, 'reason names the child');
const onlyInactiveKids = deactivateGuard(byCode.get('4300'), { children: childrenOf(byCode.get('4300'), INCOME), splitsInUse: 0 });
assert.equal(onlyInactiveKids.ok, true, 'inactive children do not block');
const blockedSplits = deactivateGuard(leaf, { children: [], splitsInUse: 3 });
assert.equal(blockedSplits.ok, false);
assert.equal(blockedSplits.code, 'splits_in_use');
assert.equal(blockedSplits.splits_in_use, 3);
assert.equal(deactivateGuard(leaf, { children: [], splitsInUse: [{}, {}] }).ok, false, 'array-form count works');
assert.equal(activateGuard(leaf, { parent: byCode.get('4102') }).code, 'parent_inactive', 'reactivate under inactive parent blocked');
assert.equal(activateGuard(leaf, { parent: byCode.get('4101') }).ok, true, 'reactivate under active parent ok');
assert.equal(activateGuard(leaf, {}).ok, true, 'top-level reactivate ok');

// --- nextAccountCode -----------------------------------------------------------
const seedOnly = ['4000', '4100', '4200', '4300', '4400', '4500', '4900'].map(code => ({ code, name: 'Seed', status: 'active' }));
assert.equal(nextAccountCode(seedOnly, 'income'), '4600', 'first free hundred slot');
assert.equal(nextAccountCode(COGS, 'cogs'), '5200', 'cogs series independent');
assert.equal(nextAccountCode([...seedOnly, { code: '4600' }], 'income'), '4700', 'next hundred when 4600 taken');
const fullHundreds = Array.from({ length: 10 }, (_, i) => ({ code: String(4000 + i * 100) }));
assert.equal(nextAccountCode(fullHundreds, 'income'), '4001', 'hundreds exhausted → first gap in decade');
assert.equal(nextAccountCode(seedOnly, 'expense'), '', 'unknown kind → no suggestion');
assert.equal(nextAccountCode([], 'income'), '4000', 'empty chart → series base');

rmSync(out, { force: true });
console.log('PASS gl-account-admin');

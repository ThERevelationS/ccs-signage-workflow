// GL account admin model — pure TS, ZERO imports. Safe to bundle into Deno
// functions (base44/functions/*), the Manage Accounts admin page, and Node
// test harnesses. No I/O anywhere in this module — the wiring layer
// (accountingAdminAction CRUD actions + the admin page) loads/stores
// IncomeAccount / COGSAccount rows and these functions normalize patches,
// validate edits, shape the parent tree, filter pickers, and guard toggles.
//
// I-01 (ESTIMATOR_MASTERPLAN WS-I; schema items A-01/A-02). Companion to the
// accountingAdminAction gateway — IncomeAccount and COGSAccount are
// backend-only RLS, so every staff-facing read/write flows through that
// function (seed_gl_accounts is the only action today; the admin CRUD actions
// consume these patches).
//
// DATA CONTRACT (base44/entities/IncomeAccount.jsonc + COGSAccount.jsonc):
//   code                 — GL account code, STRING, e.g. '4000'. Every account
//                          reference elsewhere in the codebase is by CODE
//                          (Invoice.income_account_splits[].income_account_code,
//                          part.income_account_code / cogs_account_code,
//                          glSplitModel account_id) — never by entity id.
//   name                 — display name ('Sales Income'). Required.
//   parent_account       — PARENT GL CODE (string), '' = top-level. Parent is
//                          stored by code, not id — sub-accounts survive export
//                         /import because codes are the stable identity.
//   status               — 'active' | 'inactive', default 'active'. Inactive
//                          rows stay on history but are never offered for new
//                          coding (the I-01 verify criterion — pickerAccounts
//                          excludes them).
//   updated_by           — staff email of the last saver (audit).
//   schema_version       — 1.
//   creation_request_key — idempotent receipt. Seeds: 'seed-<kind>-<code>'
//                          ('seed-income-4000'). Rows managed through the
//                          admin: 'glacct:<kind>:<code>' — deterministic so a
//                          retried create verifies the existing row instead of
//                          duplicating it. accountPatch preserves an existing
//                          key on edit and never lets `now` into the key.
//
// KINDS + NUMBERING (accountingAdminAction seed contract):
//   'income' → IncomeAccount, 4000-series. Seeds 4000,4100,4200,4300,4400,
//              4500,4900 (7 rows, hundred-boundary steps).
//   'cogs'   → COGSAccount, 5000-series. Seeds 5000,5100,5200,5300,5400,5500,
//              5600,5900 (8 rows).
//   Convention enforced by validateAccountPatch: exactly 4 digits, no leading
//   zero, first digit = the kind's series (income '4', cogs '5'). A COGS code
//   typed into the income list fails 'code_series'; allowOffSeries opts out.
//
// FIELD SPELLINGS — this codebase carries import-era aliases. normalizeInput
//   accepts code | account_number | account_code | gl_account_code | number;
//   parent_account | parent_code | parent_account_code | parent_id |
//   parent (string or embedded row); status | active (boolean). Emitted
//   patches always use the DECLARED entity fields (code, parent_account,
//   status). `description` is not declared on the entities — when input
//   carries it, it rides the patch as a schema-extension field (permissive
//   family; same precedent as glSplitModel's splits_override fields).
//
// PARENT/CYCLE SEMANTICS:
//   - Parent must exist in the same kind's list, be active, not be the
//     account itself, and not be one of its descendants. Descendant check =
//     walk UP the proposed parent's ancestor chain by code; if the walk hits
//     this account (new OR current code — covers same-save renumber), the
//     parent pick is a cycle → 'parent_cycle'.
//   - Renumber guard: changing `code` while children store the old code in
//     parent_account orphans them → 'code_renumber_children'. (Cascade
//     renumbering of children is a wiring-layer decision, not silent here.)
//   - Corrupt stored cycles can never hang accountTree/ancestorChain — all
//     walks are visited-set guarded; unreachable rows surface as extra roots.
//
// SURFACE:
//   ACCOUNT_KINDS / ACCOUNT_STATUSES / ACCOUNT_KIND_INFO
//   entityForKind / kindForEntity / isAccountKind
//   canonAccountCode / isAccountCodeFormat / accountCodeOf / parentCodeOf
//   statusOf / isActiveAccount / accountDisplay / accountRequestKey
//   normalizeAccountInput / validateAccountPatch / accountPatch
//   indexAccountsByCode / childrenOf / ancestorChain / isDescendantOf
//   sortAccounts / accountTree / flattenTree / pickerAccounts
//   deactivateGuard / activateGuard / nextAccountCode

export type AccountKind = 'income' | 'cogs';
export type AccountStatus = 'active' | 'inactive';

export interface AccountKindInfo {
  /** Entity backing this kind ('IncomeAccount' | 'COGSAccount'). */
  entity: string;
  /** Required first digit of every code in the kind ('4' | '5'). */
  series: string;
  /** First code of the series decade (4000 | 5000). */
  seed_base: number;
  /** Human label for admin tabs ('Income' | 'COGS'). */
  label: string;
}

/** The kinds accountingAdminAction seeds and the admin page manages. */
export const ACCOUNT_KINDS: readonly AccountKind[] = ['income', 'cogs'];

/** Declared status enum on both entities. */
export const ACCOUNT_STATUSES: readonly AccountStatus[] = ['active', 'inactive'];

export const ACCOUNT_KIND_INFO: Record<AccountKind, AccountKindInfo> = {
  income: { entity: 'IncomeAccount', series: '4', seed_base: 4000, label: 'Income' },
  cogs: { entity: 'COGSAccount', series: '5', seed_base: 5000, label: 'COGS' },
};

/** Validation error — field-scoped so the form can pin messages per control. */
export interface AccountValidationError {
  /** 'name' | 'code' | 'parent_account' | 'status' | 'kind'. */
  field: string;
  /** Machine code: 'required' | 'name_too_long' | 'code_format' | 'code_series' |
   *  'code_duplicate' | 'code_renumber_children' | 'parent_invalid' |
   *  'parent_not_found' | 'parent_inactive' | 'parent_self' | 'parent_cycle' |
   *  'status_invalid' | 'kind_invalid'. */
  code: string;
  message: string;
}

export interface AccountValidationResult {
  ok: boolean;
  errors: AccountValidationError[];
  /** The normalized input validation ran on (handy for the form's echo). */
  normalized: NormalizedAccountInput;
}

export interface NormalizedAccountInput {
  id: string;
  code: string;
  name: string;
  /** Canon parent code, '' = top-level. Raw non-code refs resolve via `existing` in validate/patch. */
  parent_account: string;
  status: AccountStatus;
  /** False when input.status/active carried an unparseable value. */
  status_valid: boolean;
  /** Schema-extension field — emitted only when input carried one. */
  description: string;
  creation_request_key: string;
}

export interface AccountTreeNode {
  account: any;
  children: AccountTreeNode[];
}

/** One row of a flattened tree — select-list ready. */
export interface FlatAccountRow {
  account: any;
  /** 0 = top-level. */
  depth: number;
  code: string;
  name: string;
  status: AccountStatus;
  /** Picker value — the GL code (all stored references are codes). */
  value: string;
  /** Indent-labelled 'code name' — '  ↳ ' repeated per depth level. */
  label: string;
}

export interface GuardResult {
  ok: boolean;
  /** 'active_children' | 'splits_in_use' | 'parent_inactive'. */
  code?: string;
  reason?: string;
  active_children?: number;
  splits_in_use?: number;
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

const toStr = (value: unknown): string =>
  value === undefined || value === null ? '' : String(value).trim();

const isObj = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);

const firstStr = (row: unknown, keys: string[]): string => {
  if (!isObj(row)) return '';
  for (const key of keys) {
    const v = toStr(row[key]);
    if (v) return v;
  }
  return '';
};

/** Canonical code form: trimmed digits. Returns '' for anything non-digit. */
export const canonAccountCode = (value: unknown): string => {
  const s = toStr(value);
  return /^\d+$/.test(s) ? s : '';
};

/** Declared format: exactly 4 digits, no leading zero (4000-series style). */
export const isAccountCodeFormat = (value: unknown): boolean =>
  /^[1-9]\d{3}$/.test(toStr(value));

/** All spellings seen for the code field across imports/specs. */
const CODE_KEYS = ['code', 'account_number', 'account_code', 'gl_account_code', 'account_no', 'number'];

/** Row → canon code ('' when absent/malformed). */
export const accountCodeOf = (row: unknown): string =>
  canonAccountCode(firstStr(row, CODE_KEYS));

const PARENT_CODE_KEYS = ['parent_account', 'parent_code', 'parent_account_code', 'gl_parent_code'];

/** Row → canon parent code ('' = top-level / unknown). Reads stored parent_account plus aliases. */
export const parentCodeOf = (row: unknown): string =>
  canonAccountCode(firstStr(row, PARENT_CODE_KEYS));

/** Row status — missing defaults to 'active' per the entity default. */
export const statusOf = (row: unknown): AccountStatus => {
  const s = toStr(isObj(row) ? row.status : '').toLowerCase();
  return s === 'inactive' ? 'inactive' : 'active';
};

/** Offerable-for-new-coding test — inactive rows fail; everything else passes. */
export const isActiveAccount = (row: unknown): boolean => statusOf(row) === 'active';

/** Kind string check ('income' | 'cogs'). */
export const isAccountKind = (kind: unknown): kind is AccountKind =>
  ACCOUNT_KINDS.includes(toStr(kind).toLowerCase() as AccountKind);

/** 'income' → 'IncomeAccount', 'cogs' → 'COGSAccount' ('' for unknown kind). */
export const entityForKind = (kind: unknown): string =>
  isAccountKind(kind) ? ACCOUNT_KIND_INFO[kind].entity : '';

/** 'IncomeAccount' → 'income', 'COGSAccount' → 'cogs' ('' for unknown entity). */
export const kindForEntity = (entityName: unknown): string => {
  const e = toStr(entityName).toLowerCase();
  for (const kind of ACCOUNT_KINDS) {
    if (ACCOUNT_KIND_INFO[kind].entity.toLowerCase() === e) return kind;
  }
  return '';
};

/** Stable managed-row receipt: 'glacct:<kind>:<code>' — deterministic for retry-safe creates. */
export const accountRequestKey = (kind: unknown, code: unknown): string =>
  `glacct:${toStr(kind).toLowerCase()}:${canonAccountCode(code)}`;

/** Select/display rendering of one account: '4000 Sales Income'. */
export const accountDisplay = (account: unknown): string => {
  const code = accountCodeOf(account);
  const name = toStr(isObj(account) ? (account.name ?? account.account_name ?? account.display_name) : '');
  return [code, name].filter(Boolean).join(' ');
};

// ---------------------------------------------------------------------------
// Input normalization
// ---------------------------------------------------------------------------

/**
 * Resolve the parent reference on raw input to a canon code.
 * Explicit code fields win; `parent` may embed a row object; `parent_id` /
 * `parent_ref` may be a code OR an entity id resolvable through `existing`.
 * Unresolvable non-empty refs come back raw so validation can flag them.
 */
export function resolveParentCode(patch: unknown, existing: unknown[] = []): string {
  if (!isObj(patch)) return '';
  const direct = canonAccountCode(firstStr(patch, PARENT_CODE_KEYS));
  if (direct) return direct;
  const embedded = patch.parent;
  if (isObj(embedded)) {
    const c = accountCodeOf(embedded);
    if (c) return c;
  } else {
    const c = canonAccountCode(embedded);
    if (c) return c;
  }
  const ref = toStr(patch.parent_id ?? patch.parent_ref);
  if (!ref) return '';
  if (isAccountCodeFormat(ref)) return canonAccountCode(ref);
  const hit = existing.find((r) => isObj(r) && toStr(r.id) === ref);
  if (hit) return accountCodeOf(hit);
  return ref; // raw — validation reports parent_invalid / parent_not_found
}

/**
 * Normalize the wild-west spellings of an account form/import row into the
 * declared entity shape. Pure read of input — no validation side effects.
 */
export function normalizeAccountInput(input: unknown): NormalizedAccountInput {
  const row = isObj(input) ? input : {};
  let status: AccountStatus = 'active';
  let status_valid = true;
  const rawStatus = toStr(row.status).toLowerCase();
  if (rawStatus) {
    if ((ACCOUNT_STATUSES as readonly string[]).includes(rawStatus)) status = rawStatus as AccountStatus;
    else status_valid = false;
  } else if (typeof row.active === 'boolean') {
    status = row.active ? 'active' : 'inactive';
  } else if (typeof row.is_active === 'boolean') {
    status = row.is_active ? 'active' : 'inactive';
  }
  return {
    id: firstStr(row, ['id', '_id', 'account_id', 'gl_account_id']),
    code: canonAccountCode(firstStr(row, CODE_KEYS)),
    name: firstStr(row, ['name', 'account_name', 'display_name', 'label', 'title']),
    parent_account: resolveParentCode(row),
    status,
    status_valid,
    description: firstStr(row, ['description', 'notes', 'memo']),
    creation_request_key: firstStr(row, ['creation_request_key', 'request_key']),
  };
}

// ---------------------------------------------------------------------------
// Lookup builders
// ---------------------------------------------------------------------------

/** canon code → row. First row wins on duplicates (corrupt data stays visible, last never silently overrides). */
export function indexAccountsByCode(accounts: unknown): Map<string, any> {
  const map = new Map<string, any>();
  for (const row of Array.isArray(accounts) ? accounts : []) {
    if (!isObj(row)) continue;
    const code = accountCodeOf(row);
    if (code && !map.has(code)) map.set(code, row);
  }
  return map;
}

/** Direct child rows whose parent_account resolves to `account`'s code. */
export function childrenOf(account: unknown, accounts: unknown): any[] {
  const code = accountCodeOf(account);
  if (!code) return [];
  return (Array.isArray(accounts) ? accounts : []).filter(
    (r) => isObj(r) && parentCodeOf(r) === code,
  );
}

/**
 * Codes walking UP from `row`'s parent to the root — visited-set guarded so a
 * corrupt stored cycle terminates instead of looping. Excludes row's own code.
 */
export function ancestorChain(row: unknown, byCode?: Map<string, any> | unknown[]): string[] {
  const index = byCode instanceof Map ? byCode : indexAccountsByCode(byCode);
  const out: string[] = [];
  const seen = new Set<string>();
  let cursor = parentCodeOf(row);
  while (cursor && !seen.has(cursor)) {
    seen.add(cursor);
    out.push(cursor);
    const next = index.get(cursor);
    cursor = next ? parentCodeOf(next) : '';
  }
  return out;
}

/** True when `ancestor` sits anywhere above `row` in the parent chain. */
export function isDescendantOf(row: unknown, ancestor: unknown, byCode?: Map<string, any> | unknown[]): boolean {
  const target = accountCodeOf(ancestor);
  if (!target) return false;
  return ancestorChain(row, byCode).includes(target);
}

// ---------------------------------------------------------------------------
// Ordering
// ---------------------------------------------------------------------------

const num = (code: string): number => {
  const n = parseInt(code, 10);
  return Number.isFinite(n) ? n : Number.POSITIVE_INFINITY;
};

/**
 * Non-mutating sort: numeric code → name → code → id. Rows without a parseable
 * code sink to the bottom in name order (they stay visible, never dropped).
 */
export function sortAccounts(accounts: unknown): any[] {
  const rows = (Array.isArray(accounts) ? accounts : []).filter(isObj);
  return [...rows].sort((a, b) => {
    const d = num(accountCodeOf(a)) - num(accountCodeOf(b));
    if (d) return d;
    const an = toStr(a.name), bn = toStr(b.name);
    if (an !== bn) return an < bn ? -1 : 1;
    const ac = accountCodeOf(a), bc = accountCodeOf(b);
    if (ac !== bc) return ac < bc ? -1 : 1;
    return toStr(a.id) < toStr(b.id) ? -1 : toStr(a.id) > toStr(b.id) ? 1 : 0;
  });
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const err = (field: string, code: string, message: string): AccountValidationError =>
  ({ field, code, message });

/**
 * Validate a create/edit against the kind's existing rows. `existing` is the
 * SAME-KIND list (the entity's rows — the admin page loads one kind at a
 * time). Patch identity for edits: patch.id | patch._id | opts.self_id, or an
 * explicit opts.editing row object. A create (no id match) treats every
 * existing code as a collision candidate.
 *
 * Checks, in order: kind known → name required/≤120 → code required →
 * code format (^[1-9]\d{3}$) → code series (income 4xxx / cogs 5xxx;
 * opts.allowOffSeries bypasses) → code unique among other rows → status
 * parseable → parent exists/active/not-self/not-descendant → renumber keeps
 * children. All errors are collected — the form sees every problem at once.
 */
export function validateAccountPatch(
  patch: unknown,
  opts: { existing?: unknown; kind?: unknown; self_id?: unknown; editing?: unknown; allowOffSeries?: boolean } = {},
): AccountValidationResult {
  const o = opts && typeof opts === 'object' ? opts : {};
  const kind = toStr(o.kind).toLowerCase();
  const info = isAccountKind(kind) ? ACCOUNT_KIND_INFO[kind] : undefined;
  const existing = (Array.isArray(o.existing) ? o.existing : []).filter(isObj);
  const errors: AccountValidationError[] = [];
  const n = normalizeAccountInput(patch);

  if (!info) {
    errors.push(err('kind', 'kind_invalid', `Unknown account kind '${kind || '?'}' — expected one of: ${ACCOUNT_KINDS.join(', ')}.`));
  }

  // --- identity of the row being edited -----------------------------------
  const selfId = toStr(isObj(patch) ? (patch.id ?? patch._id) : '') || toStr(o.self_id);
  let selfRow: any = isObj(o.editing) ? o.editing : undefined;
  if (!selfRow && selfId) selfRow = existing.find((r) => toStr(r.id) === selfId);
  if (!selfId && selfRow) n.id = toStr(selfRow.id) || n.id;
  const isSameRow = (r: any): boolean => {
    if (selfRow && r === selfRow) return true;
    if (selfId && toStr(r.id) === selfId) return true;
    return false;
  };

  // --- name -----------------------------------------------------------------
  if (!n.name) {
    errors.push(err('name', 'required', 'An account name is required.'));
  } else if (n.name.length > 120) {
    errors.push(err('name', 'name_too_long', `Account name is ${n.name.length} characters — keep it to 120 or fewer.`));
  }

  // --- code -------------------------------------------------------------------
  const code = n.code;
  if (!code) {
    errors.push(err('code', 'required', 'An account code is required.'));
  } else if (!isAccountCodeFormat(code)) {
    errors.push(err('code', 'code_format', `Account code '${code}' must be exactly 4 digits with no leading zero (e.g. '4100').`));
  } else {
    if (info && code[0] !== info.series && !o.allowOffSeries) {
      errors.push(err('code', 'code_series', `Code '${code}' is outside the ${info.label} ${info.series}xxx series — ${info.entity} codes start with '${info.series}'.`));
    }
    const dupe = existing.find((r) => !isSameRow(r) && accountCodeOf(r) === code);
    if (dupe) {
      errors.push(err('code', 'code_duplicate', `Code '${code}' is already used by '${accountDisplay(dupe)}'.`));
    }
  }

  // --- status -----------------------------------------------------------------
  if (!n.status_valid) {
    errors.push(err('status', 'status_invalid', `Status must be one of: ${ACCOUNT_STATUSES.join(', ')}.`));
  }

  // --- parent -------------------------------------------------------------------
  const parentCode = resolveParentCode(patch, existing);
  if (parentCode) {
    // Identity codes for self/descendant checks: the new code AND the stored
    // row's current code — a same-save renumber must still catch cycles that
    // reference the old code (children store parent CODES).
    const selfCodes = new Set<string>();
    if (code) selfCodes.add(code);
    if (selfRow) {
      const old = accountCodeOf(selfRow);
      if (old) selfCodes.add(old);
    }

    if (!isAccountCodeFormat(parentCode)) {
      errors.push(err('parent_account', 'parent_invalid', `Parent reference '${parentCode}' is not a 4-digit account code or a known account id.`));
    } else if (selfCodes.has(parentCode)) {
      // Self-check precedes existence: a create pointing at its own new code
      // would otherwise surface as parent_not_found and mislead the form.
      errors.push(err('parent_account', 'parent_self', 'An account cannot be its own parent.'));
    } else {
      const parentRow = indexAccountsByCode(existing).get(parentCode);
      if (!parentRow) {
        errors.push(err('parent_account', 'parent_not_found', `No ${info ? info.label : kind} account '${parentCode}' exists — the parent must be a real account of the same kind.`));
      } else {
        if (!isActiveAccount(parentRow)) {
          errors.push(err('parent_account', 'parent_inactive', `Parent '${accountDisplay(parentRow)}' is inactive — reactivate it or pick an active parent.`));
        }
        if (selfCodes.size && ancestorChain(parentRow, existing).some((c) => selfCodes.has(c))) {
          errors.push(err('parent_account', 'parent_cycle', `'${accountDisplay(parentRow)}' is a sub-account of this account — picking it would create a cycle.`));
        }
      }
    }
  }

  // --- renumber guard -----------------------------------------------------------
  if (selfRow && code) {
    const oldCode = accountCodeOf(selfRow);
    if (oldCode && oldCode !== code) {
      const kids = existing.filter((r) => parentCodeOf(r) === oldCode);
      if (kids.length) {
        errors.push(err('code', 'code_renumber_children', `Renumbering '${oldCode}' → '${code}' orphans ${kids.length} sub-account(s) still pointing at '${oldCode}' — reassign or renumber them first.`));
      }
    }
  }

  return { ok: errors.length === 0, errors, normalized: n };
}

// ---------------------------------------------------------------------------
// Patch emission
// ---------------------------------------------------------------------------

/**
 * Normalized create/update patch in the DECLARED entity shape. Always emits
 * code/name/parent_account ('' = top-level)/status/schema_version plus the
 * idempotent creation_request_key ('glacct:<kind>:<code>' on create;
 * preserved verbatim on edit so seed/managed receipts are never rewritten).
 * `description` rides only when input carried one (schema-extension field).
 * `updated_by` is stamped from actor_id when provided. `id` is echoed when
 * the input had one so the wiring layer can target the update.
 *
 * `now` is accepted for signature stability — the patch intentionally carries
 * NO timestamps (Base44 stamps updated_date server-side and `now` must never
 * enter the deterministic creation_request_key). opts.existing (same-kind
 * rows) lets parent_id references resolve to codes; omitted on pure creates.
 */
export function accountPatch(
  input: unknown,
  opts: { kind?: unknown; actor_id?: unknown; now?: unknown; existing?: unknown } = {},
): Record<string, unknown> {
  const o = opts && typeof opts === 'object' ? opts : {};
  const kind = toStr(o.kind).toLowerCase();
  const n = normalizeAccountInput(input);
  const existing = Array.isArray(o.existing) ? o.existing : [];
  const parentCode = resolveParentCode(input, existing);
  const actor = toStr(o.actor_id);

  const patch: Record<string, unknown> = {
    schema_version: 1,
    code: n.code,
    name: n.name,
    parent_account: parentCode || '',
    status: n.status_valid ? n.status : 'active',
    creation_request_key: n.creation_request_key || accountRequestKey(kind, n.code),
  };
  if (n.description) patch.description = n.description;
  if (actor) patch.updated_by = actor;
  if (n.id) patch.id = n.id;
  return patch;
}

// ---------------------------------------------------------------------------
// Tree + select lists
// ---------------------------------------------------------------------------

/**
 * Nested chart-of-accounts tree, ordered by number at every level.
 * Roots = rows with no parent_account, an unresolvable parent code (orphans
 * stay visible), or a self-parent (corrupt — promoted to root rather than
 * hidden). Corrupt stored cycles can't hang this: visited-set guarded, and
 * rows a root pass couldn't reach surface as extra roots in sorted order.
 */
export function accountTree(accounts: unknown): AccountTreeNode[] {
  const rows = (Array.isArray(accounts) ? accounts : []).filter(isObj);
  const byCode = indexAccountsByCode(rows);
  const buckets = new Map<string, any[]>();
  const roots: any[] = [];

  for (const row of rows) {
    const p = parentCodeOf(row);
    const own = accountCodeOf(row);
    if (!p || p === own || !byCode.has(p)) {
      roots.push(row);
    } else {
      const list = buckets.get(p) || [];
      list.push(row);
      buckets.set(p, list);
    }
  }

  const visited = new Set<any>();
  const make = (row: any): AccountTreeNode => {
    visited.add(row);
    const kids = sortAccounts((buckets.get(accountCodeOf(row)) || []).filter((k) => !visited.has(k)));
    return { account: row, children: kids.map(make) };
  };

  const nodes = sortAccounts(roots).map(make);
  // Corrupt-cycle safety net: anything unreachable from a root becomes an
  // extra root (sorted), its own subtree still nested beneath it. Rows an
  // earlier pseudo-root already claimed are skipped — never duplicated.
  const leftovers = rows.filter((r) => !visited.has(r));
  for (const row of sortAccounts(leftovers)) {
    if (!visited.has(row)) nodes.push(make(row));
  }
  return nodes;
}

/**
 * Flatten a tree (or a raw account list — auto-treed) into ordered select-list
 * rows. label = '  ↳ '.repeat(depth) + 'code name' → top-level '4000 Sales
 * Income', child '  ↳ 4101 Wholesale Signs'. value = the GL code.
 */
export function flattenTree(nodes: unknown): FlatAccountRow[] {
  const list = Array.isArray(nodes) ? nodes : [];
  const looksLikeTree = list.every((n) => isObj(n) && ('account' in n || 'children' in n));
  const tree = (looksLikeTree ? list : accountTree(list)) as AccountTreeNode[];
  const out: FlatAccountRow[] = [];
  const walk = (node: AccountTreeNode, depth: number) => {
    const account = node.account;
    out.push({
      account,
      depth,
      code: accountCodeOf(account),
      name: toStr(account.name),
      status: statusOf(account),
      value: accountCodeOf(account),
      label: `${'  ↳ '.repeat(depth)}${accountDisplay(account)}`,
    });
    for (const child of node.children || []) walk(child, depth + 1);
  };
  for (const node of tree) walk(node, 0);
  return out;
}

/**
 * Rows offered to part/line account pickers — ACTIVE accounts only (the I-01
 * verify criterion: inactive accounts never appear), numeric code order.
 * Flat, not treed: pickers search by code/name, so every option carries the
 * canonical 'code name' label and code value.
 */
export function pickerAccounts(accounts: unknown): FlatAccountRow[] {
  return sortAccounts(accounts)
    .filter(isActiveAccount)
    .map((account) => ({
      account,
      depth: 0,
      code: accountCodeOf(account),
      name: toStr(account.name),
      status: 'active' as AccountStatus,
      value: accountCodeOf(account),
      label: accountDisplay(account),
    }));
}

// ---------------------------------------------------------------------------
// Status-toggle guards
// ---------------------------------------------------------------------------

/**
 * Deactivation pre-check — callers supply the counts this pure module can't
 * see: `children` = direct child rows (childrenOf), `splitsInUse` = number of
 * invoice splits referencing the code (or an array whose length counts — the
 * wiring layer counts Invoice.income_account_splits / cogs postings).
 * Blocks when active children still point at the account or history uses it.
 */
export function deactivateGuard(
  account: unknown,
  opts: { children?: unknown; splitsInUse?: unknown } = {},
): GuardResult {
  const o = opts && typeof opts === 'object' ? opts : {};
  const who = accountDisplay(account) || 'This account';

  const kids = (Array.isArray(o.children) ? o.children : []).filter(isObj);
  const activeKids = kids.filter(isActiveAccount);
  if (activeKids.length) {
    const names = activeKids.slice(0, 3).map(accountDisplay).join(', ');
    return {
      ok: false,
      code: 'active_children',
      reason: `${who} has ${activeKids.length} active sub-account(s) (${names}${activeKids.length > 3 ? ', …' : ''}) — deactivate or reassign them first.`,
      active_children: activeKids.length,
    };
  }

  const splits = typeof o.splitsInUse === 'number'
    ? o.splitsInUse
    : Array.isArray(o.splitsInUse) ? o.splitsInUse.length : 0;
  if (splits > 0) {
    return {
      ok: false,
      code: 'splits_in_use',
      reason: `${who} is referenced by ${splits} invoice split(s) — deactivating it would orphan posted history. Re-code those splits first.`,
      splits_in_use: splits,
    };
  }
  return { ok: true };
}

/**
 * Reactivation pre-check — the inverse hole deactivateGuard closes: a child
 * can't come back active while its parent is still inactive. Caller supplies
 * the resolved parent row (null/omitted = top-level → always ok).
 */
export function activateGuard(account: unknown, opts: { parent?: unknown } = {}): GuardResult {
  const o = opts && typeof opts === 'object' ? opts : {};
  const parent = isObj(o.parent) ? o.parent : undefined;
  if (parent && !isActiveAccount(parent)) {
    return {
      ok: false,
      code: 'parent_inactive',
      reason: `Parent '${accountDisplay(parent)}' is inactive — reactivate it before reactivating '${accountDisplay(account) || 'this account'}'.`,
    };
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Code suggestion
// ---------------------------------------------------------------------------

/**
 * Suggest the next free code for the kind — fills hundred-boundary slots
 * first (the seed convention: 4000/4100/…), then any gap inside the series
 * decade. Returns '' when the decade is exhausted or the kind is unknown.
 */
export function nextAccountCode(accounts: unknown, kind: unknown): string {
  const info = isAccountKind(kind) ? ACCOUNT_KIND_INFO[kind] : undefined;
  if (!info) return '';
  const used = new Set<string>();
  for (const row of Array.isArray(accounts) ? accounts : []) {
    const c = accountCodeOf(row);
    if (c) used.add(c);
  }
  const base = info.seed_base;
  for (let c = base; c <= base + 900; c += 100) {
    if (!used.has(String(c))) return String(c);
  }
  for (let c = base + 1; c <= base + 999; c += 1) {
    if (!used.has(String(c))) return String(c);
  }
  return '';
}

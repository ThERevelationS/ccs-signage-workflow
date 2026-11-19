// L-01 — CAS expected/nextFields key-parity sweep (static audit).
//
// Defect class: *IfUnchanged CAS helpers called with `expectedFields` keys that
// differ from `nextFields` keys — the revoke_link/bumpOpen bug shape:
//   - a field is written ($set via nextFields) but NOT guarded in expectedFields
//     => the CAS blind-overwrites a concurrent session's change; and
//   - a field guarded in expectedFields but never written is dead guard noise
//     that only causes spurious conflicts.
// For helpers that take a caller-supplied baseline (expectedFields), this audit
// compares the static key set of both arguments at every call site.
//
// Helper classes (discovered dynamically from base44/shared signatures):
//   explicit — signature destructures BOTH expectedFields + nextFields; the
//              caller hands the baseline in, so key parity must be checked
//              (replaceFoundationFieldsIfUnchanged,
//               replaceEstimatingRequestFieldsIfUnchanged — detected via its
//               ...args pass-through delegation,
//               replaceWorkOrderFieldsIfUnchanged).
//   derived  — signature takes nextFields but no expectedFields; the baseline
//              is computed inside the helper from the loaded record over the
//              nextFields keys, so parity holds by construction
//              (replaceJurisdictionFieldsIfUnchanged via `jurisdiction`,
//               replaceRegulationAlertFieldsIfUnchanged via `alert`,
//               replaceImportedOrderFieldsIfUnchanged via `order`,
//               replaceAuthorizedEmailCredentialFieldsIfUnchanged via `user`).
//   other    — no nextFields pair contract (scalar/snapshot CAS):
//              setFleetInventoryQuantityIfUnchanged (single-field numeric),
//              linkWorkOrderIfUnchanged (expectedSnapshot whole-record CAS).
//
// Verdicts: OK (parity proven — same key-source expression, resolved key sets
// equal, or derived-by-construction), VIOLATION (proven key mismatch or a
// missing expectedFields/nextFields argument), WARN (too dynamic to verify —
// NOT counted as a violation). Exits non-zero iff any VIOLATION exists.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SHARED_DIR = join(ROOT, 'base44', 'shared');
const SCAN_DIRS = [join(ROOT, 'base44', 'functions'), SHARED_DIR];
const CODE_EXTS = new Set(['.ts', '.mts', '.cts', '.js', '.mjs', '.cjs']);

// Function-local helpers not exported from base44/shared but sharing the CAS
// contract, classified by hand from their definitions:
//   ensureEstimateCustomer/entry.ts:64 — updateCustomerFieldsIfUnchanged(
//     CustomerUser, loaded, fields, label): baseline derived inside from
//     `loaded` over `fields` keys (same key set by construction).
//   smartsheetSyncAction/entry.ts:1652 — saveSyncConfigIfUnchanged(base44, body):
//     whole-value CAS anchored on expected_setting_value + updated_date.
//   opportunityBridgeApplyEngine adapter — linkWorkOrderIfUnchanged({
//     workOrderId, opportunityId, expectedSnapshot }): whole-record snapshot CAS.
const EXTRA_HELPERS = {
  updateCustomerFieldsIfUnchanged: 'derived',
  saveSyncConfigIfUnchanged: 'other',
  linkWorkOrderIfUnchanged: 'other',
};

// Expected-baseline builders: expected*(record, KEY_SOURCE) returns an object
// whose key set equals keys(KEY_SOURCE). For any /^expected[A-Z]?\w*$/ callee —
// expectedFoundationFields, expectedWorkOrderFields, expectedJurisdictionFields,
// and the function-local expectedFor(baseline, current, desired) — the LAST
// argument is the key source.
const EXPECTED_BUILDER_RE = /^(?:expected[A-Z]\w*|expectedFor)$/;

const identRe = /^[A-Za-z_$][\w$]*$/;
const memberRe = /^[A-Za-z_$][\w$]*(?:\?*\.)+[A-Za-z_$][\w$]*$/;
const normalizeExpr = (s) => String(s || '').replace(/\s+/g, ' ').trim();

/* ------------------------------------------------------------------------ */
/* source loading + comment stripping                                        */
/* ------------------------------------------------------------------------ */

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...walk(full));
    else if (CODE_EXTS.has(extname(entry))) out.push(full);
  }
  return out;
}

// Blanks out // and /* */ comments while preserving offsets and newlines, so
// helper names inside comments never register as call sites and bracket
// matching is never confused by commented braces. String/template contents are
// preserved verbatim.
function stripComments(src) {
  const out = src.split('');
  let i = 0;
  const n = src.length;
  // stack-driven state machine: states 'code', 'single', 'double', 'template',
  // 'tmplexpr' (a ${} expression inside a template, behaves like code except
  // that a depth-0 '}' returns to 'template').
  let state = 'code';
  const stack = [];
  while (i < n) {
    const c = src[i];
    const d = src[i + 1];
    if (state === 'code' || state === 'tmplexpr') {
      if (c === '/' && d === '/') {
        out[i] = ' '; out[i + 1] = ' '; i += 2;
        while (i < n && src[i] !== '\n') { out[i] = ' '; i += 1; }
        continue;
      }
      if (c === '/' && d === '*') {
        out[i] = ' '; out[i + 1] = ' '; i += 2;
        while (i < n && !(src[i] === '*' && src[i + 1] === '/')) {
          if (src[i] !== '\n') out[i] = ' ';
          i += 1;
        }
        if (i < n) { out[i] = ' '; out[i + 1] = ' '; i += 2; }
        continue;
      }
      if (c === "'") { stack.push(state); state = 'single'; i += 1; continue; }
      if (c === '"') { stack.push(state); state = 'double'; i += 1; continue; }
      if (c === '`') { stack.push(state); state = 'template'; i += 1; continue; }
      if (state === 'tmplexpr') {
        if (c === '{') { stack.push('tmplexpr'); i += 1; continue; }
        if (c === '}') { state = stack.pop() || 'code'; i += 1; continue; }
      }
      i += 1;
      continue;
    }
    if (state === 'single' || state === 'double') {
      const q = state === 'single' ? "'" : '"';
      if (c === '\\') { i += 2; continue; }
      if (c === q) state = stack.pop() || 'code';
      i += 1;
      continue;
    }
    // template raw text
    if (c === '\\') { i += 2; continue; }
    if (c === '`') { state = stack.pop() || 'code'; i += 1; continue; }
    if (c === '$' && d === '{') { stack.push('template'); state = 'tmplexpr'; i += 2; continue; }
    i += 1;
  }
  return out.join('');
}

/* ------------------------------------------------------------------------ */
/* tiny token-aware scanner (operates on comment-stripped source)            */
/* ------------------------------------------------------------------------ */

// Skip a string/template starting at i; returns index AFTER it, or -1.
function skipString(san, i) {
  const q = san[i];
  const n = san.length;
  i += 1;
  while (i < n) {
    const c = san[i];
    if (c === '\\') { i += 2; continue; }
    if (c === q) return i + 1;
    if (q === '`' && c === '$' && san[i + 1] === '{') {
      const end = matchToken(san, i + 1, '{', '}');
      if (end === -1) return -1;
      i = end + 1;
      continue;
    }
    i += 1;
  }
  return -1;
}

const REGEX_PREV_CHARS = new Set([...'=([{,:;!&|?+-*%~^<>']);
const REGEX_PREV_WORDS = new Set(['return', 'typeof', 'case', 'delete', 'void', 'in', 'of', 'instanceof', 'do', 'else', 'yield', 'await', 'new', 'throw']);

// Is the '/' at index i a regex literal start (vs division)?
function isRegexStart(san, i) {
  let j = i - 1;
  while (j >= 0 && /\s/.test(san[j])) j -= 1;
  if (j < 0) return true;
  const c = san[j];
  if (REGEX_PREV_CHARS.has(c)) return true;
  if (/[\w$]/.test(c)) {
    let k = j;
    while (k >= 0 && /[\w$]/.test(san[k])) k -= 1;
    const word = san.slice(k + 1, j + 1);
    return REGEX_PREV_WORDS.has(word);
  }
  return false;
}

// Skip a regex literal starting at i; returns index after flags, or -1.
function skipRegex(san, i) {
  const n = san.length;
  i += 1;
  let inClass = false;
  while (i < n) {
    const c = san[i];
    if (c === '\\') { i += 2; continue; }
    if (c === '[') inClass = true;
    else if (c === ']') inClass = false;
    else if (c === '/' && !inClass) {
      i += 1;
      while (i < n && /[a-z]/i.test(san[i])) i += 1;
      return i;
    } else if (c === '\n') return -1;
    i += 1;
  }
  return -1;
}

// Skip over a string or regex atom at i; returns end index or i if not an atom.
function skipAtom(san, i) {
  const c = san[i];
  if (c === "'" || c === '"' || c === '`') return skipString(san, i);
  if (c === '/' && isRegexStart(san, i)) {
    const e = skipRegex(san, i);
    return e === -1 ? i : e;
  }
  return i;
}

// Returns index of the token closing the opener at openIdx, or -1.
function matchToken(san, openIdx, openCh, closeCh) {
  let depth = 0;
  let i = openIdx;
  const n = san.length;
  while (i < n) {
    const c = san[i];
    const e = skipAtom(san, i);
    if (e > i) { i = e; continue; }
    if (c === openCh) depth += 1;
    else if (c === closeCh) { depth -= 1; if (depth === 0) return i; }
    i += 1;
  }
  return -1;
}

// Split `text` on commas at bracket-depth 0 (strings/regexes skipped).
function splitTopLevel(text) {
  const parts = [];
  let depth = 0;
  let start = 0;
  let i = 0;
  const n = text.length;
  while (i < n) {
    const c = text[i];
    const e = skipAtom(text, i);
    if (e > i) { i = e; continue; }
    if (c === '(' || c === '{' || c === '[') depth += 1;
    else if (c === ')' || c === '}' || c === ']') depth -= 1;
    else if (c === ',' && depth === 0) {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
    i += 1;
  }
  parts.push(text.slice(start));
  return parts;
}

// Index of the first ':' at bracket-depth 0 inside an object-entry string.
function topLevelColon(text) {
  let depth = 0;
  let i = 0;
  const n = text.length;
  while (i < n) {
    const c = text[i];
    const e = skipAtom(text, i);
    if (e > i) { i = e; continue; }
    if (c === '(' || c === '{' || c === '[') depth += 1;
    else if (c === ')' || c === '}' || c === ']') depth -= 1;
    else if (c === ':' && depth === 0) return i;
    i += 1;
  }
  return -1;
}

/* ------------------------------------------------------------------------ */
/* key-set resolution                                                        */
/* ------------------------------------------------------------------------ */

// Parse an object-literal body (WITHOUT outer braces) into its top-level keys.
function parseObjectEntries(text) {
  const keys = new Set();
  const spreads = [];
  const dynamic = [];
  for (const rawEntry of splitTopLevel(text)) {
    const entry = rawEntry.trim();
    if (!entry) continue;
    if (entry.startsWith('...')) {
      spreads.push(normalizeExpr(entry.slice(3)));
      continue;
    }
    const colon = topLevelColon(entry);
    const keyPart = (colon === -1 ? entry : entry.slice(0, colon)).trim();
    if (keyPart.startsWith('[')) {
      dynamic.push(`computed key ${keyPart.slice(0, 30)}`);
      continue;
    }
    const m = keyPart.match(/^(?:'([^']*)'|"([^"]*)"|([A-Za-z_$][\w$]*))/);
    if (m) keys.add(m[1] ?? m[2] ?? m[3]);
    else dynamic.push(`unparsed entry "${entry.slice(0, 40)}"`);
  }
  return { keys, spreads, dynamic };
}

// All `const|let|var <ident>(: type)? =` declaration sites in sanitized source.
function findDecls(san, ident) {
  const re = new RegExp(`\\b(?:const|let|var)\\s+${ident.replace(/\$/g, '\\$')}\\s*(?::[^=;]*?)?=`, 'g');
  const out = [];
  let m;
  while ((m = re.exec(san))) out.push({ start: m.index, rhsStart: m.index + m[0].length });
  return out;
}

// Mutations of `<ident>` inside [fromOffset, toOffset): `id.k =`, `id["k"] =`,
// `id[<computed>] =`, `Object.assign(id, …)`.
function scanMutations(san, ident, fromOffset, toOffset) {
  if (toOffset <= fromOffset) return { keys: new Set(), dynamic: [] };
  const win = san.slice(fromOffset, toOffset);
  const keys = new Set();
  const dynamic = [];
  const idEsc = ident.replace(/\$/g, '\\$');
  let m;
  const dotRe = new RegExp(`\\b${idEsc}\\s*\\.\\s*([A-Za-z_$][\\w$]*)\\s*=(?!=)`, 'g');
  while ((m = dotRe.exec(win))) keys.add(m[1]);
  const brLit = new RegExp(`\\b${idEsc}\\s*\\[\\s*'([\\w$-]+)'\\s*\\]\\s*=(?!=)|\\b${idEsc}\\s*\\[\\s*"([\\w$-]+)"\\s*\\]\\s*=(?!=)`, 'g');
  while ((m = brLit.exec(win))) keys.add(m[1] ?? m[2]);
  const brDyn = new RegExp(`\\b${idEsc}\\s*\\[\\s*(?!['"}\\]])`, 'g');
  while ((m = brDyn.exec(win))) {
    // `<id>[expr] =` with non-literal index — only when followed by `=` later
    const after = win.slice(m.index + m[0].length, m.index + m[0].length + 40);
    if (/\]\s*=(?!=)/.test(after)) dynamic.push(`${ident}[<computed>] =`);
  }
  const oaRe = new RegExp(`Object\\.assign\\s*\\(\\s*${idEsc}\\s*,`, 'g');
  while ((m = oaRe.exec(win))) {
    const parenIdx = fromOffset + m.index + m[0].lastIndexOf('(');
    const closeIdx = matchToken(san, parenIdx, '(', ')');
    if (closeIdx === -1) { dynamic.push(`Object.assign(${ident}, …) unterminated`); continue; }
    const args = splitTopLevel(san.slice(parenIdx + 1, closeIdx)).map((a) => a.trim()).filter(Boolean);
    for (const arg of args.slice(1)) {
      if (arg.startsWith('{')) {
        const end = matchToken(arg, 0, '{', '}');
        const parsed = parseObjectEntries(arg.slice(1, end === -1 ? undefined : end));
        parsed.keys.forEach((k) => keys.add(k));
        parsed.spreads.forEach((sp) => dynamic.push(`Object.assign spread ${sp}`));
        parsed.dynamic.forEach((dd) => dynamic.push(dd));
      } else {
        dynamic.push(`Object.assign(${ident}, ${arg.slice(0, 40)})`);
      }
    }
  }
  return { keys, dynamic };
}

// Extract the LAST call argument's source text from a call expression `callee(...)`.
function lastCallArg(callText) {
  const openIdx = callText.indexOf('(');
  if (openIdx === -1) return null;
  const closeIdx = matchToken(callText, openIdx, '(', ')');
  if (closeIdx === -1) return null;
  const args = splitTopLevel(callText.slice(openIdx + 1, closeIdx)).map((a) => normalizeExpr(a)).filter(Boolean);
  return args.length ? args[args.length - 1] : null;
}

// Resolve an expression's static key set.
// -> { keys:Set|null, dynamic:[], exprKind, declEnd, identName, rhs }
function resolveKeys(expr, ctx, depth = 0) {
  const text = normalizeExpr(expr);
  const dyn = (r) => ({ keys: null, dynamic: [r], exprKind: 'other', declEnd: null });
  if (!text) return dyn('empty expression');
  if (depth > 8) return dyn('resolution depth exceeded');

  // Fully-parenthesized expression — unwrap.
  if (text.startsWith('(')) {
    const cIdx = matchToken(text, 0, '(', ')');
    if (cIdx === text.length - 1) return resolveKeys(text.slice(1, -1), ctx, depth + 1);
    return dyn(`unresolved expression '${text.slice(0, 60)}'`);
  }

  // Object literal.
  if (text.startsWith('{')) {
    const closeIdx = matchToken(text, 0, '{', '}');
    if (closeIdx !== text.length - 1) {
      return dyn(`trailing tokens after object literal '${text.slice(0, 60)}'`);
    }
    const parsed = parseObjectEntries(text.slice(1, closeIdx));
    const dynamic = [...parsed.dynamic];
    for (const spread of parsed.spreads) {
      const sub = resolveKeys(spread, ctx, depth + 1);
      if (sub.keys) sub.keys.forEach((k) => parsed.keys.add(k));
      else dynamic.push(`unresolved spread ...${spread}`);
      dynamic.push(...sub.dynamic);
    }
    return { keys: parsed.keys, dynamic, exprKind: 'literal', declEnd: null };
  }

  // Bare identifier — resolve last declaration before the call offset.
  if (identRe.test(text)) {
    const decls = findDecls(ctx.san, text).filter((d) => d.rhsStart < ctx.callOffset);
    if (!decls.length) {
      return { keys: null, dynamic: [`identifier '${text}' has no declaration before the call`], exprKind: 'identifier', declEnd: null, identName: text };
    }
    const decl = decls[decls.length - 1];
    const rhsRaw = ctx.san.slice(decl.rhsStart);
    let end = rhsRaw.length;
    let d = 0;
    for (let i = 0; i < rhsRaw.length; i += 1) {
      const e = skipAtom(rhsRaw, i);
      if (e > i) { i = e - 1; continue; }
      const c = rhsRaw[i];
      if (c === '(' || c === '{' || c === '[') d += 1;
      else if (c === ')' || c === '}' || c === ']') d -= 1;
      else if ((c === ';' || c === ',') && d === 0) { end = i; break; }
      else if (c === '\n' && d === 0) { end = i; break; }
    }
    const rhs = rhsRaw.slice(0, end).trim();
    const rhsEnd = decl.rhsStart + end;
    const resolved = resolveKeys(rhs, ctx, depth + 1);
    const mut = scanMutations(ctx.san, text, rhsEnd, ctx.callOffset);
    mut.dynamic.forEach((dd) => resolved.dynamic.push(dd));
    if (resolved.keys) mut.keys.forEach((k) => resolved.keys.add(k));
    else if (mut.keys.size) resolved.dynamic.push(`base unresolved; mutated keys: ${[...mut.keys].join(', ')}`);
    resolved.exprKind = 'identifier';
    resolved.declEnd = rhsEnd;
    resolved.identName = text;
    resolved.rhs = normalizeExpr(rhs);
    return resolved;
  }

  // Call expression — expected* builders derive keys from their LAST argument.
  const callMatch = text.match(/^([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\s*\(/);
  if (callMatch) {
    const callee = callMatch[1].split('.').pop();
    if (EXPECTED_BUILDER_RE.test(callee)) {
      const keySrc = lastCallArg(text);
      if (keySrc == null) return dyn(`${callMatch[1]}() has no key-source argument`);
      const sub = resolveKeys(keySrc, ctx, depth + 1);
      sub.exprKind = 'builder';
      sub.builderCallee = callMatch[1];
      sub.builderKeySource = keySrc;
      return sub;
    }
    return dyn(`opaque call ${callMatch[1]}(…)`);
  }

  // Member expression — key set not statically enumerable.
  if (memberRe.test(text)) return dyn(`member expression '${text}'`);
  return dyn(`unresolved expression '${text.slice(0, 60)}'`);
}

/* ------------------------------------------------------------------------ */
/* helper discovery in base44/shared                                         */
/* ------------------------------------------------------------------------ */

const sharedFiles = walk(SHARED_DIR);
const helpers = {}; // name -> { cls, definedIn }

for (const file of sharedFiles) {
  const src = readFileSync(file, 'utf8');
  const san = stripComments(src);
  const re = /export\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*IfUnchanged)\s*\(/g;
  let m;
  while ((m = re.exec(san))) {
    const name = m[1];
    const openIdx = san.indexOf('(', m.index + m[0].length - 1);
    const closeIdx = matchToken(san, openIdx, '(', ')');
    const params = closeIdx === -1 ? '' : san.slice(openIdx + 1, closeIdx);
    let cls;
    const hasExpected = /\bexpectedFields\b/.test(params);
    const hasNext = /\bnextFields\b/.test(params);
    if (hasExpected && hasNext) cls = 'explicit';
    else if (hasNext) cls = 'derived';
    else cls = 'other';
    helpers[name] = { cls, definedIn: relative(ROOT, file).replace(/\\/g, '/') };
  }
}

// Delegation pass: a wrapper like replaceEstimatingRequestFieldsIfUnchanged(args)
// that forwards `...args` to an explicit helper inherits its class.
for (const name of Object.keys(helpers)) {
  if (helpers[name].cls !== 'other') continue;
  const defFile = join(ROOT, helpers[name].definedIn);
  const src = readFileSync(defFile, 'utf8');
  const san = stripComments(src);
  const defRe = new RegExp(`export\\s+(?:async\\s+)?function\\s+${name}\\s*\\(`);
  const dm = defRe.exec(san);
  if (!dm) continue;
  const openIdx = san.indexOf('(', dm.index + dm[0].length - 1);
  const closeIdx = matchToken(san, openIdx, '(', ')');
  const bodyOpen = san.indexOf('{', closeIdx);
  const bodyClose = matchToken(san, bodyOpen, '{', '}');
  const body = bodyClose === -1 ? '' : san.slice(bodyOpen, bodyClose);
  const fwd = body.match(/return\s+([A-Za-z_$][\w$]*IfUnchanged)\s*\(\s*\{[\s\S]*?\.\.\.\s*\w+/);
  if (fwd && helpers[fwd[1]]) helpers[name].cls = `${helpers[fwd[1]].cls} (delegated)`;
}

for (const [name, cls] of Object.entries(EXTRA_HELPERS)) {
  if (!helpers[name]) helpers[name] = { cls, definedIn: '(function-local/adapter)' };
}

const classOf = (name) => (helpers[name]?.cls || 'unclassified').split(' ')[0];

/* ------------------------------------------------------------------------ */
/* call-site scan                                                            */
/* ------------------------------------------------------------------------ */

const scanFiles = SCAN_DIRS.flatMap((d) => walk(d));
const results = []; // {verdict, file, line, helper, detail}
const helperUseCounts = {};

function lineOf(src, offset) {
  let line = 1;
  for (let i = 0; i < offset; i += 1) if (src[i] === '\n') line += 1;
  return line;
}

// True when the match is a function/method DEFINITION rather than a call.
function isDefinition(san, idx) {
  const before = san.slice(Math.max(0, idx - 40), idx);
  if (/(?:export\s+)?(?:async\s+)?function\s*$/.test(before)) return true;
  if (/(?:async|get|set|static)\s*$/.test(before)) return true;
  return false;
}

for (const file of scanFiles) {
  const src = readFileSync(file, 'utf8');
  const san = stripComments(src);
  const rel = relative(ROOT, file).replace(/\\/g, '/');
  const callRe = /\b([A-Za-z_$][\w$]*IfUnchanged)\s*\(/g;
  let m;
  while ((m = callRe.exec(san))) {
    const name = m[1];
    if (isDefinition(san, m.index)) continue;
    const openIdx = san.indexOf('(', m.index + m[0].length - 1);
    const line = lineOf(src, m.index);
    const closeIdx = matchToken(san, openIdx, '(', ')');
    const cls = classOf(name);
    helperUseCounts[name] = (helperUseCounts[name] || 0) + 1;
    const site = { file: rel, line, helper: name };
    if (closeIdx === -1) {
      results.push({ ...site, verdict: 'WARN', detail: 'could not parse call arguments' });
      continue;
    }
    const argText = san.slice(openIdx + 1, closeIdx).trim();
    const ctx = { san, src, callOffset: m.index };

    // Non-object call shapes: positional args (local helpers) or variables.
    if (!argText.startsWith('{')) {
      if (cls === 'explicit') {
        results.push({ ...site, verdict: 'VIOLATION', detail: `non-object argument '${argText.slice(0, 50)}' — expectedFields/nextFields not verifiable` });
      } else {
        results.push({ ...site, verdict: 'OK', detail: `(${cls}) no field-pair contract` });
      }
      continue;
    }
    const objClose = matchToken(argText, 0, '{', '}');
    const entriesText = objClose === -1 ? argText.slice(1) : argText.slice(1, objClose);

    const argEntries = {};
    const argSpreads = [];
    for (const raw of splitTopLevel(entriesText)) {
      const entry = raw.trim();
      if (!entry) continue;
      if (entry.startsWith('...')) { argSpreads.push(normalizeExpr(entry.slice(3))); continue; }
      const colon = topLevelColon(entry);
      if (colon === -1) {
        if (identRe.test(entry)) argEntries[entry] = entry; // shorthand
        continue;
      }
      const key = entry.slice(0, colon).trim().replace(/^['"]|['"]$/g, '');
      argEntries[key] = entry.slice(colon + 1).trim();
    }

    const expectedExpr = argEntries.expectedFields ?? argEntries.expected ?? null;
    const nextExpr = argEntries.nextFields ?? argEntries.next ?? null;

    if (cls === 'derived') {
      results.push({ ...site, verdict: 'OK',
        detail: 'baseline derived inside helper from the loaded record over nextFields keys (parity by construction)' });
      continue;
    }
    if (cls === 'other') {
      results.push({ ...site, verdict: 'OK', detail: '(other) no expectedFields/nextFields pair contract' });
      continue;
    }
    if (cls === 'unclassified') {
      results.push({ ...site, verdict: 'WARN', detail: 'helper not exported from base44/shared and not in EXTRA_HELPERS — contract unknown' });
      continue;
    }

    // cls === 'explicit'
    if (nextExpr == null && expectedExpr == null && argSpreads.length) {
      results.push({ ...site, verdict: 'WARN', detail: `arguments forwarded via spread ${argSpreads.join(', ')} — parity decided at upstream call sites` });
      continue;
    }
    if (nextExpr == null) {
      results.push({ ...site, verdict: 'VIOLATION', detail: 'missing nextFields argument' });
      continue;
    }
    if (expectedExpr == null) {
      results.push({ ...site, verdict: 'VIOLATION', detail: 'missing expectedFields argument — every nextFields key must carry a loaded baseline' });
      continue;
    }

    const nxtNorm = normalizeExpr(nextExpr);
    const expNorm = normalizeExpr(expectedExpr);

    // Same-expression fast path: inline builder expected*(…, X) where the
    // key-source X is textually identical to the nextFields expression. Both
    // are evaluated at the call, so key sets are equal by construction.
    const inlineCall = expNorm.match(/^([A-Za-z_$][\w$]*)\s*\(/);
    if (inlineCall && EXPECTED_BUILDER_RE.test(inlineCall[1].split('.').pop())) {
      const keySrc = lastCallArg(expNorm);
      if (keySrc === nxtNorm) {
        results.push({ ...site, verdict: 'OK', detail: `expected built by ${inlineCall[1]}(…, ${nxtNorm}) — identical key source` });
        continue;
      }
    }

    const expResolved = resolveKeys(expectedExpr, ctx);
    const nextResolved = resolveKeys(nextExpr, ctx);

    // Identifier path: expectedFields: <ident> where <ident> = builder(rec, E).
    // The builder ran EARLIER, so mutations of E between its evaluation and the
    // call are written-but-unguarded (the revoke_link defect shape).
    if (expResolved.exprKind === 'identifier' && expResolved.rhs) {
      const rhsCall = expResolved.rhs.match(/^([A-Za-z_$][\w$]*)\s*\(/);
      if (rhsCall && EXPECTED_BUILDER_RE.test(rhsCall[1].split('.').pop())) {
        const keySrc = lastCallArg(expResolved.rhs);
        if (keySrc === nxtNorm) {
          if (identRe.test(keySrc) && expResolved.declEnd != null) {
            const mut = scanMutations(san, keySrc, expResolved.declEnd, ctx.callOffset);
            if (mut.keys.size || mut.dynamic.length) {
              const parts = [];
              if (mut.keys.size) parts.push(`written-but-unguarded (added after baseline snapshot): ${[...mut.keys].join(', ')}`);
              mut.dynamic.forEach((dd) => parts.push(`dynamic mutation after snapshot: ${dd}`));
              results.push({ ...site, verdict: 'VIOLATION', detail: `expectedFields snapshot precedes nextFields mutation — ${parts.join('; ')}` });
              continue;
            }
          }
          results.push({ ...site, verdict: 'OK', detail: `expected var built by ${rhsCall[1]}(…, ${keySrc}) — identical key source` });
          continue;
        }
      }
    }

    // General path: compare statically resolved key sets both directions.
    if (expResolved.keys && nextResolved.keys) {
      const missingInExpected = [...nextResolved.keys].filter((k) => !expResolved.keys.has(k));
      const missingInNext = [...expResolved.keys].filter((k) => !nextResolved.keys.has(k));
      if (!missingInExpected.length && !missingInNext.length) {
        results.push({ ...site, verdict: 'OK', detail: `resolved key sets equal (${expResolved.keys.size} field(s))` });
      } else {
        const parts = [];
        if (missingInExpected.length) parts.push(`written-but-unguarded: ${missingInExpected.join(', ')}`);
        if (missingInNext.length) parts.push(`guarded-but-not-written: ${missingInNext.join(', ')}`);
        results.push({ ...site, verdict: 'VIOLATION', detail: parts.join('; ') });
      }
      continue;
    }

    const why = [];
    if (!expResolved.keys) why.push(`expectedFields ${expResolved.dynamic[0] || 'unresolvable'}`);
    if (!nextResolved.keys) why.push(`nextFields ${nextResolved.dynamic[0] || 'unresolvable'}`);
    results.push({ ...site, verdict: 'WARN', detail: `unverifiable — ${why.join('; ')}` });
  }
}

/* ------------------------------------------------------------------------ */
/* report                                                                    */
/* ------------------------------------------------------------------------ */

results.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);

console.log('CAS KEY-PARITY AUDIT — *IfUnchanged helpers');
console.log('');
console.log('Helpers (discovered in base44/shared + function-local extras):');
for (const [name, info] of Object.entries(helpers).sort()) {
  const calls = helperUseCounts[name] || 0;
  console.log(`  ${name.padEnd(46)} [${info.cls}]  ${calls} call site(s)  — ${info.definedIn}`);
}
console.log('');
console.log('Call sites:');
for (const r of results) {
  console.log(`  ${r.verdict.padEnd(9)} ${r.file}:${r.line}  ${r.helper} — ${r.detail}`);
}
console.log('');

const violations = results.filter((r) => r.verdict === 'VIOLATION');
const warns = results.filter((r) => r.verdict === 'WARN');
const oks = results.filter((r) => r.verdict === 'OK');
console.log(`Summary: ${results.length} call sites — ${oks.length} OK, ${warns.length} WARN, ${violations.length} VIOLATION`);
if (violations.length) {
  console.log('');
  console.log('VIOLATIONS:');
  for (const v of violations) console.log(`  ${v.file}:${v.line}  ${v.helper} — ${v.detail}`);
  console.log('');
  console.log(`FAIL cas-key-parity (${violations.length} violation(s))`);
  process.exit(1);
}
console.log('PASS cas-key-parity');

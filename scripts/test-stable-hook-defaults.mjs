#!/usr/bin/env node
// scripts/test-stable-hook-defaults.mjs — M-06 stable-hook-defaults audit
//
// Defect class: `data: x = []` (or `= {}`) destructured defaults on hook results,
// `a || []` / `a ?? {}` fallback declarations, and per-render literal decls whose
// variable lands in a useEffect/useMemo/useCallback dep array. The defaulted
// literal gets a NEW identity every render, so the dep never compares equal ->
// effects/memos re-run every render -> setState-in-effect loops. This class was
// fixed once in useAllWorkOrders (workOrderCache.js:302-323 returns
// `data ?? EMPTY_WORK_ORDERS`); this audit generalizes the check across src/.
//
// Hit kinds:
//   destructure-hook   const { data: x = [] } = useQuery()/useCustomHook()
//   destructure        const { x = [] } = <non-hook expr>
//   param-default      ({ x = [] }) => / function f({ x = [] }) / m({ x = [] }) {
//   fallback-decl      const x = expr || [] / ?? {} / || IDENT
//   literal-decl       const x = [] / {} / Object.freeze(..) / new Map()
//   query-select       useQuery({ select: d => d?.items ?? [] })
//   query-placeholderData  useQuery({ placeholderData: [] })
//
// Classification per hit:
//   VIOLATION  defaulted var appears directly in a dep array + default is a
//              per-render literal (or resolves to a local literal)
//   STABLE     no dep-array usage, or default resolves to a shared module const /
//              import / memoized hook result, or hit sits inside a hook factory
//   UNCERTAIN  member-derivation deps, unresolvable default, direct dep with
//              unproven default, or var passed to a custom hook
//
// Exits 0 with `PASS stable-hook-defaults` when violations == 0, else 1.

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, '../src');
const FILE_RE = /\.(?:jsx?|tsx?)$/;

// keywords that can directly precede a string/template/quote
const STRING_KEYWORDS = new Set([
  'return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void',
  'throw', 'case', 'yield', 'await', 'import', 'from', 'default', 'extends',
]);
const DEP_HOOKS = new Set(['Effect', 'LayoutEffect', 'Memo', 'Callback', 'ImperativeHandle']);
// First arg of these runs per-callback/per-init, not per-render — a literal
// inside does not get a fresh identity each render.
const FACTORY_HOOKS = new Set([
  'Effect', 'LayoutEffect', 'Memo', 'Callback', 'ImperativeHandle',
  'State', 'Ref', 'Reducer',
]);
const BUILTIN_HOOKS = new Set([
  '', 'State', 'Effect', 'LayoutEffect', 'Memo', 'Callback', 'Ref',
  'ImperativeHandle', 'Context', 'Reducer', 'Id', 'Transition', 'DeferredValue',
  'SyncExternalStore', 'InsertionEffect', 'DebugValue', 'Optimistic',
  'ActionState', 'FormStatus', 'Query', 'InfiniteQuery', 'Queries',
  'SuspenseQuery', 'Mutation', 'QueryClient',
]);

const HOOK_CALL_RE = /\b(?:React\s*\.\s*)?use(?:(?=[A-Z])[\w$]*)?\s*(?:<[^>\n]{0,80}>)?\s*\(/g;
const QUERY_CALL_RE = /\b(?:[\w$]+\s*\.\s*)?use(?:Query|InfiniteQuery|SuspenseQuery)\s*(?:<[^>\n]{0,80}>)?\s*\(/g;
const DECL_OBJ_RE = /\b(?:const|let|var)\s*\{/g;
const VAR_DECL_RE = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=(?![=>])/g;
const LITERAL_TAIL_RE = /^\s*(Object\s*\.\s*freeze\s*\(|new\s+[A-Za-z_$][\w$]*\s*\(|\[|\{)/;
const ARROW_PARAMS_RE = /\(([^()]*)\)\s*=>/g;
const FN_PARAMS_RE = /\bfunction\s*[\w$]*\s*\(([^()]*)\)/g;
const METHOD_PARAMS_RE = /[A-Za-z_$][\w$]*\s*\(([^()]*)\)\s*\{/g;

// scanTemplate — proper template-literal scanner. TEXT mode ends at a depth-0
// backtick; `${` enters CODE mode where `{}` braces are balanced (object
// literals, nested templates, strings, comments all handled). `src`/`n` are
// closed over for speed.
let src = '', n = 0;
function scanTemplate(j) {
  let mode = 'text', d = 0;
  while (j < n) {
    const ch = src[j];
    if (mode === 'text') {
      if (ch === '\\') { j += 2; continue; }
      if (ch === '`') return j + 1;
      if (ch === '$' && src[j + 1] === '{') { mode = 'code'; d = 1; j += 2; continue; }
      j++; continue;
    }
    // code mode — inside a ${} hole
    if (ch === '{') { d++; j++; continue; }
    if (ch === '}') { d--; j++; if (d === 0) mode = 'text'; continue; }
    if (ch === '`') { j = scanTemplate(j + 1); continue; }            // nested template
    if (ch === '"' || ch === "'") {                                   // string inside hole
      j++;
      while (j < n && src[j] !== ch && src[j] !== '\n') { if (src[j] === '\\') j++; j++; }
      j++; continue;
    }
    if (ch === '/' && src[j + 1] === '/') { while (j < n && src[j] !== '\n') j++; continue; }
    if (ch === '/' && src[j + 1] === '*') { const e = src.indexOf('*/', j + 2); j = e < 0 ? n : e + 2; continue; }
    j++;
  }
  return j;
}

// ---------------------------------------------------------------------------
// maskSource — blank strings/comments/templates/regexes, keep positions + \n.
// A quote that immediately follows a word char is treated as JSX-text
// apostrophe ("don't") rather than a string opener — unless the word is a
// keyword that can precede a string ("return 'x'").
// ---------------------------------------------------------------------------
function maskSource(s) {
  src = s; n = s.length;
  const out = s.split('');
  const blank = (a, b) => { for (let k = a; k < b && k < n; k++) if (out[k] !== '\n') out[k] = ' '; };
  const prevWord = (i) => {
    for (let j = i - 1; j >= 0; j--) {
      const c = src[j];
      if (c === ' ' || c === '\t' || c === '\n' || c === '\r') continue;
      return { ch: c, idx: j };
    }
    return { ch: '', idx: -1 };
  };
  // '<' and '>' are excluded: `</tag>` is a JSX close, `=> /re/` keeps '>'
  // covered? no — `=>` ends with '>' so '>' must stay allowed; '<' never is.
  const regexAllowedAfter = new Set('(:,=;!&|?{}[]+-*%~^>');
  let i = 0;
  while (i < n) {
    const c = src[i];
    if (c === '/' && src[i + 1] === '/') {
      let j = i; while (j < n && src[j] !== '\n') j++;
      blank(i, j); i = j; continue;
    }
    if (c === '/' && src[i + 1] === '*') {
      let j = src.indexOf('*/', i + 2); j = j < 0 ? n : j + 2;
      blank(i, j); i = j; continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      const p = prevWord(i);
      if (/[A-Za-z0-9_$]/.test(p.ch)) {
        // quote directly after a word char: JSX-text apostrophe ("don't") —
        // UNLESS the word is a keyword that can precede a string ("return 'x'")
        const w = src.slice(Math.max(0, p.idx - 30), p.idx + 1).match(/[A-Za-z_$]+$/)?.[0] || '';
        if (!STRING_KEYWORDS.has(w)) { i++; continue; }
      }
      if (c === '`') {
        const j = scanTemplate(i + 1);
        blank(i, j); i = j; continue;
      }
      let j = i + 1;
      while (j < n && src[j] !== c && src[j] !== '\n') { if (src[j] === '\\') j++; j++; }
      blank(i, Math.min(j + 1, n)); i = j + 1; continue;
    }
    if (c === '/') {
      const p = prevWord(i);
      // `x/>` (JSX self-close) and `</` (closing tag) are never regex starts —
      // `<` is already excluded above; guard the `/>` shape explicitly.
      let isRegex = src[i + 1] !== '>' && (p.idx < 0 || regexAllowedAfter.has(p.ch));
      if (!isRegex && /[A-Za-z_$]/.test(p.ch)) {
        const w = src.slice(Math.max(0, p.idx - 12), p.idx + 1).match(/[A-Za-z_$]+$/)?.[0] || '';
        isRegex = ['return', 'typeof', 'case', 'in', 'of', 'new', 'throw', 'else', 'do', 'yield', 'await', 'delete', 'void', 'instanceof'].includes(w);
      }
      if (isRegex) {
        let j = i + 1, inClass = false;
        while (j < n) {
          const d = src[j];
          if (d === '\\') { j += 2; continue; }
          if (d === '\n') break;
          if (d === '[') inClass = true;
          else if (d === ']') inClass = false;
          else if (d === '/' && !inClass) { j++; while (/[a-z]/i.test(src[j] || '')) j++; break; }
          j++;
        }
        blank(i, j); i = j; continue;
      }
    }
    i++;
  }
  return out.join('');
}

// ---------------------------------------------------------------------------
// structural helpers over masked text
// ---------------------------------------------------------------------------
function matchDelim(masked, openIdx, open, close) {
  let d = 0;
  for (let i = openIdx; i < masked.length; i++) {
    if (masked[i] === open) d++;
    else if (masked[i] === close) { d--; if (d === 0) return i; }
  }
  return -1;
}

function topLevelSeps(masked, start, end, sep) {
  const seps = [];
  let pd = 0, bd = 0, cd = 0;
  for (let i = start; i < end; i++) {
    const c = masked[i];
    if (c === '(') pd++; else if (c === ')') pd--;
    else if (c === '[') bd++; else if (c === ']') bd--;
    else if (c === '{') cd++; else if (c === '}') cd--;
    else if (c === sep && pd === 0 && bd === 0 && cd === 0) seps.push(i);
  }
  return seps;
}

// single pass: depth of each bracket type BEFORE position i + top-level region
// id (bumps when a top-level `}` closes). Positions in the same region share a
// top-level statement — that is our scope approximation.
function computeMaps(masked) {
  const n = masked.length;
  const paren = new Int32Array(n), bracket = new Int32Array(n);
  const brace = new Int32Array(n), region = new Int32Array(n);
  let pd = 0, bd = 0, cd = 0, r = 0;
  for (let i = 0; i < n; i++) {
    paren[i] = pd; bracket[i] = bd; brace[i] = cd; region[i] = r;
    const c = masked[i];
    if (c === '(') pd++;
    else if (c === ')') pd = Math.max(0, pd - 1);
    else if (c === '[') bd++;
    else if (c === ']') bd = Math.max(0, bd - 1);
    else if (c === '{') cd++;
    else if (c === '}') { cd = Math.max(0, cd - 1); if (cd === 0) r++; }
  }
  return { paren, bracket, brace, region };
}

function lineStartsOf(src) {
  const starts = [0];
  for (let i = 0; i < src.length; i++) if (src[i] === '\n') starts.push(i + 1);
  return starts;
}
function lineOf(starts, pos) {
  let lo = 0, hi = starts.length - 1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (starts[mid] <= pos) lo = mid; else hi = mid - 1; }
  return lo + 1;
}
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const inRanges = (ranges, pos) => ranges.some(([a, b]) => pos >= a && pos < b);

// parse `{ a, b: c, d = e, f: g = h, i: { j = [] } }` entries (global positions)
function parsePatternEntries(masked, openBrace, closeBrace) {
  const out = [];
  const seps = topLevelSeps(masked, openBrace + 1, closeBrace, ',');
  let s = openBrace + 1;
  for (const e of [...seps, closeBrace]) {
    const raw = masked.slice(s, e);
    const entryPos = s + (raw.length - raw.trimStart().length);
    const entry = raw.trim();
    s = e + 1;
    if (!entry || entry.startsWith('...')) continue;
    const eqSeps = topLevelSeps(masked, entryPos, e, '=');
    let eqIdx = -1;
    for (const q of eqSeps) {
      const nx = masked[q + 1], pv = masked[q - 1];
      if (nx === '=' || nx === '>' || pv === '=' || pv === '!' || pv === '<' || pv === '>' || pv === '+' || pv === '-' || pv === '*' || pv === '/' || pv === '%' || pv === '&' || pv === '|' || pv === '^' || pv === '?') continue;
      eqIdx = q; break;
    }
    if (eqIdx < 0) continue;
    const lhs = masked.slice(entryPos, eqIdx).trim();
    const defPos = eqIdx + 1 + (masked.slice(eqIdx + 1, e).length - masked.slice(eqIdx + 1, e).trimStart().length);
    const defExpr = masked.slice(defPos, e).trim();
    const colon = lhs.indexOf(':');
    const bound = (colon >= 0 ? lhs.slice(colon + 1) : lhs).trim();
    if (/^[A-Za-z_$][\w$]*$/.test(bound)) {
      out.push({ name: bound, defExpr, pos: defPos });
    } else if (bound.startsWith('{')) {
      const bOff = masked.indexOf('{', entryPos + colon + 1);
      const bEnd = matchDelim(masked, bOff, '{', '}');
      if (bOff > 0 && bEnd > 0) out.push(...parsePatternEntries(masked, bOff, bEnd));
    }
  }
  return out;
}

// strip balanced outer parens of an expression (returns expr text)
function stripParens(t) {
  let s = t.trim();
  while (s.startsWith('(')) {
    let d = 0, ok = false;
    for (let i = 0; i < s.length; i++) {
      if (s[i] === '(') d++;
      else if (s[i] === ')') { d--; if (d === 0) { ok = i === s.length - 1; break; } }
    }
    if (!ok) break;
    s = s.slice(1, -1).trim();
  }
  return s;
}

// methods that return a primitive when called on the obvious receiver
const PRIM_METHODS = new Set([
  'get', 'getItem', 'has', 'includes', 'indexOf', 'lastIndexOf', 'startsWith',
  'endsWith', 'toString', 'toISOString', 'toJSON', 'toUpperCase', 'toLowerCase',
  'toFixed', 'toPrecision', 'toExponential', 'toLocaleString', 'toLocaleDateString',
  'toLocaleTimeString', 'toTimeString', 'toDateString', 'toUTCString', 'trim',
  'trimStart', 'trimEnd', 'charAt', 'charCodeAt', 'codePointAt', 'valueOf',
  'localeCompare', 'normalize', 'padStart', 'padEnd', 'repeat', 'substring',
  'substr', 'test', 'search', 'join', 'length', 'size', 'name', 'delete',
  'clear', 'isNaN', 'isFinite', 'getTime', 'getFullYear', 'getMonth', 'getDate',
  'getDay', 'getHours', 'getMinutes', 'getSeconds', 'getMilliseconds',
  'getTimezoneOffset', 'getUTCFullYear', 'getUTCMonth', 'getUTCDate', 'getUTCDay',
  'getUTCHours', 'getUTCMinutes', 'getUTCSeconds', 'getUTCMilliseconds',
  'hasOwnProperty', 'isPrototypeOf', 'propertyIsEnumerable', 'some', 'every',
]);
// methods that return a fresh collection/object (still unstable identity)
const OBJ_METHODS = new Set([
  'map', 'filter', 'flatMap', 'flat', 'concat', 'sort', 'reverse', 'toSorted',
  'toReversed', 'toSpliced', 'splice', 'fill', 'keys', 'values', 'entries',
  'split', 'match', 'matchAll', 'exec', 'set', 'add', 'with', 'groupBy',
]);
const PRIMITIVE_CALL_RE = /(?:\.[\w$]+\s*\(|^(?:String|Number|Boolean|BigInt|parseInt|parseFloat|Math\.[\w$]+|Array\.isArray|JSON\.stringify|encodeURI\w*|decodeURI\w*|typeof|isNaN|isFinite|Number\.is[\w$]+|String\.from\w+|Date\.now|Date\.parse|Object\.hasOwn|Reflect\.[\w$]+)\s*\()/;

// match a delimiter inside a small expr string (masked source — balanced)
function matchInText(t, open, close, start = 0) {
  let d = 0;
  for (let i = start; i < t.length; i++) {
    if (t[i] === open) d++;
    else if (t[i] === close) { d--; if (d === 0) return i; }
  }
  return -1;
}

// for exprs STARTING with a literal producer ([ { Object.freeze( new X() ):
// 'literal' when the literal is the value, 'primitive' when a member tail
// collapses it ([a,b].includes(), new Date().getTime()), 'call' for other
// member/call tails (unproven result type).
function literalTailClass(t) {
  let close = -1, kind = null;
  if (t.startsWith('[')) { close = matchInText(t, '[', ']'); kind = 'literal'; }
  else if (t.startsWith('{')) { close = matchInText(t, '{', '}'); kind = 'literal'; }
  else {
    const m = t.match(/^Object\s*\.\s*freeze\s*\(/) || t.match(/^new\s+[A-Za-z_$][\w$.]*\s*\(/);
    if (m) { close = matchInText(t, '(', ')', t.indexOf('(')); kind = 'literal'; }
  }
  if (kind === null) return null;
  if (close < 0) return 'literal';
  const rest = t.slice(close + 1).trim();
  if (!rest) return 'literal';
  if (/^(===|!==|==|!=|<=|>=|instanceof\b)/.test(rest)) return 'primitive';
  const mm = rest.match(/^[?.]*\.\s*([\w$]+)\s*(\()?/);
  if (!mm) return 'call';
  const member = mm[1];
  if (OBJ_METHODS.has(member)) return 'literal';   // fresh collection result
  if (PRIM_METHODS.has(member)) return 'primitive';
  return 'call';
}

// stability verdict of a default expr text; `resolve` maps identifiers.
function defTypeOf(defExpr, resolve) {
  let t = stripParens(defExpr);
  // `a || b || LIT` / `a ?? LIT` — the LAST operand is the actual default
  const cut = Math.max(t.lastIndexOf('||'), t.lastIndexOf('??'));
  if (cut >= 0) t = stripParens(t.slice(cut + 2));
  if (!t) return { type: 'primitive' }; // masked string/template/regex literal
  const lc = literalTailClass(t);
  if (lc) return { type: lc };
  if (/[?:]\s*[[{]\s*[\]}]/.test(t)) return { type: 'literal' };        // ternary literal branch
  if (/^(null|undefined|true|false|NaN|Infinity|void\b|typeof\b|delete\b|newtarget|this\b|-?\d|0x|0b|0o|!)/.test(t)) return { type: 'primitive' };
  if (/(===|!==|==|!=|\x3c=|\x3e=)(?=\s|$)|\s(\x3c|\x3e)\s|\sinstanceof\s|\sin\s/.test(t)) return { type: 'primitive' };
  const pm = t.match(/\.([\w$]+)\s*\(/);
  if (pm && PRIM_METHODS.has(pm[1])) return { type: 'primitive' };
  if (/^(?:String|Number|Boolean|BigInt|parseInt|parseFloat|Math\.[\w$]+|Array\.isArray|JSON\.stringify|encodeURI\w*|decodeURI\w*|isNaN|isFinite|Number\.is[\w$]+|String\.from\w+|Date\.now|Date\.parse|Object\.hasOwn|Reflect\.[\w$]+|Object\.keys|Object\.values|Object\.entries|Object\.fromEntries)\s*\(/.test(t) && !/\.(map|filter|flatMap|split|match|exec|keys|values|entries)\s*\(/.test(t)) {
    return { type: 'primitive' };
  }
  if (/^[A-Za-z_$][\w$]*$/.test(t)) return { type: 'identifier', resolution: resolve(t) };
  const m = t.match(/^([A-Za-z_$][\w$]*)\s*(?:[?.]+\s*[\w$]+|\[[^\]]*\])+\s*$/);
  if (m) return { type: 'member', root: m[1], resolution: resolve(m[1]) };
  // member extraction off a fresh call result: Object.keys/values yield
  // primitive elements; any other `call()[i]`/`call().prop` is unproven
  if (/^Object\s*\.\s*(?:keys|values)\s*\([^)]*\)\s*\[[^\]]+\]\s*$/.test(t)) return { type: 'primitive' };
  if (/[)\]]\s*$/.test(t) || /=>\s*[[{]/.test(t)) return { type: 'call' };
  return { type: 'other' };
}

// dep-array element vs hit var: direct | primitive(identity-safe) | derived | null
// `rels` is the precompiled per-varName matcher set from makeRelMatcher().
function makeRelMatcher(varName) {
  const esc = escRe(varName);
  return {
    varName,
    vn: varName.replace(/\?\./g, '.'),
    hasDot: varName.includes('.'),
    word: new RegExp(`\\b${esc}\\b`),
    lenAccessor: new RegExp(`^${esc}\\s*(\\?\\.|\\.)\\s*(length|size)\\s*$`),
    objLen: new RegExp(`^Object\\.(keys|values|entries)\\s*\\(\\s*${esc}\\s*\\)\\s*\\.\\s*length\\s*$`),
  };
}
const PRIMITIVE_WRAP_RE = /^(!!|Boolean\s*\(|Number\s*\(|String\s*\(|JSON\.stringify\s*\()/;
const PRIMITIVE_TAIL_RE = /[?.]?\s*(length|size)\s*$|\?.\s*\d+\s*$/;
function elementRelation(elText, rels) {
  const t = elText.trim();
  const { varName, vn, hasDot } = rels;
  if (t === varName) return 'direct';
  const tn = t.replace(/\?\./g, '.');
  if (hasDot) {
    if (tn === vn) return 'direct';
    if (tn.startsWith(vn + '.') || tn.startsWith(vn + '[')) {
      return PRIMITIVE_TAIL_RE.test(t) ? 'primitive' : 'derived';
    }
    return null;
  }
  // the var must occur as a real reference — `x.documents` uses `documents` as
  // a property name (preceded by `.`), not the local var
  const re = rels.wordG ?? (rels.wordG = new RegExp(`\\b${escRe(varName)}\\b`, 'g'));
  re.lastIndex = 0;
  let referenced = false, mm;
  while ((mm = re.exec(t))) {
    if (t[mm.index - 1] !== '.') { referenced = true; break; }
  }
  if (!referenced) return null;
  if (rels.lenAccessor.test(t)) return 'primitive';
  if (PRIMITIVE_WRAP_RE.test(t)) return 'primitive';
  if (rels.objLen.test(t)) return 'primitive';
  return 'derived';
}

function analyzeFile(absPath) {
  const rel = relative(SRC, absPath).split('\\').join('/');
  const src = readFileSync(absPath, 'utf8');
  const masked = maskSource(src);
  const starts = lineStartsOf(src);
  const { paren, bracket, brace, region } = computeMaps(masked);
  const line = (p) => lineOf(starts, p);

  const depArrays = [];      // {hook,line,elements:[{text,pos}],scopeRegion}
  const factoryRanges = [];  // [start,end) stable contexts
  const customHookArgs = []; // {name,args:[{text}],pos}
  const hits = [];

  for (const m of masked.matchAll(HOOK_CALL_RE)) {
    const name = (m[0].match(/use(?:(?=[A-Z])[\w$]*)?/) || ['use'])[0].slice(3);
    const open = m.index + m[0].length - 1;
    const close = matchDelim(masked, open, '(', ')');
    if (close < 0) continue;
    const args = [];
    const seps = topLevelSeps(masked, open + 1, close, ',');
    let s = open + 1;
    for (const e of [...seps, close]) {
      const t = masked.slice(s, e);
      const off = s + (t.length - t.trimStart().length);
      args.push({ text: t.trim(), pos: off, end: e });
      s = e + 1;
    }
    if (FACTORY_HOOKS.has(name) && args.length) factoryRanges.push([args[0].pos, args[0].end]);
    if (!BUILTIN_HOOKS.has(name)) customHookArgs.push({ name, args, pos: m.index });
    if (!DEP_HOOKS.has(name) || args.length < 2) continue;
    const last = args[args.length - 1];
    // a non-array last arg that is itself a function is the hook's callback,
    // not a dep array (e.g. useImperativeHandle(ref, () => ({...})))
    if (/^\(|^async\s|^function\s/.test(last.text.trim()) && /=>|^function|^async/.test(last.text.trim()) && !last.text.trim().startsWith('[')) {
      continue;
    }
    let elements;
    if (last.text.startsWith('[') && last.text.endsWith(']')) {
      const i0 = last.pos + last.text.indexOf('[') + 1;
      const i1 = last.pos + last.text.lastIndexOf(']');
      elements = [];
      const es = topLevelSeps(masked, i0, i1, ',');
      let es0 = i0;
      for (const ee of [...es, i1]) {
        const t = masked.slice(es0, ee);
        const off = es0 + (t.length - t.trimStart().length);
        if (t.trim()) elements.push({ text: t.trim(), pos: off });
        es0 = ee + 1;
      }
    } else {
      elements = [{ text: last.text, pos: last.pos }];
    }
    depArrays.push({ hook: `use${name}`, line: line(m.index), elements, scopeRegion: region[m.index] });
  }

  const addHit = (h) => {
    h.file = rel; h.line = line(h.pos); h.region = h.regionOverride ?? region[h.pos];
    if (!hits.some((x) => x.varName === h.varName && x.line === h.line)) hits.push(h);
  };

  // identifier -> stability of its binding. Lazily-built per-file index of all
  // `const|let|var|function|class NAME` decls + imported names, memoized.
  let declIndex = null, importNames = null, allDecls = null;
  const resolveCache = new Map();
  const buildIndexes = () => {
    declIndex = new Map(); importNames = new Set(); allDecls = new Map();
    const pushDecl = (name, d) => {
      let a = allDecls.get(name); if (!a) allDecls.set(name, a = []); a.push(d);
    };
    for (const m of masked.matchAll(/(?:export\s+)?(const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/g)) {
      const d = { pos: m.index + m[0].length - m[2].length, kw: m[1], eqEnd: m.index + m[0].length };
      if (!declIndex.has(m[2])) declIndex.set(m[2], d);
      pushDecl(m[2], d);
    }
    for (const m of masked.matchAll(/\bimport\s+[\s\S]{0,2000}?from\b/gm)) {
      for (const nm of m[0].matchAll(/[A-Za-z_$][\w$]*/g)) {
        if (!['import', 'from', 'as', 'type', 'default'].includes(nm[0])) importNames.add(nm[0]);
      }
    }
    // destructure decls: `const {a, b: c} = expr`, `const [x, y] = expr` —
    // bound names get the RHS-object's stability (member of a hook result /
    // simple value is stable; member of a call result is unproven)
    for (const m of masked.matchAll(/\b(?:const|let|var)\s*([{[])[^;]*?([}\]])\s*=\s*/g)) {
      const after = masked.slice(m.index + m[0].length).trimStart();
      const rhsStable = /^use(?:(?=[A-Z])[\w$]*)?\s*\(|^[A-Za-z_$][\w$]*(?:\s*[;,\n)\]]|\s*$|\s*\.|\s*\?\.\s*|\s*\[)/.test(after);
      const pat = m[0].slice(m[0].indexOf(m[1]) + 1, m[0].lastIndexOf(m[2]));
      for (const seg of pat.split(',')) {
        const mm = seg.match(/([A-Za-z_$][\w$]*)\s*(?::\s*([A-Za-z_$][\w$]*))?\s*(?:=|$)/);
        const bound = mm?.[2] || mm?.[1];
        if (bound) {
          const d = { pos: m.index, kw: 'destr', rhsStable };
          if (!declIndex.has(bound)) declIndex.set(bound, d);
          pushDecl(bound, d);
        }
      }
    }
    // function param names ({a, b} in signatures) — 'unknown' unless the param
    // itself has a literal default (cross-checked against collected hits)
    for (const re of [ARROW_PARAMS_RE, FN_PARAMS_RE, METHOD_PARAMS_RE]) {
      re.lastIndex = 0;
      for (const m of masked.matchAll(re)) {
        const inner = m[1];
        if (!inner || !inner.includes('{')) continue;
        for (const seg of inner.split(',')) {
          const mm = seg.match(/\{?\s*([A-Za-z_$][\w$]*)\s*(?::\s*([A-Za-z_$][\w$]*))?\s*(?:=|$|\})/);
          const bound = mm?.[2] || mm?.[1];
          if (bound) {
            const d = { pos: m.index, kw: 'param' };
            if (!declIndex.has(bound)) declIndex.set(bound, d);
            pushDecl(bound, d);
          }
        }
      }
    }
  };
  const resolveBinding = (name) => {
    if (!declIndex) buildIndexes();
    if (resolveCache.has(name)) return resolveCache.get(name);
    const out = resolveBindingUncached(name);
    resolveCache.set(name, out);
    return out;
  };
  const classifyDecl = (d, name) => {
    if (d.kw === 'destr') return { stability: d.rhsStable ? 'stable' : 'unknown', note: 'destructured member' };
    if (d.kw === 'param') {
      const pd = hits.find((h) => h.varName === name && h.kind === 'param-default' && /^[[{(]|Object\s*\.\s*freeze|^new\s/.test(h.defExpr));
      if (pd) return { stability: 'unstable', note: 'param with literal default' };
      // a plain param/prop reference is parent-owned: `a || param` copies a
      // reference, it never allocates — the dep value is render-stable unless
      // the param itself carries a literal default (handled above)
      return { stability: 'stable', note: 'function parameter' };
    }
    if (d.kw === 'function' || d.kw === 'class') return { stability: 'stable', note: `${d.kw} binding` };
    const scope = brace[d.pos] === 0 ? 'module' : 'local';
    let after = masked.slice(d.eqEnd).trimStart();
    if (after.startsWith('=') && !after.startsWith('==') && !after.startsWith('=>')) after = after.slice(1).trimStart();
    if (/^(?:React\s*\.\s*)?use(?:Memo|Callback|Ref|Reducer|State|SyncExternalStore)\s*\(/.test(after)) {
      return { stability: 'stable', note: 'memoized/hook binding' };
    }
    if (/^use(?:(?=[A-Z])[\w$]*)?\s*\(/.test(after)) return { stability: 'stable', note: 'hook-result binding' };
    if (/^[[{(]|^Object\s*\.\s*freeze|^new\s/.test(after)) {
      return scope === 'module'
        ? { stability: 'stable', note: 'module-scope const' }
        : { stability: 'unstable', note: 'function-scope literal' };
    }
    if (/^(?:async\s+)?(?:function\b|[\w$]+\s*=>|\()/.test(after)) return { stability: 'stable', note: 'function binding' };
    if (scope === 'module') return { stability: 'stable', note: 'module-scope binding' };
    return { stability: 'unknown', note: 'local binding' };
  };

  const resolveBindingUncached = (name) => {
    if (importNames.has(name)) return { stability: 'stable', note: 'imported binding' };
    const d = declIndex.get(name);
    if (!d) return { stability: 'unknown', note: 'unresolved binding' };
    return classifyDecl(d, name);
  };

  // position-aware resolution: the nearest preceding binding of `name` —
  // handles files where the same identifier is rebound across functions
  // (e.g. `const row` in a callback vs a `row` prop destructured later)
  const resolveBindingAt = (name, pos) => {
    if (!declIndex) buildIndexes();
    const list = allDecls.get(name);
    if (list) {
      let best = null;
      for (const d of list) if (d.pos <= pos && (!best || d.pos > best.pos)) best = d;
      if (best) return classifyDecl(best, name);
    }
    return resolveBindingUncached(name);
  };

  // ---- A) `const { data: x = [] } = <expr>`
  for (const m of masked.matchAll(DECL_OBJ_RE)) {
    const open = m.index + m[0].length - 1;
    const close = matchDelim(masked, open, '{', '}');
    if (close < 0) continue;
    let p = close + 1;
    while (/\s/.test(masked[p] || '')) p++;
    if (masked[p] !== '=' || masked[p + 1] === '=' || masked[p + 1] === '>') continue;
    // RHS to first top-level `,`/`;` (incremental relative depth)
    let pd = 0, bd = 0, cd = 0, rhsEnd = masked.length;
    for (let i = p + 1; i < masked.length; i++) {
      const c = masked[i];
      if (c === '(') pd++; else if (c === ')') pd--;
      else if (c === '[') bd++; else if (c === ']') bd--;
      else if (c === '{') cd++; else if (c === '}') cd--;
      else if ((c === ';' || c === ',') && pd === 0 && bd === 0 && cd === 0) { rhsEnd = i; break; }
      if (c === '\n' && pd === 0 && bd === 0 && cd === 0) { /* allow ASI multi-line RHS */ }
    }
    const rhs = masked.slice(p + 1, rhsEnd);
    const isHook = /\b(?:[\w$]+\s*\.\s*)?use(?:(?=[A-Z])[\w$]*)?\s*\(/.test(rhs);
    const hookName = rhs.match(/use(?:(?=[A-Z])[\w$]*)?/)?.[0];
    for (const e of parsePatternEntries(masked, open, close)) {
      addHit({
        varName: e.name, pos: e.pos, kind: isHook ? 'destructure-hook' : 'destructure',
        defExpr: e.defExpr, rhsNote: hookName,
      });
    }
  }

  // ---- P) param destructures in arrows/functions/methods
  const paramScan = (innerStartGlobal, regionOverride) => {
    const open = innerStartGlobal;
    const close = matchDelim(masked, open, '{', '}');
    if (close < 0) return;
    for (const e of parsePatternEntries(masked, open, close)) {
      addHit({ varName: e.name, pos: e.pos, kind: 'param-default', defExpr: e.defExpr, regionOverride });
    }
  };
  for (const re of [ARROW_PARAMS_RE, FN_PARAMS_RE, METHOD_PARAMS_RE]) {
    re.lastIndex = 0;
    for (const m of masked.matchAll(re)) {
      const inner = m[1];
      if (!inner || !inner.includes('{')) continue;
      const base = m.index + m[0].indexOf('(') + 1;
      // param `{..}` closes at depth 0 and bumps the region before the body
      // opens — scope param vars to the BODY's region (after the `)`)
      const parenClose = m.index + m[0].lastIndexOf(')');
      const bodyRegion = region[Math.min(parenClose, masked.length - 1)];
      // each `{` inside the param text could start a destructure
      for (let i = base; i < base + inner.length; i++) {
        if (masked[i] === '{') {
          const c = matchDelim(masked, i, '{', '}');
          if (c > 0 && c < base + inner.length + 1) { paramScan(i, bodyRegion); i = c; }
        }
      }
    }
  }

  // ---- B+L) `const x = <init>` declarations — scan the init expression once:
  // fallback ops `a || []` / `a ?? {}` and per-render literals `= [` / `= {` /
  // `= Object.freeze(` / `= new X(` are all unstable-identity candidates.
  const CONT_CHARS = new Set(['|', '&', '?', '.', ',', ';', '(', '[', '{', '=', '!', '~', '+', '-', '*', '/', '%', '^', '<', '>', ':']);
  for (const m of masked.matchAll(VAR_DECL_RE)) {
    const name = m[1];
    const initStart = m.index + m[0].length;
    // end of the initializer: `;` at any depth (init exprs can't contain `;`
    // outside for-headers), `,` at init-relative depth 0, or a newline whose
    // next token can't continue an expression.
    let pd = 0, bd = 0, cd = 0, end = masked.length;
    for (let i = initStart; i < masked.length; i++) {
      const c = masked[i];
      if (c === ';') { end = i; break; }
      if (c === '(') pd++; else if (c === ')') pd--;
      else if (c === '[') bd++; else if (c === ']') bd--;
      else if (c === '{') cd++; else if (c === '}') { if (cd === 0) { end = i; break; } cd--; }
      else if (c === ',' && pd === 0 && bd === 0 && cd === 0) { end = i; break; }
      else if (c === '\n' && pd === 0 && bd === 0 && cd === 0) {
        let j = i + 1;
        while (/\s/.test(masked[j] || '')) j++;
        if (!CONT_CHARS.has(masked[j])) { end = i; break; }
      }
      if (i - initStart > 4000) break; // pathological runaway guard
    }
    const initText = masked.slice(initStart, end);
    const initTrim = initText.trim();
    // literal-decl: RHS itself starts with a literal-producing token — but a
    // member tail can collapse it to a primitive ([..].includes, Date#getTime)
    const lm = initTrim.match(LITERAL_TAIL_RE);
    if (lm) {
      const tail = literalTailClass(initTrim);
      if (tail !== 'primitive') {
        addHit({
          varName: name, pos: initStart + initText.indexOf(lm[0]), kind: 'literal-decl',
          defExpr: initTrim.slice(0, 60), defTypeOverride: tail === 'call' ? 'call' : undefined,
        });
      }
      continue;
    }
    // count parens that wrap the WHOLE initializer (allowed extra op depth)
    let wraps = 0, t = initTrim;
    while (t.startsWith('(')) {
      let dd = 0, closes = -1;
      for (let k = 0; k < t.length; k++) {
        if (t[k] === '(') dd++;
        else if (t[k] === ')') { dd--; if (dd === 0) { closes = k; break; } }
      }
      if (closes >= 0 && t.slice(closes + 1).trim() === '') { wraps++; t = t.slice(1, closes).trim(); }
      else break;
    }
    // scan the init expr for `||`/`??` at allowed depth, plus top-level
    // ternary markers (`?`/`:`) and arrow bodies
    pd = 0; bd = 0; cd = 0;
    let arrowFloor = -1, firstQ = -1, colonPos = -1;
    const ops = [];
    for (let i = initStart; i < end; i++) {
      const c = masked[i];
      if (c === '(') pd++;
      else if (c === ')') pd--;
      else if (c === '[') bd++;
      else if (c === ']') bd--;
      else if (c === '{') cd++;
      else if (c === '}') cd--;
      else if (c === '=' && masked[i + 1] === '>') { if (arrowFloor < 0 || pd + bd + cd < arrowFloor) arrowFloor = pd + bd + cd; i++; }
      else if (c === 'f' && masked.startsWith('unction', i + 1)) { if (arrowFloor < 0 || pd + bd + cd < arrowFloor) arrowFloor = pd + bd + cd; }
      else if (pd === wraps && bd === 0 && cd === 0) {
        if (c === '|' && masked[i + 1] === '|') { ops.push(i); i++; }
        else if (c === '?' && masked[i + 1] === '?') { ops.push(i); i++; }
        else if (c === '?' && masked[i + 1] === '.') { i++; }
        else if (c === '?' && firstQ < 0) firstQ = i;
        else if (c === ':' && firstQ >= 0 && colonPos < 0) colonPos = i;
      }
    }
    for (const op of ops) {
      if (firstQ >= 0 && op < firstQ) continue;      // `||` inside ternary condition
      if (arrowFloor >= 0 && arrowFloor <= wraps) continue; // inside arrow body
      const defExpr = masked.slice(op + 2, end).trim();
      if (!defExpr || /^[0-9'"`!~+\-]/.test(defExpr)) continue;
      addHit({
        varName: name, pos: op, kind: 'fallback-decl', defExpr: defExpr.slice(0, 60),
        rhsNote: /\buse(?:(?=[A-Z])[\w$]*)?\s*\(/.test(masked.slice(initStart, op)) ? 'hook-base' : undefined,
      });
      break; // the first top-level `||`/`??` marks the default chain start
    }
    // ternary literal branches: `const x = cond ? [] : y` / `cond ? y : {}`
    if (firstQ >= 0 && colonPos > firstQ) {
      for (const [bStart, bEnd] of [[firstQ + 1, colonPos], [colonPos + 1, end]]) {
        const bt = masked.slice(bStart, bEnd).trim();
        if (/^[[{]|^Object\s*\.\s*freeze|^new\s+[A-Za-z_$]/.test(bt)) {
          addHit({ varName: name, pos: bStart, kind: 'ternary-literal', defExpr: bt.slice(0, 60) });
          break;
        }
      }
    }
  }

  // ---- C) useQuery select / placeholderData producing fresh literals
  for (const m of masked.matchAll(QUERY_CALL_RE)) {
    const open = m.index + m[0].length - 1;
    const close = matchDelim(masked, open, '(', ')');
    if (close < 0) continue;
    const firstSep = topLevelSeps(masked, open + 1, close, ',')[0] ?? close;
    const optPos0 = open + 1;
    const optTrim = masked.slice(optPos0, firstSep);
    if (optTrim.indexOf('{') < 0) continue;
    const objOpen = optPos0 + optTrim.indexOf('{');
    const objClose = matchDelim(masked, objOpen, '{', '}');
    if (objClose < 0) continue;
    const props = {};
    const pseps = topLevelSeps(masked, objOpen + 1, objClose, ',');
    let ps = objOpen + 1;
    for (const pe of [...pseps, objClose]) {
      const t = masked.slice(ps, pe);
      const mm = t.trim().match(/^([A-Za-z_$][\w$]*)\s*:/);
      if (mm) props[mm[1]] = { text: t.slice(t.indexOf(':') + 1).trim(), pos: ps + t.indexOf(':') + 1 };
      ps = pe + 1;
    }
    const findings = [];
    if (props.placeholderData && /^[[{(]/.test(props.placeholderData.text)) {
      findings.push({ kind: 'query-placeholderData', defExpr: props.placeholderData.text.slice(0, 40), type: 'literal' });
    }
    if (props.select) {
      const v = props.select.text;
      const arrow = v.match(/=>\s*(.*)$/s);
      if (arrow) {
        const body = arrow[1].trim();
        if (/^[[{(]/.test(body) || /(\|\||\?\?)\s*[[{(]/.test(body) || /\breturn\s*[[{(]/.test(body)) {
          findings.push({ kind: 'query-select', defExpr: body.slice(0, 40), type: 'literal' });
        } else if (/^[A-Za-z_$][\w$]*\s*(?:[?.]+\s*[\w$]+|\[[^\]]*\])+\s*$/.test(body)) {
          findings.push({ kind: 'query-select', defExpr: body.slice(0, 40), type: 'member-stable' });
        } else {
          findings.push({ kind: 'query-select', defExpr: body.slice(0, 40), type: 'call' });
        }
      } else {
        findings.push({ kind: 'query-select', defExpr: v.slice(0, 40), type: 'other' });
      }
    }
    if (!findings.length) continue;
    const before = masked.slice(Math.max(0, m.index - 500), m.index);
    const objM = before.match(/\{([^{}]*)\}\s*=\s*$/);
    const nameM = before.match(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*$/);
    let varName = 'data';
    if (objM) {
      const dm = objM[1].match(/(?:^|[,\s])data\s*:\s*([A-Za-z_$][\w$]*)/);
      varName = dm ? dm[1] : 'data';
    } else if (nameM) {
      varName = `${nameM[1]}.data`;
    }
    for (const f of findings) {
      addHit({ varName, pos: m.index, kind: f.kind, defExpr: f.defExpr, defTypeOverride: f.type });
    }
  }

  // group dep arrays by region once — per-hit lookup is O(1) after this
  const depsByRegion = new Map();
  for (const da of depArrays) {
    if (!depsByRegion.has(da.scopeRegion)) depsByRegion.set(da.scopeRegion, []);
    depsByRegion.get(da.scopeRegion).push(da);
  }

  // ---- classify
  for (const h of hits) {
    const def = h.defTypeOverride && h.defTypeOverride !== 'member-stable'
      ? { type: h.defTypeOverride }
      : h.defTypeOverride === 'member-stable'
        ? { type: 'identifier', resolution: { stability: 'stable', note: 'member of cached query data' } }
        : defTypeOf(h.defExpr, (name) => resolveBindingAt(name, h.pos));
    h.defType = def.type;
    const insideFactory = inRanges(factoryRanges, h.pos);
    const rels = makeRelMatcher(h.varName);
    const directSites = [], derivedSites = [];
    // a redeclaration of the same name between decl and dep array means the dep
    // binds to a DIFFERENT variable (shadowing) — e.g. an IIFE-local `const x`
    // inside JSX cannot feed a component-scope [x]. `x =>` / `x = y` inside a
    // nested arrow param list likewise shadows only within that arrow's body;
    // `x =>` is excluded, `x =`-reassignments count as rebinds (the dep then
    // sees the reassigned value, not this default).
    const shadowRe = new RegExp(
      `\\b(?:const|let|var|function|class)\\s+(?:[{\\[][^;{}()]{0,400}?\\b)?${h.varName}\\b` +
      `|(?<![.\\w$])${h.varName}\\s*=(?![=>])`);
    const isShadowed = (to) => shadowRe.test(masked.slice(h.pos + 1, to));
    // dep arrays in the same top-level region only
    const regionDeps = depsByRegion.get(h.region) || [];
    for (const da of regionDeps) {
      for (const el of da.elements) {
        if (el.pos <= h.pos || isShadowed(el.pos)) continue;
        const r = elementRelation(el.text, rels);
        if (r === 'direct') directSites.push({ hook: da.hook, line: da.line, el: el.text });
        else if (r === 'derived') derivedSites.push({ hook: da.hook, line: da.line, el: el.text });
      }
    }
    h.depSites = directSites;
    if (insideFactory) {
      h.cls = 'stable'; h.note = 'inside hook factory/lazy-init';
    } else if (h.kind === 'literal-decl' && brace[h.pos] === 0) {
      h.cls = 'stable'; h.note = 'module-scope literal';
    } else if (directSites.length) {
      const depStr = directSites.map((d) => `${d.hook}@${d.line}`).join(', ');
      if (def.type === 'primitive') {
        h.cls = 'stable'; h.note = 'primitive default (dep value is value-stable)';
      } else if (def.type === 'literal') {
        h.cls = 'violation';
        h.note = `per-render literal default feeds ${depStr}`;
      } else if (def.type === 'identifier' || def.type === 'member') {
        const st = def.resolution?.stability;
        if (st === 'stable') {
          h.cls = 'stable'; h.note = `default resolves stable (${def.resolution.note})`;
        } else if (st === 'unstable') {
          h.cls = 'violation';
          h.note = `default '${h.defExpr}' is a ${def.resolution.note}; feeds ${depStr}`;
        } else {
          h.cls = 'uncertain';
          h.note = `default '${h.defExpr}' ${def.resolution?.note || 'unresolved'}; feeds ${depStr}`;
        }
      } else {
        h.cls = 'uncertain';
        h.note = `default '${h.defExpr.slice(0, 40)}' (${def.type}) unproven; feeds ${depStr}`;
      }
    } else if (derivedSites.length) {
      // member-derivation deps (`x?.id`, `x.field`, `x[i]`) compare the member
      // VALUE rather than the container — stable regardless of the default's
      // provenance. Call-deriving deps (`x.map(...)`) stay uncertain.
      const memberAccessRe = new RegExp(`^${escRe(h.varName)}(?:\\s*\\??\\s*\\.\\s*[\\w$]+|\\s*\\[[^\\]]*\\])+$`);
      const nonMember = derivedSites.filter((d) => !memberAccessRe.test(d.el));
      if (def.type === 'literal' || def.type === 'primitive') {
        // `var.prop`/`var?.prop` on a per-render literal evaluates to the same
        // constant every render (literals carry no props) — dep value stable
        h.cls = 'stable';
        h.note = `member deps on literal default evaluate constant (${derivedSites.map((d) => `${d.hook}@${d.line}`).join(', ')})`;
      } else if (!nonMember.length) {
        h.cls = 'stable';
        h.note = `dep reads member of ${h.varName} — compares member value (${derivedSites.map((d) => `${d.hook}@${d.line}`).join(', ')})`;
      } else {
        h.cls = 'uncertain';
        h.note = `dep derives fresh value ${nonMember.map((d) => `${d.hook}@${d.line}[${d.el}]`).join(', ')}`;
      }
    } else {
      const via = customHookArgs.find((c) => c.args.some((a) => a.text === h.varName) && region[c.pos] === h.region);
      if (via && def.type === 'literal') {
        h.cls = 'uncertain';
        h.note = `passed to custom hook use${via.name}@${line(via.pos)}`;
      } else {
        h.cls = 'stable';
        h.note = 'no dep-array usage';
      }
    }
    if (h.cls === 'violation' && /useAllWorkOrders/.test(h.rhsNote || '')) {
      h.note += ' [useAllWorkOrders returns stable data — workOrderCache.js:323; latent]';
    }
  }
  return hits;
}

// ---------------------------------------------------------------------------
const files = [];
(function walk(dir) {
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const p = resolve(dir, ent.name);
    if (ent.isDirectory()) walk(p);
    else if (FILE_RE.test(ent.name)) files.push(p);
  }
})(SRC);

const allHits = [];
const errors = [];
let fi = 0;
for (const f of files) {
  fi++;
  if (fi % 150 === 0) process.stderr.write(`  … scanned ${fi}/${files.length}\r`);
  try { allHits.push(...analyzeFile(f)); }
  catch (e) { errors.push(`${relative(SRC, f)}: ${e.message}`); }
}
process.stderr.write(' '.repeat(40) + '\r');

const violations = allHits.filter((h) => h.cls === 'violation');
const uncertain = allHits.filter((h) => h.cls === 'uncertain');
const stable = allHits.filter((h) => h.cls === 'stable');
const byPos = (a, b) => a.file.localeCompare(b.file) || a.line - b.line;
violations.sort(byPos); uncertain.sort(byPos); stable.sort(byPos);

console.log(`stable-hook-defaults — audited ${files.length} files under src/`);
console.log(`hits: ${allHits.length}  violations: ${violations.length}  uncertain: ${uncertain.length}  stable: ${stable.length}`);
if (errors.length) console.log(`analyzer errors: ${errors.length}\n  ${errors.join('\n  ')}`);
console.log('');
for (const h of violations) {
  console.log(`VIOLATION ${h.file}:${h.line} var=${h.varName} kind=${h.kind}${h.rhsNote ? ` hook=${h.rhsNote}` : ''} default=${JSON.stringify(h.defExpr.slice(0, 40))} dep=${h.depSites.map((d) => `${d.hook}@${d.line}`).join(',')} — ${h.note}`);
}
for (const h of uncertain) {
  console.log(`UNCERTAIN ${h.file}:${h.line} var=${h.varName} kind=${h.kind}${h.rhsNote ? ` hook=${h.rhsNote}` : ''} default=${JSON.stringify(h.defExpr.slice(0, 40))} — ${h.note}`);
}
for (const h of stable) {
  console.log(`stable    ${h.file}:${h.line} var=${h.varName} kind=${h.kind}${h.rhsNote ? ` hook=${h.rhsNote}` : ''} default=${JSON.stringify(h.defExpr.slice(0, 40))} — ${h.note}`);
}

if (violations.length === 0) {
  console.log('PASS stable-hook-defaults');
  process.exit(0);
}
console.log(`\nFAIL stable-hook-defaults (${violations.length} violations)`);
process.exit(1);
